#!/bin/sh
# Migration script for Fly.io release phase
set -e

echo "🔄 Starting database migration process..."

# Check if we're in the release phase
if [ "$RELEASE_COMMAND" = "1" ]; then
  echo "✅ Running in release phase"
fi

# Debugging information
echo "📍 Environment variables:"
echo "  - NODE_ENV: ${NODE_ENV:-not-set}"
echo "  - DATABASE_URL: ${DATABASE_URL:+[SET]}"
echo "  - PWD: $(pwd)"

# Check if Prisma is available
if command -v prisma >/dev/null 2>&1; then
  echo "✅ Prisma CLI found: $(which prisma)"
else
  echo "❌ Prisma CLI not found, installing..."
  npm install -g prisma@6.12.0
fi

# Check if migration files exist
if [ -d "prisma/migrations" ]; then
  echo "📁 Migration files found:"
  ls -la prisma/migrations/ | head -10
else
  echo "❌ No migration directory found!"
  exit 1
fi

# Test database connection before migration
echo "🔍 Testing database connection..."
npx prisma db execute --stdin --schema=prisma/schema.prisma <<EOF
SELECT 1 as connection_test;
EOF

if [ $? -eq 0 ]; then
  echo "✅ Database connection successful"
else
  echo "❌ Database connection failed"
  exit 1
fi

# Check for failed migrations and handle P3009 error
echo "🔍 Checking for failed migrations..."

# Try to run migrations first, if P3009 error occurs, resolve it
echo "📦 Running Prisma migrations..."
if ! npx prisma migrate deploy --schema=prisma/schema.prisma; then
  MIGRATION_ERROR=$?
  echo "⚠️  Migration failed, checking for P3009 error (failed migrations)..."
  
  # Check if the specific migration we're concerned about failed
  echo "🔍 Checking migration status..."
  npx prisma db execute --stdin --schema=prisma/schema.prisma <<EOF
SELECT migration_name, started_at, finished_at, logs FROM _prisma_migrations 
WHERE finished_at IS NULL 
ORDER BY started_at DESC;
EOF
  
  # Try to resolve any failed migrations
  echo "🔄 Looking for failed migrations to resolve..."
  
  # First try the specific migration we know about
  echo "🔄 Attempting to resolve failed migration: 20250826132223_add_transcription_progress_tracking"
  if npx prisma migrate resolve --rolled-back "20250826132223_add_transcription_progress_tracking" --schema=prisma/schema.prisma; then
    echo "✅ Successfully resolved migration: 20250826132223_add_transcription_progress_tracking"
  else
    echo "⚠️  Could not resolve specific migration, checking for other failed migrations..."
    
    # Try to resolve any other failed migration that might exist
    # This is a fallback in case the migration name is different
    echo "🔍 Attempting to resolve any failed migrations..."
    npx prisma migrate resolve --rolled-back "20250819111739_initial_postgresql" --schema=prisma/schema.prisma 2>/dev/null || true
  fi
  
  echo "📦 Retrying Prisma migrations after resolution..."
  if npx prisma migrate deploy --schema=prisma/schema.prisma; then
    echo "✅ Database migration process complete after resolution"
  else
    echo "❌ Migration still failed after attempting to resolve"
    
    # Final status check
    echo "🔍 Final migration status check..."
    npx prisma db execute --stdin --schema=prisma/schema.prisma <<EOF
SELECT migration_name, started_at, finished_at, logs FROM _prisma_migrations ORDER BY started_at DESC LIMIT 5;
EOF
    
    exit 1
  fi
else
  echo "✅ Database migration process complete"
fi

# Verify migration by checking for new columns
echo "🔍 Verifying migration success..."
npx prisma db execute --stdin --schema=prisma/schema.prisma <<EOF
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'gaming_sessions' 
AND column_name IN ('transcription_progress', 'total_chunks', 'chunks_completed', 'current_step');
EOF

echo "✅ Migration verification complete"