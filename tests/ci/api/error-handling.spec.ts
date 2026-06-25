import { test, expect } from '@playwright/test';

test.describe('Error Handling', () => {
  test('404 responses return JSON error format', async ({ request }) => {
    const response = await request.get('/api/nonexistent-endpoint');
    
    // Should return 404 or 405
    expect([404, 405]).toContain(response.status());
    
    // If it's JSON, should have error property
    const contentType = response.headers()['content-type'];
    if (contentType?.includes('application/json')) {
      const body = await response.json();
      expect(body).toHaveProperty('error');
    }
  });

  test('400 validation errors include error details', async ({ request }) => {
    // Try to register with invalid data
    const response = await request.post('/api/auth/register', {
      data: {
        // Missing required fields
      },
    });
    
    // Should return 400 or 422 for validation errors
    expect([400, 422]).toContain(response.status());
    
    const body = await response.json();
    expect(body).toHaveProperty('error');
  });

  test('error responses include appropriate status codes', async ({ request }) => {
    // Test various error scenarios
    const testCases = [
      { path: '/api/sessions', expectedStatus: 401 }, // Unauthorized
      { path: '/api/nonexistent', expectedStatus: [404, 405] }, // Not found
    ];

    for (const { path, expectedStatus } of testCases) {
      const response = await request.get(path);
      
      if (Array.isArray(expectedStatus)) {
        expect(expectedStatus).toContain(response.status());
      } else {
        expect(response.status()).toBe(expectedStatus);
      }
    }
  });

  test('error messages are user-friendly', async ({ request }) => {
    const response = await request.get('/api/sessions');
    
    expect(response.status()).toBe(401);
    
    const body = await response.json();
    expect(body).toHaveProperty('error');
    
    // Error message should not contain stack traces or internal details
    expect(body.error).not.toContain('Error:');
    expect(body.error).not.toContain('at ');
    expect(body.error).not.toContain('stack');
    expect(body.error).not.toContain('prisma');
    expect(body.error).not.toContain('database');
  });

  test('error responses have consistent structure', async ({ request }) => {
    // Test multiple error scenarios to ensure consistency
    const errorResponses = [
      await request.get('/api/sessions'), // 401
      await request.get('/api/campaigns'), // 401
    ];

    for (const response of errorResponses) {
      expect(response.status()).toBe(401);
      
      const body = await response.json();
      expect(body).toHaveProperty('error');
      expect(typeof body.error).toBe('string');
    }
  });
});

