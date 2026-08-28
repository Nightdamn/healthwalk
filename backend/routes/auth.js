import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query, queryOne } from '../db.js';
import { signToken, requireAuth } from '../middleware.js';
import { sendVerificationCode, sendPasswordResetCode } from '../mailer.js';

const router = Router();

// v26: 5 попыток в минуту с одного IP на любой auth-endpoint. Строже чем
// раньше (20/15min) — теперь регистрация открыта.
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много попыток. Попробуйте через минуту.' },
});

// ── Утилиты ──
const gen6Digits = () => String(Math.floor(100000 + Math.random() * 900000));
const VERIFY_TTL_MS = 15 * 60 * 1000;    // 15 минут для email verify
const RESET_TTL_MS = 30 * 60 * 1000;     // 30 минут для password reset
const norm = (email) => String(email || '').trim().toLowerCase();
function validatePassword(p) {
  if (!p || typeof p !== 'string' || p.length < 8) return 'Пароль минимум 8 символов';
  if (!/[a-zA-Zа-яА-Я]/.test(p)) return 'Пароль должен содержать хотя бы одну букву';
  if (!/\d/.test(p)) return 'Пароль должен содержать хотя бы одну цифру';
  return null;
}
function validateEmail(e) {
  if (!e || typeof e !== 'string') return 'Email обязателен';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return 'Некорректный email';
  return null;
}

// ── POST /api/auth/register ──
// {email, password, name, consent}. Юзер создаётся сразу (email_verified=false),
// код верификации уходит на почту. Юзер логинится сразу — верификация не
// блокирует онбординг, только некоторые операции (например reset пароля).
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { email, password, name, consent } = req.body || {};
    const em = norm(email);
    const emErr = validateEmail(em); if (emErr) return res.status(400).json({ error: emErr });
    const pwErr = validatePassword(password); if (pwErr) return res.status(400).json({ error: pwErr });
    if (!name || String(name).trim().length < 1) return res.status(400).json({ error: 'Имя обязательно' });
    if (consent !== true) return res.status(400).json({ error: 'Необходимо согласие на обработку персональных данных' });

    const existing = await queryOne('SELECT id, password_hash FROM users WHERE email = $1', [em]);
    if (existing?.password_hash) return res.status(409).json({ error: 'Пользователь с таким email уже существует' });

    const hash = await bcrypt.hash(password, 10);
    const code = gen6Digits();
    const expires = new Date(Date.now() + VERIFY_TTL_MS);

    let user;
    if (existing) {
      // Юзер уже есть (например через Google-OAuth), но пароля нет —
      // прикрепляем пароль и переводим на 'email' fallback provider.
      user = await queryOne(
        `UPDATE users SET password_hash=$1, display_name=$2, provider='email',
                          email_verification_code=$3, email_verification_expires=$4,
                          consent_pd_at=NOW(), updated_at=NOW()
          WHERE id=$5 RETURNING id, email, display_name, avatar_url, email_verified`,
        [hash, String(name).trim(), code, expires, existing.id]
      );
    } else {
      user = await queryOne(
        `INSERT INTO users (email, password_hash, display_name, provider,
                            email_verified, email_verification_code, email_verification_expires,
                            consent_pd_at)
         VALUES ($1,$2,$3,'email', FALSE, $4, $5, NOW())
         RETURNING id, email, display_name, avatar_url, email_verified`,
        [em, hash, String(name).trim(), code, expires]
      );
    }

    // pending role / invitations
    await applyPending(user.id, em);

    // Fire-and-forget email — код всё равно есть в БД, если письмо не дошло
    // юзер нажмёт resend.
    sendVerificationCode(em, code).catch(err => console.error('[Auth] send verify code:', err));

    const token = signToken({ id: user.id, email: user.email });
    res.json({
      token,
      user: {
        id: user.id, email: user.email, name: user.display_name,
        avatar: user.avatar_url, emailVerified: user.email_verified,
      },
    });
  } catch (err) {
    console.error('[Auth] Register:', err);
    res.status(500).json({ error: 'Ошибка регистрации' });
  }
});

