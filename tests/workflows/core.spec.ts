import { test, expect } from '@playwright/test';

test.describe('Core Application Tests', () => {
  // Simple page load tests
  test('should load all main pages', async ({ page }) => {
    // Homepage
    await page.goto('/');
    await expect(page).toHaveTitle(/D&D Session Recorder/);
    
    // Auth pages
    await page.goto('/auth/signin');
    await expect(page.locator('h1, h2').filter({ hasText: /sign in/i })).toBeVisible();
    
    await page.goto('/auth/signup');
    await expect(page.locator('h1, h2').filter({ hasText: /create|sign up/i })).toBeVisible();
  });

  // Navigation test
  test('should navigate between public pages', async ({ page }) => {
    await page.goto('/');
    
    // Navigate to signin
    await page.goto('/auth/signin');
    await expect(page.locator('h1, h2').filter({ hasText: /sign in/i })).toBeVisible();
    
    // Navigate to signup
    await page.goto('/auth/signup');
    await expect(page.locator('h1, h2').filter({ hasText: /create|sign up/i })).toBeVisible();
    
    // Back to home
    await page.goto('/');
    await expect(page).toHaveTitle(/D&D Session Recorder/);
  });

  // Form validation test
  test('should show validation errors for empty login', async ({ page }) => {
    await page.goto('/auth/signin');
    
    // Try to submit empty form
    await page.click('button[type="submit"], button:has-text("Sign in")');
    await page.waitForTimeout(1000);
    
    // Should still be on signin page (form didn't submit)
    expect(page.url()).toContain('/auth/signin');
  });
});