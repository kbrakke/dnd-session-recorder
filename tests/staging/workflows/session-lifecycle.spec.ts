import { test, expect } from '@playwright/test';
import {
  createTestUserViaAPI,
  loginViaUI,
  createCampaignViaUI,
  cleanupTestUsers,
  generateTestUser,
  TestUser,
} from '../helpers/users';

/**
 * Fill the /sessions/upload form and create a session without audio.
 * Assumes a campaign named `campaignName` exists for the logged-in user.
 */
async function createSessionWithoutAudio(
  page: import('@playwright/test').Page,
  sessionTitle: string,
  campaignName: string
): Promise<void> {
  await page.goto('/sessions/upload');
  await page.waitForLoadState('networkidle');

  await page.getByPlaceholder(/session title/i).fill(sessionTitle);
  await page.locator('select').first().selectOption({ label: campaignName });
  await page.locator('input[type="date"]').fill(new Date().toISOString().split('T')[0]);

  // Explicitly choose the audio-less path
  await page.getByRole('button', { name: 'Skip Audio' }).click();

  await page.getByRole('button', { name: /create session/i }).click();
  await page.waitForURL(/\/sessions\/[a-z0-9]+/, { timeout: 15000 });
}

test.describe('Session Lifecycle', () => {
  // One user shared across the file — registration is rate-limited
  // (10/min/IP), so per-test users would trip 429s. Each test still gets a
  // uniquely named campaign and session.
  let testUser: TestUser | null = null;
  let campaignName: string;
  let sessionTitle: string;

  test.beforeEach(async ({ page, request }) => {
    if (!testUser) {
      testUser = await createTestUserViaAPI(request, generateTestUser('session'));
    }

    // Login
    await loginViaUI(page, testUser.email, testUser.password);

    // Create a campaign first (required for sessions)
    campaignName = `Session Test Campaign ${Date.now()}`;
    await createCampaignViaUI(page, campaignName, 'For session testing');

    // Generate unique session title
    sessionTitle = `Test Session ${Date.now()}`;
  });

  test.afterAll(async ({ playwright }, testInfo) => {
    // Cleanup test user (this will cascade delete campaigns and sessions)
    await cleanupTestUsers(playwright, testInfo, [testUser?.email]);
    testUser = null;
  });

  test('user can create a session without audio', async ({ page }) => {
    await createSessionWithoutAudio(page, sessionTitle, campaignName);

    // Verify we're on the session page
    await expect(page.getByText(sessionTitle).first()).toBeVisible({ timeout: 10000 });
  });

  test('user can view session details', async ({ page }) => {
    await createSessionWithoutAudio(page, sessionTitle, campaignName);

    // Should be on session detail page
    await expect(page.getByText(sessionTitle).first()).toBeVisible();
    await expect(page).toHaveURL(/\/sessions\/[a-z0-9]+/);
  });

  test('user can delete a session', async ({ page }) => {
    await createSessionWithoutAudio(page, sessionTitle, campaignName);

    // The header button is "Delete"; it opens a confirmation modal whose
    // confirm button is "Delete session"
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('button', { name: /delete session/i }).click();

    // Should redirect to campaign page after deletion
    await page.waitForURL(/\/campaigns\//, { timeout: 15000 });

    // Session should not be visible
    await expect(page.getByText(sessionTitle)).not.toBeVisible();
  });

  test('session creation requires valid campaign', async ({ page }) => {
    await page.goto('/sessions/upload');
    await page.waitForLoadState('networkidle');

    await page.getByPlaceholder(/session title/i).fill(sessionTitle);
    // Don't select a campaign

    // Submit button is disabled until a campaign is selected
    await expect(page.getByRole('button', { name: /create session/i })).toBeDisabled();

    // And the campaign select is a required field
    const campaignRequired = await page
      .locator('select')
      .first()
      .getAttribute('required');
    expect(campaignRequired).not.toBeNull();
  });
});
