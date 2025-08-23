#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

async function runMigrations() {
  console.log('🔄 Starting database migrations...');
  
  try {
    // Check if DATABASE_URL is available
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    
    console.log('📊 Database URL configured:', process.env.DATABASE_URL.replace(/:[^@]*@/, ':***@'));
    
    // Import Prisma client
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    
    console.log('🔍 Testing database connection...');
    await prisma.$queryRaw`SELECT 1 as health_check`;
    console.log('✅ Database connection successful');
    
    // Check if schema is already initialized
    let schemaExists = false;
    try {
      await prisma.user.count();
      schemaExists = true;
      console.log('✅ Schema already exists');
    } catch (error) {
      console.log('📦 Schema does not exist, will initialize');
    }
    
    if (!schemaExists) {
      // Run the migration SQL directly
      const migrationsDir = path.join(process.cwd(), 'prisma', 'migrations');
      
      if (fs.existsSync(migrationsDir)) {
        const migrationFolders = fs.readdirSync(migrationsDir)
          .filter(item => fs.statSync(path.join(migrationsDir, item)).isDirectory())
          .sort();
        
        if (migrationFolders.length > 0) {
          console.log('📦 Found migration folders:', migrationFolders);
          
          // Execute the migration SQL
          const latestMigration = migrationFolders[migrationFolders.length - 1];
          const migrationPath = path.join(migrationsDir, latestMigration, 'migration.sql');
          
          if (fs.existsSync(migrationPath)) {
            console.log(`🔄 Applying migration: ${latestMigration}`);
            const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
            
            // Execute the migration SQL as a transaction
            await prisma.$executeRawUnsafe(migrationSQL);
            console.log('✅ Migration applied successfully');
            
            // Create migration history record
            try {
              await prisma.$executeRaw`
                CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
                  "id" TEXT PRIMARY KEY,
                  "checksum" TEXT NOT NULL,
                  "finished_at" TIMESTAMP(3),
                  "migration_name" TEXT NOT NULL,
                  "logs" TEXT,
                  "rolled_back_at" TIMESTAMP(3),
                  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
                )
              `;
              
              await prisma.$executeRaw`
                INSERT INTO "_prisma_migrations" (id, checksum, migration_name, applied_steps_count, finished_at)
                VALUES (${latestMigration}, '', ${latestMigration}, 1, CURRENT_TIMESTAMP)
                ON CONFLICT (id) DO NOTHING
              `;
              
              console.log('✅ Migration history recorded');
            } catch (historyError) {
              console.log('⚠️ Could not record migration history:', historyError.message);
            }
          }
        }
      }
    }
    
    // Final verification
    console.log('🔍 Final schema verification...');
    const userCount = await prisma.user.count();
    console.log(`✅ Schema verification successful - User table has ${userCount} records`);
    
    await prisma.$disconnect();
    console.log('✅ Database migrations completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

runMigrations();