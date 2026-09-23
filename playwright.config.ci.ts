import { defineConfig, devices } from '@playwright/test';

// Live-recording specs need a fake microphone, a longer timeout, and run in
// their own project so the rest of the suite keeps its plain browser.
const RECORDING_SPECS = /tests[\\/]ci[\\/]recording[\\/].*\.spec\.ts$/;

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
      testIgnore: RECORDING_SPECS,
    },
    {
      name: 'chromium-recording',
      testMatch: RECORDING_SPECS,
      timeout: 180_000,
      use: {
        ...devices['Desktop Chrome'],
        // Full Chromium (new headless) — the headless shell has had media
        // stack gaps. Installed by `playwright install chromium`.
        channel: 'chromium',
        permissions: ['microphone'],
        launchOptions: {
          args: [
            '--use-fake-device-for-media-capture',
            '--use-fake-ui-for-media-capture',
          ],
        },
      },
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
      // Mock OpenAI (Whisper + GPT-4o) so the transcription/summary pipeline
      // can be exercised in PR CI without spending credits. See src/lib/ai.ts.
      MOCK_AI_SERVICES: 'true',
      // Faster worker polling so finalize/processing complete within the
      // recording specs' budget (worker.ts default is 5000).
      PIPELINE_POLL_INTERVAL_MS: '1000',
      // Recorder test knobs (src/lib/recording/constants.ts, inlined at
      // compile time): 1s chunks and ~5s parts so a 20s recording lands
      // parts mid-recording and a reload leaves a real IndexedDB tail.
      NEXT_PUBLIC_RECORDING_TIMESLICE_MS: '1000',
      NEXT_PUBLIC_RECORDING_PART_MAX_MS: '5000',
    },
  },
  timeout: 30000, // 30 seconds per test
});

