# Fly.io PostgreSQL Setup and Migration Guide

## Understanding the Problem

When using Fly.io PostgreSQL, table ownership issues commonly occur because:
1. Tables may be created by the `postgres` superuser during initial setup
2. The app-specific user (e.g., `staging`) cannot ALTER tables it doesn't own
3. Prisma migrations require ALTER TABLE permissions

## Solution Options

### Option 1: Reset Staging Database (Recommended for Staging)

Since staging can be reset without data loss concerns:

```bash
# 1. Detach the current database
fly postgres detach -a dnd-recorder-staging

# 2. Delete the staging database (connect as postgres user)
fly postgres connect -a <your-db-app>
DROP DATABASE IF EXISTS staging;
\q

# 3. Re-attach to create fresh database with correct ownership
fly postgres attach <your-db-app> -a dnd-recorder-staging

# 4. Deploy with fresh migrations
fly deploy --config fly.staging.toml
```

### Option 2: Fix Ownership (For Production)

For production where data must be preserved:

```bash
# 1. Connect as postgres superuser
fly postgres connect -a <your-db-app>

# 2. Switch to the production database
\c production

# 3. Transfer ownership to the app user
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT tablename FROM pg_tables 
        WHERE schemaname = 'public'
    LOOP
        EXECUTE 'ALTER TABLE public.' || quote_ident(r.tablename) || ' OWNER TO production';
    END LOOP;
END$$;

# 4. Also handle sequences
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT sequence_name FROM information_schema.sequences 
        WHERE sequence_schema = 'public'
    LOOP
        EXECUTE 'ALTER SEQUENCE public.' || quote_ident(r.sequence_name) || ' OWNER TO production';
    END LOOP;
END$$;

# 5. Exit and redeploy
\q
fly deploy
```

### Option 3: Use Postgres User for Migrations (Alternative)

Modify the DATABASE_URL to use postgres user credentials:

```bash
# 1. Get postgres user password
fly postgres connect -a <your-db-app> -c "env" | grep OPERATOR_PASSWORD

# 2. Set DATABASE_URL with postgres user
fly secrets set DATABASE_URL="postgresql://postgres:<password>@<host>/staging" -a dnd-recorder-staging

# 3. Deploy (migrations will run as postgres user)
fly deploy --config fly.staging.toml

# 4. Optionally switch back to app user after migrations
fly postgres attach <your-db-app> -a dnd-recorder-staging
```

## Best Practices Going Forward

### 1. Initial Setup Script

Run this after creating a new Fly.io PostgreSQL database:

```sql
-- Ensure app user owns all objects
ALTER DATABASE <dbname> OWNER TO <appname>;
GRANT ALL ON SCHEMA public TO <appname>;
```

### 2. Migration Configuration

Update `fly.toml` to handle migrations properly:

```toml
[deploy]
  # Run database initialization script
  release_command = "npx tsx scripts/init-database.ts"
```

### 3. Use Baseline for Existing Databases

If connecting Prisma to an existing database:

```bash
# Mark all migrations as already applied
npx prisma migrate resolve --applied "migration_name"
```

## Verification Commands

Check current state:

```bash
# Check table ownership
fly postgres connect -a <db-app> -c "
  SELECT tablename, tableowner 
  FROM pg_tables 
  WHERE schemaname='public'
"

# Check current user
fly postgres connect -a <db-app> -c "SELECT current_user"

# Check migration status
fly ssh console -a dnd-recorder-staging -C "npx prisma migrate status"
```

## Emergency Manual Migration

If all else fails, manually apply the changes:

```sql
-- Connect as postgres user
fly postgres connect -a <db-app>

-- Switch to target database
\c staging

-- Apply migration manually
ALTER TABLE gaming_sessions 
  ADD COLUMN IF NOT EXISTS transcription_progress INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_chunks INTEGER,
  ADD COLUMN IF NOT EXISTS chunks_completed INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_step TEXT;

-- Mark migration as applied
INSERT INTO _prisma_migrations (
  id, checksum, migration_name, started_at, finished_at
) VALUES (
  gen_random_uuid(),
  'manual',
  '20250826132223_add_transcription_progress_tracking',
  NOW(),
  NOW()
);
```

## Recommended Approach for This Project

Given the current state:

1. **For Staging**: Reset the database (Option 1) - it's the cleanest solution
2. **For Production**: Fix ownership (Option 2) - preserves data
3. **Going Forward**: Ensure correct ownership from the start