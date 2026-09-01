@echo off
setlocal

echo Generating Prisma client...
npx prisma generate

echo Syncing database schema...
npx prisma db push --skip-generate
if errorlevel 1 echo DB push skipped (may already exist or be managed externally)

echo Starting server...
node index.js
