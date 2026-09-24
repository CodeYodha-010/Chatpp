import Redis from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';
import env from '../config/env.js';
import logger from '../utils/logger.js';

const PRESENCE_KEY = 'chat:online';
// Presence rows older than this with no live socket are crash leftovers
// ("ghosts"): safe to delete. Younger unmatched rows are only hidden from
// reads — deleting them could race a reconnect between fetchSockets and hgetall.
const GHOST_AGE_MS = 5 * 60 * 1000;

// ponytail: single shared ioredis connection; in-memory shim when REDIS_URL
// is unset so dev works with zero installs. Swap to Upstash/Docker by env only.
let client = null;
const memHashes = new Map();
const mem = {
  async hset(key, field, value) {
    let h = memHashes.get(key);
    if (!h) { h = new Map(); memHashes.set(key, h); }
    h.set(field, value);
  },
  async hdel(key, field) {
    memHashes.get(key)?.delete(field);
  },
  async hgetall(key) {
    return Object.fromEntries(memHashes.get(key) || []);
  }
};

if (env.REDIS_URL) {
  client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: true });
  client.on('error', (e) => logger.error('Redis error', { error: e.message }));
  client.on('connect', () => {
    const safe = env.REDIS_URL.replace(/\/\/[^@]*@/, '//***@');
    logger.info(`Redis connected (${safe})`);
  });
}

export function getRedis() {
  return client;
}

export function withRedisTimeout(promise, ms = 800) {
  let timer;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`redis timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

// Dedicated pub/sub pair for the Socket.IO adapter: subscribed connections
// cannot run regular commands, so they must not share the presence client.
export function createRedisAdapter() {
  if (!env.REDIS_URL) return null;
  const pub = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
  const sub = pub.duplicate();
  pub.on('error', (e) => logger.error('Redis adapter error', { error: e.message }));
  return createAdapter(pub, sub);
}

// Disconnect Redis client on shutdown
export async function disconnectRedis() {
  if (client) {
    try {
      await client.quit();
      logger.info('Redis client disconnected');
    } catch (e) {
      logger.warn('Redis disconnect failed', { error: e.message });
    }
  }
}

// Explicitly connect all Redis clients (called after HTTP server starts)
export async function connectRedis() {
  if (!client) return null;
  try {
    await client.connect();
    logger.info('Redis presence client connected');
  } catch (e) {
    logger.warn('Redis presence client connection failed', { error: e.message });
  }
  return client;
}

export async function setPresence(socketId, data) {
  // seenAt ages the row so reads can tell a connected socket's presence from
  // a ghost left behind when a process died without running disconnect handlers.
  const payload = JSON.stringify({ ...data, seenAt: Date.now() });
  if (client) return client.hset(PRESENCE_KEY, socketId, payload);
  return mem.hset(PRESENCE_KEY, socketId, payload);
}

export async function deletePresence(socketId) {
  if (client) return client.hdel(PRESENCE_KEY, socketId);
  return mem.hdel(PRESENCE_KEY, socketId);
}

export async function allPresence() {
  if (client) return client.hgetall(PRESENCE_KEY);
  return mem.hgetall(PRESENCE_KEY);
}

export async function getOnlineUsers(liveIds = null) {
  const all = await allPresence();
  const users = Object.entries(all)
    .map(([socketId, v]) => {
      try {
        const parsed = JSON.parse(v);
        return parsed ? { socketId, ...parsed } : null;
      } catch { return null; }
    })
    .filter(Boolean)
    // Ghost filter (optional liveIds from fetchSockets): a hash row whose
    // socket is no longer connected survived a crash/missed disconnect — hide
    // it from the list right away, and best-effort delete it once it is also
    // older than GHOST_AGE_MS (the age guard protects the reconnect race).
    .filter((u) => {
      if (liveIds && !liveIds.has(u.socketId)) {
        if (Date.now() - (u.seenAt || 0) > GHOST_AGE_MS) {
          deletePresence(u.socketId).catch(() => {});
        }
        return false;
      }
      return true;
    });

  // Deduplicate by nickname (multiple tabs = multiple socketIds with same nickname)
  const seen = new Set();
  return users
    .filter(u => {
      if (seen.has(u.nickname)) return false;
      seen.add(u.nickname);
      return true;
    })
    // Strip internals so the payload clients receive is shape-identical to
    // what this function returned before the ghost filter existed.
    .map(({ socketId, seenAt, ...rest }) => rest);
}
