import { test, expect } from '@playwright/test';

test.describe('Basic Staging Health Check', () => {
  const STAGING_URL = 'https://dnd-recorder-staging.fly.dev';

  test('should have healthy system status', async ({ request }) => {
    const response = await request.get(`${STAGING_URL}/api/health`);
    
    expect(response.status()).toBe(200);
    
    const health = await response.json();
    console.log('Health check response:', JSON.stringify(health, null, 2));
    
    expect(health).toHaveProperty('status', 'OK');
    expect(health).toHaveProperty('database', 'connected');
    expect(health).toHaveProperty('environment', 'production');
    expect(health).toHaveProperty('schema');
    
    // Schema should be initialized for a working deployment
    if (health.schema === 'migration_needed') {
      console.error(`❌ Database schema needs migration! Missing columns: ${health.missingColumns?.join(', ')}`);
      throw new Error(`Migration required - missing columns: ${health.missingColumns?.join(', ')}`);
    } else if (health.schema !== 'initialized') {
      console.warn(`Database schema is: ${health.schema}`);
    }
  });

  test('should have protected endpoints secured', async ({ request }) => {
    const protectedEndpoints = [
      '/api/sessions',
      '/api/campaigns', 
      '/api/uploads'
    ];

    for (const endpoint of protectedEndpoints) {
      const response = await request.get(`${STAGING_URL}${endpoint}`);
      console.log(`Testing ${endpoint}: ${response.status()}`);
      
      expect(response.status()).toBe(401);
      
      const body = await response.json();
      expect(body).toHaveProperty('error');
      expect(body.error).toMatch(/Authentication required|Unauthorized/);
    }
  });

  test('should have new progress tracking endpoint available', async ({ request }) => {
    const response = await request.get(`${STAGING_URL}/api/sessions/test-id/progress`);
    
    // Should return 401 (unauthorized) not 404 (not found) - proving endpoint exists
    expect(response.status()).toBe(401);
    
    const body = await response.json();
    expect(body).toHaveProperty('error');
    expect(body.error).toMatch(/Authentication required|Unauthorized/);
  });

  test('should respond to requests quickly', async ({ request }) => {
    const startTime = Date.now();
    const response = await request.get(`${STAGING_URL}/api/health`);
    const responseTime = Date.now() - startTime;
    
    console.log(`Health check response time: ${responseTime}ms`);
    
    expect(response.status()).toBe(200);
    expect(responseTime).toBeLessThan(10000); // Should respond within 10 seconds
  });

  test('should handle multiple concurrent requests', async ({ request }) => {
    const requests = Array(3).fill(0).map(() => 
      request.get(`${STAGING_URL}/api/health`)
    );
    
    const responses = await Promise.all(requests);
    
    responses.forEach((response, index) => {
      console.log(`Concurrent request ${index + 1}: ${response.status()}`);
      expect(response.status()).toBe(200);
    });
  });

  test('should have database connection working', async ({ request }) => {
    const response = await request.get(`${STAGING_URL}/api/health`);
    const health = await response.json();
    
    expect(health.database).toBe('connected');
    expect(health.schema).toMatch(/initialized|not_initialized|migration_needed/);
    
    console.log(`Database status: ${health.database}`);
    console.log(`Schema status: ${health.schema}`);
    
    if (health.databaseUrl) {
      // Should mask sensitive parts of DB URL
      expect(health.databaseUrl).toContain('***');
    }
  });
});