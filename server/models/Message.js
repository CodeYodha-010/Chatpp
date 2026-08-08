import prisma from '../config/database.js';

const Message = {
  async create({ room_id, user_id, username, encrypted_content, iv, auth_tag, priority, parent_id }) {
    return prisma.message.create({
      data: {
        roomId: room_id,
        userId: user_id || null,
        username,
        encryptedContent: encrypted_content,
        iv,
        authTag: auth_tag,
        priority: priority || 'fyi',
        parentId: parent_id || null
      }
    });
  },

  async findById(id) {
    return prisma.message.findUnique({ where: { id } });
  },

  async listByRoom(roomId, { limit = 50, before = null } = {}) {
    const where = { roomId, isDeleted: false };
    if (before) where.id = { lt: before };

    const messages = await prisma.message.findMany({
      where,
      orderBy: { id: 'asc' },
      take: limit
    });
    return messages;
  },

  async search(roomId, { username = null, priority = null, since = null } = {}) {
    const where = { roomId, isDeleted: false };
    if (username) where.username = { equals: username, mode: 'insensitive' };
    if (priority) where.priority = priority;
    if (since) where.createdAt = { gte: new Date(since) };

    return prisma.message.findMany({
      where,
      orderBy: { id: 'desc' },
      take: 100
    });
  }
};

export default Message;
