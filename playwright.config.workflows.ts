import { defineConfig, devices } from '@playwright/test';

/**
 * Workflow Test Configuration
 * 
 * This configuration is specifically for comprehensive workflow tests
 * that test full user journeys and integrations between features.
 * These tests typically take longer and require more setup.
 */
export default defineConfig({
  testDir: './tests/workflows',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 2 : 4, // Limit workers in CI for stability
  reporter: [
    ['html', { outputFolder: 'playwright-report-workflows' }],
    ['json', { outputFile: 'test-results-workflows.json' }]
  ],
  timeout: 60000, // 1 minute timeout for individual tests
  expect: {
    timeout: 10000 // 10 second timeout for assertions
  },
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Increase action timeout for file uploads
    actionTimeout: 30000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000, // 2 minutes to start server
    env: {
      // Workflow test environment
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || 'workflow-test-secret-32characters-minimum',
      NEXTAUTH_URL: 'http://localhost:3000',
      DATABASE_URL: process.env.DATABASE_URL || 'postgresql://test_user:test_password@localhost:5432/dnd_recorder_test',
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || 'sk-workflow-test-key-placeholder',
      NODE_ENV: 'development',
      NEXT_TELEMETRY_DISABLED: '1',
      // Enable extended timeouts for AI features in tests
      AI_TIMEOUT: '30000',
      // Mock AI services in test mode
      MOCK_AI_SERVICES: process.env.CI ? 'true' : 'false',
    },
  },
  // Global setup for workflow tests
  globalSetup: './tests/workflows/global-setup.ts',
  globalTeardown: './tests/workflows/global-teardown.ts',
});