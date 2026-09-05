# Build Stage 1: Frontend
FROM node:22-slim AS client-builder
WORKDIR /app/client
COPY chat-app/client/package*.json ./
RUN npm ci
COPY chat-app/client/ .
RUN npm run build

# Build Stage 2: Backend
FROM node:22-slim AS server-builder
WORKDIR /app/server
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY chat-app/server/package*.json ./
RUN npm ci
COPY chat-app/server/ .
RUN npx prisma generate

# Final Stage: Combined Runtime
FROM node:22-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy built client
COPY --from=client-builder /app/client/dist ./server/public
# Copy built server
COPY --from=server-builder /app/server/node_modules ./server/node_modules
COPY chat-app/server/package*.json ./server/
COPY chat-app/server/prisma ./server/prisma
COPY chat-app/server ./server
RUN rm -rf server/logs && mkdir -p server/logs

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0

EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --start-period=25s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["sh", "-c", "cd server && npx prisma generate && npx prisma db push --skip-generate || true; node index.js"]
