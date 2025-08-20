import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class TestDatabase {
  private static instance: TestDatabase | null = null;
  private container: StartedPostgreSqlContainer | null = null;
  private connectionString: string | null = null;

  private constructor() {}

  /**
   * Get singleton instance of TestDatabase
   */
  static getInstance(): TestDatabase {
    if (!TestDatabase.instance) {
      TestDatabase.instance = new TestDatabase();
    }
    return TestDatabase.instance;
  }

  /**
   * Start PostgreSQL container and run migrations
   */
  async start(): Promise<string> {
    if (this.container && this.connectionString) {
      return this.connectionString;
    }

    console.log('🐘 Starting PostgreSQL testcontainer...');
    
    this.container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('dnd_recorder_test')
      .withUsername('test_user')
      .withPassword('test_password')
      .withExposedPorts(5432)
      .start();

    this.connectionString = this.container.getConnectionUri();
    
    console.log('🔧 Running database migrations...');
    
    // Run Prisma migrations
    await this.runMigrations();
    
    console.log('✅ Test database ready');
    return this.connectionString;
  }

  /**
   * Get the database connection string
   */
  getConnectionString(): string {
    if (!this.connectionString) {
      throw new Error('Database container not started. Call start() first.');
    }
    return this.connectionString;
  }

  /**
   * Get a new PostgreSQL client connection
   */
  async getClient(): Promise<Client> {
    const client = new Client({ connectionString: this.getConnectionString() });
    await client.connect();
    return client;
  }

  /**
   * Run Prisma migrations against the test database
   */
  private async runMigrations(): Promise<void> {
    if (!this.connectionString) {
      throw new Error('Connection string not available');
    }

    try {
      // Generate Prisma client
      await execAsync('npx prisma generate', {
        env: { ...process.env, DATABASE_URL: this.connectionString }
      });

      // Deploy migrations
      await execAsync('npx prisma db push', {
        env: { ...process.env, DATABASE_URL: this.connectionString }
      });
    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    }
  }

  /**
   * Create a database snapshot for test isolation
   */
  async createSnapshot(name: string = 'test_snapshot'): Promise<void> {
    if (!this.container) {
      throw new Error('Container not started');
    }

    const client = await this.getClient();
    try {
      // Create a template database from current state
      await client.query(`CREATE DATABASE "${name}" WITH TEMPLATE dnd_recorder_test`);
    } catch (error) {
      // Snapshot might already exist, that's okay
      console.log(`Snapshot ${name} already exists or creation failed:`, error);
    } finally {
      await client.end();
    }
  }

  /**
   * Restore database from snapshot
   */
  async restoreSnapshot(name: string = 'test_snapshot'): Promise<void> {
    if (!this.container) {
      throw new Error('Container not started');
    }

    const client = await this.getClient();
    try {
      // Terminate active connections
      await client.query(`
        SELECT pg_terminate_backend(pid) 
        FROM pg_stat_activity 
        WHERE datname = 'dnd_recorder_test' AND pid <> pg_backend_pid()
      `);

      // Drop and recreate database from snapshot
      await client.query(`DROP DATABASE IF EXISTS dnd_recorder_test`);
      await client.query(`CREATE DATABASE dnd_recorder_test WITH TEMPLATE "${name}"`);
    } finally {
      await client.end();
    }
  }

  /**
   * Clean all data from database (alternative to snapshot)
   */
  async cleanDatabase(): Promise<void> {
    const client = await this.getClient();
    try {
      // Clean in reverse dependency order
      await client.query('TRUNCATE TABLE transcriptions CASCADE');
      await client.query('TRUNCATE TABLE summaries CASCADE');
      await client.query('TRUNCATE TABLE gaming_sessions CASCADE');
      await client.query('TRUNCATE TABLE uploads CASCADE');
      await client.query('TRUNCATE TABLE campaigns CASCADE');
      await client.query('TRUNCATE TABLE accounts CASCADE');
      await client.query('TRUNCATE TABLE sessions CASCADE');
      await client.query('TRUNCATE TABLE verification_tokens CASCADE');
      await client.query('TRUNCATE TABLE users CASCADE');
      
      console.log('🧹 Database cleaned');
    } catch (error) {
      console.error('❌ Database cleanup failed:', error);
      throw error;
    } finally {
      await client.end();
    }
  }

  /**
   * Seed database with test data
   */
  async seedTestData(): Promise<void> {
    const client = await this.getClient();
    try {
      // Create test user
      const userResult = await client.query(`
        INSERT INTO users (id, name, email, password, created_at, updated_at)
        VALUES ('test-user-1', 'Test User', 'test@example.com', '$2a$12$test.hash.for.password', NOW(), NOW())
        ON CONFLICT (email) DO NOTHING
        RETURNING id
      `);

      if (userResult.rows.length > 0) {
        const userId = userResult.rows[0].id;

        // Create test campaign
        await client.query(`
          INSERT INTO campaigns (id, name, description, user_id, created_at, updated_at)
          VALUES ('test-campaign-1', 'Test Campaign', 'A test campaign for automated tests', $1, NOW(), NOW())
          ON CONFLICT (user_id, name) DO NOTHING
        `, [userId]);
      }

      console.log('🌱 Test data seeded');
    } catch (error) {
      console.error('❌ Seeding failed:', error);
      throw error;
    } finally {
      await client.end();
    }
  }

  /**
   * Stop the container and cleanup
   */
  async stop(): Promise<void> {
    if (this.container) {
      console.log('🛑 Stopping PostgreSQL testcontainer...');
      await this.container.stop();
      this.container = null;
      this.connectionString = null;
      TestDatabase.instance = null;
    }
  }
}

// Convenience functions
export const testDb = TestDatabase.getInstance();

export async function setupTestDatabase(): Promise<string> {
  return await testDb.start();
}

export async function cleanupTestDatabase(): Promise<void> {
  await testDb.stop();
}