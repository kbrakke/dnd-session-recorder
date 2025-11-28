import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/staging',
  fullyParallel: false, // Sequential to avoid rate limiting
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // Single worker for staging
  reporter: process.env.CI
    ? [
        ['html', { outputFolder: 'test-results-staging' }],
        ['github'],
        ['list'],
      ]
    : [['html', { outputFolder: 'test-results-staging' }]],
  use: {
    baseURL: process.env.STAGING_URL || 'https://dnd-recorder-staging.fly.dev',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 30000,
    navigationTimeout: 30000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  timeout: 120000, // 2 minutes per test
  expect: {
    timeout: 10000,
  },
  // No webServer - runs against remote staging
});

