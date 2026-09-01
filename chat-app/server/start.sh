#!/bin/sh
set -e

echo "Generating Prisma client..."
npx prisma generate

echo "Syncing database schema..."
npx prisma db push --skip-generate 2>/dev/null || echo "DB push skipped (may already exist or be managed externally)"

echo "Starting server..."
exec node index.js
