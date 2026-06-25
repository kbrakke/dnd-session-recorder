import { test, expect } from '@playwright/test';
import {
  createTestUserViaAPI,
  loginViaUI,
  signupViaUI,
  cleanupTestUsers,
  generateTestUser,
  verifyAuthenticated,
  TestUser,
} from '../helpers/users';

test.describe('Authentication Workflows', () => {
  // Shared user for the signin-based tests — registration is rate-limited
  // (10/min/IP), so per-test users would trip 429s. The signup test still
  // registers its own fresh user, since that's what it exercises.
  let sharedUser: TestUser | null = null;
  let signupUser: TestUser | null = null;

  async function getSharedUser(request: Parameters<typeof createTestUserViaAPI>[0]) {
    if (!sharedUser) {
      sharedUser = await createTestUserViaAPI(request, generateTestUser('auth'));
    }
    return sharedUser;
  }

  test.afterAll(async ({ playwright }, testInfo) => {
    await cleanupTestUsers(playwright, testInfo, [sharedUser?.email, signupUser?.email]);
    sharedUser = null;
    signupUser = null;
  });

  test('user can sign up with valid credentials', async ({ page }) => {
    signupUser = generateTestUser('signup');

    await signupViaUI(page, signupUser);

    // Verify user is logged in
    const isAuthenticated = await verifyAuthenticated(page);
    expect(isAuthenticated).toBe(true);
  });

  test('user can sign in with existing credentials', async ({ page, request }) => {
    const user = await getSharedUser(request);

    await loginViaUI(page, user.email, user.password);

    // Verify logged in
    expect(new URL(page.url()).pathname.startsWith('/auth')).toBe(false);

    const isAuthenticated = await verifyAuthenticated(page);
    expect(isAuthenticated).toBe(true);
  });

  test('invalid credentials show appropriate error', async ({ page }) => {
    await page.goto('/auth/signin');

    await page.getByLabel('Email').fill('nonexistent@example.com');
    await page.getByLabel('Password', { exact: true }).fill('wrongpassword');
    await page
      .locator('form')
      .getByRole('button', { name: 'Sign in', exact: true })
      .click();

    // Should show error message
    await expect(page.getByText(/invalid|incorrect|wrong/i)).toBeVisible({ timeout: 10000 });

    // Should remain on sign-in page
    await expect(page).toHaveURL(/\/auth\/signin/);
  });

  test('user session persists across page reloads', async ({ page, request }) => {
    const user = await getSharedUser(request);

    await loginViaUI(page, user.email, user.password);

    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Should still be authenticated (not bounced back to signin)
    expect(new URL(page.url()).pathname.startsWith('/auth')).toBe(false);

    const isAuthenticated = await verifyAuthenticated(page);
    expect(isAuthenticated).toBe(true);
  });

  test('user can access protected routes after login', async ({ page, request }) => {
    const user = await getSharedUser(request);

    await loginViaUI(page, user.email, user.password);

    // Try accessing protected routes
    await page.goto('/campaigns');
    await expect(page).toHaveURL(/\/campaigns/);

    await page.goto('/sessions');
    await expect(page).toHaveURL(/\/sessions/);
  });

  test('password mismatch shows error on signup', async ({ page }) => {
    await page.goto('/auth/signup');

    const testUser = generateTestUser('mismatch');

    await page.getByLabel('Full name').fill(testUser.name);
    await page.getByLabel('Email').fill(testUser.email);
    await page.getByLabel('Password', { exact: true }).fill(testUser.password);
    await page.getByLabel('Confirm password').fill('different-password');

    await page.getByRole('button', { name: /create account/i }).click();

    // Should show password mismatch error (zod refine message); nothing is
    // submitted, so no user is created
    await expect(page.getByText(/passwords do not match/i)).toBeVisible({ timeout: 5000 });

    // Should remain on signup page
    await expect(page).toHaveURL(/\/auth\/signup/);
  });

  test('required fields are validated on signup', async ({ page }) => {
    await page.goto('/auth/signup');

    // Try to submit empty form. The form uses react-hook-form + zod, so
    // validation surfaces as error messages, not native required attributes.
    await page.getByRole('button', { name: /create account/i }).click();

    await expect(page.getByText('Full name is required')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Email is required')).toBeVisible();
    await expect(page.getByText(/password must be at least 8 characters/i)).toBeVisible();

    // Submission was blocked
    await expect(page).toHaveURL(/\/auth\/signup/);
  });
});
