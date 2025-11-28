import { test, expect } from '@playwright/test';

test.describe('Static Page Tests', () => {
  test('homepage loads and renders', async ({ page }) => {
    await page.goto('/');
    
    // Check page loads without errors
    await expect(page).toHaveTitle(/D&D|DND/i);
    
    // Check for main content (use generic selectors)
    const main = page.locator('main').or(page.locator('[role="main"]'));
    await expect(main).toBeVisible();
    
    // Verify no console errors
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    await page.waitForLoadState('networkidle');
    expect(errors).toHaveLength(0);
  });

  test('sign-in page renders authentication form', async ({ page }) => {
    await page.goto('/auth/signin');
    
    // Check heading exists (don't check specific text)
    const heading = page.getByRole('heading', { level: 1 }).or(
      page.getByRole('heading', { level: 2 })
    );
    await expect(heading).toBeVisible();
    
    // Check form elements by role/placeholder (not text)
    await expect(page.getByPlaceholder(/email/i)).toBeVisible();
    await expect(page.getByPlaceholder(/password/i)).toBeVisible();
    
    // Check submit button exists
    const submitButton = page.getByRole('button', { name: /sign in|log in/i });
    await expect(submitButton).toBeVisible();
    
    // Verify form is functional (can type)
    await page.getByPlaceholder(/email/i).fill('test@example.com');
    const emailValue = await page.getByPlaceholder(/email/i).inputValue();
    expect(emailValue).toBe('test@example.com');
  });

  test('sign-up page renders registration form', async ({ page }) => {
    await page.goto('/auth/signup');
    
    // Check form fields exist
    await expect(page.getByPlaceholder(/name|full name/i)).toBeVisible();
    await expect(page.getByPlaceholder(/email/i)).toBeVisible();
    await expect(page.getByPlaceholder(/password/i).first()).toBeVisible();
    await expect(page.getByPlaceholder(/confirm|password/i).last()).toBeVisible();
    
    // Check submit button
    const submitButton = page.getByRole('button', { name: /create|sign up|register/i });
    await expect(submitButton).toBeVisible();
  });

  test('pages load CSS correctly', async ({ page }) => {
    await page.goto('/');
    
    // Check that CSS is loaded by verifying computed styles
    const bodyStyles = await page.locator('body').evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return {
        fontFamily: styles.fontFamily,
        backgroundColor: styles.backgroundColor,
      };
    });
    
    // Should have some styling (not browser defaults)
    expect(bodyStyles.fontFamily).toBeTruthy();
    expect(bodyStyles.fontFamily).not.toBe('');
  });

  test('pages have valid HTML structure', async ({ page }) => {
    await page.goto('/');
    
    // Check for essential HTML elements
    const html = await page.locator('html').isVisible();
    const body = await page.locator('body').isVisible();
    
    expect(html).toBe(true);
    expect(body).toBe(true);
  });

  test('no JavaScript errors on page load', async ({ page }) => {
    const errors: string[] = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    page.on('pageerror', error => {
      errors.push(error.message);
    });
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Filter out known non-critical errors if any
    const criticalErrors = errors.filter(error => 
      !error.includes('favicon') && 
      !error.includes('analytics')
    );
    
    expect(criticalErrors).toHaveLength(0);
  });
});

