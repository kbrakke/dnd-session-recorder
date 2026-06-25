import { test, expect } from '@playwright/test';

test.describe('Simple Working Tests', () => {
  test('should load homepage', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/StoryScribe/);
  });

  test('should load signin page', async ({ page }) => {
    await page.goto('/auth/signin');
    await expect(page.locator('h1, h2').filter({ hasText: /welcome back/i })).toBeVisible();
  });

  test('should load signup page', async ({ page }) => {
    await page.goto('/auth/signup');
    await expect(page.locator('h1, h2').filter({ hasText: /create|sign up/i })).toBeVisible();
  });
});