import Redis from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';
import env from '../config/env.js';
import logger from '../utils/logger.js';

const PRESENCE_KEY = 'chat:online';

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
  client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: false });
  client.on('error', (e) => logger.error('Redis error', { error: e.message }));
  client.on('connect', () => {
    const safe = env.REDIS_URL.replace(/\/\/[^@]*@/, '//***@');
    logger.info(`Redis connected (${safe})`);
  });
}

export function getRedis() {
  return client;
}

// Dedicated pub/sub pair for the Socket.IO adapter: subscribed connections
// cannot run regular commands, so they must not share the presence client.
export function createRedisAdapter() {
  if (!env.REDIS_URL) return null;
  const pub = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const sub = pub.duplicate();
  pub.on('error', (e) => logger.error('Redis adapter error', { error: e.message }));
  return createAdapter(pub, sub);
}

export async function setPresence(socketId, data) {
  if (client) return client.hset(PRESENCE_KEY, socketId, JSON.stringify(data));
  return mem.hset(PRESENCE_KEY, socketId, JSON.stringify(data));
}

export async function deletePresence(socketId) {
  if (client) return client.hdel(PRESENCE_KEY, socketId);
  return mem.hdel(PRESENCE_KEY, socketId);
}

export async function allPresence() {
  if (client) return client.hgetall(PRESENCE_KEY);
  return mem.hgetall(PRESENCE_KEY);
}

export async function getOnlineUsers() {
  const all = await allPresence();
  const users = Object.values(all)
    .map((v) => {
      try { return JSON.parse(v); } catch { return null; }
    })
    .filter(Boolean);

  // Deduplicate by nickname (multiple tabs = multiple socketIds with same nickname)
  const seen = new Set();
  return users.filter(u => {
    if (seen.has(u.nickname)) return false;
    seen.add(u.nickname);
    return true;
  });
}
