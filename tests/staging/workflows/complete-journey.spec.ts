import { test, expect } from '@playwright/test';
import {
  loginViaUI,
  cleanupTestUser,
  generateTestUser,
  verifyAuthenticated
} from '../helpers/users';

test.describe('Complete User Journey', () => {
  let testUser: { email: string; password: string } | null = null;
  let campaignName: string;
  let sessionTitle: string;

  test.afterEach(async ({ request }) => {
    // Cleanup test user (this will cascade delete all resources)
    if (testUser?.email) {
      await cleanupTestUser(request, testUser.email);
    }
  });

  test('should complete full workflow: signup → campaigns → sessions → cleanup', async ({ page }) => {
    // ===== STEP 1: Sign Up =====
    console.log('Step 1: Creating new test user...');
    const user = generateTestUser('journey');
    testUser = { email: user.email, password: user.password };
    
    await page.goto('/auth/signup');
    
    await page.getByPlaceholder(/name|full name/i).fill(user.name);
    await page.getByPlaceholder(/email/i).fill(user.email);
    await page.getByPlaceholder(/password/i).first().fill(user.password);
    await page.getByPlaceholder(/confirm|password/i).last().fill(user.password);
    
    await page.getByRole('button', { name: /create|sign up/i }).click();
    
    // Wait for redirect after signup
    await page.waitForURL(/\/(auth\/signin|campaigns|sessions|\/)/, { timeout: 10000 });
    
    // If redirected to signin, login
    if (page.url().includes('/auth/signin')) {
      await loginViaUI(page, user.email, user.password);
    }
    
    // Verify logged in
    const isLoggedIn = await verifyAuthenticated(page);
    expect(isLoggedIn).toBe(true);
    
    console.log('✓ Step 1 Complete: User created and logged in');

    // ===== STEP 2: Create Campaign =====
    console.log('Step 2: Creating campaign...');
    campaignName = `Journey Campaign ${Date.now()}`;
    
    await page.goto('/campaigns');
    await page.waitForLoadState('networkidle');
    
    const createButton = page.getByRole('button', { name: /create campaign|new campaign/i }).first();
    await createButton.click();
    
    await page.getByPlaceholder(/campaign name|name/i).fill(campaignName);
    await page.getByPlaceholder(/description/i).fill('Automated test campaign');
    
    await page.locator('form').getByRole('button', { name: /create|save/i }).click();
    
    await expect(page.getByText(campaignName)).toBeVisible({ timeout: 10000 });
    
    console.log('✓ Step 2 Complete: Campaign created');

    // ===== STEP 3: Create Session =====
    console.log('Step 3: Creating session...');
    sessionTitle = `Journey Session ${Date.now()}`;
    
    await page.goto('/sessions/upload');
    await page.waitForLoadState('networkidle');
    
    await page.getByPlaceholder(/session title|title/i).fill(sessionTitle);
    
    const campaignSelect = page.locator('select').first();
    await campaignSelect.selectOption({ label: campaignName });
    
    const dateInput = page.getByLabel(/date|session date/i).or(page.locator('input[type="date"]'));
    await dateInput.fill(new Date().toISOString().split('T')[0]);
    
    const skipOption = page.getByLabel(/skip|no upload|without audio/i);
    if (await skipOption.isVisible().catch(() => false)) {
      await skipOption.click();
    }
    
    await page.getByRole('button', { name: /create session|submit/i }).click();
    
    await page.waitForURL(/\/sessions\/[a-z0-9]+/, { timeout: 10000 });
    await expect(page.getByText(sessionTitle)).toBeVisible({ timeout: 10000 });
    
    console.log('✓ Step 3 Complete: Session created');

    // ===== STEP 4: Delete Session =====
    console.log('Step 4: Deleting session...');
    
    await page.getByRole('button', { name: /delete.*session/i }).click();
    await page.getByRole('button', { name: /delete session|confirm/i }).last().click();
    
    await page.waitForURL(/\/campaigns\/[a-z0-9]+/, { timeout: 10000 });
    await expect(page.getByText(sessionTitle)).not.toBeVisible();
    
    console.log('✓ Step 4 Complete: Session deleted');

    // ===== STEP 5: Delete Campaign =====
    console.log('Step 5: Deleting campaign...');
    
    await page.goto('/campaigns');
    await page.waitForLoadState('networkidle');
    
    const campaignCard = page.locator('div, article, section')
      .filter({ hasText: campaignName })
      .first();
    
    const deleteButton = campaignCard.getByRole('button', { name: /delete/i });
    await deleteButton.click();
    
    const confirmButton = page.getByRole('button', { name: /delete campaign|confirm/i }).last();
    await confirmButton.click();
    
    await expect(page.getByText(campaignName)).not.toBeVisible({ timeout: 10000 });
    
    console.log('✓ Step 5 Complete: Campaign deleted');

    // ===== VERIFICATION =====
    console.log('Verifying final state...');
    
    // Verify we're still logged in
    const stillLoggedIn = await verifyAuthenticated(page);
    expect(stillLoggedIn).toBe(true);
    
    // Verify test campaign is gone
    await page.reload();
    await expect(page.getByText(campaignName)).not.toBeVisible();
    
    console.log('✅ ALL STEPS COMPLETE: Full workflow test passed!');
  });
});

