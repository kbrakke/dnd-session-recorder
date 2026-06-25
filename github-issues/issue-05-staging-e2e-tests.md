# Create Staging-Specific E2E Test Suite

## Description
Develop a separate test suite that runs against the deployed staging environment to validate real-world functionality with actual infrastructure, external services, and production-like conditions.

## Problem Statement
Local tests with mocked services don't catch:
- Real API integration issues
- Infrastructure-specific problems
- Performance issues under real conditions
- Multi-user collaboration scenarios
- External service rate limits and failures
- CDN and caching behaviors
- SSL/TLS configuration issues

## Tasks
- [ ] Set up staging test infrastructure
- [ ] Implement real user authentication flow tests
- [ ] Create file upload tests with actual storage
- [ ] Add OpenAI API integration tests
- [ ] Implement database persistence tests
- [ ] Create multi-user collaboration tests
- [ ] Add performance and load tests
- [ ] Implement API rate limiting validation
- [ ] Add error handling and recovery tests
- [ ] Create synthetic monitoring suite

## Implementation Details

### 1. Staging Test Configuration (`playwright.staging.config.ts`)
```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/staging',
  fullyParallel: false, // Run sequentially to avoid rate limits
  forbidOnly: true,
  retries: 3, // More retries for network issues
  workers: 1, // Single worker to avoid conflicts
  reporter: [
    ['html'],
    ['json', { outputFile: 'staging-results.json' }],
    ['junit', { outputFile: 'staging-results.xml' }]
  ],
  use: {
    baseURL: 'https://dnd-recorder-staging.fly.dev',
    trace: 'on', // Always trace for debugging
    video: 'on', // Always record video
    screenshot: 'only-on-failure',
    // Longer timeouts for real network calls
    actionTimeout: 30000,
    navigationTimeout: 60000,
  },
  projects: [
    {
      name: 'staging-chrome',
      use: { 
        ...devices['Desktop Chrome'],
        // Use staging test credentials
        storageState: './tests/staging/auth.json'
      },
    },
    {
      name: 'staging-mobile',
      use: {
        ...devices['iPhone 13'],
        storageState: './tests/staging/auth-mobile.json'
      },
    },
  ],
  // Don't start local server
  webServer: undefined,
});
```

### 2. Authentication Flow Tests (`tests/staging/auth-flow.spec.ts`)
```typescript
import { test, expect } from '@playwright/test';
import { STAGING_USERS } from './fixtures/users';

test.describe('Staging Authentication', () => {
  test('should authenticate with whitelisted user', async ({ page }) => {
    await page.goto('/auth/signin');
    
    // Use real staging credentials
    await page.fill('[name="email"]', STAGING_USERS.testUser.email);
    await page.fill('[name="password"]', STAGING_USERS.testUser.password);
    await page.click('[type="submit"]');
    
    // Verify real session creation
    await expect(page).toHaveURL('/');
    
    // Verify session cookie is set
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find(c => c.name.includes('session'));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie?.secure).toBe(true); // HTTPS only
    
    // Verify API calls work with session
    const response = await page.request.get('/api/sessions');
    expect(response.ok()).toBe(true);
  });

  test('should reject non-whitelisted users', async ({ page }) => {
    await page.goto('/auth/signin');
    
    await page.fill('[name="email"]', 'unauthorized@example.com');
    await page.fill('[name="password"]', 'password123');
    await page.click('[type="submit"]');
    
    // Should show whitelist error
    await expect(page.locator('.error')).toContainText('not authorized for staging');
  });

  test('should handle session expiration', async ({ page, context }) => {
    // Login first
    await loginAsTestUser(page);
    
    // Manipulate cookie to expire it
    await context.addCookies([{
      name: 'next-auth.session-token',
      value: 'expired-token',
      domain: 'dnd-recorder-staging.fly.dev',
      path: '/',
      expires: Date.now() / 1000 - 3600 // Expired 1 hour ago
    }]);
    
    // Try to access protected route
    await page.goto('/sessions');
    
    // Should redirect to login
    await expect(page).toHaveURL('/auth/signin');
  });
});
```

