import prisma, { resilientModel } from '../config/database.js';
import Message from './Message.js';

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

  // Owner and self rules for group membership changes. Returns the room row or
  // throws with a user-facing reason. Used by every group_* socket event.
  async groupChangeGate({ roomName, actorId, targetId }) {
    const room = await prisma.room.findUnique({ where: { name: roomName } });
    if (!room || room.type !== 'group') throw new Error('Group not found');
    const memberships = await prisma.roomMember.findMany({
      where: { roomId: room.id },
      select: { userId: true, role: true }
    });
    const actor = memberships.find((m) => m.userId === actorId);
    if (!actor) throw new Error('You are not a member of this group');
    if (actor.role !== 'owner' && actorId !== targetId) throw new Error('Only the group owner can change members');
    if (actorId === targetId && actor.role === 'owner') throw new Error('Transfer ownership before leaving the group');
    const target = memberships.find((m) => m.userId === targetId);
    return { room, target };
  },

  // Group labels are stored in the description; DMs resolve to the peer name.
  async groupLabel(roomId) {
    const room = await prisma.room.findFirst({
      where: { id: roomId },
      select: { description: true, name: true }
    });
    return room?.description || room?.name || 'Group';
  },

  async list() {
    return prisma.room.findMany({
      where: { isArchived: false },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, description: true, type: true, createdBy: true, createdAt: true }
    });
  },

  // Rooms visible to one user: ONLY the DMs and groups they belong to —
  // WhatsApp-style, no public rooms. `label` is what the sidebar renders.
  async listForUser(userId) {
    const rows = await prisma.room.findMany({
      where: {
        isArchived: false,
        type: { in: ['dm', 'group'] },
        memberships: { some: { userId } }
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, type: true }
    });
    // Only DMs have a single counterpart. Resolving them in one extra query
    // keeps the public rooms (which may have many members) from being joined.
    const dmIds = rows.filter((r) => r.type === 'dm').map((r) => r.id);
    const peers = dmIds.length
      ? await prisma.roomMember.findMany({
        where: { roomId: { in: dmIds }, userId: { not: userId } },
        select: { roomId: true, user: { select: { id: true, username: true, displayName: true, avatarColor: true } } }
      })
      : [];
    const peerByRoom = new Map(peers.map((p) => [p.roomId, p.user]));
    // Descriptions double as group labels, so load them only for groups.
    const groupIds = rows.filter((r) => r.type === 'group').map((r) => r.id);
    const groupRows = groupIds.length
      ? await prisma.room.findMany({ where: { id: { in: groupIds } }, select: { id: true, description: true, name: true } })
      : [];
    const groupLabels = new Map(groupRows.map((r) => [r.id, r.description || r.name]));
    return rows.map((row) => {
      const peer = peerByRoom.get(row.id) || null;
      const label =
        row.type === 'dm' && peer ? (peer.displayName || peer.username)
        : row.type === 'group' ? (groupLabels.get(row.id) || row.name)
        : row.name;
      return {
        room: row.name,
        id: row.id,
        label,
        type: row.type,
        peerId: row.type === 'dm' && peer ? peer.id : null,
        peerColor: row.type === 'dm' && peer ? peer.avatarColor : null
      };
    });
  },

  // The "People" universe for one user: ids of everyone sharing at least one
  // dm/group room with them. Public rooms are deliberately excluded — being in
  // #general with someone is not a relationship, or the directory would leak
  // to every registered user again. Empty result = no contacts yet.
  async listRelatedUserIds(userId) {
    const rows = await prisma.roomMember.findMany({
      where: {
        userId: { not: userId },
        room: { type: { in: ['dm', 'group'] }, memberships: { some: { userId } } }
      },
      select: { userId: true },
      distinct: ['userId']
    });
    return rows.map((r) => r.userId);
  },

  // Group conversation with an explicit membership list. The server owns the
  // room identity (same as DMs): internal names are unique but labels are free
  // text, so two different owners can both have a "Family" group without
  // clashing. Returns the created room row plus the display label.
  async createGroup({ name, userIds, createdBy }) {
    const clean = String(name || '').trim().replace(/\s+/g, ' ');
    if (clean.length < 1 || clean.length > 50) throw new Error('Group name must be 1-50 characters');
    const invited = [...new Set((Array.isArray(userIds) ? userIds : []).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
    const members = [...new Set([createdBy, ...invited])];
    if (members.length < 2) throw new Error('Pick at least one other person for the group');
    if (members.length > 25) throw new Error('A group can have at most 25 people');
    const users = await prisma.user.findMany({
      where: { id: { in: members } },
      select: { id: true }
    });
    if (users.length !== members.length) throw new Error('Everyone in the group must exist');
    // Internal name is unique and always join-safe; the display label is `clean`.
    const suffix = Math.random().toString(36).slice(2, 8);
    const roomName = `grp_${Date.now().toString(36)}${suffix}`;
    const room = await prisma.room.create({
      data: { name: roomName, type: 'group', description: clean, createdBy }
    });
    for (const id of members) {
      // eslint-disable-next-line no-await-in-loop -- group size is capped at 25
      await this.addMember(room.id, id, id === createdBy ? 'owner' : 'member');
    }
    return { room, label: clean };
  },

  // Idempotent: the sorted participant pair is the DM identity, so both people
  // land in the same conversation regardless of who opens it first. Ids (not
  // usernames) keep the generated name short enough for join_room's 50-char cap
  // and free of characters join_room rejects.
  async findOrCreateDm(userAId, userBId) {
    if (userAId === userBId) throw new Error('Cannot start a conversation with yourself');
    const [x, y] = [userAId, userBId].sort((a, b) => a - b);
    const dmKey = `${x}:${y}`;

    const existing = await prisma.room.findUnique({ where: { dmKey } });
    if (existing) {
      await this.addMember(existing.id, userAId);
      await this.addMember(existing.id, userBId);
      return existing;
    }

    const rows = await prisma.user.findMany({
      where: { id: { in: [x, y] } },
      select: { id: true }
    });
    if (rows.length !== 2) throw new Error('Both participants must exist');

    try {
      const room = await prisma.room.create({
        data: { name: `dm_${x}_${y}`, dmKey, type: 'dm', description: '', createdBy: userAId }
      });
      await this.addMember(room.id, userAId);
      await this.addMember(room.id, userBId);
      return room;
    } catch (err) {
      // Unique collision: a concurrent request created the same DM first.
      if (err.code === 'P2002') {
        const room = await prisma.room.findUnique({ where: { dmKey } });
        if (room) return room;
      }
      throw err;
    }
  },

  // Delete a conversation and everything inside it (messages, reactions,
  // hidden rows, clear cutoffs, members). Returns the deleted room type.
  // Rules: a DM needs BOTH participants to have asked for "everyone"
  // (tracked in memory until the second confirmation arrives); a group
  // needs its owner; public rooms are never deletable.
  async deleteConversation({ roomName, actorId, scope }) {
    const room = await prisma.room.findUnique({ where: { name: roomName } });
    if (!room) throw new Error('Conversation not found');
    if (room.type === 'public') throw new Error('Public rooms cannot be deleted');
    const member = await prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId: room.id, userId: actorId } }
    });
    if (!member) throw new Error('You are not a member of this conversation');
    if (room.type === 'group' && member.role !== 'owner') {
      throw new Error('Only the group owner can delete the group');
    }
    // Hide the caller's own view first either way: after an "everyone"
    // delete of a DM the room row disappears for both; after a "me" delete
    // the row stays for the peer.
    await Message.hideConversationForUser(actorId, room.id);
    if (scope === 'everyone' && room.type === 'dm') {
      const peer = await prisma.roomMember.findFirst({
        where: { roomId: room.id, userId: { not: actorId } },
        select: { userId: true }
      });
      const key = `dm-del:${room.id}`;
      const votes = (this._dmDeleteVotes ||= new Map());
      const set = votes.get(key) || new Set();
      set.add(actorId);
      votes.set(key, set);
      const peerConfirmed = !peer || set.has(peer.userId);
      if (!peerConfirmed) {
        return { deleted: false, waitingForPeer: true, room };
      }
      votes.delete(key);
      if (peer) await Message.hideConversationForUser(peer.userId, room.id);
    }
    await prisma.room.delete({ where: { id: room.id } });
    return { deleted: true, waitingForPeer: false, room };
  },

  // REST listing: rooms this user may open — only their own DMs/groups.
  // Mirrors listForUser() but keeps the raw row shape.
  async listVisible(userId) {
    return prisma.room.findMany({
      where: {
        isArchived: false,
        type: { in: ['dm', 'group'] },
        memberships: { some: { userId } }
      },
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
  },

  async isMember(roomId, userId) {
    const member = await prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
      select: { roomId: true }
    });
    return !!member;
  }
};

// Every method is resilientModel-wrapped: a pool drained by a suspended Neon
// compute rebuilds and retries once instead of surfacing a raw P2024.
export default resilientModel(Room);
