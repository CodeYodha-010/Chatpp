import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reactionView, setOwnReaction } from '../src/chat/reactionState.mjs';

test('shared payload highlights only the viewing user, including string IDs', () => {
  const payload = [{ emoji: '😊', count: 1, userIds: [7], mine: true }];
  assert.equal(reactionView(payload, 8)[0].mine, false);
  assert.equal(reactionView(payload, '7')[0].mine, true);
});
test('optimistic addition is synchronous and does not mutate server state', () => {
  const base = [{ emoji: '😊', count: 1, userIds: [8] }];
  const next = setOwnReaction(base, '😊', 7, true);
  assert.equal(next[0].count, 2);
  assert.equal(next[0].mine, true);
  assert.deepEqual(base[0].userIds, [8]);
  assert.deepEqual(setOwnReaction(next, '😊', 7, true), next);
});
test('removal preserves other users and unrelated emojis', () => {
  const base = [{ emoji: '😊', count: 2, userIds: [7, 8] }, { emoji: '❤️', count: 1, userIds: [9] }];
  const next = setOwnReaction(base, '😊', 7, false);
  assert.deepEqual(next.find((g) => g.emoji === '😊').userIds, [8]);
  assert.equal(next.find((g) => g.emoji === '😊').mine, false);
  assert.equal(next.find((g) => g.emoji === '❤️').count, 1);
});
test('last removal removes chip, arbitrary compound emoji supported', () => {
  const emoji = '👩🏽‍🚀';
  const next = setOwnReaction([], emoji, 7, true);
  assert.equal(next[0].emoji, emoji);
  assert.deepEqual(setOwnReaction(next, emoji, 7, false), []);
});
