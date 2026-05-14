# scripts/

Build, setup, and test infrastructure scripts.

## Files

### `init-database.ts`
Database initialization and migration script. Run via `npm run db:init`.
- Validates Prisma schema
- Tests database connection
- Checks migration status
- Deploys pending migrations
- Handles failed migrations gracefully
- Idempotent — safe to run multiple times
- Exits with clear status codes

### `test-server.js`
Test server startup script used by Playwright configurations.
- **In CI:** Starts a PostgreSQL testcontainer (Docker), generates a `DATABASE_URL`, runs Prisma migrations, then spawns the Next.js dev server
- **Locally:** Uses existing database from docker-compose, runs migrations, spawns dev server
- Handles cleanup on `SIGINT`/`SIGTERM` (stops containers, kills dev server)
- Exports the server URL for Playwright to connect to
