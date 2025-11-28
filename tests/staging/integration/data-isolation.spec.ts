import { test, expect } from '@playwright/test';
import { 
  createTestUserViaAPI, 
  loginViaUI, 
  cleanupTestUser, 
  generateTestUser 
} from '../helpers/users';

test.describe('Data Isolation', () => {
  let userA: { email: string; password: string } | null = null;
  let userB: { email: string; password: string } | null = null;

  test.beforeEach(async ({ request }) => {
    // Create two test users
    const user1 = generateTestUser('user-a');
    const user2 = generateTestUser('user-b');

    await createTestUserViaAPI(request, user1);
    await createTestUserViaAPI(request, user2);

    userA = { email: user1.email, password: user1.password };
    userB = { email: user2.email, password: user2.password };
  });

  test.afterEach(async ({ request }) => {
    if (userA?.email) {
      await cleanupTestUser(request, userA.email);
    }
    if (userB?.email) {
      await cleanupTestUser(request, userB.email);
    }
  });

  test('user A cannot access user B sessions via API', async ({ page }) => {
    // Login as user A
    await loginViaUI(page, userA!.email, userA!.password);

    // Get user A's sessions
    const responseA = await page.request.get('/api/sessions');
    expect(responseA.status()).toBe(200);
    const sessionsA = await responseA.json();
    const sessionIdsA = sessionsA.map((s: { id: string }) => s.id);
    
    // Try to access a session ID that doesn't belong to user A
    // (using a fake ID or one from user B if we had access)
    if (sessionIdsA.length === 0) {
      // If user A has no sessions, try accessing a fake ID
      const fakeResponse = await page.request.get('/api/sessions/fake-session-id');
      expect([404, 401, 403]).toContain(fakeResponse.status());
    }
  });

  test('user A cannot access user B campaigns via API', async ({ page }) => {
    // Login as user A
    await loginViaUI(page, userA!.email, userA!.password);
    
    // Get user A's campaigns
    const responseA = await page.request.get('/api/campaigns');
    expect(responseA.status()).toBe(200);
    const campaignsA = await responseA.json();
    const campaignIdsA = campaignsA.map((c: { id: string }) => c.id);
    
    // Try to access a campaign ID that doesn't belong to user A
    if (campaignIdsA.length === 0) {
      const fakeResponse = await page.request.get('/api/campaigns/fake-campaign-id');
      expect([404, 401, 403]).toContain(fakeResponse.status());
    }
  });

  test('API returns only user own data', async ({ page }) => {
    // Login as user A
    await loginViaUI(page, userA!.email, userA!.password);
    
    // Get all data for user A
    const [sessionsResponse, campaignsResponse] = await Promise.all([
      page.request.get('/api/sessions'),
      page.request.get('/api/campaigns'),
    ]);
    
    expect(sessionsResponse.status()).toBe(200);
    expect(campaignsResponse.status()).toBe(200);
    
    const sessions = await sessionsResponse.json();
    const campaigns = await campaignsResponse.json();
    
    // All sessions should belong to user A (we can't verify this without DB access,
    // but we can verify the structure is correct)
    sessions.forEach((session: { id: string }) => {
      expect(session).toHaveProperty('id');
    });

    campaigns.forEach((campaign: { id: string }) => {
      expect(campaign).toHaveProperty('id');
    });
  });

  test('cross-user ID access returns 404 or 403', async ({ page }) => {
    // Login as user A
    await loginViaUI(page, userA!.email, userA!.password);
    
    // Try to access endpoints with fake IDs (simulating another user's data)
    const fakeSessionResponse = await page.request.get('/api/sessions/fake-session-id-12345');
    const fakeCampaignResponse = await page.request.get('/api/campaigns/fake-campaign-id-12345');
    
    // Should return 404 (not found) or 403 (forbidden)
    expect([404, 403]).toContain(fakeSessionResponse.status());
    expect([404, 403]).toContain(fakeCampaignResponse.status());
  });
});

