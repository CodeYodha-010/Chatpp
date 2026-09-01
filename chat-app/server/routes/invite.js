import express from 'express';
const router = express.Router();
import { authenticateHTTP } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validate.js';
import { strictLimiter } from '../middleware/rateLimit.js';
import prisma from '../config/database.js';

router.use(authenticateHTTP);

router.use(strictLimiter);

router.post('/', validate(schemas.invite), async (req, res) => {
  const { username } = req.body;
  const inviterId = req.user.id;

  if (!username || typeof username !== 'string') {
    return res.status(400).json({ error: 'Username is required' });
  }

  try {
    const targetUser = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      select: { id: true, username: true, displayName: true }
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (targetUser.id === inviterId) {
      return res.status(400).json({ error: 'Cannot invite yourself' });
    }

    const names = [req.user.username, targetUser.username].sort();
    const roomName = 'dm_' + names.join('_');

    res.json({
      message: 'Invite sent! You can now chat with @' + targetUser.username,
      room: roomName,
      user: targetUser
    });
  } catch (err) {
    console.error('Invite failed:', err);
    res.status(500).json({ error: 'Failed to send invite' });
  }
});

export default router;
