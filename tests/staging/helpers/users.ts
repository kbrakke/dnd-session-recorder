import { APIRequestContext, Page } from '@playwright/test';

export interface TestUser {
  name: string;
  email: string;
  password: string;
}

/**
 * Create a test user via API (no direct DB access)
 */
export async function createTestUserViaAPI(
  request: APIRequestContext,
  userData: TestUser
): Promise<TestUser> {
  const response = await request.post('/api/auth/register', {
    data: userData,
  });
  
  // Accept 200, 201 (success) or 400 (user already exists)
  expect([200, 201, 400]).toContain(response.status());
  
  return userData;
}

/**
 * Login via UI (sets session cookie)
 */
export async function loginViaUI(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  await page.goto('/auth/signin');
  
  await page.getByPlaceholder(/email/i).fill(email);
  await page.getByPlaceholder(/password/i).fill(password);
  
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  
  // Wait for redirect after login
  await page.waitForURL(/\/(campaigns|sessions|\/)/, { timeout: 10000 });
}

/**
 * Cleanup test user via API endpoint
 * Requires TEST_CLEANUP_KEY environment variable
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
    
    return response.status() === 200;
  } catch (error) {
    console.error('Failed to cleanup test user:', error);
    return false;
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
  const isAuthenticated = await page.getByText(/campaigns|sessions|welcome/i)
    .isVisible()
    .catch(() => false);
  
  return isAuthenticated;
}

