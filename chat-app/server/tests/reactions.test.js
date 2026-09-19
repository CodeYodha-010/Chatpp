import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateReactions, attachReactions, reactionPayload, applyReactionLocally } from '../lib/reactions.js';

test('groups reactions per message with counts', () => {
  const rows = [
    { messageId: 1, userId: 10, emoji: '👍' },
    { messageId: 1, userId: 11, emoji: '👍' },
    { messageId: 1, userId: 12, emoji: '❤️' },
    { messageId: 2, userId: 10, emoji: '😂' }
  ];
  const map = aggregateReactions(rows);
  const m1 = map.get(1);
  assert.equal(m1.length, 2);
  // higher count first
  assert.equal(m1[0].emoji, '👍');
  assert.equal(m1[0].count, 2);
  assert.deepEqual(m1[0].userIds, [10, 11]);
  assert.equal(m1[1].emoji, '❤️');
  assert.equal(map.get(2)[0].emoji, '😂');
});

test('equal counts sort by emoji for stable chip order', () => {
  const rows = [
    { messageId: 5, userId: 1, emoji: '😢' },
    { messageId: 5, userId: 2, emoji: '😮' }
  ];
  const groups = aggregateReactions(rows).get(5);
  // asc by UTF-16 code unit: 😢 U+1F622 < 😮 U+1F62E
  assert.deepEqual(groups.map(g => g.emoji), ['😢', '😮']);
});

test('ignores malformed rows instead of throwing', () => {
  const rows = [
    { messageId: null, userId: 1, emoji: '👍' },
    { messageId: 3, userId: 1, emoji: '' },
    { messageId: 3, userId: 2, emoji: '👍' }
  ];
  const groups = aggregateReactions(rows).get(3);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 1);
  assert.equal(aggregateReactions(null).size, 0);
  assert.equal(aggregateReactions([]).size, 0);
});

test('attachReactions leaves messages without reactions untouched', () => {
  const messages = [
    { id: '1', content: 'a' },
    { id: '2', content: 'b' }
  ];
  const rows = [{ messageId: 2, userId: 9, emoji: '🎉' }];
  const out = attachReactions(messages, rows);
  assert.equal(out[0].reactions, undefined); // no reaction key added
  assert.equal(out[1].reactions.length, 1);
  assert.deepEqual(out[1].reactions[0].userIds, [9]);
});

test('reactionPayload marks the caller own chip and stringifies the id', () => {
  const groups = [
    { emoji: '👍', userIds: [7, 8], count: 2 },
    { emoji: '❤️', userIds: [9], count: 1 }
  ];
  const p = reactionPayload('12', groups, 8);
  assert.equal(p.messageId, '12');
  assert.equal(p.reactions[0].mine, true);
  assert.equal(p.reactions[1].mine, false);
  assert.equal(reactionPayload('12', groups, null).reactions[0].mine, false);
  assert.deepEqual(reactionPayload('12', [], 1).reactions, []);
});

test('shared payload includes user IDs without a viewer-specific mine flag', () => {
  const p = reactionPayload(12, [{ emoji: '😊', userIds: [7], count: 1 }]);
  assert.deepEqual(p, { messageId: '12', reactions: [{ emoji: '😊', userIds: [7], count: 1 }] });
});

test('applyReactionLocally adds, is idempotent on re-add, removes, and clears', () => {
  const g0 = applyReactionLocally([], '😊', 7, true);
  assert.deepEqual(g0, [{ emoji: '😊', userIds: [7], count: 1 }]);
  assert.deepEqual(applyReactionLocally(g0, '😊', 7, true), g0);
  assert.deepEqual(applyReactionLocally(g0, '😊', 7, false), []);
  const g2 = applyReactionLocally([{ emoji: '😊', userIds: [8], count: 1 }], '😊', 7, undefined);
  assert.deepEqual(g2, [{ emoji: '😊', userIds: [8, 7], count: 2 }]);
  assert.deepEqual(applyReactionLocally(g2, '😊', 7, undefined), [{ emoji: '😊', userIds: [8], count: 1 }]);
  const g3 = applyReactionLocally([{ emoji: '❤️', userIds: [9], count: 1 }], '😊', 7, true);
  // default .sort() compares UTF-16 code units: ❤️ (0x2764) < 😊 (0xD83D, surrogate half)
  assert.deepEqual(g3.map((g) => g.emoji).sort(), ['❤️', '😊']);
});

