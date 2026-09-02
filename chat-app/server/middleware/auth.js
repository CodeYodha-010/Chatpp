import { verifyToken } from '../utils/jwt.js';
import prisma from '../config/database.js';

export async function authenticateHTTP(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const decoded = verifyToken(header.substring(7));
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // ponytail: global session check; per-token revocation via jti==session.id when present
  if (decoded.jti) {
    const session = await prisma.session.findUnique({ where: { id: decoded.jti } });
    if (!session || session.userId !== decoded.userId || session.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Session expired or revoked' });
    }
  } else {
    const anySession = await prisma.session.findFirst({ where: { userId: decoded.userId, expiresAt: { gt: new Date() } } });
    if (!anySession) return res.status(401).json({ error: 'Session expired or revoked' });
  }

  const user = await prisma.user.findUnique({
    where: { id: decoded.userId, isActive: true },
    select: { id: true, username: true, email: true, displayName: true, avatarColor: true }
  });
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

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
    const session = await prisma.session.findUnique({ where: { id: decoded.jti } });
    if (!session || session.userId !== decoded.userId || session.expiresAt < new Date()) {
      return next(new Error('Session expired or revoked'));
    }
  } else {
    const anySession = await prisma.session.findFirst({ where: { userId: decoded.userId, expiresAt: { gt: new Date() } } });
    if (!anySession) return next(new Error('Session expired or revoked'));
  }

  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    select: { id: true, username: true, email: true, displayName: true, avatarColor: true }
  });
  if (!user) {
    return next(new Error('User not found'));
  }

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
