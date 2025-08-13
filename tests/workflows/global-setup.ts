import { chromium, FullConfig } from '@playwright/test';
import { AudioFixtures } from '../fixtures/audio-files';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function globalSetup(config: FullConfig) {
  console.log('🔧 Setting up workflow tests...');
  
  try {
    // Initialize test database
    console.log('🗃️  Initializing test database...');
    const databaseUrl = 'file:./prisma/data/workflow-test.db';
    
    try {
      // Run Prisma migrations to set up the test database
      const { stdout, stderr } = await execAsync('npx prisma db push', {
        env: { 
          ...process.env, 
          DATABASE_URL: databaseUrl,
          NODE_ENV: 'development'
        },
        cwd: process.cwd()
      });
      
      if (stderr && !stderr.includes('warnings')) {
        console.log('Database setup stderr:', stderr);
      }
      console.log('✅ Test database initialized');
    } catch (dbError) {
      console.error('❌ Database initialization failed:', dbError);
      // Try alternative approach - generate client and push schema
      try {
        await execAsync('npx prisma generate', {
          env: { ...process.env, DATABASE_URL: databaseUrl }
        });
        await execAsync('npx prisma db push --force-reset', {
          env: { ...process.env, DATABASE_URL: databaseUrl }
        });
        console.log('✅ Test database initialized (fallback method)');
      } catch (fallbackError) {
        console.error('❌ Database fallback also failed:', fallbackError);
        throw fallbackError;
      }
    }
    
    // Setup test audio files
    console.log('📁 Creating test audio fixtures...');
    await AudioFixtures.setupAll();
    
    // Verify server is running
    console.log('🌐 Verifying test server...');
    const browser = await chromium.launch();
    const page = await browser.newPage();
    
    try {
      await page.goto('http://localhost:3000/api/health', { timeout: 30000 });
      const response = await page.textContent('body');
      console.log('✅ Server health check passed');
    } catch (error) {
      console.error('❌ Server health check failed:', error);
      throw error;
    } finally {
      await browser.close();
    }
    
    console.log('✅ Workflow test setup complete');
  } catch (error) {
    console.error('❌ Workflow test setup failed:', error);
    throw error;
  }
}

export default globalSetup;