import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { encryptMessage, decryptMessage } from './lib/crypto.js';
import { classifyPriority } from './lib/groq.js';
import helmet from 'helmet';
import compression from 'compression';
import env from './config/env.js';
import logger from './utils/logger.js';
import crypto from 'crypto';
import escapeHtml from './utils/sanitize.js';
import { authenticateHTTP, authenticateSocket } from './middleware/auth.js';
import { generalLimiter } from './middleware/rateLimit.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import requestLogger from './middleware/requestLogger.js';
import { setPresence, deletePresence, getOnlineUsers, createRedisAdapter } from './lib/redis.js';
import { enqueueClassification, subscribeToPriorities } from './lib/queue.js';
import LRUCache from './lib/LRUCache.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import roomRoutes from './routes/rooms.js';
import inviteRoutes from './routes/invite.js';
import seedDatabase from './db/seed.js';
import Message from './models/Message.js';
import prisma from './config/database.js';

const app = express();
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
       scriptSrc: ["'self'", "'unsafe-inline'"],
       styleSrc: ["'self'", "'unsafe-inline'"],
       imgSrc: ["'self'", "data:", "https:"],
       connectSrc: ["'self'", "https:", "wss:", "ws:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
}));
app.use(compression());

app.use((req, res, next) => {
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-ID', req.id);
  next();
});

app.use(express.json());
app.use(cookieParser());
app.use(cors({
  origin: env.CORS_ORIGIN.split(',').map(o => o.trim()),
  credentials: true
}));
app.use(generalLimiter);
app.use(requestLogger);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/invite', inviteRoutes);

// Serve static client files (built frontend from Dockerfile)
app.use(express.static('public', { maxAge: '1y', etag: true }));

app.get('/', (req, res) => {
  res.json({ status: 'Chat server running' });
});

app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    logger.error('Health check DB error', { error: err.message });
    res.status(503).json({ status: 'error', db: 'disconnected', timestamp: new Date().toISOString() });
  }
});

// Catch-all: serve SPA index.html for client-side routes
app.get('*', (req, res, next) => {
  const isApi = req.path.startsWith('/api');
  const isSocket = req.path.startsWith('/socket.io');
  if (!isApi && !isSocket) {
    return res.sendFile(path.resolve('public', 'index.html'));
  }
  next();
});

app.use(notFound);
app.use(errorHandler);

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: env.CORS_ORIGIN.split(',').map(o => o.trim()),
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: env.NODE_ENV === 'production' ? ['websocket'] : ['websocket', 'polling']
});

// ponytail: Redis adapter makes io.to(room) fan out across every replica via
// pub/sub; without REDIS_URL this stays the default single-process adapter.
const redisAdapter = createRedisAdapter();
if (redisAdapter) {
  io.adapter(redisAdapter);
  logger.info('Socket.IO adapter: Redis (multi-instance)');
} else {
  logger.info('Socket.IO adapter: in-memory (single instance)');
}

io.use(authenticateSocket);

io.use((socket, next) => {
  const originalError = socket.error;
  socket.error = function (err) {
    logger.warn('Socket error', { socketId: socket.id, error: err.message });
    if (typeof originalError === 'function') originalError.call(this, err);
    next(err);
  };
  next();
});

io.engine.on('connection_error', (err) => {
  logger.error('Socket.IO connection error', { error: err.message, code: err.code });
  if (err && err.req) {
    logger.error('Connection error context', { url: err.req.url, origin: err.req.headers?.origin });
  }
});
// Worker results arrive via Redis pub/sub: update the local room cache and
// rebroadcast so every replica (and its clients) sees the final priority.
subscribeToPriorities(({ msgId, room, priority }) => {
  const arr = rooms[room];
  if (arr) {
    const idx = arr.findIndex((m) => m.id === msgId);
    if (idx !== -1) arr[idx].priority = priority;
  }
  io.to(room).emit('priority_updated', { id: msgId, priority });
});

const PORT = env.PORT;

// Local per-instance state: room routing is inherently instance-local in
// Socket.IO. The global online list lives in Redis (lib/redis.js) so every
// replica reports the same presence.
const users = new Map(); // socketId -> { nickname, currentRoom }
const rooms = { general: [], tech: [], random: [] };
const roomNames = ['general', 'tech', 'random'];
const roomDbCache = new LRUCache(200, 300_000); // Cache room DB lookups for 5 min

// Message batching: group high-frequency new_message emissions into a single
// broadcast every 50ms to reduce network overhead during message bursts.
const pendingMessages = new Map(); // room -> array of messageObjs
let batchTimer = null;

function emitMessageBatched(room, messageObj) {
  if (!pendingMessages.has(room)) pendingMessages.set(room, []);
  pendingMessages.get(room).push(messageObj);

  if (!batchTimer) {
    batchTimer = setTimeout(() => {
      for (const [room, msgs] of pendingMessages) {
        if (msgs.length === 1) {
          io.to(room).emit('new_message', msgs[0]);
        } else {
          io.to(room).emit('new_messages_batch', msgs);
        }
      }
      pendingMessages.clear();
      batchTimer = null;
    }, 50);
  }
}

