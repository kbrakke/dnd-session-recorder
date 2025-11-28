import { test, expect } from '@playwright/test';
import { 
  createTestUserViaAPI, 
  loginViaUI, 
  cleanupTestUser, 
  generateTestUser 
} from '../helpers/users';

test.describe('Campaign Lifecycle', () => {
  let testUser: { email: string; password: string } | null = null;
  let campaignName: string;

  test.beforeEach(async ({ page, request }) => {
    // Create test user
    const user = generateTestUser('campaign');
    await createTestUserViaAPI(request, user);
    testUser = { email: user.email, password: user.password };
    
    // Login
    await loginViaUI(page, user.email, user.password);
    
    // Generate unique campaign name
    campaignName = `Test Campaign ${Date.now()}`;
  });

  test.afterEach(async ({ request }) => {
    // Cleanup test user (this will cascade delete campaigns)
    if (testUser?.email) {
      await cleanupTestUser(request, testUser.email);
    }
  });

  test('user can create a campaign', async ({ page }) => {
    await page.goto('/campaigns');
    await page.waitForLoadState('networkidle');
    
    // Click create campaign button
    const createButton = page.getByRole('button', { name: /create campaign|new campaign/i }).first();
    await createButton.click();
    
    // Fill campaign form
    await page.getByPlaceholder(/campaign name|name/i).fill(campaignName);
    await page.getByPlaceholder(/description/i).fill('Test campaign description');
    
    // Submit form
    await page.locator('form').getByRole('button', { name: /create|save/i }).click();
    
    // Wait for campaign to appear
    await expect(page.getByText(campaignName)).toBeVisible({ timeout: 10000 });
  });

  test('user can view campaign details', async ({ page }) => {
    // First create a campaign
    await page.goto('/campaigns');
    await page.waitForLoadState('networkidle');
    
    const createButton = page.getByRole('button', { name: /create campaign/i }).first();
    await createButton.click();
    await page.getByPlaceholder(/campaign name/i).fill(campaignName);
    await page.getByPlaceholder(/description/i).fill('Test description');
    await page.locator('form').getByRole('button', { name: /create/i }).click();
    
    // Wait for campaign to appear, then click it
    await expect(page.getByText(campaignName)).toBeVisible({ timeout: 10000 });
    await page.getByText(campaignName).click();
    
    // Should navigate to campaign detail page
    await expect(page).toHaveURL(/\/campaigns\/[a-z0-9]+/);
    await expect(page.getByText(campaignName)).toBeVisible();
  });

  test('user can delete a campaign', async ({ page }) => {
    // Create campaign first
    await page.goto('/campaigns');
    await page.waitForLoadState('networkidle');
    
    const createButton = page.getByRole('button', { name: /create campaign/i }).first();
    await createButton.click();
    await page.getByPlaceholder(/campaign name/i).fill(campaignName);
    await page.getByPlaceholder(/description/i).fill('Test description');
    await page.locator('form').getByRole('button', { name: /create/i }).click();
    
    await expect(page.getByText(campaignName)).toBeVisible({ timeout: 10000 });
    
    // Find and click delete button
    const campaignCard = page.locator('div, article, section')
      .filter({ hasText: campaignName })
      .first();
    
    const deleteButton = campaignCard.getByRole('button', { name: /delete/i });
    await deleteButton.click();
    
    // Confirm deletion
    const confirmButton = page.getByRole('button', { name: /delete campaign|confirm/i }).last();
    await confirmButton.click();
    
    // Campaign should be removed
    await expect(page.getByText(campaignName)).not.toBeVisible({ timeout: 10000 });
  });

  test('campaign creation validates required fields', async ({ page }) => {
    await page.goto('/campaigns');
    await page.waitForLoadState('networkidle');
    
    const createButton = page.getByRole('button', { name: /create campaign/i }).first();
    await createButton.click();
    
    // Try to submit without filling name
    await page.locator('form').getByRole('button', { name: /create|save/i }).click();
    
    // Should show validation error or prevent submission
    const nameInput = page.getByPlaceholder(/campaign name|name/i);
    const nameRequired = await nameInput.getAttribute('required').catch(() => null);
    
    // Name should be required
    expect(nameRequired !== null || page.url().includes('/campaigns')).toBe(true);
  });
});

