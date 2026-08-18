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

  test('unauthenticated access to /billing redirects to sign-in', async ({ page }) => {
    await page.goto('/billing');

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
      '/api/billing/subscription',
    ];

    for (const route of protectedApiRoutes) {
      const response = await request.get(route);
      expect(response.status()).toBe(401);
    }

    // checkout is POST-only — probe it with its real method (a GET would hit
    // the route's 405 before auth matters)
    const checkout = await request.post('/api/billing/checkout');
    expect(checkout.status()).toBe(401);
  });

  test('Stripe webhook is public (authenticated by signature, not session)', async ({ request }) => {
    // Middleware must let the webhook through — it carries no session cookie.
    // A GET on this POST-only route returns 405 (or 503 when unconfigured),
    // never 401, which proves middleware did not auth-block it.
    const response = await request.get('/api/billing/webhook');
    expect(response.status()).not.toBe(401);
  });
});

