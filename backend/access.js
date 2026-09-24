import { query, queryOne } from './db.js';

// Окно доступа к материалам курса после его окончания.
// Сколько дней после окончания: личная настройка ученика, если задана; иначе
// у группы (курс по группам) либо у курса. Пустое значение у группы/курса —
// бессрочно, без отката на уровень выше.
// Окончание: «По дням» — дата старта + days_count - 1; прогрессивные режимы —
// дата закрытия последнего дня, когда закрыты все дни.

const pad = n => String(n).padStart(2, '0');

// Дата по времени сервера (MSK) — так же, как дни закрываются в базе.
export function localDate(d) {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + n));
  return x.toISOString().slice(0, 10);
}

export function accessWindow({ mode, startDate, daysCount, closedDates, accessDays }) {
  const none = { accessExpiresOn: null, accessExpired: false };
  if (accessDays === null || accessDays === undefined) return none;
  let end = null;
  if (mode === 'daily') {
    if (startDate) end = addDays(startDate, daysCount - 1);
  } else if (closedDates.length >= daysCount) {
    end = closedDates.reduce((a, b) => (b > a ? b : a));
  }
  if (!end) return none;
  const expires = addDays(end, Number(accessDays));
  return { accessExpiresOn: expires, accessExpired: localDate(new Date()) > expires };
}

// Состояние доступа конкретного пользователя к курсу. Владелец и тренеры/
// кураторы курса не ограничиваются.
export async function getStudentAccess(userId, courseId) {
  const r = await queryOne(
    `SELECT c.owner_id, c.days_count, ce.role, ce.group_id, ce.joined_at,
            COALESCE(ce.progression_mode_override,
                     CASE WHEN c.groups_enabled THEN g.progression_mode END,
                     c.progression_mode, 'daily') AS mode,
            COALESCE(ce.bound_to_calendar_override,
                     CASE WHEN c.groups_enabled THEN g.bound_to_calendar END,
                     c.bound_to_calendar, false) AS bound,
            COALESCE(ce.start_date_override,
                     CASE WHEN c.groups_enabled THEN g.start_date END,
                     c.start_date) AS start_date,
            CASE WHEN ce.access_days_after_override IS NOT NULL THEN ce.access_days_after_override
                 WHEN c.groups_enabled THEN g.access_days_after
                 ELSE c.access_days_after END AS access_days
       FROM courses c
       LEFT JOIN course_enrollments ce ON ce.course_id = c.id AND ce.user_id = $1
       LEFT JOIN course_groups g ON g.id = ce.group_id
      WHERE c.id = $2`,
    [userId, courseId]
  );
  const none = { accessExpiresOn: null, accessExpired: false };
  if (!r || !r.role || r.owner_id === userId || r.role !== 'student') return none;
  // Та же дата старта, что /items отдаёт клиенту.
  const startDate = r.bound && r.start_date
    ? r.start_date
    : (r.joined_at ? new Date(r.joined_at).toISOString().slice(0, 10) : null);
  let closedDates = [];
  if (r.mode !== 'daily') {
    const rows = await query(
      'SELECT closed_at FROM course_day_closures WHERE user_id = $1 AND group_id = $2',
      [userId, r.group_id]
    );
    closedDates = rows.map(x => localDate(x.closed_at));
  }
  return accessWindow({
    mode: r.mode, startDate, daysCount: r.days_count || 30,
    closedDates, accessDays: r.access_days,
  });
}
