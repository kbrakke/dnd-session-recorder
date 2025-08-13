import { FullConfig } from '@playwright/test';
import { AudioFixtures } from '../fixtures/audio-files';

async function globalTeardown(config: FullConfig) {
  console.log('🧹 Cleaning up workflow tests...');
  
  try {
    // Cleanup test audio files
    console.log('📁 Cleaning up test audio fixtures...');
    await AudioFixtures.cleanupAll();
    
    console.log('✅ Workflow test cleanup complete');
  } catch (error) {
    console.error('❌ Workflow test cleanup failed:', error);
    // Don't throw error in teardown - just log it
  }
}

export default globalTeardown;