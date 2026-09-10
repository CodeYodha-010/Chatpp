import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger.js';

const prisma = new PrismaClient({
  log: ['error', 'warn'],
  transactionOptions: {
    maxWait: 30000,
    timeout: 30000,
  },
});

let dbConnected = false;
export function isDbConnected() { return dbConnected; }

let retryCount = 0;
export async function connectWithRetry() {
  while (true) {
    try {
      await prisma.$connect();
      dbConnected = true;
      logger.info('Database connected via Prisma');
      retryCount = 0;
      startKeepAlive();
      return;
    } catch (err) {
      retryCount++;
      dbConnected = false;
      const msg = err.message || String(err);
      logger.warn('DB connect failed, retrying');
      const delay = Math.min(5000 * Math.pow(1.5, Math.min(retryCount, 6)), 60000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

connectWithRetry();

let keepAliveStarted = false;
function startKeepAlive() {
  if (keepAliveStarted) return;
  keepAliveStarted = true;
  setInterval(async () => {
    try {
      await prisma.$queryRawUnsafe('SELECT 1');
    } catch (err) {
      dbConnected = false;
      logger.warn('Keep-alive failed');
    }
  }, 4 * 60 * 1000);
}

process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

async function cleanupExpiredSessions() {
  try {
    const { count } = await prisma.session.deleteMany({
      where: { expiresAt: { lt: new Date() } }
    });
    if (count > 0) {
      logger.info(`Cleaned up ${count} expired sessions`);
    }
  } catch (err) {
    logger.error('Session cleanup failed');
  }
}

setTimeout(cleanupExpiredSessions, 10000);
setInterval(cleanupExpiredSessions, 24 * 60 * 60 * 1000);

export default prisma;
