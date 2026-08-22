# API Test Suite

Integration tests for the Express + Socket.IO backend, built on Node's built-in
runner (`node:test`) + `supertest` — no Jest/Mocha dependency by design.

## Run

```bash
# 1. one-time deps (supertest for HTTP, socket.io-client for future WS tests)
cd server && npm i -D supertest && npm i socket.io-client

# 2. keep the API running — tests hit a LIVE server on :3001
npm start

# 3. run everything
node --env-file=.env --test tests/

# single suite
node --env-file=.env --test tests/auth.test.js
```

Requires Node >= 20.6 for `--env-file`. On older Node versions, export
`DATABASE_URL` manually before running.

## Suites

| File | Covers |
|------|--------|
| `auth.test.js` | register (201 / dup 409 / validation 400), login (+ wrong password), `/me` (no / bad / valid token), logout revocation* |
| `rooms.test.js` | list (401 / 200 + shape), create (201 / dup 409), messages (401, `?limit`, encrypted field shape), NaN-id behavior† |
| `http.test.js` | `GET /` status payload, unknown-route 404 as JSON, CORS header presence |

\* The logout→401 case auto-activates once JWTs are bound to sessions
(blocker A1); today it reports `SKIP pending Agent A token-revocation`.
† Pins exact current behavior (500) with a `TODO(A1)` to tighten to 400.

## Self-skipping

Every suite preflights before touching supertest:
1. Is `GET /` reachable? otherwise SKIP
2. Is `DATABASE_URL` set? otherwise SKIP

So `node --test server/tests/` is always CI-safe — green with or without
database secrets installed.

## Rate-limit caveat

`authLimiter` allows **5 failed attempts / 15 min / IP** (successes excluded).
Each full run makes exactly 3 intentional failures — re-running twice within
the window can produce HTTP 429s. Restart the server or wait between runs.

## Test data cleanup

Suites generate real rows (`agb.*@example.com` users, `agentb-*` rooms):

```bash
node --env-file=.env tests/cleanup.js           # dry run
node --env-file=.env tests/cleanup.js --apply   # delete
```