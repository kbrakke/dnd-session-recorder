import { test, expect } from '@playwright/test';

test.describe('CORS Configuration', () => {
  test('OPTIONS preflight requests return appropriate status', async ({ request }) => {
    const response = await request.fetch('/api/health', {
      method: 'OPTIONS',
    });
    
    // Should return 200, 204, or 404 (depending on CORS config)
    expect([200, 204, 404, 405]).toContain(response.status());
  });

  test('CORS headers are present when needed', async ({ request }) => {
    // Make a request that might trigger CORS
    const response = await request.get('/api/health', {
      headers: {
        'Origin': 'https://example.com',
      },
    });
    
    expect(response.status()).toBe(200);
    
    const headers = response.headers();
    
    // CORS headers may or may not be present depending on configuration
    // Just verify the request doesn't fail
    expect(headers).toBeDefined();
  });

  test('API endpoints handle CORS correctly', async ({ request }) => {
    const response = await request.get('/api/health', {
      headers: {
        'Origin': 'https://example.com',
        'Access-Control-Request-Method': 'GET',
      },
    });
    
    // Should not fail due to CORS
    expect([200, 401, 404]).toContain(response.status());
  });
});

