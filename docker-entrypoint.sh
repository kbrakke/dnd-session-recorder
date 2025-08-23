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

# Initialize database schema
echo "🔧 Initializing database schema..."

# Check Prisma client exists
if [ -d "./node_modules/.prisma" ]; then
    echo "✅ Prisma client found"
else
    echo "❌ Prisma client not found - build may have failed"
fi

# Note: The Docker build uses PostgreSQL schema by default (see Dockerfile)
# For local development with SQLite, use schema.sqlite.prisma

if [ "$DB_TYPE" = "postgresql" ]; then
    echo "🔄 Running database migrations for PostgreSQL..."
    
    # Use the robust migration script
    node scripts/migrate.js || {
        echo "❌ Migration script failed!"
        echo "📋 Attempting fallback migration..."
        
        # Fallback: try direct Prisma commands with more verbose output
        echo "🔍 Checking Prisma CLI availability..."
        npx prisma --version || {
            echo "❌ Prisma CLI not available"
            exit 1
        }
        
        echo "🔍 Database connectivity will be tested during migration..."
        
        if [ -d "./prisma/migrations" ] && [ "$(ls -A ./prisma/migrations)" ]; then
            echo "📦 Applying migrations with verbose output..."
            npx prisma migrate deploy --schema=./prisma/schema.prisma || exit 1
        else
            echo "📦 Creating schema with db push..."
            npx prisma db push --skip-generate --schema=./prisma/schema.prisma || exit 1
        fi
    }
    
    echo "✅ PostgreSQL migrations applied successfully"
    
elif [ "$DB_TYPE" = "sqlite" ]; then
    # SQLite is only for local development/staging with volume mount
    if [ ! -f "$DB_PATH" ]; then
        echo "🗃️  SQLite database not found. Creating..."
        touch "$DB_PATH"
    else
        echo "📁 SQLite database exists at: $DB_PATH"
        ls -la "$DB_PATH" || true
    fi
    
    echo "🔄 Running database migrations for SQLite..."
    # Note: This requires the schema to be set to SQLite provider
    npx prisma db push --skip-generate 2>&1 | tee /tmp/prisma.log || {
        echo "⚠️  SQLite migration failed. The production build uses PostgreSQL schema."
        echo "📋 Migration output:"
        cat /tmp/prisma.log
        echo ""
        echo "For SQLite, you need to build with schema.sqlite.prisma"
    }
fi

echo "✅ Database initialization complete"

# Test database connection with a simple query
echo "🔍 Testing database connection..."
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testConnection() {
    try {
        await prisma.\$queryRaw\`SELECT 1 as test\`;
        console.log('✅ Database connection successful');
        
        // Try to count users
        const userCount = await prisma.user.count();
        console.log(\`  - Users in database: \${userCount}\`);
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        process.exit(1);
    } finally {
        await prisma.\$disconnect();
    }
}

testConnection();
" || {
    echo "⚠️  Database connection test failed, but continuing..."
}

echo "🌐 Starting Next.js server on port ${PORT:-3000}..."

# Start the application
exec "$@"