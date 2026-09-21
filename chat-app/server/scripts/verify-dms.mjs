// Live three-client check for private conversations (Phases 1-2).
// Start a local server, then: node --env-file=.env scripts/verify-dms.mjs
//
// Proves: a DM is persisted, both participants see it (labelled with the other
// person's name), a non-member can neither join nor post nor read it, and the
// conversation is idempotent + survives a reload. Then: groups only admit
// members, only the owner changes the roster, and removed people disappear
// from the REST transcript too.
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { PrismaClient } from '@prisma/client';

const base = process.env.TEST_BASE_URL || 'http://localhost:3001';
// The server already holds a pool; this script is sequential, so one connection
// is plenty and keeps it from competing for Neon's connection quota (which
// surfaces as P2024 "Timed out fetching a new connection from the pool").
const dbUrl = process.env.DATABASE_URL || '';
const harnessUrl = dbUrl + (dbUrl.includes('?') ? '&' : '?') + 'connection_limit=1&pool_timeout=60';
const prisma = new PrismaClient({ datasourceUrl: harnessUrl });
const sockets = [];
const userIds = [];
const roomsToDelete = [];
const stamp = Date.now();
const timeout = 45000;

function event(s, name, match = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { s.off(name, listener); reject(new Error(`Timeout: ${name}`)); }, timeout);
    function listener(data) { if (!match(data)) return; clearTimeout(timer); s.off(name, listener); resolve(data); }
    s.on(name, listener);
  });
}

// `online_users` rows are { nickname, currentRoom } objects; accept plain
// strings too so an assertion can never silently compare objects to names
// (which would make every include() false and the check vacuous).
function nicknamesOf(list) {
  return Array.isArray(list) ? list.map((u) => (typeof u === 'string' ? u : u?.nickname)) : [];
}

async function post(path, body, token) {
  const res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
  const data = await res.json(); assert.ok(res.ok, `${path}: ${JSON.stringify(data)}`); return data;
}

async function get(path, token) {
  const res = await fetch(base + path, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(timeout) });
  const data = await res.json(); assert.ok(res.ok, `${path}: ${JSON.stringify(data)}`); return data;
}

function createDm(s, peerId) {
  return new Promise((resolve, reject) => {
    s.timeout(timeout).emit('create_dm', { userId: peerId }, (err, data) => err ? reject(err) : resolve(data));
  });
}

function createGroup(s, name, userIds) {
  return new Promise((resolve, reject) => {
    s.timeout(timeout).emit('create_group', { name, userIds }, (err, data) => err ? reject(err) : resolve(data));
  });
}

async function connect(label) {
  const name = `dm${label}${stamp}`;
  const data = await post('/api/auth/register', { username: name, email: `${name}@smoketest.dev`, password: 'SmokeTest!123x', display_name: name });
  userIds.push(data.user.id);
  const s = io(base, { autoConnect: false, reconnection: false, auth: { token: data.token }, transports: ['websocket'] });
  sockets.push(s);
  const ready = event(s, 'connect'); s.connect(); await ready;
  // Both listeners must exist before user_join: the server pushes them together.
  const listed = event(s, 'room_list');
  const convos = event(s, 'conversation_list');
  s.emit('user_join', { nickname: name });
  await listed;
  const initialConvos = await convos;
  return { s, id: data.user.id, token: data.token, name, initialConvos };
}

