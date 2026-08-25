import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import env from '../config/env.js';
import { getRedis } from '../lib/redis.js';

// ponytail: shared RedisStore only when REDIS_URL is set; per-instance
// MemoryStore otherwise (fine for single-node dev).
function redisStore() {
  const client = getRedis();
  if (!client) return undefined;
  return new RedisStore({
    sendCommand: (...args) => client.call(...args),
    prefix: 'chatrl:'
  });
}

const store = redisStore();
if (store) console.log('Rate limiting: distributed (Redis)');

export const generalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  ...(store ? { store } : {}),
  message: { error: 'Too many requests, please try again later' }
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  ...(store ? { store } : {}),
  message: { error: 'Too many authentication attempts, please try again later' }
});

export const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  ...(store ? { store } : {}),
  message: { error: 'Slow down' }
});
