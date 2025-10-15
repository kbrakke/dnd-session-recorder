import { FullConfig } from '@playwright/test';
import { AudioFixtures } from '../fixtures/audio-files';

async function globalTeardown(_config: FullConfig) {
  console.log('🧹 Cleaning up workflow tests...');
  
  try {
    // Cleanup test audio files
    console.log('📁 Cleaning up test audio fixtures...');
    await AudioFixtures.cleanupAll();
    
    // Database cleanup is now handled by test-server.js in CI
    // which stops the container when the process exits
    
    console.log('✅ Workflow test cleanup complete');
  } catch (error) {
    console.error('❌ Workflow test cleanup failed:', error);
    // Don't throw error in teardown - just log it
  }
}

export default globalTeardown;