// ── POST /api/auth/login ── (существующий, email/password)
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const em = norm(email);
    if (!em || !password) return res.status(400).json({ error: 'Email и пароль обязательны' });

    const user = await queryOne('SELECT * FROM users WHERE email = $1', [em]);
    if (!user) return res.status(401).json({ error: 'Неверный email или пароль' });
    if (!user.password_hash) return res.status(401).json({ error: 'Аккаунт создан через Google — используйте вход через Google или установите пароль в профиле' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Неверный email или пароль' });

    const token = signToken({ id: user.id, email: user.email });
    res.json({
      token,
      user: {
        id: user.id, email: user.email, name: user.display_name,
        avatar: user.avatar_url, emailVerified: !!user.email_verified,
      },
    });
  } catch (err) {
    console.error('[Auth] Login:', err);
    res.status(500).json({ error: 'Ошибка входа' });
  }
});

// ── POST /api/auth/verify-email ── {email, code}
router.post('/verify-email', authLimiter, async (req, res) => {
  try {
    const { email, code } = req.body || {};
    const em = norm(email);
    if (!em || !code) return res.status(400).json({ error: 'Email и код обязательны' });
    const user = await queryOne(
      `SELECT id, email_verified, email_verification_code, email_verification_expires
         FROM users WHERE email=$1`, [em]);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    if (user.email_verified) return res.json({ ok: true, alreadyVerified: true });
    if (!user.email_verification_code) return res.status(400).json({ error: 'Код не запрошен' });
    if (new Date(user.email_verification_expires) < new Date()) return res.status(400).json({ error: 'Код истёк, запросите новый' });
    if (String(code).trim() !== user.email_verification_code) return res.status(400).json({ error: 'Неверный код' });
    await query(
      `UPDATE users SET email_verified=TRUE, email_verification_code=NULL,
                        email_verification_expires=NULL WHERE id=$1`, [user.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Auth] verify-email:', err);
    res.status(500).json({ error: 'Ошибка проверки' });
  }
});

// ── POST /api/auth/resend-verification ── {email}
router.post('/resend-verification', authLimiter, async (req, res) => {
  try {
    const { email } = req.body || {};
    const em = norm(email);
    if (!em) return res.status(400).json({ error: 'Email обязателен' });
    const user = await queryOne('SELECT id, email_verified FROM users WHERE email=$1', [em]);
    // Всегда отвечаем ok — чтобы не палить существование email через таймауты.
    if (!user || user.email_verified) return res.json({ ok: true });
    const code = gen6Digits();
    const expires = new Date(Date.now() + VERIFY_TTL_MS);
    await query(
      `UPDATE users SET email_verification_code=$1, email_verification_expires=$2 WHERE id=$3`,
      [code, expires, user.id]);
    sendVerificationCode(em, code).catch(err => console.error('[Auth] send verify code:', err));
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Ошибка' }); }
});

// ── POST /api/auth/reset-request ── {email}
router.post('/reset-request', authLimiter, async (req, res) => {
  try {
    const { email } = req.body || {};
    const em = norm(email);
    if (!em) return res.status(400).json({ error: 'Email обязателен' });
    const user = await queryOne('SELECT id, password_hash FROM users WHERE email=$1', [em]);
    // Не палим существование — всегда ok.
    if (!user) return res.json({ ok: true });
    // Юзерам без пароля (только Google) — не отправляем reset-код.
    if (!user.password_hash) return res.json({ ok: true });
    const code = gen6Digits();
    const expires = new Date(Date.now() + RESET_TTL_MS);
    await query(
      `UPDATE users SET password_reset_code=$1, password_reset_expires=$2 WHERE id=$3`,
      [code, expires, user.id]);
    sendPasswordResetCode(em, code).catch(err => console.error('[Auth] send reset code:', err));
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Ошибка' }); }
});

// ── POST /api/auth/reset-confirm ── {email, code, newPassword}
router.post('/reset-confirm', authLimiter, async (req, res) => {
  try {
    const { email, code, newPassword } = req.body || {};
    const em = norm(email);
    if (!em || !code) return res.status(400).json({ error: 'Email и код обязательны' });
    const pwErr = validatePassword(newPassword); if (pwErr) return res.status(400).json({ error: pwErr });
    const user = await queryOne(
      `SELECT id, password_reset_code, password_reset_expires FROM users WHERE email=$1`, [em]);
    if (!user || !user.password_reset_code) return res.status(400).json({ error: 'Код не запрошен или email неверный' });
    if (new Date(user.password_reset_expires) < new Date()) return res.status(400).json({ error: 'Код истёк, запросите новый' });
    if (String(code).trim() !== user.password_reset_code) return res.status(400).json({ error: 'Неверный код' });
    const hash = await bcrypt.hash(newPassword, 10);
    await query(
      `UPDATE users SET password_hash=$1, password_reset_code=NULL, password_reset_expires=NULL,
                        updated_at=NOW() WHERE id=$2`, [hash, user.id]);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Ошибка' }); }
});

// ── POST /api/auth/change-password ── (authed) {oldPassword?, newPassword}
// oldPassword обязателен если у юзера уже есть пароль. Google-only юзер может
// установить пароль впервые — тогда oldPassword не нужен.
router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body || {};
    const pwErr = validatePassword(newPassword); if (pwErr) return res.status(400).json({ error: pwErr });
    const user = await queryOne('SELECT id, password_hash FROM users WHERE id=$1', [req.userId]);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    if (user.password_hash) {
      if (!oldPassword) return res.status(400).json({ error: 'Введите текущий пароль' });
      const valid = await bcrypt.compare(oldPassword, user.password_hash);
      if (!valid) return res.status(401).json({ error: 'Текущий пароль неверный' });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await query('UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2', [hash, user.id]);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Ошибка' }); }
});

// ── GET /api/auth/geo ── определение страны по IP через ipapi.co (бесплатно 1000/день)
// Кэшируем результат по IP на 24 часа чтобы не превышать лимит.
const geoCache = new Map(); // ip -> {country, expires}

// Общий helper — используется и в /geo (UI-скрытие Google-кнопки),
// и в /google (серверный gating). Возвращает { country, ip }.
async function detectCountry(req) {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (!ip || ip.startsWith('127.') || ip.startsWith('192.168.') || ip === '::1') {
    return { country: null, ip };
  }
  const cached = geoCache.get(ip);
  if (cached && cached.expires > Date.now()) return { country: cached.country, ip, cached: true };
  const r = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
    signal: AbortSignal.timeout(3000),
  }).catch(() => null);
  if (!r || !r.ok) return { country: null, ip };
  const data = await r.json().catch(() => null);
  const country = data?.country_code || null;
  geoCache.set(ip, { country, expires: Date.now() + 24 * 60 * 60 * 1000 });
  return { country, ip };
}

router.get('/geo', async (req, res) => {
  try { res.json(await detectCountry(req)); }
  catch (err) { res.json({ country: null }); }
});

// ── /api/auth/me ── (расширен: emailVerified, hasPassword) ──
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await queryOne(
      `SELECT id, email, display_name, avatar_url, email_verified, password_hash, provider
         FROM users WHERE id = $1`, [req.userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      id: user.id, email: user.email, name: user.display_name, avatar: user.avatar_url,
      emailVerified: !!user.email_verified,
      hasPassword: !!user.password_hash,
      provider: user.provider,
    });
  } catch (err) { console.error('[Auth] Me:', err); res.status(500).json({ error: 'Error' }); }
});

