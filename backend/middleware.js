import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
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
