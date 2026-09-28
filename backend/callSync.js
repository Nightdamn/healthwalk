// Звонки потока повторяют дни онлайн-практик (practice_type='call'): на каждый
// отмеченный день — звонок (по умолчанию 10:00 по часовому поясу тренера из
// профиля), звонок на день вне расписания — удаляется. Тренер потом меняет
// только время.
//
// С 2026-09-28 это делает сервер — при сохранении дней практики и настроек
// потока (привязка к дате, дата старта, число дней, режим групп). Раньше
// синхронизация шла в браузере при открытии редактора и при смене группы
// успевала посмотреть на звонки старой группы — плодила дубли.
//
// Никогда не удаляются звонки, которые уже проведены или в которые заходили:
// к ним привязаны запись (webhook Jibri ищет звонок по комнате) и посещаемость.
import { query, queryOne } from './db.js';

const DEFAULT_TIME_MIN = 10 * 60; // 10:00
const DEFAULT_TZ_MIN = 180;       // Москва, если в профиле пусто

function jitsiHost() {
  return process.env.JITSI_HOST || 'https://meet.instep.life';
}

export function newRoomName(courseId, day) {
  const rand = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  return `instep-${String(courseId).slice(0, 8)}-d${day}-${rand}`;
}

// Одна строка activity_calls с новой комнатой Jitsi.
export async function insertCall({ courseId, groupId, activityId, day, scheduledAt, durationMin, createdBy }) {
  const roomName = newRoomName(courseId, day);
  return queryOne(
    `INSERT INTO activity_calls (course_id, group_id, activity_id, day, scheduled_at, duration_min, room_url, room_name, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [courseId, groupId, activityId, day, scheduledAt, durationMin || 30, `${jitsiHost()}/${roomName}`, roomName, createdBy]
  );
}

// Дни практики — как isActivityScheduled во фронте для редактора (без даты
// вступления ученика): extra-день считается, если он не раньше first_day.
export function callDaysForActivity(a, daysCount) {
  const fd = a.first_day || 1;
  const ld = Math.min(a.last_day || daysCount, daysCount);
  const iv = Math.max(1, a.interval_days || 1);
  const excl = new Set(a.excluded_days || []);
  const extra = new Set(a.extra_days || []);
  const days = [];
  for (let d = 1; d <= daysCount; d++) {
    if (excl.has(d)) continue;
    if (extra.has(d)) { if (d >= fd) days.push(d); continue; }
    if (d < fd || d > ld) continue;
    if ((d - fd) % iv === 0) days.push(d);
  }
  return days;
}

// 10:00 по часовому поясу tzMin в день N потока, как ISO UTC.
function defaultCallTime(startDate, day, tzMin) {
  const [y, m, d] = String(startDate).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + day - 1, 0, DEFAULT_TIME_MIN) - tzMin * 60000).toISOString();
}

const isLocked = (c) => !!(c.recording_url || c.status === 'completed' || c.has_joins);

// Синхронизации одной группы идут строго по очереди: автосохранение редактора
// шлёт несколько PATCH подряд, параллельные прогоны создали бы дубли.
// Процесс бэкенда один (systemd instep), поэтому очереди в памяти достаточно.
const groupQueues = new Map();
function inGroupQueue(groupId, fn) {
  const prev = groupQueues.get(groupId) || Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.catch(() => {});
  groupQueues.set(groupId, tail);
  tail.then(() => { if (groupQueues.get(groupId) === tail) groupQueues.delete(groupId); });
  return run;
}

// Привести звонки группы к расписанию её онлайн-практик. actorId — кто
// сохранял (его часовой пояс для 10:00 и created_by новых звонков).
// dryRun — только посчитать. Поток не привязан к дате — ничего не делаем.
export function syncGroupCalls(groupId, opts = {}) {
  return inGroupQueue(groupId, () => syncGroupCallsNow(groupId, opts));
}

async function syncGroupCallsNow(groupId, { actorId = null, dryRun = false } = {}) {
  const result = { groupId, created: [], deleted: [], skipped: null };
  const g = await queryOne(
    `SELECT g.id, g.course_id, c.owner_id, c.days_count,
            CASE WHEN c.groups_enabled THEN g.bound_to_calendar ELSE c.bound_to_calendar END AS bound,
            CASE WHEN c.groups_enabled THEN g.start_date ELSE c.start_date END AS start_date
       FROM course_groups g JOIN courses c ON c.id = g.course_id
      WHERE g.id = $1`,
    [groupId]
  );
  if (!g) { result.skipped = 'no_group'; return result; }
  if (!g.bound || !g.start_date) { result.skipped = 'not_bound'; return result; }

  const daysCount = g.days_count || 30;
  const createdBy = actorId || g.owner_id;
  const tzRow = await queryOne('SELECT tz_offset_min FROM user_settings WHERE user_id = $1', [createdBy]);
  const tzMin = Number.isFinite(tzRow?.tz_offset_min) ? tzRow.tz_offset_min : DEFAULT_TZ_MIN;

  const acts = await query(
    `SELECT * FROM course_activities WHERE group_id = $1 AND practice_type = 'call'`,
    [groupId]
  );
  const calls = await query(
    `SELECT ac.*, EXISTS (SELECT 1 FROM call_attendance ca
                           WHERE ca.call_id = ac.id AND ca.joined_at IS NOT NULL) AS has_joins
       FROM activity_calls ac WHERE ac.group_id = $1`,
    [groupId]
  );

  for (const a of acts) {
    const days = callDaysForActivity(a, daysCount);
    const mine = calls.filter(c => c.activity_id === a.activity_id);
    const haveDay = new Set(mine.map(c => c.day));
    for (const day of days) {
      if (haveDay.has(day)) continue;
      const scheduledAt = defaultCallTime(g.start_date, day, tzMin);
      if (!dryRun) {
        await insertCall({ courseId: g.course_id, groupId, activityId: a.activity_id, day,
                           scheduledAt, durationMin: 30, createdBy });
      }
      result.created.push({ activityId: a.activity_id, label: a.label, day, scheduledAt });
    }
    for (const c of mine) {
      if (days.includes(c.day) || isLocked(c)) continue;
      if (!dryRun) await query('DELETE FROM activity_calls WHERE id = $1', [c.id]);
      result.deleted.push({ id: c.id, activityId: a.activity_id, label: a.label, day: c.day });
    }
  }
  return result;
}

// Все группы курса — после смены настроек курса (дни, привязка, старт, режим групп).
export async function syncCourseCalls(courseId, opts = {}) {
  const groups = await query('SELECT id FROM course_groups WHERE course_id = $1', [courseId]);
  const out = [];
  for (const g of groups) out.push(await syncGroupCalls(g.id, opts));
  return out;
}
