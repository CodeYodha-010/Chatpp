# Deployment Stack (Docker)

Dockerized, horizontally scalable deployment for the chat backend:
**nginx (least-conn LB) → N × app replicas → Redis → PostgreSQL**, plus an
opt-in **BullMQ worker** slot for AI classification.

## Files
| File | Purpose |
|---|---|
| `deploy/Dockerfile` | Server image — Node 22 slim, OpenSSL (Prisma), `prisma generate`, non-root user, container healthcheck |
| `deploy/nginx.conf` | Reverse proxy: `least_conn` upstream over `app:3001`, WS upgrade headers, 3600s read/send timeouts |
| `.dockerignore` | Keeps build context small and **secret-free** (`.env` never enters an image) |
| `../docker-compose.yml` | redis / app / worker / nginx with healthchecks + env interpolation |

## Run it

### 0. One-time prerequisites
```bash
# install Docker Desktop (wsl2 backend), then verify:
docker version && docker compose version

# create the ROOT .env (next to docker-compose.yml) — NEVER commit it:
```
`.env` template:
```env
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
JWT_SECRET=<32+ random characters>
JWT_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:5173
GROQ_API_KEY=gsk_...
CHAT_ENCRYPTION_KEY=<64 hex chars>
BCRYPT_ROUNDS=10
```

### 1. Start the full stack (2 app replicas behind nginx)
```bash
docker compose up --build -d --scale app=2
docker compose ps
```
- Chat entry point: **http://localhost:8080**
- Scale to any count: `docker compose up -d --scale app=4`

### 2. Worker (after Agent A lands `server/worker.js`, blocker A4)
```bash
docker compose --profile ai-worker up -d --build
```

### 3. Useful operations
```bash
docker compose logs -f app          # tail both replicas
docker compose exec app node -e "fetch('http://localhost:3001/api/health').then(r=>r.text()).then(console.log)"
docker compose down                 # stop everything
```

## ⚠️ Honest limitation (until Agent A's follow-ups)
True multi-instance messaging needs the **Socket.IO Redis adapter** wired into
`server/index.js` and a **distributed rate limiter** (blockers A2/A4). Until
then this stack *runs* and load-balances HTTP correctly, but socket events are
per-replica. The infrastructure here is the exact target architecture from the
system-design section of the README.

## Healthchecks
| Service | Check |
|---|---|
| redis | `redis-cli ping` |
| app | Node `fetch('/ ')` must return ok |
| nginx | implicit (depends_on gating) |