// Derive ownership locally: room broadcasts are identical for every viewer.
export function reactionView(groups = [], userId) {
  return groups.map((g) => ({ ...g, mine: (g.userIds || []).some((id) => String(id) === String(userId)) }));
}

export function setOwnReaction(groups = [], emoji, userId, active) {
  const next = groups.filter((g) => g.emoji !== emoji);
  const previous = groups.find((g) => g.emoji === emoji);
  const userIds = (previous?.userIds || []).filter((id) => String(id) !== String(userId));
  if (active) userIds.push(userId);
  if (userIds.length) next.push({ emoji, userIds, count: userIds.length });
  return reactionView(next, userId);
}
