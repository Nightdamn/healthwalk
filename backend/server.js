import 'dotenv/config';
import express from 'express';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { fileURLToPath } from 'url';
import path from 'path';

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
      imgSrc: ["'self'", "data:", "blob:", "https://img.youtube.com", "https://*.supabase.co", "https://*.googleusercontent.com"],
      connectSrc: ["'self'", "https://*.supabase.co", "wss://*.supabase.co", "https://*.daily.co"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      mediaSrc: ["'self'", "blob:", "https://*.supabase.co"],
    },
  },
}));

// ── Health check ──
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
  });
});

// ── Future API routes ──
// app.use('/api/daily', dailyRouter);     // Daily.co webhooks
// app.use('/api/push', pushRouter);       // Push notifications
// app.use('/api/export', exportRouter);   // PDF/image export

// ── Serve SPA static files ──
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath, {
  maxAge: '1y',
  etag: true,
  setHeaders: (res, filePath) => {
    // HTML — no cache (always get latest)
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
    // Hashed assets (JS, CSS) — long cache
    if (/\.[a-f0-9]{8}\.(js|css)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  },
}));

// ── SPA fallback — all non-API routes serve index.html ──
app.get('*', (req, res) => {
  // Don't serve index.html for API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(distPath, 'index.html'));
});

// ── Start ──
app.listen(PORT, HOST, () => {
  console.log(`[HealthWalk] Server running at http://${HOST}:${PORT}`);
  console.log(`[HealthWalk] Serving SPA from ${distPath}`);
  console.log(`[HealthWalk] Environment: ${process.env.NODE_ENV || 'development'}`);
});
