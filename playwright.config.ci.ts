import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/ci',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: process.env.CI
    ? [
        ['html', { outputFolder: 'test-results-ci' }],
        ['github'],
        ['list'],
      ]
    : [['html', { outputFolder: 'test-results-ci' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: process.env.CI
      ? 'node scripts/test-server.js'  // Use testcontainers in CI
      : 'npm run dev:simple',           // Use simple dev server locally
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000, // 2 minutes to start server and testcontainers
    env: {
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || 'test-secret-32-characters-long',
      NEXTAUTH_URL: 'http://localhost:3000',
      DATABASE_URL: process.env.DATABASE_URL || 'file:./prisma/data/test.db',
      NODE_ENV: 'development', // Changed from 'test' to 'development' for Next.js
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
  timeout: 30000, // 30 seconds per test
});

