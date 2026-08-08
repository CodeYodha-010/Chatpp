import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger.js';

const prisma = new PrismaClient({
  log: ['error', 'warn']
});

// Test connection
try {
  await prisma.$connect();
  logger.info('Database connected via Prisma');
} catch (err) {
  logger.error('Database connection failed', { error: err.message });
  process.exit(1);
}

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

export default prisma;