function getUsersInRoom(room) {
  return [...users.values()]
    .filter(u => u.currentRoom === room)
    .map(u => ({ nickname: u.nickname }));
}

io.on('connection', (socket) => {
  logger.info('User connected', { socketId: socket.id });

  // Disconnect idle sockets that never join a room (5 min timeout)
  const idleTimer = setTimeout(() => {
    const user = users.get(socket.id);
    if (user && !user.currentRoom) {
      socket.disconnect(true);
    }
  }, 5 * 60 * 1000);

  socket.on('disconnect', async () => {
    clearTimeout(idleTimer);
    const user = users.get(socket.id);
    if (user) {
      logger.info(`${user.nickname} disconnected`, { socketId: socket.id });
      users.delete(socket.id);
      await deletePresence(socket.id);
      io.emit('online_users', await getOnlineUsers());
      io.emit('user_left', { nickname: user.nickname });
    }
  });

  // 1a. User joins with nickname
  socket.on('user_join', async ({ nickname }) => {
    if (!socket.user) {
      socket.emit('error', { message: 'Authentication required' });
      return;
    }
    const effectiveNickname = socket.user.displayName || socket.user.username || nickname;
    if (typeof effectiveNickname !== 'string' || effectiveNickname.length === 0 || effectiveNickname.length > 50) {
      socket.emit('error', { message: 'Invalid nickname' });
      return;
    }
    users.set(socket.id, { nickname: effectiveNickname, currentRoom: null });
    await setPresence(socket.id, { nickname: effectiveNickname });
    logger.info(`${effectiveNickname} joined`, { socketId: socket.id });

    io.emit('online_users', await getOnlineUsers());
    io.emit('user_joined', { nickname: effectiveNickname });
    socket.emit('room_list', roomNames);
  });

  // 2a/2b. Join a room
  socket.on('join_room', async ({ room }) => {
    if (typeof room !== 'string' || room.length === 0 || room.length > 50) {
      socket.emit('error', { message: 'Invalid room name' });
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(room)) {
      socket.emit('error', { message: 'Room name can only contain letters, numbers, hyphens, underscores' });
      return;
    }
    const user = users.get(socket.id);
    if (!user) return;

    // Leave previous room
    if (user.currentRoom) {
      socket.leave(user.currentRoom);
    }

    user.currentRoom = room;
    socket.join(room);

    // Add user to room_members table so they can access messages via REST API
    try {
      let roomRow = roomDbCache.get(room);
      if (!roomRow) {
        roomRow = await prisma.room.findUnique({ where: { name: room }, select: { id: true } });
        if (roomRow) roomDbCache.set(room, roomRow);
      }
      if (roomRow && socket.user?.id) {
        await prisma.roomMember.upsert({
          where: { roomId_userId: { roomId: roomRow.id, userId: socket.user.id } },
          update: {},
          create: { roomId: roomRow.id, userId: socket.user.id, role: 'member' }
        });
      }
    } catch (err) {
      logger.error('Failed to add user to room_members', { error: err.message });
    }

    // Load messages from memory (fast) + fill from DB if memory is empty
    let roomMessages = rooms[room] || [];
    if (roomMessages.length === 0) {
      try {
        let roomRow = roomDbCache.get(`${room}:full`);
        if (!roomRow) {
          roomRow = await prisma.room.findUnique({ where: { name: room } });
          if (roomRow) roomDbCache.set(`${room}:full`, roomRow);
        }
        if (roomRow) {
          const dbMessages = await Message.listByRoom(roomRow.id, { limit: 50 });
          roomMessages = dbMessages.map(m => ({
            id: String(m.id),
            nickname: m.username,
            content: decryptMessage({ encrypted: m.encryptedContent, iv: m.iv, authTag: m.authTag }),
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
    logger.info(`${user.nickname} joined room`, { room, socketId: socket.id });
  });

  // 2b. Create a new room
  const roomCreationTracker = new Map();
  socket.on('create_room', async ({ room }) => {
    if (typeof room !== 'string' || room.length === 0 || room.length > 50) {
      socket.emit('error', { message: 'Invalid room name' });
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(room)) {
      socket.emit('error', { message: 'Room name can only contain letters, numbers, hyphens, underscores' });
      return;
    }
    if (!socket.user) {
      socket.emit('error', { message: 'Authentication required' });
      return;
    }
    if (rooms[room]) {
      socket.emit('error', { message: 'Room already exists' });
      return;
    }
    const userId = socket.user.id;
    const now = Date.now();
    const userCreations = roomCreationTracker.get(userId) || [];
    const recentCreations = userCreations.filter(t => now - t < 3600000);
    if (recentCreations.length >= 5) {
      socket.emit('error', { message: 'Room creation limit reached (5 per hour)' });
      return;
    }
    recentCreations.push(now);
    roomCreationTracker.set(userId, recentCreations);
    rooms[room] = [];
    roomNames.push(room);
    io.emit('room_created', { room });
    io.emit('room_list', roomNames);

    try {
      await prisma.room.upsert({
        where: { name: room },
        update: {},
        create: { name: room, description: `${room} room`, type: 'public' }
      });
    } catch (err) {
      logger.error('Failed to persist room', { error: err.message });
    }
  });

  // 2c. Send message
  socket.on('send_message', async (data) => {
    try {
      if (typeof data?.message !== 'string' || data.message.length === 0 || data.message.length > 5000) {
        socket.emit('error', { message: 'Message must be a non-empty string up to 5000 characters' });
        return;
      }
      if (typeof data?.room !== 'string' || data.room.length === 0 || data.room.length > 50) {
        socket.emit('error', { message: 'Invalid room name' });
        return;
      }
      if (!socket.user) {
        socket.emit('error', { message: 'Authentication required' });
        return;
      }
      const effectiveNickname = socket.user.username;
      const sanitized = escapeHtml(data.message);
      const encrypted = encryptMessage(sanitized);
      const parentId = typeof data?.parent_id === 'string' ? data.parent_id : null;

      const messageObj = {
        id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        nickname: effectiveNickname,
        username: effectiveNickname,
        content: sanitized,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        encryptedContent: encrypted.encrypted,
        priority: 'fyi',
        timestamp: Date.now(),
        room: data.room,
        status: 'delivered',
        parentId: parentId
      };

      if (!rooms[data.room]) rooms[data.room] = [];
      rooms[data.room].push(messageObj);
      if (rooms[data.room].length > 100) rooms[data.room].shift();

      emitMessageBatched(data.room, messageObj);
      socket.emit('message_delivered', { id: messageObj.id });

      if (parentId) {
        io.to(data.room).emit('thread_reply', {
          parentId,
          reply: {
            id: messageObj.id,
            nickname: messageObj.nickname,
            content: messageObj.content,
            iv: messageObj.iv,
            authTag: messageObj.authTag,
            timestamp: messageObj.timestamp,
            priority: messageObj.priority
          }
        });
      }

      // Classification is offloaded to the BullMQ worker when Redis is
      // available; enqueue failures fall back to inline so delivery never
      // depends on the AI path.
      let queued = false;
      try {
        queued = await enqueueClassification({ msgId: messageObj.id, room: data.room, message: data.message });
      } catch (queueErr) {
        logger.error('Enqueue failed, falling back inline', { error: queueErr.message });
      }
      if (!queued) {
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
          .catch(err => logger.error('Priority classification failed', { error: err }));
      }

      (async () => {
        try {
          let roomRow = roomDbCache.get(data.room);
          if (!roomRow) {
            roomRow = await prisma.room.findUnique({ where: { name: data.room } });
            if (roomRow) roomDbCache.set(data.room, roomRow);
          }
          if (roomRow) {
            await Message.create({
              room_id: roomRow.id,
              user_id: socket.user?.id || null,
              username: effectiveNickname,
              encrypted_content: encrypted.encrypted,
              iv: encrypted.iv,
              auth_tag: encrypted.authTag,
              priority: 'fyi',
              parent_id: parentId
            });
          }
        } catch (dbErr) {
          logger.error('Failed to save message to DB', { error: dbErr.message });
        }
      })();
    } catch (err) {
      logger.error('Error sending message', { error: err.message, socketId: socket.id });
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
});

app.use(notFound);
app.use(errorHandler);

seedDatabase().catch(e => logger.error('Seed failed', e));

// Load existing rooms from DB into memory
const dbRooms = await prisma.room.findMany({ where: { isArchived: false }, select: { name: true } });
for (const r of dbRooms) {
  if (!roomNames.includes(r.name)) roomNames.push(r.name);
  if (!rooms[r.name]) rooms[r.name] = [];
}
logger.info(`Loaded ${dbRooms.length} rooms from database`);

const server = httpServer.listen(PORT, () => {
  logger.info(`Server on port ${PORT}`);
  logger.info(`${env.NODE_ENV} | CORS: ${env.CORS_ORIGIN}`);
  logger.info(`DB: PostgreSQL (Prisma) | Auth: JWT ${env.JWT_EXPIRES_IN}`);
});

// Graceful shutdown
const shutdown = async (signal) => {
  logger.info(`Received ${signal}, shutting down gracefully`);
  io.close(() => {
    logger.info('Socket.IO closed');
  });
  server.close(async () => {
    await prisma.$disconnect();
    logger.info('Server shut down');
    process.exit(0);
  });
  setTimeout(() => {
    logger.error('Force shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason: reason?.message || String(reason), stack: reason?.stack });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
  shutdown('uncaughtException');
});
