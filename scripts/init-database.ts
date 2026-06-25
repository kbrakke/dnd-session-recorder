#!/usr/bin/env tsx
/**
 * Database initialization script
 *
 * This script handles database schema initialization and migrations.
 * It runs on every server startup and ensures the database schema matches the latest version.
 *
 * Requirements:
 * - DATABASE_URL environment variable must be set
 * - Connects to PostgreSQL database
 * - Idempotent: safe to run multiple times
 */

import { execSync } from 'child_process';
import { exit } from 'process';

interface MigrationStatus {
  isUpToDate: boolean;
  pendingCount: number;
  error?: string;
}

function log(message: string): void {
  console.log(`[db-init] ${message}`);
}

function error(message: string): void {
  console.error(`[db-init] ERROR: ${message}`);
}

function execCommand(command: string, description: string): { stdout: string; stderr: string; success: boolean } {
  log(`${description}...`);
  try {
    const stdout = execSync(command, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return { stdout, stderr: '', success: true };
  } catch (err: unknown) {
    const execError = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: execError.stdout || '',
      stderr: execError.stderr || '',
      success: false
    };
  }
}

function checkDatabaseConnection(): boolean {
  const result = execCommand(
    'npx prisma db execute --stdin --schema=prisma/schema.prisma <<EOF\nSELECT 1 as connection_test;\nEOF',
    'Testing database connection'
  );

  if (result.success) {
    log('Database connection: OK');
    return true;
  } else {
    error('Database connection failed');
    error(result.stderr);
    return false;
  }
}

function getMigrationStatus(): MigrationStatus {
  const result = execCommand(
    'npx prisma migrate status --schema=prisma/schema.prisma',
    'Checking migration status'
  );

  if (!result.success) {
    return { isUpToDate: false, pendingCount: -1, error: result.stderr };
  }

  const output = result.stdout + result.stderr;

  // Check if database is up to date
  if (output.includes('Database schema is up to date')) {
    log('Database schema: up to date');
    return { isUpToDate: true, pendingCount: 0 };
  }

  // Count pending migrations
  const pendingMatches = output.match(/Following migration.*have not yet been applied/);
  if (pendingMatches) {
    // Extract migration names from the output
    const migrationLines = output.split('\n').filter(line =>
      line.trim().match(/^\d{14}_/)
    );
    log(`Found ${migrationLines.length} pending migration(s)`);
    return { isUpToDate: false, pendingCount: migrationLines.length };
  }

  // Check for failed migrations
  if (output.includes('failed') || output.includes('P3009')) {
    return { isUpToDate: false, pendingCount: -1, error: 'Failed migrations detected' };
  }

  return { isUpToDate: true, pendingCount: 0 };
}

function resolveFailedMigration(migrationName: string): boolean {
  log(`Attempting to resolve failed migration: ${migrationName}`);
  const result = execCommand(
    `npx prisma migrate resolve --rolled-back "${migrationName}" --schema=prisma/schema.prisma`,
    `Resolving migration ${migrationName}`
  );
  return result.success;
}

function deployMigrations(): boolean {
  const result = execCommand(
    'npx prisma migrate deploy --schema=prisma/schema.prisma',
    'Deploying pending migrations'
  );

  if (result.success) {
    log('Migrations deployed successfully');
    return true;
  }

  const output = result.stdout + result.stderr;

  // Check for P3009 error (failed migrations)
  if (output.includes('P3009') || output.includes('failed')) {
    log('Detected failed migrations, attempting resolution...');

    // Try to resolve known problematic migration
    if (resolveFailedMigration('20250826132223_add_transcription_progress_tracking')) {
      log('Failed migration resolved, retrying deployment...');
      const retryResult = execCommand(
        'npx prisma migrate deploy --schema=prisma/schema.prisma',
        'Retrying migration deployment'
      );
      return retryResult.success;
    }
  }

  error('Migration deployment failed');
  error(result.stderr);
  return false;
}

function verifySchema(): boolean {
  log('Verifying schema consistency...');
  const result = execCommand(
    'npx prisma validate --schema=prisma/schema.prisma',
    'Validating Prisma schema'
  );

  if (result.success) {
    log('Schema validation: OK');
    return true;
  } else {
    error('Schema validation failed');
    error(result.stderr);
    return false;
  }
}

async function main(): Promise<void> {
  log('Starting database initialization');

  // Check for DATABASE_URL
  if (!process.env.DATABASE_URL) {
    error('DATABASE_URL environment variable is not set');
    exit(1);
  }

  log(`DATABASE_URL: configured`);

  // Step 1: Verify schema
  if (!verifySchema()) {
    error('Schema validation failed');
    exit(1);
  }

  // Step 2: Test database connection
  if (!checkDatabaseConnection()) {
    error('Cannot connect to database');
    exit(1);
  }

  // Step 3: Check migration status
  const status = getMigrationStatus();

  if (status.error) {
    error(`Migration status check failed: ${status.error}`);
    // Continue anyway to attempt resolution
  }

  // Step 4: Deploy migrations if needed
  if (!status.isUpToDate || status.pendingCount > 0) {
    log('Database schema needs update');
    if (!deployMigrations()) {
      error('Failed to deploy migrations');
      exit(1);
    }
  }

  // Step 5: Final verification
  const finalStatus = getMigrationStatus();
  if (finalStatus.isUpToDate) {
    log('Database initialization complete');
    log('Schema is up to date');
    exit(0);
  } else {
    error('Database initialization failed - schema is not up to date');
    exit(1);
  }
}

// Run the script
main().catch((err) => {
  error(`Unexpected error: ${err.message}`);
  exit(1);
});
