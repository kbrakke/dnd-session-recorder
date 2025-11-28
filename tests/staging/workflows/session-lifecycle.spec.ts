import { test, expect } from '@playwright/test';
import { 
  createTestUserViaAPI, 
  loginViaUI, 
  cleanupTestUser, 
  generateTestUser 
} from '../helpers/users';

test.describe('Session Lifecycle', () => {
  let testUser: { email: string; password: string } | null = null;
  let campaignName: string;
  let sessionTitle: string;

  test.beforeEach(async ({ page, request }) => {
    // Create test user
    const user = generateTestUser('session');
    await createTestUserViaAPI(request, user);
    testUser = { email: user.email, password: user.password };
    
    // Login
    await loginViaUI(page, user.email, user.password);
    
    // Create a campaign first (required for sessions)
    campaignName = `Session Test Campaign ${Date.now()}`;
    await page.goto('/campaigns');
    await page.waitForLoadState('networkidle');
    
    const createButton = page.getByRole('button', { name: /create campaign/i }).first();
    await createButton.click();
    await page.getByPlaceholder(/campaign name/i).fill(campaignName);
    await page.getByPlaceholder(/description/i).fill('For session testing');
    await page.locator('form').getByRole('button', { name: /create/i }).click();
    await expect(page.getByText(campaignName)).toBeVisible({ timeout: 10000 });
    
    // Generate unique session title
    sessionTitle = `Test Session ${Date.now()}`;
  });

  test.afterEach(async ({ request }) => {
    // Cleanup test user (this will cascade delete campaigns and sessions)
    if (testUser?.email) {
      await cleanupTestUser(request, testUser.email);
    }
  });

  test('user can create a session without audio', async ({ page }) => {
    await page.goto('/sessions/upload');
    await page.waitForLoadState('networkidle');
    
    // Fill session form
    await page.getByPlaceholder(/session title|title/i).fill(sessionTitle);
    
    // Select the campaign we created
    const campaignSelect = page.locator('select').first();
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
  });

  test('user can view session details', async ({ page }) => {
    // First create a session
    await page.goto('/sessions/upload');
    await page.waitForLoadState('networkidle');
    
    await page.getByPlaceholder(/session title/i).fill(sessionTitle);
    await page.locator('select').first().selectOption({ label: campaignName });
    await page.locator('input[type="date"]').fill(new Date().toISOString().split('T')[0]);
    
    const skipOption = page.getByLabel(/skip|no upload/i);
    if (await skipOption.isVisible().catch(() => false)) {
      await skipOption.click();
    }
    
    await page.getByRole('button', { name: /create session/i }).click();
    await page.waitForURL(/\/sessions\/[a-z0-9]+/, { timeout: 10000 });
    
    // Should be on session detail page
    await expect(page.getByText(sessionTitle)).toBeVisible();
    await expect(page).toHaveURL(/\/sessions\/[a-z0-9]+/);
  });

  test('user can delete a session', async ({ page }) => {
    // Create session first
    await page.goto('/sessions/upload');
    await page.waitForLoadState('networkidle');
    
    await page.getByPlaceholder(/session title/i).fill(sessionTitle);
    await page.locator('select').first().selectOption({ label: campaignName });
    await page.locator('input[type="date"]').fill(new Date().toISOString().split('T')[0]);
    
    const skipOption = page.getByLabel(/skip|no upload/i);
    if (await skipOption.isVisible().catch(() => false)) {
      await skipOption.click();
    }
    
    await page.getByRole('button', { name: /create session/i }).click();
    await page.waitForURL(/\/sessions\/[a-z0-9]+/, { timeout: 10000 });
    
    // Delete session
    await page.getByRole('button', { name: /delete.*session/i }).click();
    await page.getByRole('button', { name: /delete session|confirm/i }).last().click();
    
    // Should redirect to campaign page after deletion
    await page.waitForURL(/\/campaigns\//, { timeout: 10000 });
    
    // Session should not be visible
    await expect(page.getByText(sessionTitle)).not.toBeVisible();
  });

  test('session creation requires valid campaign', async ({ page }) => {
    await page.goto('/sessions/upload');
    await page.waitForLoadState('networkidle');
    
    await page.getByPlaceholder(/session title/i).fill(sessionTitle);
    // Don't select a campaign
    
    // Try to submit
    await page.getByRole('button', { name: /create session/i }).click();
    
    // Should show validation error or prevent submission
    const campaignSelect = page.locator('select').first();
    const campaignRequired = await campaignSelect.getAttribute('required').catch(() => null);
    
    // Campaign should be required
    expect(campaignRequired !== null || page.url().includes('/sessions/upload')).toBe(true);
  });
});