### 3. File Storage Tests (`tests/staging/file-storage.spec.ts`)
```typescript
import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test.describe('Staging File Storage', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test('should upload large audio file', async ({ page }) => {
    await page.goto('/sessions/upload');
    
    // Upload 50MB test file
    const largeFile = path.join(__dirname, 'fixtures/large-audio.mp3');
    await page.setInputFiles('input[type="file"]', largeFile);
    
    // Monitor upload progress
    let lastProgress = 0;
    while (true) {
      const progress = await page.locator('[data-testid="upload-progress"]').getAttribute('value');
      const currentProgress = parseInt(progress || '0');
      
      expect(currentProgress).toBeGreaterThanOrEqual(lastProgress);
      lastProgress = currentProgress;
      
      if (currentProgress === 100) break;
      await page.waitForTimeout(1000);
    }
    
    // Verify file is stored and accessible
    const fileUrl = await page.locator('[data-testid="file-url"]').getAttribute('href');
    const response = await page.request.get(fileUrl!);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('audio');
  });

  test('should handle upload interruption and resume', async ({ page, context }) => {
    await page.goto('/sessions/upload');
    
    const testFile = path.join(__dirname, 'fixtures/test-audio.mp3');
    await page.setInputFiles('input[type="file"]', testFile);
    
    // Wait for upload to start
    await page.waitForSelector('[data-testid="upload-progress"]');
    
    // Simulate network interruption
    await context.setOffline(true);
    await page.waitForTimeout(2000);
    
    // Restore network
    await context.setOffline(false);
    
    // Verify upload resumes or retries
    await expect(page.locator('[data-testid="upload-status"]')).toContainText(/resuming|retrying|complete/i);
  });
});
```

### 4. OpenAI Integration Tests (`tests/staging/api-integration.spec.ts`)
```typescript
import { test, expect } from '@playwright/test';

test.describe('OpenAI API Integration', () => {
  test('should generate transcription with rate limiting', async ({ page }) => {
    await loginAsTestUser(page);
    
    // Upload audio file
    const sessionId = await uploadTestAudio(page);
    
    // Request transcription
    await page.goto(`/sessions/${sessionId}`);
    await page.click('[data-testid="generate-transcription"]');
    
    // Monitor API call
    const responsePromise = page.waitForResponse(resp => 
      resp.url().includes('/api/transcription') && resp.status() === 200
    );
    
    const response = await responsePromise;
    const data = await response.json();
    
    // Verify transcription generated
    expect(data.transcription).toBeDefined();
    expect(data.transcription.length).toBeGreaterThan(0);
    
    // Verify rate limit headers
    expect(response.headers()['x-ratelimit-remaining']).toBeDefined();
  });

  test('should handle API errors gracefully', async ({ page }) => {
    await loginAsTestUser(page);
    
    // Exhaust rate limit by making multiple requests
    for (let i = 0; i < 15; i++) {
      await page.request.post('/api/transcription/test-session', {
        data: { test: true }
      });
    }
    
    // Next request should be rate limited
    const response = await page.request.post('/api/transcription/test-session', {
      data: { test: true }
    });
    
    expect(response.status()).toBe(429); // Too Many Requests
    const error = await response.json();
    expect(error.message).toContain('rate limit');
  });
});
```

