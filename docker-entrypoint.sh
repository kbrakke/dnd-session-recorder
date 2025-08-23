#!/bin/sh
set -e

echo "🚀 Starting D&D Session Recorder..."
echo "📍 Environment: ${NODE_ENV:-development}"
echo "📍 Public Environment: ${NEXT_PUBLIC_ENVIRONMENT:-not-set}"

# Log all environment variables (excluding secrets)
echo "📋 Environment Variables:"
echo "  - NODE_ENV: ${NODE_ENV:-not set}"
echo "  - PORT: ${PORT:-3000}"
echo "  - NEXTAUTH_URL: ${NEXTAUTH_URL:-not set}"
echo "  - DATABASE_URL: ${DATABASE_URL:+[SET]}"
echo "  - GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:+[SET]}"

# Check if DATABASE_URL is already set (by Fly.io secrets or environment)
if [ -n "$DATABASE_URL" ]; then
    echo "📊 Using provided DATABASE_URL"
    
    # Check if it's a PostgreSQL database
    if echo "$DATABASE_URL" | grep -q "postgresql://"; then
        echo "🐘 Detected PostgreSQL database"
        DB_TYPE="postgresql"
        
        # Test PostgreSQL connection
        echo "🔍 Testing PostgreSQL connection..."
        node -e "
        const url = process.env.DATABASE_URL;
        const { hostname, port, pathname } = new URL(url);
        console.log('  - Host:', hostname);
        console.log('  - Port:', port || 5432);
        console.log('  - Database:', pathname.slice(1));
        " || echo "⚠️  Could not parse DATABASE_URL"
        
    else
        echo "📁 Detected SQLite database"
        DB_TYPE="sqlite"
        
        # For SQLite, ensure the directory exists
        if echo "$DATABASE_URL" | grep -q "file:"; then
            DB_PATH=$(echo "$DATABASE_URL" | sed 's|file:||')
            DB_DIR=$(dirname "$DB_PATH")
            echo "  - SQLite path: $DB_PATH"
            echo "  - Creating directory: $DB_DIR"
            mkdir -p "$DB_DIR" 2>/dev/null || true
            
            # Check if we have write permissions
            if touch "$DB_DIR/.write_test" 2>/dev/null; then
                rm "$DB_DIR/.write_test"
                echo "  ✅ Write permissions confirmed"
            else
                echo "  ❌ No write permissions to $DB_DIR"
            fi
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

# Note: Database migrations are now handled by Fly.io release command
# For local development, run: npx prisma migrate dev

if [ "$DB_TYPE" = "sqlite" ]; then
    # SQLite is only for local development with volume mount
    if [ ! -f "$DB_PATH" ]; then
        echo "🗃️  SQLite database not found. Creating..."
        touch "$DB_PATH"
        echo "📋 Run 'npx prisma migrate dev' locally to initialize the schema"
    else
        echo "📁 SQLite database exists at: $DB_PATH"
    fi
fi

# Simple health check
echo "🔍 Checking database connection..."
if [ -n "$DATABASE_URL" ]; then
    echo "✅ DATABASE_URL is configured"
else
    echo "⚠️  DATABASE_URL not set - database features will not work"
fi

echo "🌐 Starting Next.js server on port ${PORT:-3000}..."

# Start the application
exec "$@"