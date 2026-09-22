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
import requestLogger, { responseTime } from './middleware/requestLogger.js';
import { setPresence, deletePresence, getOnlineUsers, getRedis, createRedisAdapter, connectRedis, disconnectRedis } from './lib/redis.js';
// Shared transcript cache: in-process map first (zero latency), Redis second
// (survives deploys and is shared across instances), Neon only on a miss.
// The process map and Redis both hold the viewer-neutral transcript; the
// join-time viewer filter (hidden ids, clear cutoff) always runs on top.
import { getCachedTranscript, setCachedTranscript, invalidateCachedTranscript } from './lib/transcriptCache.js';
import { enqueueClassification, subscribeToPriorities } from './lib/queue.js';
import LRUCache from './lib/LRUCache.js';
// Privacy: per-user nickname allow-lists for scoped presence broadcasts.
// TTL 30s keeps a fresh DM/group visible quickly; explicit invalidation in
// create_dm / createGroup / membership changes keeps it correct.
const relatedNickCache = new LRUCache(500, 30_000);

// Nicknames a given user is allowed to see online: their contacts (shared
// dm/group) plus themselves. One round-trip: the relationship filter runs
// nested in the WHERE (same shape as GET /api/users) instead of fetching
// related ids and then the user rows. null = unauthenticated/legacy.
async function relatedNicknames(userId, selfName) {
  if (userId == null) return null;
  const key = 'relnick:' + userId;
  const hit = relatedNickCache.get(key);
  if (hit) return hit;
  const rows = await prisma.user.findMany({
    where: {
      isActive: true,
      id: { not: userId },
      memberships: {
        some: { room: { type: { in: ['dm', 'group'] }, memberships: { some: { userId } } } }
      }
    },
    select: { displayName: true, username: true }
  });
  const set = new Set(rows.map((u) => u.displayName || u.username));
  if (selfName) set.add(selfName);
  relatedNickCache.set(key, set);
  return set;
}

// Every connected socket receives online_users filtered to its own related
// set — never the global list.
async function emitScopedOnlineUsers() {
  const online = await getOnlineUsers();
  const sockets = await io.fetchSockets();
  const perUser = new Map();
  for (const s of sockets) {
    const uid = s.user?.id;
    if (uid == null) continue;
    let allowed = perUser.get(uid);
    if (allowed === undefined) {
      allowed = await relatedNicknames(uid, s.user.displayName || s.user.username);
      perUser.set(uid, allowed);
    }
    // getOnlineUsers() returns { nickname, currentRoom } rows, so the scope test
    // must read the nickname: comparing the object against a Set of strings
    // would drop every real user and every socket would look alone.
    s.emit('online_users', allowed ? online.filter((n) => allowed.has(n.nickname)) : online);
  }
}

// user_joined / user_left announcements are presence too — only sockets
// related to that nickname receive them.
async function emitPresenceEvent(event, nickname) {
  const sockets = await io.fetchSockets();
  const perUser = new Map();
  for (const s of sockets) {
    const uid = s.user?.id;
    if (uid == null) continue;
    let allowed = perUser.get(uid);
    if (allowed === undefined) {
      allowed = await relatedNicknames(uid, s.user.displayName || s.user.username);
      perUser.set(uid, allowed);
    }
    const isSelf = (s.user.displayName || s.user.username) === nickname;
    if (!allowed || allowed.has(nickname) || isSelf) s.emit(event, { nickname });
  }
}

function invalidateRelatedNicknames(userId) {
  if (userId != null) relatedNickCache.delete('relnick:' + userId);
}

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import roomRoutes from './routes/rooms.js';
import inviteRoutes from './routes/invite.js';
import seedDatabase from './db/seed.js';
import Message from './models/Message.js';
import Reaction from './models/Reaction.js';
import Room from './models/Room.js';
import { attachReactions, reactionPayload } from './lib/reactions.js';
import { createReactionWriter } from './lib/reactionWriter.js';
import prisma, { withDb, isDbConnected, shutdownDb, isDeadConnection } from './config/database.js';

const app = express();

// Trust Render reverse proxy (required for rate limiting + IP detection)
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: [
        "'self'",
        "https://chatpp-6zzn.onrender.com",
        "wss://chatpp-6zzn.onrender.com",
        "https:", "wss:", "ws:"
      ],
      fontSrc: ["'self'", "data:", "https:", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  permissionsPolicy: {
    camera: [],
    microphone: [],
    geolocation: []
  }
}));
app.use(compression());

app.use((req, res, next) => {
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-ID', req.id);
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());
app.use(cors({
  origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',').map(o => o.trim()),
  credentials: true
}));
app.use(generalLimiter);
app.use(responseTime);
app.use(requestLogger);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/invite', inviteRoutes);

// Serve static client files in production (built frontend copied via Dockerfile)
if (env.NODE_ENV === 'production') {
  app.use(express.static(path.join(path.resolve(), 'public'), {
    maxAge: '1y',
    etag: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      }
    }
  }));
}

// Root route - serve SPA in production, JSON status in dev
app.get('/', (req, res) => {
  if (env.NODE_ENV === 'production') {
    res.sendFile(path.join(path.resolve(), 'public', 'index.html'));
  } else {
    res.json({ status: 'Chat server running' });
  }
});

app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: env.NODE_ENV,
    memory: process.memoryUsage ? process.memoryUsage() : null
  });
});

