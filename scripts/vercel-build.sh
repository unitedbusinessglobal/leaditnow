#!/bin/sh
# Vercel build: apply pending migrations to this environment's Neon branch, then build.
# Environments without a database (e.g. dev before its branch exists) skip the migration step.
set -e
if [ -n "$DATABASE_URL_UNPOOLED" ]; then
  echo "Applying migrations for $VERCEL_ENV (${VERCEL_GIT_COMMIT_REF:-local})"
  npx prisma migrate deploy
else
  echo "No DATABASE_URL_UNPOOLED for $VERCEL_ENV (${VERCEL_GIT_COMMIT_REF:-local}); skipping migrations"
fi
npx prisma generate
npx next build
