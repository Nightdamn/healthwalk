import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query, queryOne } from '../db.js';
import { signToken, requireAuth } from '../middleware.js';

const router = Router();

// ── POST /api/auth/register ──
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email и пароль обязательны' });
    if (password.length < 6) return res.status(400).json({ error: 'Пароль минимум 6 символов' });

    const existing = await queryOne('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing) return res.status(409).json({ error: 'Пользователь с таким email уже существует' });

    const hash = await bcrypt.hash(password, 10);
    const displayName = name || email.split('@')[0].charAt(0).toUpperCase() + email.split('@')[0].slice(1);

    const user = await queryOne(
      'INSERT INTO users (email, password_hash, display_name, provider) VALUES ($1, $2, $3, $4) RETURNING id, email, display_name, avatar_url',
      [email.toLowerCase(), hash, displayName, 'email']
    );

    // Check pending roles
    const pendingRole = await queryOne('SELECT role, assigned_by FROM pending_roles WHERE email = $1', [email.toLowerCase()]);
    if (pendingRole) {
      await queryOne('INSERT INTO user_roles (user_id, role, assigned_by) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO UPDATE SET role = $2', [user.id, pendingRole.role, pendingRole.assigned_by]);
      await query('DELETE FROM pending_roles WHERE email = $1', [email.toLowerCase()]);
    }

    // Check pending invitations
    const invitations = await query('SELECT id, course_id, role, invited_by FROM pending_invitations WHERE email = $1', [email.toLowerCase()]);
    for (const inv of invitations) {
      await queryOne(
        'INSERT INTO course_enrollments (course_id, user_id, role, invited_by) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
        [inv.course_id, user.id, inv.role, inv.invited_by]
      );
    }
    if (invitations.length) await query('DELETE FROM pending_invitations WHERE email = $1', [email.toLowerCase()]);

    const token = signToken({ id: user.id, email: user.email });
    res.json({ token, user: { id: user.id, email: user.email, name: user.display_name, avatar: user.avatar_url } });
  } catch (err) {
    console.error('[Auth] Register:', err);
    res.status(500).json({ error: 'Ошибка регистрации' });
  }
});

// ── POST /api/auth/login ──
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email и пароль обязательны' });

    const user = await queryOne('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    if (!user) return res.status(401).json({ error: 'Неверный email или пароль' });
    if (!user.password_hash) return res.status(401).json({ error: 'Используйте вход через Google' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Неверный email или пароль' });

    const token = signToken({ id: user.id, email: user.email });
    res.json({ token, user: { id: user.id, email: user.email, name: user.display_name, avatar: user.avatar_url } });
  } catch (err) {
    console.error('[Auth] Login:', err);
    res.status(500).json({ error: 'Ошибка входа' });
  }
});

// ── GET /api/auth/google ── redirect to Google OAuth
router.get('/google', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: 'Google OAuth не настроен' });

  const redirectUri = `${process.env.APP_URL || req.protocol + '://' + req.get('host')}/api/auth/google/callback`;
  const scope = encodeURIComponent('openid email profile');
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=select_account`;
  res.redirect(url);
});

// ── GET /api/auth/google/callback ── handle Google OAuth callback
router.get('/google/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).send('No code');

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = `${process.env.APP_URL || req.protocol + '://' + req.get('host')}/api/auth/google/callback`;

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: redirectUri, grant_type: 'authorization_code',
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokens.access_token) {
      console.error('[Auth] Google token error:', tokens);
      return res.status(400).send('OAuth error');
    }

    // Get user info
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await userRes.json();
    if (!profile.email) return res.status(400).send('No email from Google');

    // Find or create user
    let user = await queryOne('SELECT * FROM users WHERE email = $1', [profile.email.toLowerCase()]);
    if (!user) {
      user = await queryOne(
        'INSERT INTO users (email, display_name, avatar_url, provider, provider_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [profile.email.toLowerCase(), profile.name || profile.email.split('@')[0], profile.picture || null, 'google', profile.id]
      );

      // Check pending roles
      const pendingRole = await queryOne('SELECT role, assigned_by FROM pending_roles WHERE email = $1', [profile.email.toLowerCase()]);
      if (pendingRole) {
        await queryOne('INSERT INTO user_roles (user_id, role, assigned_by) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO UPDATE SET role = $2', [user.id, pendingRole.role, pendingRole.assigned_by]);
        await query('DELETE FROM pending_roles WHERE email = $1', [profile.email.toLowerCase()]);
      }

      // Check pending invitations
      const invitations = await query('SELECT id, course_id, role, invited_by FROM pending_invitations WHERE email = $1', [profile.email.toLowerCase()]);
      for (const inv of invitations) {
        await queryOne(
          'INSERT INTO course_enrollments (course_id, user_id, role, invited_by) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
          [inv.course_id, user.id, inv.role, inv.invited_by]
        );
      }
      if (invitations.length) await query('DELETE FROM pending_invitations WHERE email = $1', [profile.email.toLowerCase()]);
    } else {
      // Update avatar/name if changed
      await query(
        'UPDATE users SET display_name = COALESCE($1, display_name), avatar_url = COALESCE($2, avatar_url), provider_id = COALESCE($3, provider_id), updated_at = NOW() WHERE id = $4',
        [profile.name, profile.picture, profile.id, user.id]
      );
    }

    const token = signToken({ id: user.id, email: user.email });

    // Redirect to frontend with token
    const frontendUrl = process.env.FRONTEND_URL || process.env.APP_URL || '/';
    res.redirect(`${frontendUrl}#access_token=${token}`);
  } catch (err) {
    console.error('[Auth] Google callback:', err);
    res.status(500).send('OAuth error');
  }
});

// ── GET /api/auth/me ── get current user
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await queryOne('SELECT id, email, display_name, avatar_url FROM users WHERE id = $1', [req.userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ id: user.id, email: user.email, name: user.display_name, avatar: user.avatar_url });
  } catch (err) {
    console.error('[Auth] Me:', err);
    res.status(500).json({ error: 'Error' });
  }
});

export default router;
