import express from 'express';
const router = express.Router();
import { authenticateHTTP } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validate.js';
import { strictLimiter } from '../middleware/rateLimit.js';
import prisma from '../config/database.js';
import Room from '../models/Room.js';

router.use(authenticateHTTP);
router.use(strictLimiter);

// Privacy: the People list is relationship-scoped. A user sees only people
// they share a dm/group room with (their "contacts"); everyone else is hidden
// until an invite creates that first conversation.
router.get('/', async (req, res) => {
  const related = await Room.listRelatedUserIds(req.user.id);
  const users = related.length
    ? await prisma.user.findMany({
      where: { isActive: true, id: { in: related } },
      orderBy: { username: 'asc' },
      select: { id: true, username: true, displayName: true, avatarColor: true, isActive: true, lastLoginAt: true }
    })
    : [];
  res.json({ users });
});

// Profile reads are scoped the same way: unrelated users get 404 (not 403, so
// the response does not even confirm the id exists). Self is always allowed —
// the profile panel shows the caller's own email.
router.get('/:id', validate(schemas.userIdParam, 'params'), async (req, res) => {
  const id = parseInt(req.params.id);
  if (id !== req.user.id) {
    const related = await Room.listRelatedUserIds(req.user.id);
    if (!related.includes(id)) {
      return res.status(404).json({ error: 'User not found' });
    }
  }
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, email: true, displayName: true, avatarColor: true }
  });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ user });
});

export default router;
