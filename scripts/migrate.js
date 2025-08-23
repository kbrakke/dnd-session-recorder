#!/usr/bin/env node

const { execSync } = require('child_process');

async function runMigrations() {
  console.log('🔄 Starting database migrations...');
  
  try {
    // Check if DATABASE_URL is available
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    
    console.log('📊 Database URL configured:', process.env.DATABASE_URL.replace(/:[^@]*@/, ':***@'));
    
    // Check if Prisma CLI is available
    try {
      execSync('npx prisma --version', { encoding: 'utf8' });
      console.log('✅ Prisma CLI is available');
    } catch (error) {
      throw new Error('Prisma CLI not found');
    }
    
    // Check migrations directory
    const fs = require('fs');
    const path = require('path');
    const migrationsDir = path.join(process.cwd(), 'prisma', 'migrations');
    
    if (fs.existsSync(migrationsDir) && fs.readdirSync(migrationsDir).length > 0) {
      console.log('📦 Found existing migrations, applying them...');
      const output = execSync('npx prisma migrate deploy', { encoding: 'utf8' });
      console.log('Migration output:', output);
      
      // Verify tables exist
      console.log('🔍 Verifying schema deployment...');
      const verifyOutput = execSync('npx prisma db execute --stdin', {
        input: 'SELECT table_name FROM information_schema.tables WHERE table_schema = \'public\';',
        encoding: 'utf8'
      });
      console.log('Tables created:', verifyOutput);
      
    } else {
      console.log('📦 No migrations found, creating initial schema...');
      const output = execSync('npx prisma db push --skip-generate', { encoding: 'utf8' });
      console.log('Schema push output:', output);
    }
    
    console.log('✅ Database migrations completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    
    // Additional debugging
    try {
      console.log('🔍 Additional debugging:');
      console.log('Current working directory:', process.cwd());
      console.log('Environment variables:', Object.keys(process.env).filter(k => k.includes('DATABASE')));
      
      // Try a simple connection test
      const testOutput = execSync('npx prisma db execute --stdin', {
        input: 'SELECT 1 as test;',
        encoding: 'utf8',
        timeout: 10000
      });
      console.log('Connection test result:', testOutput);
      
    } catch (debugError) {
      console.error('Debug connection test failed:', debugError.message);
    }
    
    process.exit(1);
  }
}

runMigrations();