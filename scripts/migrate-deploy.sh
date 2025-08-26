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

# Now that staging user has schema admin privileges, use standard Prisma migration
echo "📦 Running Prisma migrations..."
npx prisma migrate deploy --schema=prisma/schema.prisma

if [ $? -eq 0 ]; then
  echo "✅ Database migration process complete"
else
  echo "❌ Migration failed"
  exit 1
fi

# Verify migration by checking for new columns
echo "🔍 Verifying migration success..."
npx prisma db execute --stdin --schema=prisma/schema.prisma <<EOF
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'gaming_sessions' 
AND column_name IN ('transcription_progress', 'total_chunks', 'chunks_completed', 'current_step');
EOF

echo "✅ Migration verification complete"