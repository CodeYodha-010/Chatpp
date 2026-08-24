import express from 'express';
const router = express.Router();
import { authenticateHTTP } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validate.js';
import Room from '../models/Room.js';
import Message from '../models/Message.js';

router.use(authenticateHTTP);

router.get('/', async (req, res) => {
  const rooms = await Room.list();
  res.json({ rooms });
});

router.post('/', validate(schemas.createRoom), async (req, res) => {
  const { name, description, type } = req.body;

  if (await Room.findByName(name)) {
    return res.status(409).json({ error: 'Room name already exists' });
  }

  const room = await Room.create({ name, description, type, created_by: req.user.id });
  await Room.addMember(room.id, req.user.id, 'admin');
  res.status(201).json({ room });
});

router.get('/:id/messages', async (req, res) => {
  const roomId = parseInt(req.params.id);
  if (Number.isNaN(roomId)) return res.status(400).json({ error: 'Invalid room id' });
  const rawLimit = parseInt(req.query.limit);
  const limit = Math.min(Number.isNaN(rawLimit) ? 50 : rawLimit, 100);
  const rawBefore = req.query.before ? parseInt(req.query.before) : null;
  const before = rawBefore !== null && Number.isNaN(rawBefore) ? null : rawBefore;

  const messages = await Message.listByRoom(roomId, { limit, before });
  res.json({ messages });
});

export default router;
