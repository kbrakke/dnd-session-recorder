import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for staging/production environment tests
 * No local web server is started - tests run against remote staging URL
 *
 * IMPORTANT: Only runs verification tests that don't require database access
 * Integration tests with DB setup are in post-deploy-tests.yml for controlled environments
 */
export default defineConfig({
  testDir: './tests/post-deploy',
  // Exclude auth integration tests - they need DB access and test user creation
  testIgnore: [
    '**/auth/**',
    '**/complete-workflow.spec.ts',
    '**/login.spec.ts'
  ],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [
        ['html'],
        ['github'],
        ['list']
      ]
    : 'html',
  use: {
    // No baseURL - tests use full URLs
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  // No webServer config - tests run against remote staging environment
});
