import express from 'express';
const router = express.Router();
import { authenticateHTTP } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validate.js';
import Room from '../models/Room.js';
import Message from '../models/Message.js';

router.use(authenticateHTTP);

router.get('/', async (req, res, next) => {
  try {
    const rooms = await Room.listVisible(req.user.id);
    res.json({ rooms });
  } catch (err) { next(err); }
});

router.post('/', validate(schemas.createRoom), async (req, res, next) => {
  try {
    const { name, description, type } = req.body;

    if (type === 'group') {
      return res.status(422).json({ error: 'Groups are created from the New group button, not the room endpoint' });
    }
    if (await Room.findByName(name)) {
      return res.status(409).json({ error: 'Room name already exists' });
    }

    const room = await Room.create({ name, description, type: 'public', created_by: req.user.id });
    await Room.addMember(room.id, req.user.id, 'admin');
    res.status(201).json({ room });
  } catch (err) {
    next(err); // async DB failures must 500, not crash the process
  }
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
