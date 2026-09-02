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

    // Add all existing users as members of the three default rooms
    const allUsers = await prisma.user.findMany({ select: { id: true } });
    const allRooms = await prisma.room.findMany({ where: { isArchived: false }, select: { id: true } });
    for (const u of allUsers) {
      for (const r of allRooms) {
        await prisma.roomMember.upsert({
          where: { roomId_userId: { roomId: r.id, userId: u.id } },
          update: {},
          create: { roomId: r.id, userId: u.id, role: 'member' }
        });
      }
    }
    logger.info(`Added ${allUsers.length} users to ${allRooms.length} default rooms`);

    logger.info('Seeding complete');
  } catch (err) {
    logger.error('Seed failed', { error: err.message });
  }
}

export default seedDatabase;
