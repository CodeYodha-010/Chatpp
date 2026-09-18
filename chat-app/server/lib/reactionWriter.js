import { aggregateReactions } from './reactions.js';

// Serialize changes to a message on this instance. A failed write must not
// poison subsequent work, and no caller receives success before persistence.
export function createReactionWriter(db) {
  const pending = new Map();
  return function saveReaction({ messageId, userId, emoji, active }) {
    const previous = pending.get(messageId) || Promise.resolve();
    const operation = previous.catch(() => {}).then(async () => {
      const key = { messageId, userId, emoji };
      const desired = active ?? !(await db.reaction.findUnique({
        where: { messageId_userId_emoji: key }
      }));
      if (desired) {
        // INSERT ON CONFLICT DO NOTHING: no emulated upsert transaction.
        await db.reaction.createMany({ data: [key], skipDuplicates: true });
      } else {
        await db.reaction.deleteMany({ where: key });
      }
      const rows = await db.reaction.findMany({
        where: { messageId }, select: { messageId: true, userId: true, emoji: true }
      });
      return aggregateReactions(rows).get(messageId) || [];
    });
    pending.set(messageId, operation);
    const cleanup = () => { if (pending.get(messageId) === operation) pending.delete(messageId); };
    operation.then(cleanup, cleanup);
    return operation;
  };
}
