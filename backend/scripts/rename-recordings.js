#!/usr/bin/env node
// Переименование старых записей звонков в читаемые имена
// (instep-<id>-d1-<случайное>.mp4 → Курс/Группа/День 01 — Практика — дата.mp4).
// Файлы лежат на instep-rec, база — здесь, прямой сети между ними нет,
// поэтому в два шага через план:
//
//   node scripts/rename-recordings.js > plan.tsv         # план: call_id, старое, новое
//   (на instep-rec по плану: mv + ссылка со старого имени на новое)
//   node scripts/rename-recordings.js --apply-db plan.tsv  # recording_url в базе
//
// В план попадают только записи со старым плоским именем instep-*.mp4.
// Запуск из backend/ (там .env).

import 'dotenv/config';
import fs from 'fs/promises';
import { query } from '../db.js';
import { recordingPathForCall } from '../recordingName.js';

const REC_BASE = 'https://rec.instep.expert/r/';

function urlFor(relPath) {
  return REC_BASE + relPath.split('/').map(encodeURIComponent).join('/');
}

async function makePlan() {
  const calls = await query(
    `SELECT id, recording_url, recording_finished_at, recording_duration_sec
       FROM activity_calls
      WHERE recording_url LIKE $1
      ORDER BY recording_finished_at`,
    [REC_BASE + 'instep-%.mp4']
  );
  const taken = new Set();
  const rows = [];
  for (const c of calls) {
    const oldRel = c.recording_url.slice(REC_BASE.length);
    const started = new Date(new Date(c.recording_finished_at).getTime() - (c.recording_duration_sec || 0) * 1000);
    const segments = await recordingPathForCall(c.id, started);
    if (!segments) continue;
    let rel = segments.join('/');
    for (let n = 2; taken.has(rel); n++) rel = segments.join('/').replace(/\.mp4$/, ` (${n}).mp4`);
    taken.add(rel);
    rows.push([c.id, oldRel, rel]);
  }
  return rows;
}

async function applyDb(planFile) {
  const lines = (await fs.readFile(planFile, 'utf8')).split('\n').filter(Boolean);
  let updated = 0;
  for (const line of lines) {
    const [callId, oldRel, newRel] = line.split('\t');
    const r = await query(
      'UPDATE activity_calls SET recording_url = $1 WHERE id = $2 AND recording_url = $3 RETURNING id',
      [urlFor(newRel), callId, REC_BASE + oldRel]
    );
    updated += r.length;
    console.log(`${r.length ? 'ok  ' : 'skip'} ${callId} → ${newRel}`);
  }
  console.log(`updated ${updated} of ${lines.length}`);
}

const i = process.argv.indexOf('--apply-db');
if (i !== -1) {
  await applyDb(process.argv[i + 1]);
} else {
  for (const row of await makePlan()) process.stdout.write(row.join('\t') + '\n');
}
process.exit(0);
