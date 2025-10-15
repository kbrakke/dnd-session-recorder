import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [
        ['html'],
        ['github'],
        ['list']
      ]
    : 'html',
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
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    env: {
      // Ensure consistent environment for both local and CI
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || 'fallback-secret-for-tests-32characters',
      NEXTAUTH_URL: 'http://localhost:3000',
      DATABASE_URL: process.env.DATABASE_URL || 'file:./prisma/data/test.db',
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || 'sk-test-key-placeholder',
      NODE_ENV: 'development',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
});