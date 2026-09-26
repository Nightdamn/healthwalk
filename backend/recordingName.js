// Читаемое имя файла записи звонка на instep-rec (/var/recordings/...).
//
//   Курс/Группа/День 01 — Практика — 2026-09-26 11.00.mp4
//
// Папка группы — только в курсе с группами (у курса без групп скрытая
// «Общая» пользователям не видна). Время — начало записи по Москве.
// Имя запрашивает finalize.sh Jibri перед тем, как положить mp4
// (GET /api/webhooks/jibri/recording-name), им же пользуется
// scripts/rename-recordings.js для старых записей.
import { queryOne } from './db.js';

const SEGMENT_MAX = 80; // символов; кириллица — 2 байта, ext4 держит 255 байт

// Убирает то, что нельзя в имени файла (Linux, а после скачивания — Windows).
export function safeSegment(s, fallback) {
  const v = String(s ?? '')
    .replace(/[\/\\:*?"<>|\x00-\x1f\x7f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, SEGMENT_MAX)
    .trim();
  return v || fallback;
}

function moscowStamp(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).map(p => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}.${parts.minute}`;
}

// → ['Курс', 'Группа', 'День 01 — Практика — 2026-09-26 11.00.mp4'] или null.
export async function recordingPathForCall(callId, startedAt) {
  const r = await queryOne(
    `SELECT c.title, c.groups_enabled, g.name AS group_name, ac.day, ca.label
       FROM activity_calls ac
       JOIN courses c ON c.id = ac.course_id
       JOIN course_groups g ON g.id = ac.group_id
       LEFT JOIN course_activities ca ON ca.group_id = ac.group_id AND ca.activity_id = ac.activity_id
      WHERE ac.id = $1`,
    [callId]
  );
  if (!r) return null;
  const day = String(r.day).padStart(2, '0');
  const label = safeSegment(r.label, 'Онлайн-встреча');
  const file = `День ${day} — ${label} — ${moscowStamp(startedAt)}.mp4`;
  const segments = [safeSegment(r.title, 'Курс')];
  if (r.groups_enabled) segments.push(safeSegment(r.group_name, 'Группа'));
  segments.push(file);
  return segments;
}
