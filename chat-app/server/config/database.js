import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger.js';

const prisma = new PrismaClient({
  log: ['error', 'warn'],
  // Increase timeouts to handle Neon free-tier cold starts
  transactionOptions: {
    maxWait: 30000,
    timeout: 30000,
  },
});

// Test connection with retry
async function connectWithRetry(maxAttempts = 3, delayMs = 2000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await prisma.$connect();
      logger.info(`Database connected via Prisma (attempt ${attempt}/${maxAttempts})`);
      return;
    } catch (err) {
      logger.error(`Database connection attempt ${attempt}/${maxAttempts} failed: ${err.message}`);
      if (attempt === maxAttempts) {
        logger.error('All database connection attempts failed, exiting');
        process.exit(1);
      }
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

await connectWithRetry();

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

// Session cleanup: run on startup + every 24 hours
async function cleanupExpiredSessions() {
  try {
    const { count } = await prisma.session.deleteMany({
      where: { expiresAt: { lt: new Date() } }
    });
    if (count > 0) {
      logger.info(`Cleaned up ${count} expired sessions`);
    }
    return count;
  } catch (err) {
    logger.error('Session cleanup failed', { error: err.message });
    return 0;
  }
}

await cleanupExpiredSessions();
setInterval(cleanupExpiredSessions, 24 * 60 * 60 * 1000);

export default prisma;