// Health checks must not borrow a pool slot on every probe: Render pings often,
// and each probe competes with real traffic for the same small pool -- which is
// how a busy probe schedule helps starve logins. Re-verify with a real query at
// most once a minute; report the tracked state in between.
let lastDbProbeAt = 0;
let lastDbProbeOk = false;
async function dbHealth() {
  if (Date.now() - lastDbProbeAt > 60000) {
    lastDbProbeAt = Date.now();
    try {
      await withDb(() => prisma.$queryRawUnsafe('SELECT 1'));
      lastDbProbeOk = true;
    } catch (err) {
      lastDbProbeOk = false;
      logger.error('Health check DB error', { error: err.message });
    }
  }
  return lastDbProbeOk ? 'connected' : (isDbConnected() ? 'connected' : 'connecting');
}

app.get('/health', async (req, res) => {
  const checks = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    uptime: Math.floor(process.uptime()),
    environment: env.NODE_ENV,
  };

  checks.db = await dbHealth();

  // Redis status (if configured)
  checks.redis = env.REDIS_URL ? 'configured' : 'not-configured';

  const hasEncryptionKey = !!process.env.CHAT_ENCRYPTION_KEY;
  const hasGroqKey = !!process.env.GROQ_API_KEY;
  checks.encryption = hasEncryptionKey ? 'persistent' : 'volatile (will not survive restart)';
  checks.ai_classification = hasGroqKey ? 'enabled' : 'disabled';

      // Always return 200 as long as server process is alive — lets Railway healthchecks work
  // even when DB is still connecting (e.g., slow Postgres cold start on Railway)
  const statusCode = checks.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(checks);
});

// Catch-all: serve SPA index.html for client-side routes (production only)
app.get('*', (req, res, next) => {
  if (env.NODE_ENV === 'production') {
    const isApi = req.path.startsWith('/api');
    const isSocket = req.path.startsWith('/socket.io');
    if (!isApi && !isSocket) {
      return res.sendFile(path.join(path.resolve(), 'public', 'index.html'));
    }
  }
  next();
});

app.use(notFound);
app.use(errorHandler);

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',').map(o => o.trim()),
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

const PORT = Number(process.env.PORT) || env.PORT || 3001;
const HOST = "0.0.0.0";

// Safety net: an unhandled promise rejection (e.g. an async Express route that
// escapes its handler, or a fire-and-forget DB call) must log, not kill the
// process — with Express 4 there is no automatic async-error routing.
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { error: reason?.message || String(reason) });
});

console.log("[STARTUP] Starting HTTP server on " + HOST + ":" + PORT);

// Local per-instance state: room routing is inherently instance-local in
// Socket.IO. The global online list lives in Redis (lib/redis.js) so every
// replica reports the same presence.
const users = new Map(); // socketId -> { nickname, currentRoom }
const rooms = {};
const roomNames = [];
const roomDbCache = new LRUCache(200, 300_000); // Cache room DB lookups for 5 min

// Membership-safe gate cache: one query answers "does this room exist AND is
// the caller a member", and caching that answer removes the gate's database
// round-trip on repeats. Allowed answers live 60s; denied answers only 5s so a
// freshly invited user is never told "not a member" by a stale negative. The
// key embeds a per-room epoch, so invalidateRoomGate() drops every user's
// entry for a room with one write instead of iterating keys.
const gateAllowCache = new LRUCache(2000, 60_000);
const gateDenyCache = new LRUCache(2000, 5_000);
const gateEpoch = new LRUCache(2000, 300_000);

function invalidateRoomGate(room) {
  gateEpoch.set(room, (gateEpoch.get(room) || 0) + 1);
}

function gateKey(room, userId) {
  return `${room}:${gateEpoch.get(room) || 0}:${userId}`;
}

const saveReaction = createReactionWriter(prisma);

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

// Privacy gate for room access. WhatsApp-style: every conversation is a DM or
// group and requires an explicit room_members row. Rooms with no DB row are
// rejected — there are no open public rooms.
async function roomGate(socket, room) {
  if (!socket.user?.id) return { ok: false, reason: 'Authentication required' };
  const userId = socket.user.id;
  const cacheKey = gateKey(room, userId);
  const allowed = gateAllowCache.get(cacheKey);
  if (allowed) return { ok: true, row: allowed };
  if (gateDenyCache.get(cacheKey)) {
    return { ok: false, reason: 'You are not a member of this conversation' };
  }
  // One query proves both row existence and membership: a room the caller is
  // not a member of returns null, so no second lookup is needed and an
  // outsider cannot pass by guessing a room name.
  let gateRow = null;
  try {
    gateRow = await prisma.room.findFirst({
      where: { name: room, memberships: { some: { userId } } },
      select: { id: true, type: true }
    });
  } catch (err) {
    logger.error('Room lookup failed', { error: err.message, room });
    return { ok: false, reason: 'Could not open that conversation' };
  }
  if (!gateRow) {
    gateDenyCache.set(cacheKey, true);
    return { ok: false, reason: 'You are not a member of this conversation' };
  }
  gateAllowCache.set(cacheKey, gateRow);
  return { ok: true, row: gateRow };
}

// Neon's pooler intermittently refuses a connection under load. One retry keeps
// a convenience refresh from silently dropping; callers still see the error if
// the retry fails too.
async function withDbRetry(fn, attempts = 2) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (err) {
      lastErr = err;
      // Use the shared classifier rather than P2024 alone: a rebuild window
      // also surfaces P2028 and "Engine is not yet connected".
      if (!isDeadConnection(err)) break;
    }
  }
  throw lastErr;
}

