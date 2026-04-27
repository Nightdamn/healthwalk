import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { queryOne } from '../db.js';
import { requireAuth } from '../middleware.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'course-videos');
const MEDIA_DIR = path.join(__dirname, '..', 'uploads', 'theory-media');

// Ensure uploads directories exist
await fs.mkdir(UPLOADS_DIR, { recursive: true });
await fs.mkdir(MEDIA_DIR, { recursive: true });

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
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
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
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB — single-course phase, revisit before scaling
  fileFilter: (req, file, cb) => cb(null, ALLOWED_MEDIA.includes(file.mimetype)),
});

const router = Router();

// ── POST /api/files/upload/:courseId/:activityId ──
router.post('/upload/:courseId/:activityId', requireAuth, upload.single('video'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

    const { courseId, activityId } = req.params;
    const { firstDay, lastDay, durationSec } = req.body;
    const filePath = `${courseId}/${activityId}/${req.file.filename}`;

    const { query: dbQuery } = await import('../db.js');
    const v = await queryOne(
      `INSERT INTO activity_videos (course_id, activity_id, video_type, video_url, file_size, duration_sec, first_day, last_day)
       VALUES ($1,$2,'file',$3,$4,$5,$6,$7) RETURNING *`,
      [courseId, activityId, filePath, req.file.size, durationSec ? parseInt(durationSec) : null,
       parseInt(firstDay) || 1, parseInt(lastDay) || 1]
    );

    res.json({ data: v });
  } catch (err) {
    console.error('[Files] Upload:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/files/video/:courseId/:activityId/:filename ──
router.get('/video/:courseId/:activityId/:filename', requireAuth, async (req, res) => {
  try {
    const { courseId, activityId, filename } = req.params;
    const filePath = path.join(UPLOADS_DIR, courseId, activityId, filename);

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

// ── GET /api/files/media/:userId/:filename — public, embedded in HTML ──
router.get('/media/:userId/:filename', async (req, res) => {
  try {
    const { userId, filename } = req.params;
    if (!/^[a-z0-9-]+$/i.test(userId) || filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({ error: 'Bad path' });
    }
    const filePath = path.join(MEDIA_DIR, userId, filename);
    try { await fs.access(filePath); }
    catch { return res.status(404).json({ error: 'Not found' }); }
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(filePath);
  } catch (err) {
    console.error('[Files] Serve media:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
