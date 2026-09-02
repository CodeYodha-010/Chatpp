import http from 'k6/http';
import { check } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import exec from 'k6/execution';
import { socketIoConnect } from './lib/socketio.js';

// ── Config (env-overridable) ─────────────────────────────────────────────
const HTTP_BASE = __ENV.BASE_URL || 'http://localhost:3001';
const WS_BASE = __ENV.WS_BASE || 'ws://localhost:3001';
const SCENARIO = __ENV.SCENARIO || 'smoke'; // smoke | load | stress
const ROOM = __ENV.K6_ROOM || 'agentb-k6';  // dedicated room → cleanup.js removes it
const MSG_EVERY_MS = Number(__ENV.MSG_EVERY_MS || 1000);   // send rate per VU
const SESSION_MS = Number(__ENV.SESSION_MS || 30000);      // how long each VU stays connected
const SETUP_USERS = Number(__ENV.SETUP_USERS || 20);

// ── Metrics ──────────────────────────────────────────────────────────────
const deliveryLatency = new Trend('chat_msg_delivery_latency', true);
const messagesSent = new Counter('chat_messages_sent');
const messagesDelivered = new Counter('chat_messages_delivered');

// ── Scenarios ────────────────────────────────────────────────────────────
const SCENARIOS = {
  smoke: { executor: 'constant-vus', vus: 1, duration: '40s' },
  load: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '30s', target: 10 },
      { duration: '1m', target: 25 },
      { duration: '30s', target: 5 }
    ]
  },
  stress: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '30s', target: 25 },
      { duration: '1m', target: 60 },
      { duration: '1m', target: 100 },
      { duration: '30s', target: 0 }
    ]
  }
};

export const options = {
  scenarios: { [SCENARIO]: SCENARIOS[SCENARIO] },
  thresholds: {
    http_req_duration: ['p(95)<500'],
    chat_msg_delivery_latency: ['p(95)<500'],
    checks: ['rate>0.99']
  }
};

function rand(len) {
  let s = '';
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// ── Setup: register users + ensure the k6 room exists ───────────────────
export function setup() {
  const stamp = Date.now().toString(36);
  const password = 'Passw0rd!123';
  const users = [];

  for (let i = 0; i < SETUP_USERS; i++) {
    const username = `k6${stamp}${i}`.replace(/[^a-zA-Z0-9]/g, '').slice(0, 30);
    const email = `k6.${stamp}.${i}@example.com`;
    const reg = http.post(
      `${HTTP_BASE}/api/auth/register`,
      JSON.stringify({ username, email, password }),
      { headers: { 'Content-Type': 'application/json' } }
    );

    let token = null;
    if (reg.status === 201) {
      token = reg.json().token;
    } else {
      // rerun fallback: account may already exist from a previous baseline
      const login = http.post(
        `${HTTP_BASE}/api/auth/login`,
        JSON.stringify({ email, password }),
        { headers: { 'Content-Type': 'application/json' } }
      );
      if (login.status === 200) token = login.json().token;
    }
    if (token) users.push({ token, nickname: `k6-${i}` });
  }

  if (users.length === 0) {
    throw new Error('[k6] setup could not authenticate any users — is the server running?');
  }

  // Dedicated room so message writes follow the REAL persistence path,
  // while staying removable via server/tests/cleanup.js --apply.
  const roomRes = http.post(
    `${HTTP_BASE}/api/rooms`,
    JSON.stringify({ name: ROOM, description: 'k6 baseline room', type: 'public' }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${users[0].token}`
      }
    }
  );
  check(roomRes, {
    'room ready (created 201 or exists 409)': (r) => r.status === 201 || r.status === 409
  });

  return { users, room: ROOM };
}

// ── VU behaviour: WS connect → join → send bursts ───────────────────────
export default function (data) {
  const vuIndex = exec.vu.idInTest - 1;
  const user = data.users[vuIndex % data.users.length];
  const nickname = `${user.nickname}-vu${vuIndex}`;

  let ready = false;
  let awaitingSince = null;
  let sent = 0;

  socketIoConnect(`${WS_BASE}/socket.io/?EIO=4&transport=websocket&t=${rand(10)}`, {
    timeoutMs: SESSION_MS,

    onConnected(emit, sock) {
      emit('user_join', { nickname });
      emit('join_room', { room: data.room });

      sock.setInterval(() => {
        if (!ready || awaitingSince !== null) return; // one message in flight per VU
        awaitingSince = Date.now();
        sent++;
        messagesSent.add(1);
        emit('send_message', {
          room: data.room,
          message: `load-msg ${sent} by ${nickname}`,
          nickname
        });
      }, MSG_EVERY_MS);
    },

    onEvent(event, payload) {
      if (event === 'room_joined') {
        ready = true;
        return;
      }
      if (event === 'message_delivered') {
        if (awaitingSince !== null) {
          deliveryLatency.add(Date.now() - awaitingSince);
          awaitingSince = null;
        }
        messagesDelivered.add(1);
        return;
      }
      if (event === 'new_message') {
        check(payload, {
          'new_message carries AES ciphertext + iv/authTag': (m) =>
            typeof m.content === 'string' && m.content.length > 0 && !!m.iv && !!m.authTag
        });
      }
    }
  });

  // keep per-VU counters referenced so linters stay quiet
}