// ─── Google OAuth (без изменений — оставляем для не-RU) ───────────────────

function googleRedirectUri() {
  const base = process.env.APP_URL;
  if (!base) throw new Error('APP_URL env var missing — required for Google OAuth');
  return `${base.replace(/\/+$/, '')}/api/auth/google/callback`;
}

const oauthStates = new Map();
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
function issueOauthState() {
  const s = crypto.randomBytes(32).toString('base64url');
  oauthStates.set(s, Date.now());
  for (const [k, t] of oauthStates) if (Date.now() - t > OAUTH_STATE_TTL_MS) oauthStates.delete(k);
  return s;
}
function consumeOauthState(s) {
  if (!s || !oauthStates.has(s)) return false;
  const t = oauthStates.get(s);
  oauthStates.delete(s);
  return Date.now() - t <= OAUTH_STATE_TTL_MS;
}

// Middleware: блокирует Google-OAuth для RU-адресов. UI-скрытие кнопки —
// это первая линия защиты; серверный gating закрывает дыру с прямым URL
// (иначе прописанное в политике «трансграничная передача не осуществляется»
// не соответствовало бы реальности).
async function blockGoogleForRU(req, res, next) {
  try {
    const { country } = await detectCountry(req);
    if (country === 'RU') {
      // Сообщение показывается на странице после редиректа — короткое и
      // понятное, не раскрывает деталей политики.
      return res.status(451).send(
        '<!doctype html><meta charset="utf-8"><title>Вход через Google недоступен</title>' +
        '<div style="max-width:480px;margin:80px auto;padding:24px;font-family:system-ui,sans-serif;color:#1a1a2e;text-align:center">' +
        '<h1 style="font-size:20px;margin:0 0 12px">Вход через Google недоступен</h1>' +
        '<p style="color:#666;line-height:1.5">Используйте вход по email и паролю. Регистрация — на той же странице.</p>' +
        '<p style="margin-top:24px"><a href="/" style="color:#27ae60">← На главную</a></p></div>'
      );
    }
    next();
  } catch (err) {
    // Если geo-lookup упал — не блокируем (fail-open по внешнему сервису).
    next();
  }
}

