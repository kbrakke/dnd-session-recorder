import { test, expect } from '@playwright/test';
import { createTestUser, createUniqueTestUser } from '../../fixtures/users';
import { cleanupTestUsers, createTestUser as dbCreateTestUser } from '../../setup/auth';

test.describe('Login Flow Integration Tests', () => {
  test.beforeAll(async () => {
    await cleanupTestUsers();
  });

  test.afterAll(async () => {
    await cleanupTestUsers();
  });

  test('should successfully login with valid credentials after signup', async ({ page }) => {
    const testUser = createUniqueTestUser('login-flow');

    await page.goto('/auth/signup');
    await expect(page.getByRole('heading', { name: /create your account/i })).toBeVisible();

    await page.getByPlaceholder('Enter your full name').fill(testUser.name);
    await page.getByPlaceholder('Enter your email').fill(testUser.email);
    await page.getByPlaceholder('Enter your password').fill(testUser.password);
    await page.getByPlaceholder('Confirm your password').fill(testUser.password);

    await page.getByRole('button', { name: /create account/i }).click();

    try {
      await page.waitForURL('/', { timeout: 10000 });
      await expect(page).toHaveURL('/');
    } catch (error) {
      const errorElement = page.locator('[data-testid="error-message"], .error, [role="alert"]');
      if (await errorElement.isVisible()) {
        const errorText = await errorElement.textContent();
        throw new Error(`Signup failed with error: ${errorText}`);
      }
      throw error;
    }
  });

  test('should login with existing user credentials', async ({ page }) => {
    const testUser = createUniqueTestUser('existing-login');
    
    await dbCreateTestUser(testUser);

    await page.goto('/auth/signin');
    await expect(page.getByRole('heading', { name: /sign in to your account/i })).toBeVisible();

    await page.getByPlaceholder('Enter your email').fill(testUser.email);
    await page.getByPlaceholder('Enter your password').fill(testUser.password);

    await page.locator('form').getByRole('button', { name: /sign in/i }).click();

    await page.waitForURL('/', { timeout: 10000 });
    await expect(page).toHaveURL('/');
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/auth/signin');

    await page.getByPlaceholder('Enter your email').fill('invalid@example.com');
    await page.getByPlaceholder('Enter your password').fill('wrongpassword');

    await page.locator('form').getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByText(/invalid email or password/i)).toBeVisible();
    await expect(page).toHaveURL('/auth/signin');
  });

  test('should show error for non-existent user', async ({ page }) => {
    const nonExistentUser = createUniqueTestUser('nonexistent');

    await page.goto('/auth/signin');

    await page.getByPlaceholder('Enter your email').fill(nonExistentUser.email);
    await page.getByPlaceholder('Enter your password').fill(nonExistentUser.password);

    await page.locator('form').getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByText(/invalid email or password/i)).toBeVisible();
    await expect(page).toHaveURL('/auth/signin');
  });

  test('should require email field', async ({ page }) => {
    await page.goto('/auth/signin');

    await page.getByPlaceholder('Enter your password').fill('somepassword');
    await page.locator('form').getByRole('button', { name: /sign in/i }).click();

    const emailInput = page.getByPlaceholder('Enter your email');
    await expect(emailInput).toHaveAttribute('required');
    
    const validationMessage = await emailInput.evaluate(el => (el as HTMLInputElement).validationMessage);
    expect(validationMessage).toBeTruthy();
  });

  test('should require password field', async ({ page }) => {
    await page.goto('/auth/signin');

    await page.getByPlaceholder('Enter your email').fill('test@example.com');
    await page.locator('form').getByRole('button', { name: /sign in/i }).click();

    const passwordInput = page.getByPlaceholder('Enter your password');
    await expect(passwordInput).toHaveAttribute('required');
    
    const validationMessage = await passwordInput.evaluate(el => (el as HTMLInputElement).validationMessage);
    expect(validationMessage).toBeTruthy();
  });

  test('should navigate to signup page from signin', async ({ page }) => {
    await page.goto('/auth/signin');
    
    await page.getByRole('link', { name: /create a new account/i }).click();
    
    await expect(page).toHaveURL('/auth/signup');
    await expect(page.getByRole('heading', { name: /create your account/i })).toBeVisible();
  });

  test('should navigate to signin page from signup', async ({ page }) => {
    await page.goto('/auth/signup');
    
    await page.getByRole('link', { name: /already have an account/i }).click();
    
    await expect(page).toHaveURL('/auth/signin');
    await expect(page.getByRole('heading', { name: /sign in to your account/i })).toBeVisible();
  });

  test('should persist login state across page reloads', async ({ page }) => {
    const testUser = createUniqueTestUser('persistent-login');
    await dbCreateTestUser(testUser);

    await page.goto('/auth/signin');
    await page.getByPlaceholder('Enter your email').fill(testUser.email);
    await page.getByPlaceholder('Enter your password').fill(testUser.password);
    await page.locator('form').getByRole('button', { name: /sign in/i }).click();

    await page.waitForURL('/', { timeout: 10000 });

    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL('/');
  });

  test('should handle login with different email cases', async ({ page }) => {
    const testUser = createUniqueTestUser('case-sensitive');
    await dbCreateTestUser(testUser);

    await page.goto('/auth/signin');
    
    await page.getByPlaceholder('Enter your email').fill(testUser.email.toUpperCase());
    await page.getByPlaceholder('Enter your password').fill(testUser.password);
    await page.locator('form').getByRole('button', { name: /sign in/i }).click();

    await page.waitForURL('/', { timeout: 10000 });
    await expect(page).toHaveURL('/');
  });
});