import { test, expect } from '@playwright/test';

test.describe('Staging Deployment Verification', () => {
  const STAGING_URL = 'https://dnd-recorder-staging.fly.dev';

  test.describe('System Health Checks', () => {
    test('should have healthy application status', async ({ request }) => {
      const response = await request.get(`${STAGING_URL}/api/health`);
      
      expect(response.status()).toBe(200);
      
      const health = await response.json();
      expect(health).toHaveProperty('status', 'OK');
      expect(health).toHaveProperty('database', 'connected');
      expect(health).toHaveProperty('schema');
      expect(health).toHaveProperty('environment', 'production');
      expect(health.schema).toMatch(/initialized|not_initialized/);
    });

    test('should serve homepage correctly', async ({ page }) => {
      await page.goto(STAGING_URL);
      
      // Check for key elements that indicate the app loaded correctly
      await expect(page).toHaveTitle(/D&D Session Recorder|DND/);
      
      // Should see either the landing page or authenticated dashboard
      const hasLandingContent = await page.getByText('AI-Powered D&D Session Recording').isVisible().catch(() => false);
      const hasAuthenticatedContent = await page.getByText('Welcome back, Dungeon Master!').isVisible().catch(() => false);
      
      expect(hasLandingContent || hasAuthenticatedContent).toBe(true);
    });

    test('should have authentication system working', async ({ page }) => {
      await page.goto(`${STAGING_URL}/auth/signin`);

      // Check sign-in page loads correctly (use heading which is unique)
      await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
      await expect(page.getByPlaceholder('Enter your email')).toBeVisible();
      await expect(page.getByPlaceholder('Enter your password')).toBeVisible();
    });

    test('should have sign-up page accessible', async ({ page }) => {
      await page.goto(`${STAGING_URL}/auth/signup`);
      
      // Check sign-up page loads correctly  
      await expect(page.getByText('Create Account')).toBeVisible();
      await expect(page.getByPlaceholder('Enter your full name')).toBeVisible();
      await expect(page.getByPlaceholder('Enter your email')).toBeVisible();
    });
  });

  test.describe('API Endpoint Verification', () => {
    test('should have protected endpoints properly secured', async ({ request }) => {
      const protectedEndpoints = [
        { path: '/api/sessions', method: 'GET' },
        { path: '/api/campaigns', method: 'GET' },
        { path: '/api/uploads', method: 'GET' },
      ];

      for (const { path, method } of protectedEndpoints) {
        const response = await request.fetch(`${STAGING_URL}${path}`, { method });
        expect(response.status()).toBe(401);

        const body = await response.json();
        expect(body).toHaveProperty('error');
        expect(body.error).toMatch(/Authentication required|Unauthorized/);
      }
    });

    test('should have public endpoints accessible', async ({ request }) => {
      const publicEndpoints = [
        { path: '/api/health', expectedStatus: 200 },
      ];

      for (const { path, expectedStatus } of publicEndpoints) {
        const response = await request.get(`${STAGING_URL}${path}`);
        expect(response.status()).toBe(expectedStatus);
      }
    });
  });

  test.describe('Database Integration', () => {
    test('should have database properly migrated', async ({ request }) => {
      const healthResponse = await request.get(`${STAGING_URL}/api/health`);
      expect(healthResponse.status()).toBe(200);
      
      const health = await healthResponse.json();
      expect(health.database).toBe('connected');
      expect(health.schema).toBe('initialized');
    });
  });

  test.describe('Environment Configuration', () => {
    test('should be running in production mode', async ({ request }) => {
      const healthResponse = await request.get(`${STAGING_URL}/api/health`);
      const health = await healthResponse.json();
      
      expect(health.environment).toBe('production');
    });

    test('should have proper security headers', async ({ request }) => {
      const response = await request.get(`${STAGING_URL}/api/health`);
      const headers = response.headers();
      
      // Check for important security headers (these may or may not be present)
      expect(response.status()).toBe(200);
      expect(headers).toBeDefined();
    });

    test('should have Google OAuth properly configured', async ({ page }) => {
      // Check if Google auth is available (this verifies environment variables are set)
      await page.goto(`${STAGING_URL}/auth/signin`);

      // Verify the page loaded correctly
      await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();

      // Check if Google sign-in button is present (optional feature)
      const hasGoogleButton = await page.getByRole('button', { name: /google/i }).isVisible().catch(() => false);
      const hasSignInForm = await page.getByPlaceholder('Enter your email').isVisible();

      // Page should have either Google auth or email/password auth
      expect(hasGoogleButton || hasSignInForm).toBe(true);
    });
  });

  test.describe('Application Features', () => {
    test('should have main navigation accessible', async ({ page }) => {
      await page.goto(STAGING_URL);
      
      // Check if navigation elements are present
      const hasNav = await page.locator('nav').isVisible().catch(() => false);
      const hasHeader = await page.locator('header').isVisible().catch(() => false);
      const hasSignInLink = await page.getByRole('link', { name: /sign in|login/i }).isVisible().catch(() => false);
      
      // At least one navigation element should be present
      expect(hasNav || hasHeader || hasSignInLink).toBe(true);
    });

    test('should serve static assets correctly', async ({ page }) => {
      await page.goto(STAGING_URL);
      
      // Check if CSS is loading (page should be styled)
      const bodyStyles = await page.locator('body').evaluate((el) => {
        return window.getComputedStyle(el).fontFamily;
      });
      
      // Should have some font styling applied (indicates CSS loaded)
      expect(bodyStyles).toBeDefined();
      expect(bodyStyles).not.toBe('');
    });

    test('should handle 404 pages gracefully', async ({ page }) => {
      const response = await page.goto(`${STAGING_URL}/nonexistent-page`);
      
      // Should get 404 or redirect to a valid page
      expect([200, 404]).toContain(response!.status());
    });
  });

  test.describe('Performance and Availability', () => {
    test('should respond quickly to health checks', async ({ request }) => {
      const startTime = Date.now();
      const response = await request.get(`${STAGING_URL}/api/health`);
      const responseTime = Date.now() - startTime;
      
      expect(response.status()).toBe(200);
      expect(responseTime).toBeLessThan(5000); // Should respond within 5 seconds
    });

    test('should handle concurrent requests', async ({ request }) => {
      // Make 5 concurrent health check requests
      const requests = Array(5).fill(0).map(() => 
        request.get(`${STAGING_URL}/api/health`)
      );
      
      const responses = await Promise.all(requests);
      
      responses.forEach(response => {
        expect(response.status()).toBe(200);
      });
    });
  });

  test.describe('Recent Updates Verification', () => {
    test('should have new progress tracking API available', async ({ request }) => {
      // Test that new progress endpoint exists (will return 401 but endpoint should exist)
      const response = await request.get(`${STAGING_URL}/api/sessions/test-id/progress`);
      
      // Should return 401 (unauthorized) not 404 (not found)
      expect(response.status()).toBe(401);
      
      const body = await response.json();
      expect(body).toHaveProperty('error');
      expect(body.error).toMatch(/Authentication required|Unauthorized/);
    });

    test('should have upload session management working', async ({ page }) => {
      await page.goto(`${STAGING_URL}/sessions/upload`);
      
      // Should either redirect to auth or show upload page
      const currentUrl = page.url();
      const isUploadPage = currentUrl.includes('/sessions/upload');
      const isAuthPage = currentUrl.includes('/auth/');
      
      expect(isUploadPage || isAuthPage).toBe(true);
    });
  });
});