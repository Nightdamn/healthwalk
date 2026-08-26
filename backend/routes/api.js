import { Router } from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { query, queryOne, execute } from '../db.js';
import { requireAuth } from '../middleware.js';

const router = Router();
router.use(requireAuth);

// A-10: cap message sending so a compromised account can't spam.
const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId || req.ip,
  validate: { keyGeneratorIpFallback: false }, // we already fall back to req.ip ourselves
  message: { success: false, error: 'Слишком много сообщений за минуту' },
});

function toISODate(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

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
    const allowedFields = ['course_start_date', 'tz_offset_min', 'day_start_hour', 'current_day', 'active_type', 'active_id'];
    const fields = req.body;
    const keys = Object.keys(fields).filter(k => allowedFields.includes(k));
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
      SELECT ce.id AS enrollment_id, ce.role, ce.joined_at, ce.progression_mode_override,
             c.id, c.title, c.description, c.days_count, c.avatar_icon, c.avatar_custom, c.owner_id, c.created_at,
             c.bound_to_calendar, c.start_date, c.access_days_after, c.progression_mode,
             (SELECT count(*) FROM course_enrollments WHERE course_id = c.id) AS enroll_count
      FROM course_enrollments ce
      JOIN courses c ON c.id = ce.course_id
      WHERE ce.user_id = $1
    `, [req.userId]);

    const courseIds = new Set(enrolled.map(e => e.id));
    const items = [];

    for (const e of enrolled) {
      const acts = await query('SELECT * FROM course_activities WHERE course_id = $1 ORDER BY sort_order', [e.id]);
      // Если курс привязан к календарю — все студенты считают день от
      // course.start_date, а не от своего joined_at. Иначе — от joined_at.
      const startDate = (e.bound_to_calendar && e.start_date)
        ? toISODate(e.start_date)
        : toISODate(e.joined_at || e.created_at);
      // v25: effective progression_mode = enrollment.override ?? course.progression_mode.
      const effectiveMode = e.progression_mode_override || e.progression_mode || 'daily';
      const closures = await query(
        'SELECT day, closure_type, closed_at FROM course_day_closures WHERE user_id = $1 AND course_id = $2 ORDER BY day',
        [req.userId, e.id]
      );
      items.push({
        type: 'course', id: e.id, title: e.title, description: e.description || '',
        daysCount: e.days_count, avatarIcon: e.avatar_icon, avatarCustom: e.avatar_custom,
        ownerId: e.owner_id, enrollRole: e.role, enrollmentId: e.enrollment_id,
        startDate,
        boundToCalendar: !!e.bound_to_calendar,
        accessDaysAfter: e.access_days_after,
        enrollCount: parseInt(e.enroll_count),
        progressionMode: effectiveMode,
        courseProgressionMode: e.progression_mode || 'daily',
        enrollmentModeOverride: e.progression_mode_override || null,
        closures: closures.map(c => ({ day: c.day, type: c.closure_type, closedAt: c.closed_at })),
        activities: acts.map(a => ({
          id: a.id, activityId: a.activity_id, label: a.label, durationMin: a.duration_min,
          iconNum: a.icon_num || 'health/1', practiceType: a.practice_type || 'media',
          descriptionHtml: a.description_html || null, firstDay: a.first_day || 1,
          lastDay: a.last_day || e.days_count, intervalDays: a.interval_days || 1,
          createdAt: a.created_at,
          excludedDays: a.excluded_days || [], extraDays: a.extra_days || [],
        })),
      });
    }

    // Own courses not enrolled
    const own = await query('SELECT * FROM courses WHERE owner_id = $1', [req.userId]);
    for (const c of own) {
      if (courseIds.has(c.id)) continue;
      const acts = await query('SELECT * FROM course_activities WHERE course_id = $1 ORDER BY sort_order', [c.id]);
      const cnt = await queryOne('SELECT count(*) AS n FROM course_enrollments WHERE course_id = $1', [c.id]);
      const startDate = (c.bound_to_calendar && c.start_date)
        ? toISODate(c.start_date)
        : toISODate(c.created_at);
      items.push({
        type: 'course', id: c.id, title: c.title, description: c.description || '',
        daysCount: c.days_count, avatarIcon: c.avatar_icon, avatarCustom: c.avatar_custom,
        ownerId: c.owner_id, enrollRole: 'trainer', enrollmentId: null,
        startDate,
        boundToCalendar: !!c.bound_to_calendar,
        accessDaysAfter: c.access_days_after,
        enrollCount: parseInt(cnt?.n || 0),
        progressionMode: c.progression_mode || 'daily',
        courseProgressionMode: c.progression_mode || 'daily',
        enrollmentModeOverride: null,
        closures: [],
        activities: acts.map(a => ({
          id: a.id, activityId: a.activity_id, label: a.label, durationMin: a.duration_min,
          iconNum: a.icon_num || 'health/1', practiceType: a.practice_type || 'media',
          descriptionHtml: a.description_html || null, firstDay: a.first_day || 1,
          lastDay: a.last_day || c.days_count, intervalDays: a.interval_days || 1,
          createdAt: a.created_at,
          excludedDays: a.excluded_days || [], extraDays: a.extra_days || [],
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
    // v25: auto-closure для free/self_paced когда день зачтён на 100%.
    // Проверяем только когда только что поставили completed=true (иначе смысла нет).
    if (completed) {
      await maybeAutoCloseDay(req.userId, courseId, day);
    }
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ─── v25: Progression modes ───────────────────────────────────────────────
// Effective mode для (user, course) с учётом enrollment override.
async function getEffectiveMode(userId, courseId) {
  const row = await queryOne(
    `SELECT COALESCE(ce.progression_mode_override, c.progression_mode, 'daily') AS mode
       FROM courses c
       LEFT JOIN course_enrollments ce ON ce.course_id = c.id AND ce.user_id = $1
      WHERE c.id = $2`,
    [userId, courseId]
  );
  return row?.mode || 'daily';
}

// Все дни где практика активна (учитывая first_day/last_day/interval/exclusions).
// Копия isActivityScheduled из frontend, но упрощённая под backend.
function daysWithActivities(activities, day) {
  return activities.filter(a => {
    const fd = a.first_day || 1, ld = a.last_day || fd;
    const iv = Math.max(1, a.interval_days || 1);
    const excl = a.excluded_days || [];
    const extra = a.extra_days || [];
    if (excl.includes(day)) return false;
    if (extra.includes(day)) return true;
    if (day < fd || day > ld) return false;
    return ((day - fd) % iv) === 0;
  });
}

// Если mode ∈ {free, self_paced} и все активности этого дня done — INSERT closure.
async function maybeAutoCloseDay(userId, courseId, day) {
  const mode = await getEffectiveMode(userId, courseId);
  if (mode === 'daily') return;
  // Уже закрыт?
  const existing = await queryOne(
    'SELECT day FROM course_day_closures WHERE user_id=$1 AND course_id=$2 AND day=$3',
    [userId, courseId, day]
  );
  if (existing) return;
  // Все активности этого дня выполнены?
  const acts = await query('SELECT * FROM course_activities WHERE course_id = $1', [courseId]);
  const dayActs = daysWithActivities(acts, day);
  if (dayActs.length === 0) return;
  const progress = await query(
    'SELECT activity_id, completed FROM course_progress WHERE user_id=$1 AND course_id=$2 AND day=$3',
    [userId, courseId, day]
  );
  const doneIds = new Set(progress.filter(p => p.completed).map(p => p.activity_id));
  const allDone = dayActs.every(a => doneIds.has(a.id));
  if (!allDone) return;
  await query(
    `INSERT INTO course_day_closures (user_id, course_id, day, closure_type)
     VALUES ($1, $2, $3, 'auto') ON CONFLICT DO NOTHING`,
    [userId, courseId, day]
  );
}

// POST /courses/:id/close-day — «Завершить день» в self_paced.
// Разрешено только для currentDay (первый не-closed) и если есть хоть какой-то прогресс.
router.post('/courses/:id/close-day', async (req, res) => {
  try {
    const courseId = req.params.id;
    const mode = await getEffectiveMode(req.userId, courseId);
    if (mode !== 'self_paced') return res.status(400).json({ error: 'Только для режима «Свободно»' });
    const course = await queryOne('SELECT days_count FROM courses WHERE id=$1', [courseId]);
    if (!course) return res.status(404).json({ error: 'Курс не найден' });
    const closures = await query(
      'SELECT day FROM course_day_closures WHERE user_id=$1 AND course_id=$2',
      [req.userId, courseId]
    );
    const closedSet = new Set(closures.map(c => c.day));
    let currentDay = 1;
    while (closedSet.has(currentDay) && currentDay <= course.days_count) currentDay++;
    if (currentDay > course.days_count) return res.status(400).json({ error: 'Все дни уже пройдены' });
    // Хоть какой-то прогресс на этом дне?
    const anyProgress = await queryOne(
      'SELECT 1 FROM course_progress WHERE user_id=$1 AND course_id=$2 AND day=$3 AND elapsed_seconds > 0 LIMIT 1',
      [req.userId, courseId, currentDay]
    );
    if (!anyProgress) return res.status(400).json({ error: 'Начните хотя бы одну практику' });
    await query(
      `INSERT INTO course_day_closures (user_id, course_id, day, closure_type)
       VALUES ($1, $2, $3, 'forced') ON CONFLICT DO NOTHING`,
      [req.userId, courseId, currentDay]
    );
    res.json({ ok: true, closedDay: currentDay });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// DELETE /courses/:id/closures/:day — «Пройти день заново» в self_paced.
// Разрешено только для closed past day с partial progress (не 100%).
router.delete('/courses/:id/closures/:day', async (req, res) => {
  try {
    const courseId = req.params.id;
    const day = parseInt(req.params.day);
    if (!Number.isFinite(day) || day < 1) return res.status(400).json({ error: 'Bad day' });
    const mode = await getEffectiveMode(req.userId, courseId);
    if (mode !== 'self_paced') return res.status(400).json({ error: 'Только для режима «Свободно»' });
    // Есть closure?
    const existing = await queryOne(
      'SELECT day FROM course_day_closures WHERE user_id=$1 AND course_id=$2 AND day=$3',
      [req.userId, courseId, day]
    );
    if (!existing) return res.status(404).json({ error: 'День не закрыт' });
    // Проверка: не 100% — иначе кнопка «Пройти заново» не имеет смысла.
    const acts = await query('SELECT * FROM course_activities WHERE course_id=$1', [courseId]);
    const dayActs = daysWithActivities(acts, day);
    const progress = await query(
      'SELECT activity_id, completed FROM course_progress WHERE user_id=$1 AND course_id=$2 AND day=$3',
      [req.userId, courseId, day]
    );
    const doneIds = new Set(progress.filter(p => p.completed).map(p => p.activity_id));
    const allDone = dayActs.length > 0 && dayActs.every(a => doneIds.has(a.id));
    if (allDone) return res.status(400).json({ error: 'День выполнен на 100%, нечего добирать' });
    await query(
      'DELETE FROM course_day_closures WHERE user_id=$1 AND course_id=$2 AND day=$3',
      [req.userId, courseId, day]
    );
    res.json({ ok: true, reopenedDay: day });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// PATCH /trainer/enrollments/:enrollmentId/mode — тренер меняет per-student mode.
// При переключении daily→progressive: закрываем все days < current_day (auto).
// При переключении progressive→daily: user_settings.current_day = calendar day.
router.patch('/trainer/enrollments/:enrollmentId/mode', async (req, res) => {
  try {
    const { mode, startDay } = req.body || {};
    // mode === undefined → не меняем режим (изменение только startDay).
    // mode === null → сбрасываем override (использовать общий курса).
    // mode !== undefined → валидируем.
    if (mode !== undefined && mode !== null && !['daily','free','self_paced'].includes(mode)) {
      return res.status(400).json({ error: 'Bad mode' });
    }
    const enroll = await queryOne('SELECT * FROM course_enrollments WHERE id=$1', [req.params.enrollmentId]);
    if (!enroll) return res.status(404).json({ error: 'Не найден' });
    if (!await isTrainer(req.userId, enroll.course_id)) return res.status(403).json({ error: 'Нет прав' });
    const course = await queryOne('SELECT days_count, bound_to_calendar FROM courses WHERE id=$1', [enroll.course_id]);
    const daysCount = course?.days_count || 30;
    if (mode !== undefined) {
      await query('UPDATE course_enrollments SET progression_mode_override=$1 WHERE id=$2',
        [mode, req.params.enrollmentId]);
    }
    const newEffective = await getEffectiveMode(enroll.user_id, enroll.course_id);

    // Тренер указал явный startDay — перезаписываем состояние ученика так,
    // чтобы его currentDay стал = startDay.
    let sd = null;
    if (startDay !== undefined && startDay !== null && startDay !== '') {
      sd = Math.max(1, Math.min(parseInt(startDay) || 1, daysCount));
    }

    // Если тренер поставил режим free/self_paced БЕЗ явного startDay, но
    // раньше был daily — автоматически берём calendar_day этого enrollment
    // (для bound_to_calendar от course.start_date, иначе от enrollment.joined_at).
    if (sd === null && mode !== undefined && (newEffective === 'free' || newEffective === 'self_paced')) {
      const c2 = await queryOne(
        `SELECT c.start_date, c.bound_to_calendar, ce.joined_at
           FROM courses c JOIN course_enrollments ce ON ce.course_id = c.id
          WHERE ce.id = $1`,
        [req.params.enrollmentId]
      );
      let startISO = c2?.bound_to_calendar && c2.start_date ? c2.start_date : c2.joined_at;
      if (startISO) {
        const startDay = new Date(startISO);
        const today = new Date();
        const diffDays = Math.floor((today - startDay) / (24 * 60 * 60 * 1000));
        sd = Math.max(1, Math.min(diffDays + 1, daysCount));
      }
    }

    if (sd !== null && (newEffective === 'free' || newEffective === 'self_paced')) {
      // Полностью пересобираем closures: чистим все и вставляем 1..sd-1.
      await query('DELETE FROM course_day_closures WHERE user_id=$1 AND course_id=$2',
        [enroll.user_id, enroll.course_id]);
      for (let d = 1; d < sd; d++) {
        await query(
          `INSERT INTO course_day_closures (user_id, course_id, day, closure_type)
           VALUES ($1,$2,$3,'auto')`,
          [enroll.user_id, enroll.course_id, d]
        );
      }
    } else if (sd !== null && newEffective === 'daily') {
      // Для daily надо, чтобы клиент вычислил currentDay = sd. Это работает
      // через сдвиг «даты старта для этого ученика». Для bound-курса стартовая
      // дата общая (courses.start_date), сдвинуть её нельзя — вернём warning.
      if (course.bound_to_calendar) {
        return res.status(400).json({
          error: 'Курс привязан к общей дате начала — сместить день индивидуально в daily-режиме нельзя. Уберите привязку или используйте прогрессивный режим.'
        });
      }
      // enrollment.joined_at = today - (sd - 1) дней. Клиент вычислит день
      // как (today - joined_at) + 1 = sd.
      await query(
        `UPDATE course_enrollments SET joined_at = NOW() - INTERVAL '1 day' * ($1 - 1) WHERE id=$2`,
        [sd, req.params.enrollmentId]
      );
      // Также очищаем closures (в daily режиме они не используются).
      await query('DELETE FROM course_day_closures WHERE user_id=$1 AND course_id=$2',
        [enroll.user_id, enroll.course_id]);
    }
    res.json({ ok: true, effectiveMode: newEffective });
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
    // A-1: caller must already be admin. Without this any registered user
    // could promote themselves by POSTing { email: own_email, role: 'admin' }.
    const caller = await queryOne('SELECT role FROM user_roles WHERE user_id = $1', [req.userId]);
    if (caller?.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Только администратор может назначать роли' });
    }
    const { email, role } = req.body;
    if (!['student', 'curator', 'trainer', 'admin'].includes(role)) {
      return res.status(400).json({ success: false, error: 'Invalid role' });
    }
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
    const {
      title, description, avatarIcon, avatarCustom, daysCount, activities,
      boundToCalendar, startDate, accessDaysAfter,
    } = req.body;
    // start_date is meaningful only when bound_to_calendar=TRUE; we still
    // store it if provided so toggling the checkbox later doesn't lose the date.
    const course = await queryOne(
      `INSERT INTO courses
         (owner_id, title, description, days_count, avatar_icon, avatar_custom,
          bound_to_calendar, start_date, access_days_after)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.userId, title, description || '', daysCount,
       avatarIcon || null, avatarCustom || null,
       !!boundToCalendar,
       startDate || null,
       (typeof accessDaysAfter === 'number' && accessDaysAfter >= 0) ? accessDaysAfter : null]
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
    // A-3: only the owner or someone enrolled in the course may read it.
    // (Otherwise any authenticated user could harvest course content by UUID.)
    if (course.owner_id !== req.userId) {
      const enroll = await queryOne(
        'SELECT 1 FROM course_enrollments WHERE course_id = $1 AND user_id = $2',
        [req.params.id, req.userId]
      );
      if (!enroll) return res.status(403).json({ error: 'Нет доступа' });
    }
    const acts = await query('SELECT * FROM course_activities WHERE course_id = $1 ORDER BY sort_order', [req.params.id]);
    res.json({ ...course, course_activities: acts });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.put('/courses/:id', async (req, res) => {
  try {
    // A-2: only the owner may write the course definition. Without this
    // any authenticated user could clobber a course they know the UUID of.
    const owner = await queryOne('SELECT owner_id FROM courses WHERE id = $1', [req.params.id]);
    if (!owner) return res.status(404).json({ error: 'Курс не найден' });
    if (owner.owner_id !== req.userId) return res.status(403).json({ error: 'Нет прав' });
    const { title, description, avatarIcon, avatarCustom, daysCount, activities, deletedActivityIds } = req.body;
    await query(
      'UPDATE courses SET title=$1, description=$2, days_count=$3, avatar_icon=$4, avatar_custom=$5, updated_at=NOW() WHERE id=$6',
      [title, description || '', daysCount, avatarIcon || null, avatarCustom || null, req.params.id]
    );

    if (deletedActivityIds?.length) {
      // Cascade: drop activity_media rows + their files on disk for each removed activity.
      // course_activities is keyed by UUID; activity_media.activity_id is TEXT but stores
      // that same UUID, so the IN-list works.
      const { deleteVideoFile, deleteActivityDir } = await import('../storage.js');
      const orphaned = await query(
        `SELECT id, source_type, media_url FROM activity_media
         WHERE course_id = $1 AND activity_id = ANY($2)`,
        [req.params.id, deletedActivityIds]
      );
      for (const v of orphaned) {
        if (v.source_type === 'file') await deleteVideoFile(v.media_url);
      }
      await query(
        `DELETE FROM activity_media WHERE course_id = $1 AND activity_id = ANY($2)`,
        [req.params.id, deletedActivityIds]
      );
      // Wipe the per-activity dir to clean any stale partial-upload leftovers too.
      for (const aid of deletedActivityIds) await deleteActivityDir(req.params.id, aid);
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

// ─── Auto-save endpoints ───────────────────────────────────────────────────
// Granular PATCH/POST/DELETE for course meta, activities. Replace the old
// monolithic PUT /courses/:id "save everything" flow so the editor can
// debounce-save individual fields as the user types — no more "click Save
// before adding video" walls.

// PATCH /courses/:id/meta — title, description, daysCount, avatar.
// Idempotent; sends only fields that changed (others left alone).
router.patch('/courses/:id/meta', async (req, res) => {
  try {
    const courseId = req.params.id;
    const course = await queryOne('SELECT owner_id FROM courses WHERE id = $1', [courseId]);
    if (!course) return res.status(404).json({ error: 'Курс не найден' });
    if (course.owner_id !== req.userId) return res.status(403).json({ error: 'Нет прав' });

    const {
      title, description, daysCount, avatarIcon, avatarCustom,
      boundToCalendar, startDate, accessDaysAfter,
      progressionMode,
    } = req.body || {};
    // v25: смена «категории» (daily ↔ progressive) блокируется если есть
    // enrollments >0 не-owner ролей (тренер не считается). Между free ↔
    // self_paced можно всегда.
    if (progressionMode !== undefined && ['daily', 'free', 'self_paced'].includes(progressionMode)) {
      const cur = await queryOne('SELECT progression_mode FROM courses WHERE id=$1', [courseId]);
      const wasDaily = cur?.progression_mode === 'daily';
      const willDaily = progressionMode === 'daily';
      if (wasDaily !== willDaily) {
        // Смена категории
        const cnt = await queryOne(
          "SELECT count(*) AS n FROM course_enrollments WHERE course_id=$1 AND role='student'",
          [courseId]
        );
        if (parseInt(cnt?.n || 0) > 0) {
          return res.status(409).json({
            error: `В курсе ${cnt.n} учеников. Сначала переведите их индивидуально или удалите — только потом можно сменить глобальный режим.`,
          });
        }
      }
    }
    const sets = [];
    const params = [];
    let i = 1;
    if (typeof title === 'string') { sets.push(`title=$${i++}`); params.push(title); }
    if (typeof description === 'string') { sets.push(`description=$${i++}`); params.push(description); }
    if (typeof daysCount === 'number' && daysCount >= 1) {
      sets.push(`days_count=$${i++}`); params.push(Math.min(daysCount, 365));
    }
    // Avatar can be set OR cleared. avatarIcon and avatarCustom are mutually exclusive.
    if (avatarCustom !== undefined) {
      sets.push(`avatar_custom=$${i++}`); params.push(avatarCustom || null);
      if (avatarCustom) { sets.push(`avatar_icon=$${i++}`); params.push(null); }
    }
    if (avatarIcon !== undefined && !avatarCustom) {
      sets.push(`avatar_icon=$${i++}`); params.push(avatarIcon || null);
    }
    // v22 calendar binding + access window. Optional, may arrive separately.
    if (boundToCalendar !== undefined) {
      sets.push(`bound_to_calendar=$${i++}`); params.push(!!boundToCalendar);
    }
    if (startDate !== undefined) {
      // empty string / null -> clear date
      sets.push(`start_date=$${i++}`); params.push(startDate || null);
    }
    if (accessDaysAfter !== undefined) {
      const n = (accessDaysAfter === null || accessDaysAfter === '')
        ? null : Math.max(0, parseInt(accessDaysAfter));
      sets.push(`access_days_after=$${i++}`); params.push(Number.isFinite(n) ? n : null);
    }
    if (progressionMode !== undefined && ['daily', 'free', 'self_paced'].includes(progressionMode)) {
      sets.push(`progression_mode=$${i++}`); params.push(progressionMode);
    }
    if (sets.length === 0) return res.json({ ok: true });
    sets.push(`updated_at=NOW()`);
    params.push(courseId);
    await query(`UPDATE courses SET ${sets.join(', ')} WHERE id=$${i}`, params);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// POST /courses/:id/activities — create one activity, return the row so the
// editor can immediately attach videos / schedule calls.
router.post('/courses/:id/activities', async (req, res) => {
  try {
    const courseId = req.params.id;
    if (!await isTrainer(req.userId, courseId)) return res.status(403).json({ error: 'Нет прав' });

    const { label, iconNum, practiceType, descriptionHtml, firstDay, lastDay, durationMin, intervalDays, sortOrder } = req.body || {};
    const days = await queryOne('SELECT days_count FROM courses WHERE id = $1', [courseId]);
    const daysCount = days?.days_count || 30;
    const pt = ['media', 'theory', 'call'].includes(practiceType) ? practiceType : 'media';
    const fd = Math.max(1, Math.min(parseInt(firstDay) || 1, daysCount));
    const ld = Math.max(fd, Math.min(parseInt(lastDay) || daysCount, daysCount));
    const dur = Math.max(1, Math.min(parseInt(durationMin) || 10, 1200));
    const iv = Math.max(1, parseInt(intervalDays) || 1);
    const so = parseInt(sortOrder);
    let resolvedSortOrder;
    if (Number.isFinite(so)) {
      resolvedSortOrder = so;
    } else {
      const lastRow = await queryOne('SELECT COALESCE(MAX(sort_order), -1) AS m FROM course_activities WHERE course_id = $1', [courseId]);
      resolvedSortOrder = parseInt(lastRow?.m ?? -1) + 1;
    }
    const activityKey = `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const row = await queryOne(
      `INSERT INTO course_activities
         (course_id, activity_id, label, duration_min, icon_num, practice_type,
          description_html, first_day, last_day, sort_order, interval_days)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [courseId, activityKey, label || '', dur, iconNum || 'health/1', pt,
       descriptionHtml || null, fd, ld, resolvedSortOrder, iv]
    );
    res.json({ data: row });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// PATCH /activities/:id — update any subset of activity fields. Server clamps
// to valid ranges so the client can send intermediate states (e.g., empty
// firstDay during typing) without breaking the row.
router.patch('/activities/:id', async (req, res) => {
  try {
    const act = await queryOne('SELECT * FROM course_activities WHERE id = $1', [req.params.id]);
    if (!act) return res.status(404).json({ error: 'Активность не найдена' });
    if (!await isTrainer(req.userId, act.course_id)) return res.status(403).json({ error: 'Нет прав' });
    const days = await queryOne('SELECT days_count FROM courses WHERE id = $1', [act.course_id]);
    const daysCount = days?.days_count || 30;

    const { label, iconNum, practiceType, descriptionHtml, firstDay, lastDay, durationMin, intervalDays, sortOrder, excludedDays, extraDays, libraryPracticeId } = req.body || {};
    const sets = [];
    const params = [];
    let i = 1;

    if (typeof label === 'string') { sets.push(`label=$${i++}`); params.push(label); }
    if (typeof iconNum === 'string' && iconNum) { sets.push(`icon_num=$${i++}`); params.push(iconNum); }
    if (typeof practiceType === 'string' && ['media', 'theory', 'call'].includes(practiceType)) {
      sets.push(`practice_type=$${i++}`); params.push(practiceType);
    }
    if (descriptionHtml !== undefined) {
      sets.push(`description_html=$${i++}`); params.push(descriptionHtml || null);
    }
    if (firstDay !== undefined && firstDay !== null && firstDay !== '') {
      const n = Math.max(1, Math.min(parseInt(firstDay) || 1, daysCount));
      sets.push(`first_day=$${i++}`); params.push(n);
    }
    if (lastDay !== undefined && lastDay !== null && lastDay !== '') {
      const n = Math.max(1, Math.min(parseInt(lastDay) || daysCount, daysCount));
      sets.push(`last_day=$${i++}`); params.push(n);
    }
    if (durationMin !== undefined && durationMin !== null && durationMin !== '') {
      const n = Math.max(1, Math.min(parseInt(durationMin) || 10, 1200));
      sets.push(`duration_min=$${i++}`); params.push(n);
    }
    if (intervalDays !== undefined && intervalDays !== null && intervalDays !== '') {
      const n = Math.max(1, parseInt(intervalDays) || 1);
      sets.push(`interval_days=$${i++}`); params.push(n);
    }
    if (sortOrder !== undefined && sortOrder !== null && sortOrder !== '') {
      sets.push(`sort_order=$${i++}`); params.push(parseInt(sortOrder) || 0);
    }
    // Sanitize day-override arrays: ints only, dedup, sort, clamp to [1, daysCount].
    const sanitizeDays = (arr) => Array.from(new Set(
      (Array.isArray(arr) ? arr : [])
        .map(x => parseInt(x))
        .filter(n => Number.isFinite(n) && n >= 1 && n <= daysCount)
    )).sort((a, b) => a - b);
    if (Array.isArray(excludedDays)) {
      sets.push(`excluded_days=$${i++}`); params.push(sanitizeDays(excludedDays));
    }
    if (Array.isArray(extraDays)) {
      sets.push(`extra_days=$${i++}`); params.push(sanitizeDays(extraDays));
    }
    // v27: явное значение libraryPracticeId (null для отвязки, uuid для привязки).
    if (libraryPracticeId !== undefined) {
      sets.push(`library_practice_id=$${i++}`);
      params.push(libraryPracticeId || null);
    }
    if (sets.length === 0) return res.json({ ok: true });
    params.push(req.params.id);
    await query(`UPDATE course_activities SET ${sets.join(', ')} WHERE id=$${i}`, params);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// DELETE /activities/:id — remove the activity, its videos rows + files,
// and any progress/exclusions for it.
router.delete('/activities/:id', async (req, res) => {
  try {
    const act = await queryOne('SELECT * FROM course_activities WHERE id = $1', [req.params.id]);
    if (!act) return res.json({ deleted: true }); // already gone
    if (!await isTrainer(req.userId, act.course_id)) return res.status(403).json({ error: 'Нет прав' });

    const { deleteVideoFile, deleteActivityDir } = await import('../storage.js');
    const orphaned = await query(
      `SELECT id, source_type, media_url FROM activity_media WHERE activity_id = $1`,
      [req.params.id]
    );
    for (const v of orphaned) {
      if (v.source_type === 'file') await deleteVideoFile(v.media_url);
    }
    await query(`DELETE FROM activity_media WHERE activity_id = $1`, [req.params.id]);
    await deleteActivityDir(act.course_id, req.params.id);
    await query('DELETE FROM course_activities WHERE id = $1', [req.params.id]);
    res.json({ deleted: true });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.delete('/courses/:id', async (req, res) => {
  try {
    const course = await queryOne('SELECT owner_id FROM courses WHERE id = $1', [req.params.id]);
    if (!course || course.owner_id !== req.userId) return res.json({ deleted: false, error: 'Нет прав' });
    // DB rows in activity_media cascade via FK; we just need to wipe the disk dir.
    const { deleteCourseDir } = await import('../storage.js');
    await query('DELETE FROM courses WHERE id = $1', [req.params.id]);
    await deleteCourseDir(req.params.id);
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
    const user = await queryOne('SELECT email FROM users WHERE id = $1', [req.userId]);
    if (!user || inv.email !== user.email) return res.json({ success: false, error: 'Нет прав' });

    await query(
      'INSERT INTO course_enrollments (course_id, user_id, role, invited_by) VALUES ($1,$2,$3,$4) ON CONFLICT (course_id, user_id) DO NOTHING',
      [inv.course_id, req.userId, inv.role, inv.invited_by]
    );
    await query('DELETE FROM pending_invitations WHERE id = $1', [req.params.id]);
    res.json({ success: true, course_id: inv.course_id });
  } catch (err) { console.error(err); res.json({ success: false, error: err.message }); }
});

router.post('/invitations/:id/decline', async (req, res) => {
  try {
    const inv = await queryOne('SELECT * FROM pending_invitations WHERE id = $1', [req.params.id]);
    if (!inv) return res.json({ success: true });
    const user = await queryOne('SELECT email FROM users WHERE id = $1', [req.userId]);
    if (!user || inv.email !== user.email) return res.json({ success: false, error: 'Нет прав' });
    await query('DELETE FROM pending_invitations WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// MESSAGES
// ═══════════════════════════════════════════════════════════

router.post('/messages/send', messageLimiter, async (req, res) => {
  try {
    const { courseId, recipientId, body } = req.body;
    if (!body || body.length > 500) return res.json({ success: false, error: 'Сообщение от 1 до 500 символов' });
    // A-4: both sender and recipient must belong to the course (owner counts).
    // Prevents anyone with a JWT from injecting messages into arbitrary courses.
    const c = await queryOne('SELECT owner_id FROM courses WHERE id = $1', [courseId]);
    if (!c) return res.status(404).json({ success: false, error: 'Курс не найден' });
    const isMember = async (uid) => {
      if (uid === c.owner_id) return true;
      const e = await queryOne(
        'SELECT 1 FROM course_enrollments WHERE course_id = $1 AND user_id = $2',
        [courseId, uid]
      );
      return !!e;
    };
    if (!(await isMember(req.userId)) || !(await isMember(recipientId))) {
      return res.status(403).json({ success: false, error: 'Нет доступа к курсу' });
    }
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
    // A-4 (read): same gate as send — caller must belong to the course.
    const c = await queryOne('SELECT owner_id FROM courses WHERE id = $1', [courseId]);
    if (!c) return res.status(404).json([]);
    if (c.owner_id !== req.userId) {
      const enroll = await queryOne(
        'SELECT 1 FROM course_enrollments WHERE course_id = $1 AND user_id = $2',
        [courseId, req.userId]
      );
      if (!enroll) return res.status(403).json([]);
    }
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
    // A-3: trackers are personal, only the owner reads.
    if (t.user_id !== req.userId) return res.status(403).json({ error: 'Нет доступа' });
    t.tracker_practices = await query('SELECT * FROM tracker_practices WHERE tracker_id = $1 ORDER BY sort_order', [t.id]);
    res.json(t);
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

router.put('/trackers/:id', async (req, res) => {
  try {
    // A-2: ownership check before any write.
    const owner = await queryOne('SELECT user_id FROM personal_trackers WHERE id = $1', [req.params.id]);
    if (!owner) return res.status(404).json({ error: 'Трекер не найден' });
    if (owner.user_id !== req.userId) return res.status(403).json({ error: 'Нет прав' });
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

// ═══════════════════════════════════════════════════════════
// PRACTICE LIBRARY (v27) — переиспользуемые шаблоны активностей
// ═══════════════════════════════════════════════════════════

// GET /library — все практики текущего юзера + media (для отображения иконок).
router.get('/library', async (req, res) => {
  try {
    const rows = await query(
      `SELECT * FROM practice_library WHERE owner_id = $1 ORDER BY updated_at DESC`,
      [req.userId]
    );
    const ids = rows.map(r => r.id);
    let mediaByPractice = {};
    if (ids.length) {
      const media = await query(
        `SELECT id, practice_id, media_type, source_type, media_url, duration_sec
           FROM practice_library_media
          WHERE practice_id = ANY($1) ORDER BY sort_order`,
        [ids]
      );
      for (const m of media) {
        (mediaByPractice[m.practice_id] ||= []).push(m);
      }
    }
    res.json(rows.map(p => ({ ...p, media: mediaByPractice[p.id] || [] })));
  } catch (err) { console.error('[Library] GET:', err); res.status(500).json({ error: err.message }); }
});

// POST /library — сохранить активность как шаблон в лист.
// body: { activityId } — снимок берётся с course_activities по id.
// Возвращает созданную запись; клиент запишет её id в activity.library_practice_id.
router.post('/library', async (req, res) => {
  try {
    const { activityId } = req.body || {};
    if (!activityId) return res.status(400).json({ error: 'activityId обязателен' });
    const act = await queryOne('SELECT * FROM course_activities WHERE id = $1', [activityId]);
    if (!act) return res.status(404).json({ error: 'Активность не найдена' });
    if (!await isTrainer(req.userId, act.course_id)) return res.status(403).json({ error: 'Нет прав' });

    // Создаём запись + копируем все медиа. Всё в одной transactionn'ой цепочке
    // через try/catch — простая версия, без явного BEGIN.
    const created = await queryOne(
      `INSERT INTO practice_library
         (owner_id, label, icon_num, practice_type, description_html,
          duration_min, first_day, last_day, interval_days,
          excluded_days, extra_days)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.userId, act.label || '', act.icon_num || 'health/1', act.practice_type || 'media',
       act.description_html, act.duration_min, act.first_day || 1, act.last_day || 30,
       act.interval_days || 1, act.excluded_days || [], act.extra_days || []]
    );
    // NB: activity_media.activity_id — TEXT, но хранит UUID row course_activities
    // (клиент пишет туда a.dbId = row.id, не текстовый ключ activity_id).
    const media = await query(
      `SELECT * FROM activity_media WHERE course_id = $1 AND activity_id = $2 ORDER BY sort_order`,
      [act.course_id, act.id]
    );
    for (const m of media) {
      await query(
        `INSERT INTO practice_library_media
           (practice_id, media_type, source_type, media_url, text_content, description_html,
            file_size, duration_sec, first_day, last_day, interval_days,
            excluded_days, extra_days, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [created.id, m.media_type, m.source_type, m.media_url, m.text_content, m.description_html,
         m.file_size, m.duration_sec, m.first_day, m.last_day, m.interval_days,
         m.excluded_days || [], m.extra_days || [], m.sort_order || 0]
      );
    }
    // Сразу связываем activity → library
    await query('UPDATE course_activities SET library_practice_id = $1 WHERE id = $2', [created.id, activityId]);
    res.json({ data: created });
  } catch (err) { console.error('[Library] POST:', err); res.status(500).json({ error: err.message }); }
});

// PATCH /library/:id — обновить снимок из активности («Обновить в листе»).
// body: { activityId } — берём свежее состояние активности и её media.
router.patch('/library/:id', async (req, res) => {
  try {
    const { activityId } = req.body || {};
    if (!activityId) return res.status(400).json({ error: 'activityId обязателен' });
    const lib = await queryOne('SELECT * FROM practice_library WHERE id = $1', [req.params.id]);
    if (!lib) return res.status(404).json({ error: 'Запись листа не найдена' });
    if (lib.owner_id !== req.userId) return res.status(403).json({ error: 'Нет прав' });
    const act = await queryOne('SELECT * FROM course_activities WHERE id = $1', [activityId]);
    if (!act) return res.status(404).json({ error: 'Активность не найдена' });
    if (!await isTrainer(req.userId, act.course_id)) return res.status(403).json({ error: 'Нет прав на курс' });

    await query(
      `UPDATE practice_library SET
         label=$1, icon_num=$2, practice_type=$3, description_html=$4,
         duration_min=$5, first_day=$6, last_day=$7, interval_days=$8,
         excluded_days=$9, extra_days=$10, updated_at=NOW()
       WHERE id=$11`,
      [act.label, act.icon_num, act.practice_type, act.description_html,
       act.duration_min, act.first_day, act.last_day, act.interval_days,
       act.excluded_days || [], act.extra_days || [], lib.id]
    );
    // Полностью пересобираем медиа: DELETE + INSERT из свежего snapshot.
    await query('DELETE FROM practice_library_media WHERE practice_id = $1', [lib.id]);
    // NB: activity_media.activity_id — TEXT, но хранит UUID row course_activities
    // (клиент пишет туда a.dbId = row.id, не текстовый ключ activity_id).
    const media = await query(
      `SELECT * FROM activity_media WHERE course_id = $1 AND activity_id = $2 ORDER BY sort_order`,
      [act.course_id, act.id]
    );
    for (const m of media) {
      await query(
        `INSERT INTO practice_library_media
           (practice_id, media_type, source_type, media_url, text_content, description_html,
            file_size, duration_sec, first_day, last_day, interval_days,
            excluded_days, extra_days, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [lib.id, m.media_type, m.source_type, m.media_url, m.text_content, m.description_html,
         m.file_size, m.duration_sec, m.first_day, m.last_day, m.interval_days,
         m.excluded_days || [], m.extra_days || [], m.sort_order || 0]
      );
    }
    res.json({ ok: true });
  } catch (err) { console.error('[Library] PATCH:', err); res.status(500).json({ error: err.message }); }
});

// DELETE /library/:id — окончательное удаление шаблона из листа.
// course_activities.library_practice_id ставится в NULL через FK ON DELETE SET NULL.
router.delete('/library/:id', async (req, res) => {
  try {
    const lib = await queryOne('SELECT owner_id FROM practice_library WHERE id = $1', [req.params.id]);
    if (!lib) return res.status(404).json({ error: 'Не найдено' });
    if (lib.owner_id !== req.userId) return res.status(403).json({ error: 'Нет прав' });
    await query('DELETE FROM practice_library WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { console.error('[Library] DELETE:', err); res.status(500).json({ error: err.message }); }
});

// POST /courses/:courseId/activities/from-library — batch копирование из листа.
// body: { libraryIds: [id, id, ...] }. Каждая практика копируется вместе с медиа,
// расписание clamp'ится под days_count курса. Возвращает список созданных activities.
router.post('/courses/:courseId/activities/from-library', async (req, res) => {
  try {
    const { courseId } = req.params;
    const { libraryIds } = req.body || {};
    if (!Array.isArray(libraryIds) || libraryIds.length === 0) {
      return res.status(400).json({ error: 'libraryIds обязательны' });
    }
    if (!await isTrainer(req.userId, courseId)) return res.status(403).json({ error: 'Нет прав' });
    const days = await queryOne('SELECT days_count FROM courses WHERE id = $1', [courseId]);
    const daysCount = days?.days_count || 30;
    const clampDay = (d) => Math.max(1, Math.min(parseInt(d) || 1, daysCount));
    const clampDays = (arr) => (arr || []).map(d => parseInt(d)).filter(d => d >= 1 && d <= daysCount);

    const lastRow = await queryOne('SELECT COALESCE(MAX(sort_order), -1) AS m FROM course_activities WHERE course_id = $1', [courseId]);
    let nextSort = parseInt(lastRow?.m ?? -1) + 1;

    const created = [];
    for (const libId of libraryIds) {
      const lib = await queryOne('SELECT * FROM practice_library WHERE id = $1 AND owner_id = $2', [libId, req.userId]);
      if (!lib) continue;
      const activityKey = `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const row = await queryOne(
        `INSERT INTO course_activities
           (course_id, activity_id, label, duration_min, icon_num, practice_type,
            description_html, first_day, last_day, interval_days, sort_order,
            excluded_days, extra_days, library_practice_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
        [courseId, activityKey, lib.label, lib.duration_min, lib.icon_num, lib.practice_type,
         lib.description_html, clampDay(lib.first_day), clampDay(lib.last_day),
         lib.interval_days || 1, nextSort++, clampDays(lib.excluded_days),
         clampDays(lib.extra_days), lib.id]
      );
      // Копируем media. NB: activity_media.activity_id — TEXT, но клиент
      // читает медиа по row.id (UUID), не по текстовому ключу.
      const libMedia = await query(
        'SELECT * FROM practice_library_media WHERE practice_id = $1 ORDER BY sort_order',
        [lib.id]
      );
      for (const m of libMedia) {
        await query(
          `INSERT INTO activity_media
             (course_id, activity_id, media_type, source_type, media_url, text_content, description_html,
              file_size, duration_sec, first_day, last_day, interval_days,
              excluded_days, extra_days, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [courseId, row.id, m.media_type, m.source_type, m.media_url,
           m.text_content, m.description_html, m.file_size, m.duration_sec,
           clampDay(m.first_day), clampDay(m.last_day), m.interval_days || 1,
           clampDays(m.excluded_days), clampDays(m.extra_days), m.sort_order || 0]
        );
      }
      created.push(row);
    }
    res.json({ data: created, count: created.length });
  } catch (err) { console.error('[Library] copy-to-course:', err); res.status(500).json({ error: err.message }); }
});

router.get('/trainer/students/:courseId', async (req, res) => {
  try {
    if (!await isTrainer(req.userId, req.params.courseId)) return res.status(403).json([]);
    const rows = await query(
      `SELECT ce.id AS enrollment_id, u.id AS user_id, u.email, u.display_name, ce.role, ce.paused, ce.joined_at,
              ce.progression_mode_override,
              c.progression_mode AS course_progression_mode,
              (c.owner_id = u.id) AS is_owner,
              (SELECT COUNT(*) FROM course_day_closures WHERE user_id=u.id AND course_id=c.id) AS closed_days
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
    const {
      courseId, userId, label, iconNum, durationMin, firstDay, lastDay, intervalDays,
      practiceType, descriptionHtml,
    } = req.body;
    if (!await isTrainer(req.userId, courseId)) return res.json({ success: false, error: 'Нет прав' });
    const pt = ['media', 'theory', 'call'].includes(practiceType) ? practiceType : 'media';
    const act = await queryOne(
      `INSERT INTO student_custom_activities (course_id, user_id, label, icon_num, duration_min, first_day, last_day, interval_days, practice_type, description_html)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, created_at`,
      [courseId, userId, label, iconNum, durationMin, firstDay, lastDay, intervalDays || 1, pt, descriptionHtml || null]
    );
    res.json({ success: true, id: act.id, createdAt: act.created_at });
  } catch (err) { res.json({ success: false, error: err.message }); }
});

// Trainer marks/unmarks completion on past or current day. Looks up activity
// duration to set elapsed_seconds when toggling on (so progress bars look right).
router.post('/trainer/toggle-completion', async (req, res) => {
  try {
    const { courseId, userId, activityId, day, completed } = req.body;
    if (!await isTrainer(req.userId, courseId)) return res.json({ success: false, error: 'Нет прав' });

    const existing = await queryOne(
      'SELECT completed, elapsed_seconds FROM course_progress WHERE user_id = $1 AND course_id = $2 AND activity_id = $3 AND day = $4',
      [userId, courseId, activityId, day]
    );
    const newCompleted = typeof completed === 'boolean' ? completed : !existing?.completed;

    let elapsed = existing?.elapsed_seconds || 0;
    if (newCompleted) {
      let dur = null;
      const courseAct = await queryOne('SELECT duration_min FROM course_activities WHERE id = $1', [activityId]);
      if (courseAct) dur = courseAct.duration_min;
      else {
        const customAct = await queryOne('SELECT duration_min FROM student_custom_activities WHERE id = $1', [activityId]);
        if (customAct) dur = customAct.duration_min;
      }
      if (dur && elapsed < dur * 60) elapsed = dur * 60;
    } else {
      // Un-marking completion → reset elapsed too. Otherwise the student
      // still sees the timer at 00:00 (because elapsed == full duration
      // from when it was marked done) and the practice looks completed.
      elapsed = 0;
    }

    await query(
      `INSERT INTO course_progress (user_id, course_id, activity_id, day, elapsed_seconds, completed, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (user_id, course_id, activity_id, day)
       DO UPDATE SET completed = $6, elapsed_seconds = $5, updated_at = NOW()`,
      [userId, courseId, activityId, day, elapsed, newCompleted]
    );

    res.json({ success: true, completed: newCompleted, elapsed });
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
      `SELECT id, user_id, label, icon_num, duration_min, first_day, last_day, interval_days,
              practice_type, description_html, created_at
       FROM student_custom_activities WHERE course_id = $1 ORDER BY created_at`,
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
      practiceType: a.practice_type || 'media',
      descriptionHtml: a.description_html || null,
      createdAt: a.created_at,
    })));
  } catch (err) { res.json([]); }
});

// ═══════════════════════════════════════════════════════════
// ACTIVITY VIDEOS
// ═══════════════════════════════════════════════════════════

router.get('/media/:courseId', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM activity_media WHERE course_id = $1 ORDER BY sort_order', [req.params.courseId]);
    res.json(rows);
  } catch (err) { res.json([]); }
});

// Trainer-only: update an activity's duration_min. Used after a video is added
// to auto-sync practice length with the actual video runtime.
router.patch('/activities/:id/duration', async (req, res) => {
  try {
    const dur = parseInt(req.body?.durationMin);
    if (isNaN(dur) || dur < 1 || dur > 1200) return res.status(400).json({ error: 'Invalid duration' });
    const act = await queryOne('SELECT course_id FROM course_activities WHERE id = $1', [req.params.id]);
    if (!act) return res.status(404).json({ error: 'Not found' });
    if (!await isTrainer(req.userId, act.course_id)) return res.status(403).json({ error: 'Нет прав' });
    await query('UPDATE course_activities SET duration_min = $1 WHERE id = $2', [dur, req.params.id]);
    res.json({ ok: true, durationMin: dur });
  } catch (err) { console.error(err); res.json({ error: err.message }); }
});

router.post('/media/link', async (req, res) => {
  try {
    const { courseId, activityId, url, sourceType, mediaType, firstDay, lastDay, intervalDays } = req.body;
    if (!await isTrainer(req.userId, courseId)) return res.status(403).json({ error: 'Нет прав' });
    const iv = Math.max(1, parseInt(intervalDays) || 1);
    const mt = mediaType && ['video','audio','image','text','none'].includes(mediaType) ? mediaType : 'video';
    const v = await queryOne(
      `INSERT INTO activity_media (course_id, activity_id, media_type, source_type, media_url, first_day, last_day, interval_days)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [courseId, activityId, mt, sourceType, url, firstDay, lastDay, iv]
    );
    res.json({ data: v });
  } catch (err) { console.error(err); res.json({ error: err.message }); }
});

// Пустое медиа для text/none — без файла/ссылки. text_content опциональный.
router.post('/media/empty', async (req, res) => {
  try {
    const { courseId, activityId, mediaType, textContent, firstDay, lastDay, intervalDays } = req.body;
    if (!await isTrainer(req.userId, courseId)) return res.status(403).json({ error: 'Нет прав' });
    const iv = Math.max(1, parseInt(intervalDays) || 1);
    const mt = mediaType && ['video','audio','image','text','none'].includes(mediaType) ? mediaType : 'text';
    const st = mt === 'text' ? 'text' : 'none';
    const v = await queryOne(
      `INSERT INTO activity_media (course_id, activity_id, media_type, source_type, media_url, text_content, first_day, last_day, interval_days)
       VALUES ($1,$2,$3,$4,'',$5,$6,$7,$8) RETURNING *`,
      [courseId, activityId, mt, st, textContent || null, firstDay, lastDay, iv]
    );
    res.json({ data: v });
  } catch (err) { console.error(err); res.json({ error: err.message }); }
});

router.delete('/media/:id', async (req, res) => {
  try {
    const v = await queryOne('SELECT * FROM activity_media WHERE id = $1', [req.params.id]);
    if (!v) return res.json({ error: 'Not found' });
    if (!await isTrainer(req.userId, v.course_id)) return res.status(403).json({ error: 'Нет прав' });
    if (v.source_type === 'file') {
      const { deleteVideoFile } = await import('../storage.js');
      await deleteVideoFile(v.media_url);
    }
    await query('DELETE FROM activity_media WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.json({ error: err.message }); }
});

router.patch('/media/:id/duration', async (req, res) => {
  try {
    const { durationSec } = req.body;
    const v = await queryOne('SELECT course_id FROM activity_media WHERE id = $1', [req.params.id]);
    if (!v) return res.json({ ok: false });
    if (!await isTrainer(req.userId, v.course_id)) return res.status(403).json({ ok: false });
    await query('UPDATE activity_media SET duration_sec = $1 WHERE id = $2', [durationSec, req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.json({ ok: false }); }
});

// PATCH /videos/:id — update editable scheduling fields on a video row.
// Currently used by the per-video day-calendar to write back excluded_days /
// extra_days when trainer taps days. Field whitelist + per-row clamp keeps
// the surface narrow.
router.patch('/media/:id', async (req, res) => {
  try {
    const v = await queryOne('SELECT course_id FROM activity_media WHERE id = $1', [req.params.id]);
    if (!v) return res.status(404).json({ error: 'Not found' });
    if (!await isTrainer(req.userId, v.course_id)) return res.status(403).json({ error: 'Нет прав' });
    const course = await queryOne('SELECT days_count FROM courses WHERE id = $1', [v.course_id]);
    const daysCount = course?.days_count || 30;

    const { firstDay, lastDay, intervalDays, excludedDays, extraDays, mediaType, textContent, descriptionHtml, durationSec } = req.body || {};
    const sets = []; const params = []; let i = 1;
    if (firstDay !== undefined && firstDay !== '' && firstDay !== null) {
      const n = Math.max(1, Math.min(parseInt(firstDay) || 1, daysCount));
      sets.push(`first_day=$${i++}`); params.push(n);
    }
    if (lastDay !== undefined && lastDay !== '' && lastDay !== null) {
      const n = Math.max(1, Math.min(parseInt(lastDay) || daysCount, daysCount));
      sets.push(`last_day=$${i++}`); params.push(n);
    }
    if (intervalDays !== undefined && intervalDays !== '' && intervalDays !== null) {
      const n = Math.max(1, parseInt(intervalDays) || 1);
      sets.push(`interval_days=$${i++}`); params.push(n);
    }
    const sanitizeDays = (arr) => Array.from(new Set(
      (Array.isArray(arr) ? arr : [])
        .map(x => parseInt(x))
        .filter(n => Number.isFinite(n) && n >= 1 && n <= daysCount)
    )).sort((a, b) => a - b);
    if (Array.isArray(excludedDays)) {
      sets.push(`excluded_days=$${i++}`); params.push(sanitizeDays(excludedDays));
    }
    if (Array.isArray(extraDays)) {
      sets.push(`extra_days=$${i++}`); params.push(sanitizeDays(extraDays));
    }
    if (typeof mediaType === 'string' && ['video','audio','image','text','none'].includes(mediaType)) {
      sets.push(`media_type=$${i++}`); params.push(mediaType);
    }
    if (textContent !== undefined) {
      sets.push(`text_content=$${i++}`); params.push(textContent || null);
    }
    if (descriptionHtml !== undefined) {
      sets.push(`description_html=$${i++}`); params.push(descriptionHtml || null);
    }
    if (durationSec !== undefined && durationSec !== null && durationSec !== '') {
      const n = Math.max(0, parseInt(durationSec) || 0);
      sets.push(`duration_sec=$${i++}`); params.push(n);
    }
    if (sets.length === 0) return res.json({ ok: true });
    params.push(req.params.id);
    await query(`UPDATE activity_media SET ${sets.join(', ')} WHERE id=$${i}`, params);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// ACTIVITY CALLS (online sessions via Jitsi Meet)
// ═══════════════════════════════════════════════════════════

const JITSI_HOST = process.env.JITSI_HOST || 'https://meet.instep.life';
const JITSI_JWT_APP_ID = process.env.JITSI_JWT_APP_ID || 'instep';
const JITSI_JWT_APP_SECRET = process.env.JITSI_JWT_APP_SECRET || '';
// Shared-secret для finalize-скрипта Jibri. Без него webhook вернёт 401.
// Должен совпадать с тем что в /etc/jitsi/jibri/finalize.sh на recorder-VPS.
const JIBRI_WEBHOOK_SECRET = process.env.JIBRI_WEBHOOK_SECRET || '';

function generateJitsiRoomName(courseId, day) {
  const rand = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  return `instep-${courseId.slice(0, 8)}-d${day}-${rand}`;
}

function generateJitsiRoomUrl(courseId, day) {
  return `${JITSI_HOST}/${generateJitsiRoomName(courseId, day)}`;
}

function jitsiJwtFor({ room, userName, userId, isStaff }) {
  if (!JITSI_JWT_APP_SECRET) return null;
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign({
    aud: 'jitsi',
    iss: JITSI_JWT_APP_ID,
    sub: new URL(JITSI_HOST).host,
    room,
    iat: now,
    nbf: now - 10,
    exp: now + 60 * 60 * 4,
    moderator: !!isStaff,
    context: {
      user: {
        id: String(userId),
        name: userName,
        moderator: !!isStaff,
      },
    },
  }, JITSI_JWT_APP_SECRET, { algorithm: 'HS256' });
}

router.get('/calls/:courseId', async (req, res) => {
  try {
    // Verify user has access to this course (enrolled or owner)
    const course = await queryOne('SELECT owner_id FROM courses WHERE id = $1', [req.params.courseId]);
    if (!course) return res.json([]);
    if (course.owner_id !== req.userId) {
      const enroll = await queryOne('SELECT id FROM course_enrollments WHERE course_id = $1 AND user_id = $2', [req.params.courseId, req.userId]);
      if (!enroll) return res.json([]);
    }
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

    const dur = durationMin || 30;
    const roomName = generateJitsiRoomName(courseId, day);
    const roomUrl = `${JITSI_HOST}/${roomName}`;

    const call = await queryOne(
      `INSERT INTO activity_calls (course_id, activity_id, day, scheduled_at, duration_min, room_url, room_name, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [courseId, activityId, day, scheduledAt, dur, roomUrl, roomName, req.userId]
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

// Get join info for a call. Jitsi public rooms don't need JWT —
// we return the stored roomUrl plus the user's display name and staff flag.
router.post('/calls/:id/token', async (req, res) => {
  try {
    const call = await queryOne('SELECT * FROM activity_calls WHERE id = $1', [req.params.id]);
    if (!call) return res.status(404).json({ error: 'Звонок не найден' });
    const course = await queryOne('SELECT owner_id FROM courses WHERE id = $1', [call.course_id]);
    if (!course) return res.status(404).json({ error: 'Курс не найден' });
    const isOwner = course.owner_id === req.userId;
    const enroll = !isOwner ? await queryOne('SELECT role FROM course_enrollments WHERE course_id = $1 AND user_id = $2', [call.course_id, req.userId]) : null;
    if (!isOwner && !enroll) return res.status(403).json({ error: 'Нет доступа' });

    const isStaff = isOwner || (enroll && ['trainer', 'curator'].includes(enroll.role));

    // Backfill a room URL for calls scheduled before the Jitsi migration
    if (!call.room_url) {
      const roomUrl = generateJitsiRoomUrl(call.course_id, call.day);
      await query('UPDATE activity_calls SET room_url = $1 WHERE id = $2', [roomUrl, call.id]);
      call.room_url = roomUrl;
    }

    const user = await queryOne('SELECT display_name, email FROM users WHERE id = $1', [req.userId]);
    const userName = user?.display_name || user?.email || 'Участник';

    await query(
      `INSERT INTO call_attendance (call_id, user_id, joined_at) VALUES ($1,$2,NOW())
       ON CONFLICT (call_id, user_id) DO UPDATE SET joined_at = COALESCE(call_attendance.joined_at, NOW())`,
      [call.id, req.userId]
    );

    const roomName = call.room_url.split('/').pop();
    const jwtToken = jitsiJwtFor({ room: roomName, userName, userId: req.userId, isStaff });

    res.json({ roomUrl: call.room_url, userName, isStaff, jwt: jwtToken, host: new URL(JITSI_HOST).host });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// Trainer-only: roster of everyone who could have been on the call,
// with current attendance flags.
router.get('/calls/:id/attendance', async (req, res) => {
  try {
    const call = await queryOne('SELECT * FROM activity_calls WHERE id = $1', [req.params.id]);
    if (!call) return res.status(404).json({ error: 'Звонок не найден' });
    if (!await isTrainer(req.userId, call.course_id)) return res.status(403).json({ error: 'Нет прав' });

    const rows = await query(
      `SELECT u.id AS user_id, u.email, u.display_name, ce.role,
              (c.owner_id = u.id) AS is_owner,
              COALESCE(ca.attended, false) AS attended,
              (ca.joined_at IS NOT NULL) AS joined
       FROM course_enrollments ce
       JOIN users u ON u.id = ce.user_id
       JOIN courses c ON c.id = ce.course_id
       LEFT JOIN call_attendance ca ON ca.call_id = $1 AND ca.user_id = u.id
       WHERE ce.course_id = $2
       ORDER BY (c.owner_id = u.id) DESC, ce.role, u.display_name`,
      [call.id, call.course_id]
    );

    res.json({
      call: { id: call.id, day: call.day, activityId: call.activity_id },
      currentUserId: req.userId,
      participants: rows.map(r => ({
        userId: r.user_id, email: r.email, displayName: r.display_name || r.email,
        role: r.role, isOwner: r.is_owner, attended: r.attended, joined: r.joined,
      })),
    });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// Trainer-only: mark attendance + write completion to course_progress for
// attended users on the call's day.
router.post('/calls/:id/attendance', async (req, res) => {
  try {
    const call = await queryOne('SELECT * FROM activity_calls WHERE id = $1', [req.params.id]);
    if (!call) return res.status(404).json({ error: 'Звонок не найден' });
    if (!await isTrainer(req.userId, call.course_id)) return res.status(403).json({ error: 'Нет прав' });

    const attendedIds = Array.isArray(req.body?.attendedUserIds) ? req.body.attendedUserIds : [];

    // activity_calls.activity_id is the activity definition key (text);
    // course_progress stores the course_activities.id (uuid). Translate once.
    const courseActivity = await queryOne(
      'SELECT id FROM course_activities WHERE course_id = $1 AND activity_id = $2',
      [call.course_id, call.activity_id]
    );
    if (!courseActivity) return res.status(404).json({ error: 'Активность курса не найдена' });

    // Trainer's own row is always "attended".
    const allAttended = new Set(attendedIds);
    allAttended.add(req.userId);

    const enrollees = await query(
      `SELECT u.id AS user_id
       FROM course_enrollments ce
       JOIN users u ON u.id = ce.user_id
       WHERE ce.course_id = $1`,
      [call.course_id]
    );

    for (const row of enrollees) {
      const attended = allAttended.has(row.user_id);
      await query(
        `INSERT INTO call_attendance (call_id, user_id, attended, joined_at)
         VALUES ($1, $2, $3, CASE WHEN $3 THEN NOW() ELSE NULL END)
         ON CONFLICT (call_id, user_id) DO UPDATE SET attended = $3`,
        [call.id, row.user_id, attended]
      );
      await query(
        `INSERT INTO course_progress (user_id, course_id, activity_id, day, elapsed_seconds, completed, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (user_id, course_id, activity_id, day)
         DO UPDATE SET completed = $6, updated_at = NOW()`,
        [row.user_id, call.course_id, courseActivity.id, call.day, attended ? (call.duration_min || 30) * 60 : 0, attended]
      );
    }

    await query(`UPDATE activity_calls SET status = 'completed', updated_at = NOW() WHERE id = $1`, [call.id]);

    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

export default router;
