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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// A-6: refuse to start in production without an explicit CORS_ORIGIN.
// Wildcard fallback would let any origin call our authenticated API.
if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
  console.error('[InStep] FATAL: CORS_ORIGIN must be set in production');
  process.exit(1);
}

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
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://www.youtube.com", "https://s.ytimg.com", "https://meet.instep.life"],
      frameSrc: ["'self'", "https://www.youtube.com", "https://drive.google.com", "https://meet.instep.life"],
      imgSrc: ["'self'", "data:", "blob:", "https:", "https://img.youtube.com", "https://*.googleusercontent.com"],
      connectSrc: ["'self'", "https://meet.instep.life", "wss://meet.instep.life"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://meet.instep.life"],
      fontSrc: ["'self'", "data:", "https://meet.instep.life"],
      mediaSrc: ["'self'", "blob:"],
      workerSrc: ["'self'", "blob:"],
      childSrc: ["'self'", "blob:", "https://meet.instep.life"],
    },
  },
  crossOriginOpenerPolicy: { policy: 'unsafe-none' },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
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

// ── API Routes ──
// IMPORTANT: /api/files must be mounted BEFORE /api — apiRoutes uses a global
// header-only requireAuth that would otherwise 401 the video-serving requests
// which authenticate via ?token=<jwt> query param.
app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);
app.use('/api', apiRoutes);

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
  console.log(`[InStep] Server running at http://${HOST}:${PORT}`);
  console.log(`[InStep] Environment: ${process.env.NODE_ENV || 'development'}`);
});
