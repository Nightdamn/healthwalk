#!/usr/bin/env node
// One-shot backfill: walk all activity_videos with video_type='file' that are
// missing duration_sec OR whose file isn't a clean mp4 yet, and run them
// through normalizeVideoFile (remux + faststart + duration probe).
//
// Usage:
//   node backend/scripts/backfill-video-normalize.js          # dry-run
//   node backend/scripts/backfill-video-normalize.js --apply  # actually do it

import 'dotenv/config';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { query, queryOne } from '../db.js';
import { normalizeVideoFile } from '../videoProcess.js';
import { VIDEOS_DIR } from '../storage.js';

const APPLY = process.argv.includes('--apply');

(async () => {
  const rows = await query(
    `SELECT id, course_id, activity_id, video_url, file_size, duration_sec
     FROM activity_videos WHERE video_type = 'file' ORDER BY created_at`
  );

  console.log(`${rows.length} file-type videos in DB`);
  let processed = 0, errors = 0, skipped = 0;

  for (const row of rows) {
    const abs = path.join(VIDEOS_DIR, ...row.video_url.split('/'));
    let stat;
    try { stat = await fs.stat(abs); }
    catch { console.log(`  MISSING ${row.video_url}`); errors++; continue; }

    // Skip if already mp4 with duration set
    if (row.duration_sec && abs.endsWith('.mp4')) {
      // Still want to verify faststart but cheap to skip
      console.log(`  ok    ${row.video_url}  (${row.duration_sec}s, ${(stat.size / 1024 / 1024).toFixed(0)} MB)`);
      skipped++;
      continue;
    }

    console.log(`  ${APPLY ? 'NORM' : 'plan'}  ${row.video_url}  size=${(stat.size / 1024 / 1024).toFixed(0)} MB, dur=${row.duration_sec || 'null'}`);
    if (!APPLY) continue;

    try {
      const norm = await normalizeVideoFile(abs, { forceMp4Ext: true });
      const newRel = path.relative(VIDEOS_DIR, norm.finalPath).split(path.sep).join('/');
      await query(
        `UPDATE activity_videos SET video_url = $1, file_size = $2, duration_sec = COALESCE($3, duration_sec) WHERE id = $4`,
        [newRel, norm.fileSize, norm.durationSec, row.id]
      );
      console.log(`        -> ${newRel}  duration=${norm.durationSec}s  size=${(norm.fileSize / 1024 / 1024).toFixed(0)} MB${norm.replaced ? '  (remuxed)' : '  (kept original)'}`);
      processed++;
    } catch (err) {
      console.log(`        ERROR: ${err.message}`);
      errors++;
    }
  }

  console.log(`\nDone. processed=${processed} skipped=${skipped} errors=${errors}`);
  process.exit(0);
})().catch(err => { console.error(err); process.exit(1); });
