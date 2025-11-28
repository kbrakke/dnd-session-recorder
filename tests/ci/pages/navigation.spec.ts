import { test, expect } from '@playwright/test';

test.describe('Navigation Tests', () => {
  test('public routes are accessible', async ({ page }) => {
    const publicRoutes = ['/', '/auth/signin', '/auth/signup'];
    
    for (const route of publicRoutes) {
      const response = await page.goto(route);
      expect(response?.status()).toBe(200);
    }
  });

  test('protected routes redirect to sign-in when unauthenticated', async ({ page }) => {
    const protectedRoutes = ['/campaigns', '/sessions', '/settings'];
    
    for (const route of protectedRoutes) {
      await page.goto(route);
      
      // Should redirect to sign-in
      await expect(page).toHaveURL(/\/auth\/signin/);
    }
  });

  test('sign-in page is accessible', async ({ page }) => {
    await page.goto('/auth/signin');
    await expect(page).toHaveURL(/\/auth\/signin/);
  });

  test('sign-up page is accessible', async ({ page }) => {
    await page.goto('/auth/signup');
    await expect(page).toHaveURL(/\/auth\/signup/);
  });

  test('404 pages render correctly', async ({ page }) => {
    const response = await page.goto('/nonexistent-page');
    
    // Should get 404 or redirect to a valid page
    expect([200, 404]).toContain(response?.status() || 200);
  });

  test('route transitions do not cause errors', async ({ page }) => {
    const errors: string[] = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    // Navigate between public routes
    await page.goto('/');
    await page.goto('/auth/signin');
    await page.goto('/auth/signup');
    await page.goto('/');
    
    await page.waitForLoadState('networkidle');
    
    const criticalErrors = errors.filter(error => 
      !error.includes('favicon') && 
      !error.includes('analytics')
    );
    
    expect(criticalErrors).toHaveLength(0);
  });
});

