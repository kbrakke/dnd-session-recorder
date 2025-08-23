#!/usr/bin/env node

/**
 * Test server startup script that handles database initialization
 * for both local development and CI environments.
 * 
 * In CI: Uses testcontainers to start a PostgreSQL container
 * Locally: Assumes database is already running
 */

const { spawn } = require('child_process');
const { PostgreSqlContainer } = require('@testcontainers/postgresql');

async function startTestServer() {
  let databaseUrl = process.env.DATABASE_URL;
  
  // In CI, start a PostgreSQL container
  if (process.env.CI) {
    console.log('🐘 Starting PostgreSQL testcontainer for CI...');
    
    try {
      const container = await new PostgreSqlContainer('postgres:16-alpine')
        .withDatabase('dnd_recorder_test')
        .withUsername('test_user')
        .withPassword('test_password')
        .withExposedPorts(5432)
        .start();
      
      databaseUrl = container.getConnectionUri();
      console.log('✅ PostgreSQL container started');
      
      // Set DATABASE_URL for child processes
      process.env.DATABASE_URL = databaseUrl;
      
      // Run Prisma migrations
      console.log('🔧 Running database migrations...');
      const { execSync } = require('child_process');
      
      // Generate Prisma client
      execSync('npx prisma generate', {
        env: { ...process.env, DATABASE_URL: databaseUrl },
        stdio: 'inherit'
      });
      
      // Push schema to database
      execSync('npx prisma db push --skip-generate', {
        env: { ...process.env, DATABASE_URL: databaseUrl },
        stdio: 'inherit'
      });
      
      console.log('✅ Database migrations complete');
      
      // Store container reference for cleanup
      global.testContainer = container;
    } catch (error) {
      console.error('❌ Failed to start PostgreSQL container:', error);
      process.exit(1);
    }
  } else if (!databaseUrl) {
    // For local development, use default
    databaseUrl = 'postgresql://dnd_user:dnd_password@localhost:5432/dnd_recorder';
    process.env.DATABASE_URL = databaseUrl;
  }
  
  // Start the Next.js development server
  console.log('🚀 Starting Next.js development server...');
  const server = spawn('npm', ['run', 'dev:simple'], {
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      NODE_ENV: 'development',
      NEXT_TELEMETRY_DISABLED: '1'
    },
    stdio: 'inherit'
  });
  
  // Handle server errors
  server.on('error', (error) => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  });
  
  // Handle server exit
  server.on('exit', (code) => {
    console.log(`Server exited with code ${code}`);
    if (global.testContainer) {
      console.log('🛑 Stopping PostgreSQL container...');
      global.testContainer.stop();
    }
    process.exit(code);
  });
  
  // Handle process termination
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down test server...');
    server.kill('SIGINT');
    if (global.testContainer) {
      console.log('🛑 Stopping PostgreSQL container...');
      await global.testContainer.stop();
    }
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('\n🛑 Shutting down test server...');
    server.kill('SIGTERM');
    if (global.testContainer) {
      console.log('🛑 Stopping PostgreSQL container...');
      await global.testContainer.stop();
    }
    process.exit(0);
  });
}

// Start the server
startTestServer().catch((error) => {
  console.error('❌ Failed to start test server:', error);
  process.exit(1);
});