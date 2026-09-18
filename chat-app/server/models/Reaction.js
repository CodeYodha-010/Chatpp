import prisma from '../config/database.js';

const Reaction = {
  // Toggle semantics backed by the @@unique([messageId, userId, emoji])
  // constraint: one upsert adds, one delete removes. Nothing else can create
  // a duplicate row, so client-side optimistic state can trust the broadcast.
  async add({ messageId, userId, emoji }) {
    return prisma.reaction.upsert({
      where: { messageId_userId_emoji: { messageId, userId, emoji } },
      update: {},
      create: { messageId, userId, emoji }
    });
  },

  async remove({ messageId, userId, emoji }) {
    try {
      await prisma.reaction.delete({
        where: { messageId_userId_emoji: { messageId, userId, emoji } }
      });
      return true;
    } catch {
      return false; // already gone — idempotent
    }
  },

  // Grouped counts for a whole set of messages in one query, so loading a
  // room transcript never issues per-message reaction lookups.
  async listForMessages(messageIds) {
    if (!messageIds.length) return [];
    return prisma.reaction.findMany({
      where: { messageId: { in: messageIds } },
      select: { messageId: true, userId: true, emoji: true }
    });
  }
};

export default Reaction;