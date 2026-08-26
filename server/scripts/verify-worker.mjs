import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { io } from 'socket.io-client';

// Boots index.js + worker.js, connects one authenticated socket client,
// sends a message, and waits for the classified priority to arrive via
// queue -> Groq -> pub/sub. Exits nonzero on timeout.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3103;
const BASE = `http://localhost:${PORT}`;
const ROOM = process.env.A4_ROOM || 'general';

function redisUrlFromEnvFile() {
  try {
    const m = fs.readFileSync(path.join(ROOT, '.env'), 'utf8').match(/^REDIS_URL=(.*)$/m);
    return m ? m[1].trim() : '';
  } catch {
    return '';
  }
}
const REDIS_URL = process.env.REDIS_URL || redisUrlFromEnvFile();
const childEnv = { ...process.env, REDIS_URL };

const procs = [
  spawn(process.execPath, ['index.js'], { cwd: ROOT, env: { ...childEnv, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] }),
  spawn(process.execPath, ['worker.js'], { cwd: ROOT, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] })
];
procs.forEach((pr, i) => {
  const tag = i === 0 ? 'api' : 'worker';
  pr.stdout.on('data', (d) => process.stdout.write(`[${tag}] ${d}`));
  pr.stderr.on('data', (d) => process.stderr.write(`[${tag}!] ${d}`));
});

function cleanup(code) {
  procs.forEach((p) => p.kill());
  setTimeout(() => process.exit(code), 500);
}

async function waitReady(tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${BASE}/`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`api on :${PORT} never became ready`);
}

function waitFor(sock, event, timeoutMs) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting "${event}"`)), timeoutMs);
    sock.once(event, (data) => { clearTimeout(t); resolve(data); });
  });
}

try {
  if (!REDIS_URL) {
    console.log('[check] REDIS_URL empty - worker exits by design; nothing to verify');
    cleanup(0);
  } else {
    await waitReady();
    const loginRes = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'demo@example.com', password: 'demo1234' })
    });
    if (!loginRes.ok) throw new Error(`login failed: ${loginRes.status}`);
    const { token } = await loginRes.json();

    const s = io(BASE, { auth: { token } });
    s.on('connect_error', (e) => console.log('[client] connect_error:', e.message));
    await waitFor(s, 'connect', 20000);
    const joined = waitFor(s, 'room_joined', 20000);
    const priorityEvent = waitFor(s, 'priority_updated', 40000);

    s.emit('user_join', {});
    s.emit('join_room', { room: ROOM });
    await joined;
    console.log(`joined #${ROOM}; sending message for classification...`);

    s.emit('send_message', { room: ROOM, message: 'URGENT: production server is down, need help immediately', nickname: 'demo' });

    const evt = await priorityEvent;
    if (!['urgent', 'fyi', 'social'].includes(evt.priority)) {
      throw new Error(`invalid priority received: ${evt.priority}`);
    }
    console.log(`A4 CHECK PASSED: priority_updated -> "${evt.priority}" (via queue worker)`);

    s.disconnect();
    cleanup(0);
  }
} catch (e) {
  console.error('A4 CHECK FAILED:', e.message);
  cleanup(1);
}
