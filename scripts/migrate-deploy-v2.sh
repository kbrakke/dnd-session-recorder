#!/bin/sh
# Simplified migration script for Fly.io PostgreSQL
# This version handles ownership issues more gracefully
set -e

echo "🔄 Starting database migration process (v2)..."
echo "📍 Environment: ${NODE_ENV:-development}"

# Ensure Prisma CLI is available
if ! command -v prisma >/dev/null 2>&1; then
  echo "📦 Installing Prisma CLI..."
  npm install -g prisma@6.12.0
fi

# Check current database state
echo "🔍 Checking database connection and ownership..."
npx prisma db execute --stdin --schema=prisma/schema.prisma <<EOF 2>/dev/null || true
SELECT current_user as db_user, current_database() as db_name;
EOF

# Show table ownership to help diagnose issues
echo "📊 Current table ownership:"
npx prisma db execute --stdin --schema=prisma/schema.prisma <<EOF 2>/dev/null || true
SELECT tablename, tableowner 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('gaming_sessions', 'users', '_prisma_migrations')
LIMIT 5;
EOF

# Attempt standard migration deployment
echo "📦 Attempting Prisma migrations..."
if npx prisma migrate deploy --schema=prisma/schema.prisma 2>&1 | tee /tmp/migrate.log; then
  echo "✅ Migrations completed successfully"
  exit 0
fi

# Check if it failed due to ownership (42501) or failed migrations (P3009)
if grep -q "42501\|must be owner" /tmp/migrate.log; then
  echo "❌ Migration failed due to table ownership issues"
  echo ""
  echo "⚠️  OWNERSHIP ISSUE DETECTED"
  echo "=============================="
  echo "The database user doesn't own the tables it needs to modify."
  echo ""
  echo "For STAGING (data can be reset):"
  echo "  1. fly postgres detach -a dnd-recorder-staging"
  echo "  2. fly postgres connect -a <db-app> -c 'DROP DATABASE staging'"
  echo "  3. fly postgres attach <db-app> -a dnd-recorder-staging"
  echo "  4. fly deploy --config fly.staging.toml"
  echo ""
  echo "For PRODUCTION (preserve data):"
  echo "  See docs/fly-postgres-setup.md for ownership transfer instructions"
  echo ""
  exit 1
elif grep -q "P3009" /tmp/migrate.log; then
  echo "⚠️  Found failed migrations, attempting to resolve..."
  
  # Try to resolve the specific migration
  npx prisma migrate resolve --rolled-back "20250826132223_add_transcription_progress_tracking" --schema=prisma/schema.prisma 2>/dev/null || true
  
  # Retry migration
  echo "📦 Retrying migrations..."
  if npx prisma migrate deploy --schema=prisma/schema.prisma; then
    echo "✅ Migrations completed after resolution"
    exit 0
  else
    echo "❌ Migration still failed"
    exit 1
  fi
else
  echo "❌ Migration failed for unknown reason"
  cat /tmp/migrate.log
  exit 1
fi