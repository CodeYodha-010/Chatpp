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
    const user = await prisma.user.create({
      data: {
        username: username.toLowerCase(),
        email: email.toLowerCase(),
        passwordHash,
        displayName: display_name || username
      },
      select: { id: true, username: true, email: true, displayName: true, avatarColor: true }
    });

    const token = signToken({ userId: user.id, username: user.username });
    const refreshToken = generateRefreshToken();

    await prisma.session.create({
      data: {
        id: crypto.randomUUID(),
        userId: user.id,
        refreshToken,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] || 'unknown',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });

    await prisma.auditLog.create({
      data: { userId: user.id, action: 'register', ipAddress: req.ip }
    });

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

    await User.updateLastLogin(user.id);
    const token = signToken({ userId: user.id, username: user.username });
    const refreshToken = generateRefreshToken();

    await prisma.session.create({
      data: {
        id: crypto.randomUUID(),
        userId: user.id,
        refreshToken,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] || 'unknown',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });

    await prisma.auditLog.create({
      data: { userId: user.id, action: 'login', ipAddress: req.ip }
    });

    logger.info('User logged in', { userId: user.id, username: user.username });
    res.json({ user, token, refreshToken });
  } catch (e) {
    next(e);
  }
});

router.get('/me', authenticateHTTP, (req, res) => {
  res.json({ user: req.user });
});

router.post('/logout', authenticateHTTP, async (req, res) => {
  await prisma.session.deleteMany({ where: { userId: req.user.id } });
  logger.info('User logged out', { userId: req.user.id });
  res.json({ message: 'Logged out' });
});

export default router;
