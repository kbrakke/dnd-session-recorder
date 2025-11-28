import { test, expect } from '@playwright/test';

test.describe('Authentication Middleware', () => {
  test('rejects requests with invalid session tokens', async ({ request }) => {
    const invalidTokens = [
      'invalid-token',
      'expired-token-12345',
      'malformed.token.here',
      'token-with-special-chars-!@#$',
    ];

    for (const token of invalidTokens) {
      const response = await request.get('/api/sessions', {
        headers: {
          'Cookie': `next-auth.session-token=${token}`,
        },
      });
      
      expect(response.status()).toBe(401);
      
      const body = await response.json();
      expect(body).toHaveProperty('error');
    }
  });

  test('rejects requests with malformed cookies', async ({ request }) => {
    const malformedCookies = [
      'next-auth.session-token=',
      'next-auth.session-token=malformed@#$%',
      'invalid-cookie-format=token',
      '',
    ];

    for (const cookie of malformedCookies) {
      const response = await request.get('/api/sessions', {
        headers: {
          'Cookie': cookie,
        },
      });
      
      expect(response.status()).toBe(401);
    }
  });

  test('rejects requests without authentication headers', async ({ request }) => {
    const response = await request.get('/api/sessions', {
      headers: {
        // Explicitly no auth headers
      },
    });
    
    expect(response.status()).toBe(401);
    
    const body = await response.json();
    expect(body).toHaveProperty('error');
  });

  test('all protected endpoints enforce authentication consistently', async ({ request }) => {
    const protectedEndpoints = [
      { method: 'GET', path: '/api/sessions' },
      { method: 'POST', path: '/api/sessions' },
      { method: 'GET', path: '/api/campaigns' },
      { method: 'POST', path: '/api/campaigns' },
      { method: 'GET', path: '/api/uploads' },
    ];

    for (const { method, path } of protectedEndpoints) {
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
      expect(body.error).toMatch(/Authentication required|Unauthorized/i);
    }
  });

  test('protected endpoints reject requests with empty Authorization header', async ({ request }) => {
    const response = await request.get('/api/sessions', {
      headers: {
        'Authorization': '',
      },
    });
    
    expect(response.status()).toBe(401);
  });

  test('protected endpoints reject requests with malformed Authorization header', async ({ request }) => {
    const malformedAuthHeaders = [
      'Bearer',
      'Bearer ',
      'InvalidFormat token',
      'Bearer invalid-token-format',
    ];

    for (const authHeader of malformedAuthHeaders) {
      const response = await request.get('/api/sessions', {
        headers: {
          'Authorization': authHeader,
        },
      });
      
      expect(response.status()).toBe(401);
    }
  });
});

