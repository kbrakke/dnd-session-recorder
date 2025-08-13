import { chromium, FullConfig } from '@playwright/test';
import { AudioFixtures } from '../fixtures/audio-files';

async function globalSetup(config: FullConfig) {
  console.log('🔧 Setting up workflow tests...');
  
  try {
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