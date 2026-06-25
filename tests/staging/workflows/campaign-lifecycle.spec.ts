import { test, expect } from '@playwright/test';
import {
  createTestUserViaAPI,
  loginViaUI,
  createCampaignViaUI,
  cleanupTestUsers,
  generateTestUser,
  TestUser,
} from '../helpers/users';

test.describe('Campaign Lifecycle', () => {
  // One user shared across the file — registration is rate-limited
  // (10/min/IP), so per-test users would trip 429s. Each test still gets a
  // uniquely named campaign.
  let testUser: TestUser | null = null;
  let campaignName: string;

  test.beforeEach(async ({ page, request }) => {
    if (!testUser) {
      testUser = await createTestUserViaAPI(request, generateTestUser('campaign'));
    }

    // Login
    await loginViaUI(page, testUser.email, testUser.password);

    // Generate unique campaign name
    campaignName = `Test Campaign ${Date.now()}`;
  });

  test.afterAll(async ({ playwright }, testInfo) => {
    // Cleanup test user (this will cascade delete campaigns)
    await cleanupTestUsers(playwright, testInfo, [testUser?.email]);
    testUser = null;
  });

  test('user can create a campaign', async ({ page }) => {
    await createCampaignViaUI(page, campaignName, 'Test campaign description');

    await expect(page.getByText(campaignName)).toBeVisible({ timeout: 10000 });
  });

  test('user can view campaign details', async ({ page }) => {
    await createCampaignViaUI(page, campaignName, 'Test description');

    // Click the campaign card to open it
    await page.getByText(campaignName).click();

    // Should navigate to campaign detail page
    await expect(page).toHaveURL(/\/campaigns\/[a-z0-9]+/);
    await expect(page.getByText(campaignName).first()).toBeVisible();
  });

  test('user can delete a campaign', async ({ page }) => {
    await createCampaignViaUI(page, campaignName, 'Test description');

    // Deletion is confirmed via a native confirm() dialog — accept it
    page.on('dialog', (dialog) => dialog.accept());

    // Innermost div containing both this campaign's heading and a delete
    // button is the campaign card (other tests' campaigns may also be listed)
    const campaignCard = page
      .locator('div')
      .filter({ has: page.getByRole('heading', { name: campaignName }) })
      .filter({ has: page.getByRole('button', { name: /delete/i }) })
      .last();

    await campaignCard.getByRole('button', { name: /delete/i }).click();

    // Campaign should be removed
    await expect(page.getByText(campaignName)).not.toBeVisible({ timeout: 10000 });
  });

  test('campaign creation validates required fields', async ({ page }) => {
    await page.goto('/campaigns');
    await page.waitForLoadState('networkidle');

    await page
      .getByRole('button', { name: /create campaign|new campaign/i })
      .first()
      .click();

    // Try to submit without filling name
    await page
      .locator('form')
      .getByRole('button', { name: /create campaign/i })
      .click();

    // Zod validation should block submission and show an error
    await expect(page.getByText('Campaign name is required')).toBeVisible({ timeout: 5000 });

    // Modal is still open (form did not submit)
    await expect(page.getByLabel('Campaign Name')).toBeVisible();
  });
});
