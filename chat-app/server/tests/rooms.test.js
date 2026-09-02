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
    assert.ok(rooms.length > 0, 'seeded rooms (general/tech/random) should exist');
    for (const r of rooms) {
      assert.equal(typeof r.id, 'number');
      assert.equal(typeof r.name, 'string');
    }
  });

  const roomName = `agentb-${Date.now()}`;
  let createdId = null;

  await t.test('create room → 201 (+ creator membership via Room.addMember)', async () => {
    const res = await request(BASE_URL)
      .post('/api/rooms')
      .set(auth)
      .send({ name: roomName, description: 'Agent B smoke room', type: 'public' });
    assert.equal(res.status, 201);
    assert.equal(res.body.room.name, roomName);
    createdId = res.body.room.id;
  });

  await t.test('duplicate room name → 409', async () => {
    const res = await request(BASE_URL).post('/api/rooms').set(auth).send({ name: roomName });
    assert.equal(res.status, 409);
  });

  await t.test('room messages without token → 401', async () => {
    const res = await request(BASE_URL).get(`/api/rooms/${createdId}/messages`);
    assert.equal(res.status, 401);
  });

  await t.test('messages ?limit=5 → 200 with at most 5 rows', async () => {
    const res = await request(BASE_URL)
      .get(`/api/rooms/${createdId}/messages`)
      .query({ limit: 5 })
      .set(auth);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.messages));
    assert.ok(res.body.messages.length <= 5, 'limit param must be honored');
  });

  await t.test('seeded general room messages → 200 with full encrypted shape', async (st) => {
    const general = rooms.find((r) => r.name === 'general');
    if (!general) return st.skip('seeded general room missing (db not seeded?)');

    const res = await request(BASE_URL).get(`/api/rooms/${general.id}/messages`).set(auth);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.messages));
    for (const m of res.body.messages) {
      for (const f of MESSAGE_FIELDS) {
        assert.ok(f in m, `message missing field "${f}"`);
      }
    }
  });

  await t.test('non-numeric room id → 500 (exact current behavior)', async () => {
    // TODO(A1): tighten to 400 after revocation/NaN fixes land.
    // Today parseInt('not-a-number') → NaN reaches Prisma → throw → 500
    // via middleware/errorHandler.js. Exact assertion flips green when A1 ships.
    const res = await request(BASE_URL)
      .get('/api/rooms/not-a-number/messages')
      .set(auth);
    assert.equal(res.status, 500);
  });
});