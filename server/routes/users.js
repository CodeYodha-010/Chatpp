import express from 'express';
const router = express.Router();
import { authenticateHTTP } from '../middleware/auth.js';
import prisma from '../config/database.js';

router.use(authenticateHTTP);

router.get('/', async (req, res) => {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    orderBy: { username: 'asc' },
    select: { id: true, username: true, displayName: true, avatarColor: true, isActive: true, lastLoginAt: true }
  });
  res.json({ users });
});

router.get('/:id', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: parseInt(req.params.id) },
    select: { id: true, username: true, email: true, displayName: true, avatarColor: true }
  });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ user });
});

export default router;
