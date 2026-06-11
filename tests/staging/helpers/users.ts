import { APIRequestContext, Page, expect } from '@playwright/test';

export interface TestUser {
  name: string;
  email: string;
  password: string;
}

/**
 * Create a test user via API (no direct DB access)
 *
 * /api/auth/register is rate-limited to 10/min per IP on staging, so a 429
 * is retried after the server-provided Retry-After delay. The staging suite
 * runs with a single worker, so sleeping here is safe.
 */
export async function createTestUserViaAPI(
  request: APIRequestContext,
  userData: TestUser
): Promise<TestUser> {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await request.post('/api/auth/register', {
      data: userData,
    });

    if (response.status() !== 429) {
      // Accept 200, 201 (success) or 400 (user already exists)
      expect([200, 201, 400]).toContain(response.status());
      return userData;
    }

    const retryAfter = Number(response.headers()['retry-after']) || 30;
    const waitSeconds = Math.min(retryAfter, 65);
    console.warn(
      `Registration rate-limited (attempt ${attempt}/${maxAttempts}), retrying in ${waitSeconds}s`
    );
    await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
  }

  throw new Error(`Registration for ${userData.email} still rate-limited after ${maxAttempts} attempts`);
}

/**
 * Login via UI (sets session cookie)
 *
 * Inputs are selected by label — the TextInput component renders a proper
 * <label htmlFor>, so labels are stable across placeholder/copy changes.
 */
export async function loginViaUI(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  await page.goto('/auth/signin');

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);

  // Form-scoped + exact: the navbar has its own "Sign in" button, and with
  // Google OAuth enabled the form also contains "Sign in with Google" — both
  // would trip strict mode with a looser selector.
  await page
    .locator('form')
    .getByRole('button', { name: 'Sign in', exact: true })
    .click();

  // Successful login redirects to home; wait until we leave /auth/*
  await page.waitForURL((url) => !url.pathname.startsWith('/auth'), {
    timeout: 15000,
  });
}

/**
 * Sign up via UI form. Leaves the user logged in (signup auto-signs-in).
 */
export async function signupViaUI(page: Page, user: TestUser): Promise<void> {
  await page.goto('/auth/signup');

  await page.getByLabel('Full name').fill(user.name);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByLabel('Confirm password').fill(user.password);

  await page.getByRole('button', { name: /create account/i }).click();

  await page.waitForURL((url) => !url.pathname.startsWith('/auth'), {
    timeout: 15000,
  });
}

/**
 * Create a campaign via the modal on /campaigns.
 * Assumes the user is logged in.
 */
export async function createCampaignViaUI(
  page: Page,
  name: string,
  description: string
): Promise<void> {
  await page.goto('/campaigns');
  await page.waitForLoadState('networkidle');

  // Header shows "New Campaign"; the empty state shows "Create Campaign"
  await page
    .getByRole('button', { name: /create campaign|new campaign/i })
    .first()
    .click();

  await page.getByLabel('Campaign Name').fill(name);
  await page.getByLabel('Description').fill(description);

  await page
    .locator('form')
    .getByRole('button', { name: /create campaign/i })
    .click();

  await expect(page.getByText(name)).toBeVisible({ timeout: 10000 });
}

/**
 * Cleanup test user via API endpoint.
 *
 * Requires TEST_CLEANUP_KEY to be set both for the test run and on the
 * deployment (plus ALLOW_TEST_CLEANUP there, since staging runs with
 * NODE_ENV=production). No-ops with a warning when the key is absent.
 */
export async function cleanupTestUser(
  request: APIRequestContext,
  email: string
): Promise<boolean> {
  const cleanupKey = process.env.TEST_CLEANUP_KEY;

  if (!cleanupKey) {
    console.warn('TEST_CLEANUP_KEY not set, skipping cleanup');
    return false;
  }

  try {
    const response = await request.delete('/api/test/cleanup-user', {
      headers: {
        'X-Test-Key': cleanupKey,
        'Content-Type': 'application/json',
      },
      data: { email },
    });

    if (response.status() !== 200) {
      console.warn(
        `Cleanup of ${email} returned ${response.status()}: ${await response
          .text()
          .catch(() => '')}`
      );
    }

    return response.status() === 200;
  } catch (error) {
    console.error('Failed to cleanup test user:', error);
    return false;
  }
}

/**
 * Cleanup users from an afterAll hook, where only worker-scoped fixtures
 * exist. Creates a one-off request context against the project baseURL.
 *
 * Usage:
 *   test.afterAll(async ({ playwright }, testInfo) => {
 *     await cleanupTestUsers(playwright, testInfo, [user1.email, user2.email]);
 *   });
 */
export async function cleanupTestUsers(
  playwright: {
    request: { newContext(options?: { baseURL?: string }): Promise<APIRequestContext> };
  },
  testInfo: { project: { use: { baseURL?: string } } },
  emails: Array<string | undefined>
): Promise<void> {
  if (!process.env.TEST_CLEANUP_KEY) {
    console.warn('TEST_CLEANUP_KEY not set, skipping cleanup');
    return;
  }

  const context = await playwright.request.newContext({
    baseURL: testInfo.project.use.baseURL,
  });
  try {
    for (const email of emails) {
      if (email) {
        await cleanupTestUser(context, email);
      }
    }
  } finally {
    await context.dispose();
  }
}

/**
 * Generate unique test user data
 */
export function generateTestUser(prefix: string = 'test'): TestUser {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);

  return {
    name: `${prefix} User`,
    email: `${prefix}-${timestamp}-${random}@example.com`,
    password: `TestPass123!${timestamp}`,
  };
}

/**
 * Verify user is authenticated by checking for authenticated content
 */
export async function verifyAuthenticated(page: Page): Promise<boolean> {
  const isAuthenticated = await page
    .getByText(/campaigns|sessions|welcome/i)
    .first()
    .isVisible()
    .catch(() => false);

  return isAuthenticated;
}
