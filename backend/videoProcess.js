// ffmpeg / ffprobe helpers for normalizing uploaded and Drive-imported
// videos. The goals:
//   1. Container -> standard .mp4 (isom) so HTML5 <video> + Range work
//      cleanly across browsers (QuickTime .mov from iPhone causes stalls).
//   2. moov atom at the front (-movflags +faststart) so the player can
//      start streaming immediately and seeking is cheap.
//   3. Codec normalization: HEVC/H.265 and AV1 don't play reliably on
//      Android Chrome (software-decode stalls every few seconds), so we
//      transcode them to H.264 + AAC. Already-H.264 sources just remux
//      with -c copy (seconds, no quality loss).
//   4. Extract duration so the practice timer matches the actual video
//      length without the student having to wait for metadata to load.

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

// Probe codecs + duration in one shot.
export function probeFormat(filePath) {
  return new Promise((resolve) => {
    const proc = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'stream=codec_type,codec_name',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1',
      filePath,
    ]);
    let out = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.on('error', () => resolve({ videoCodec: null, audioCodec: null, durationSec: null }));
    proc.on('close', () => {
      const lines = out.split('\n').map(s => s.trim()).filter(Boolean);
      let videoCodec = null, audioCodec = null, durationSec = null, currentType = null;
      for (const ln of lines) {
        const [k, v] = ln.split('=');
        if (k === 'codec_type') currentType = v;
        else if (k === 'codec_name') {
          if (currentType === 'video' && !videoCodec) videoCodec = v;
          else if (currentType === 'audio' && !audioCodec) audioCodec = v;
        } else if (k === 'duration') {
          const sec = parseFloat(v);
          if (isFinite(sec) && sec > 0) durationSec = Math.round(sec);
        }
      }
      resolve({ videoCodec, audioCodec, durationSec });
    });
  });
}

// Run ffmpeg with given args, parse -progress pipe:1 lines into an
// onProgress(percent) callback. Total seconds drives the percent.
function runFfmpeg(args, totalSec, onProgress) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args);
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    if (onProgress) {
      let progressBuf = '';
      proc.stdout.on('data', (d) => {
        progressBuf += d.toString();
        const lines = progressBuf.split('\n');
        progressBuf = lines.pop() || '';
        for (const ln of lines) {
          const [k, v] = ln.split('=');
          if (k === 'out_time_ms' && totalSec > 0) {
            const ms = parseInt(v);
            if (isFinite(ms)) {
              const pct = Math.min(99, Math.round((ms / 1000 / totalSec) * 100 / 1));
              onProgress(pct);
            }
          } else if (k === 'progress' && v === 'end') {
            onProgress(100);
          }
        }
      });
    }
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-500)}`));
    });
  });
}

// Just remux the container (move moov to front, repack as .mp4). Fast,
// no quality loss. Used when source is already H.264 + AAC.
function remuxToMp4Faststart(inputPath, outputPath) {
  return runFfmpeg([
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', inputPath,
    '-c', 'copy',
    '-movflags', '+faststart',
    outputPath,
  ], 0, null);
}

// Transcode video to H.264, copy AAC audio (or re-encode if needed),
// faststart. Slow (single-pass software encode on 2 vCPU is roughly
// realtime to 2x realtime for 1080p).
function transcodeToH264(inputPath, outputPath, totalSec, audioCodec, onProgress) {
  // If audio is already AAC, copy; otherwise re-encode to AAC 128k.
  const audioArgs = audioCodec === 'aac'
    ? ['-c:a', 'copy']
    : ['-c:a', 'aac', '-b:a', '128k'];
  return runFfmpeg([
    '-y', '-hide_banner', '-loglevel', 'error',
    '-progress', 'pipe:1',
    '-i', inputPath,
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    ...audioArgs,
    '-movflags', '+faststart',
    outputPath,
  ], totalSec, onProgress);
}

// Full normalize: probe → remux or transcode → atomic replace. Returns
// { durationSec, fileSize, finalPath, replaced, action } where action is
// 'remux' | 'transcode' | 'kept'.
export async function normalizeVideoFile(originalPath, { forceMp4Ext = true, onProgress, onPhase } = {}) {
  const fmt = await probeFormat(originalPath);
  const dir = path.dirname(originalPath);
  const base = path.basename(originalPath, path.extname(originalPath));
  const tempPath = path.join(dir, `${base}_norm.mp4`);

  const needsTranscode = fmt.videoCodec === 'hevc' || fmt.videoCodec === 'h265' || fmt.videoCodec === 'av1';
  let action = 'kept';
  let success = false;

  try {
    if (needsTranscode) {
      onPhase?.('transcoding');
      await transcodeToH264(originalPath, tempPath, fmt.durationSec || 0, fmt.audioCodec, onProgress);
      action = 'transcode';
    } else {
      onPhase?.('remux');
      await remuxToMp4Faststart(originalPath, tempPath);
      action = 'remux';
    }
    const tStat = await fs.stat(tempPath);
    if (tStat.size > 0) {
      const targetPath = forceMp4Ext
        ? path.join(dir, base + '.mp4')
        : originalPath;
      await fs.unlink(originalPath);
      await fs.rename(tempPath, targetPath);
      success = true;
      var finalPath = targetPath;
    } else {
      throw new Error('ffmpeg produced empty output');
    }
  } catch (err) {
    console.warn(`[normalizeVideoFile] ${action} failed:`, err.message);
    try { await fs.unlink(tempPath); } catch {}
    var finalPath = originalPath;
  }

  let fileSize = null;
  try { fileSize = (await fs.stat(finalPath)).size; } catch {}
  return {
    durationSec: fmt.durationSec,
    fileSize,
    finalPath,
    replaced: success,
    action: success ? action : 'kept',
  };
}

// Backwards-compat alias: some callers used probeDuration directly before.
export async function probeDuration(filePath) {
  const fmt = await probeFormat(filePath);
  return fmt.durationSec;
}