// Sidebar payload for one user: only their DMs/groups, each with
// the label to display (a DM shows the other person's name).
async function emitConversationList(userId, target) {
  if (!userId) return;
  try {
    (target || io).emit('conversation_list', await withDbRetry(() => Room.listForUser(userId)));
  } catch (err) {
    logger.error('Failed to build conversation list', { error: err.message, userId });
  }
}

function getUsersInRoom(room) {
  return [...users.values()]
    .filter(u => u.currentRoom === room)
    .map(u => ({ nickname: u.nickname }));
}

io.on('connection', (socket) => {
  logger.info('User connected', { socketId: socket.id });

  // Per-user channel. Lets the server reach one account (e.g. "someone started
  // a conversation with you") without knowing which socket ids it holds; the
  // existing maps are keyed the other way round (socket id -> user).
  if (socket.user?.id) socket.join('user:' + socket.user.id);

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
      await emitScopedOnlineUsers();
      await emitPresenceEvent('user_left', user.nickname);
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

    await emitScopedOnlineUsers();
    await emitPresenceEvent('user_joined', effectiveNickname);
    socket.emit('room_list', roomNames);
    await emitConversationList(socket.user?.id, socket);
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

    // Gate before joining: only DM/group members may enter. There are no open
    // rooms, and membership is never self-granted at join time.
    const gate = await roomGate(socket, room);
    if (!gate.ok) {
      socket.emit('error', { message: gate.reason });
      return;
    }
    const roomRow = gate.row;

    // Leave previous room
    if (user.currentRoom) {
      socket.leave(user.currentRoom);
    }

    user.currentRoom = room;
    socket.join(room);

    // The gate already proved membership and returned the row — reuse it
    // instead of looking the same room up again. Everything this join needs
    // (viewer filters, transcript, reactions) depends only on roomRow.id, so
    // the DB path below fires as ONE parallel round instead of three awaited
    // stages (viewer filters → messages → reactions).
    const viewerId = socket.user?.id;
    const viewerRelevant = viewerId != null;
    let hiddenIds = null;
    let clearedAt = null;
    let filterInputsOk = true;
    // Transcript fast path: memory -> Redis -> Neon. The cache holds the
    // viewer-neutral transcript only; the per-viewer hide/clear filter below
    // runs on top of either source, so nothing user-specific is ever cached.
    let roomMessages = [];
    let fromCache = false;
    if (viewerRelevant) {
      const cached = await getCachedTranscript(room);
      if (cached) {
        roomMessages = cached;
        fromCache = true;
      }
    }
    if (!fromCache) {
      try {
        const [hidden, cleared, dbMessages] = await Promise.all([
          viewerRelevant
            ? prisma.hiddenMessage.findMany({ where: { userId: Number(viewerId) }, select: { messageId: true } })
            : Promise.resolve(null),
          viewerRelevant
            ? prisma.clearedConversation.findUnique({ where: { userId_roomId: { userId: Number(viewerId), roomId: roomRow.id } } })
            : Promise.resolve(null),
          Message.listByRoom(roomRow.id, { limit: 50, userId: null, withReactions: true })
        ]);
        hiddenIds = new Set((hidden || []).map((h) => h.messageId));
        clearedAt = cleared ? cleared.clearedAt : null;
        roomMessages = dbMessages.map((m) => ({
          id: String(m.id),
          userId: m.userId,
          nickname: m.username,
          content: decryptMessage({ encrypted: m.encryptedContent, iv: m.iv, authTag: m.authTag }),
          priority: m.priority,
          timestamp: m.createdAt.getTime(),
          room: room,
          status: 'delivered',
          // Reactions arrived inside the same round-trip. attachReactions()
          // consumes flat [{ messageId, userId, emoji }] rows.
          _reactionRows: m.reactions || []
        }));
        rooms[room] = roomMessages;
      } catch (dbErr) {
        logger.error('Failed to load transcript from DB', { error: dbErr.message, room });
      }
    } else {
      rooms[room] = roomMessages;
    }

    // Viewer filter inputs for the cache path: hidden ids and clear cutoff are
    // per-user and therefore never cached — fetch them in one parallel round
    // whenever the transcript came from cache. On the DB path they arrived in
    // the same round as the messages, so nothing more is needed.
    if (viewerRelevant && fromCache) {
      try {
        const [hidden, cleared] = await Promise.all([
          prisma.hiddenMessage.findMany({ where: { userId: Number(viewerId) }, select: { messageId: true } }),
          prisma.clearedConversation.findUnique({ where: { userId_roomId: { userId: Number(viewerId), roomId: roomRow.id } } })
        ]);
        hiddenIds = new Set((hidden || []).map((h) => h.messageId));
        clearedAt = cleared ? cleared.clearedAt : null;
        filterInputsOk = true;
      } catch (err) {
        logger.error('Failed to load viewer filters', { error: err.message, room });
        filterInputsOk = false;
      }
    }

    // Attach reactions for both cache and DB paths. The DB path already has
    // its rows from the same round-trip; the cached path re-reads them because
    // reactions change far more often than transcripts and other instances
    // may have added some since this entry was stored.
    if (roomMessages.length > 0) {
      try {
        const reactionRows = fromCache
          ? await Reaction.listForMessages(roomMessages.map((m) => Number(m.id)).filter(Number.isSafeInteger))
          : roomMessages.flatMap((m) => m._reactionRows);
        roomMessages = attachReactions(
          roomMessages.map(({ _reactionRows, ...rest }) => ({ ...rest, reactions: [] })),
          reactionRows
        );
        if (!fromCache) await setCachedTranscript(room, roomMessages);
      } catch (err) {
        logger.error('Failed to attach reactions', { error: err.message, room });
      }
    }

    // Per-viewer filter: the shared cache can hold rows this user hid
    // (delete-for-me) or cleared, so apply their hide/clear sets here. If the
    // filter inputs failed to load we must not serve unfiltered history —
    // retry SQL-side before giving up with an error.
    if (viewerRelevant && !filterInputsOk) {
      try {
        const retryRows = await Message.listByRoom(roomRow.id, { limit: 50, userId: viewerId });
        roomMessages = retryRows.map((m) => ({
          id: String(m.id),
          userId: m.userId,
          nickname: m.username,
          content: decryptMessage({ encrypted: m.encryptedContent, iv: m.iv, authTag: m.authTag }),
          priority: m.priority,
          timestamp: m.createdAt.getTime(),
          room: room,
          status: 'delivered'
        }));
        const ids = roomMessages.map((m) => Number(m.id)).filter(Number.isSafeInteger);
        const reactionRows = await Reaction.listForMessages(ids);
        roomMessages = attachReactions(roomMessages.map((m) => ({ ...m, reactions: [] })), reactionRows);
        filterInputsOk = true;
      } catch (retryErr) {
        logger.error('Viewer filter retry failed', { error: retryErr.message, room });
        socket.emit('error', { message: 'Could not load this conversation, try again' });
        return;
      }
    }
    if (viewerRelevant && (hiddenIds?.size > 0 || clearedAt)) {
      roomMessages = roomMessages.filter((m) => {
        const n = Number(m.id);
        if (Number.isSafeInteger(n) && hiddenIds.has(n)) return false;
        if (clearedAt && m.timestamp <= clearedAt.getTime()) return false;
        return true;
      });
    }
    socket.emit('room_joined', { room, messages: roomMessages });
    logger.info(`${user.nickname} joined room`, { room, socketId: socket.id });
  });

  // 2a1. Start (or reopen) a direct conversation with one other user. The
  // server owns the room identity, so both participants always resolve to the
  // same conversation no matter who opens it first.
  socket.on('create_dm', async ({ userId } = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    try {
      if (!socket.user) {
        reply({ ok: false, error: 'Authentication required' });
        return;
      }
      const peerId = Number(userId);
      if (!Number.isSafeInteger(peerId) || peerId <= 0) {
        reply({ ok: false, error: 'Invalid user' });
        return;
      }
      if (peerId === socket.user.id) {
        reply({ ok: false, error: 'Cannot start a conversation with yourself' });
        return;
      }
      const peer = await prisma.user.findUnique({
        where: { id: peerId },
        select: { id: true, username: true, displayName: true }
      });
      if (!peer) {
        reply({ ok: false, error: 'User not found' });
        return;
      }

      const room = await Room.findOrCreateDm(socket.user.id, peer.id);
      roomDbCache.set(room.name, { id: room.id, type: room.type });
      // A brand-new DM: any cached "not a member" denial from before the
      // invite must not block the first open.
      invalidateRoomGate(room.name);
      // A new DM creates a relationship on both sides — refresh presence scopes.
      invalidateRelatedNicknames(socket.user.id);
      invalidateRelatedNicknames(peer.id);
      if (!rooms[room.name]) rooms[room.name] = [];

      const payload = { room: room.name, label: peer.displayName || peer.username, type: 'dm', peerId: peer.id };
      // Acknowledge before refreshing the lists: the click must open the
      // conversation immediately, and a slow sidebar rebuild must never make it
      // look like starting a chat failed.
      reply({ ok: true, ...payload });
      io.to('user:' + peer.id).emit('dm_created', payload);
      emitConversationList(socket.user.id, socket);
      emitConversationList(peer.id, io.to('user:' + peer.id));
      logger.info('DM opened', { room: room.name, by: socket.user.username });
    } catch (err) {
      logger.error('create_dm failed', { error: err.message, socketId: socket.id });
      reply({ ok: false, error: 'Could not start the conversation' });
    }
  });

  // 2a2. Create a group conversation. Creation attempts share the same hourly
  // budget helper as public rooms so group spam costs the same as room spam.
  function checkCreationBudget(userId) {
    const now = Date.now();
    const recent = (checkCreationBudget.store.get(userId) || []).filter((t) => now - t < 3600000);
    if (recent.length >= 5) return null;
    recent.push(now);
    checkCreationBudget.store.set(userId, recent);
    return recent;
  }
  checkCreationBudget.store = new Map();
  socket.on('create_group', async ({ name, userIds } = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    try {
      if (!socket.user) {
        reply({ ok: false, error: 'Authentication required' });
        return;
      }
      if (!checkCreationBudget(socket.user.id)) {
        reply({ ok: false, error: 'Group creation limit reached (5 per hour)' });
        return;
      }
      const { room, label } = await Room.createGroup({ name, userIds, createdBy: socket.user.id });
      roomDbCache.set(room.name, { id: room.id, type: room.type });
      // Same as create_dm: clear stale denials for every founding member.
      invalidateRoomGate(room.name);
      if (!rooms[room.name]) rooms[room.name] = [];
      const members = await Room.getMembers(room.id);
      // Everyone in the new group becomes visible to everyone else in it.
      for (const member of members) invalidateRelatedNicknames(member.id);
      // The creator's reply carries the label so no extra lookup is needed.
      for (const member of members) {
        // eslint-disable-next-line no-await-in-loop -- membership refresh is user-visible
        if (member.id !== socket.user.id) await emitConversationList(member.id, io.to('user:' + member.id));
      }
      await emitConversationList(socket.user.id, socket);
      const payload = { room: room.name, label, type: 'group' };
      for (const member of members) {
        if (member.id !== socket.user.id) io.to('user:' + member.id).emit('group_created', payload);
      }
      reply({ ok: true, ...payload });
      logger.info('Group created', { room: room.name, label, by: socket.user.username });
    } catch (err) {
      logger.error('create_group failed', { error: err.message, socketId: socket.id });
      reply({ ok: false, error: err.message || 'Could not create the group' });
    }
  });

  // Owner and self membership changes share one implementation so add, remove
  // and leave cannot drift apart on permission checks.
  async function changeGroupMembership({ socket, room, targetId, action, ack }) {
    const reply = typeof ack === 'function' ? ack : () => {};
    try {
      if (!socket.user) {
        reply({ ok: false, error: 'Authentication required' });
        return;
      }
      if (typeof room !== 'string' || room.length === 0) {
        reply({ ok: false, error: 'Invalid group' });
        return;
      }
      const target = Number(targetId ?? socket.user.id);
      if (!Number.isSafeInteger(target) || target <= 0) {
        reply({ ok: false, error: 'Invalid user' });
        return;
      }
      const gate = await Room.groupChangeGate({ roomName: room, actorId: socket.user.id, targetId: target });
      if (action === 'add') {
        if (gate.target) {
          reply({ ok: false, error: 'That person is already in the group' });
          return;
        }
        const next = await prisma.user.findUnique({ where: { id: target }, select: { id: true } });
        if (!next) {
          reply({ ok: false, error: 'User not found' });
          return;
        }
        await Room.addMember(gate.room.id, target, 'member');
      } else {
        if (!gate.target) {
          reply({ ok: false, error: 'That person is not in the group' });
          return;
        }
        await prisma.roomMember.delete({ where: { roomId_userId: { roomId: gate.room.id, userId: target } } });
        roomDbCache.delete(room);
        roomDbCache.delete(`${room}:full`);
      }
      // Membership changed → cached gate answers for this room are void for
      // every user (added member must get in immediately, removed member must
      // not linger on an allow entry).
      invalidateRoomGate(room);
      // Membership changed → the related set of everyone in the group may have
      // shifted. Refresh now; the next presence broadcast uses fresh scopes.
      invalidateRelatedNicknames(socket.user.id);
      invalidateRelatedNicknames(target);
      for (const m of await Room.getMembers(gate.room.id)) invalidateRelatedNicknames(m.id);
      const label = await Room.groupLabel(gate.room.id);
      const members = await Room.getMembers(gate.room.id);
      const payload = { room, label, type: 'group', members, removedUserId: action === 'add' ? null : target };
      // Removed strangers need their sidebar updated even though they no longer
      // belong to the Socket.IO room.
      if (action !== 'add') await emitConversationList(target, io.to('user:' + target));
      io.to(room).emit('group_members_changed', payload);
      await emitConversationList(socket.user.id, socket);
      reply({ ok: true, ...payload });
      logger.info('Group membership changed', { room, action, target, by: socket.user.username });
    } catch (err) {
      logger.error('group membership change failed', { error: err.message, socketId: socket.id });
      reply({ ok: false, error: err.message || 'Could not change group members' });
    }
  }

  socket.on('add_group_member', (data = {}, ack) => changeGroupMembership({ socket, room: data.room, targetId: data.userId, action: 'add', ack }));
  socket.on('remove_group_member', (data = {}, ack) => changeGroupMembership({ socket, room: data.room, targetId: data.userId, action: 'remove', ack }));
  socket.on('leave_group', (data = {}, ack) => changeGroupMembership({ socket, room: data.room, targetId: socket.user.id, action: 'leave', ack }));

  // 2b. Create a new room — DISABLED (WhatsApp-style: DMs/groups only).
  // Kept as a stub so old clients get a clear error instead of silence.
  socket.on('create_room', async () => {
    socket.emit('error', { message: 'Public rooms are disabled — invite someone to chat' });
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
      // send_message is the easiest path into someone else's private room, so
      // dm/group rooms re-check membership here as well.
      const sendGate = await roomGate(socket, data.room);
      if (!sendGate.ok) {
        socket.emit('error', { message: sendGate.reason });
        return;
      }
      const effectiveNickname = socket.user.username;
      const sanitized = escapeHtml(data.message);
      const encrypted = encryptMessage(sanitized);
      const parentId = typeof data?.parent_id === 'string' ? data.parent_id : null;
      const tempId = Date.now() + '_' + Math.random().toString(36).substr(2, 9);

      // Persist before broadcasting so the live message carries the real
      // database id. Live and reloaded messages then share one id, which the
      // client relies on for ownership, reactions and jump-to-message. If the
      // write fails the message still delivers under a temporary id.
      let persisted = null;
      try {
        let roomRow = roomDbCache.get(data.room);
        if (!roomRow) {
          roomRow = await prisma.room.findUnique({ where: { name: data.room } });
          if (roomRow) roomDbCache.set(data.room, roomRow);
        }
        if (roomRow) {
          persisted = await Message.create({
            room_id: roomRow.id,
            user_id: socket.user.id,
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

      const messageObj = {
        id: persisted ? String(persisted.id) : tempId,
        userId: socket.user.id,
        nickname: effectiveNickname,
        username: effectiveNickname,
        content: sanitized,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        encryptedContent: encrypted.encrypted,
        priority: 'fyi',
        timestamp: persisted ? persisted.createdAt.getTime() : Date.now(),
        room: data.room,
        status: 'delivered',
        parentId: parentId
      };

      if (!rooms[data.room]) rooms[data.room] = [];
      rooms[data.room].push(messageObj);
      if (rooms[data.room].length > 100) rooms[data.room].shift();
      await invalidateCachedTranscript(data.room).catch((err) => logger.warn('Transcript invalidate skipped', { error: err.message, room: data.room }));

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
    } catch (err) {
      logger.error('Error sending message', { error: err.message, socketId: socket.id });
      socket.emit('error', { message: 'Failed to send' });
    }
  });

  // 3c. Typing indicator
  socket.on('typing', async ({ room }) => {
    const n = socket.user?.username;
    if (!n) return;
    // Don't leak a typing indicator into a conversation the sender can't see.
    const gate = await roomGate(socket, room);
    if (!gate.ok) return;
    socket.to(room).emit('user_typing', { nickname: n });
  });

  socket.on('stop_typing', ({ room }) => {
    const n = socket.user?.username;
    if (n) socket.to(room).emit('user_stop_typing', { nickname: n });
  });

  // Explicit desired state makes a retried request idempotent. Legacy callers
  // without `active` retain toggle behaviour.
  socket.on('toggle_reaction', async (data = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const { room, messageId, emoji, active } = data || {};
    try {
      if (!socket.user || typeof room !== 'string' || !socket.rooms.has(room)) {
        throw new Error('Join the room before reacting');
      }
      if (typeof emoji !== 'string' || !emoji.trim() || emoji.length > 64 ||
          (active !== undefined && typeof active !== 'boolean')) {
        throw new Error('Invalid reaction');
      }
      const id = Number(messageId);
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid message');
      // Memory-cache ownership check first; the DB fallback covers messages
      // older than the in-memory transcript window.
      let target = (rooms[room] || []).find(m => m.id === String(id));
      if (!target) {
        target = await prisma.message.findFirst({
          where: { id, isDeleted: false, room: { name: room } }, select: { id: true }
        });
      }
      if (!target) throw new Error('Message not found');
      const groups = await saveReaction({ messageId: id, userId: socket.user.id, emoji, active });
      // The client updates optimistically; success here means the DB write finished.
      const payload = { ...reactionPayload(id, groups), room };
      reply({ ok: true, ...payload });
      io.to(room).emit('reaction_updated', payload);
    } catch (err) {
      logger.error('Reaction failed', { error: err.message, socketId: socket.id });
      reply({ ok: false, error: err.message });
      if (typeof ack !== 'function') socket.emit('error', { message: err.message });
    }
  });

  // 3e. Delete message — owner-only soft delete (is_deleted), matching the
  // schema used by history queries. Live clients keep a tombstone for the
  // session; reloaded history drops the row entirely (DB-filtered).
  socket.on('delete_message', async ({ messageId }) => {
    try {
      if (!socket.user) {
        socket.emit('error', { message: 'Authentication required' });
        return;
      }
      const id = Number(messageId);
      if (!Number.isInteger(id) || id <= 0) {
        socket.emit('error', { message: 'Invalid message' });
        return;
      }

      let target = null;
      let targetRoom = null;
      let ownerId = null;
      for (const [room, list] of Object.entries(rooms)) {
        const found = list.find(m => m.id === String(id));
        if (found) {
          target = found;
          targetRoom = room;
          ownerId = found.userId;
          break;
        }
      }
      if (!target) {
        const row = await prisma.message.findUnique({ where: { id } });
        if (row && !row.isDeleted) {
          target = row;
          ownerId = row.userId;
          const roomRow = await prisma.room.findUnique({ where: { id: row.roomId } });
          targetRoom = roomRow?.name || null;
        }
      }
      if (!target) {
        socket.emit('error', { message: 'Message not found' });
        return;
      }
      if (ownerId == null || Number(ownerId) !== Number(socket.user.id)) {
        socket.emit('error', { message: 'You can only delete your own messages' });
        return;
      }

      await prisma.message.update({ where: { id }, data: { isDeleted: true } });
      // Drop from the in-memory transcript so later join_room history (which
      // filters isDeleted in SQL) and memory agree.
      if (targetRoom && rooms[targetRoom]) {
        rooms[targetRoom] = rooms[targetRoom].filter(m => m.id !== String(id));
      }
      io.to(targetRoom).emit('message_deleted', { id: String(id), room: targetRoom });
      logger.info('Message deleted', { messageId: id, by: socket.user.username });
    } catch (err) {
      logger.error('Delete message failed', { error: err.message, socketId: socket.id });
      socket.emit('error', { message: 'Delete failed' });
    }
  });

  // 3f. Search — content is AES-encrypted at rest, so matching happens after
  // decryption in the server process; SQL-level LIKE/FTS is impossible with
  // this schema by design. Searches the newest 300 messages, newest matches
  // first, capped at 30 results.
  socket.on('search_messages', async (data = {}) => {
    const { room, query } = data || {};
    const empty = { room, query, results: [] };
    try {
      if (!socket.user) {
        socket.emit('error', { message: 'Authentication required' });
        return;
      }
      if (typeof room !== 'string' || room.length === 0 || room.length > 50) {
        socket.emit('search_results', empty);
        return;
      }
      if (typeof query !== 'string' || query.trim().length === 0 || query.length > 200) {
        socket.emit('search_results', empty);
        return;
      }

      let roomRow = roomDbCache.get(room);
      if (!roomRow) {
        roomRow = await prisma.room.findUnique({ where: { name: room } });
        if (roomRow) roomDbCache.set(room, roomRow);
      }
      if (!roomRow) {
        socket.emit('search_results', empty);
        return;
      }

      const rows = await Message.listByRoom(roomRow.id, { limit: 300, userId: socket.user.id });
      // Stored text is escapeHtml'd before encryption, so the needle must be
      // escaped the same way or HTML entities like &lt; never match.
      const needle = escapeHtml(query.trim()).toLowerCase();
      const sender = typeof data.sender === 'string' ? data.sender.trim().slice(0, 50) : '';
      const onlyMine = data.onlyMine === true;
      const results = [];
      for (let i = rows.length - 1; i >= 0 && results.length < 30; i--) {
        const m = rows[i];
        let text = '';
        try {
          text = decryptMessage({ encrypted: m.encryptedContent, iv: m.iv, authTag: m.authTag });
        } catch {
          continue; // undecryptable rows (e.g. key rotation) never block search
        }
        if (text.toLowerCase().includes(needle)) {
          if (onlyMine && Number(m.userId) !== Number(socket.user.id)) continue;
          if (sender && String(m.username).toLowerCase() !== sender.toLowerCase()) continue;
          results.push({
            id: String(m.id),
            nickname: m.username,
            content: text,
            timestamp: m.createdAt.getTime(),
            priority: m.priority
          });
        }
      }
      results.sort((a, b) => a.timestamp - b.timestamp);
      socket.emit('search_results', { room, query, sender: sender || null, onlyMine, results });
    } catch (err) {
      logger.error('Search failed', { error: err.message, socketId: socket.id });
      socket.emit('search_results', empty);
    }
  });

  // 3g. Bulk scoped delete — `me` hides caller-only rows of any sender;
  // `everyone` soft-deletes caller-owned rows. Deletions broadcast to the
  // room; hides reply only to the caller. ACK carries per-id results.
  socket.on('delete_messages', async (data = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    try {
      if (!socket.user) { reply({ ok: false, error: 'Authentication required' }); return; }
      const { messageIds, scope } = data || {};
      if (!Array.isArray(messageIds) || messageIds.length === 0 || messageIds.length > 100) {
        reply({ ok: false, error: 'Select 1-100 messages' }); return;
      }
      if (scope !== 'me' && scope !== 'everyone') {
        reply({ ok: false, error: 'Invalid delete scope' }); return;
      }
      const ids = [...new Set(messageIds.map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))];
      if (ids.length === 0) { reply({ ok: false, error: 'Invalid message ids' }); return; }
      // Resolve the room once: messages must all belong to one conversation,
      // and the caller must be allowed to see it.
      const first = await prisma.message.findUnique({ where: { id: ids[0] }, include: { room: true } });
      if (!first || first.isDeleted) { reply({ ok: false, error: 'Message not found', missing: ids }); return; }
      const others = await prisma.message.findMany({ where: { id: { in: ids.slice(1) } }, select: { id: true, roomId: true } });
      if (others.some((m) => m.roomId !== first.roomId)) {
        reply({ ok: false, error: 'Select messages from one conversation' }); return;
      }
      const gate = await roomGate(socket, first.room.name);
      if (!gate.ok) { reply({ ok: false, error: gate.reason }); return; }
      const result = await Message.deleteScoped({ userId: socket.user.id, messageIds: ids, scope });
      if (result.error) { reply({ ok: false, ...result }); return; }
      if (result.deleted.length > 0) {
        if (rooms[first.room.name]) {
          const gone = new Set(result.deleted.map(String));
          rooms[first.room.name] = rooms[first.room.name].filter((m) => !gone.has(String(m.id)));
        }
        await invalidateCachedTranscript(first.room.name).catch((err) => logger.warn('Transcript invalidate skipped', { error: err.message }));
        io.to(first.room.name).emit('messages_deleted', { room: first.room.name, ids: result.deleted.map(String) });
      }
      if (result.hidden.length > 0) {
        await invalidateCachedTranscript(first.room.name).catch((err) => logger.warn('Transcript invalidate skipped', { error: err.message }));
        socket.emit('messages_hidden', { room: first.room.name, ids: result.hidden.map(String) });
      }
      reply({ ok: true, ...result });
      logger.info('Messages deleted', { scope, count: result.deleted.length + result.hidden.length, by: socket.user.username });
    } catch (err) {
      logger.error('Bulk delete failed', { error: err.message, socketId: socket.id });
      reply({ ok: false, error: 'Delete failed' });
    }
  });

  // 3h. Clear chat for me — empties the caller's history in this room.
  socket.on('clear_conversation', async ({ room } = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    try {
      if (!socket.user) { reply({ ok: false, error: 'Authentication required' }); return; }
      if (typeof room !== 'string' || !room) { reply({ ok: false, error: 'Invalid conversation' }); return; }
      const gate = await roomGate(socket, room);
      if (!gate.ok || !gate.row) { reply({ ok: false, error: gate.reason || 'Conversation not found' }); return; }
      await Message.clearConversationForUser(socket.user.id, gate.row.id);
      if (rooms[room]) rooms[room] = [];
      await invalidateCachedTranscript(room).catch((err) => logger.warn('Transcript invalidate skipped', { error: err.message, room }));
      socket.emit('room_joined', { room, messages: [] });
      reply({ ok: true, room });
      logger.info('Conversation cleared', { room, by: socket.user.username });
    } catch (err) {
      logger.error('Clear conversation failed', { error: err.message, socketId: socket.id });
      reply({ ok: false, error: 'Clear failed' });
    }
  });

  // 3i. Delete conversation — DM: both sides confirm "everyone" before the
  // row disappears (tracked by Room.deleteConversation); group: owner only;
  // public: never. "me" hides the row for the caller only.
  socket.on('delete_conversation', async ({ room, scope } = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    try {
      if (!socket.user) { reply({ ok: false, error: 'Authentication required' }); return; }
      if (typeof room !== 'string' || !room) { reply({ ok: false, error: 'Invalid conversation' }); return; }
      if (scope !== 'me' && scope !== 'everyone') { reply({ ok: false, error: 'Invalid delete scope' }); return; }
      const gate = await roomGate(socket, room);
      if (!gate.ok || !gate.row) { reply({ ok: false, error: gate.reason || 'Conversation not found' }); return; }
      const row = gate.row;
      if (row.type === 'public') { reply({ ok: false, error: 'Public rooms cannot be deleted' }); return; }
      const others = row.type === 'group'
        ? (await Room.getMembers(row.id)).filter((m) => m.id !== socket.user.id).map((m) => m.id)
        : [];
      if (row.type === 'dm') {
        const peerRow = await prisma.roomMember.findFirst({
          where: { roomId: row.id, userId: { not: socket.user.id } },
          select: { userId: true }
        });
        if (peerRow) others.push(peerRow.userId);
      }
      if (scope === 'me') {
        await Message.hideConversationForUser(socket.user.id, row.id);
        if (rooms[room]) delete rooms[room];
        roomDbCache.delete?.(room);
        invalidateRoomGate(room);
        await invalidateCachedTranscript(room).catch((err) => logger.warn('Transcript invalidate skipped', { error: err.message, room }));
        socket.emit('conversation_deleted', { room, scope: 'me' });
        await emitConversationList(socket.user.id, socket);
        reply({ ok: true, room, scope: 'me' });
        return;
      }
      const result = await Room.deleteConversation({ roomName: room, actorId: socket.user.id, scope });
      if (rooms[room]) delete rooms[room];
      roomDbCache.delete?.(room);
      invalidateRoomGate(room);
      await invalidateCachedTranscript(room).catch((err) => logger.warn('Transcript invalidate skipped', { error: err.message, room }));
      io.to(room).emit('conversation_deleted', { room, scope: 'everyone' });
      await emitConversationList(socket.user.id, socket);
      for (const id of others) {
        // eslint-disable-next-line no-await-in-loop -- membership notification is user-visible
        await emitConversationList(id, io.to('user:' + id));
      }
      reply({ ok: true, room, scope: 'everyone', waitingForPeer: result.waitingForPeer });
      logger.info('Conversation deleted', { room, scope, by: socket.user.username });
    } catch (err) {
      logger.error('Delete conversation failed', { error: err.message, socketId: socket.id });
      reply({ ok: false, error: err.message || 'Delete failed' });
    }
  });
});

