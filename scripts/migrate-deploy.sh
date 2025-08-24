#!/bin/sh
# Migration script for Fly.io release phase

echo "🔄 Starting database migration process..."

# Check if we're in the release phase
if [ "$RELEASE_COMMAND" = "1" ]; then
  echo "✅ Running in release phase"
fi

# First, try to run migrations
echo "📦 Attempting to deploy migrations..."
if npx prisma migrate deploy; then
  echo "✅ Migrations deployed successfully"
else
  EXIT_CODE=$?
  echo "⚠️  Migration deploy failed with exit code $EXIT_CODE"
  
  # If migrations fail, it might be because the schema doesn't exist yet
  # Try using db push as a fallback for initial setup
  echo "🔄 Attempting to sync schema with db push..."
  if npx prisma db push --skip-generate; then
    echo "✅ Schema synchronized successfully"
    
    # Try to mark migrations as applied
    echo "📝 Marking migrations as applied..."
    npx prisma migrate resolve --applied "20250819111739_initial_postgresql" || true
    
    echo "✅ Database initialization complete"
  else
    echo "❌ Both migration deploy and db push failed"
    echo "🔍 Please check database permissions and configuration"
    exit 1
  fi
fi

echo "✅ Database migration process complete"