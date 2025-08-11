import { defineConfig, devices } from '@playwright/test';

/**
 * Local Development Test Configuration
 * 
 * These tests can run in a local development environment without
 * requiring actual authentication infrastructure or external services.
 * 
 * Excluded tests (moved to post-deploy):
 * - Tests requiring real JWT session management
 * - Tests requiring persistent database state
 * - Tests verifying rate limiting
 * - Tests requiring real authentication flow
 */
export default defineConfig({
  testDir: './tests',
  testIgnore: [
    // Ignore post-deploy tests
    '**/post-deploy/**',
    // Ignore tests that require real authentication infrastructure
    '**/integration/auth/api-auth.spec.ts',
    '**/integration/auth/error-scenarios.spec.ts',
    '**/integration/auth/login-flow.spec.ts',
    '**/integration/auth/registration.spec.ts',
    '**/login.spec.ts',
  ],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
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
      // Mock authentication for local tests
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || 'fallback-secret-for-tests-32characters',
      NEXTAUTH_URL: 'http://localhost:3000',
      DATABASE_URL: process.env.DATABASE_URL || 'file:./prisma/data/test.db',
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || 'sk-test-key-placeholder',
      NODE_ENV: 'development',
      NEXT_TELEMETRY_DISABLED: '1',
      // Enable mock mode for local tests
      MOCK_AUTH: 'true',
    },
  },
});