import { defineConfig, devices } from '@playwright/test';

/**
 * Local Development Test Configuration
 * 
 * Unit tests that can run in a local development environment without
 * requiring external services or complex infrastructure.
 * 
 * Excluded tests:
 * - Workflow tests (moved to workflows/) - require staging environment with AI services
 * - Integration tests (moved to integration/) - require real authentication infrastructure
 * - Post-deploy tests (in post-deploy/) - require deployed environment
 */
export default defineConfig({
  testDir: './tests',
  testIgnore: [
    // Ignore post-deploy tests
    '**/post-deploy/**',
    // Ignore workflow tests (these require full staging environment)
    '**/workflows/**',
    // Ignore tests that require real authentication infrastructure
    '**/integration/auth/**',
    // Ignore root level auth tests that require real infrastructure
    'api-auth.spec.ts',
    'login.spec.ts',
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
    command: 'npm run dev:simple',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    env: {
      // Mock authentication for local tests
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || 'fallback-secret-for-tests-32characters',
      NEXTAUTH_URL: 'http://localhost:3000',
      DATABASE_URL: process.env.DATABASE_URL || 'postgresql://dnd_user:dnd_password@localhost:5432/dnd_recorder',
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || 'sk-test-key-placeholder',
      NODE_ENV: 'development',
      NEXT_TELEMETRY_DISABLED: '1',
      // Enable mock mode for local tests
      MOCK_AUTH: 'true',
    },
  },
});