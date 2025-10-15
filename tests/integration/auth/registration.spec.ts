import { test, expect } from '@playwright/test';
import { createUniqueTestUser, TEST_USERS } from '../../fixtures/users';
import { cleanupTestUsers, createTestUser as dbCreateTestUser, getTestUser } from '../../setup/auth';

test.describe('Registration Flow Integration Tests', () => {
  test.beforeAll(async () => {
    await cleanupTestUsers();
  });

  test.afterAll(async () => {
    await cleanupTestUsers();
  });

  test('should successfully register new user and auto-login', async ({ page }) => {
    const testUser = createUniqueTestUser('registration');

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
      
      const dbUser = await getTestUser(testUser.email);
      expect(dbUser).toBeTruthy();
      expect(dbUser?.email).toBe(testUser.email);
    } catch (error) {
      const errorElement = page.locator('[data-testid="error-message"], .error, [role="alert"]');
      if (await errorElement.isVisible()) {
        const errorText = await errorElement.textContent();
        throw new Error(`Registration failed: ${errorText}`);
      }
      throw error;
    }
  });

  test('should show error for duplicate email registration', async ({ page }) => {
    const testUser = createUniqueTestUser('duplicate');
    await dbCreateTestUser(testUser);

    await page.goto('/auth/signup');

    await page.getByPlaceholder('Enter your full name').fill(testUser.name);
    await page.getByPlaceholder('Enter your email').fill(testUser.email);
    await page.getByPlaceholder('Enter your password').fill(testUser.password);
    await page.getByPlaceholder('Confirm your password').fill(testUser.password);

    await page.getByRole('button', { name: /create account/i }).click();

    await expect(page.getByText(/email already exists|user already exists/i)).toBeVisible();
    await expect(page).toHaveURL('/auth/signup');
  });

  test('should show error when passwords do not match', async ({ page }) => {
    const testUser = createUniqueTestUser('password-mismatch');

    await page.goto('/auth/signup');

    await page.getByPlaceholder('Enter your full name').fill(testUser.name);
    await page.getByPlaceholder('Enter your email').fill(testUser.email);
    await page.getByPlaceholder('Enter your password').fill(testUser.password);
    await page.getByPlaceholder('Confirm your password').fill('different-password');

    await page.getByRole('button', { name: /create account/i }).click();

    await expect(page.getByText(/passwords do not match/i)).toBeVisible();
    await expect(page).toHaveURL('/auth/signup');
  });

  test('should validate required fields', async ({ page }) => {
    await page.goto('/auth/signup');

    await page.getByRole('button', { name: /create account/i }).click();

    const nameInput = page.getByPlaceholder('Enter your full name');
    const emailInput = page.getByPlaceholder('Enter your email');
    const passwordInput = page.getByPlaceholder('Enter your password');
    const confirmInput = page.getByPlaceholder('Confirm your password');

    await expect(nameInput).toHaveAttribute('required');
    await expect(emailInput).toHaveAttribute('required');
    await expect(passwordInput).toHaveAttribute('required');
    await expect(confirmInput).toHaveAttribute('required');
  });

  test('should validate email format', async ({ page }) => {
    const testUser = createUniqueTestUser('email-validation');

    await page.goto('/auth/signup');

    await page.getByPlaceholder('Enter your full name').fill(testUser.name);
    await page.getByPlaceholder('Enter your email').fill('invalid-email');
    await page.getByPlaceholder('Enter your password').fill(testUser.password);
    await page.getByPlaceholder('Confirm your password').fill(testUser.password);

    await page.getByRole('button', { name: /create account/i }).click();

    const emailInput = page.getByPlaceholder('Enter your email');
    const validationMessage = await emailInput.evaluate(el => (el as HTMLInputElement).validationMessage);
    expect(validationMessage).toBeTruthy();
  });

  test('should enforce minimum password requirements', async ({ page }) => {
    const testUser = createUniqueTestUser('weak-password');

    await page.goto('/auth/signup');

    await page.getByPlaceholder('Enter your full name').fill(testUser.name);
    await page.getByPlaceholder('Enter your email').fill(testUser.email);
    await page.getByPlaceholder('Enter your password').fill('123');
    await page.getByPlaceholder('Confirm your password').fill('123');

    await page.getByRole('button', { name: /create account/i }).click();

    const passwordInput = page.getByPlaceholder('Enter your password');
    const minLength = await passwordInput.getAttribute('minlength');
    
    if (minLength) {
      const validationMessage = await passwordInput.evaluate(el => (el as HTMLInputElement).validationMessage);
      expect(validationMessage).toBeTruthy();
    }
  });

  test.skip('should handle whitelist validation in staging environment', async ({ page }) => {
    // Skip this test as we cannot modify process.env in runtime
    // The whitelist functionality is tested in unit tests
    try {
      const unauthorizedUser = createUniqueTestUser('unauthorized');
      unauthorizedUser.email = 'unauthorized@gmail.com';

      await page.goto('/auth/signup');

      await page.getByPlaceholder('Enter your full name').fill(unauthorizedUser.name);
      await page.getByPlaceholder('Enter your email').fill(unauthorizedUser.email);
      await page.getByPlaceholder('Enter your password').fill(unauthorizedUser.password);
      await page.getByPlaceholder('Confirm your password').fill(unauthorizedUser.password);

      await page.getByRole('button', { name: /create account/i }).click();

      await expect(page.getByText(/account creation is currently restricted/i)).toBeVisible();
    } finally {
      // Environment variables would be restored here if they could be modified
    }
  });

  test.skip('should allow whitelisted emails in staging environment', async ({ page }) => {
    // Skip this test as we cannot modify process.env in runtime
    // The whitelist functionality is tested in unit tests
    try {
      const whitelistedUser = createUniqueTestUser('whitelisted');
      whitelistedUser.email = TEST_USERS.whitelisted.email;

      await page.goto('/auth/signup');

      await page.getByPlaceholder('Enter your full name').fill(whitelistedUser.name);
      await page.getByPlaceholder('Enter your email').fill(whitelistedUser.email);
      await page.getByPlaceholder('Enter your password').fill(whitelistedUser.password);
      await page.getByPlaceholder('Confirm your password').fill(whitelistedUser.password);

      await page.getByRole('button', { name: /create account/i }).click();

      try {
        await page.waitForURL('/', { timeout: 10000 });
        await expect(page).toHaveURL('/');
      } catch {
        const errorElement = page.locator('[data-testid="error-message"], .error, [role="alert"]');
        if (await errorElement.isVisible()) {
          const errorText = await errorElement.textContent();
          throw new Error(`Whitelisted user registration failed: ${errorText}`);
        }
      }
    } finally {
      // Environment variables would be restored here if they could be modified
    }
  });

  test('should trim whitespace from inputs', async ({ page }) => {
    const testUser = createUniqueTestUser('whitespace');

    await page.goto('/auth/signup');

    await page.getByPlaceholder('Enter your full name').fill(`  ${testUser.name}  `);
    await page.getByPlaceholder('Enter your email').fill(`  ${testUser.email}  `);
    await page.getByPlaceholder('Enter your password').fill(testUser.password);
    await page.getByPlaceholder('Confirm your password').fill(testUser.password);

    await page.getByRole('button', { name: /create account/i }).click();

    try {
      await page.waitForURL('/', { timeout: 10000 });
      const dbUser = await getTestUser(testUser.email);
      expect(dbUser?.email).toBe(testUser.email); // Should be trimmed
    } catch (error) {
      const errorElement = page.locator('[data-testid="error-message"], .error, [role="alert"]');
      if (await errorElement.isVisible()) {
        const errorText = await errorElement.textContent();
        throw new Error(`Whitespace handling failed: ${errorText}`);
      }
      throw error;
    }
  });

  test('should handle special characters in name and email', async ({ page }) => {
    const testUser = createUniqueTestUser('special-chars');
    testUser.name = "Test O'Brien-Smith";
    testUser.email = `test.special+chars@example-domain.co.uk`;

    await page.goto('/auth/signup');

    await page.getByPlaceholder('Enter your full name').fill(testUser.name);
    await page.getByPlaceholder('Enter your email').fill(testUser.email);
    await page.getByPlaceholder('Enter your password').fill(testUser.password);
    await page.getByPlaceholder('Confirm your password').fill(testUser.password);

    await page.getByRole('button', { name: /create account/i }).click();

    try {
      await page.waitForURL('/', { timeout: 10000 });
      const dbUser = await getTestUser(testUser.email);
      expect(dbUser?.name).toBe(testUser.name);
    } catch (error) {
      const errorElement = page.locator('[data-testid="error-message"], .error, [role="alert"]');
      if (await errorElement.isVisible()) {
        const errorText = await errorElement.textContent();
        throw new Error(`Special characters handling failed: ${errorText}`);
      }
      throw error;
    }
  });
});