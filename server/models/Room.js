import prisma from '../config/database.js';

const Room = {
  async create({ name, description, type, created_by }) {
    return prisma.room.create({
      data: {
        name,
        description: description || '',
        type: type || 'public',
        createdBy: created_by || null
      }
    });
  },

  async findById(id) {
    return prisma.room.findUnique({ where: { id } });
  },

  async findByName(name) {
    return prisma.room.findUnique({ where: { name } });
  },

  async list() {
    return prisma.room.findMany({
      where: { isArchived: false },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, description: true, type: true, createdBy: true, createdAt: true }
    });
  },

  async addMember(roomId, userId, role = 'member') {
    await prisma.roomMember.upsert({
      where: { roomId_userId: { roomId, userId } },
      update: {},
      create: { roomId, userId, role }
    });
  },

  async getMembers(roomId) {
    const members = await prisma.roomMember.findMany({
      where: { roomId },
      include: { user: { select: { id: true, username: true, displayName: true, avatarColor: true } } }
    });
    return members.map(m => ({ ...m.user, role: m.role }));
  }
};

export default Room;