try {
  const a = await connect('a'); const b = await connect('b'); const c = await connect('c');

  // 1. A opens a DM with B. The server decides the room identity.
  const first = await createDm(a.s, b.id);
  assert.equal(first.ok, true, first.error);
  assert.equal(first.type, 'dm');
  assert.equal(first.label, b.name, 'DM is labelled with the other participant');
  const dmRoom = first.room;
  roomsToDelete.push(dmRoom);

  // 2. Idempotent both ways: B opening the same chat lands in the same room.
  const mirrored = await createDm(b.s, a.id);
  assert.equal(mirrored.room, dmRoom, 'either side opens the same conversation');
  const reopened = await createDm(a.s, b.id);
  assert.equal(reopened.room, dmRoom, 'reopening does not duplicate the DM');

  // 3. Sidebar lists: A sees it, C (not a participant) does not.
  const aList = event(a.s, 'conversation_list');
  await createDm(a.s, b.id);
  const aRow = (await aList).find((x) => x.room === dmRoom);
  assert.ok(aRow, 'participant sees the DM');
  assert.equal(aRow.label, b.name);
  assert.equal(aRow.peerId, b.id);
  const cRooms = (await get('/api/rooms', c.token)).rooms.map((r) => r.name);
  assert.ok(!cRooms.includes(dmRoom), 'outsider must not see the DM in the room list');
  // WhatsApp-style privacy: every listed row is a conversation the caller is a
  // member of, so legacy public rooms must never surface — for anyone.
  assert.ok(!cRooms.includes('general'), 'public rooms are gone from the room list');
  assert.ok((await get('/api/rooms', c.token)).rooms.every((r) => r.type === 'dm' || r.type === 'group'), 'only dm/group rows are listable');
  const aRooms = (await get('/api/rooms', a.token)).rooms.map((r) => r.name);
  assert.ok(aRooms.includes(dmRoom), 'participant sees the DM in the room list');
  assert.ok(!aRooms.includes('general'), 'no public rooms for a participant either');

  // 3b. Contacts-only directory. A shares a DM with B so B is a contact; C
  // shares nothing with either, so both stay invisible. (C is not empty: every
  // new account starts with a Demo DM, so only the strangers must be absent.)
  const aPeople = (await get('/api/users', a.token)).users.map((u) => u.id);
  assert.ok(aPeople.includes(b.id), 'a DM partner shows up in the People list');
  assert.ok(!aPeople.includes(c.id), 'an unrelated stranger stays out of the People list');
  const cPeople = (await get('/api/users', c.token)).users.map((u) => u.id);
  assert.ok(!cPeople.includes(a.id) && !cPeople.includes(b.id), 'a stranger sees neither participant');
  const cProfile = await fetch(`${base}/api/users/${a.id}`, { headers: { Authorization: `Bearer ${c.token}` }, signal: AbortSignal.timeout(timeout) });
  assert.equal(cProfile.status, 404, 'an unrelated profile reads 404 so the id is not confirmed');
  const aProfile = await fetch(`${base}/api/users/${b.id}`, { headers: { Authorization: `Bearer ${a.token}` }, signal: AbortSignal.timeout(timeout) });
  assert.equal(aProfile.status, 200, 'a contact profile stays readable');

  // 4. Both participants join and exchange a message.
  console.log('step 1-3 ok: DM created, idempotent, lists filtered');
  const joins = [event(a.s, 'room_joined', d => d.room === dmRoom), event(b.s, 'room_joined', d => d.room === dmRoom)];
  a.s.emit('join_room', { room: dmRoom }); b.s.emit('join_room', { room: dmRoom });
  await Promise.all(joins);
  const text = `Private hello ${stamp}`;
  const incoming = event(b.s, 'new_message', d => d.room === dmRoom);
  a.s.emit('send_message', { room: dmRoom, message: text });
  const msg = await incoming;
  assert.match(String(msg.id), /^\d+$/, 'DM messages are persisted with a real id');

  // 5. The outsider is refused on every path.
  console.log('step 4 ok: message delivered with a DB id');
  const denied = event(c.s, 'error');
  c.s.emit('join_room', { room: dmRoom });
  assert.match((await denied).message, /not a member/i);
  const deniedSend = event(c.s, 'error');
  c.s.emit('send_message', { room: dmRoom, message: 'intruder' });
  assert.match((await deniedSend).message, /not a member/i);
  const dmRow = await prisma.room.findFirst({ where: { name: dmRoom }, select: { id: true } });
  const readRes = await fetch(`${base}/api/rooms/${dmRow.id}/messages`, { headers: { Authorization: `Bearer ${c.token}` }, signal: AbortSignal.timeout(timeout) });
  assert.equal(readRes.status, 403, 'outsider cannot read the transcript over REST');

  // Legacy public rooms are not a loophole: membership is never self-granted at
  // join time, so an old 'general' row is as unreachable as a private DM.
  const legacyPublic = await prisma.room.findFirst({ where: { type: 'public' }, select: { id: true, name: true } });
  if (legacyPublic) {
    const publicDenied = event(c.s, 'error');
    c.s.emit('join_room', { room: legacyPublic.name });
    assert.match((await publicDenied).message, /not a member/i, 'a legacy public room can no longer be entered');
    const publicRead = await fetch(`${base}/api/rooms/${legacyPublic.id}/messages`, { headers: { Authorization: `Bearer ${c.token}` }, signal: AbortSignal.timeout(timeout) });
    console.log(`legacy public room "${legacyPublic.name}": socket join denied, REST read → ${publicRead.status}`);
  } else {
    console.log('no legacy public rooms in this database; skipping that check');
  }

  // 6. The write is really in Postgres.
  const stored = await prisma.message.findFirst({ where: { roomId: dmRow.id, isDeleted: false }, orderBy: { id: 'desc' } });
  assert.ok(stored, 'DM message row exists in the database');

  // 7. Reload: leaving and rejoining replays the transcript from the DB.
  console.log('step 5-6 ok: outsider refused (socket + REST), row in Postgres');
  const rejoin = event(a.s, 'room_joined', d => d.room === dmRoom);
  // Rejoining must replay the transcript. Public rooms are gone, so hop to A's
  // other legitimate conversation (the Demo DM from registration) and back
  // instead of the old "general" round-trip.
  const otherRoom = a.initialConvos.find((x) => x.type === 'dm' && x.room !== dmRoom)?.room;
  if (otherRoom) {
    const backToOther = event(a.s, 'room_joined', d => d.room === otherRoom);
    a.s.emit('join_room', { room: otherRoom });
    await backToOther;
  }
  a.s.emit('join_room', { room: dmRoom });
  const reloaded = (await rejoin).messages.find(m => m.id === msg.id);
  assert.ok(reloaded, 'DM message survives a reload');
  assert.equal(reloaded.content, text);

  // 8. Reactions still work inside a DM. Longer budget: the ack includes the
  // Postgres write, and Neon's pooler can stall well past 45s under load.
  const t8 = Date.now();
  const reacted = new Promise((resolve, reject) => b.s.timeout(120000).emit('toggle_reaction', { room: dmRoom, messageId: msg.id, emoji: '👍', active: true }, (err, data) => err ? reject(err) : resolve(data)));
  const saved = await reacted;
  console.log(`reaction ack: ${Date.now() - t8} ms`);
  assert.equal(saved.ok, true, saved.error);
  assert.equal(saved.reactions[0].count, 1);

  // 9. A creates a group with B; C is not invited.
  console.log('DM checks done; starting group checks');
  const label = `Study ${stamp}`;
  // Subscribe before creating: the server broadcasts to B before acking A, so a
  // listener attached after the ack would miss the event. Real clients attach
  // at connection setup and never see this race.
  const bAnnounced = event(b.s, 'group_created', (d) => d.type === 'group');
  const created = await createGroup(a.s, label, [b.id]);
  assert.equal(created.ok, true, created.error);
  assert.equal(created.type, 'group');
  assert.equal(created.label, label);
  const grp = created.room;
  assert.match(grp, /^grp_[a-z0-9]+$/i, 'group uses a server-owned internal name');
  roomsToDelete.push(grp);
  // B never asked for a refresh; the creator's broadcast carried it.
  const announcement = await bAnnounced;
  assert.equal(announcement.room, grp, 'group_created names the new room');
  assert.equal(announcement.label, label, 'group_created carries the display label');
  const grpRow = await prisma.room.findUnique({ where: { name: grp } });
  assert.equal(grpRow.type, 'group');
  assert.equal(grpRow.description, label, 'label survives as the readable name');
  const membership = await prisma.roomMember.findMany({ where: { roomId: grpRow.id } });
  assert.deepEqual(membership.map((m) => m.userId).sort((x, y) => x - y), [a.id, b.id].sort((x, y) => x - y));

  // 10. Sidebar and transcript privacy mirror DMs.
  const bConvos = event(b.s, 'conversation_list');
  // Nudge a fresh list without creating anything new.
  b.s.emit('user_join', { nickname: b.name });
  const bEntry = (await bConvos).find((x) => x.room === grp);
  assert.equal(bEntry?.label, label, 'group label reaches the sidebar');
  const cRooms2 = (await get('/api/rooms', c.token)).rooms.map((r) => r.name);
  assert.ok(!cRooms2.includes(grp), 'outsider must not see the group anywhere');
  const cJoin = event(c.s, 'error');
  c.s.emit('join_room', { room: grp });
  assert.match((await cJoin).message, /not a member/i);
  const cRead = await fetch(`${base}/api/rooms/${grpRow.id}/messages`, { headers: { Authorization: `Bearer ${c.token}` }, signal: AbortSignal.timeout(timeout) });
  assert.equal(cRead.status, 403, 'outsider cannot read the group over REST');

  // 11. Both members join and exchange a message.
  const gJoins = [event(a.s, 'room_joined', (d) => d.room === grp), event(b.s, 'room_joined', (d) => d.room === grp)];
  a.s.emit('join_room', { room: grp }); b.s.emit('join_room', { room: grp });
  await Promise.all(gJoins);
  const gIncoming = event(b.s, 'new_message', (d) => d.room === grp);
  a.s.emit('send_message', { room: grp, message: `Group hello ${stamp}` });
  const gmsg = await gIncoming;
  assert.match(String(gmsg.id), /^\d+$/, 'group messages persist like any other');

  // 12. A non-owner cannot touch the roster.
  const ownerRow = await prisma.roomMember.findUnique({ where: { roomId_userId: { roomId: grpRow.id, userId: a.id } } });
  assert.equal(ownerRow.role, 'owner', 'creator starts as the group owner');
  const bRole = await prisma.roomMember.findUnique({ where: { roomId_userId: { roomId: grpRow.id, userId: b.id } } });
  assert.equal(bRole.role, 'member', 'invitees start as plain members');
  const forbidden = await new Promise((resolve, reject) => {
    b.s.timeout(timeout).emit('remove_group_member', { room: grp, userId: a.id }, (err, data) => err ? reject(err) : resolve(data));
  });
  assert.equal(forbidden.ok, false, 'non-owner removal must fail');
  assert.match(String(forbidden.error), /owner/i);

  // 13. The owner removes B; B immediately loses socket, list and REST access.
  console.log('group privacy ok; starting roster checks');
  const removed = await new Promise((resolve, reject) => {
    a.s.timeout(timeout).emit('remove_group_member', { room: grp, userId: b.id }, (err, data) => err ? reject(err) : resolve(data));
  });
  assert.equal(removed.ok, true, removed.error);
  assert.deepEqual(removed.members.map((m) => m.id).sort((x, y) => x - y), [a.id], 'B is gone from the roster');
  const bRejoin = event(b.s, 'error');
  b.s.emit('join_room', { room: grp });
  assert.match((await bRejoin).message, /not a member/i);
  const bRead = await fetch(`${base}/api/rooms/${grpRow.id}/messages`, { headers: { Authorization: `Bearer ${b.token}` }, signal: AbortSignal.timeout(timeout) });
  assert.equal(bRead.status, 403, 'a removed member cannot read the group anymore');

  // 14. A removed socket cannot post into the room either.
  const mutedSend = event(b.s, 'error');
  b.s.emit('send_message', { room: grp, message: 'should not land' });
  assert.match((await mutedSend).message, /not a member/i);

  // 15. Presence is scoped too: an unrelated socket never learns who is online,
  // while a contact still sees their conversation partner.
  const cPresence = event(c.s, 'online_users');
  a.s.emit('user_join', { nickname: a.name });
  const cNick = nicknamesOf(await cPresence);
  // Positive control: C's own row must be present, otherwise the "does not
  // see A/B" claim below would hold vacuously on an empty list.
  assert.ok(cNick.includes(c.name), 'outsider presence list is live (sees itself)');
  assert.ok(!cNick.includes(a.name) && !cNick.includes(b.name), 'an outsider sees no unrelated presence');
  const aPresence = event(a.s, 'online_users');
  b.s.emit('user_join', { nickname: b.name });
  const aNick = nicknamesOf(await aPresence);
  assert.ok(aNick.includes(a.name), 'a socket always sees itself online');
  // B still shares the DM with A even though A removed B from the group.
  assert.ok(aNick.includes(b.name), 'a conversation partner stays visible in presence');
  console.log('presence scoping ok');

  console.log('DM SMOKE PASSED');
} catch (err) {
  console.error('DM SMOKE FAILED:', err.message);
  process.exitCode = 1;
} finally {
  sockets.forEach(s => { try { s.disconnect(); } catch { /* already gone */ } });
  try {
    const rows = roomsToDelete.length ? await prisma.room.findMany({ where: { name: { in: roomsToDelete } }, select: { id: true } }) : [];
    if (rows.length) {
      const ids = rows.map(r => r.id);
      await prisma.message.deleteMany({ where: { roomId: { in: ids } } });
      await prisma.room.deleteMany({ where: { id: { in: ids } } });
    }
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  } catch (err) { console.error('Cleanup failed:', err.message); }
  await prisma.$disconnect();
}