import prisma, { resilientModel } from '../config/database.js';

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

  async listByRoom(roomId, { limit = 50, before = null, userId = null, withReactions = false } = {}) {
    // Delete-for-everyone (isDeleted) is global. Delete-for-me and clear-chat
    // are per user: HiddenMessage ids and the ClearedConversation cutoff are
    // applied only when userId is supplied. Public listing passes no userId.
    let hiddenIds = [];
    let clearedAt = null;
    if (userId != null) {
      const [hidden, cleared] = await Promise.all([
        prisma.hiddenMessage.findMany({ where: { userId: Number(userId) }, select: { messageId: true } }),
        prisma.clearedConversation.findUnique({ where: { userId_roomId: { userId: Number(userId), roomId } } })
      ]);
      hiddenIds = hidden.map((h) => h.messageId);
      if (cleared) clearedAt = cleared.clearedAt;
    }
    const where = { roomId, isDeleted: false };
    if (before) where.id = { lt: before };
    if (hiddenIds.length > 0) where.id = { ...(where.id || {}), notIn: hiddenIds };
    if (clearedAt) where.createdAt = { gt: clearedAt };

    const messages = await prisma.message.findMany({
      where,
      orderBy: { id: 'desc' },
      take: limit,
      // Reactions ride along with the transcript in one round-trip instead of a
      // follow-up query, so a join costs one trip instead of two. The selected
      // shape is exactly what attachReactions() consumes. Off by default: the
      // search path and the REST listing do not need reactions.
      ...(withReactions
        ? { include: { reactions: { select: { messageId: true, userId: true, emoji: true } } } }
        : {})
    });
    return messages.reverse();
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
  },

  async listByParent(parentId, { limit = 50 } = {}) {
    if (!parentId) return [];
    return prisma.message.findMany({
      where: { parentId: String(parentId), isDeleted: false },
      orderBy: { id: 'asc' },
      take: limit
    });
  },

  async hideForUser(userId, messageIds) {
    // Delete-for-me: idempotent upserts, one tombstone per (user, message).
    const ids = [...new Set(messageIds.map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))];
    if (ids.length === 0) return { hidden: [], skipped: [] };
    const hidden = [];
    for (const messageId of ids) {
      // eslint-disable-next-line no-await-in-loop -- sequential upserts keep the per-id result exact
      await prisma.hiddenMessage.upsert({
        where: { userId_messageId: { userId: Number(userId), messageId } },
        update: {},
        create: { userId: Number(userId), messageId }
      });
      hidden.push(messageId);
    }
    return { hidden, skipped: [] };
  },

  async clearConversationForUser(userId, roomId) {
    // Clear-chat-for-me: move the cutoff to now. New messages reappear.
    return prisma.clearedConversation.upsert({
      where: { userId_roomId: { userId: Number(userId), roomId: Number(roomId) } },
      update: { clearedAt: new Date() },
      create: { userId: Number(userId), roomId: Number(roomId), clearedAt: new Date() }
    });
  },

  // Whole-conversation "delete for me": hide every message id via tombstones
  // and move the clear cutoff to now, so even future history scans stay
  // empty for this user while the peer's view is untouched.
  async hideConversationForUser(userId, roomId) {
    const rows = await prisma.message.findMany({
      where: { roomId: Number(roomId), isDeleted: false },
      select: { id: true },
      take: 5000
    });
    if (rows.length > 0) {
      await Message.hideForUser(userId, rows.map((r) => r.id));
    }
    return this.clearConversationForUser(userId, roomId);
  },

  async hiddenIdsForUser(userId) {
    const rows = await prisma.hiddenMessage.findMany({
      where: { userId: Number(userId) }, select: { messageId: true }
    });
    return new Set(rows.map((r) => r.messageId));
  },

  async clearCutoffForUser(userId, roomId) {
    const row = await prisma.clearedConversation.findUnique({
      where: { userId_roomId: { userId: Number(userId), roomId: Number(roomId) } }
    });
    return row ? row.clearedAt : null;
  },

  // Bulk scoped delete. `scope: 'me'` hides the caller's rows (any sender);
  // `scope: 'everyone'` soft-deletes only rows the caller owns and rejects
  // the rest per id. Returns per-id results so the client can report exactly
  // what happened without a second round trip.
  async deleteScoped({ userId, messageIds, scope }) {
    const ids = [...new Set((messageIds || []).map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))];
    const deleted = [];
    const hidden = [];
    const denied = [];
    const missing = [];
    for (const id of ids) {
      // eslint-disable-next-line no-await-in-loop -- sequential keeps per-id results exact
      const row = await prisma.message.findUnique({ where: { id } });
      if (!row || row.isDeleted) { missing.push(id); continue; }
      if (scope === 'everyone' && Number(row.userId) !== Number(userId)) { denied.push(id); continue; }
    }
    if (scope === 'everyone' && denied.length > 0) {
      return { deleted, hidden, denied, missing, error: 'You can only delete your own messages for everyone' };
    }
    for (const id of ids) {
      if (missing.includes(id) || denied.includes(id)) continue;
      if (scope === 'everyone') {
        // eslint-disable-next-line no-await-in-loop
        await prisma.message.update({ where: { id }, data: { isDeleted: true } });
        deleted.push(id);
      } else {
        hidden.push(id);
      }
    }
    if (scope !== 'everyone' && hidden.length > 0) {
      await this.hideForUser(userId, hidden);
    }
    return { deleted, hidden, denied, missing };
  }
};

// Every method is resilientModel-wrapped: a pool drained by a suspended Neon
// compute rebuilds and retries once instead of surfacing a raw P2024.
export default resilientModel(Message);
