import { defineConfig, devices } from '@playwright/test';

/**
 * Post-Deploy Test Configuration
 * 
 * These tests run against a deployed environment (staging or production)
 * and require actual infrastructure to be available.
 * 
 * Tests included:
 * - Authentication flow with real session management
 * - API authentication with actual JWT tokens
 * - Rate limiting verification
 * - Cross-user data access protection
 * - Session persistence across multiple API calls
 */
export default defineConfig({
  testDir: './tests/post-deploy',
  fullyParallel: false, // Run sequentially to avoid rate limiting
  forbidOnly: true,
  retries: 1,
  workers: 1, // Single worker to avoid overwhelming the deployed environment
  reporter: [
    ['html', { outputFolder: 'test-results-post-deploy' }],
    ['list'],
  ],
  use: {
    // This will be overridden by environment variable
    baseURL: process.env.DEPLOY_URL || 'https://staging.example.com',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Longer timeouts for deployed environments
    actionTimeout: 30000,
    navigationTimeout: 30000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // No webServer configuration - tests run against deployed environment
  timeout: 60000, // 1 minute timeout per test
  expect: {
    timeout: 10000,
  },
});