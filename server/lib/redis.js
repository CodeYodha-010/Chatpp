import Redis from 'ioredis';
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
  return Object.values(all)
    .map((v) => {
      try { return JSON.parse(v); } catch { return null; }
    })
    .filter(Boolean);
}
