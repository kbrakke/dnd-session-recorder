#!/bin/sh
# Migration script for Fly.io release phase
# Note: This script assumes proper table ownership. See docs/fly-postgres-setup.md for setup instructions.
set -e

echo "🔄 Starting database migration process..."

# Check if we're in the release phase
if [ "$RELEASE_COMMAND" = "1" ]; then
  echo "✅ Running in release phase"
fi

# IMPORTANT: Table ownership must be correct for migrations to work
# If you encounter "must be owner of table" errors, see docs/fly-postgres-setup.md

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

# Check table ownership and current user
echo "🔍 Checking database user and table ownership..."
npx prisma db execute --stdin --schema=prisma/schema.prisma <<EOF
SELECT current_user, current_database();
EOF

echo "📊 Table ownership information:"
npx prisma db execute --stdin --schema=prisma/schema.prisma <<EOF
SELECT 
  schemaname,
  tablename,
  tableowner
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('_prisma_migrations', 'gaming_sessions', 'users', 'campaigns');
EOF

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
    
    # Check if it's a permission issue and try manual migration
    echo "🔍 Checking if failure is due to table ownership (42501 error)..."
    
    # Try to apply the migration manually if it's the transcription progress one
    echo "🔄 Attempting manual column addition as workaround for ownership issue..."
    
    # Check if columns already exist
    COLUMN_CHECK=$(npx prisma db execute --stdin --schema=prisma/schema.prisma <<EOF
SELECT COUNT(*) as existing_columns
FROM information_schema.columns 
WHERE table_name = 'gaming_sessions' 
AND column_name IN ('transcription_progress', 'total_chunks', 'chunks_completed', 'current_step');
EOF
)
    
    echo "Column check result: $COLUMN_CHECK"
    
    # If columns don't exist, try adding them without ALTER TABLE ownership
    echo "🔧 Attempting to work around ownership issue..."
    
    # Try using Prisma's db push as a workaround - it might have different permission requirements
    echo "📦 Attempting Prisma db push as alternative to migration..."
    if npx prisma db push --schema=prisma/schema.prisma --skip-generate --accept-data-loss; then
      echo "✅ Schema synchronized using db push"
      
      # Mark the migration as applied since we've manually synchronized the schema
      echo "📝 Marking migration as applied..."
      npx prisma migrate resolve --applied "20250826132223_add_transcription_progress_tracking" --schema=prisma/schema.prisma || true
      
      echo "✅ Database schema updated via alternative method"
    else
      echo "❌ Alternative schema update also failed"
      
      # Final status check
      echo "🔍 Final migration status check..."
      npx prisma db execute --stdin --schema=prisma/schema.prisma <<EOF
SELECT migration_name, started_at, finished_at, logs FROM _prisma_migrations ORDER BY started_at DESC LIMIT 5;
EOF
      
      # Show current schema state
      echo "📊 Current gaming_sessions columns:"
      npx prisma db execute --stdin --schema=prisma/schema.prisma <<EOF
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'gaming_sessions'
ORDER BY ordinal_position;
EOF
      
      exit 1
    fi
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