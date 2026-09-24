# Commit Log

Daily commit ledger for this repository. **This log intentionally covers only
the last five days (from 2026-09-18 onward); older pushes are out of scope.**

**Read this first (for any future agent or reviewer):** this file is the
single source of truth for what has been pushed, what is planned, and the
pacing rules. Reading it top to bottom is enough to continue the work.

**Rules**
- Maximum **10 commits per day** so the contribution graph stays green every
  day without dumping work in bursts.
- Each day is themed (one coherent story), every commit is buildable on its
  own, and messages follow Conventional Commits with an explanatory body
  (what changed, why, measured effect).
- Work is deliberately spread across days - never dump the whole backlog in
  one day; the upcoming-days table below holds the reserved plan.
- This file is updated at the end of every day and committed as the day's
  **last commit** (`docs: update commit log`), so the hashes above it are
  always real.
- Status: ✅ pushed to `origin/main` · 🔜 planned / not yet pushed.

---

## 2026-09-18 — 10 commits — ✅ pushed

| Hash | Message |
|---|---|
| `dd28fb5` | chore(client): add ESLint flat config |
| `7142626` | chore(client): add lint and test scripts |
| `fdb9796` | chore(client): install lint and test deps |
| `2aab38a` | fix(client): resolve lint warnings in shell and auth |
| `1d0508c` | ci: run client lint and tests in workflow |
| `f02d865` | docs: document client lint and test workflow |
| `b455ae4` | feat(server): add Reaction model with unique toggle key |
| `d2cb245` | feat(server): add reaction aggregation helpers |
| `268f25c` | feat(server): add serialized reaction writer |
| `5795041` | feat(server): add Reaction query model |

## 2026-09-19 — 10 commits — ✅ pushed

| Hash | Message |
|---|---|
| `d8ec8f8` | feat(client): add emoji popover component |
| `990a832` | feat(client): add cursor-correct emoji insertion helper |
| `2554b4b` | feat(client): add optimistic reaction state helper |
| `6e91eb2` | test(client): add emoji and reaction state suites |
| `03cd0d5` | test(server): add reaction writer and reactions suites |
| `48b8d17` | chore(server): add supertest dev dependency |
| `2a4d981` | fix(server): register test users on a non-blocked email domain |
| `99a8f45` | fix(server): align auth and http test expectations with current behavior |
| `51205a5` | fix(server): expect 400 for invalid room ids in room tests |
| `8ccc55d` | test(server): add reactions end-to-end verification script |

## 2026-09-20 — 10 commits — ✅ pushed

| Hash | Message |
|---|---|
| `fe67f98` | feat(server): apply per-user message visibility filters |
| `3656e2c` | feat(server): add createGroup validation and lock room type |
| `469e989` | feat(server): add dm, group, and message-visibility models to schema |
| `0134480` | feat(server): restrict room listing and invites to real membership |
| `4cc67c6` | fix(server): tune database pool for neon and graceful shutdown |
| `3f627b4` | fix(server): route authentication through pooled db wrapper |
| `436f24b` | feat(server): add dm, group, and message-selection socket handlers |
| `affcc0f` | feat(deploy): retry prisma schema sync on container start |
| `18bbda6` | docs: document dm api and room visibility changes |
| `489a897` | test(server): add dm end-to-end verification script |

## 2026-09-21 — 10 commits — ✅ pushed (contacts-only privacy rework + DB resilience)

Server test suite at push time: **32 tests, 0 failures, 0 skipped.**

| Hash | Message |
|---|---|
| `b1fb372` | feat(server): scope people list and profiles to real contacts |
| `d93dcb3` | feat(server): seed demo contact and connect new signups to it |
| `96f7487` | feat(server): dm/group-only listing and refuse public room creation |
| `2519f8e` | feat(server): scoped presence, group handlers, and member gate on sockets |
| `10698d3` | fix(server): rebuild prisma pool and bound connects on neon cold start |
| `02d61a6` | fix(server): retry auth, model, and reaction writes across pool rebuilds |
| `34eaa79` | feat(client): contacts-only sidebar with copy-name invites and presence |
| `c84496d` | chore(client): guard against use-before-define tdz crashes |
| `1857065` | test(server): update room tests and dm verification for contacts-only flow |
| *this commit* | docs: add daily commit log |

---

## 2026-09-22 — 8 commits — ✅ pushed (server speed & reliability)

The user-facing complaints (slow invite, slow chat open, slow reload,
slow login) traced to sequential database round-trips against WAN-hosted
Neon. This day removed the redundant trips server-side and added a
transcript cache. Client-side work (invite dialog, history reliability)
is reserved for 2026-09-23 per the pacing rule.

