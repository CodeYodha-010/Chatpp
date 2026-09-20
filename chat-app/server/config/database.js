import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger.js';

// Pool parameters live in the DATABASE_URL query string (connection_limit,
// pool_timeout, connect_timeout). connect_timeout is what covers Neon's
// scale-to-zero cold start -- measured at ~1.8s on this project.
const prisma = new PrismaClient({
  log: ['error', 'warn'],
  transactionOptions: {
    // Transactions pin a pool slot for their whole lifetime, and Neon suspends
    // after 5 min idle, so long waits are how slots get stranded. Keep short.
    maxWait: 10000,
    timeout: 15000,
  },
});

let dbConnected = false;
export function isDbConnected() { return dbConnected; }

// Neon suspends the compute when idle. The kill reaches us as E57P01, P1017,
// a Prisma pool timeout (P2024) or "Server has closed the connection". Prisma
// keeps the dead socket in its pool and never rebuilds it on its own, so the
// pool drains to zero and every later query times out. Rebuilding the pool is
// the actual fix for this failure mode.
const DEAD_CONN = /E57P01|P1017|P2024|closed the connection|Connection reset|ECONNRESET|terminating connection/i;

function isDeadConnection(err) {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = String(err.message || err);
  return DEAD_CONN.test(code) || DEAD_CONN.test(msg);
}

let retryCount = 0;
let reconnectInFlight = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Bounded connect attempt. Returns true on success; never throws.
async function attemptConnect(attempts, label) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await prisma.$connect();
      dbConnected = true;
      retryCount = 0;
      logger.info('Database connected via Prisma', { label, attempt: i });
      return true;
    } catch (err) {
      dbConnected = false;
      const delay = Math.min(1000 * Math.pow(1.6, i), 30000);
      logger.warn('DB connect attempt failed', { label, attempt: i, attempts, retryInMs: delay, error: err.message });
      if (i < attempts) await sleep(delay);
    }
  }
  return false;
}

// Boot path: keep retrying in the background so an asleep Neon compute never
// blocks the HTTP listener from binding its port (Render needs the port open).
export async function connectWithRetry() {
  while (!dbConnected) {
    const ok = await attemptConnect(6, 'boot');
    if (ok) { maybeStartKeepAlive(); return; }
    retryCount++;
    await sleep(Math.min(5000 * Math.pow(1.5, Math.min(retryCount, 6)), 60000));
  }
}

connectWithRetry();

// Rebuild the pool after a dead connection. Concurrent callers share a single
// in-flight attempt so one outage does not trigger a reconnect storm.
export function reconnectDb(reason = 'unknown', attempts = 4) {
  if (reconnectInFlight) return reconnectInFlight;
  reconnectInFlight = (async () => {
    try {
      dbConnected = false;
      await prisma.$disconnect().catch(() => {});
      logger.warn('Rebuilding DB connection pool', { reason });
      const ok = await attemptConnect(attempts, 'reconnect');
      if (ok) maybeStartKeepAlive();
      return ok;
    } finally {
      reconnectInFlight = null;
    }
  })();
  return reconnectInFlight;
}

// Run a DB call, rebuilding the pool once if the connection turns out to be
// dead. This is what stops a suspended Neon compute from permanently draining
// the pool and timing out every later query.
export async function withDb(fn) {
  try {
    const out = await fn();
    dbConnected = true;
    return out;
  } catch (err) {
    if (!isDeadConnection(err)) throw err;
    logger.warn('DB call hit a dead connection; rebuilding pool', { code: err.code });
    const ok = await reconnectDb('dead connection');
    if (!ok) throw err;
    return fn();
  }
}

// Optional keep-alive. OFF by default: on Neon's free plan, holding the compute
// awake around the clock burns roughly 180 CU-hours/month against a 100 CU-hour
// quota (scale-to-zero cannot be disabled on Free), which suspends the project.
// A cold start costs only ~1.8s, so letting it sleep is the cheaper trade. Set
// DB_KEEPALIVE_MS to opt in deliberately (e.g. 300000).
let keepAliveTimer = null;
function maybeStartKeepAlive() {
  const ms = Number(process.env.DB_KEEPALIVE_MS || 0);
  if (!ms || keepAliveTimer) return;
  keepAliveTimer = setInterval(async () => {
    try {
      await prisma.$queryRawUnsafe('SELECT 1');
    } catch (err) {
      dbConnected = false;
      logger.warn('Keep-alive failed', { error: err.message });
      if (isDeadConnection(err)) reconnectDb('keep-alive');
    }
  }, ms);
  keepAliveTimer.unref?.();
  logger.info('DB keep-alive enabled', { intervalMs: ms });
}

async function cleanupExpiredSessions() {
  try {
    const { count } = await prisma.session.deleteMany({
      where: { expiresAt: { lt: new Date() } }
    });
    if (count > 0) {
      logger.info(`Cleaned up ${count} expired sessions`);
    }
  } catch (err) {
    logger.error('Session cleanup failed', { error: err.message });
    if (isDeadConnection(err)) reconnectDb('session cleanup');
  }
}

// Timer handles are kept so shutdown can clear them. Without this they hold the
// event loop open, the process can never exit cleanly, and every restart leaks
// its connections on the database side.
const cleanupTimers = [
  setTimeout(cleanupExpiredSessions, 10000),
  setInterval(cleanupExpiredSessions, 24 * 60 * 60 * 1000),
];
cleanupTimers.forEach((t) => t.unref?.());

// Close the pool and stop timers. Called from the server's signal handlers so a
// redeploy releases its connections instead of leaving them open on Neon.
export async function shutdownDb() {
  cleanupTimers.forEach((t) => clearTimeout(t));
  if (keepAliveTimer) clearInterval(keepAliveTimer);
  keepAliveTimer = null;
  await prisma.$disconnect().catch(() => {});
  dbConnected = false;
}

process.on('beforeExit', () => {
  shutdownDb();
});

export default prisma;
