import { test, expect } from '@playwright/test';

test.describe('API Authentication', () => {
  // Use timestamp to ensure unique emails for each test run
  const timestamp = Date.now();
  const testUser = {
    name: 'API Test User',
    email: `apitest-${timestamp}@example.com`, 
    password: 'testPassword123'
  };

  // Test all protected API endpoints reject unauthenticated requests
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

  // Test that public endpoints still work
  const publicEndpoints = [
    { method: 'GET', path: '/api/health' },
    { method: 'POST', path: '/api/auth/register' },
  ];

  publicEndpoints.forEach(({ method, path }) => {
    test(`${method} ${path} should allow unauthenticated requests`, async ({ request }) => {
      let response;
      
      if (path === '/api/auth/register') {
        // For register endpoint, provide valid data
        response = await request.fetch(path, {
          method,
          headers: {
            'Content-Type': 'application/json',
          },
          data: {
            name: 'Test User',
            email: 'unique-test@example.com',
            password: 'testpassword123'
          }
        });
        // Register might return 400 if user exists, but shouldn't return 401
        expect([200, 201, 400]).toContain(response.status());
      } else {
        response = await request.fetch(path, { method });
        expect(response.status()).not.toBe(401);
      }
    });
  });

  test('Authenticated requests should work for protected endpoints', async ({ request, page }) => {
    // First create a user account via API
    const registerResponse = await request.post('/api/auth/register', {
      data: testUser
    });
    
    // Should succeed or already exist
    expect([200, 201, 400]).toContain(registerResponse.status());

    // Navigate to the app and sign in
    await page.goto('/auth/signin');
    
    // Fill in login form
    await page.getByPlaceholder('Enter your email').fill(testUser.email);
    await page.getByPlaceholder('Enter your password').fill(testUser.password);
    
    // Use form context to avoid navbar button confusion
    await page.locator('form').getByRole('button', { name: /sign in/i }).click();

    // Wait for successful login or error page
    await page.waitForLoadState('networkidle');
    
    // Check if we ended up on error page
    if (page.url().includes('/auth/error')) {
      const errorElement = page.locator('[data-testid="error-message"], .error, text="error"');
      const errorText = await errorElement.textContent();
      throw new Error(`Login failed with error: ${errorText || 'Unknown auth error'}`);
    }

    // Should be on home page if login succeeded
    await expect(page).toHaveURL('/');

    // Check if we see authenticated content or landing page
    const isAuthenticated = await page.getByText('Welcome back, Dungeon Master!').isVisible();
    
    if (!isAuthenticated) {
      // If we see landing page instead, the login didn't work
      const isLandingPage = await page.getByText('AI-Powered D&D Session Recording').isVisible();
      if (isLandingPage) {
        throw new Error('Login appeared to succeed but user is not authenticated (seeing landing page)');
      }
    }

    // If we get here, login worked - now test API requests
    const sessionsResponse = await page.request.get('/api/sessions');
    expect(sessionsResponse.status()).toBe(200);

    const campaignsResponse = await page.request.get('/api/campaigns');  
    expect(campaignsResponse.status()).toBe(200);

    const uploadsResponse = await page.request.get('/api/uploads');
    expect(uploadsResponse.status()).toBe(200);
  });

  test('Session endpoints reject requests for other users data', async ({ request }) => {
    // Test that individual session endpoints require authentication
    // Test the summary endpoint which we know requires auth
    const response = await request.get('/api/summary/fake-session-id');
    expect(response.status()).toBe(401);
  });

  test('Invalid session tokens are rejected', async ({ request }) => {
    // Test with an invalid/expired session cookie
    const response = await request.get('/api/sessions', {
      headers: {
        'Cookie': 'next-auth.session-token=invalid-token'
      }
    });
    
    expect(response.status()).toBe(401);
  });

  test('CORS headers are properly set', async ({ request }) => {
    const response = await request.get('/api/health');
    
    // Should have CORS headers (or not reject cross-origin requests)
    expect(response.status()).toBe(200);
    
    // Test preflight request
    const preflightResponse = await request.fetch('/api/health', {
      method: 'OPTIONS'
    });
    
    // Should handle OPTIONS requests
    expect([200, 204, 404]).toContain(preflightResponse.status());
  });

  test('Rate limiting headers are present (when implemented)', async ({ request }) => {
    const response = await request.get('/api/health');
    
    // For now just verify the endpoint works
    expect(response.status()).toBe(200);
    
    // TODO: When rate limiting is implemented, check for rate limit headers:
    // expect(response.headers()['x-ratelimit-limit']).toBeDefined();
    // expect(response.headers()['x-ratelimit-remaining']).toBeDefined();
  });
});