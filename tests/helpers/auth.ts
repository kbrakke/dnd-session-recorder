import { Page, expect } from '@playwright/test';

export interface TestUser {
  name: string;
  email: string;
  password: string;
}

export class AuthHelper {
  constructor(private page: Page) {}

  /**
   * Create a test user with unique email
   */
  static createTestUser(prefix = 'test'): TestUser {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    
    return {
      name: `Test User ${random}`,
      email: `${prefix}-${timestamp}-${random}@example.com`,
      password: 'TestPassword123!'
    };
  }

  /**
   * Register a new user via the signup form
   */
  async signUp(user: TestUser): Promise<void> {
    await this.page.goto('/auth/signup');
    
    // Fill out signup form
    await this.page.getByPlaceholder('Enter your full name').fill(user.name);
    await this.page.getByPlaceholder('Enter your email').fill(user.email);
    await this.page.getByPlaceholder('Enter your password').fill(user.password);
    await this.page.getByPlaceholder('Confirm your password').fill(user.password);
    
    // Submit form
    await this.page.getByRole('button', { name: /create account/i }).click();
    
    // Wait for successful registration (redirect to home or success message)
    try {
      await this.page.waitForURL('/', { timeout: 15000 });
    } catch {
      // If no redirect, check for success state
      await expect(this.page.locator('[data-testid="signup-success"], .success')).toBeVisible();
    }
  }

  /**
   * Sign in with existing user credentials
   */
  async signIn(user: TestUser): Promise<void> {
    await this.page.goto('/auth/signin');
    
    // Fill in login form
    await this.page.getByPlaceholder('Enter your email').fill(user.email);
    await this.page.getByPlaceholder('Enter your password').fill(user.password);
    
    // Submit form
    await this.page.locator('form').getByRole('button', { name: /sign in/i }).click();
    
    // Wait for successful login
    await this.page.waitForURL('/', { timeout: 15000 });
    
    // Verify we're authenticated
    await this.verifyAuthenticated();
  }

  /**
   * Sign out the current user
   */
  async signOut(): Promise<void> {
    // Look for sign out button/link in navigation
    const signOutSelectors = [
      '[data-testid="sign-out"]',
      'button:has-text("Sign Out")',
      'a:has-text("Sign Out")',
      '[data-testid="user-menu"] button:has-text("Sign Out")'
    ];
    
    for (const selector of signOutSelectors) {
      try {
        const element = this.page.locator(selector);
        if (await element.isVisible()) {
          await element.click();
          break;
        }
      } catch {
        // Continue to next selector
      }
    }
    
    // Wait for redirect to sign in page or home page
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Register user via API (faster for test setup)
   */
  async registerUserApi(user: TestUser): Promise<void> {
    const response = await this.page.request.post('/api/auth/register', {
      data: user
    });
    
    expect([200, 201, 400]).toContain(response.status());
  }

  /**
   * Verify user is authenticated
   */
  async verifyAuthenticated(): Promise<void> {
    // Check for authenticated indicators
    const authIndicators = [
      '[data-testid="user-menu"]',
      '[data-testid="authenticated-nav"]',
      'text="Welcome back"',
      'text="Dashboard"'
    ];
    
    let isAuthenticated = false;
    for (const indicator of authIndicators) {
      try {
        await expect(this.page.locator(indicator)).toBeVisible({ timeout: 2000 });
        isAuthenticated = true;
        break;
      } catch {
        // Continue checking
      }
    }
    
    if (!isAuthenticated) {
      // Check we're not on sign-in page
      const currentUrl = this.page.url();
      expect(currentUrl).not.toContain('/auth/signin');
    }
  }

  /**
   * Verify user is not authenticated
   */
  async verifyNotAuthenticated(): Promise<void> {
    // Should either be on auth pages or see sign-in button
    const currentUrl = this.page.url();
    const isOnAuthPage = currentUrl.includes('/auth/');
    
    if (!isOnAuthPage) {
      // Look for sign-in button
      await expect(
        this.page.locator('a:has-text("Sign In"), button:has-text("Sign In")')
      ).toBeVisible();
    }
  }

  /**
   * Create and authenticate a test user in one step
   */
  async createAndSignIn(prefix = 'test'): Promise<TestUser> {
    const user = AuthHelper.createTestUser(prefix);
    
    // Register via API first (faster)
    await this.registerUserApi(user);
    
    // Then sign in via UI
    await this.signIn(user);
    
    return user;
  }

  /**
   * Ensure we have an authenticated session
   */
  async ensureAuthenticated(): Promise<TestUser> {
    try {
      await this.verifyAuthenticated();
      // Already authenticated, create a dummy user object
      return {
        name: 'Current User',
        email: 'current@example.com',
        password: 'password'
      };
    } catch {
      // Not authenticated, create and sign in
      return await this.createAndSignIn();
    }
  }
}