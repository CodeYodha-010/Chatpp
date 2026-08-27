import prisma from '../config/database.js';
import { hashPassword } from '../utils/password.js';
import logger from '../utils/logger.js';
import env from '../config/env.js';

async function seedDatabase() {
  if (env.NODE_ENV === 'production') {
    logger.info('Production mode: skipping database seeding');
    return;
  }
  try {
    const count = await prisma.user.count();
    if (count > 0) {
      logger.info('Database already seeded');
      return;
    }
    logger.info('Seeding database...');

    const rooms = ['general', 'tech', 'random'];
    for (const name of rooms) {
      await prisma.room.upsert({
        where: { name },
        update: {},
        create: { name, description: `${name} room`, type: 'public' }
      });
    }

    const passwordHash = await hashPassword('demo1234');
    await prisma.user.upsert({
      where: { email: 'demo@example.com' },
      update: {},
      create: {
        username: 'demo',
        email: 'demo@example.com',
        passwordHash,
        displayName: 'Demo User'
      }
    });
    logger.info('Demo user created: demo@example.com / demo1234');

    logger.info('Seeding complete');
  } catch (err) {
    logger.error('Seed failed', { error: err.message });
  }
}

export default seedDatabase;
