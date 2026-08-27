import express from 'express';
const router = express.Router();
import User from '../models/User.js';
import { hashPassword } from '../utils/password.js';
import { signToken, generateRefreshToken } from '../utils/jwt.js';
import { authenticateHTTP } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';
import prisma from '../config/database.js';
import crypto from 'crypto';
import logger from '../utils/logger.js';

router.post('/register', authLimiter, validate(schemas.register), async (req, res, next) => {
  try {
    const { username, email, password, display_name } = req.body;

    if (await User.findByEmail(email)) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    if (await User.findByUsername(username)) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const passwordHash = await hashPassword(password);
    const jti = crypto.randomUUID();
    const refreshToken = generateRefreshToken();

    const { user, token } = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          username: username.toLowerCase(),
          email: email.toLowerCase(),
          passwordHash,
          displayName: display_name || username
        },
        select: { id: true, username: true, email: true, displayName: true, avatarColor: true }
      });
      const realToken = signToken({ userId: created.id, username: created.username, jti });
      await tx.session.create({
        data: {
          id: jti,
          userId: created.id,
          refreshToken,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'] || 'unknown',
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        }
      });
      return { user: created, token: realToken };
    });
    await prisma.auditLog.create({ data: { userId: user.id, action: 'register', ipAddress: req.ip } }).catch(() => {});

    logger.info('User registered', { userId: user.id, username: user.username });
    res.status(201).json({ user, token, refreshToken });
  } catch (e) {
    next(e);
  }
});

router.post('/login', authLimiter, validate(schemas.login), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.authenticate(email, password);

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const jti = crypto.randomUUID();
    const refreshToken = generateRefreshToken();
    const token = signToken({ userId: user.id, username: user.username, jti });

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      await tx.session.create({
        data: {
          id: jti,
          userId: user.id,
          refreshToken,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'] || 'unknown',
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        }
      });
    });
    await prisma.auditLog.create({ data: { userId: user.id, action: 'login', ipAddress: req.ip } }).catch(() => {});

    logger.info('User logged in', { userId: user.id, username: user.username });
    res.json({ user, token, refreshToken });
  } catch (e) {
    next(e);
  }
});

router.get('/me', authenticateHTTP, (req, res) => {
  res.json({ user: req.user });
});

router.post('/refresh', authLimiter, async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'refreshToken required' });

    const session = await prisma.session.findUnique({ where: { refreshToken } });
    if (!session || session.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId, isActive: true },
      select: { id: true, username: true, email: true, displayName: true, avatarColor: true }
    });
    if (!user) return res.status(401).json({ error: 'User not found' });

    const newJti = crypto.randomUUID();
    const newRefreshToken = generateRefreshToken();
    const newToken = signToken({ userId: user.id, username: user.username, jti: newJti });

    await prisma.$transaction([
      prisma.session.delete({ where: { id: session.id } }),
      prisma.session.create({
        data: {
          id: newJti,
          userId: user.id,
          refreshToken: newRefreshToken,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'] || 'unknown',
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        }
      })
    ]);

    res.json({ user, token: newToken, refreshToken: newRefreshToken });
  } catch (e) {
    next(e);
  }
});

router.post('/logout', authenticateHTTP, async (req, res) => {
  await prisma.session.deleteMany({ where: { userId: req.user.id } });
  logger.info('User logged out', { userId: req.user.id });
  res.json({ message: 'Logged out' });
});

export default router;
