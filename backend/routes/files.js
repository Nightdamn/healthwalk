import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { query, queryOne } from '../db.js';
import { getStudentAccess } from '../access.js';
import { requireAuth, verifyToken } from '../middleware.js';
import { normalizeVideoFile, probeDuration } from '../videoProcess.js';

// A-10: each Drive import spawns a download + ffmpeg transcode (CPU-heavy).
// Cap to 10 imports per user per hour so a single trainer can't accidentally
// (or maliciously) saturate the 2 vCPU VDS.
const driveImportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId || req.ip,
  validate: { keyGeneratorIpFallback: false },
  message: { error: 'Слишком много импортов с Drive. Попробуйте через час.' },
});

// HTML <video src="..."> tags can't add Authorization headers, so video
// serving accepts the JWT as a ?token=<...> query param too.
function requireAuthOrQueryToken(req, res, next) {
  const header = req.headers.authorization;
  let token = null;
  if (header?.startsWith('Bearer ')) token = header.slice(7);
  else if (typeof req.query.token === 'string') token = req.query.token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = verifyToken(token);
    req.userId = payload.id;
    req.userEmail = payload.email;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'course-videos');
const MEDIA_DIR = path.join(__dirname, '..', 'uploads', 'theory-media');
// v31: файлы ответов на задания — <course>/<user>/<submission>/<файл>.
const TASK_DIR = path.join(__dirname, '..', 'uploads', 'task-files');

// Ensure uploads directories exist
await fs.mkdir(UPLOADS_DIR, { recursive: true });
await fs.mkdir(MEDIA_DIR, { recursive: true });
await fs.mkdir(TASK_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const dir = path.join(UPLOADS_DIR, req.params.courseId, req.params.activityId);
    await fs.mkdir(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 * 1024 }, // 5 GB
  fileFilter: (req, file, cb) => {
    const allowed = ['video/mp4', 'video/webm', 'video/quicktime'];
    cb(null, allowed.includes(file.mimetype));
  },
});

// Theory inline media (images + short videos) — keyed by userId, no activity binding
const ALLOWED_MEDIA = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/webm', 'video/quicktime',
];
const mediaStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const dir = path.join(MEDIA_DIR, req.userId);
    await fs.mkdir(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});
const mediaUpload = multer({
  storage: mediaStorage,
  limits: { fileSize: 5 * 1024 * 1024 * 1024 }, // 5 GB
  fileFilter: (req, file, cb) => cb(null, ALLOWED_MEDIA.includes(file.mimetype)),
});

const router = Router();