router.get('/google', blockGoogleForRU, (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: 'Google OAuth не настроен' });
  let redirectUri;
  try { redirectUri = googleRedirectUri(); }
  catch (err) { return res.status(500).json({ error: err.message }); }
  const state = issueOauthState();
  const scope = encodeURIComponent('openid email profile');
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=select_account&state=${state}`;
  res.redirect(url);
});

router.get('/google/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code) return res.status(400).send('No code');
    if (!consumeOauthState(state)) return res.status(400).send('Invalid or expired OAuth state — повторите вход');

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = googleRedirectUri();
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: redirectUri, grant_type: 'authorization_code',
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokens.access_token) { console.error('[Auth] Google token error:', tokens); return res.status(400).send('OAuth error'); }
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await userRes.json();
    if (!profile.email) return res.status(400).send('No email from Google');
    let user = await queryOne('SELECT * FROM users WHERE email = $1', [profile.email.toLowerCase()]);
    if (!user) {
      user = await queryOne(
        `INSERT INTO users (email, display_name, avatar_url, provider, provider_id, email_verified)
         VALUES ($1,$2,$3,'google',$4, TRUE) RETURNING *`,
        [profile.email.toLowerCase(), profile.name || profile.email.split('@')[0], profile.picture || null, profile.id]
      );
    } else {
      await query(
        `UPDATE users SET display_name=COALESCE($1,display_name), avatar_url=COALESCE($2,avatar_url),
                          provider_id=COALESCE($3,provider_id), email_verified=TRUE, updated_at=NOW()
          WHERE id=$4`,
        [profile.name, profile.picture, profile.id, user.id]);
    }
    await applyPending(user.id, profile.email.toLowerCase());
    const token = signToken({ id: user.id, email: user.email });
    const frontendUrl = process.env.FRONTEND_URL || process.env.APP_URL || '/';
    res.redirect(`${frontendUrl}#access_token=${token}`);
  } catch (err) { console.error('[Auth] Google callback:', err); res.status(500).send('OAuth error'); }
});

// ── helper: pending role + invitations после регистрации/входа ──
async function applyPending(userId, email) {
  const pendingRole = await queryOne('SELECT role, assigned_by FROM pending_roles WHERE email = $1', [email]);
  if (pendingRole) {
    await queryOne('INSERT INTO user_roles (user_id, role, assigned_by) VALUES ($1,$2,$3) ON CONFLICT (user_id) DO UPDATE SET role=$2', [userId, pendingRole.role, pendingRole.assigned_by]);
    await query('DELETE FROM pending_roles WHERE email = $1', [email]);
  }
  const invitations = await query('SELECT id, course_id, role, invited_by FROM pending_invitations WHERE email = $1', [email]);
  for (const inv of invitations) {
    await queryOne(
      'INSERT INTO course_enrollments (course_id, user_id, role, invited_by) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
      [inv.course_id, userId, inv.role, inv.invited_by]
    );
  }
  if (invitations.length) await query('DELETE FROM pending_invitations WHERE email = $1', [email]);
}

export default router;
