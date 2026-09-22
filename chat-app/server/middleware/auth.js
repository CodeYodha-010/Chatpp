import { verifyToken } from '../utils/jwt.js';
import prisma, { withDb } from '../config/database.js';

// Session + user come back in ONE round-trip (include): this middleware runs on
// every request and every socket connect, so each saved query is a visible
// latency win, especially against a remote Neon endpoint.
const SESSION_USER_SELECT = { id: true, username: true, email: true, displayName: true, avatarColor: true, isActive: true };

export async function authenticateHTTP(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const decoded = verifyToken(header.substring(7));
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // ponytail: global session check; per-token revocation via jti==session.id when present.
  // This runs on every request, so it must ride out a pool rebuild — an unwrapped
  // call here surfaced as an unhandled rejection when Neon suspended mid-run.
  if (decoded.jti) {
    const session = await withDb(() => prisma.session.findUnique({
      where: { id: decoded.jti },
      include: { user: { select: SESSION_USER_SELECT } }
    }));
    if (!session || session.userId !== decoded.userId || session.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Session expired or revoked' });
    }
    const user = session.user;
    if (!user || !user.isActive) return res.status(401).json({ error: 'User not found' });
    req.user = user;
    return next();
  }
  const anySession = await withDb(() => prisma.session.findFirst({
    where: { userId: decoded.userId, expiresAt: { gt: new Date() } },
    include: { user: { select: SESSION_USER_SELECT } }
  }));
  if (!anySession) return res.status(401).json({ error: 'Session expired or revoked' });
  const user = anySession.user;
  if (!user || !user.isActive) return res.status(401).json({ error: 'User not found' });
  req.user = user;
  next();
}

export async function authenticateSocket(socket, next) {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error('Authentication required'));
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return next(new Error('Invalid token'));
  }

  if (decoded.jti) {
    const session = await withDb(() => prisma.session.findUnique({
      where: { id: decoded.jti },
      include: { user: { select: SESSION_USER_SELECT } }
    }));
    if (!session || session.userId !== decoded.userId || session.expiresAt < new Date()) {
      return next(new Error('Session expired or revoked'));
    }
    const user = session.user;
    if (!user) return next(new Error('User not found'));
    socket.user = user;
    return next();
  }
  const anySession = await withDb(() => prisma.session.findFirst({
    where: { userId: decoded.userId, expiresAt: { gt: new Date() } },
    include: { user: { select: SESSION_USER_SELECT } }
  }));
  if (!anySession) return next(new Error('Session expired or revoked'));
  const user = anySession.user;
  if (!user) return next(new Error('User not found'));
  socket.user = user;
  next();
}

export function optionalAuth(req, res, next) {
  if (req.headers.authorization?.startsWith('Bearer ')) {
    authenticateHTTP(req, res, next);
    return;
  }
  req.user = null;
  next();
}
