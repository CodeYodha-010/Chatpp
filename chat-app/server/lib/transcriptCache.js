import { getRedis, withRedisTimeout } from './redis.js';
import logger from '../utils/logger.js';
import LRUCache from './LRUCache.js';

// Recent-message cache: in-process map first (free, same tick), Redis second
// (free Upstash tier, ~millisecond reads), Neon only on a miss. Keys are room
// names. Exactly ONE entry per room: the viewer-neutral transcript. Nothing
// per-viewer is ever cached — hidden-message ids and clear cutoffs are fetched
// per join and filtered in memory, so a hidden or cleared message can never
// leak and no viewer copy can go stale after a send. Any write path (send,
// delete, reaction) invalidates the room key so readers never see stale rows.
// Redis calls are time-boxed: a slow cache must never make a join slower than
// going straight to the database.
// Bounded LRU instead of a plain Map: the old structure enforced TTL on read
// but never evicted, so expired entries for rooms nobody revisited lived for
// the life of the process. LRUCache applies the same age check on get and caps
// resident memory at 500 rooms (least-recently-used evicted first).
const transcriptMem = new LRUCache(500, 60_000);
const TRANSCRIPT_REDIS_TTL_S = 300;

function neutralKey(room) { return `chat:transcript:${room}`; }

async function memGet(key) {
  return transcriptMem.get(key) || null;
}

function memSet(key, messages) {
  transcriptMem.set(key, messages);
}

async function redisGet(client, key) {
  const raw = await withRedisTimeout(client.get(key));
  return raw ? JSON.parse(raw) : null;
}

export async function getCachedTranscript(room) {
  const hit = await memGet(neutralKey(room));
  if (hit) return hit;
  const client = getRedis();
  if (client) {
    try {
      const messages = await redisGet(client, neutralKey(room));
      if (messages) {
        memSet(neutralKey(room), messages);
        return messages;
      }
    } catch (err) {
      logger.warn('Transcript cache read failed', { error: err.message, room });
    }
  }
  return null;
}

export async function setCachedTranscript(room, messages) {
  memSet(neutralKey(room), messages);
  const client = getRedis();
  if (client) {
    try {
      await withRedisTimeout(client.set(neutralKey(room), JSON.stringify(messages), 'EX', TRANSCRIPT_REDIS_TTL_S));
    } catch (err) {
      logger.warn('Transcript cache write failed', { error: err.message, room });
    }
  }
}

// The second parameter is kept for call-site compatibility but is a no-op:
// per-viewer cache entries no longer exist. Invalidating the one neutral key
// covers every viewer in the room.
export async function invalidateCachedTranscript(room) {
  transcriptMem.delete(neutralKey(room));
  const client = getRedis();
  if (client) {
    try {
      await withRedisTimeout(client.del(neutralKey(room)));
    } catch (err) {
      logger.warn('Transcript cache invalidate failed', { error: err.message, room });
    }
  }
}
