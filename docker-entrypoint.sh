#!/bin/sh
set -e

echo "🚀 Starting D&D Session Recorder..."

# Check if DATABASE_URL is already set (by Fly.io secrets or environment)
if [ -n "$DATABASE_URL" ]; then
    echo "📊 Using provided DATABASE_URL"
    
    # Check if it's a PostgreSQL database
    if echo "$DATABASE_URL" | grep -q "postgresql://"; then
        echo "🐘 Detected PostgreSQL database"
        DB_TYPE="postgresql"
    else
        echo "📁 Detected SQLite database"
        DB_TYPE="sqlite"
        
        # For SQLite, ensure the directory exists
        if echo "$DATABASE_URL" | grep -q "file:"; then
            DB_PATH=$(echo "$DATABASE_URL" | sed 's|file:||')
            DB_DIR=$(dirname "$DB_PATH")
            mkdir -p "$DB_DIR" 2>/dev/null || true
        fi
    fi
else
    # No DATABASE_URL provided, default to SQLite for development
    echo "⚠️  No DATABASE_URL provided, using local SQLite"
    export DATABASE_URL="file:./prisma/data/app.db"
    DB_TYPE="sqlite"
    DB_PATH="./prisma/data/app.db"
    DB_DIR="./prisma/data"
    mkdir -p "$DB_DIR"
fi

# Initialize database schema
echo "🔧 Initializing database schema..."

# Note: The Docker build uses PostgreSQL schema by default (see Dockerfile)
# For local development with SQLite, use schema.sqlite.prisma

if [ "$DB_TYPE" = "postgresql" ]; then
    echo "🔄 Running database migrations for PostgreSQL..."
    node ./node_modules/prisma/build/index.js db push --skip-generate --accept-data-loss
elif [ "$DB_TYPE" = "sqlite" ]; then
    # SQLite is only for local development/staging with volume mount
    if [ ! -f "$DB_PATH" ]; then
        echo "🗃️  SQLite database not found. Creating..."
        touch "$DB_PATH"
    fi
    echo "🔄 Running database migrations for SQLite..."
    # Note: This requires the schema to be set to SQLite provider
    node ./node_modules/prisma/build/index.js db push --skip-generate || {
        echo "⚠️  SQLite migration failed. The production build uses PostgreSQL schema."
        echo "For SQLite, you need to build with schema.sqlite.prisma"
    }
fi

echo "✅ Database initialization complete"

echo "🌐 Starting Next.js server on port ${PORT:-3000}..."

# Start the application
exec "$@"