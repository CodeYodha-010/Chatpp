import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import env from '../config/env.js';
import { getRedis } from '../lib/redis.js';

// ponytail: shared RedisStore only when REDIS_URL is set; per-instance
// MemoryStore otherwise (fine for single-node dev). express-rate-limit
// requires a distinct store instance + unique prefix per limiter.
function limiterConfig(prefix, opts) {
  const client = getRedis();
  if (!client) return opts;
  console.log(`Rate limiting: distributed (Redis) [${prefix}]`);
  return {
    ...opts,
    store: new RedisStore({
      sendCommand: (...args) => client.call(...args),
      prefix
    })
  };
}

export const generalLimiter = rateLimit(limiterConfig('chatrl:general', {
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  message: { error: 'Too many requests, please try again later' }
}));

export const authLimiter = rateLimit(limiterConfig('chatrl:auth', {
  windowMs: 15 * 60 * 1000,
  max: 25,
  skipSuccessfulRequests: true,
  message: { error: 'Too many authentication attempts, please try again later' }
}));

export const strictLimiter = rateLimit(limiterConfig('chatrl:strict', {
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Slow down' }
}));
