#!/usr/bin/env node
// Garbage-collect orphan files in uploads/.
//
// Two channels:
//   1. uploads/course-videos/<courseId>/<activityId>/<filename>
//      Orphan if no row in activity_videos with matching video_url.
//      Also wipes empty courseId / activityId dirs.
//   2. uploads/theory-media/<userId>/<filename>
//      Orphan if URL `/api/files/media/<userId>/<filename>` doesn't appear
//      in any course_activities.description_html or
//      student_custom_activities.description_html.
//
// Usage:
//   node backend/scripts/gc-orphan-files.js          # dry-run, prints stats
//   node backend/scripts/gc-orphan-files.js --apply  # actually delete
//
// Run from project root or backend/. ENV: PG* vars or DATABASE_URL via .env.

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { query } from '../db.js';
import { listAllVideoFiles, listAllMediaFiles, VIDEOS_DIR, MEDIA_DIR } from '../storage.js';

const APPLY = process.argv.includes('--apply');

function bytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

async function rmEmptyDirsRecursive(root) {
  let removed = 0;
  async function walk(dir) {
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      if (e.isDirectory()) await walk(path.join(dir, e.name));
    }
    try {
      const after = await fs.readdir(dir);
      if (after.length === 0 && dir !== root) {
        if (APPLY) await fs.rmdir(dir);
        removed++;
      }
    } catch {}
  }
  await walk(root);
  return removed;
}

async function gcVideos() {
  console.log('\n=== course-videos ===');
  const onDisk = await listAllVideoFiles();
  console.log(`  on disk: ${onDisk.length} files`);

  const dbRows = await query('SELECT video_url FROM activity_videos WHERE video_type = $1', ['file']);
  const dbSet = new Set(dbRows.map(r => r.video_url).filter(Boolean));
  console.log(`  in DB:   ${dbSet.size} file rows`);

  let orphanCount = 0, orphanBytes = 0;
  for (const f of onDisk) {
    if (!dbSet.has(f.rel)) {
      let size = 0;
      try { const st = await fs.stat(f.abs); size = st.size; } catch {}
      orphanBytes += size;
      orphanCount++;
      console.log(`  ${APPLY ? 'DELETE' : 'orphan'}  ${f.rel}  (${bytes(size)})`);
      if (APPLY) {
        try { await fs.unlink(f.abs); } catch (e) { console.warn('  unlink failed:', e.message); }
      }
    }
  }
  console.log(`  orphans: ${orphanCount} files, ${bytes(orphanBytes)} ${APPLY ? '— deleted' : '(dry-run)'}`);

  const removedDirs = await rmEmptyDirsRecursive(VIDEOS_DIR);
  console.log(`  empty dirs ${APPLY ? 'removed' : 'would-remove'}: ${removedDirs}`);
}

async function gcMedia() {
  console.log('\n=== theory-media ===');
  const onDisk = await listAllMediaFiles();
  console.log(`  on disk: ${onDisk.length} files`);

  // Collect all referenced URLs from any html field.
  const html1 = await query("SELECT description_html FROM course_activities WHERE description_html IS NOT NULL AND description_html <> ''");
  const html2 = await query("SELECT description_html FROM student_custom_activities WHERE description_html IS NOT NULL AND description_html <> ''");
  const referenced = new Set();
  const re = /\/api\/files\/media\/([a-f0-9-]+)\/([^\s"'>?#]+)/gi;
  for (const r of [...html1, ...html2]) {
    const html = r.description_html || '';
    let m; while ((m = re.exec(html)) !== null) referenced.add(`${m[1]}/${m[2]}`);
  }
  console.log(`  referenced in DB: ${referenced.size}`);

  let orphanCount = 0, orphanBytes = 0;
  for (const f of onDisk) {
    if (!referenced.has(f.rel)) {
      let size = 0;
      try { const st = await fs.stat(f.abs); size = st.size; } catch {}
      orphanBytes += size;
      orphanCount++;
      console.log(`  ${APPLY ? 'DELETE' : 'orphan'}  ${f.rel}  (${bytes(size)})`);
      if (APPLY) {
        try { await fs.unlink(f.abs); } catch (e) { console.warn('  unlink failed:', e.message); }
      }
    }
  }
  console.log(`  orphans: ${orphanCount} files, ${bytes(orphanBytes)} ${APPLY ? '— deleted' : '(dry-run)'}`);

  const removedDirs = await rmEmptyDirsRecursive(MEDIA_DIR);
  console.log(`  empty dirs ${APPLY ? 'removed' : 'would-remove'}: ${removedDirs}`);
}

(async () => {
  console.log(`Mode: ${APPLY ? 'APPLY (will delete)' : 'DRY-RUN (use --apply to delete)'}`);
  await gcVideos();
  await gcMedia();
  console.log('\nDone.');
  process.exit(0);
})().catch(err => { console.error(err); process.exit(1); });