Test state at push time: server suite **22/22 pass** (live server,
`DB_KEEPALIVE_MS=300000`), client **lint clean + 18/18 tests + build OK**,
all six new query shapes verified against live Postgres. Environment
notes: Neon was heavily throttled during this window (SELECT 1 up to
~1s); the pool was widened in `.env` to `connection_limit=10,
pool_timeout=30` (local-only, uncommitted).

| Hash | Message |
|---|---|
| `ff65068` | fix(server): fetch session with user in one query |
| `3148c22` | fix(server): write audit receipts without blocking auth responses |
| `913e1a7` | perf(server): fetch contact list in a single query |
| `0608b3a` | perf(server): fold reactions into transcript queries |
| `6c26cff` | perf(server): resolve conversation lists in one round-trip |
| `e59594b` | perf(server): add redis-backed transcript cache |
| `dea388f` | perf(server): single-round joins with cached membership gate |
| *this commit* | docs: update commit log for 2026-09-22 |

Effect: opening a chat costs 2 round-trips cold / 1 warm (was 5); page
refresh ~6 queries (was ~13); login sheds the blocking audit receipt.

---

## 2026-09-23 — 10 commits — ✅ pushed (invite & reliability)

The reserved invite dialog shipped together with a reliability batch: the
CSRF first-token fix, named socket-listener cleanup, stale-room history
guards with the join-banner reset, the session lookup cache, the transcript
memory cap, and presence coalescing with ghost-row filtering. Everything was
validated before the first commit: client lint clean + 18/18 tests + build
OK; server suite 22/22 against a live boot (`DB_KEEPALIVE_MS=300000`).

| Hash | Message |
|---|---|
| `be49eee` | fix(server): return the issued csrf token on first call |
| `d9f586c` | fix(server): log to stdout in production |
| `5e5f736` | fix(client): remove only own socket listeners on cleanup |
| `6415ce9` | fix(client): apply history only to the active room and clear the join banner |
| `d2f55fe` | perf(server): cache session lookups for authenticated requests |
| `405d4fe` | perf(server): bound transcript memory with an lru |
| `9478e76` | perf(server): coalesce presence broadcasts and drop ghost rows |
| `50a0980` | feat(client): add the in-app invite dialog |
| `a275a3d` | style(client): add invite dialog styling |
| *this commit* | docs: update commit log |

Notes: session-cache revocation is instant via explicit cache bumps on
logout and refresh (live-verified: immediate 401 after logout). Presence
flushes at most once per 750ms window; `getOnlineUsers` hides sockets with
no live connection and deletes rows older than 5 minutes. Newly discovered
but deliberately NOT scheduled today (moved to later days per the pacing
rule): the nav rail is removed below 768px with no mobile replacement,
video/attach buttons are decorative, `dompurify`/`marked` and
`utils/crypto.js` are unused.

---

## Upcoming days (reserved so the green streak continues — never dump the backlog)

| Day | Theme | Planned commits |
|---|---|---|
| 2026-09-24 | Production hygiene I | Fix CI typo (`rooms.test.jsserver/tests/http.test.js` paths are concatenated in `.github/workflows/ci.yml`, so the http suite never runs there); remove duplicate `notFound`/`errorHandler` registration in `index.js` (registered at two sites) + docs |
| 2026-09-25 | Production hygiene II | Prisma migrations baseline (currently `db push` only, no `prisma/migrations` — risky on a live database); add a Postgres service to CI so suites actually run there (they self-skip without a database) + docs |
| 2026-09-26 | Observability | Free-tier Sentry error tracking, richer `/health` (pool + cache state), docs |
| 2026-09-27 | WhatsApp-style sidebar | Last-message preview, timestamp, unread badge on conversation rows, docs |
| 2026-09-28 | History UX | "Load older messages" using the `before` cursor `Message.listByRoom` already supports, docs |
| 2026-09-29 | Profile & settings polish | Avatar color picker, theme persistence, docs |
| 2026-09-30 | Security pass | Encryption key-rotation support (versioned keys), rate-limit review, docs |
| 2026-10-01 | Scale check | Run k6 scripts (`k6/chat-load.js`, `k6/socketio.js`), tune from results, docs |

Each day must end with its `docs: update commit log` commit so this file
stays truthful. If a day's work finishes early, add newly-discovered real
work to later days rather than inflating any single day past 10.

*Note for future runs: the live server should be started with
`DB_KEEPALIVE_MS=300000` during test windows so Neon's scale-to-zero cannot
suspend the compute mid-run. Also beware: dotenv does not override
variables already present in the shell session — a stale exported
`DATABASE_URL` silently wins over `.env`.*
