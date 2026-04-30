// ffmpeg / ffprobe helpers for normalizing uploaded and Drive-imported
// videos. The goals:
//   1. Container -> standard .mp4 (isom) so HTML5 <video> + Range work
//      cleanly across browsers (QuickTime .mov from iPhone causes stalls).
//   2. moov atom at the front (-movflags +faststart) so the player can
//      start streaming immediately and seeking is cheap.
//   3. Extract duration so the practice timer matches the actual video
//      length without the student having to wait for metadata to load.
//
// We always remux without re-encoding (-c copy) — just repackages the
// container, takes a few seconds per GB, no quality loss. If the source
// codecs aren't H.264/AAC the remux still works; the player will deal
// (or fail and we fall back to original).

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

// Run ffprobe to get the duration in seconds. Returns null on failure.
export function probeDuration(filePath) {
  return new Promise((resolve) => {
    const proc = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    let out = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.on('error', () => resolve(null));
    proc.on('close', (code) => {
      if (code !== 0) return resolve(null);
      const sec = parseFloat(out.trim());
      resolve(isFinite(sec) && sec > 0 ? Math.round(sec) : null);
    });
  });
}

// Remux to standard mp4 with faststart. Returns the path of the remuxed
// file (a sibling next to inputPath). Throws on failure.
export function remuxToMp4Faststart(inputPath) {
  const dir = path.dirname(inputPath);
  const base = path.basename(inputPath, path.extname(inputPath));
  const outputPath = path.join(dir, `${base}_remux.mp4`);
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', inputPath,
      '-c', 'copy',
      '-movflags', '+faststart',
      outputPath,
    ]);
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (code === 0) resolve(outputPath);
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(0, 500)}`));
    });
  });
}

// Full normalize: probe original duration, remux, replace original on
// success. Returns { durationSec, fileSize, finalPath, replaced } where
// replaced indicates whether we actually swapped the file (false if the
// original was already a clean .mp4 and ffmpeg refused / errored).
export async function normalizeVideoFile(originalPath, { forceMp4Ext = true } = {}) {
  const duration = await probeDuration(originalPath);
  let remuxedPath = null;
  let replaced = false;
  let finalPath = originalPath;

  try {
    remuxedPath = await remuxToMp4Faststart(originalPath);
    const remuxStat = await fs.stat(remuxedPath);
    if (remuxStat.size > 0) {
      // Atomic-ish replace: unlink original, rename remuxed.
      // If forceMp4Ext, the final path always ends in .mp4 regardless of
      // the original extension (Drive imports often save .mov or .mp4
      // arbitrarily).
      const targetPath = forceMp4Ext
        ? path.join(path.dirname(originalPath),
                    path.basename(originalPath, path.extname(originalPath)) + '.mp4')
        : originalPath;
      await fs.unlink(originalPath);
      await fs.rename(remuxedPath, targetPath);
      finalPath = targetPath;
      replaced = true;
    }
  } catch (err) {
    console.warn('[normalizeVideoFile] remux failed, keeping original:', err.message);
    if (remuxedPath) { try { await fs.unlink(remuxedPath); } catch {} }
  }

  let fileSize;
  try { fileSize = (await fs.stat(finalPath)).size; }
  catch { fileSize = null; }

  return { durationSec: duration, fileSize, finalPath, replaced };
}
