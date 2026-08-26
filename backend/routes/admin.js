// v28: админ-панель — модерация витрины, блокировки, аудит.
//
// Все эндпоинты требуют admin-роль (requireAuth + requireAdmin).
// Действия, меняющие state, логируются в admin_audit_log.

import { Router } from 'express';
import { query, queryOne } from '../db.js';
import { requireAuth, requireAdmin } from '../middleware.js';

const router = Router();
router.use(requireAuth, requireAdmin);

// Утилита: записать действие в audit-log. Всегда fire-and-forget — если
// запись упадёт, основное действие всё равно применилось (лог не должен
// блокировать модерацию).
async function audit(actorId, action, targetType, targetId, metadata = {}) {
  try {
    await query(
      `INSERT INTO admin_audit_log (actor_id, action, target_type, target_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [actorId, action, targetType, targetId, metadata]
    );
  } catch (err) {
    console.error('[Admin audit]', err);
  }
}

// ═══════════════════════════════════════════════════════════
// СПИСКИ (drill-in: trainers → courses → students)
// ═══════════════════════════════════════════════════════════

// GET /admin/trainers — все, у кого есть хотя бы один свой курс.
// Возвращаем email, имя, статус блокировки, счётчики: сколько курсов
// и сколько уникальных учеников по всем курсам (минус сам создатель).
router.get('/trainers', async (req, res) => {
  try {
    const rows = await query(`
      SELECT
        u.id, u.email, u.display_name, u.avatar_url, u.created_at,
        u.blocked_at, u.blocked_reason,
        COUNT(DISTINCT c.id)::int AS courses_count,
        COUNT(DISTINCT CASE WHEN e.user_id <> u.id THEN e.user_id END)::int AS students_count,
        SUM(CASE WHEN c.store_status = 'pending' THEN 1 ELSE 0 END)::int AS pending_count,
        SUM(CASE WHEN c.store_status = 'approved' THEN 1 ELSE 0 END)::int AS approved_count
      FROM users u
      JOIN courses c ON c.owner_id = u.id
      LEFT JOIN course_enrollments e ON e.course_id = c.id
      GROUP BY u.id
      ORDER BY courses_count DESC, u.created_at DESC
    `);
    res.json(rows);
  } catch (err) { console.error('[Admin trainers]', err); res.status(500).json({ error: err.message }); }
});

// GET /admin/trainers/:id/courses — все курсы конкретного тренера.
router.get('/trainers/:id/courses', async (req, res) => {
  try {
    const trainer = await queryOne(
      `SELECT id, email, display_name, avatar_url, blocked_at, blocked_reason
         FROM users WHERE id = $1`, [req.params.id]);
    if (!trainer) return res.status(404).json({ error: 'Тренер не найден' });
    const courses = await query(`
      SELECT
        c.id, c.title, c.description, c.days_count, c.avatar_icon, c.avatar_custom,
        c.store_status, c.store_submitted_at, c.store_reviewed_at, c.store_reject_reason,
        c.price_amount, c.price_currency,
        c.blocked_at, c.blocked_reason,
        c.created_at, c.updated_at,
        COUNT(DISTINCT CASE WHEN e.user_id <> c.owner_id THEN e.user_id END)::int AS students_count
      FROM courses c
      LEFT JOIN course_enrollments e ON e.course_id = c.id
      WHERE c.owner_id = $1
      GROUP BY c.id
      ORDER BY c.updated_at DESC
    `, [req.params.id]);
    res.json({ trainer, courses });
  } catch (err) { console.error('[Admin trainer courses]', err); res.status(500).json({ error: err.message }); }
});

// GET /admin/courses/:id — карточка курса + автор + ученики.
router.get('/courses/:id', async (req, res) => {
  try {
    const course = await queryOne(`
      SELECT c.*, u.email AS owner_email, u.display_name AS owner_name,
             u.blocked_at AS owner_blocked_at
        FROM courses c JOIN users u ON u.id = c.owner_id
        WHERE c.id = $1`, [req.params.id]);
    if (!course) return res.status(404).json({ error: 'Курс не найден' });
    const students = await query(`
      SELECT u.id, u.email, u.display_name, u.avatar_url,
             e.joined_at, e.role
        FROM course_enrollments e
        JOIN users u ON u.id = e.user_id
        WHERE e.course_id = $1
        ORDER BY e.joined_at DESC
    `, [req.params.id]);
    res.json({ course, students });
  } catch (err) { console.error('[Admin course]', err); res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// МОДЕРАЦИЯ ВИТРИНЫ (approve / reject)
// ═══════════════════════════════════════════════════════════

router.post('/courses/:id/approve', async (req, res) => {
  try {
    const c = await queryOne('SELECT store_status FROM courses WHERE id = $1', [req.params.id]);
    if (!c) return res.status(404).json({ error: 'Курс не найден' });
    if (c.store_status !== 'pending') {
      return res.status(400).json({ error: `Нельзя одобрить курс в статусе «${c.store_status}»` });
    }
    await query(
      `UPDATE courses SET
         store_status = 'approved',
         store_reviewed_at = NOW(),
         store_reviewed_by = $1,
         store_reject_reason = NULL
       WHERE id = $2`,
      [req.userId, req.params.id]
    );
    await audit(req.userId, 'approve_course', 'course', req.params.id, { prev_status: 'pending' });
    res.json({ ok: true });
  } catch (err) { console.error('[Admin approve]', err); res.status(500).json({ error: err.message }); }
});

router.post('/courses/:id/reject', async (req, res) => {
  try {
    const reason = (req.body?.reason || '').trim();
    if (!reason) return res.status(400).json({ error: 'Причина отклонения обязательна' });
    const c = await queryOne('SELECT store_status FROM courses WHERE id = $1', [req.params.id]);
    if (!c) return res.status(404).json({ error: 'Курс не найден' });
    if (c.store_status !== 'pending') {
      return res.status(400).json({ error: `Нельзя отклонить курс в статусе «${c.store_status}»` });
    }
    await query(
      `UPDATE courses SET
         store_status = 'rejected',
         store_reviewed_at = NOW(),
         store_reviewed_by = $1,
         store_reject_reason = $2
       WHERE id = $3`,
      [req.userId, reason, req.params.id]
    );
    await audit(req.userId, 'reject_course', 'course', req.params.id, { reason });
    res.json({ ok: true });
  } catch (err) { console.error('[Admin reject]', err); res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// БЛОКИРОВКА
// ═══════════════════════════════════════════════════════════

router.post('/courses/:id/block', async (req, res) => {
  try {
    const reason = (req.body?.reason || '').trim();
    if (!reason) return res.status(400).json({ error: 'Причина блокировки обязательна' });
    const c = await queryOne('SELECT blocked_at FROM courses WHERE id = $1', [req.params.id]);
    if (!c) return res.status(404).json({ error: 'Курс не найден' });
    if (c.blocked_at) return res.status(400).json({ error: 'Курс уже заблокирован' });
    await query(
      `UPDATE courses SET blocked_at = NOW(), blocked_by = $1, blocked_reason = $2,
         store_status = 'blocked'
       WHERE id = $3`,
      [req.userId, reason, req.params.id]
    );
    await audit(req.userId, 'block_course', 'course', req.params.id, { reason });
    res.json({ ok: true });
  } catch (err) { console.error('[Admin block course]', err); res.status(500).json({ error: err.message }); }
});

router.post('/courses/:id/unblock', async (req, res) => {
  try {
    const c = await queryOne('SELECT blocked_at FROM courses WHERE id = $1', [req.params.id]);
    if (!c) return res.status(404).json({ error: 'Курс не найден' });
    if (!c.blocked_at) return res.status(400).json({ error: 'Курс не заблокирован' });
    await query(
      `UPDATE courses SET blocked_at = NULL, blocked_by = NULL, blocked_reason = NULL,
         store_status = 'draft'
       WHERE id = $1`,
      [req.params.id]
    );
    await audit(req.userId, 'unblock_course', 'course', req.params.id);
    res.json({ ok: true });
  } catch (err) { console.error('[Admin unblock course]', err); res.status(500).json({ error: err.message }); }
});

router.post('/trainers/:id/block', async (req, res) => {
  try {
    const reason = (req.body?.reason || '').trim();
    if (!reason) return res.status(400).json({ error: 'Причина блокировки обязательна' });
    if (req.params.id === req.userId) return res.status(400).json({ error: 'Нельзя заблокировать самого себя' });
    const u = await queryOne('SELECT blocked_at FROM users WHERE id = $1', [req.params.id]);
    if (!u) return res.status(404).json({ error: 'Пользователь не найден' });
    if (u.blocked_at) return res.status(400).json({ error: 'Пользователь уже заблокирован' });
    await query(
      'UPDATE users SET blocked_at = NOW(), blocked_by = $1, blocked_reason = $2 WHERE id = $3',
      [req.userId, reason, req.params.id]
    );
    await audit(req.userId, 'block_trainer', 'user', req.params.id, { reason });
    res.json({ ok: true });
  } catch (err) { console.error('[Admin block trainer]', err); res.status(500).json({ error: err.message }); }
});

router.post('/trainers/:id/unblock', async (req, res) => {
  try {
    const u = await queryOne('SELECT blocked_at FROM users WHERE id = $1', [req.params.id]);
    if (!u) return res.status(404).json({ error: 'Пользователь не найден' });
    if (!u.blocked_at) return res.status(400).json({ error: 'Пользователь не заблокирован' });
    await query('UPDATE users SET blocked_at = NULL, blocked_by = NULL, blocked_reason = NULL WHERE id = $1', [req.params.id]);
    await audit(req.userId, 'unblock_trainer', 'user', req.params.id);
    res.json({ ok: true });
  } catch (err) { console.error('[Admin unblock trainer]', err); res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
// АУДИТ-ЛОГ
// ═══════════════════════════════════════════════════════════

// GET /admin/audit — последние N записей + JOIN на actor/target
// для читаемого вывода без N+1 на клиенте.
router.get('/audit', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(parseInt(req.query.limit) || 100, 500));
    const rows = await query(`
      SELECT
        a.id, a.action, a.target_type, a.target_id, a.metadata, a.created_at,
        actor.email AS actor_email, actor.display_name AS actor_name,
        CASE WHEN a.target_type = 'course'
             THEN (SELECT title FROM courses WHERE id = a.target_id)
             WHEN a.target_type = 'user'
             THEN (SELECT email FROM users WHERE id = a.target_id)
        END AS target_label
      FROM admin_audit_log a
      LEFT JOIN users actor ON actor.id = a.actor_id
      ORDER BY a.created_at DESC
      LIMIT $1
    `, [limit]);
    res.json(rows);
  } catch (err) { console.error('[Admin audit]', err); res.status(500).json({ error: err.message }); }
});

export default router;
