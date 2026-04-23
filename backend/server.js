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
      scriptSrc: ["'self'", "'unsafe-inline'", "https://www.youtube.com", "https://s.ytimg.com", "https://meet.jit.si"],
      frameSrc: ["'self'", "https://www.youtube.com", "https://drive.google.com", "https://meet.jit.si"],
      imgSrc: ["'self'", "data:", "blob:", "https://img.youtube.com", "https://*.googleusercontent.com"],
      connectSrc: ["'self'", "https://meet.jit.si", "wss://meet.jit.si"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      mediaSrc: ["'self'", "blob:"],
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
  console.log(`[InStep] Server running at http://${HOST}:${PORT}`);
  console.log(`[InStep] Environment: ${process.env.NODE_ENV || 'development'}`);
});
