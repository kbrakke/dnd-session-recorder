import { chromium, FullConfig } from '@playwright/test';
import { AudioFixtures } from '../fixtures/audio-files';

async function globalSetup(_config: FullConfig) {
  console.log('🔧 Setting up workflow tests...');
  
  try {
    // Database is now handled by test-server.js in CI
    // For local development, assume database is already running
    
    // Setup test audio files
    console.log('📁 Creating test audio fixtures...');
    await AudioFixtures.setupAll();
    
    // Create a default test campaign
    console.log('📚 Creating default test campaign...');
    const browser = await chromium.launch();
    const page = await browser.newPage();
    
    try {
      // Create a test user and campaign via API
      await page.goto('http://localhost:3000/api/auth/csrf');
      const csrfData = await page.evaluate(() => JSON.parse(document.body.textContent || '{}'));
      const csrfToken = csrfData.csrfToken;
      
      // Create test campaign directly via API if possible
      const campaignResponse = await page.evaluate(async (token) => {
        try {
          const response = await fetch('/api/campaigns', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-CSRF-Token': token
            },
            body: JSON.stringify({
              name: 'Default Test Campaign',
              description: 'Campaign for automated tests'
            })
          });
          return { ok: response.ok, status: response.status };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      }, csrfToken);
      
      if (campaignResponse.ok) {
        console.log('✅ Default test campaign created');
      } else {
        console.log('⚠️ Could not create default campaign (may already exist)');
      }
    } catch (error) {
      console.log('⚠️ Campaign creation skipped:', error instanceof Error ? error.message : String(error));
    }
    
    // Verify server is running
    console.log('🌐 Verifying test server...');
    
    try {
      await page.goto('http://localhost:3000/api/health', { timeout: 30000 });
      await page.textContent('body');
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