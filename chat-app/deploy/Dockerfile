# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────
# Server image (Express API + Socket.IO) — Agent B, phase B4.
#
# Debian slim (not alpine): Prisma query engines and bcrypt prebuilt
# binaries are far more reliable on glibc. OpenSSL is required by Prisma.
# ─────────────────────────────────────────────────────────────────────────
FROM node:22-slim

RUN apt-get update -y \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1) Dependencies first → cached layer on source-only changes.
#    bcrypt ships glibc prebuilds; if a future version needs compilation,
#    add "python3 make g++" to the apt-get line above.
COPY server/package.json server/package-lock.json ./
RUN npm ci

# 2) Generate the Prisma client against the committed schema.
COPY server/prisma ./prisma
RUN npx prisma generate

# 3) Application source. server/.env / logs / db artifacts are excluded
#    via .dockerignore — containers read config from environment variables.
COPY server/index.js server/db server/config server/lib server/middleware \
     server/models server/routes server/utils server/start.sh ./

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

# Winston writes ./logs at require-time; make sure the node user can.
RUN mkdir -p /app/logs && chown -R node:node /app && chmod +x /app/start.sh
USER node

HEALTHCHECK --interval=15s --timeout=5s --start-period=25s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["sh", "/app/start.sh"]