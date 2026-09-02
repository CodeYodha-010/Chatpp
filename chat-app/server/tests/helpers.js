// Agent B — shared helpers for API integration tests.
// We never import server/index.js (forbidden file; it also self-listens and
// seeds on import) — every request targets a LIVE server instead.

export const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3001';

/** True when the chat server answers on BASE_URL. */
export async function serverUp() {
  try {
    const res = await fetch(`${BASE_URL}/`);
    return res.ok;
  } catch {
    return false;
  }
}

/** DB-backed assertions only make sense when the server has a database configured. */
export function hasDatabase() {
  return Boolean(process.env.DATABASE_URL);
}

let seq = 0;

/** Collision-free email (Joi .email()). */
export function uniqueEmail(prefix = 'agb') {
  seq += 1;
  return `${prefix}.${Date.now()}.${seq}${Math.floor(Math.random() * 90 + 10)}@example.com`;
}

/**
 * Fresh user payload for POST /api/auth/register.
 * NOTE: the Joi register schema requires username to be STRICTLY alphanumeric
 * (3–30 chars), so no underscores/hyphens are allowed here.
 */
export function makeUser(prefix = 'agb') {
  const stamp = `${Date.now().toString(36)}${seq}${Math.floor(Math.random() * 900 + 100)}`
    .replace(/[^a-zA-Z0-9]/g, '');
  return {
    email: uniqueEmail(prefix),
    username: `${prefix}${stamp}`.slice(0, 30),
    password: 'Passw0rd!123',
    display_name: 'Agent B Test User'
  };
}

/**
 * Lazily import supertest, bound to BASE_URL.
 * Keeping this lazy lets the whole suite self-skip (CI runs, no-DB runs)
 * without requiring supertest to be installed.
 */
export async function getRequest() {
  const { default: request } = await import('supertest');
  return request(BASE_URL);
}

/** Register a fresh user against the live server; returns { user, token, refreshToken }. */
export async function createUser(prefix = 'agb') {
  const request = await getRequest();
  const user = makeUser(prefix);
  const res = await request(BASE_URL).post('/api/auth/register').send(user);
  if (res.status !== 201) {
    throw new Error(`createUser failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return { user, token: res.body.token, refreshToken: res.body.refreshToken };
}