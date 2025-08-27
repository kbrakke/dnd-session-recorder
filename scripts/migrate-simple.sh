#!/bin/sh
# Simplified migration script that handles Fly.io PostgreSQL properly
set -e

echo "🔄 Starting database migration process (simplified)..."

# Check environment
echo "📍 Environment: ${NODE_ENV:-not-set}"
echo "📍 DATABASE_URL: ${DATABASE_URL:+[SET]}"

# Check if Prisma is available
if ! command -v prisma >/dev/null 2>&1; then
  echo "📦 Installing Prisma CLI..."
  npm install -g prisma@6.12.0
fi

# First, try to baseline the database if needed
echo "🔍 Checking migration history..."
MIGRATION_COUNT=$(npx prisma migrate status --schema=prisma/schema.prisma 2>&1 | grep -c "migration" || echo "0")

if [ "$MIGRATION_COUNT" = "0" ]; then
  echo "📝 No migrations found in database, marking existing schema as baseline..."
  
  # Mark all migrations as already applied if this is an existing database
  npx prisma migrate resolve --applied "20250819111739_initial_postgresql" --schema=prisma/schema.prisma 2>/dev/null || true
  npx prisma migrate resolve --applied "20250826132223_add_transcription_progress_tracking" --schema=prisma/schema.prisma 2>/dev/null || true
fi

# Try to deploy migrations
echo "📦 Deploying migrations..."
if npx prisma migrate deploy --schema=prisma/schema.prisma; then
  echo "✅ Migrations deployed successfully"
else
  EXIT_CODE=$?
  echo "⚠️  Migration deployment failed with code $EXIT_CODE"
  
  # If it's a P3009 error (failed migrations), try to resolve
  if npx prisma migrate status --schema=prisma/schema.prisma 2>&1 | grep -q "failed"; then
    echo "🔄 Found failed migrations, attempting to resolve..."
    npx prisma migrate resolve --rolled-back "20250826132223_add_transcription_progress_tracking" --schema=prisma/schema.prisma || true
    
    # Retry deployment
    echo "📦 Retrying migration deployment..."
    if npx prisma migrate deploy --schema=prisma/schema.prisma; then
      echo "✅ Migrations deployed successfully after resolution"
    else
      echo "❌ Migration still failed"
      echo ""
      echo "⚠️  MANUAL INTERVENTION REQUIRED:"
      echo "1. Connect to database: fly postgres connect -a <db-app-name>"
      echo "2. Run: \\c staging"
      echo "3. Check table owner: SELECT tablename, tableowner FROM pg_tables WHERE schemaname='public';"
      echo "4. If owner is wrong, fix it: ALTER TABLE gaming_sessions OWNER TO staging;"
      echo "5. Redeploy: fly deploy --config fly.staging.toml"
      exit 1
    fi
  else
    exit $EXIT_CODE
  fi
fi

echo "✅ Migration process complete"