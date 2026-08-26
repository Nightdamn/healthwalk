import jwt from 'jsonwebtoken';
import { queryOne } from './db.js';

// A-5: never silently fall back to a known secret. In production we hard-fail
// at first use so a misconfigured deploy can't mint forgeable tokens.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'change-me-in-production') {
  if (process.env.NODE_ENV === 'production') {
    console.error('[InStep] FATAL: JWT_SECRET is missing or default in production');
    process.exit(1);
  }
  console.warn('[InStep] WARNING: JWT_SECRET not set, using dev fallback (DO NOT USE IN PRODUCTION)');
}
const SECRET = JWT_SECRET || 'dev-only-fallback-not-for-prod';

export function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '30d' });
}

export function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

// Express middleware: require valid JWT
export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const payload = verifyToken(header.slice(7));
    req.userId = payload.id;
    req.userEmail = payload.email;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// v28: admin-only guard. Ставится после requireAuth. Читает user_roles —
// один короткий запрос на каждый admin-endpoint, приемлемо (админов мало,
// частота обращений низкая).
export async function requireAdmin(req, res, next) {
  try {
    const row = await queryOne('SELECT role FROM user_roles WHERE user_id = $1', [req.userId]);
    if (row?.role !== 'admin') return res.status(403).json({ error: 'Требуются права администратора' });
    next();
  } catch (err) {
    console.error('[requireAdmin]', err);
    res.status(500).json({ error: 'Ошибка проверки прав' });
  }
}