app.use(notFound);
app.use(errorHandler);



const server = httpServer.listen(PORT, HOST, () => {
  logger.info(`Server on port ${PORT} (host: ${HOST})`);
  logger.info('------------------------------------------');
  logger.info('  Continental Chat - Server Started');
  logger.info(`  Environment: ${env.NODE_ENV}`);
  logger.info(`  Health: /health	Status: /api/status`);
  logger.info(`  Redis: ${env.REDIS_URL ? 'enabled' : 'disabled (in-memory)'}`);
  logger.info(`  Groq AI: ${process.env.GROQ_API_KEY ? 'enabled' : 'disabled'}`);
  logger.info('------------------------------------------');
  logger.info(`${env.NODE_ENV} | CORS: ${env.CORS_ORIGIN}`);
  logger.info(`DB: PostgreSQL (Prisma) | Auth: JWT ${env.JWT_EXPIRES_IN}`);
});


// Load rooms from DB in background (non-blocking)
(async () => {
  try {
    await seedDatabase();
    const dbRooms = await prisma.room.findMany({ where: { isArchived: false }, select: { name: true } });
    for (const r of dbRooms) {
      if (!roomNames.includes(r.name)) roomNames.push(r.name);
      if (!rooms[r.name]) rooms[r.name] = [];
    }
    logger.info(`Loaded ${dbRooms.length} rooms from database`);
  } catch (e) {
    logger.error('Background room load failed', { error: e.message });
  }
})();


// Graceful shutdown. Render/Railway send SIGTERM before killing the container.
// Without this the old process leaves its database connections open, and those
// keep counting against the project's connection budget until the server reaps
// them -- which is how redeploys quietly shrink the pool for the new process.
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Received ${signal}; shutting down cleanly`);
  server.close(() => logger.info('HTTP server closed'));
  // Force-exit guard: never let a stuck socket block the deploy.
  const forceExit = setTimeout(() => {
    logger.warn('Shutdown timed out; forcing exit');
    process.exit(1);
  }, 10000);
  forceExit.unref?.();
  try {
    await disconnectRedis();
  } catch (e) {
    logger.warn('Redis disconnect failed during shutdown', { error: e.message });
  }
  await shutdownDb();
  logger.info('Shutdown complete');
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));



