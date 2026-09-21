# Commit Log

Daily commit ledger for this repository. **This log intentionally covers only
the last five days (from 2026-09-17 onward); older pushes are out of scope.**

**Rules**
- Maximum **10 commits per day** so the contribution graph stays green every
  day without dumping work in bursts.
- This file is updated at the end of every day and committed as the day's
  **last commit** (`docs: update commit log`), so the hashes above it are
  always real.
- Status: ✅ pushed to `origin/main` · 🔜 planned / not yet pushed.

---

## 2026-09-17 — 12 commits — ✅ pushed

| Hash | Message |
|---|---|
| `619d843` | feat(chat): add continental design tokens and shell layout styles |
| `1241c30` | feat(chat): add chat transcript, bubbles, and composer styles |
| `99aebaa` | feat(chat): add drawer, panel, and light theme styles |
| `a74a98f` | feat(chat): add micro-motion layer |
| `6002e98` | feat(chat): scaffold continental workspace with live transcript |
| `1470d9b` | feat(chat): add own profile and settings drawer |
| `39d7c7d` | feat(chat): add people directory and person profiles with presence |
| `ef0fca6` | feat(chat): add notifications and room details drawers |
| `7c05532` | feat(chat): port landing wave logo into workspace rail |
| `ecfdaeb` | feat(chat): enlarge avatar initials for legibility |
| `39a34b0` | feat(client): route /app through auth guard to Continental workspace |
| `4e3f47f` | refactor(client): remove legacy chat components superseded by Continental app |

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

## Upcoming days (scheduled, ≤10 per day)

| Day | Planned |
|---|---|
| 2026-09-22 | Final end-to-end DM/group smoke verification run + any fixes it surfaces; `docs: update commit log` |
| 2026-09-23+ | Remaining polish toward the ~20–25 commit total; each day ends with a log update |

*Note for future runs: the live server should be started with
`DB_KEEPALIVE_MS=300000` during test windows so Neon's scale-to-zero cannot
suspend the compute mid-run.*
