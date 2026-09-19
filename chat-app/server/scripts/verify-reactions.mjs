// Live two-client check; uses uniquely named fixtures and removes only those.
// Start a local server, then: node --env-file=.env scripts/verify-reactions.mjs
// Database assertions are independent of the server's in-memory cache.
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { PrismaClient } from '@prisma/client';
import { reactionView } from '../../client/src/chat/reactionState.mjs';
const base = process.env.TEST_BASE_URL || 'http://localhost:3001';
const prisma = new PrismaClient();
const sockets = []; const userIds = []; let roomId;
const stamp = Date.now(); const room = `rxcheck${stamp}`; const timeout = 45000;
function event(s, name, match = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { s.off(name, listener); reject(new Error(`Timeout: ${name}`)); }, timeout);
    function listener(data) { if (!match(data)) return; clearTimeout(timer); s.off(name, listener); resolve(data); }
    s.on(name, listener);
  });
}
async function post(path, body, token) {
  const res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
  const data = await res.json(); assert.ok(res.ok, `${path}: ${JSON.stringify(data)}`); return data;
}
async function connect(label) {
  const name = `rx${label}${stamp}`;
  const data = await post('/api/auth/register', { username: name, email: `${name}@smoketest.dev`, password: 'SmokeTest!123x', display_name: name });
  userIds.push(data.user.id);
  const s = io(base, { autoConnect: false, reconnection: false, auth: { token: data.token }, transports: ['websocket'] });
  sockets.push(s);
  const ready = event(s, 'connect'); s.connect(); await ready;
  s.onAny((ev, ...args) => console.log(`[evt ${label.toUpperCase()}] ${ev} ${JSON.stringify(args).slice(0, 140)}`));
  const listed = event(s, 'room_list'); s.emit('user_join', { nickname: name }); await listed;
  return { s, id: data.user.id, token: data.token };
}
try {
  const a = await connect('a'); const b = await connect('b');
  const created = await post('/api/rooms', { name: room, type: 'public' }, a.token);
  roomId = created.room.id;
  const joins = [event(a.s, 'room_joined', d => d.room === room), event(b.s, 'room_joined', d => d.room === room)];
  a.s.emit('join_room', { room }); b.s.emit('join_room', { room }); await Promise.all(joins);
  const incoming = event(b.s, 'new_message', d => d.room === room);
  a.s.emit('send_message', { room, message: `Reaction check ${stamp}` });
  const msg = await incoming; assert.match(String(msg.id), /^\d+$/);
  async function react(emoji, active) {
    const updates = [
      event(a.s, 'reaction_updated', d => d.messageId === msg.id).catch((e) => { throw new Error(`A: ${e.message}`); }),
      event(b.s, 'reaction_updated', d => d.messageId === msg.id).catch((e) => { throw new Error(`B: ${e.message}`); })
    ];
    const ack = new Promise((resolve, reject) => b.s.timeout(timeout).emit('toggle_reaction', { room, messageId: msg.id, emoji, active }, (err, data) => err ? reject(err) : resolve(data)));
    const stored = ack.then(async saved => {
      assert.equal(saved.ok, true, saved.error);
      const row = await prisma.reaction.findUnique({ where: { messageId_userId_emoji: { messageId: Number(msg.id), userId: b.id, emoji } } });
      assert.equal(Boolean(row), active, 'database must match immediately after acknowledgment');
      return saved;
    });
    const [left, right, saved] = await Promise.all([...updates, stored]);
    assert.equal(saved.ok, true, saved.error); assert.deepEqual(left, right); return left;
  }
  const t0 = Date.now();
  const on = await react('😊', true);
  console.log(`first reaction round-trip: ${Date.now() - t0} ms`);
  assert.equal(reactionView(on.reactions, a.id)[0].mine, false);
  assert.equal(reactionView(on.reactions, b.id)[0].mine, true);
  assert.equal(on.reactions[0].count, 1);
  const t1 = Date.now();
  assert.equal((await react('😊', true)).reactions[0].count, 1);
  console.log(`rapid duplicate add: ${Date.now() - t1} ms`);
  async function waitForStored(emoji, present) {
    const deadline = Date.now() + 90000;
    do {
      const row = await prisma.reaction.findUnique({ where: { messageId_userId_emoji: { messageId: Number(msg.id), userId: b.id, emoji } } });
      if (Boolean(row) === present) return;
      await new Promise(resolve => setTimeout(resolve, 1000));
    } while (Date.now() < deadline);
    assert.fail(`Database did not ${present ? 'save' : 'remove'} ${emoji}`);
  }
  await waitForStored('😊', true);
  console.log('Database independently confirms smiley persistence');
  const joined = event(a.s, 'room_joined', d => d.room === room);
  a.s.emit('join_room', { room });
  const reloaded = (await joined).messages.find(m => m.id === msg.id);
  assert.equal(reloaded?.reactions?.[0]?.emoji, '😊', 'persisted reaction must survive reload');
  assert.deepEqual((await react('😊', false)).reactions, []);
  await waitForStored('😊', false);
  assert.equal((await react('👩🏽‍🚀', true)).reactions[0].emoji, '👩🏽‍🚀');
  await waitForStored('👩🏽‍🚀', true);
  const found = event(a.s, 'search_results'); a.s.emit('search_messages', { room, query: `Reaction check ${stamp}` });
  assert.ok((await found).results.some(m => m.id === msg.id));
  const denial = event(b.s, 'error'); b.s.emit('delete_message', { messageId: msg.id });
  assert.match((await denial).message, /only delete your own/);
  const deleted = event(b.s, 'message_deleted'); a.s.emit('delete_message', { messageId: msg.id }); await deleted;
  const gone = event(a.s, 'search_results'); a.s.emit('search_messages', { room, query: `Reaction check ${stamp}` });
  assert.deepEqual((await gone).results, []);
  console.log('REACTION SMOKE PASSED');
} catch (err) {
  console.error('REACTION SMOKE FAILED:', err.message); process.exitCode = 1;
} finally {
  sockets.forEach(s => s.disconnect());
  try {
    if (roomId) await prisma.room.deleteMany({ where: { id: roomId } });
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  } catch (err) { console.error('Cleanup failed:', err.message); }
  await prisma.$disconnect();
}
