-- Script to fix table ownership issues for Fly.io PostgreSQL
-- This should be run by a user with sufficient privileges (postgres user)

-- Create a shared role for migrations if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'migration_owner') THEN
    CREATE ROLE migration_owner;
  END IF;
END $$;

-- Grant the role to the staging user
-- Replace 'staging' with your actual database user
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'staging') THEN
    GRANT migration_owner TO staging;
  END IF;
END $$;

-- Change ownership of all tables to the migration_owner role
ALTER TABLE IF EXISTS _prisma_migrations OWNER TO migration_owner;
ALTER TABLE IF EXISTS users OWNER TO migration_owner;
ALTER TABLE IF EXISTS campaigns OWNER TO migration_owner;
ALTER TABLE IF EXISTS gaming_sessions OWNER TO migration_owner;
ALTER TABLE IF EXISTS uploads OWNER TO migration_owner;
ALTER TABLE IF EXISTS transcriptions OWNER TO migration_owner;
ALTER TABLE IF EXISTS summaries OWNER TO migration_owner;

-- Grant all privileges on schema to migration_owner
GRANT ALL ON SCHEMA public TO migration_owner;
GRANT ALL ON ALL TABLES IN SCHEMA public TO migration_owner;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO migration_owner;

-- Show current ownership
SELECT 
  schemaname,
  tablename,
  tableowner
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;