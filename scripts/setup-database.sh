#!/bin/sh
# Database setup script for Fly.io PostgreSQL
# This should be run ONCE when setting up a new database or fixing ownership issues

echo "🔧 Database Setup Script for Fly.io PostgreSQL"
echo "================================================"
echo ""
echo "This script will:"
echo "1. Connect to the database as the postgres superuser"
echo "2. Fix table ownership issues"
echo "3. Set up proper permissions for migrations"
echo ""

# Check if we have the required environment variables
if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL not set"
  exit 1
fi

echo "📊 Current database connection info:"
echo "DATABASE_URL is configured"

# Extract database name from DATABASE_URL
DB_NAME=$(echo $DATABASE_URL | sed -n 's/.*\/\([^?]*\).*/\1/p')
echo "Database name: $DB_NAME"

# Connect as postgres user and fix ownership
echo "🔄 Fixing table ownership and permissions..."

# Create a SQL script to fix ownership
cat > /tmp/fix_ownership.sql <<EOF
-- First, check current user
SELECT current_user, current_database();

-- Show current table ownership
SELECT 
  schemaname,
  tablename,
  tableowner
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- If the app user exists and tables exist, transfer ownership
DO \$\$
DECLARE
    app_user text := '${DB_NAME}';
    tbl record;
BEGIN
    -- Check if user exists
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_user) THEN
        RAISE NOTICE 'Transferring ownership to user: %', app_user;
        
        -- Transfer ownership of all tables to the app user
        FOR tbl IN 
            SELECT tablename 
            FROM pg_tables 
            WHERE schemaname = 'public'
        LOOP
            EXECUTE format('ALTER TABLE public.%I OWNER TO %I', tbl.tablename, app_user);
            RAISE NOTICE 'Transferred ownership of table % to %', tbl.tablename, app_user;
        END LOOP;
        
        -- Also transfer sequences
        FOR tbl IN 
            SELECT sequence_name 
            FROM information_schema.sequences 
            WHERE sequence_schema = 'public'
        LOOP
            EXECUTE format('ALTER SEQUENCE public.%I OWNER TO %I', tbl.sequence_name, app_user);
        END LOOP;
        
        -- Grant all privileges on schema
        EXECUTE format('GRANT ALL ON SCHEMA public TO %I', app_user);
        EXECUTE format('GRANT ALL ON ALL TABLES IN SCHEMA public TO %I', app_user);
        EXECUTE format('GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO %I', app_user);
        EXECUTE format('GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO %I', app_user);
    ELSE
        RAISE NOTICE 'User % does not exist, skipping ownership transfer', app_user;
    END IF;
END\$\$;

-- Show updated ownership
SELECT 
  schemaname,
  tablename,
  tableowner
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
EOF

# Run the SQL script
echo "📝 Executing ownership fix script..."
psql "$DATABASE_URL" < /tmp/fix_ownership.sql

if [ $? -eq 0 ]; then
  echo "✅ Ownership and permissions updated successfully"
else
  echo "❌ Failed to update ownership"
  exit 1
fi

# Clean up
rm /tmp/fix_ownership.sql

echo ""
echo "✅ Database setup complete!"
echo ""
echo "Next steps:"
echo "1. Deploy your application: fly deploy --config fly.staging.toml"
echo "2. Migrations should now work with the correct ownership"