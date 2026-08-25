import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { io } from 'socket.io-client';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORTS = [3101, 3102];
const BASE = (p) => `http://localhost:${p}`;
const ROOM = process.env.A3_ROOM || 'general';

const procs = PORTS.map((p) =>
  spawn(process.execPath, ['index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(p) },
    stdio: ['ignore', 'pipe', 'pipe']
  })
);
procs.forEach((pr, i) => {
  pr.stdout.on('data', (d) => process.stdout.write(`[node${i}] ${d}`));
  pr.stderr.on('data', (d) => process.stderr.write(`[node${i}!] ${d}`));
});

function cleanup(code) {
  procs.forEach((p) => p.kill());
  setTimeout(() => process.exit(code), 500);
}

async function waitReady(port, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${BASE(port)}/`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`instance :${port} never became ready`);
}

function waitFor(sock, event, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting "${event}"`)), timeoutMs);
    sock.once(event, (data) => { clearTimeout(t); resolve(data); });
  });
}

try {
  console.log('waiting for both instances...');
  await Promise.all(PORTS.map((p) => waitReady(p)));

  const loginRes = await fetch(`${BASE(PORTS[0])}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@example.com', password: 'demo1234' })
  });
  if (!loginRes.ok) throw new Error(`login failed: ${loginRes.status}`);
  const { token } = await loginRes.json();

  const s1 = io(BASE(PORTS[0]), { auth: { token } });
  const s2 = io(BASE(PORTS[1]), { auth: { token } });

  await Promise.all([waitFor(s1, 'connect'), waitFor(s2, 'connect')]);
  console.log('both sockets connected (different instances)');

  // register listeners BEFORE emitting so nothing is missed
  const presencePromise = waitFor(s2, 'online_users').then(
    (users) => users.some((u) => /demo/i.test(u.nickname || ''))
  );
  const joined1 = waitFor(s1, 'room_joined');
  const joined2 = waitFor(s2, 'room_joined');

  s1.emit('user_join', {});
  s2.emit('user_join', {});
  s1.emit('join_room', { room: ROOM });
  s2.emit('join_room', { room: ROOM });

  await Promise.all([joined1, joined2]);
  console.log(`both joined #${ROOM}`);

  // presence must be shared: s2's online_users should include demo user
  const ok = await presencePromise;
  if (!ok) throw new Error('shared presence missing demo user on instance 2');
  console.log('shared presence verified on instance 2');

  // THE proof: send on instance 1, receive on instance 2
  const got = waitFor(s2, 'new_message', 10000);
  s1.emit('send_message', { room: ROOM, message: 'a3-cross-instance-proof', nickname: 'demo' });

  const msg = await got;
  if (!msg.iv || !msg.authTag) throw new Error('message missing ciphertext fields');
  console.log(`CROSS-INSTANCE DELIVERY OK (id=${msg.id})`);

  s1.disconnect(); s2.disconnect();
  cleanup(0);
} catch (e) {
  console.error('A3 CHECK FAILED:', e.message);
  cleanup(1);
}
