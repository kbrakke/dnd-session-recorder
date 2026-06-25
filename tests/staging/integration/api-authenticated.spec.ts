import { test, expect } from '@playwright/test';
import {
  createTestUserViaAPI,
  loginViaUI,
  cleanupTestUsers,
  generateTestUser,
  TestUser,
} from '../helpers/users';

test.describe('Authenticated API Tests', () => {
  // One user for the whole file — registration is rate-limited (10/min/IP),
  // so per-test users would trip 429s. Single worker makes this safe.
  let testUser: TestUser | null = null;

  test.beforeEach(async ({ page, request }) => {
    if (!testUser) {
      testUser = await createTestUserViaAPI(request, generateTestUser('api'));
    }
    await loginViaUI(page, testUser.email, testUser.password);
  });

  test.afterAll(async ({ playwright }, testInfo) => {
    await cleanupTestUsers(playwright, testInfo, [testUser?.email]);
    testUser = null;
  });

  test('authenticated GET /api/sessions returns user sessions', async ({ page }) => {
    const response = await page.request.get('/api/sessions');
    
    expect(response.status()).toBe(200);
    
    const sessions = await response.json();
    expect(Array.isArray(sessions)).toBe(true);

    // Each session should have required fields
    sessions.forEach((session: { id: string }) => {
      expect(session).toHaveProperty('id');
    });
  });

  test('authenticated GET /api/campaigns returns user campaigns', async ({ page }) => {
    const response = await page.request.get('/api/campaigns');
    
    expect(response.status()).toBe(200);
    
    const campaigns = await response.json();
    expect(Array.isArray(campaigns)).toBe(true);

    // Each campaign should have required fields
    campaigns.forEach((campaign: { id: string }) => {
      expect(campaign).toHaveProperty('id');
    });
  });

  test('authenticated GET /api/uploads returns user uploads', async ({ page }) => {
    const response = await page.request.get('/api/uploads');

    expect(response.status()).toBe(200);

    // Endpoint returns { uploads: [...] }
    const body = await response.json();
    expect(Array.isArray(body.uploads)).toBe(true);
  });

  test('authenticated POST /api/campaigns creates campaign', async ({ page }) => {
    const campaignData = {
      name: `API Test Campaign ${Date.now()}`,
      description: 'Created via API test',
    };
    
    const response = await page.request.post('/api/campaigns', {
      data: campaignData,
    });
    
    expect([200, 201]).toContain(response.status());
    
    const campaign = await response.json();
    expect(campaign).toHaveProperty('id');
    expect(campaign.name).toBe(campaignData.name);
  });

  test('API responses are properly serialized', async ({ page }) => {
    const response = await page.request.get('/api/sessions');
    
    expect(response.status()).toBe(200);
    
    const contentType = response.headers()['content-type'];
    expect(contentType).toContain('application/json');
    
    const sessions = await response.json();
    expect(typeof sessions).toBe('object');
  });
});

