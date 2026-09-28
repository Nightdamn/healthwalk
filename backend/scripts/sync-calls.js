#!/usr/bin/env node
// Сверка звонков всех потоков с днями онлайн-практик (backend/callSync.js).
// Нужна один раз при переносе синхронизации из браузера на сервер (2026-09-28)
// и для проверки: что сервер создал бы/удалил прямо сейчас.
//
//   node scripts/sync-calls.js                  # вхолостую, все курсы
//   node scripts/sync-calls.js --course <id>    # вхолостую, один курс
//   node scripts/sync-calls.js --apply [...]    # применить
//
// Проведённые звонки и звонки, в которые заходили, не удаляются никогда.
// Запуск из backend/ (там .env).

import 'dotenv/config';
import { query } from '../db.js';
import { syncGroupCalls } from '../callSync.js';

const APPLY = process.argv.includes('--apply');
const ci = process.argv.indexOf('--course');
const courseId = ci !== -1 ? process.argv[ci + 1] : null;

const groups = await query(
  `SELECT g.id, g.name, g.is_default, c.title
     FROM course_groups g JOIN courses c ON c.id = g.course_id
    ${courseId ? 'WHERE c.id = $1' : ''}
    ORDER BY c.title, g.name`,
  courseId ? [courseId] : []
);

let created = 0, deleted = 0;
for (const g of groups) {
  const r = await syncGroupCalls(g.id, { dryRun: !APPLY });
  if (!r.created.length && !r.deleted.length) continue;
  console.log(`${g.title} / ${g.name}${g.is_default ? ' (шаблон)' : ''}`);
  for (const c of r.created) console.log(`  + день ${c.day}  ${c.label}  ${c.scheduledAt}`);
  for (const c of r.deleted) console.log(`  - день ${c.day}  ${c.label}  ${c.id}`);
  created += r.created.length; deleted += r.deleted.length;
}
console.log(`${APPLY ? 'применено' : 'вхолостую'}: +${created} -${deleted}`);
process.exit(0);
