import { test, expect } from '@playwright/test';
import {
  createTestUserViaAPI,
  loginViaUI,
  cleanupTestUsers,
  generateTestUser,
  verifyAuthenticated,
  TestUser,
} from '../helpers/users';

test.describe('Session Persistence', () => {
  // One user shared across the file — registration is rate-limited
  // (10/min/IP), so per-test users would trip 429s.
  let testUser: TestUser | null = null;

  test.beforeEach(async ({ page, request }) => {
    if (!testUser) {
      testUser = await createTestUserViaAPI(request, generateTestUser('persist'));
    }
    await loginViaUI(page, testUser.email, testUser.password);
  });

  test.afterAll(async ({ playwright }, testInfo) => {
    await cleanupTestUsers(playwright, testInfo, [testUser?.email]);
    testUser = null;
  });

  test('session cookie is set after login', async ({ page }) => {
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find(cookie => 
      cookie.name.includes('session') || cookie.name.includes('auth')
    );
    
    expect(sessionCookie).toBeDefined();
  });

  test('session persists across multiple API calls', async ({ page }) => {
    const apiCalls = [
      page.request.get('/api/sessions'),
      page.request.get('/api/campaigns'),
      page.request.get('/api/uploads'),
    ];

    const responses = await Promise.all(apiCalls);
    
    responses.forEach((response, index) => {
      expect(response.status(), `API call ${index} should be authenticated`).toBe(200);
    });
  });

  test('session persists across page navigations', async ({ page }) => {
    // Navigate to different pages
    await page.goto('/campaigns');
    await expect(page).toHaveURL(/\/campaigns/);
    
    await page.goto('/sessions');
    await expect(page).toHaveURL(/\/sessions/);
    
    await page.goto('/campaigns');
    await expect(page).toHaveURL(/\/campaigns/);
    
    // Should still be authenticated
    const isAuthenticated = await verifyAuthenticated(page);
    expect(isAuthenticated).toBe(true);
  });

  test('session persists after page reload', async ({ page }) => {
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Should still be authenticated
    const isAuthenticated = await verifyAuthenticated(page);
    expect(isAuthenticated).toBe(true);
    
    // API calls should still work
    const response = await page.request.get('/api/sessions');
    expect(response.status()).toBe(200);
  });
});

