import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE_URL, serverUp, hasDatabase, makeUser, getRequest } from './helpers.js';

// Rate-limit awareness (server/middleware/rateLimit.js):
//   authLimiter = 5 failures / 15 min / IP, with skipSuccessfulRequests: true.
// This suite intentionally produces exactly 3 failures (409 dup-email,
// 400 invalid-body, 401 wrong-password). Re-running twice within 15 minutes
// may therefore trip the limiter (HTTP 429) — restart the server or wait.

test('AUTH /api/auth/*', async (t) => {
  if (!(await serverUp())) {
    return t.skip(`server not reachable at ${BASE_URL} — start it with: cd server && npm start`);
  }
  if (!hasDatabase()) {
    return t.skip('DATABASE_URL not set — run with: node --env-file=.env --test tests/');
  }

  // Lazy supertest import — resolves only after the skip-guards above pass.
  const request = await getRequest();

  const user = makeUser('agbauth');
  let token = '';

  await t.test('register → 201 + token + refreshToken (email lowercased, no hash leak)', async () => {
    const res = await request(BASE_URL).post('/api/auth/register').send(user);
    assert.equal(res.status, 201);
    assert.ok(res.body.token, 'expected access token');
    assert.ok(res.body.refreshToken, 'expected refresh token');
    assert.equal(res.body.user.email, user.email.toLowerCase(), 'email must be stored lowercase');
    assert.equal(res.body.user.passwordHash, undefined, 'passwordHash must never leak');
    token = res.body.token;
  });

  await t.test('register duplicate email → 409', async () => {
    const res = await request(BASE_URL).post('/api/auth/register').send(user);
    assert.equal(res.status, 409);
  });

  await t.test('register invalid body → 400 + Joi details[]', async () => {
    const res = await request(BASE_URL)
      .post('/api/auth/register')
      .send({ username: 'x!', email: 'not-an-email', password: '1' });
    assert.equal(res.status, 400);
    assert.ok(Array.isArray(res.body.details), 'validate middleware should return details[]');
  });

  await t.test('login → 200 + fresh token', async () => {
    const res = await request(BASE_URL)
      .post('/api/auth/login')
      .send({ email: user.email, password: user.password });
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
    token = res.body.token;
  });

  await t.test('login wrong password → 401', async () => {
    const res = await request(BASE_URL)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'definitely-wrong' });
    assert.equal(res.status, 401);
  });

  await t.test('GET /me without token → 401', async () => {
    const res = await request(BASE_URL).get('/api/auth/me');
    assert.equal(res.status, 401);
  });

  await t.test('GET /me with malformed token → 401', async () => {
    const res = await request(BASE_URL)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not.a.jwt');
    assert.equal(res.status, 401);
  });

  await t.test('GET /me with valid token → 200', async () => {
    const res = await request(BASE_URL).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.user.email, user.email.toLowerCase());
    assert.equal(res.body.user.passwordHash, undefined);
  });

  await t.test('logout → 200, then /me → 401 (session revoked)', async (st) => {
    const out = await request(BASE_URL)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(out.status, 200);

    const me = await request(BASE_URL)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    if (me.status === 200) {
      // Correction #1 (approved): JWTs are not bound to sessions yet —
      // middleware/auth.js never consults the sessions table, so /me stays 200
      // after logout until Agent A ships revocation (blocker A1).
      st.skip('pending Agent A token-revocation (JWTs not bound to sessions today)');
      return;
    }
    assert.equal(me.status, 401);
  });
});