// ── POST /api/files/upload/:courseId/:activityId ──
// multer 1.4+ already cleans up partial files on aborted requests / size-limit
// errors. We only need to clean up if the DB insert fails AFTER the file was
// saved successfully — otherwise the file is orphaned forever.
router.post('/upload/:courseId/:activityId', requireAuth, upload.single('video'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

    const { courseId, activityId } = req.params;
    const { firstDay, lastDay, durationSec, intervalDays, mediaType } = req.body;
    const iv = Math.max(1, parseInt(intervalDays) || 1);
    const mt = mediaType && ['video','audio','image','text','none'].includes(mediaType) ? mediaType : 'video';

    // Normalize the upload: remux to mp4+faststart (handles iPhone .mov
    // and any non-faststart sources), probe real duration via ffprobe.
    // Fallback: if remux fails, original file is left in place and we use
    // whatever duration the client supplied.
    let normPath = req.file.path;
    let normSize = req.file.size;
    let normDuration = durationSec ? parseInt(durationSec) : null;
    try {
      const norm = await normalizeVideoFile(req.file.path, { forceMp4Ext: true });
      normPath = norm.finalPath;
      normSize = norm.fileSize ?? req.file.size;
      if (norm.durationSec) normDuration = norm.durationSec;
    } catch (err) {
      console.warn('[Files] normalize failed:', err.message);
    }
    const finalFilename = path.basename(normPath);
    const filePath = `${courseId}/${activityId}/${finalFilename}`;

    // Для image mediaType не гоняем через ffmpeg normalize — сохраняем как есть.
    // (video/audio нормализуются выше уже).
    // v30: media.group_id из активности.
    const actRow = await queryOne('SELECT group_id FROM course_activities WHERE id = $1 AND course_id = $2', [activityId, courseId]);
    if (!actRow) throw new Error('Активность не найдена');
    const v = await queryOne(
      `INSERT INTO activity_media (course_id, group_id, activity_id, media_type, source_type, media_url, file_size, duration_sec, first_day, last_day, interval_days)
       VALUES ($1,$2,$3,$4,'file',$5,$6,$7,$8,$9,$10) RETURNING *`,
      [courseId, actRow.group_id, activityId, mt, filePath, normSize, normDuration,
       parseInt(firstDay) || 1, parseInt(lastDay) || 1, iv]
    );

    res.json({ data: v });
  } catch (err) {
    console.error('[Files] Upload:', err);
    if (req.file?.path) {
      try { await fs.unlink(req.file.path); } catch {}
    }
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/files/video/:courseId/:activityId/:filename ──
router.get('/video/:courseId/:activityId/:filename', requireAuthOrQueryToken, async (req, res) => {
  try {
    const { courseId, activityId, filename } = req.params;
    // A-9: hardened path validation. UUIDs only for courseId/activityId,
    // basename-only for filename, and a containment assertion after path.join
    // so encoded traversal can't escape UPLOADS_DIR.
    const uuid = /^[a-zA-Z0-9_-]+$/;
    if (!uuid.test(courseId) || !uuid.test(activityId)
        || path.basename(filename) !== filename || filename.includes('\x00')) {
      return res.status(400).json({ error: 'Bad path' });
    }
    const filePath = path.join(UPLOADS_DIR, courseId, activityId, filename);
    if (!filePath.startsWith(UPLOADS_DIR + path.sep)) {
      return res.status(400).json({ error: 'Bad path' });
    }

    // A-8: only the course owner or someone enrolled may stream the video.
    // Any auth'd user could otherwise read any video they know the path of.
    const c = await queryOne('SELECT owner_id FROM courses WHERE id = $1', [courseId]);
    if (!c) return res.status(404).json({ error: 'Course not found' });
    if (c.owner_id !== req.userId) {
      const enroll = await queryOne(
        'SELECT 1 FROM course_enrollments WHERE course_id = $1 AND user_id = $2',
        [courseId, req.userId]
      );
      if (!enroll) return res.status(403).json({ error: 'Нет доступа' });
    }
    if ((await getStudentAccess(req.userId, courseId)).accessExpired) {
      return res.status(403).json({ error: 'Доступ к материалам курса закрыт' });
    }

    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ error: 'File not found' });
    }

    res.sendFile(filePath);
  } catch (err) {
    console.error('[Files] Serve:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Drive import ─────────────────────────────────────────────────────────
// Trainer pastes a "anyone with link" Google Drive video URL → we stream the
// file to our own storage in the background. Once finished it shows up as a
// regular type='file' video and the iframe-with-its-own-controls problem
// goes away.
const DRIVE_MAX_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB
const driveJobs = new Map(); // jobId -> { status, bytesDone, totalBytes, error?, videoData? }

function extractDriveIdServer(url) {
  if (!url) return null;
  let m = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?.*id=)([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  m = url.match(/drive\.usercontent\.google\.com\/.*[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  return null;
}

async function isTrainerOfCourse(userId, courseId) {
  const row = await queryOne(
    `SELECT (c.owner_id = $1) OR EXISTS (
       SELECT 1 FROM course_enrollments ce
       WHERE ce.course_id = $2 AND ce.user_id = $1 AND ce.role IN ('trainer','curator')
     ) AS ok
     FROM courses c WHERE c.id = $2`,
    [userId, courseId]
  );
  return !!row?.ok;
}

// X-3: SSRF guard for Drive imports. Two protections:
//   1. AbortSignal.timeout — slow Drive responses can't pin Node async slots
//      indefinitely.
//   2. Final response.url host pin — fetch follows redirects automatically;
//      we assert the *final* URL is still on a Google download host so a
//      crafted Drive ID can't make Drive hand us a redirect to an internal
//      service.
const DRIVE_HOSTS = new Set(['drive.usercontent.google.com', 'drive.google.com']);
function assertDriveHost(response) {
  let host;
  try { host = new URL(response.url).hostname; }
  catch { throw new Error('Drive returned a malformed URL'); }
  if (!DRIVE_HOSTS.has(host)) {
    throw new Error(`Drive redirected to unexpected host: ${host}`);
  }
}

async function fetchDriveStream(driveId) {
  const baseUrl = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(driveId)}&export=download&confirm=t`;
  let response = await fetch(baseUrl, {
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Drive HTTP ${response.status}`);
  assertDriveHost(response);

  let ctype = response.headers.get('content-type') || '';
  if (ctype.includes('text/html')) {
    const html = await response.text();
    const tokenMatch = html.match(/name="confirm"\s+value="([^"]+)"/i)
      || html.match(/[?&]confirm=([a-zA-Z0-9_-]+)/);
    const uuidMatch = html.match(/name="uuid"\s+value="([^"]+)"/i);
    if (!tokenMatch) throw new Error('Drive returned a confirmation page; make sure the file is shared "Anyone with the link"');
    const params = new URLSearchParams({ id: driveId, export: 'download', confirm: tokenMatch[1] });
    if (uuidMatch) params.set('uuid', uuidMatch[1]);
    response = await fetch(`https://drive.usercontent.google.com/download?${params}`, {
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Drive HTTP ${response.status} (after confirm)`);
    assertDriveHost(response);
    ctype = response.headers.get('content-type') || '';
    if (ctype.includes('text/html')) throw new Error('Drive still returns HTML — file may be too large for direct download or not actually shared publicly');
  }
  return response;
}

function extFromMime(mime) {
  if (mime.includes('mp4')) return '.mp4';
  if (mime.includes('webm')) return '.webm';
  if (mime.includes('quicktime') || mime.includes('mov')) return '.mov';
  return '.mp4';
}

async function runDriveImport(jobId, params) {
  const job = driveJobs.get(jobId);
  if (!job) return;
  let filePath = null;
  try {
    const response = await fetchDriveStream(params.driveId);
    const total = parseInt(response.headers.get('content-length') || '0') || null;
    if (total && total > DRIVE_MAX_BYTES) {
      throw new Error(`Файл слишком большой: ${(total / 1024 / 1024).toFixed(0)} МБ (лимит 5120 МБ)`);
    }
    job.totalBytes = total;

    const ext = extFromMime(response.headers.get('content-type') || '');
    const filename = `${Date.now()}_drive_${Math.random().toString(36).slice(2, 8)}${ext}`;
    const dir = path.join(UPLOADS_DIR, params.courseId, params.activityId);
    await fs.mkdir(dir, { recursive: true });
    filePath = path.join(dir, filename);

    const writeStream = createWriteStream(filePath);
    let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > DRIVE_MAX_BYTES) {
        writeStream.destroy();
        throw new Error('Превышен лимит 1 ГБ во время скачивания');
      }
      writeStream.write(chunk);
      job.bytesDone = bytes;
    }
    await new Promise((resolve, reject) => {
      writeStream.end(() => resolve());
      writeStream.on('error', reject);
    });

    // ── Post-process: remux to standard mp4+faststart so HTML5 video
    // streams smoothly (Drive often serves QuickTime .mov which causes
    // stalls and slow seek), AND transcode HEVC/AV1 → H.264 because
    // Android Chrome software-decodes HEVC and stalls every few seconds.
    job.phase = 'processing';
    const norm = await normalizeVideoFile(filePath, {
      forceMp4Ext: true,
      onPhase: (phase) => { job.phase = phase; }, // 'remux' | 'transcoding'
      onProgress: (pct) => { job.transcodeProgress = pct; },
    });
    filePath = norm.finalPath;
    const finalFilename = path.basename(filePath);
    const finalSize = norm.fileSize ?? bytes;

    const relPath = `${params.courseId}/${params.activityId}/${finalFilename}`;
    // v30: media.group_id из активности.
    const actRow = await queryOne('SELECT group_id FROM course_activities WHERE id = $1 AND course_id = $2', [params.activityId, params.courseId]);
    if (!actRow) throw new Error('Активность не найдена');
    const v = await queryOne(
      `INSERT INTO activity_media (course_id, group_id, activity_id, media_type, source_type, media_url, file_size, duration_sec, first_day, last_day, interval_days)
       VALUES ($1,$2,$3,'video','file',$4,$5,$6,$7,$8,$9) RETURNING *`,
      [params.courseId, actRow.group_id, params.activityId, relPath, finalSize, norm.durationSec,
       parseInt(params.firstDay) || 1, parseInt(params.lastDay) || 1,
       Math.max(1, parseInt(params.intervalDays) || 1)]
    );

    job.status = 'done';
    job.phase = 'done';
    job.videoData = v;
    job.bytesDone = bytes;
    if (!job.totalBytes) job.totalBytes = bytes;
  } catch (err) {
    console.error('[import-drive]', err);
    job.status = 'error';
    job.error = err.message;
    if (filePath) { try { await fs.unlink(filePath); } catch {} }
  }
}

router.post('/import-drive', requireAuth, driveImportLimiter, async (req, res) => {
  try {
    const { courseId, activityId, url, firstDay, lastDay, intervalDays } = req.body || {};
    if (!courseId || !activityId || !url) return res.status(400).json({ error: 'courseId, activityId, url required' });
    if (!await isTrainerOfCourse(req.userId, courseId)) return res.status(403).json({ error: 'Нет прав' });
    const driveId = extractDriveIdServer(url);
    if (!driveId) return res.status(400).json({ error: 'Не удалось распознать ссылку Google Drive' });

    const jobId = randomUUID();
    driveJobs.set(jobId, { status: 'pending', phase: 'downloading', bytesDone: 0, totalBytes: null });
    setTimeout(() => driveJobs.delete(jobId), 60 * 60 * 1000);
    runDriveImport(jobId, { courseId, activityId, driveId, firstDay, lastDay, intervalDays });
    res.json({ jobId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/import-drive/:jobId', requireAuth, (req, res) => {
  const job = driveJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  // Polling endpoint — disable caching so the browser doesn't re-emit a 304
  // when the JSON body happens to be identical to the previous tick.
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.json(job);
});

// ── POST /api/files/upload-media — inline image/video for theory editor ──
router.post('/upload-media', requireAuth, mediaUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен (или неподдерживаемый тип)' });
    const url = `/api/files/media/${req.userId}/${req.file.filename}`;
    const kind = req.file.mimetype.startsWith('image/') ? 'image' : 'video';
    res.json({ url, kind, size: req.file.size });
  } catch (err) {
    console.error('[Files] Upload media:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/files/media/:userId/:filename ──
// A-7: previously open. <img src="..."> embedded in theory HTML can't send
// Authorization headers, so we accept the same ?token= query fallback as
// /video/. Theory media inherits whatever access the surrounding course
// already grants — anyone with the URL had to receive it via the course.
router.get('/media/:userId/:filename', requireAuthOrQueryToken, async (req, res) => {
  try {
    const { userId, filename } = req.params;
    // A-9: hardened path validation. Reject anything that could escape the
    // MEDIA_DIR root via .. segments, encoded slashes, or null bytes.
    const safeBasename = path.basename(filename) === filename;
    if (!/^[a-z0-9-]+$/i.test(userId) || !safeBasename || filename.includes('\x00')) {
      return res.status(400).json({ error: 'Bad path' });
    }
    const filePath = path.join(MEDIA_DIR, userId, filename);
    if (!filePath.startsWith(MEDIA_DIR + path.sep)) {
      return res.status(400).json({ error: 'Bad path' });
    }
    try { await fs.access(filePath); }
    catch { return res.status(404).json({ error: 'Not found' }); }
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.sendFile(filePath);
  } catch (err) {
    console.error('[Files] Serve media:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── v31: файлы ответов на задания ────────────────────────────────────────
// Ученик прикладывает к ответу фото, видео и документы (до 200 МБ каждый).
// Видео не перекодируем: на 2 vCPU перекодировка 200 МБ — минуты под нагрузкой;
// отдаём как есть с правильным типом (не воспроизводится — можно скачать).
const TASK_MAX_BYTES = 200 * 1024 * 1024;
const TASK_MIME = {
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'],
  video: ['video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp', 'video/x-m4v'],
  document: [
    'application/pdf', 'text/plain', 'application/rtf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.oasis.opendocument.text',
  ],
};
const taskKind = (mime) => Object.keys(TASK_MIME).find(k => TASK_MIME[k].includes(mime)) || null;
const isUuid = (s) => /^[0-9a-f-]{36}$/i.test(String(s || ''));
// busboy читает имя файла как latin1, а браузер шлёт UTF-8 — без перекодировки
// кириллица превращается в «Ð¤Ð¾Ñ‚Ð¾».
const fixName = (n) => {
  try { const d = Buffer.from(n, 'latin1').toString('utf8'); return d.includes('�') ? n : d; }
  catch { return n; }
};

// Свой ответ, который ещё можно править (черновик или возвращён на доработку).
async function loadEditableSubmission(req, res, next) {
  if (!isUuid(req.params.submissionId)) return res.status(404).json({ error: 'Ответ не найден' });
  const sub = await queryOne('SELECT * FROM task_submissions WHERE id = $1', [req.params.submissionId]);
  if (!sub || sub.user_id !== req.userId) return res.status(404).json({ error: 'Ответ не найден' });
  if (!['draft', 'returned'].includes(sub.status)) return res.status(409).json({ error: 'Ответ уже отправлен' });
  req.taskSub = sub;
  next();
}

const taskUpload = multer({
  storage: multer.diskStorage({
    destination: async (req, file, cb) => {
      const s = req.taskSub;
      const dir = path.join(TASK_DIR, s.course_id, s.user_id, s.id);
      await fs.mkdir(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10);
      cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  limits: { fileSize: TASK_MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => cb(null, !!taskKind(file.mimetype)),
});

// ── POST /api/files/task/:submissionId — приложить файл к ответу ──
router.post('/task/:submissionId', requireAuth, loadEditableSubmission, (req, res, next) => {
  taskUpload.single('file')(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Файл больше 200 МБ' });
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Этот тип файла не подходит. Можно фото, видео, PDF, Word или текст.' });
    }
    const row = await queryOne(
      `INSERT INTO task_submission_files (submission_id, kind, original_name, mime, size_bytes, storage_path)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, kind, original_name, mime, size_bytes, created_at`,
      [req.taskSub.id, taskKind(req.file.mimetype), fixName(req.file.originalname).slice(0, 200),
       req.file.mimetype, req.file.size, path.relative(TASK_DIR, req.file.path)]
    );
    await query('UPDATE task_submissions SET updated_at = NOW() WHERE id = $1', [req.taskSub.id]);
    res.json({ data: { id: row.id, kind: row.kind, originalName: row.original_name, mime: row.mime, sizeBytes: Number(row.size_bytes) } });
  } catch (err) {
    console.error('[Files] Task upload:', err);
    if (req.file?.path) { try { await fs.unlink(req.file.path); } catch {} }
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/files/task-file/:fileId — файл ответа: автору и staff курса ──
// ?download=1 — скачать с исходным именем.
router.get('/task-file/:fileId', requireAuthOrQueryToken, async (req, res) => {
  try {
    if (!isUuid(req.params.fileId)) return res.status(404).json({ error: 'Файл не найден' });
    const f = await queryOne(
      `SELECT f.*, s.user_id, s.course_id FROM task_submission_files f
         JOIN task_submissions s ON s.id = f.submission_id WHERE f.id = $1`,
      [req.params.fileId]
    );
    if (!f) return res.status(404).json({ error: 'Файл не найден' });
    if (f.user_id !== req.userId) {
      const c = await queryOne('SELECT owner_id FROM courses WHERE id = $1', [f.course_id]);
      const staff = c?.owner_id === req.userId || await queryOne(
        "SELECT 1 FROM course_enrollments WHERE course_id = $1 AND user_id = $2 AND role IN ('trainer','curator')",
        [f.course_id, req.userId]
      ) || await queryOne(
        'SELECT 1 FROM course_groups WHERE course_id = $1 AND (trainer_id = $2 OR curator_id = $2)',
        [f.course_id, req.userId]
      );
      if (!staff) return res.status(403).json({ error: 'Нет доступа' });
    }
    const full = path.join(TASK_DIR, f.storage_path);
    if (!full.startsWith(TASK_DIR + path.sep)) return res.status(400).json({ error: 'Bad path' });
    try { await fs.access(full); } catch { return res.status(404).json({ error: 'Файл не найден' }); }
    res.type(f.mime);
    if (req.query.download) res.attachment(f.original_name);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.sendFile(full);
  } catch (err) {
    console.error('[Files] Task file:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/files/task-file/:fileId — убрать файл из ответа (пока можно править) ──
router.delete('/task-file/:fileId', requireAuth, async (req, res) => {
  try {
    if (!isUuid(req.params.fileId)) return res.status(404).json({ error: 'Файл не найден' });
    const f = await queryOne(
      `SELECT f.*, s.user_id, s.status FROM task_submission_files f
         JOIN task_submissions s ON s.id = f.submission_id WHERE f.id = $1`,
      [req.params.fileId]
    );
    if (!f || f.user_id !== req.userId) return res.status(404).json({ error: 'Файл не найден' });
    if (!['draft', 'returned'].includes(f.status)) return res.status(409).json({ error: 'Ответ уже отправлен' });
    await query('DELETE FROM task_submission_files WHERE id = $1', [f.id]);
    const full = path.join(TASK_DIR, f.storage_path);
    if (full.startsWith(TASK_DIR + path.sep)) { try { await fs.unlink(full); } catch {} }
    res.json({ deleted: true });
  } catch (err) {
    console.error('[Files] Task file delete:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
