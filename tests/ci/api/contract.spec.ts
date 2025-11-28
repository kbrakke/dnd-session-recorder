import { test, expect } from '@playwright/test';

test.describe('API Contract Tests', () => {
  test('health endpoint returns expected schema', async ({ request }) => {
    const response = await request.get('/api/health');
    
    expect(response.status()).toBe(200);
    
    const body = await response.json();
    
    // Verify required fields exist
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('database');
    expect(body).toHaveProperty('schema');
    expect(body).toHaveProperty('environment');
    
    // Verify field types
    expect(typeof body.status).toBe('string');
    expect(typeof body.database).toBe('string');
    expect(typeof body.schema).toBe('string');
    expect(typeof body.environment).toBe('string');
    
    // Verify expected values
    expect(body.status).toBe('OK');
    expect(['connected', 'disconnected']).toContain(body.database);
  });

  test('health endpoint includes timestamp', async ({ request }) => {
    const response = await request.get('/api/health');
    const body = await response.json();
    
    // Timestamp is optional but if present should be valid
    if (body.timestamp) {
      expect(typeof body.timestamp).toBe('string');
      // Should be a valid ISO date string
      expect(() => new Date(body.timestamp)).not.toThrow();
    }
  });

  test('protected endpoints return 401 when unauthenticated', async ({ request }) => {
    const protectedEndpoints = [
      '/api/sessions',
      '/api/campaigns',
      '/api/uploads',
    ];

    for (const endpoint of protectedEndpoints) {
      const response = await request.get(endpoint);
      
      expect(response.status()).toBe(401);
      
      const body = await response.json();
      expect(body).toHaveProperty('error');
      expect(typeof body.error).toBe('string');
      expect(body.error.length).toBeGreaterThan(0);
    }
  });

  test('protected endpoints return JSON error format', async ({ request }) => {
    const response = await request.get('/api/sessions');
    
    expect(response.status()).toBe(401);
    
    const contentType = response.headers()['content-type'];
    expect(contentType).toContain('application/json');
    
    const body = await response.json();
    expect(body).toHaveProperty('error');
    expect(body.error).toMatch(/Authentication required|Unauthorized/i);
  });

  test('progress tracking endpoint exists', async ({ request }) => {
    // Test that progress endpoint exists (will return 401 but endpoint should exist)
    const response = await request.get('/api/sessions/test-id/progress');
    
    // Should return 401 (unauthorized) not 404 (not found)
    expect(response.status()).toBe(401);
    
    const body = await response.json();
    expect(body).toHaveProperty('error');
    expect(body.error).toMatch(/Authentication required|Unauthorized/i);
  });

  test('public endpoints are accessible', async ({ request }) => {
    const publicEndpoints = [
      { path: '/api/health', expectedStatus: 200 },
      { path: '/api/auth/register', expectedStatus: [200, 201, 400] }, // 400 if validation fails
    ];

    for (const { path, expectedStatus } of publicEndpoints) {
      const response = await request.get(path);
      
      if (Array.isArray(expectedStatus)) {
        expect(expectedStatus).toContain(response.status());
      } else {
        expect(response.status()).toBe(expectedStatus);
      }
    }
  });

  test('invalid HTTP methods return appropriate status', async ({ request }) => {
    // Test that endpoints handle invalid methods correctly
    const response = await request.fetch('/api/health', {
      method: 'DELETE',
    });
    
    // Should return 405 (Method Not Allowed) or 404
    expect([404, 405]).toContain(response.status());
  });

  test('API responses have correct content-type', async ({ request }) => {
    const response = await request.get('/api/health');
    
    const contentType = response.headers()['content-type'];
    expect(contentType).toContain('application/json');
  });

  test('health endpoint responds within acceptable time', async ({ request }) => {
    const startTime = Date.now();
    const response = await request.get('/api/health');
    const responseTime = Date.now() - startTime;
    
    expect(response.status()).toBe(200);
    expect(responseTime).toBeLessThan(10000); // Should respond within 10 seconds
  });

  test('handles multiple concurrent requests', async ({ request }) => {
    const requests = Array(3).fill(0).map(() => 
      request.get('/api/health')
    );
    
    const responses = await Promise.all(requests);
    
    responses.forEach((response) => {
      expect(response.status()).toBe(200);
    });
  });
});

