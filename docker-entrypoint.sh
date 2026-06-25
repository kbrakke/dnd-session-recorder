#!/bin/sh
set -e

log() {
  echo "[entrypoint] $1"
}

error() {
  echo "[entrypoint] ERROR: $1" >&2
}

log "Starting D&D Session Recorder"
log "Environment: ${NODE_ENV:-development}"

# Check DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
  error "DATABASE_URL environment variable is not set"
  exit 1
fi

log "DATABASE_URL: configured"

# Parse database type
if echo "$DATABASE_URL" | grep -q "postgresql://"; then
  DB_TYPE="postgresql"
  log "Database type: PostgreSQL"

  # Parse connection details for logging
  DB_INFO=$(node -e "
    try {
      const url = process.env.DATABASE_URL;
      const { hostname, port, pathname } = new URL(url);
      console.log('host=' + hostname + ' port=' + (port || 5432) + ' database=' + pathname.slice(1));
    } catch (e) {
      console.log('parse-failed');
    }
  ")

  if [ "$DB_INFO" != "parse-failed" ]; then
    log "Database: $DB_INFO"
  fi

  # Run database initialization
  log "Initializing database schema..."
  if npx tsx scripts/init-database.ts; then
    log "Database initialization: OK"
  else
    error "Database initialization failed"
    exit 1
  fi
else
  error "Only PostgreSQL databases are supported in production"
  error "DATABASE_URL must start with postgresql://"
  exit 1
fi

log "Starting Next.js server on port ${PORT:-3000}"

# Start the application
exec "$@"