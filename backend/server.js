import 'dotenv/config';
import express from 'express';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { fileURLToPath } from 'url';
import path from 'path';

import authRoutes from './routes/auth.js';
import apiRoutes from './routes/api.js';
import fileRoutes from './routes/files.js';
import { query, queryOne } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';

// ── Middleware ──
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(compression());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
}));
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://www.youtube.com", "https://s.ytimg.com"],
      frameSrc: ["'self'", "https://www.youtube.com", "https://drive.google.com", "https://*.daily.co"],
      imgSrc: ["'self'", "data:", "blob:", "https://img.youtube.com", "https://*.googleusercontent.com"],
      connectSrc: ["'self'", "https://*.daily.co", "wss://*.daily.co", "https://*.pluot.blue", "wss://*.pluot.blue"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      mediaSrc: ["'self'", "blob:", "https://*.daily.co", "https://*.pluot.blue"],
      workerSrc: ["'self'", "blob:"],
      childSrc: ["'self'", "blob:"],
    },
  },
}));
app.use(express.json({ limit: '10mb' }));

// ── Health check ──
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ── Daily.co Webhook (no auth — called by Daily.co) ──
app.post('/api/daily-webhook', async (req, res) => {
  try {
    const { event, payload } = req.body;
    console.log('[Daily Webhook]', event);

    if (event === 'recording.ready-to-download' && payload?.room_name && payload?.download_link) {
      // Find the call by room URL
      const call = await queryOne(
        `SELECT * FROM activity_calls WHERE room_url LIKE $1`,
        [`%${payload.room_name}`]
      );
      if (call) {
        // Save recording as activity_video
        await query(
          `INSERT INTO activity_videos (course_id, activity_id, video_type, video_url, duration_sec, first_day, last_day)
           VALUES ($1, $2, 'link', $3, $4, $5, $5)
           ON CONFLICT (course_id, activity_id, first_day, last_day) DO UPDATE SET video_url = $3, duration_sec = $4`,
          [call.course_id, call.activity_id, payload.download_link, payload.duration || null, call.day]
        );
        // Update call status
        await query(`UPDATE activity_calls SET status = 'completed', updated_at = NOW() WHERE id = $1`, [call.id]);
        console.log('[Daily Webhook] Recording saved for call', call.id);
      }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[Daily Webhook Error]', err);
    res.json({ ok: true }); // Always 200 for webhooks
  }
});

// ── API Routes ──
app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);
app.use('/api/files', fileRoutes);

// ── Serve SPA static files ──
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath, {
  maxAge: '1y',
  etag: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
    if (/\.[a-f0-9]{8}\.(js|css)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  },
}));

// ── SPA fallback ──
app.get('{*path}', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(distPath, 'index.html'));
});

// ── Start ──
app.listen(PORT, HOST, () => {
  console.log(`[HealthWalk] Server running at http://${HOST}:${PORT}`);
  console.log(`[HealthWalk] Environment: ${process.env.NODE_ENV || 'development'}`);
});
