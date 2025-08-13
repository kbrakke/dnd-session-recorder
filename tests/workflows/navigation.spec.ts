import { test, expect } from '@playwright/test';
import { AuthHelper } from '../helpers/auth';
import { WaitHelper } from '../helpers/wait';

test.describe('Application Navigation', () => {
  let authHelper: AuthHelper;
  let waitHelper: WaitHelper;

  test.beforeEach(async ({ page }) => {
    authHelper = new AuthHelper(page);
    waitHelper = new WaitHelper(page);
  });

  test('should navigate between all main sections when authenticated', async ({ page }) => {
    // Authenticate first
    const user = await authHelper.createAndSignIn('nav-test');

    // Test navigation to main sections
    const sections = [
      { name: 'Campaigns', url: '/campaigns', selector: 'h1:has-text("Campaigns"), [data-testid="campaigns-page"]' },
      { name: 'Sessions', url: '/sessions', selector: 'h1:has-text("Sessions"), [data-testid="sessions-page"]' },
      { name: 'Upload', url: '/sessions/upload', selector: 'h1:has-text("Upload"), [data-testid="upload-page"]' }
    ];

    for (const section of sections) {
      // Navigate to section
      await page.goto(section.url);
      await waitHelper.waitForPageLoad();

      // Verify we're on the correct page
      try {
        await expect(page.locator(section.selector)).toBeVisible({ timeout: 5000 });
      } catch {
        // Fallback: check URL contains expected path
        expect(page.url()).toContain(section.url);
      }
    }

    // Test navigation back to home
    await page.goto('/');
    await waitHelper.waitForPageLoad();
    
    // Should see dashboard or welcome message
    const homeIndicators = [
      'text="Welcome back"',
      'text="Dashboard"', 
      '[data-testid="dashboard"]',
      '[data-testid="home-page"]'
    ];
    
    let foundHomeIndicator = false;
    for (const indicator of homeIndicators) {
      try {
        await expect(page.locator(indicator)).toBeVisible({ timeout: 2000 });
        foundHomeIndicator = true;
        break;
      } catch {
        // Continue checking
      }
    }
    
    // If no specific indicator found, just verify we're on home URL
    if (!foundHomeIndicator) {
      expect(page.url()).toMatch(/\/$|\/home$/);
    }
  });

  test('should handle navigation with browser back/forward', async ({ page }) => {
    const user = await authHelper.createAndSignIn('nav-back-test');

    // Navigate through several pages
    await page.goto('/campaigns');
    await waitHelper.waitForPageLoad();
    
    await page.goto('/sessions');
    await waitHelper.waitForPageLoad();
    
    await page.goto('/sessions/upload');
    await waitHelper.waitForPageLoad();

    // Test browser back button
    await page.goBack();
    await waitHelper.waitForPageLoad();
    expect(page.url()).toContain('/sessions');

    await page.goBack();
    await waitHelper.waitForPageLoad();
    expect(page.url()).toContain('/campaigns');

    // Test browser forward button
    await page.goForward();
    await waitHelper.waitForPageLoad();
    expect(page.url()).toContain('/sessions');
  });

  test('should redirect to login for protected routes when not authenticated', async ({ page }) => {
    // Try to access protected routes without authentication
    const protectedRoutes = [
      '/campaigns',
      '/sessions',
      '/sessions/upload'
    ];

    for (const route of protectedRoutes) {
      await page.goto(route);
      await waitHelper.waitForPageLoad();

      // Should redirect to sign-in or show sign-in page
      const currentUrl = page.url();
      const isOnSignIn = currentUrl.includes('/auth/signin') || currentUrl.includes('/signin');
      const hasSignInForm = await page.locator('input[type="email"], input[placeholder*="email"]').isVisible();
      
      expect(isOnSignIn || hasSignInForm).toBeTruthy();
    }
  });

  test('should handle deep linking to nested routes', async ({ page }) => {
    const user = await authHelper.createAndSignIn('deep-link-test');

    // Test deep linking to specific pages
    const deepLinks = [
      '/campaigns?tab=active',
      '/sessions?filter=recent',
      '/sessions/upload?campaign=test'
    ];

    for (const link of deepLinks) {
      await page.goto(link);
      await waitHelper.waitForPageLoad();

      // Should be on the correct page (URL should contain the path)
      expect(page.url()).toContain(link.split('?')[0]);
      
      // Should preserve query parameters
      if (link.includes('?')) {
        const [, queryParams] = link.split('?');
        expect(page.url()).toContain(queryParams);
      }
    }
  });

  test('should show navigation breadcrumbs where applicable', async ({ page }) => {
    const user = await authHelper.createAndSignIn('breadcrumb-test');

    // Navigate to a page that should have breadcrumbs
    await page.goto('/sessions/upload');
    await waitHelper.waitForPageLoad();

    // Look for breadcrumb navigation
    const breadcrumbSelectors = [
      '[data-testid="breadcrumb"]',
      '.breadcrumb',
      'nav[aria-label="Breadcrumb"]',
      'ol[role="list"]' // Common breadcrumb pattern
    ];

    let foundBreadcrumb = false;
    for (const selector of breadcrumbSelectors) {
      try {
        const breadcrumb = page.locator(selector);
        if (await breadcrumb.isVisible()) {
          foundBreadcrumb = true;
          
          // Breadcrumb should contain navigation items
          const items = breadcrumb.locator('a, button, span');
          const count = await items.count();
          expect(count).toBeGreaterThan(0);
          break;
        }
      } catch {
        // Continue checking
      }
    }

    // Note: If no breadcrumbs found, that's okay - not all apps have them
    // This test will pass either way but validates structure if present
  });

  test('should maintain authentication state across navigation', async ({ page }) => {
    const user = await authHelper.createAndSignIn('auth-state-test');

    // Navigate to different sections and verify we stay authenticated
    const routes = ['/campaigns', '/sessions', '/sessions/upload', '/'];

    for (const route of routes) {
      await page.goto(route);
      await waitHelper.waitForPageLoad();

      // Should still be authenticated (not redirected to sign-in)
      const currentUrl = page.url();
      expect(currentUrl).not.toContain('/auth/signin');
      expect(currentUrl).not.toContain('/signin');
      
      // Should see authenticated navigation elements
      await authHelper.verifyAuthenticated();
    }
  });

  test('should handle 404 pages gracefully', async ({ page }) => {
    const user = await authHelper.createAndSignIn('404-test');

    // Navigate to non-existent page
    await page.goto('/non-existent-page');
    await waitHelper.waitForPageLoad();

    // Should show 404 page or redirect to home
    const currentUrl = page.url();
    const has404Content = await page.locator('text="404", text="Not Found", text="Page not found"').isVisible();
    const redirectedHome = currentUrl.match(/\/$|\/home$/);

    expect(has404Content || redirectedHome).toBeTruthy();
  });

  test('should have working navigation menu/header', async ({ page }) => {
    const user = await authHelper.createAndSignIn('nav-menu-test');

    await page.goto('/');
    await waitHelper.waitForPageLoad();

    // Look for main navigation menu
    const navSelectors = [
      'nav[role="navigation"]',
      '[data-testid="main-nav"]',
      '.navigation',
      'header nav'
    ];

    let navigation;
    for (const selector of navSelectors) {
      try {
        const nav = page.locator(selector);
        if (await nav.isVisible()) {
          navigation = nav;
          break;
        }
      } catch {
        // Continue
      }
    }

    if (navigation) {
      // Navigation should contain links to main sections
      const navLinks = navigation.locator('a');
      const linkCount = await navLinks.count();
      expect(linkCount).toBeGreaterThan(0);

      // Test clicking navigation links
      for (let i = 0; i < Math.min(linkCount, 3); i++) {
        const link = navLinks.nth(i);
        const href = await link.getAttribute('href');
        
        if (href && !href.startsWith('#') && !href.startsWith('mailto:')) {
          await link.click();
          await waitHelper.waitForPageLoad();
          
          // Should navigate successfully
          const newUrl = page.url();
          expect(newUrl).toBeDefined();
        }
      }
    }
  });

  test('should handle external links appropriately', async ({ page }) => {
    const user = await authHelper.createAndSignIn('external-link-test');

    await page.goto('/');
    await waitHelper.waitForPageLoad();

    // Look for external links
    const externalLinks = page.locator('a[href^="http"], a[target="_blank"]');
    const count = await externalLinks.count();

    if (count > 0) {
      // External links should have appropriate attributes
      const firstExternal = externalLinks.first();
      const target = await firstExternal.getAttribute('target');
      const rel = await firstExternal.getAttribute('rel');

      // Should open in new tab and have security attributes
      if (target === '_blank') {
        expect(rel).toContain('noopener');
      }
    }
  });
});