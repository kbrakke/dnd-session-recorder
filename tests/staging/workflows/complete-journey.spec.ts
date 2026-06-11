import { test, expect } from '@playwright/test';
import {
  signupViaUI,
  createCampaignViaUI,
  cleanupTestUsers,
  generateTestUser,
  verifyAuthenticated,
} from '../helpers/users';

test.describe('Complete User Journey', () => {
  let testUser: { email: string; password: string } | null = null;
  let campaignName: string;
  let sessionTitle: string;

  test.afterAll(async ({ playwright }, testInfo) => {
    // Cleanup test user (this will cascade delete all resources)
    await cleanupTestUsers(playwright, testInfo, [testUser?.email]);
    testUser = null;
  });

  test('should complete full workflow: signup → campaigns → sessions → cleanup', async ({ page }) => {
    // ===== STEP 1: Sign Up =====
    console.log('Step 1: Creating new test user...');
    const user = generateTestUser('journey');
    testUser = { email: user.email, password: user.password };

    await signupViaUI(page, user);

    // Verify logged in
    const isLoggedIn = await verifyAuthenticated(page);
    expect(isLoggedIn).toBe(true);

    console.log('✓ Step 1 Complete: User created and logged in');

    // ===== STEP 2: Create Campaign =====
    console.log('Step 2: Creating campaign...');
    campaignName = `Journey Campaign ${Date.now()}`;

    await createCampaignViaUI(page, campaignName, 'Automated test campaign');

    console.log('✓ Step 2 Complete: Campaign created');

    // ===== STEP 3: Create Session =====
    console.log('Step 3: Creating session...');
    sessionTitle = `Journey Session ${Date.now()}`;

    await page.goto('/sessions/upload');
    await page.waitForLoadState('networkidle');

    await page.getByPlaceholder(/session title/i).fill(sessionTitle);
    await page.locator('select').first().selectOption({ label: campaignName });
    await page.locator('input[type="date"]').fill(new Date().toISOString().split('T')[0]);
    await page.getByRole('button', { name: 'Skip Audio' }).click();

    await page.getByRole('button', { name: /create session/i }).click();

    await page.waitForURL(/\/sessions\/[a-z0-9]+/, { timeout: 15000 });
    await expect(page.getByText(sessionTitle).first()).toBeVisible({ timeout: 10000 });

    console.log('✓ Step 3 Complete: Session created');

    // ===== STEP 4: Delete Session =====
    console.log('Step 4: Deleting session...');

    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('button', { name: /delete session/i }).click();

    await page.waitForURL(/\/campaigns\/[a-z0-9]+/, { timeout: 15000 });
    await expect(page.getByText(sessionTitle)).not.toBeVisible();

    console.log('✓ Step 4 Complete: Session deleted');

    // ===== STEP 5: Delete Campaign =====
    console.log('Step 5: Deleting campaign...');

    await page.goto('/campaigns');
    await page.waitForLoadState('networkidle');

    // Campaign deletion is confirmed via a native confirm() dialog
    page.on('dialog', (dialog) => dialog.accept());

    // This user owns exactly one campaign, so one Delete button exists
    await page.getByRole('button', { name: /delete/i }).click();

    await expect(page.getByText(campaignName)).not.toBeVisible({ timeout: 10000 });

    console.log('✓ Step 5 Complete: Campaign deleted');

    // ===== VERIFICATION =====
    console.log('Verifying final state...');

    // Verify we're still logged in
    const stillLoggedIn = await verifyAuthenticated(page);
    expect(stillLoggedIn).toBe(true);

    // Verify test campaign is gone
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(campaignName)).not.toBeVisible();

    console.log('✅ ALL STEPS COMPLETE: Full workflow test passed!');
  });
});
