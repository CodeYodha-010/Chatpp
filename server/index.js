import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { encryptMessage } from './lib/crypto.js';
import { classifyPriority } from './lib/groq.js';
import helmet from 'helmet';
import compression from 'compression';
import env from './config/env.js';
import logger from './utils/logger.js';
import { authenticateHTTP, authenticateSocket } from './middleware/auth.js';
import { generalLimiter } from './middleware/rateLimit.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import requestLogger from './middleware/requestLogger.js';
import { setPresence, deletePresence, getOnlineUsers } from './lib/redis.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import roomRoutes from './routes/rooms.js';
import seedDatabase from './db/seed.js';
import Message from './models/Message.js';
import prisma from './config/database.js';

const app = express();
app.use(helmet());
app.use(compression());
app.use(express.json());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(generalLimiter);
app.use(requestLogger);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/rooms', roomRoutes);

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: env.CORS_ORIGIN, methods: ['GET', 'POST'], credentials: true }
});
io.use(authenticateSocket);

const PORT = env.PORT;

// Local per-instance state: room routing is inherently instance-local in
// Socket.IO. The global online list lives in Redis (lib/redis.js) so every
// replica reports the same presence.
const users = new Map(); // socketId -> { nickname, currentRoom }
const rooms = { general: [], tech: [], random: [] };
const roomNames = ['general', 'tech', 'random'];

function getUsersInRoom(room) {
  return [...users.values()]
    .filter(u => u.currentRoom === room)
    .map(u => ({ nickname: u.nickname }));
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // 1a. User joins with nickname
  socket.on('user_join', async ({ nickname }) => {
    const effectiveNickname = socket.user?.displayName || socket.user?.username || nickname;
    users.set(socket.id, { nickname: effectiveNickname, currentRoom: null });
    await setPresence(socket.id, { nickname: effectiveNickname });
    console.log(`${effectiveNickname} joined`);

    io.emit('online_users', await getOnlineUsers());
    io.emit('user_joined', { nickname: effectiveNickname });
    socket.emit('room_list', roomNames);
  });

  // 2a/2b. Join a room
  socket.on('join_room', async ({ room }) => {
    const user = users.get(socket.id);
    if (!user) return;

    // Leave previous room
    if (user.currentRoom) {
      socket.leave(user.currentRoom);
    }

    user.currentRoom = room;
    socket.join(room);

    // Load messages from memory (fast) + fill from DB if memory is empty
    let roomMessages = rooms[room] || [];
    if (roomMessages.length === 0) {
      try {
        const roomRow = await prisma.room.findUnique({ where: { name: room } });
        if (roomRow) {
          const dbMessages = await Message.listByRoom(roomRow.id, { limit: 50 });
          roomMessages = dbMessages.map(m => ({
            id: String(m.id),
            nickname: m.username,
            content: m.encryptedContent,
            iv: m.iv,
            authTag: m.authTag,
            priority: m.priority,
            timestamp: m.createdAt.getTime(),
            room: room,
            status: 'delivered'
          }));
          rooms[room] = roomMessages;
        }
      } catch (dbErr) {
        logger.error('Failed to load messages from DB', { error: dbErr.message });
      }
    }

    socket.emit('room_joined', { room, messages: roomMessages });
    console.log(`${user.nickname} joined room: ${room}`);
  });

  // 2b. Create a new room
  socket.on('create_room', ({ room }) => {
    if (!room || rooms[room]) return;
    rooms[room] = [];
    roomNames.push(room);
    io.emit('room_created', { room });
    io.emit('room_list', roomNames);
  });

  // 2c. Send message
  socket.on('send_message', async (data) => {
    try {
      const effectiveNickname = socket.user?.username || data.nickname;
      const encrypted = encryptMessage(data.message);

      const messageObj = {
        id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        nickname: effectiveNickname,
        username: effectiveNickname,
        content: encrypted.encrypted,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        priority: 'fyi',
        timestamp: Date.now(),
        room: data.room,
        status: 'delivered'
      };

      if (!rooms[data.room]) rooms[data.room] = [];
      rooms[data.room].push(messageObj);
      if (rooms[data.room].length > 100) rooms[data.room].shift();

      io.to(data.room).emit('new_message', messageObj);
      socket.emit('message_delivered', { id: messageObj.id });

      classifyPriority(data.message)
        .then(finalPriority => {
          if (finalPriority && finalPriority !== 'fyi') {
            const msgIndex = rooms[data.room].findIndex(m => m.id === messageObj.id);
            if (msgIndex !== -1) {
              rooms[data.room][msgIndex].priority = finalPriority;
              io.to(data.room).emit('priority_updated', { id: messageObj.id, priority: finalPriority });
            }
          }
        })
        .catch(err => console.error('Priority classification failed:', err));

      (async () => {
        try {
          const roomRow = await prisma.room.findUnique({ where: { name: data.room } });
          if (roomRow) {
            await Message.create({
              room_id: roomRow.id,
              user_id: socket.user?.id || null,
              username: effectiveNickname,
              encrypted_content: encrypted.encrypted,
              iv: encrypted.iv,
              auth_tag: encrypted.authTag,
              priority: 'fyi',
              parent_id: null
            });
          }
        } catch (dbErr) {
          logger.error('Failed to save message to DB', { error: dbErr.message });
        }
      })();
    } catch (err) {
      console.error('Error sending message:', err);
      socket.emit('error', { message: 'Failed to send' });
    }
  });

  // 3c. Typing indicator
  socket.on('typing', ({ room }) => {
    const n = socket.user?.username;
    if (n) socket.to(room).emit('user_typing', { nickname: n });
  });

  socket.on('stop_typing', ({ room }) => {
    const n = socket.user?.username;
    if (n) socket.to(room).emit('user_stop_typing', { nickname: n });
  });

  socket.on('get_decryption_key', () => {
    if (!socket.user) return socket.emit('error', { message: 'Unauthorized' });
    socket.emit('decryption_key', {
      key: process.env.CHAT_ENCRYPTION_KEY
    });
  });

  // 1c. Handle disconnect
  socket.on('disconnect', async () => {
    const user = users.get(socket.id);
    if (user) {
      console.log(`${user.nickname} disconnected`);
      users.delete(socket.id);
      await deletePresence(socket.id);
      io.emit('online_users', await getOnlineUsers());
      io.emit('user_left', { nickname: user.nickname });
    }
  });
});

app.get('/api/get_key', authenticateHTTP, (req, res) => {
  res.set('Cache-Control', 'private, max-age=3600');
  res.json({
    key: process.env.CHAT_ENCRYPTION_KEY
  });
});

app.get('/', (req, res) => {
  res.json({ status: 'Chat server running' });
});

app.use(notFound);
app.use(errorHandler);

seedDatabase().catch(e => logger.error('Seed failed', e));

httpServer.listen(PORT, () => {
  logger.info(`Server on port ${PORT}`);
  logger.info(`${env.NODE_ENV} | CORS: ${env.CORS_ORIGIN}`);
  logger.info(`DB: PostgreSQL (Prisma) | Auth: JWT ${env.JWT_EXPIRES_IN}`);
});