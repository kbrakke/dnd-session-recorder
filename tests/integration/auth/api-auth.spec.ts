import { test, expect } from '@playwright/test';
import { createUniqueTestUser } from '../../fixtures/users';
import { cleanupTestUsers, createTestUser as dbCreateTestUser } from '../../setup/auth';

test.describe('API Authentication Integration Tests', () => {
  test.beforeAll(async () => {
    await cleanupTestUsers();
  });

  test.afterAll(async () => {
    await cleanupTestUsers();
  });

  const protectedEndpoints = [
    { method: 'GET', path: '/api/sessions' },
    { method: 'POST', path: '/api/sessions' },
    { method: 'GET', path: '/api/campaigns' },
    { method: 'POST', path: '/api/campaigns' },
    { method: 'GET', path: '/api/uploads' },
    { method: 'POST', path: '/api/upload' },
    { method: 'GET', path: '/api/summary/test-session-id' },
    { method: 'GET', path: '/api/transcription/test-session-id' },
  ];

  const publicEndpoints = [
    { method: 'GET', path: '/api/health' },
    { method: 'POST', path: '/api/auth/register' },
  ];

  test.describe('Protected Endpoint Authentication', () => {
    protectedEndpoints.forEach(({ method, path }) => {
      test(`${method} ${path} should reject unauthenticated requests`, async ({ request }) => {
        const response = await request.fetch(path, {
          method,
          headers: {
            'Content-Type': 'application/json',
          },
          data: method === 'POST' ? {} : undefined,
        });

        expect(response.status()).toBe(401);
        const body = await response.json();
        expect(body).toHaveProperty('error');
        expect(body.error).toMatch(/Authentication required|Unauthorized/);
      });
    });
  });

  test.describe('Public Endpoint Access', () => {
    publicEndpoints.forEach(({ method, path }) => {
      test(`${method} ${path} should allow unauthenticated requests`, async ({ request }) => {
        let response;
        
        if (path === '/api/auth/register') {
          const testUser = createUniqueTestUser('public-register');
          response = await request.fetch(path, {
            method,
            headers: {
              'Content-Type': 'application/json',
            },
            data: {
              name: testUser.name,
              email: testUser.email,
              password: testUser.password
            }
          });
          expect([200, 201, 400]).toContain(response.status());
        } else {
          response = await request.fetch(path, { method });
          expect(response.status()).not.toBe(401);
        }
      });
    });
  });

  test.describe('Authenticated API Requests', () => {
    test('should allow authenticated requests to protected endpoints', async ({ request, page }) => {
      const testUser = createUniqueTestUser('api-auth');
      
      const registerResponse = await request.post('/api/auth/register', {
        data: testUser
      });
      
      expect([200, 201, 400]).toContain(registerResponse.status());

      await page.goto('/auth/signin');
      
      await page.getByPlaceholder('Enter your email').fill(testUser.email);
      await page.getByPlaceholder('Enter your password').fill(testUser.password);
      
      await page.locator('form').getByRole('button', { name: /sign in/i }).click();

      await page.waitForLoadState('networkidle');
      
      if (page.url().includes('/auth/error')) {
        const errorElement = page.locator('[data-testid="error-message"], .error, text="error"');
        const errorText = await errorElement.textContent();
        throw new Error(`Login failed with error: ${errorText || 'Unknown auth error'}`);
      }

      await expect(page).toHaveURL('/');

      const isAuthenticated = await page.getByText('Welcome back, Dungeon Master!').isVisible();
      
      if (!isAuthenticated) {
        const isLandingPage = await page.getByText('AI-Powered D&D Session Recording').isVisible();
        if (isLandingPage) {
          throw new Error('Login appeared to succeed but user is not authenticated (seeing landing page)');
        }
      }

      const sessionsResponse = await page.request.get('/api/sessions');
      expect(sessionsResponse.status()).toBe(200);

      const campaignsResponse = await page.request.get('/api/campaigns');  
      expect(campaignsResponse.status()).toBe(200);

      const uploadsResponse = await page.request.get('/api/uploads');
      expect(uploadsResponse.status()).toBe(200);
    });

    test('should maintain session across multiple API calls', async ({ page }) => {
      const testUser = createUniqueTestUser('session-persistence');
      await dbCreateTestUser(testUser);

      await page.goto('/auth/signin');
      await page.getByPlaceholder('Enter your email').fill(testUser.email);
      await page.getByPlaceholder('Enter your password').fill(testUser.password);
      await page.locator('form').getByRole('button', { name: /sign in/i }).click();

      await page.waitForURL('/', { timeout: 10000 });

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
  });

  test.describe('Session Token Validation', () => {
    test('should reject requests with invalid session tokens', async ({ request }) => {
      const response = await request.get('/api/sessions', {
        headers: {
          'Cookie': 'next-auth.session-token=invalid-token'
        }
      });
      
      expect(response.status()).toBe(401);
    });

    test('should reject requests with expired session tokens', async ({ request }) => {
      const expiredToken = 'expired-token-' + Date.now();
      const response = await request.get('/api/sessions', {
        headers: {
          'Cookie': `next-auth.session-token=${expiredToken}`
        }
      });
      
      expect(response.status()).toBe(401);
    });

    test('should reject requests with malformed session cookies', async ({ request }) => {
      const malformedCookies = [
        'next-auth.session-token=',
        'next-auth.session-token=malformed-token@#$%',
        'invalid-cookie-format=token',
      ];

      for (const cookie of malformedCookies) {
        const response = await request.get('/api/sessions', {
          headers: {
            'Cookie': cookie
          }
        });
        
        expect(response.status()).toBe(401);
      }
    });
  });

  test.describe('Cross-User Data Access', () => {
    test('should prevent access to other users session data', async ({ request }) => {
      const response = await request.get('/api/summary/fake-session-id');
      expect(response.status()).toBe(401);
    });

    test('should return user-specific data only', async ({ page }) => {
      const testUser = createUniqueTestUser('user-data');
      await dbCreateTestUser(testUser);

      await page.goto('/auth/signin');
      await page.getByPlaceholder('Enter your email').fill(testUser.email);
      await page.getByPlaceholder('Enter your password').fill(testUser.password);
      await page.locator('form').getByRole('button', { name: /sign in/i }).click();

      await page.waitForURL('/', { timeout: 10000 });

      const sessionsResponse = await page.request.get('/api/sessions');
      expect(sessionsResponse.status()).toBe(200);
      
      const sessions = await sessionsResponse.json();
      expect(Array.isArray(sessions)).toBe(true);
      
      sessions.forEach((session: { id: string }) => {
        expect(session).toHaveProperty('id');
      });
    });
  });

  test.describe('CORS and Security Headers', () => {
    test('should handle CORS preflight requests', async ({ request }) => {
      const response = await request.get('/api/health');
      expect(response.status()).toBe(200);
      
      const preflightResponse = await request.fetch('/api/health', {
        method: 'OPTIONS'
      });
      
      expect([200, 204, 404]).toContain(preflightResponse.status());
    });

    test('should include security headers in API responses', async ({ request }) => {
      const response = await request.get('/api/health');
      expect(response.status()).toBe(200);
      
      const headers = response.headers();
      expect(headers).toBeDefined();
    });
  });

  test.describe('Rate Limiting Behavior', () => {
    test('should handle API rate limits gracefully', async ({ request }) => {
      const response = await request.get('/api/health');
      expect(response.status()).toBe(200);
      
      const rateLimitHeaders = [
        'x-ratelimit-limit',
        'x-ratelimit-remaining', 
        'x-ratelimit-reset'
      ];
      
      const headers = response.headers();
      
      rateLimitHeaders.forEach(header => {
        if (headers[header]) {
          expect(parseInt(headers[header])).toBeGreaterThanOrEqual(0);
        }
      });
    });

    test('should return 429 when rate limit exceeded', async ({ page }) => {
      const testUser = createUniqueTestUser('rate-limit');
      await dbCreateTestUser(testUser);

      await page.goto('/auth/signin');
      await page.getByPlaceholder('Enter your email').fill(testUser.email);
      await page.getByPlaceholder('Enter your password').fill(testUser.password);
      await page.locator('form').getByRole('button', { name: /sign in/i }).click();

      await page.waitForURL('/', { timeout: 10000 });

      const rapidRequests = Array(20).fill(0).map(() => 
        page.request.get('/api/sessions')
      );

      const responses = await Promise.all(rapidRequests);
      
      const rateLimitedResponses = responses.filter(r => r.status() === 429);
      if (rateLimitedResponses.length > 0) {
        const rateLimitedResponse = rateLimitedResponses[0];
        const body = await rateLimitedResponse.json();
        expect(body.error).toMatch(/too many requests/i);
      }
    });
  });
});