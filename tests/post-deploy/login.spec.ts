import { test, expect } from '@playwright/test';

test.describe('Login Flow', () => {
  // Use timestamp to ensure unique emails for each test run
  const timestamp = Date.now();
  const testUser = {
    name: 'Test User',
    email: `test-${timestamp}@example.com`,
    password: 'testPassword123'
  };

  test('should display login page and create new user then login', async ({ page }) => {
    // Navigate to the homepage
    await page.goto('/');

    // Should redirect to login or show login button - let's navigate to signin
    await page.goto('/auth/signin');

    // Verify we're on the sign in page
    await expect(page.getByRole('heading', { name: /sign in to your account/i })).toBeVisible();

    // Verify the login form elements are present
    await expect(page.getByPlaceholder('Enter your email')).toBeVisible();
    await expect(page.getByPlaceholder('Enter your password')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();

    // Navigate to signup page by clicking the signup link
    await page.getByRole('link', { name: /create a new account/i }).click();

    // Verify we're on the signup page
    await expect(page.getByRole('heading', { name: /create your account/i })).toBeVisible();

    // Fill out the signup form
    await page.getByPlaceholder('Enter your full name').fill(testUser.name);
    await page.getByPlaceholder('Enter your email').fill(testUser.email);
    await page.getByPlaceholder('Enter your password').fill(testUser.password);
    await page.getByPlaceholder('Confirm your password').fill(testUser.password);

    // Submit the signup form
    await page.getByRole('button', { name: /create account/i }).click();

    // Wait for redirect after successful signup/login
    // The signup page auto-signs in, so we should be redirected to home
    // Add more flexible waiting and error checking
    try {
      await page.waitForURL('/', { timeout: 10000 });
    } catch (error) {
      // If redirect doesn't happen, check for error messages
      const errorElement = page.locator('[data-testid="error-message"], .error, [role="alert"]');
      if (await errorElement.isVisible()) {
        const errorText = await errorElement.textContent();
        throw new Error(`Signup failed with error: ${errorText}`);
      }
      // If no error visible, re-throw the original timeout error
      throw error;
    }

    // Verify we're now logged in (should be on dashboard)
    // The homepage loads the Dashboard component, so we should see dashboard content
    await expect(page).toHaveURL('/');
  });

  test('should login with existing user credentials', async ({ page }) => {
    // First, create a user by making a direct API call
    const response = await page.request.post('/api/auth/register', {
      data: testUser
    });
    
    // If user already exists, that's fine for this test
    expect([200, 201, 400]).toContain(response.status());

    // Navigate to signin page
    await page.goto('/auth/signin');

    // Verify we're on the sign in page
    await expect(page.getByRole('heading', { name: /sign in to your account/i })).toBeVisible();

    // Fill in login credentials
    await page.getByPlaceholder('Enter your email').fill(testUser.email);
    await page.getByPlaceholder('Enter your password').fill(testUser.password);

    // Submit the login form - use form context to avoid navbar button
    await page.locator('form').getByRole('button', { name: /sign in/i }).click();

    // Wait for redirect after successful login
    await page.waitForURL('/', { timeout: 10000 });

    // Verify we're logged in by checking we're on the dashboard
    await expect(page).toHaveURL('/');
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/auth/signin');

    // Try to login with invalid credentials
    await page.getByPlaceholder('Enter your email').fill('invalid@example.com');
    await page.getByPlaceholder('Enter your password').fill('wrongpassword');

    await page.locator('form').getByRole('button', { name: /sign in/i }).click();

    // Should show error message
    await expect(page.getByText(/invalid email or password/i)).toBeVisible();

    // Should still be on signin page
    await expect(page).toHaveURL('/auth/signin');
  });

  test('should validate required fields on signup', async ({ page }) => {
    await page.goto('/auth/signup');

    // Try to submit empty form
    await page.getByRole('button', { name: /create account/i }).click();

    // Should show HTML5 validation errors (required fields)
    const nameInput = page.getByPlaceholder('Enter your full name');
    const emailInput = page.getByPlaceholder('Enter your email');
    const passwordInput = page.getByPlaceholder('Enter your password');

    await expect(nameInput).toHaveAttribute('required');
    await expect(emailInput).toHaveAttribute('required');
    await expect(passwordInput).toHaveAttribute('required');
  });

  test('should show error when passwords do not match', async ({ page }) => {
    await page.goto('/auth/signup');

    // Fill form with mismatched passwords
    await page.getByPlaceholder('Enter your full name').fill('Test User');
    await page.getByPlaceholder('Enter your email').fill('test2@example.com');
    await page.getByPlaceholder('Enter your password').fill('password123');
    await page.getByPlaceholder('Confirm your password').fill('differentpassword');

    await page.getByRole('button', { name: /create account/i }).click();

    // Should show password mismatch error
    await expect(page.getByText(/passwords do not match/i)).toBeVisible();
  });
});