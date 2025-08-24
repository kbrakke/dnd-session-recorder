#!/bin/sh
# Migration script for Fly.io release phase

echo "🔄 Starting database migration process..."

# Check if we're in the release phase
if [ "$RELEASE_COMMAND" = "1" ]; then
  echo "✅ Running in release phase"
fi

# Now that staging user has schema admin privileges, use standard Prisma migration
echo "📦 Running Prisma migrations..."
npx prisma migrate deploy

echo "✅ Database migration process complete"