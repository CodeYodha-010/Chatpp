import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE_URL, serverUp, getRequest } from './helpers.js';

// Pure HTTP-layer contract tests — these do NOT depend on DATABASE_URL,
// only on a reachable server (which itself needs a DB to boot).

test('HTTP layer', async (t) => {
  if (!(await serverUp())) {
    return t.skip(`server not reachable at ${BASE_URL} — start it with: cd server && npm start`);
  }

  const request = await getRequest();

  await t.test('GET / → 200 with status payload', async () => {
    const res = await request.get('/');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'Chat server running');
  });

  await t.test('unknown /api route → 404 JSON (never an HTML error page)', async () => {
    const res = await request.get('/api/definitely-not-a-real-route');
    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'Not found');
    assert.ok(!res.text?.includes('<html'), '404 must be JSON, not HTML');
  });

  await t.test('responses carry CORS header', async () => {
    const res = await request.get('/');
    assert.ok(
      res.headers['access-control-allow-origin'],
      'expected Access-Control-Allow-Origin on responses'
    );
  });
});