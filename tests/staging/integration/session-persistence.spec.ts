import { test, expect } from '@playwright/test';
import { 
  createTestUserViaAPI, 
  loginViaUI, 
  cleanupTestUser, 
  generateTestUser,
  verifyAuthenticated 
} from '../helpers/users';

test.describe('Session Persistence', () => {
  let testUser: { email: string; password: string } | null = null;

  test.beforeEach(async ({ page, request }) => {
    const user = generateTestUser('persist');
    await createTestUserViaAPI(request, user);
    testUser = { email: user.email, password: user.password };
    await loginViaUI(page, user.email, user.password);
  });

  test.afterEach(async ({ request }) => {
    if (testUser?.email) {
      await cleanupTestUser(request, testUser.email);
    }
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

