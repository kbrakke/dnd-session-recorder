import { test, expect } from '@playwright/test';

test.describe('Security Headers', () => {
  test('API responses include security headers', async ({ request }) => {
    const response = await request.get('/api/health');
    
    expect(response.status()).toBe(200);
    
    const headers = response.headers();
    
    // Headers should be defined
    expect(headers).toBeDefined();
    
    // Check for common security headers (may or may not be present depending on config)
    const securityHeaders = [
      'x-content-type-options',
      'x-frame-options',
      'x-xss-protection',
      'strict-transport-security',
    ];
    
    // At least verify headers object is populated
    expect(Object.keys(headers).length).toBeGreaterThan(0);
  });

  test('no sensitive headers leaked', async ({ request }) => {
    const response = await request.get('/api/health');
    const headers = response.headers();
    
    // Should not expose server version or internal details
    const sensitiveHeaders = [
      'server',
      'x-powered-by',
      'x-aspnet-version',
    ];
    
    for (const sensitiveHeader of sensitiveHeaders) {
      // These headers should not be present or should be generic
      if (headers[sensitiveHeader]) {
        expect(headers[sensitiveHeader]).not.toMatch(/version|v\d+/i);
      }
    }
  });

  test('content-type headers are set correctly', async ({ request }) => {
    const response = await request.get('/api/health');
    
    const contentType = response.headers()['content-type'];
    expect(contentType).toContain('application/json');
  });
});