### 5. Multi-User Collaboration Tests (`tests/staging/collaboration.spec.ts`)
```typescript
import { test, expect, Browser, chromium } from '@playwright/test';

test.describe('Multi-User Collaboration', () => {
  let browser1: Browser;
  let browser2: Browser;
  
  test.beforeAll(async () => {
    browser1 = await chromium.launch();
    browser2 = await chromium.launch();
  });
  
  test.afterAll(async () => {
    await browser1.close();
    await browser2.close();
  });

  test('should sync session updates between users', async () => {
    // User 1 context
    const context1 = await browser1.newContext();
    const page1 = await context1.newPage();
    await loginAsUser(page1, STAGING_USERS.testUser);
    
    // User 2 context
    const context2 = await browser2.newContext();
    const page2 = await context2.newPage();
    await loginAsUser(page2, STAGING_USERS.adminUser);
    
    // Both users open same session
    const sessionId = 'shared-test-session';
    await page1.goto(`/sessions/${sessionId}`);
    await page2.goto(`/sessions/${sessionId}`);
    
    // User 1 adds a note
    await page1.fill('[data-testid="session-notes"]', 'User 1 was here');
    await page1.click('[data-testid="save-notes"]');
    
    // User 2 should see the update (with polling or websocket)
    await page2.reload(); // Or wait for real-time update
    const notes = await page2.locator('[data-testid="session-notes"]').inputValue();
    expect(notes).toContain('User 1 was here');
  });
});
```

### 6. Performance Tests (`tests/staging/load-test.spec.ts`)
```typescript
import { test, expect } from '@playwright/test';

test.describe('Performance and Load Tests', () => {
  test('should handle concurrent file uploads', async ({ browser }) => {
    const uploadPromises = [];
    
    // Create 5 concurrent upload sessions
    for (let i = 0; i < 5; i++) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await loginAsTestUser(page);
      
      uploadPromises.push(
        uploadTestAudio(page).then(sessionId => ({
          sessionId,
          duration: Date.now()
        }))
      );
    }
    
    const results = await Promise.all(uploadPromises);
    
    // All uploads should succeed
    results.forEach(result => {
      expect(result.sessionId).toBeDefined();
    });
    
    // Check upload times are reasonable
    const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
    expect(avgDuration).toBeLessThan(60000); // Under 1 minute average
  });

  test('should maintain performance SLAs', async ({ page }) => {
    await page.goto('/');
    
    // Measure key metrics
    const metrics = await page.evaluate(() => {
      const perf = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      return {
        domContentLoaded: perf.domContentLoadedEventEnd - perf.domContentLoadedEventStart,
        loadComplete: perf.loadEventEnd - perf.loadEventStart,
        firstPaint: performance.getEntriesByName('first-paint')[0]?.startTime,
        firstContentfulPaint: performance.getEntriesByName('first-contentful-paint')[0]?.startTime,
      };
    });
    
    // Verify performance SLAs
    expect(metrics.firstContentfulPaint).toBeLessThan(2000); // FCP < 2s
    expect(metrics.domContentLoaded).toBeLessThan(3000); // DOM < 3s
    expect(metrics.loadComplete).toBeLessThan(5000); // Full load < 5s
  });
});
```

### 7. Monitoring Tests (`tests/staging/monitoring.spec.ts`)
```typescript
import { test, expect } from '@playwright/test';

test.describe('Staging Health Monitoring', () => {
  test('should have all health endpoints responding', async ({ request }) => {
    const endpoints = [
      '/api/health',
      '/api/health/db',
      '/api/health/storage',
      '/api/health/external'
    ];
    
    for (const endpoint of endpoints) {
      const response = await request.get(endpoint);
      expect(response.ok()).toBe(true);
      
      const data = await response.json();
      expect(data.status).toBe('healthy');
      expect(data.timestamp).toBeDefined();
    }
  });

  test('should have proper error tracking', async ({ page }) => {
    // Trigger an error
    await page.goto('/trigger-test-error');
    
    // Verify error is logged (check your error tracking service)
    // This would integrate with Sentry or similar
    await page.waitForTimeout(2000);
    
    // Verify error page is shown
    await expect(page.locator('h1')).toContainText(/error|something went wrong/i);
  });
});
```

