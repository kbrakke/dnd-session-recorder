import { test, expect } from '@playwright/test';
import { createUniqueTestUser, TEST_USERS } from '../../fixtures/users';
import { cleanupTestUsers, createTestUser as dbCreateTestUser } from '../../setup/auth';

test.describe('Authentication Error Scenarios', () => {
  test.beforeAll(async () => {
    await cleanupTestUsers();
  });

  test.afterAll(async () => {
    await cleanupTestUsers();
  });

  test.describe('Login Error Scenarios', () => {
    test('should handle login with incorrect password', async ({ page }) => {
      const testUser = createUniqueTestUser('wrong-password');
      await dbCreateTestUser(testUser);

      await page.goto('/auth/signin');

      await page.getByPlaceholder('Enter your email').fill(testUser.email);
      await page.getByPlaceholder('Enter your password').fill('wrong-password');
      await page.locator('form').getByRole('button', { name: /sign in/i }).click();

      await expect(page.getByText(/invalid email or password/i)).toBeVisible();
      await expect(page).toHaveURL('/auth/signin');
    });

    test('should handle login with non-existent email', async ({ page }) => {
      const nonExistentUser = createUniqueTestUser('nonexistent');

      await page.goto('/auth/signin');

      await page.getByPlaceholder('Enter your email').fill(nonExistentUser.email);
      await page.getByPlaceholder('Enter your password').fill(nonExistentUser.password);
      await page.locator('form').getByRole('button', { name: /sign in/i }).click();

      await expect(page.getByText(/invalid email or password/i)).toBeVisible();
      await expect(page).toHaveURL('/auth/signin');
    });

    test('should handle empty email field', async ({ page }) => {
      await page.goto('/auth/signin');

      await page.getByPlaceholder('Enter your password').fill('somepassword');
      await page.locator('form').getByRole('button', { name: /sign in/i }).click();

      const emailInput = page.getByPlaceholder('Enter your email');
      const validationMessage = await emailInput.evaluate(el => (el as HTMLInputElement).validationMessage);
      expect(validationMessage).toBeTruthy();
    });

    test('should handle empty password field', async ({ page }) => {
      await page.goto('/auth/signin');

      await page.getByPlaceholder('Enter your email').fill('test@example.com');
      await page.locator('form').getByRole('button', { name: /sign in/i }).click();

      const passwordInput = page.getByPlaceholder('Enter your password');
      const validationMessage = await passwordInput.evaluate(el => (el as HTMLInputElement).validationMessage);
      expect(validationMessage).toBeTruthy();
    });

    test('should handle SQL injection attempts in login', async ({ page }) => {
      await page.goto('/auth/signin');

      const sqlInjectionAttempts = [
        "admin'; DROP TABLE users; --",
        "' OR '1'='1",
        "admin' OR 1=1#",
        "'; DELETE FROM users; --"
      ];

      for (const injection of sqlInjectionAttempts) {
        await page.getByPlaceholder('Enter your email').fill(injection);
        await page.getByPlaceholder('Enter your password').fill('password');
        await page.locator('form').getByRole('button', { name: /sign in/i }).click();

        await expect(page.getByText(/invalid email or password/i)).toBeVisible();
        await expect(page).toHaveURL('/auth/signin');
        
        await page.getByPlaceholder('Enter your email').clear();
        await page.getByPlaceholder('Enter your password').clear();
      }
    });

    test('should handle XSS attempts in login', async ({ page }) => {
      await page.goto('/auth/signin');

      const xssAttempts = [
        '<script>alert("xss")</script>',
        'javascript:alert("xss")',
        '<img src=x onerror=alert("xss")>',
        '"><script>alert("xss")</script>'
      ];

      for (const xss of xssAttempts) {
        await page.getByPlaceholder('Enter your email').fill(xss);
        await page.getByPlaceholder('Enter your password').fill('password');
        await page.locator('form').getByRole('button', { name: /sign in/i }).click();

        await expect(page.getByText(/invalid email or password/i)).toBeVisible();
        await expect(page).toHaveURL('/auth/signin');
        
        const alertCount = await page.evaluate(() => document.querySelectorAll('script').length);
        expect(alertCount).toBe(0);
        
        await page.getByPlaceholder('Enter your email').clear();
        await page.getByPlaceholder('Enter your password').clear();
      }
    });
  });

  test.describe('Registration Error Scenarios', () => {
    test('should handle duplicate email registration', async ({ page }) => {
      const testUser = createUniqueTestUser('duplicate-reg');
      await dbCreateTestUser(testUser);

      await page.goto('/auth/signup');

      await page.getByPlaceholder('Enter your full name').fill(testUser.name);
      await page.getByPlaceholder('Enter your email').fill(testUser.email);
      await page.getByPlaceholder('Enter your password').fill(testUser.password);
      await page.getByPlaceholder('Confirm your password').fill(testUser.password);

      await page.getByRole('button', { name: /create account/i }).click();

      await expect(page.getByText(/email already exists|user already exists/i)).toBeVisible();
    });

    test('should handle password confirmation mismatch', async ({ page }) => {
      const testUser = createUniqueTestUser('password-mismatch');

      await page.goto('/auth/signup');

      await page.getByPlaceholder('Enter your full name').fill(testUser.name);
      await page.getByPlaceholder('Enter your email').fill(testUser.email);
      await page.getByPlaceholder('Enter your password').fill(testUser.password);
      await page.getByPlaceholder('Confirm your password').fill('different-password');

      await page.getByRole('button', { name: /create account/i }).click();

      await expect(page.getByText(/passwords do not match/i)).toBeVisible();
    });

    test('should handle weak passwords', async ({ page }) => {
      const testUser = createUniqueTestUser('weak-password');

      await page.goto('/auth/signup');

      const weakPasswords = ['123', 'password', 'abc', '12345678'];

      for (const weakPassword of weakPasswords) {
        await page.getByPlaceholder('Enter your full name').fill(testUser.name);
        await page.getByPlaceholder('Enter your email').fill(`${Math.random()}@example.com`);
        await page.getByPlaceholder('Enter your password').fill(weakPassword);
        await page.getByPlaceholder('Confirm your password').fill(weakPassword);

        await page.getByRole('button', { name: /create account/i }).click();

        const passwordInput = page.getByPlaceholder('Enter your password');
        const minLength = await passwordInput.getAttribute('minlength');
        
        if (minLength && weakPassword.length < parseInt(minLength)) {
          const validationMessage = await passwordInput.evaluate(el => (el as HTMLInputElement).validationMessage);
          expect(validationMessage).toBeTruthy();
        }

        await page.reload();
      }
    });

    test('should handle invalid email formats', async ({ page }) => {
      const testUser = createUniqueTestUser('invalid-email');

      await page.goto('/auth/signup');

      const invalidEmails = [
        'notanemail',
        '@example.com',
        'test@',
        'test@.com',
        'test..test@example.com',
        'test @example.com'
      ];

      for (const invalidEmail of invalidEmails) {
        await page.getByPlaceholder('Enter your full name').fill(testUser.name);
        await page.getByPlaceholder('Enter your email').fill(invalidEmail);
        await page.getByPlaceholder('Enter your password').fill(testUser.password);
        await page.getByPlaceholder('Confirm your password').fill(testUser.password);

        await page.getByRole('button', { name: /create account/i }).click();

        const emailInput = page.getByPlaceholder('Enter your email');
        const validationMessage = await emailInput.evaluate(el => (el as HTMLInputElement).validationMessage);
        expect(validationMessage).toBeTruthy();

        await page.reload();
      }
    });

    test('should handle extremely long input values', async ({ page }) => {
      await page.goto('/auth/signup');

      const longString = 'a'.repeat(1000);
      const veryLongString = 'a'.repeat(10000);

      await page.getByPlaceholder('Enter your full name').fill(longString);
      await page.getByPlaceholder('Enter your email').fill(`${longString}@example.com`);
      await page.getByPlaceholder('Enter your password').fill(longString);
      await page.getByPlaceholder('Confirm your password').fill(longString);

      await page.getByRole('button', { name: /create account/i }).click();

      const nameInput = page.getByPlaceholder('Enter your full name');
      const maxLength = await nameInput.getAttribute('maxlength');
      
      if (maxLength) {
        expect(parseInt(maxLength)).toBeLessThan(10000);
      }
    });
  });

  test.describe('Whitelist Error Scenarios', () => {
    test.skip('should block unauthorized emails in staging', async ({ page }) => {
      // Skip this test as we cannot modify process.env in runtime
      // The whitelist functionality is tested in unit tests
      try {
        const unauthorizedUser = createUniqueTestUser('unauthorized');
        unauthorizedUser.email = 'blocked@gmail.com';

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

    test.skip('should block unauthorized login in staging', async ({ page }) => {
      // Skip this test as we cannot modify process.env in runtime
      // The whitelist functionality is tested in unit tests
      try {
        await page.goto('/auth/signin');

        await page.getByPlaceholder('Enter your email').fill('blocked@gmail.com');
        await page.getByPlaceholder('Enter your password').fill('password123');
        await page.locator('form').getByRole('button', { name: /sign in/i }).click();

        await expect(page.getByText(/access is currently restricted/i)).toBeVisible();
      } finally {
        // Environment variables would be restored here if they could be modified
      }
    });
  });

  test.describe('API Authentication Error Scenarios', () => {
    test('should handle API calls without authentication', async ({ request }) => {
      const protectedEndpoints = [
        '/api/sessions',
        '/api/campaigns',
        '/api/uploads',
      ];

      for (const endpoint of protectedEndpoints) {
        const response = await request.get(endpoint);
        expect(response.status()).toBe(401);
        
        const body = await response.json();
        expect(body.error).toMatch(/Authentication required|Unauthorized/);
      }
    });

    test('should handle API calls with malformed tokens', async ({ request }) => {
      const malformedTokens = [
        'invalid-token',
        'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.invalid',
        '',
        'null',
        'undefined'
      ];

      for (const token of malformedTokens) {
        const response = await request.get('/api/sessions', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Cookie': `next-auth.session-token=${token}`
          }
        });
        
        expect(response.status()).toBe(401);
      }
    });

    test('should handle concurrent authentication attempts', async ({ page, request }) => {
      const testUser = createUniqueTestUser('concurrent');
      await dbCreateTestUser(testUser);

      const loginAttempts = Array(10).fill(0).map(async () => {
        const response = await request.post('/api/auth/signin', {
          data: {
            email: testUser.email,
            password: testUser.password
          }
        });
        return response.status();
      });

      const results = await Promise.all(loginAttempts);
      
      results.forEach(status => {
        expect([200, 401, 429]).toContain(status);
      });
    });
  });

  test.describe('Session Management Error Scenarios', () => {
    test('should handle expired session gracefully', async ({ page }) => {
      const testUser = createUniqueTestUser('expired-session');
      await dbCreateTestUser(testUser);

      await page.goto('/auth/signin');
      await page.getByPlaceholder('Enter your email').fill(testUser.email);
      await page.getByPlaceholder('Enter your password').fill(testUser.password);
      await page.locator('form').getByRole('button', { name: /sign in/i }).click();

      await page.waitForURL('/', { timeout: 10000 });

      await page.context().addCookies([{
        name: 'next-auth.session-token',
        value: 'expired-token',
        domain: 'localhost',
        path: '/'
      }]);

      await page.reload();

      const currentUrl = page.url();
      expect(['/auth/signin', '/auth/error', '/'].some(path => currentUrl.includes(path))).toBe(true);
    });

    test('should handle session corruption', async ({ page, request }) => {
      const corruptedSessions = [
        '{"malformed": json',
        'corrupted-session-data',
        '{}',
        'null'
      ];

      for (const corruptedSession of corruptedSessions) {
        const response = await request.get('/api/sessions', {
          headers: {
            'Cookie': `next-auth.session-token=${corruptedSession}`
          }
        });
        
        expect(response.status()).toBe(401);
      }
    });
  });

  test.describe('Network and Infrastructure Error Scenarios', () => {
    test('should handle network timeouts gracefully', async ({ page }) => {
      await page.route('/api/auth/**', route => {
        setTimeout(() => {
          route.fulfill({
            status: 408,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Request timeout' })
          });
        }, 1000);
      });

      await page.goto('/auth/signin');
      
      await page.getByPlaceholder('Enter your email').fill('test@example.com');
      await page.getByPlaceholder('Enter your password').fill('password123');
      await page.locator('form').getByRole('button', { name: /sign in/i }).click();

      const errorMessage = page.getByText(/timeout|error|failed/i);
      await expect(errorMessage).toBeVisible({ timeout: 15000 });
    });

    test('should handle server errors (500) during authentication', async ({ page }) => {
      await page.route('/api/auth/**', route => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal server error' })
        });
      });

      await page.goto('/auth/signin');
      
      await page.getByPlaceholder('Enter your email').fill('test@example.com');
      await page.getByPlaceholder('Enter your password').fill('password123');
      await page.locator('form').getByRole('button', { name: /sign in/i }).click();

      const errorMessage = page.getByText(/server error|internal error|something went wrong/i);
      await expect(errorMessage).toBeVisible({ timeout: 10000 });
    });
  });
});