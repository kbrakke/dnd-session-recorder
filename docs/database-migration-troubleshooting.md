# Database Migration Troubleshooting

## Common Issues and Solutions

### P3009: Failed Migrations in Target Database

**Error**: `migrate found failed migrations in the target database, new migrations will not be applied`

**Solution**: The migration script automatically handles this by:
1. Detecting the P3009 error
2. Marking failed migrations as rolled back using `prisma migrate resolve --rolled-back`
3. Retrying the migration deployment

### Error 42501: Must be owner of table

**Error**: `ERROR: must be owner of table gaming_sessions`

This occurs when the database user doesn't own the tables it's trying to modify. In PostgreSQL, `ALTER TABLE` requires ownership, not just permissions.

#### Automatic Workaround (Built into migrate-deploy.sh)

The migration script attempts to work around this by:
1. Using `prisma db push` as an alternative to migrations
2. Marking the migration as applied after successful schema sync

#### Manual Fix (If Automatic Workaround Fails)

1. **Connect as postgres user to Fly.io database**:
   ```bash
   fly postgres connect -a your-db-app
   ```

2. **Run the ownership fix script**:
   ```sql
   -- From scripts/fix-table-ownership.sql
   
   -- Create shared ownership role
   CREATE ROLE migration_owner;
   
   -- Grant role to your database user
   GRANT migration_owner TO staging;  -- Replace 'staging' with your user
   
   -- Transfer table ownership
   ALTER TABLE _prisma_migrations OWNER TO migration_owner;
   ALTER TABLE users OWNER TO migration_owner;
   ALTER TABLE campaigns OWNER TO migration_owner;
   ALTER TABLE gaming_sessions OWNER TO migration_owner;
   ALTER TABLE uploads OWNER TO migration_owner;
   ALTER TABLE transcriptions OWNER TO migration_owner;
   ALTER TABLE summaries OWNER TO migration_owner;
   
   -- Grant full privileges
   GRANT ALL ON SCHEMA public TO migration_owner;
   GRANT ALL ON ALL TABLES IN SCHEMA public TO migration_owner;
   GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO migration_owner;
   ```

3. **Redeploy your application**:
   ```bash
   fly deploy --config fly.staging.toml
   ```

### Verifying Table Ownership

To check current table ownership:
```sql
SELECT 
  schemaname,
  tablename,
  tableowner
FROM pg_tables
WHERE schemaname = 'public';
```

### Prevention

For new Fly.io PostgreSQL databases:
1. Create tables using a shared role from the start
2. Grant that role to all users who need to modify schema
3. Use `INHERIT` attribute on roles to avoid `SET ROLE` requirements

## Migration Script Features

The `scripts/migrate-deploy.sh` script includes:
- Automatic P3009 failed migration resolution
- Table ownership detection and reporting
- Alternative schema sync using `db push` for permission issues
- Comprehensive error logging and status checking
- Column verification after migration attempts

## Emergency Recovery

If all automated attempts fail:

1. **Manual column addition** (as postgres user):
   ```sql
   ALTER TABLE gaming_sessions 
   ADD COLUMN IF NOT EXISTS transcription_progress INTEGER DEFAULT 0,
   ADD COLUMN IF NOT EXISTS total_chunks INTEGER,
   ADD COLUMN IF NOT EXISTS chunks_completed INTEGER DEFAULT 0,
   ADD COLUMN IF NOT EXISTS current_step TEXT;
   ```

2. **Mark migration as applied**:
   ```bash
   npx prisma migrate resolve --applied "20250826132223_add_transcription_progress_tracking"
   ```

3. **Verify schema state**:
   ```bash
   npx prisma db pull
   ```