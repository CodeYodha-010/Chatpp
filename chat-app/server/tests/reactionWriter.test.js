import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createReactionWriter } from '../lib/reactionWriter.js';

function fixture() {
  let rows = [];
  const db = { reaction: {
    async findUnique({ where }) {
      const key = where.messageId_userId_emoji;
      return rows.find(r => Object.keys(key).every(k => r[k] === key[k])) || null;
    },
    async createMany({ data, skipDuplicates }) {
      assert.equal(skipDuplicates, true);
      for (const key of data) {
        if (!await db.reaction.findUnique({ where: { messageId_userId_emoji: key } })) rows.push(key);
      }
    },
    async deleteMany({ where }) {
      rows = rows.filter(r => !Object.keys(where).every(k => r[k] === where[k]));
    },
    async findMany({ where }) { return rows.filter(r => r.messageId === where.messageId); }
  } };
  return { db, save: createReactionWriter(db) };
}
const key = { messageId: 1, userId: 2, emoji: '😊' };

test('writer persists idempotent add and remove and supports legacy toggle', async () => {
  const { db, save } = fixture();
  await save({ ...key, active: true });
  assert.equal((await save({ ...key, active: true }))[0].count, 1);
  assert.ok(await db.reaction.findUnique({ where: { messageId_userId_emoji: key } }));
  assert.deepEqual(await save({ ...key, active: false }), []);
  assert.deepEqual(await save({ ...key, active: false }), []);
  assert.equal((await save(key))[0].count, 1);
  assert.deepEqual(await save(key), []);
});

test('writer waits for persistence and serializes overlapping changes', async () => {
  const { db, save } = fixture();
  const insert = db.reaction.createMany;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  db.reaction.createMany = async args => { await gate; return insert(args); };
  let resolved = false;
  const add = save({ ...key, active: true }).then(groups => { resolved = true; return groups; });
  const remove = save({ ...key, active: false });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(resolved, false);
  release();
  assert.equal((await add)[0].count, 1);
  assert.deepEqual(await remove, []);
  assert.equal(await db.reaction.findUnique({ where: { messageId_userId_emoji: key } }), null);
});

test('failed write rejects without poisoning subsequent changes', async () => {
  const { db, save } = fixture();
  const insert = db.reaction.createMany;
  db.reaction.createMany = async () => { throw new Error('unavailable'); };
  await assert.rejects(save({ ...key, active: true }), /unavailable/);
  db.reaction.createMany = insert;
  assert.equal((await save({ ...key, active: true }))[0].count, 1);
});
