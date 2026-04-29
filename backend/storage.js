// File-storage helpers shared between routes and the GC script.
// Mirrors the layout used by routes/files.js:
//   uploads/course-videos/<courseId>/<activityId>/<filename>   — practice videos
//   uploads/theory-media/<userId>/<filename>                   — inline theory media
//
// All filesystem ops swallow ENOENT — partial cleanup is fine, missing files
// just mean the work is already done.

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOADS_ROOT = path.join(__dirname, 'uploads');
export const VIDEOS_DIR = path.join(UPLOADS_ROOT, 'course-videos');
export const MEDIA_DIR = path.join(UPLOADS_ROOT, 'theory-media');

// video_url is stored as `<courseId>/<activityId>/<filename>` (forward slashes).
export function videoFilePath(videoUrl) {
  if (!videoUrl) return null;
  // Defensive: strip any leading slashes / drive letters / parent refs.
  const parts = String(videoUrl).split(/[\\/]/).filter(p => p && p !== '..' && p !== '.');
  if (parts.length < 1) return null;
  return path.join(VIDEOS_DIR, ...parts);
}

export async function deleteVideoFile(videoUrl) {
  const fp = videoFilePath(videoUrl);
  if (!fp) return false;
  try { await fs.unlink(fp); return true; }
  catch (err) { if (err?.code !== 'ENOENT') console.warn('[storage] unlink failed:', fp, err.message); return false; }
}

// rm -rf an activity's directory (used after the last video is removed
// or when an activity is deleted).
export async function deleteActivityDir(courseId, activityId) {
  if (!courseId || !activityId) return;
  const dir = path.join(VIDEOS_DIR, String(courseId), String(activityId));
  try { await fs.rm(dir, { recursive: true, force: true }); }
  catch (err) { if (err?.code !== 'ENOENT') console.warn('[storage] rm activity failed:', dir, err.message); }
}

// rm -rf a whole course directory (used when course is deleted).
export async function deleteCourseDir(courseId) {
  if (!courseId) return;
  const dir = path.join(VIDEOS_DIR, String(courseId));
  try { await fs.rm(dir, { recursive: true, force: true }); }
  catch (err) { if (err?.code !== 'ENOENT') console.warn('[storage] rm course failed:', dir, err.message); }
}

// Walk the videos tree and return absolute file paths plus a relative
// `<courseId>/<activityId>/<filename>` key for joining with DB rows.
export async function listAllVideoFiles() {
  const out = [];
  let courses = [];
  try { courses = await fs.readdir(VIDEOS_DIR); }
  catch (err) { if (err?.code === 'ENOENT') return out; throw err; }

  for (const courseId of courses) {
    const cDir = path.join(VIDEOS_DIR, courseId);
    let acts = [];
    try { acts = await fs.readdir(cDir); } catch { continue; }
    for (const actId of acts) {
      const aDir = path.join(cDir, actId);
      let files = [];
      try { files = await fs.readdir(aDir); } catch { continue; }
      for (const f of files) {
        out.push({ abs: path.join(aDir, f), rel: `${courseId}/${actId}/${f}` });
      }
    }
  }
  return out;
}

// Same for theory media (keyed by userId).
export async function listAllMediaFiles() {
  const out = [];
  let users = [];
  try { users = await fs.readdir(MEDIA_DIR); }
  catch (err) { if (err?.code === 'ENOENT') return out; throw err; }
  for (const userId of users) {
    const uDir = path.join(MEDIA_DIR, userId);
    let files = [];
    try { files = await fs.readdir(uDir); } catch { continue; }
    for (const f of files) {
      out.push({ abs: path.join(uDir, f), rel: `${userId}/${f}` });
    }
  }
  return out;
}
