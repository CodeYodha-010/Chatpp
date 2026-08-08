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
    socket.user = null;
    socket.isGuest = true;
    return next();
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return next(new Error('Invalid token'));
  }

  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    select: { id: true, username: true, email: true, displayName: true, avatarColor: true }
  });
  if (!user) {
    return next(new Error('User not found'));
  }

  socket.user = user;
  socket.isGuest = false;
  next();
}

export function optionalAuth(req, res, next) {
  if (req.headers.authorization?.startsWith('Bearer ')) {
    return authenticateHTTP(req, res, next);
  }
  req.user = null;
  next();
}
