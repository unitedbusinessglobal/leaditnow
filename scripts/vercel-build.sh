#!/bin/sh
# Vercel build: apply pending migrations to this environment's Neon branch, then build.
# Environments without a database (e.g. dev before its branch exists) skip the migration step.
set -e
if [ -n "$DATABASE_URL_UNPOOLED" ]; then
  echo "Applying migrations for $VERCEL_ENV (${VERCEL_GIT_COMMIT_REF:-local})"
  # Neon branches pause when idle; give the compute time to wake (Prisma's default is 5s).
  case "$DATABASE_URL_UNPOOLED" in
    *connect_timeout=*) ;;
    *\?*) DATABASE_URL_UNPOOLED="$DATABASE_URL_UNPOOLED&connect_timeout=30" ;;
    *) DATABASE_URL_UNPOOLED="$DATABASE_URL_UNPOOLED?connect_timeout=30" ;;
  esac
  export DATABASE_URL_UNPOOLED
  npx prisma migrate deploy || { echo "Retrying migrations in 10s"; sleep 10; npx prisma migrate deploy; }
else
  echo "No DATABASE_URL_UNPOOLED for $VERCEL_ENV (${VERCEL_GIT_COMMIT_REF:-local}); skipping migrations"
fi
npx prisma generate
npx next build
