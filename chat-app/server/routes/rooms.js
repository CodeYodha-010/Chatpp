import express from 'express';
const router = express.Router();
import { authenticateHTTP } from '../middleware/auth.js';
import Room from '../models/Room.js';
import Message from '../models/Message.js';

router.use(authenticateHTTP);

router.get('/', async (req, res, next) => {
  try {
    const rooms = await Room.listVisible(req.user.id);
    res.json({ rooms });
  } catch (err) { next(err); }
});

// The contacts-only rework removed public rooms entirely, so there is no
// room-creation endpoint any more: DMs are created implicitly from the People
// panel and groups from the New group flow. 410 tells a stale client the
// capability is gone for good, not merely that the request was malformed.
router.post('/', (req, res) => {
  res.status(410).json({
    error: 'Public rooms were removed. Start a DM from the People panel or create a group with the New group button.'
  });
});

router.get('/:id/members', async (req, res, next) => {
  try {
    const roomId = parseInt(req.params.id);
    if (Number.isNaN(roomId)) return res.status(400).json({ error: 'Invalid room id' });
    const roomRow = await Room.findById(roomId);
    if (!roomRow) return res.status(404).json({ error: 'Conversation not found' });
    // Group rosters are membership secrets: only members may read them, which
    // also keeps outsiders from mining group membership through the REST API.
    const isMember = await Room.isMember(roomId, req.user.id);
    if (!isMember) return res.status(403).json({ error: 'Not a member of this conversation' });
    const members = await Room.getMembers(roomId);
    const label = roomRow.type === 'group' ? (roomRow.description || roomRow.name) : roomRow.name;
    res.json({ room: { id: roomRow.id, name: roomRow.name, label, type: roomRow.type, ownerId: roomRow.createdBy }, members });
  } catch (err) { next(err); }
});

router.get('/:id/messages', async (req, res, next) => {
  try {
    const roomId = parseInt(req.params.id);
    if (Number.isNaN(roomId)) return res.status(400).json({ error: 'Invalid room id' });
    const rawLimit = parseInt(req.query.limit);
    const limit = Math.min(Number.isNaN(rawLimit) ? 50 : rawLimit, 100);
    const rawBefore = req.query.before ? parseInt(req.query.before) : null;
    const before = rawBefore !== null && Number.isNaN(rawBefore) ? null : rawBefore;

    // Privacy gate: DMs and groups are participant-only. Public rooms stay
    // open to any authenticated user — anyone could join them in one step,
    // so reading does not leak anything membership would hide.
    const roomRow = await Room.findById(roomId);
    if (!roomRow) return res.status(404).json({ error: 'Room not found' });
    if (roomRow.type === 'dm' || roomRow.type === 'group') {
      const isMember = await Room.isMember(roomId, req.user.id);
      if (!isMember) return res.status(403).json({ error: 'Not a member of this conversation' });
    }

    const messages = await Message.listByRoom(roomId, { limit, before, userId: req.user.id });
    res.json({ messages });
  } catch (err) {
    next(err);
  }
});

export default router;
