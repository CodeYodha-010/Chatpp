import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE_URL, serverUp, hasDatabase, createUser, getRequest } from './helpers.js';

const MESSAGE_FIELDS = [
  'id',
  'username',
  'encryptedContent',
  'iv',
  'authTag',
  'priority',
  'createdAt'
];

test('ROOMS /api/rooms*', async (t) => {
  if (!(await serverUp())) {
    return t.skip(`server not reachable at ${BASE_URL} — start it with: cd server && npm start`);
  }
  if (!hasDatabase()) {
    return t.skip('DATABASE_URL not set — run with: node --env-file=.env --test tests/');
  }

  // Lazy supertest import — resolves only after the skip-guards above pass.
  const request = await getRequest();

  const { token } = await createUser('agbroom');
  const auth = { Authorization: `Bearer ${token}` };

  await t.test('list rooms without token → 401', async () => {
    const res = await request(BASE_URL).get('/api/rooms');
    assert.equal(res.status, 401);
  });

  let rooms = [];
  await t.test('list rooms with token → 200 array of {id:number, name:string}', async () => {
    const res = await request(BASE_URL).get('/api/rooms').set(auth);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.rooms), 'expected { rooms: [...] }');
    rooms = res.body.rooms;
    // Privacy model: the list holds only conversations the caller belongs to.
    // Public rooms may still exist in the database but must never be listed.
    assert.ok(rooms.every((r) => r.type === 'dm' || r.type === 'group'), 'only dm/group rows are listable');
    assert.ok(!rooms.some((r) => r.name === 'general'), 'public rooms are never listed');
    for (const r of rooms) {
      assert.equal(typeof r.id, 'number');
      assert.equal(typeof r.name, 'string');
    }
  });

  await t.test('POST /api/rooms → 410 (public rooms were removed)', async () => {
    // The contacts-only rework has no public rooms and no room-creation
    // endpoint: DMs are created implicitly from the People panel and groups
    // from the New group flow, so creating one here must be refused.
    const res = await request(BASE_URL)
      .post('/api/rooms')
      .set(auth)
      .send({ name: `agentb-${Date.now()}`, description: 'Agent B smoke room', type: 'public' });
    assert.equal(res.status, 410);
  });

  await t.test('room messages without token → 401', async () => {
    // Authentication runs before the id is parsed, so any id returns 401.
    const res = await request(BASE_URL).get('/api/rooms/1/messages');
    assert.equal(res.status, 401);
  });

  await t.test('messages ?limit=5 → 200 with at most 5 rows', async (st) => {
    const own = rooms.find((r) => r.type === 'dm');
    if (!own) return st.skip('caller has no conversation yet (is the demo user missing?)');
    const res = await request(BASE_URL)
      .get(`/api/rooms/${own.id}/messages`)
      .query({ limit: 5 })
      .set(auth);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.messages));
    assert.ok(res.body.messages.length <= 5, 'limit param must be honored');
  });

  await t.test('own conversation messages → 200 with full encrypted shape', async (st) => {
    // Public rooms are no longer listed, so exercise the shape on the caller's
    // own conversation (the Demo DM created at registration).
    const own = rooms.find((r) => r.type === 'dm');
    if (!own) return st.skip('caller has no conversation yet (is the demo user missing?)');

    const res = await request(BASE_URL).get(`/api/rooms/${own.id}/messages`).set(auth);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.messages));
    for (const m of res.body.messages) {
      for (const f of MESSAGE_FIELDS) {
        assert.ok(f in m, `message missing field "${f}"`);
      }
    }
  });

  await t.test('non-numeric room id → 400 (invalid id rejected before Prisma)', async () => {
    // Phase 1 tightened this from the old crash-to-500 behavior (see TODO A1);
    // NaN no longer reaches the database layer.
    const res = await request(BASE_URL)
      .get('/api/rooms/not-a-number/messages')
      .set(auth);
    assert.equal(res.status, 400);
  });
});