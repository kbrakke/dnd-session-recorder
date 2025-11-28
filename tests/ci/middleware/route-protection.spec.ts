import { test, expect } from '@playwright/test';

test.describe('Route Protection', () => {
  test('unauthenticated access to /campaigns redirects to sign-in', async ({ page }) => {
    await page.goto('/campaigns');
    
    // Should redirect to sign-in
    await expect(page).toHaveURL(/\/auth\/signin/);
  });

  test('unauthenticated access to /sessions redirects to sign-in', async ({ page }) => {
    await page.goto('/sessions');
    
    await expect(page).toHaveURL(/\/auth\/signin/);
  });

  test('unauthenticated access to /settings redirects to sign-in', async ({ page }) => {
    await page.goto('/settings');
    
    await expect(page).toHaveURL(/\/auth\/signin/);
  });

  test('unauthenticated access to /sessions/upload redirects to sign-in', async ({ page }) => {
    await page.goto('/sessions/upload');
    
    await expect(page).toHaveURL(/\/auth\/signin/);
  });

  test('public routes remain accessible', async ({ page }) => {
    const publicRoutes = ['/', '/auth/signin', '/auth/signup'];
    
    for (const route of publicRoutes) {
      const response = await page.goto(route);
      expect(response?.status()).toBe(200);
    }
  });

  test('API routes are protected at middleware level', async ({ request }) => {
    const protectedApiRoutes = [
      '/api/sessions',
      '/api/campaigns',
      '/api/uploads',
    ];

    for (const route of protectedApiRoutes) {
      const response = await request.get(route);
      expect(response.status()).toBe(401);
    }
  });
});

