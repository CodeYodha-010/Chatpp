// Pure reaction helpers — no DB, no socket. Unit-tested in tests/reactions.test.js
// so the grouping and toggle semantics are pinned down independently of Prisma.

// rows: [{ messageId, userId, emoji }] (from Reaction.listForMessages)
// Returns a Map<messageId, [{ emoji, userIds: number[], count }]> sorted by
// count desc, then emoji — stable order so the client never sees chips jump.
export function aggregateReactions(rows) {
  const byMessage = new Map();
  for (const row of rows || []) {
    if (row.messageId == null || !row.emoji) continue;
    if (!byMessage.has(row.messageId)) byMessage.set(row.messageId, new Map());
    const byEmoji = byMessage.get(row.messageId);
    if (!byEmoji.has(row.emoji)) byEmoji.set(row.emoji, []);
    byEmoji.get(row.emoji).push(row.userId);
  }
  const out = new Map();
  for (const [messageId, byEmoji] of byMessage) {
    out.set(messageId, [...byEmoji.entries()]
      .map(([emoji, userIds]) => ({ emoji, userIds, count: userIds.length }))
      .sort((a, b) => b.count - a.count || (a.emoji < b.emoji ? -1 : a.emoji > b.emoji ? 1 : 0)));
  }
  return out;
}

// Attach aggregated reactions to serialized message objects (mutates copies).
export function attachReactions(messages, reactionRows) {
  const aggregated = aggregateReactions(reactionRows);
  return messages.map((m) => {
    const groups = aggregated.get(Number(m.id));
    return groups ? { ...m, reactions: groups } : m;
  });
}

// Shared broadcasts contain user IDs, never a viewer-specific `mine` flag.
// A direct response may also include `mine` for older clients.
export function reactionPayload(messageId, groups, meUserId) {
  return {
    messageId: String(messageId),
    reactions: (groups || []).map((g) => ({
      emoji: g.emoji,
      count: g.count,
      userIds: g.userIds,
      ...(meUserId !== undefined ? { mine: meUserId != null && g.userIds.includes(Number(meUserId)) } : {})
    }))
  };
}

// Optimistic aggregate for the socket hot path: applies one user's change to
// the last known groups without touching the DB. `active` true/false is an
// explicit add/remove; undefined (legacy toggle) adds when absent, removes
// when present.
export function applyReactionLocally(groups, emoji, userId, active) {
  const prev = (groups || []).find((g) => g.emoji === emoji);
  const desired = active === undefined ? !(prev?.userIds || []).includes(userId) : active;
  const userIds = (prev?.userIds || []).filter((u) => u !== userId);
  if (desired) userIds.push(userId);
  const rest = (groups || []).filter((g) => g.emoji !== emoji);
  return userIds.length ? [...rest, { emoji, userIds, count: userIds.length }] : rest;
}
