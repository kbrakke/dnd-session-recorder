import { test, expect } from '@playwright/test';
import { 
  createTestUserViaAPI, 
  loginViaUI, 
  cleanupTestUser, 
  generateTestUser 
} from '../helpers/users';

test.describe('Authenticated API Tests', () => {
  let testUser: { email: string; password: string } | null = null;

  test.beforeEach(async ({ page, request }) => {
    const user = generateTestUser('api');
    await createTestUserViaAPI(request, user);
    testUser = { email: user.email, password: user.password };
    await loginViaUI(page, user.email, user.password);
  });

  test.afterEach(async ({ request }) => {
    if (testUser?.email) {
      await cleanupTestUser(request, testUser.email);
    }
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
    
    const uploads = await response.json();
    expect(Array.isArray(uploads)).toBe(true);
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

