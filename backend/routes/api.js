import { Router } from 'express';
import { query, queryOne, execute } from '../db.js';
import { requireAuth } from '../middleware.js';

const router = Router();
router.use(requireAuth);

// ═══════════════════════════════════════════════════════════
// USER SETTINGS
// ═══════════════════════════════════════════════════════════

router.get('/settings', async (req, res) => {
  try {
    let s = await queryOne('SELECT * FROM user_settings WHERE user_id = $1', [req.userId]);
    if (!s) {
      const now = new Date();
      const d = new Date(now);
      if (now.getHours() < 5) d.setDate(d.getDate() - 1);
      d.setHours(5, 0, 0, 0);
      s = await queryOne(
        `INSERT INTO user_settings (user_id, course_start_date, tz_offset_min, current_day, day_start_hour)
         VALUES ($1, $2, $3, 1, 5) RETURNING *`,
        [req.userId, d.toISOString()]
      );
    }
    res.json(s);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.patch('/settings', async (req, res) => {
  try {
    const fields = req.body;
    const keys = Object.keys(fields).filter(k => k !== 'user_id');
    if (!keys.length) return res.json({ ok: true });
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    await query(`UPDATE user_settings SET ${sets}, updated_at = NOW() WHERE user_id = $1`, [req.userId, ...keys.map(k => fields[k])]);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// AVAILABLE ITEMS (courses + trackers)
// ═══════════════════════════════════════════════════════════

router.get('/items', async (req, res) => {
  try {
    // Enrolled courses
    const enrolled = await query(`
      SELECT ce.role, ce.joined_at,
             c.id, c.title, c.description, c.days_count, c.avatar_icon, c.avatar_custom, c.owner_id, c.created_at,
             (SELECT count(*) FROM course_enrollments WHERE course_id = c.id) AS enroll_count
      FROM course_enrollments ce
      JOIN courses c ON c.id = ce.course_id
      WHERE ce.user_id = $1
    `, [req.userId]);

    const courseIds = new Set(enrolled.map(e => e.id));
    const items = [];

    for (const e of enrolled) {
      const acts = await query('SELECT * FROM course_activities WHERE course_id = $1 ORDER BY sort_order', [e.id]);
      items.push({
        type: 'course', id: e.id, title: e.title, description: e.description || '',
        daysCount: e.days_count, avatarIcon: e.avatar_icon, avatarCustom: e.avatar_custom,
        ownerId: e.owner_id, enrollRole: e.role,
        startDate: (e.joined_at || e.created_at || '').toString().slice(0, 10) || null,
        enrollCount: parseInt(e.enroll_count),
        activities: acts.map(a => ({
          id: a.id, activityId: a.activity_id, label: a.label, durationMin: a.duration_min,
          iconNum: a.icon_num || 'health/1', practiceType: a.practice_type || 'media',
          descriptionHtml: a.description_html || null, firstDay: a.first_day || 1,
          lastDay: a.last_day || e.days_count, intervalDays: a.interval_days || 1,
        })),
      });
    }

    // Own courses not enrolled
    const own = await query('SELECT * FROM courses WHERE owner_id = $1', [req.userId]);
    for (const c of own) {
      if (courseIds.has(c.id)) continue;
      const acts = await query('SELECT * FROM course_activities WHERE course_id = $1 ORDER BY sort_order', [c.id]);
      const cnt = await queryOne('SELECT count(*) AS n FROM course_enrollments WHERE course_id = $1', [c.id]);
      items.push({
        type: 'course', id: c.id, title: c.title, description: c.description || '',
        daysCount: c.days_count, avatarIcon: c.avatar_icon, avatarCustom: c.avatar_custom,
        ownerId: c.owner_id, enrollRole: 'trainer',
        startDate: (c.created_at || '').toString().slice(0, 10) || null,
        enrollCount: parseInt(cnt?.n || 0),
        activities: acts.map(a => ({
          id: a.id, activityId: a.activity_id, label: a.label, durationMin: a.duration_min,
          iconNum: a.icon_num || 'health/1', practiceType: a.practice_type || 'media',
          descriptionHtml: a.description_html || null, firstDay: a.first_day || 1,
          lastDay: a.last_day || c.days_count, intervalDays: a.interval_days || 1,
        })),
      });
    }

    // Personal trackers
    const trackers = await query('SELECT * FROM personal_trackers WHERE user_id = $1 ORDER BY created_at DESC', [req.userId]);
    for (const t of trackers) {
      const practices = await query('SELECT * FROM tracker_practices WHERE tracker_id = $1 ORDER BY sort_order', [t.id]);
      items.push({
        type: 'tracker', id: t.id, title: t.title,
        daysCount: t.days_count, avatarIcon: t.avatar_icon, avatarCustom: t.avatar_custom,
        ownerId: req.userId, startDate: t.start_date || null,
        activities: practices.map(p => ({
          id: p.id, activityId: p.id, label: p.title, durationMin: p.duration_min,
          iconNum: p.icon_num || 'health/1', firstDay: p.first_day || 1,
          lastDay: p.last_day || t.days_count, intervalDays: p.interval_days || 1,
        })),
      });
    }

    res.json(items);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// COURSE PROGRESS
// ═══════════════════════════════════════════════════════════

router.get('/progress/course/:courseId', async (req, res) => {
  try {
    const rows = await query(
      'SELECT activity_id, day, elapsed_seconds, completed FROM course_progress WHERE user_id = $1 AND course_id = $2',
      [req.userId, req.params.courseId]
    );
    const r = {};
    for (const row of rows) {
      if (!r[row.day]) r[row.day] = {};
      r[row.day][row.activity_id] = { elapsed: row.elapsed_seconds, completed: row.completed };
    }
    res.json(r);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.post('/progress/course', async (req, res) => {
  try {
    const { courseId, activityId, day, elapsed, completed } = req.body;
    await query(
      `INSERT INTO course_progress (user_id, course_id, activity_id, day, elapsed_seconds, completed, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (user_id, course_id, activity_id, day)
       DO UPDATE SET elapsed_seconds = $5, completed = $6, updated_at = NOW()`,
      [req.userId, courseId, activityId, day, elapsed, completed]
    );
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// TRACKER PROGRESS
// ═══════════════════════════════════════════════════════════

router.get('/progress/tracker/:trackerId', async (req, res) => {
  try {
    const rows = await query(
      'SELECT practice_id, day, elapsed_seconds, completed FROM tracker_progress WHERE user_id = $1 AND tracker_id = $2',
      [req.userId, req.params.trackerId]
    );
    const r = {};
    for (const row of rows) {
      if (!r[row.day]) r[row.day] = {};
      r[row.day][row.practice_id] = { elapsed: row.elapsed_seconds, completed: row.completed };
    }
    res.json(r);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.post('/progress/tracker', async (req, res) => {
  try {
    const { trackerId, practiceId, day, elapsed, completed } = req.body;
    await query(
      `INSERT INTO tracker_progress (user_id, tracker_id, practice_id, day, elapsed_seconds, completed, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (user_id, tracker_id, practice_id, day)
       DO UPDATE SET elapsed_seconds = $5, completed = $6, updated_at = NOW()`,
      [req.userId, trackerId, practiceId, day, elapsed, completed]
    );
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// USER ROLES
// ═══════════════════════════════════════════════════════════

router.get('/role', async (req, res) => {
  try {
    const r = await queryOne('SELECT role FROM user_roles WHERE user_id = $1', [req.userId]);
    res.json({ role: r?.role || 'student' });
  } catch (err) { res.json({ role: 'student' }); }
});

router.post('/role/assign', async (req, res) => {
  try {
    const { email, role } = req.body;
    await query(
      'INSERT INTO pending_roles (email, role, assigned_by) VALUES ($1, $2, $3) ON CONFLICT (email) DO UPDATE SET role = $2',
      [email.toLowerCase().trim(), role, req.userId]
    );
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ success: false, error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// COURSES — CRUD
// ═══════════════════════════════════════════════════════════

router.post('/courses', async (req, res) => {
  try {
    const { title, description, avatarIcon, avatarCustom, daysCount, activities } = req.body;
    const course = await queryOne(
      'INSERT INTO courses (owner_id, title, description, days_count, avatar_icon, avatar_custom) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [req.userId, title, description || '', daysCount, avatarIcon || null, avatarCustom || null]
    );

    if (activities?.length) {
      for (let i = 0; i < activities.length; i++) {
        const a = activities[i];
        await query(
          `INSERT INTO course_activities (course_id, activity_id, label, duration_min, icon_num, practice_type, description_html, first_day, last_day, sort_order, interval_days)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [course.id, a.activityId || `act_${Date.now()}_${i}`, a.label, a.durationMin || 10,
           a.iconNum || 'health/1', a.practiceType || 'media', a.descriptionHtml || null,
           a.firstDay || 1, a.lastDay || daysCount, i, a.intervalDays || 1]
        );
      }
    }

    await query(
      'INSERT INTO course_enrollments (course_id, user_id, role, invited_by) VALUES ($1,$2,$3,$4)',
      [course.id, req.userId, 'trainer', req.userId]
    );

    res.json(course);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.get('/courses/:id', async (req, res) => {
  try {
    const course = await queryOne('SELECT * FROM courses WHERE id = $1', [req.params.id]);
    if (!course) return res.status(404).json({ error: 'Not found' });
    const acts = await query('SELECT * FROM course_activities WHERE course_id = $1 ORDER BY sort_order', [req.params.id]);
    res.json({ ...course, course_activities: acts });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.put('/courses/:id', async (req, res) => {
  try {
    const { title, description, avatarIcon, avatarCustom, daysCount, activities, deletedActivityIds } = req.body;
    await query(
      'UPDATE courses SET title=$1, description=$2, days_count=$3, avatar_icon=$4, avatar_custom=$5, updated_at=NOW() WHERE id=$6',
      [title, description || '', daysCount, avatarIcon || null, avatarCustom || null, req.params.id]
    );

    if (deletedActivityIds?.length) {
      await query('DELETE FROM course_activities WHERE id = ANY($1)', [deletedActivityIds]);
    }

    if (activities) {
      for (let i = 0; i < activities.length; i++) {
        const a = activities[i];
        if (a.dbId) {
          await query(
            'UPDATE course_activities SET label=$1, duration_min=$2, icon_num=$3, practice_type=$4, description_html=$5, first_day=$6, last_day=$7, sort_order=$8, interval_days=$9 WHERE id=$10',
            [a.label, a.durationMin, a.iconNum, a.practiceType || 'media', a.descriptionHtml || null, a.firstDay, a.lastDay, i, a.intervalDays || 1, a.dbId]
          );
        } else {
          await query(
            `INSERT INTO course_activities (course_id, activity_id, label, duration_min, icon_num, practice_type, description_html, first_day, last_day, sort_order, interval_days)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [req.params.id, `act_${Date.now()}_${i}`, a.label, a.durationMin, a.iconNum, a.practiceType || 'media', a.descriptionHtml || null, a.firstDay, a.lastDay, i, a.intervalDays || 1]
          );
        }
      }
    }
    res.json({ id: req.params.id });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.get('/courses-own', async (req, res) => {
  try {
    const courses = await query(
      `SELECT c.*, (SELECT count(*) FROM course_activities WHERE course_id = c.id) AS act_count
       FROM courses c WHERE c.owner_id = $1 ORDER BY c.created_at DESC`, [req.userId]
    );
    res.json(courses);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.post('/courses/:id/can-delete', async (req, res) => {
  try {
    const course = await queryOne('SELECT owner_id FROM courses WHERE id = $1', [req.params.id]);
    if (!course || course.owner_id !== req.userId) return res.json({ canDelete: false, reason: 'Нет прав' });
    const students = await queryOne(
      "SELECT count(*) AS n FROM course_enrollments WHERE course_id = $1 AND role = 'student'", [req.params.id]
    );
    if (parseInt(students.n) > 0) return res.json({ canDelete: false, reason: `В курсе ${students.n} учеников` });
    res.json({ canDelete: true, reason: '' });
  } catch (err) { res.json({ canDelete: false, reason: err.message }); }
});

router.delete('/courses/:id', async (req, res) => {
  try {
    const course = await queryOne('SELECT owner_id FROM courses WHERE id = $1', [req.params.id]);
    if (!course || course.owner_id !== req.userId) return res.json({ deleted: false, error: 'Нет прав' });
    await query('DELETE FROM courses WHERE id = $1', [req.params.id]);
    res.json({ deleted: true });
  } catch (err) { res.json({ deleted: false, error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// INVITATIONS
// ═══════════════════════════════════════════════════════════

router.post('/courses/:id/invite', async (req, res) => {
  try {
    const { email, role } = req.body;
    const courseId = req.params.id;
    const e = email.toLowerCase().trim();

    // Check if already enrolled
    const existing = await queryOne(
      `SELECT ce.id FROM course_enrollments ce JOIN users u ON u.id = ce.user_id WHERE ce.course_id = $1 AND u.email = $2`,
      [courseId, e]
    );
    if (existing) return res.json({ success: false, error: 'Пользователь уже в курсе' });

    // Check if already invited
    const inv = await queryOne('SELECT id FROM pending_invitations WHERE course_id = $1 AND email = $2', [courseId, e]);
    if (inv) return res.json({ success: false, error: 'Приглашение уже отправлено' });

    // Check if user exists → auto-enroll
    const user = await queryOne('SELECT id FROM users WHERE email = $1', [e]);
    if (user) {
      await query(
        'INSERT INTO course_enrollments (course_id, user_id, role, invited_by) VALUES ($1,$2,$3,$4)',
        [courseId, user.id, role, req.userId]
      );
      return res.json({ success: true });
    }

    // Create pending invitation
    await query(
      'INSERT INTO pending_invitations (course_id, email, role, invited_by) VALUES ($1,$2,$3,$4)',
      [courseId, e, role, req.userId]
    );
    res.json({ success: true });
  } catch (err) { console.error(err); res.json({ success: false, error: err.message }); }
});

router.get('/invitations', async (req, res) => {
  try {
    const user = await queryOne('SELECT email FROM users WHERE id = $1', [req.userId]);
    const invs = await query(
      `SELECT pi.*, c.id AS course_id, c.title, c.description, c.days_count, c.avatar_icon, c.avatar_custom
       FROM pending_invitations pi JOIN courses c ON c.id = pi.course_id
       WHERE pi.email = $1 ORDER BY pi.created_at DESC`,
      [user.email]
    );
    res.json(invs.map(i => ({
      ...i,
      courses: { id: i.course_id, title: i.title, description: i.description, days_count: i.days_count, avatar_icon: i.avatar_icon, avatar_custom: i.avatar_custom },
    })));
  } catch (err) { console.error(err); res.status(500).json([]); }
});

router.post('/invitations/:id/accept', async (req, res) => {
  try {
    const inv = await queryOne('SELECT * FROM pending_invitations WHERE id = $1', [req.params.id]);
    if (!inv) return res.json({ success: false, error: 'Приглашение не найдено' });

    await query(
      'INSERT INTO course_enrollments (course_id, user_id, role, invited_by) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
      [inv.course_id, req.userId, inv.role, inv.invited_by]
    );
    await query('DELETE FROM pending_invitations WHERE id = $1', [req.params.id]);
    res.json({ success: true, course_id: inv.course_id });
  } catch (err) { console.error(err); res.json({ success: false, error: err.message }); }
});

router.post('/invitations/:id/decline', async (req, res) => {
  try {
    await query('DELETE FROM pending_invitations WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// MESSAGES
// ═══════════════════════════════════════════════════════════

router.post('/messages/send', async (req, res) => {
  try {
    const { courseId, recipientId, body } = req.body;
    if (!body || body.length > 500) return res.json({ success: false, error: 'Сообщение от 1 до 500 символов' });
    const msg = await queryOne(
      'INSERT INTO messages (course_id, sender_id, recipient_id, body) VALUES ($1,$2,$3,$4) RETURNING id',
      [courseId, req.userId, recipientId, body]
    );
    res.json({ success: true, id: msg.id });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

router.get('/messages/conversation', async (req, res) => {
  try {
    const { courseId, otherUserId } = req.query;
    const msgs = await query(
      `SELECT id, sender_id, recipient_id, body, is_read, created_at FROM messages
       WHERE course_id = $1 AND ((sender_id = $2 AND recipient_id = $3) OR (sender_id = $3 AND recipient_id = $2))
       ORDER BY created_at ASC`,
      [courseId, req.userId, otherUserId]
    );
    res.json(msgs);
  } catch (err) { console.error(err); res.json([]); }
});

router.post('/messages/mark-read', async (req, res) => {
  try {
    const { courseId, senderId } = req.body;
    await query(
      'UPDATE messages SET is_read = TRUE WHERE course_id = $1 AND sender_id = $2 AND recipient_id = $3 AND NOT is_read',
      [courseId, senderId, req.userId]
    );
    res.json({ ok: true });
  } catch (err) { res.json({ ok: false }); }
});

router.get('/messages/unread-count', async (req, res) => {
  try {
    const r = await queryOne('SELECT count(*) AS n FROM messages WHERE recipient_id = $1 AND NOT is_read', [req.userId]);
    res.json(parseInt(r?.n || 0));
  } catch (err) { res.json(0); }
});

router.get('/messages/unread-by-conversation', async (req, res) => {
  try {
    const rows = await query(
      `SELECT course_id, sender_id, count(*) AS unread_count FROM messages
       WHERE recipient_id = $1 AND NOT is_read GROUP BY course_id, sender_id`,
      [req.userId]
    );
    res.json(rows);
  } catch (err) { res.json([]); }
});

router.get('/messages/staff/:courseId', async (req, res) => {
  try {
    const courseId = req.params.courseId;
    const course = await queryOne('SELECT owner_id FROM courses WHERE id = $1', [courseId]);
    const myEnroll = await queryOne('SELECT role FROM course_enrollments WHERE course_id = $1 AND user_id = $2', [courseId, req.userId]);
    const isStaff = course?.owner_id === req.userId || ['trainer', 'curator'].includes(myEnroll?.role);

    let rows;
    if (isStaff) {
      rows = await query(
        `SELECT u.id AS user_id, u.display_name, u.email, ce.role, (c.owner_id = u.id) AS is_owner
         FROM course_enrollments ce JOIN users u ON u.id = ce.user_id JOIN courses c ON c.id = ce.course_id
         WHERE ce.course_id = $1 ORDER BY (c.owner_id = u.id) DESC, ce.role, u.display_name`,
        [courseId]
      );
    } else {
      rows = await query(
        `SELECT u.id AS user_id, u.display_name, u.email, ce.role, (c.owner_id = u.id) AS is_owner
         FROM course_enrollments ce JOIN users u ON u.id = ce.user_id JOIN courses c ON c.id = ce.course_id
         WHERE ce.course_id = $1 AND (ce.role IN ('trainer','curator') OR c.owner_id = u.id)
         ORDER BY (c.owner_id = u.id) DESC, ce.role, u.display_name`,
        [courseId]
      );
    }
    // Map to match frontend expected format
    res.json(rows.map(r => ({
      user_id: r.user_id, display_name: r.display_name, email: r.email, role: r.role, is_owner: r.is_owner,
    })));
  } catch (err) { console.error(err); res.json([]); }
});

// ═══════════════════════════════════════════════════════════
// PERSONAL TRACKERS
// ═══════════════════════════════════════════════════════════

router.post('/trackers', async (req, res) => {
  try {
    const { title, avatarIcon, avatarCustom, daysCount, practices } = req.body;
    const t = await queryOne(
      `INSERT INTO personal_trackers (user_id, title, avatar_icon, avatar_custom, days_count, start_date)
       VALUES ($1,$2,$3,$4,$5, CURRENT_DATE) RETURNING *`,
      [req.userId, title, avatarIcon || null, avatarCustom || null, daysCount]
    );
    if (practices?.length) {
      for (let i = 0; i < practices.length; i++) {
        const p = practices[i];
        await query(
          `INSERT INTO tracker_practices (tracker_id, title, icon_num, first_day, last_day, duration_min, sort_order, interval_days)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [t.id, p.title, p.iconNum || 'health/1', p.firstDay || 1, p.lastDay || daysCount, p.durationMin || 10, i, p.intervalDays || 1]
        );
      }
    }
    res.json(t);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.get('/trackers', async (req, res) => {
  try {
    const trackers = await query('SELECT * FROM personal_trackers WHERE user_id = $1 ORDER BY created_at DESC', [req.userId]);
    for (const t of trackers) {
      t.tracker_practices = await query('SELECT * FROM tracker_practices WHERE tracker_id = $1 ORDER BY sort_order', [t.id]);
    }
    res.json(trackers);
  } catch (err) { res.json([]); }
});

router.get('/trackers/:id', async (req, res) => {
  try {
    const t = await queryOne('SELECT * FROM personal_trackers WHERE id = $1', [req.params.id]);
    if (!t) return res.status(404).json({ error: 'Not found' });
    t.tracker_practices = await query('SELECT * FROM tracker_practices WHERE tracker_id = $1 ORDER BY sort_order', [t.id]);
    res.json(t);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.put('/trackers/:id', async (req, res) => {
  try {
    const { title, avatarIcon, avatarCustom, daysCount, practices, deletedPracticeIds } = req.body;
    await query(
      'UPDATE personal_trackers SET title=$1, avatar_icon=$2, avatar_custom=$3, days_count=$4 WHERE id=$5',
      [title, avatarIcon || null, avatarCustom || null, daysCount, req.params.id]
    );
    if (deletedPracticeIds?.length) {
      await query('DELETE FROM tracker_practices WHERE id = ANY($1)', [deletedPracticeIds]);
    }
    if (practices) {
      for (let i = 0; i < practices.length; i++) {
        const p = practices[i];
        if (p.dbId) {
          await query(
            'UPDATE tracker_practices SET title=$1, icon_num=$2, first_day=$3, last_day=$4, duration_min=$5, sort_order=$6, interval_days=$7 WHERE id=$8',
            [p.title, p.iconNum || 'health/1', p.firstDay, p.lastDay, p.durationMin, i, p.intervalDays || 1, p.dbId]
          );
        } else {
          await query(
            'INSERT INTO tracker_practices (tracker_id, title, icon_num, first_day, last_day, duration_min, sort_order, interval_days) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
            [req.params.id, p.title, p.iconNum || 'health/1', p.firstDay, p.lastDay, p.durationMin, i, p.intervalDays || 1]
          );
        }
      }
    }
    res.json({ id: req.params.id });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.delete('/trackers/:id', async (req, res) => {
  try {
    await query('DELETE FROM personal_trackers WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    res.json({ ok: true });
  } catch (err) { res.json({ ok: false }); }
});

// ═══════════════════════════════════════════════════════════
// TRAINER CABINET
// ═══════════════════════════════════════════════════════════

// Helper: check if user is trainer/owner of course
async function isTrainer(userId, courseId) {
  const course = await queryOne('SELECT owner_id FROM courses WHERE id = $1', [courseId]);
  if (course?.owner_id === userId) return true;
  const enroll = await queryOne(
    "SELECT role FROM course_enrollments WHERE course_id = $1 AND user_id = $2 AND role IN ('trainer','curator')",
    [courseId, userId]
  );
  return !!enroll;
}

router.get('/trainer/students/:courseId', async (req, res) => {
  try {
    if (!await isTrainer(req.userId, req.params.courseId)) return res.status(403).json([]);
    const rows = await query(
      `SELECT ce.id AS enrollment_id, u.id AS user_id, u.email, u.display_name, ce.role, ce.paused, ce.joined_at,
              (c.owner_id = u.id) AS is_owner
       FROM course_enrollments ce JOIN users u ON u.id = ce.user_id JOIN courses c ON c.id = ce.course_id
       WHERE ce.course_id = $1 ORDER BY (c.owner_id = u.id) DESC, ce.role, ce.joined_at`,
      [req.params.courseId]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.json([]); }
});

router.get('/trainer/progress/:courseId', async (req, res) => {
  try {
    if (!await isTrainer(req.userId, req.params.courseId)) return res.status(403).json({});
    const rows = await query(
      'SELECT user_id, activity_id, day, elapsed_seconds, completed FROM course_progress WHERE course_id = $1',
      [req.params.courseId]
    );
    const result = {};
    for (const row of rows) {
      if (!result[row.user_id]) result[row.user_id] = {};
      if (!result[row.user_id][row.day]) result[row.user_id][row.day] = {};
      result[row.user_id][row.day][row.activity_id] = { elapsed: row.elapsed_seconds, completed: row.completed };
    }
    res.json(result);
  } catch (err) { console.error(err); res.json({}); }
});

router.post('/trainer/toggle-pause', async (req, res) => {
  try {
    const { enrollmentId } = req.body;
    const enroll = await queryOne('SELECT * FROM course_enrollments WHERE id = $1', [enrollmentId]);
    if (!enroll || !await isTrainer(req.userId, enroll.course_id)) return res.json({ success: false, error: 'Нет прав' });
    const newPaused = !enroll.paused;
    await query('UPDATE course_enrollments SET paused = $1 WHERE id = $2', [newPaused, enrollmentId]);
    res.json({ success: true, paused: newPaused });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

router.post('/trainer/remove-student', async (req, res) => {
  try {
    const { enrollmentId } = req.body;
    const enroll = await queryOne('SELECT * FROM course_enrollments WHERE id = $1', [enrollmentId]);
    if (!enroll || !await isTrainer(req.userId, enroll.course_id)) return res.json({ success: false, error: 'Нет прав' });
    const course = await queryOne('SELECT owner_id FROM courses WHERE id = $1', [enroll.course_id]);
    if (enroll.user_id === course.owner_id) return res.json({ success: false, error: 'Нельзя удалить владельца' });
    await query('DELETE FROM course_progress WHERE user_id = $1 AND course_id = $2', [enroll.user_id, enroll.course_id]);
    await query('DELETE FROM course_enrollments WHERE id = $1', [enrollmentId]);
    res.json({ success: true });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

router.post('/trainer/change-role', async (req, res) => {
  try {
    const { enrollmentId, newRole } = req.body;
    const enroll = await queryOne('SELECT * FROM course_enrollments WHERE id = $1', [enrollmentId]);
    if (!enroll || !await isTrainer(req.userId, enroll.course_id)) return res.json({ success: false, error: 'Нет прав' });
    if (enroll.user_id === req.userId) return res.json({ success: false, error: 'Нельзя изменить свою роль' });
    await query('UPDATE course_enrollments SET role = $1 WHERE id = $2', [newRole, enrollmentId]);
    res.json({ success: true, role: newRole });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

router.post('/trainer/toggle-exclusion', async (req, res) => {
  try {
    const { courseId, userId, activityId, day } = req.body;
    if (!await isTrainer(req.userId, courseId)) return res.json({ success: false, error: 'Нет прав' });
    const existing = await queryOne(
      'SELECT id FROM student_activity_exclusions WHERE user_id = $1 AND course_id = $2 AND activity_id = $3 AND day = $4',
      [userId, courseId, activityId, day]
    );
    if (existing) {
      await query('DELETE FROM student_activity_exclusions WHERE id = $1', [existing.id]);
      res.json({ success: true, excluded: false });
    } else {
      await query(
        'INSERT INTO student_activity_exclusions (user_id, course_id, activity_id, day) VALUES ($1,$2,$3,$4)',
        [userId, courseId, activityId, day]
      );
      res.json({ success: true, excluded: true });
    }
  } catch (err) { res.json({ success: false, error: err.message }); }
});

router.post('/trainer/add-activity', async (req, res) => {
  try {
    const { courseId, userId, label, iconNum, durationMin, firstDay, lastDay, intervalDays } = req.body;
    if (!await isTrainer(req.userId, courseId)) return res.json({ success: false, error: 'Нет прав' });
    const act = await queryOne(
      `INSERT INTO student_custom_activities (course_id, user_id, label, icon_num, duration_min, first_day, last_day, interval_days)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [courseId, userId, label, iconNum, durationMin, firstDay, lastDay, intervalDays || 1]
    );
    res.json({ success: true, id: act.id });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

router.post('/trainer/delete-activity', async (req, res) => {
  try {
    const { activityId } = req.body;
    const act = await queryOne('SELECT course_id FROM student_custom_activities WHERE id = $1', [activityId]);
    if (!act || !await isTrainer(req.userId, act.course_id)) return res.json({ success: false, error: 'Нет прав' });
    await query('DELETE FROM student_custom_activities WHERE id = $1', [activityId]);
    res.json({ success: true });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

router.get('/trainer/exclusions/:courseId', async (req, res) => {
  try {
    if (!await isTrainer(req.userId, req.params.courseId)) return res.json({});
    const rows = await query('SELECT user_id, activity_id, day FROM student_activity_exclusions WHERE course_id = $1', [req.params.courseId]);
    const result = {};
    for (const r of rows) {
      if (!result[r.user_id]) result[r.user_id] = {};
      result[r.user_id][`${r.activity_id}_${r.day}`] = true;
    }
    res.json(result);
  } catch (err) { res.json({}); }
});

router.get('/trainer/custom-activities/:courseId', async (req, res) => {
  try {
    if (!await isTrainer(req.userId, req.params.courseId)) return res.json([]);
    const rows = await query(
      'SELECT id, user_id, label, icon_num, duration_min, first_day, last_day, interval_days FROM student_custom_activities WHERE course_id = $1 ORDER BY created_at',
      [req.params.courseId]
    );
    res.json(rows);
  } catch (err) { res.json([]); }
});

// Student's own exclusions and custom activities
router.get('/exclusions/:courseId', async (req, res) => {
  try {
    const rows = await query(
      'SELECT activity_id, day FROM student_activity_exclusions WHERE user_id = $1 AND course_id = $2',
      [req.userId, req.params.courseId]
    );
    const result = {};
    for (const r of rows) result[`${r.activity_id}_${r.day}`] = true;
    res.json(result);
  } catch (err) { res.json({}); }
});

router.get('/custom-activities/:courseId', async (req, res) => {
  try {
    const rows = await query(
      'SELECT * FROM student_custom_activities WHERE user_id = $1 AND course_id = $2',
      [req.userId, req.params.courseId]
    );
    res.json(rows.map(a => ({
      id: a.id, activityId: a.id, label: a.label, durationMin: a.duration_min,
      iconNum: a.icon_num || 'health/1', firstDay: a.first_day, lastDay: a.last_day,
      intervalDays: a.interval_days || 1, isCustom: true,
    })));
  } catch (err) { res.json([]); }
});

// ═══════════════════════════════════════════════════════════
// ACTIVITY VIDEOS
// ═══════════════════════════════════════════════════════════

router.get('/videos/:courseId', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM activity_videos WHERE course_id = $1 ORDER BY sort_order', [req.params.courseId]);
    res.json(rows);
  } catch (err) { res.json([]); }
});

router.post('/videos/link', async (req, res) => {
  try {
    const { courseId, activityId, url, videoType, firstDay, lastDay } = req.body;
    const v = await queryOne(
      `INSERT INTO activity_videos (course_id, activity_id, video_type, video_url, first_day, last_day)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [courseId, activityId, videoType, url, firstDay, lastDay]
    );
    res.json({ data: v });
  } catch (err) { console.error(err); res.json({ error: err.message }); }
});

router.delete('/videos/:id', async (req, res) => {
  try {
    const v = await queryOne('SELECT * FROM activity_videos WHERE id = $1', [req.params.id]);
    if (!v) return res.json({ error: 'Not found' });
    // Delete physical file if it's a file upload
    if (v.video_type === 'file' && v.video_url) {
      const { default: fs } = await import('fs/promises');
      const { default: path } = await import('path');
      const filePath = path.join(process.cwd(), 'uploads', 'course-videos', v.video_url);
      try { await fs.unlink(filePath); } catch {}
    }
    await query('DELETE FROM activity_videos WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.json({ error: err.message }); }
});

router.patch('/videos/:id/duration', async (req, res) => {
  try {
    const { durationSec } = req.body;
    await query('UPDATE activity_videos SET duration_sec = $1 WHERE id = $2', [durationSec, req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.json({ ok: false }); }
});

// ═══════════════════════════════════════════════════════════
// ACTIVITY CALLS (online sessions)
// ═══════════════════════════════════════════════════════════

router.get('/calls/:courseId', async (req, res) => {
  try {
    const rows = await query(
      'SELECT * FROM activity_calls WHERE course_id = $1 ORDER BY scheduled_at',
      [req.params.courseId]
    );
    res.json(rows);
  } catch (err) { res.json([]); }
});

router.post('/calls', async (req, res) => {
  try {
    const { courseId, activityId, day, scheduledAt, durationMin } = req.body;
    if (!await isTrainer(req.userId, courseId)) return res.status(403).json({ error: 'Нет прав' });
    const call = await queryOne(
      `INSERT INTO activity_calls (course_id, activity_id, day, scheduled_at, duration_min, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [courseId, activityId, day, scheduledAt, durationMin || 30, req.userId]
    );
    res.json({ data: call });
  } catch (err) { console.error(err); res.json({ error: err.message }); }
});

router.put('/calls/:id', async (req, res) => {
  try {
    const call = await queryOne('SELECT * FROM activity_calls WHERE id = $1', [req.params.id]);
    if (!call || !await isTrainer(req.userId, call.course_id)) return res.status(403).json({ error: 'Нет прав' });
    const { scheduledAt, durationMin, status } = req.body;
    const updated = await queryOne(
      `UPDATE activity_calls SET scheduled_at = COALESCE($1, scheduled_at), duration_min = COALESCE($2, duration_min),
       status = COALESCE($3, status), updated_at = NOW() WHERE id = $4 RETURNING *`,
      [scheduledAt || null, durationMin || null, status || null, req.params.id]
    );
    res.json({ data: updated });
  } catch (err) { res.json({ error: err.message }); }
});

router.delete('/calls/:id', async (req, res) => {
  try {
    const call = await queryOne('SELECT * FROM activity_calls WHERE id = $1', [req.params.id]);
    if (!call || !await isTrainer(req.userId, call.course_id)) return res.status(403).json({ error: 'Нет прав' });
    await query('DELETE FROM activity_calls WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.json({ error: err.message }); }
});

export default router;
