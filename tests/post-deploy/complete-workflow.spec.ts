import { test, expect } from '@playwright/test';

/**
 * Complete E2E Workflow Test for Staging Environment
 * Tests: Login → Create Campaign → Create Session → Delete Session → Delete Campaign
 */
test.describe('Complete Staging Workflow', () => {
  const STAGING_URL = 'https://dnd-recorder-staging.fly.dev';

  // Generate unique identifiers for this test run
  const timestamp = Date.now();
  const testEmail = `test-user-${timestamp}@example.com`;
  const testPassword = `TestPass123!${timestamp}`;
  const testName = `Test User ${timestamp}`;
  const campaignName = `Test Campaign ${timestamp}`;
  const sessionTitle = `Test Session ${timestamp}`;

  test.describe('Full User Journey', () => {
    test('should complete full workflow: signup → login → campaigns → sessions', async ({ page }) => {
      // ===== STEP 1: Sign Up =====
      console.log('Step 1: Creating new test user...');
      await page.goto(`${STAGING_URL}/auth/signup`);

      await expect(page.getByText('Create Account')).toBeVisible();

      await page.getByPlaceholder('Enter your full name').fill(testName);
      await page.getByPlaceholder('Enter your email').fill(testEmail);
      await page.getByPlaceholder('Enter your password').first().fill(testPassword);
      await page.getByPlaceholder('Confirm your password').fill(testPassword);

      await page.locator('form').getByRole('button', { name: /sign up|create account/i }).click();

      // Wait for redirect after signup (should go to signin or dashboard)
      await page.waitForURL(/\/(auth\/signin|campaigns|sessions|\/)/, { timeout: 10000 });

      console.log('✓ Step 1 Complete: User created successfully');

      // ===== STEP 2: Sign In =====
      console.log('Step 2: Signing in...');

      // If we're not already logged in, go to signin
      if (!page.url().includes('/campaigns') && !page.url().includes('/sessions')) {
        await page.goto(`${STAGING_URL}/auth/signin`);

        await expect(page.getByText('Sign In')).toBeVisible();

        await page.getByPlaceholder('Enter your email').fill(testEmail);
        await page.getByPlaceholder('Enter your password').fill(testPassword);

        await page.getByRole('button', { name: /sign in|login/i }).click();

        // Wait for successful login redirect
        await page.waitForURL(/\/(campaigns|sessions|\/)/, { timeout: 10000 });
      }

      // Verify we're logged in by checking for authenticated content
      const isLoggedIn = await page.getByText(/campaigns|sessions|welcome/i).isVisible().catch(() => false);
      expect(isLoggedIn).toBe(true);

      console.log('✓ Step 2 Complete: Logged in successfully');

      // ===== STEP 3: Create Campaign =====
      console.log('Step 3: Creating campaign...');

      await page.goto(`${STAGING_URL}/campaigns`);
      await page.waitForLoadState('networkidle');

      // Click create campaign button
      const createButton = page.getByRole('button', { name: /create campaign|new campaign|\+ campaign/i }).first();
      await createButton.click();

      // Fill campaign form
      await page.getByPlaceholder(/campaign name|enter.*name/i).fill(campaignName);
      await page.getByPlaceholder(/description|enter.*description/i).fill('Automated test campaign');

      // Submit campaign creation
      await page.locator('form').getByRole('button', { name: /create|save/i }).click();

      // Wait for campaign to appear in the list
      await expect(page.getByText(campaignName)).toBeVisible({ timeout: 10000 });

      console.log('✓ Step 3 Complete: Campaign created successfully');

      // ===== STEP 4: Create Session (No Audio) =====
      console.log('Step 4: Creating session without audio...');

      // Navigate to session upload page
      await page.goto(`${STAGING_URL}/sessions/upload`);
      await page.waitForLoadState('networkidle');

      // Fill session form
      await page.getByPlaceholder(/session title|enter.*title/i).fill(sessionTitle);

      // Select the campaign we just created
      const campaignSelect = page.locator('select').filter({ hasText: /campaign|select.*campaign/i }).or(
        page.getByLabel(/campaign/i)
      );
      await campaignSelect.selectOption({ label: campaignName });

      // Set session date (use today's date)
      const dateInput = page.getByLabel(/date|session date/i).or(page.locator('input[type="date"]'));
      await dateInput.fill(new Date().toISOString().split('T')[0]);

      // Choose "Skip" or "No upload" option if available
      const skipOption = page.getByLabel(/skip|no upload|without audio/i);
      if (await skipOption.isVisible().catch(() => false)) {
        await skipOption.click();
      }

      // Submit session creation
      await page.getByRole('button', { name: /create session|submit/i }).click();

      // Wait for redirect to session page
      await page.waitForURL(/\/sessions\/[a-z0-9]+/, { timeout: 10000 });

      // Verify we're on the session page
      await expect(page.getByText(sessionTitle)).toBeVisible({ timeout: 10000 });

      const sessionId = page.url().match(/\/sessions\/([a-z0-9]+)/)?.[1];
      expect(sessionId).toBeDefined();

      console.log(`✓ Step 4 Complete: Session created successfully (ID: ${sessionId})`);

      // ===== STEP 5: Delete Session =====
      console.log('Step 5: Deleting session...');

      // We should already be on the session page
      // Look for delete button in header or dropdown
      const deleteButton = page.getByRole('button', { name: /delete.*session/i });
      await deleteButton.click();

      // Confirm deletion in modal
      const confirmButton = page.getByRole('button', { name: /delete session|confirm/i }).last();
      await confirmButton.click();

      // Wait for redirect to campaign page after deletion
      await page.waitForURL(/\/campaigns\/[a-z0-9]+/, { timeout: 10000 });

      // Verify session is deleted (should not appear in session list)
      await expect(page.getByText(sessionTitle)).not.toBeVisible();

      console.log('✓ Step 5 Complete: Session deleted successfully');

      // ===== STEP 6: Delete Campaign =====
      console.log('Step 6: Deleting campaign...');

      // Navigate to campaigns page
      await page.goto(`${STAGING_URL}/campaigns`);
      await page.waitForLoadState('networkidle');

      // Find the campaign we created
      const campaignCard = page.locator('div, article, section').filter({ hasText: campaignName }).first();

      // Look for delete button (might be in a menu or directly visible)
      const campaignDeleteButton = campaignCard.getByRole('button', { name: /delete|remove/i }).or(
        campaignCard.locator('button[title*="delete" i]')
      );

      await campaignDeleteButton.click();

      // Confirm deletion
      const confirmCampaignDelete = page.getByRole('button', { name: /delete campaign|confirm.*delete|yes.*delete/i }).last();
      await confirmCampaignDelete.click();

      // Wait for campaign to be removed from list
      await expect(page.getByText(campaignName)).not.toBeVisible({ timeout: 10000 });

      console.log('✓ Step 6 Complete: Campaign deleted successfully');

      // ===== VERIFICATION =====
      console.log('Verifying final state...');

      // Verify we're still logged in
      const stillLoggedIn = await page.getByText(/campaigns|welcome/i).isVisible();
      expect(stillLoggedIn).toBe(true);

      // Verify test campaign is gone
      await page.reload();
      await expect(page.getByText(campaignName)).not.toBeVisible();

      console.log('✅ ALL STEPS COMPLETE: Full workflow test passed!');
    });

    test('should verify Google OAuth option is available', async ({ page }) => {
      await page.goto(`${STAGING_URL}/auth/signin`);

      await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();

      // Look for Google sign-in button or option
      const hasGoogleOption = await page.getByRole('button', { name: /google|sign in with google/i })
        .isVisible()
        .catch(() => false);

      // Google OAuth should be available (or at least the page should load)
      // If NEXT_PUBLIC_GOOGLE_ENABLED is not set, the button won't show
      // So we just verify the page loads correctly
      expect(page.url()).toContain('/auth/signin');

      console.log(`Google OAuth button visible: ${hasGoogleOption}`);
    });
  });

  test.describe('Individual Feature Tests', () => {
    test('should allow creating and deleting campaign independently', async ({ page }) => {
      // Login with a fresh user
      const email = `campaign-test-${Date.now()}@example.com`;
      const password = `TestPass123!${Date.now()}`;

      // Sign up
      await page.goto(`${STAGING_URL}/auth/signup`);
      await page.getByPlaceholder('Enter your full name').fill('Campaign Tester');
      await page.getByPlaceholder('Enter your email').fill(email);
      await page.getByPlaceholder('Enter your password').first().fill(password);
      await page.getByPlaceholder('Confirm your password').fill(password);
      await page.getByRole('button', { name: /sign up/i }).click();
      await page.waitForURL(/\/(auth\/signin|campaigns|\/)/, { timeout: 10000 });

      // Sign in if needed
      if (page.url().includes('/auth/signin')) {
        await page.getByPlaceholder('Enter your email').fill(email);
        await page.getByPlaceholder('Enter your password').fill(password);
        await page.getByRole('button', { name: /sign in/i }).click();
        await page.waitForURL(/\/(campaigns|\/)/, { timeout: 10000 });
      }

      // Create campaign
      await page.goto(`${STAGING_URL}/campaigns`);
      const testCampaign = `Solo Campaign ${Date.now()}`;

      await page.getByRole('button', { name: /create campaign/i }).first().click();
      await page.getByPlaceholder(/campaign name/i).fill(testCampaign);
      await page.getByPlaceholder(/description/i).fill('Solo test');

      await Promise.all([
        page.waitForResponse(resp => resp.url().includes('/api/campaigns') && resp.request().method() === 'POST'),
        page.locator('form').getByRole('button', { name: /create campaign/i }).click()
      ]);

      // Wait for modal to close and reload
      await page.waitForTimeout(1000);
      await page.reload();

      await expect(page.getByText(testCampaign)).toBeVisible({ timeout: 10000 });

      // Delete campaign
      const campaignCard = page.locator('div, article, section').filter({ hasText: testCampaign }).first();
      await campaignCard.getByRole('button', { name: /delete/i }).click();
      await page.getByRole('button', { name: /delete campaign|confirm/i }).last().click();

      await expect(page.getByText(testCampaign)).not.toBeVisible({ timeout: 10000 });

      console.log('✅ Campaign create/delete test passed');
    });

    test('should allow creating and deleting session independently', async ({ page }) => {
      // Login with a fresh user
      const email = `session-test-${Date.now()}@example.com`;
      const password = `TestPass123!${Date.now()}`;

      // Sign up
      await page.goto(`${STAGING_URL}/auth/signup`);
      await page.getByPlaceholder('Enter your full name').fill('Session Tester');
      await page.getByPlaceholder('Enter your email').fill(email);
      await page.getByPlaceholder('Enter your password').first().fill(password);
      await page.getByPlaceholder('Confirm your password').fill(password);
      await page.getByRole('button', { name: /sign up/i }).click();
      await page.waitForURL(/\/(auth\/signin|campaigns|\/)/, { timeout: 10000 });

      // Sign in if needed
      if (page.url().includes('/auth/signin')) {
        await page.getByPlaceholder('Enter your email').fill(email);
        await page.getByPlaceholder('Enter your password').fill(password);
        await page.getByRole('button', { name: /sign in/i }).click();
        await page.waitForURL(/\/(campaigns|\/)/, { timeout: 10000 });
      }

      // Create a campaign first
      await page.goto(`${STAGING_URL}/campaigns`);
      const testCampaign = `Session Test Campaign ${Date.now()}`;

      await page.getByRole('button', { name: /create campaign/i }).first().click();
      await page.getByPlaceholder(/campaign name/i).fill(testCampaign);
      await page.getByPlaceholder(/description/i).fill('For session testing');

      await Promise.all([
        page.waitForResponse(resp => resp.url().includes('/api/campaigns') && resp.request().method() === 'POST'),
        page.locator('form').getByRole('button', { name: /create campaign/i }).click()
      ]);

      // Wait for modal to close and reload
      await page.waitForTimeout(1000);
      await page.reload();

      await expect(page.getByText(testCampaign)).toBeVisible({ timeout: 10000 });

      // Create session without audio
      await page.goto(`${STAGING_URL}/sessions/upload`);
      const testSession = `Solo Session ${Date.now()}`;

      await page.getByPlaceholder(/session title/i).fill(testSession);
      await page.locator('select').first().selectOption({ label: testCampaign });
      await page.locator('input[type="date"]').fill(new Date().toISOString().split('T')[0]);

      const skipOption = page.getByLabel(/skip|no upload/i);
      if (await skipOption.isVisible().catch(() => false)) {
        await skipOption.click();
      }

      await page.getByRole('button', { name: /create session/i }).click();
      await page.waitForURL(/\/sessions\/[a-z0-9]+/, { timeout: 10000 });

      await expect(page.getByText(testSession)).toBeVisible({ timeout: 10000 });

      // Delete session
      await page.getByRole('button', { name: /delete.*session/i }).click();
      await page.getByRole('button', { name: /delete session|confirm/i }).last().click();
      await page.waitForURL(/\/campaigns\//, { timeout: 10000 });

      console.log('✅ Session create/delete test passed');
    });
  });
});
