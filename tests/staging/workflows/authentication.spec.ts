import { test, expect } from '@playwright/test';
import { 
  createTestUserViaAPI, 
  loginViaUI, 
  cleanupTestUser, 
  generateTestUser,
  verifyAuthenticated 
} from '../helpers/users';

test.describe('Authentication Workflows', () => {
  const testUsers: Array<{ email: string; password: string }> = [];

  test.afterEach(async ({ request }) => {
    // Cleanup test users after each test
    for (const user of testUsers) {
      await cleanupTestUser(request, user.email);
    }
    testUsers.length = 0;
  });

  test('user can sign up with valid credentials', async ({ page, request }) => {
    const testUser = generateTestUser('signup');
    testUsers.push({ email: testUser.email, password: testUser.password });

    await page.goto('/auth/signup');
    
    // Fill signup form
    await page.getByPlaceholder(/name|full name/i).fill(testUser.name);
    await page.getByPlaceholder(/email/i).fill(testUser.email);
    await page.getByPlaceholder(/password/i).first().fill(testUser.password);
    await page.getByPlaceholder(/confirm|password/i).last().fill(testUser.password);
    
    // Submit form
    await page.getByRole('button', { name: /create|sign up/i }).click();
    
    // Should redirect to home/dashboard after signup
    await page.waitForURL(/\/(campaigns|sessions|\/)/, { timeout: 10000 });
    
    // Verify user is logged in
    const isAuthenticated = await verifyAuthenticated(page);
    expect(isAuthenticated).toBe(true);
  });

  test('user can sign in with existing credentials', async ({ page, request }) => {
    // Create user via API first
    const testUser = generateTestUser('login');
    await createTestUserViaAPI(request, testUser);
    testUsers.push({ email: testUser.email, password: testUser.password });
    
    // Now test login
    await loginViaUI(page, testUser.email, testUser.password);
    
    // Verify logged in
    await expect(page).toHaveURL(/\/(campaigns|sessions|\/)/);
    
    const isAuthenticated = await verifyAuthenticated(page);
    expect(isAuthenticated).toBe(true);
  });

  test('invalid credentials show appropriate error', async ({ page }) => {
    await page.goto('/auth/signin');
    
    await page.getByPlaceholder(/email/i).fill('nonexistent@example.com');
    await page.getByPlaceholder(/password/i).fill('wrongpassword');
    await page.getByRole('button', { name: /sign in/i }).click();
    
    // Should show error message
    await expect(page.getByText(/invalid|incorrect|wrong/i)).toBeVisible({ timeout: 5000 });
    
    // Should remain on sign-in page
    await expect(page).toHaveURL(/\/auth\/signin/);
  });

  test('user session persists across page reloads', async ({ page, request }) => {
    const testUser = generateTestUser('persist');
    await createTestUserViaAPI(request, testUser);
    testUsers.push({ email: testUser.email, password: testUser.password });
    
    // Login
    await loginViaUI(page, testUser.email, testUser.password);
    
    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Should still be authenticated
    await expect(page).toHaveURL(/\/(campaigns|sessions|\/)/);
    
    const isAuthenticated = await verifyAuthenticated(page);
    expect(isAuthenticated).toBe(true);
  });

  test('user can access protected routes after login', async ({ page, request }) => {
    const testUser = generateTestUser('protected');
    await createTestUserViaAPI(request, testUser);
    testUsers.push({ email: testUser.email, password: testUser.password });
    
    await loginViaUI(page, testUser.email, testUser.password);
    
    // Try accessing protected routes
    await page.goto('/campaigns');
    await expect(page).toHaveURL(/\/campaigns/);
    
    await page.goto('/sessions');
    await expect(page).toHaveURL(/\/sessions/);
  });

  test('password mismatch shows error on signup', async ({ page }) => {
    await page.goto('/auth/signup');
    
    const testUser = generateTestUser('mismatch');
    
    await page.getByPlaceholder(/name|full name/i).fill(testUser.name);
    await page.getByPlaceholder(/email/i).fill(testUser.email);
    await page.getByPlaceholder(/password/i).first().fill(testUser.password);
    await page.getByPlaceholder(/confirm|password/i).last().fill('different-password');
    
    await page.getByRole('button', { name: /create|sign up/i }).click();
    
    // Should show password mismatch error
    await expect(page.getByText(/passwords do not match|password mismatch/i)).toBeVisible({ timeout: 5000 });
  });

  test('required fields are validated on signup', async ({ page }) => {
    await page.goto('/auth/signup');
    
    // Try to submit empty form
    await page.getByRole('button', { name: /create|sign up/i }).click();
    
    // Should show validation errors or prevent submission
    const nameInput = page.getByPlaceholder(/name|full name/i);
    const emailInput = page.getByPlaceholder(/email/i);
    const passwordInput = page.getByPlaceholder(/password/i).first();
    
    // Check for required attribute or validation message
    const nameRequired = await nameInput.getAttribute('required').catch(() => null);
    const emailRequired = await emailInput.getAttribute('required').catch(() => null);
    const passwordRequired = await passwordInput.getAttribute('required').catch(() => null);
    
    // At least one should be required
    expect(nameRequired !== null || emailRequired !== null || passwordRequired !== null).toBe(true);
  });
});