### 8. GitHub Action for Staging Tests (`.github/workflows/staging-e2e.yml`)
```yaml
name: Staging E2E Tests
on:
  workflow_dispatch:
  schedule:
    - cron: '0 */4 * * *'  # Every 4 hours
  workflow_run:
    workflows: ["Staging Deployment"]
    types: [completed]

jobs:
  staging-tests:
    if: ${{ github.event.workflow_run.conclusion == 'success' || github.event_name == 'schedule' || github.event_name == 'workflow_dispatch' }}
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '22'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Install Playwright
      run: npx playwright install --with-deps chromium
      
    - name: Run staging tests
      run: npm run test:staging
      env:
        STAGING_USER_EMAIL: ${{ secrets.STAGING_USER_EMAIL }}
        STAGING_USER_PASSWORD: ${{ secrets.STAGING_USER_PASSWORD }}
        STAGING_ADMIN_EMAIL: ${{ secrets.STAGING_ADMIN_EMAIL }}
        STAGING_ADMIN_PASSWORD: ${{ secrets.STAGING_ADMIN_PASSWORD }}
        
    - name: Upload test results
      if: always()
      uses: actions/upload-artifact@v4
      with:
        name: staging-test-results
        path: |
          playwright-report/
          test-results/
          staging-results.json
          
    - name: Notify on failure
      if: failure()
      uses: actions/github-script@v7
      with:
        script: |
          const { data: issue } = await github.rest.issues.create({
            owner: context.repo.owner,
            repo: context.repo.repo,
            title: `Staging E2E Tests Failed - ${new Date().toISOString()}`,
            body: `Staging tests failed. Check the [workflow run](${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId})`,
            labels: ['staging', 'test-failure', 'priority-high']
          });
```

### 9. Test Data Cleanup (`tests/staging/cleanup.ts`)
```typescript
export async function cleanupStagingData(page: Page) {
  // Call staging reset endpoint
  const response = await page.request.post('/api/staging/cleanup', {
    headers: {
      'X-Admin-Key': process.env.STAGING_ADMIN_KEY
    },
    data: {
      keepUsers: true,
      clearSessions: true,
      clearUploads: true
    }
  });
  
  expect(response.ok()).toBe(true);
}

// Run after each test suite
test.afterAll(async ({ page }) => {
  await cleanupStagingData(page);
});
```

## Acceptance Criteria
- [ ] Tests run automatically after staging deployment
- [ ] Tests use real staging infrastructure (no mocks)
- [ ] Clear distinction from local/CI tests
- [ ] Failure notifications sent to team
- [ ] Test results dashboard available
- [ ] Tests don't interfere with manual testing
- [ ] Performance metrics tracked over time
- [ ] All external integrations tested
- [ ] Multi-user scenarios validated

## Test Coverage Areas
- Authentication with real provider
- File uploads to actual storage
- OpenAI API with rate limits
- Database operations and persistence
- Caching and CDN behavior
- SSL/TLS configuration
- WebSocket connections (if applicable)
- Error tracking integration
- Performance under load

## Definition of Done
- [ ] All staging test suites implemented
- [ ] Tests running on schedule
- [ ] Monitoring dashboard created
- [ ] Alert rules configured
- [ ] Documentation complete
- [ ] Team trained on test results analysis
- [ ] Cleanup procedures tested
- [ ] Historical data retention configured

## Notes
- Keep staging tests separate from regular tests
- Use real but limited test data
- Implement proper test isolation
- Consider adding visual regression tests
- Plan for test data privacy compliance
- Add cost monitoring for API usage

## Related Issues
- Depends on: #3 (Staging environment setup)
- Depends on: #2 (Core workflow tests)
- Related to: #6 (Test data management)

## Estimated Effort
- **Size:** Large (8 story points)
- **Time:** 4-5 days
- **Priority:** Medium (important for confidence)

## Labels
`testing`, `staging`, `e2e`, `monitoring`, `priority-medium`