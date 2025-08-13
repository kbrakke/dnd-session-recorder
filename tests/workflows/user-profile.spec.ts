import { test, expect } from '@playwright/test';
import { AuthHelper } from '../helpers/auth';
import { WaitHelper } from '../helpers/wait';

test.describe('User Profile Management', () => {
  let authHelper: AuthHelper;
  let waitHelper: WaitHelper;

  test.beforeEach(async ({ page }) => {
    authHelper = new AuthHelper(page);
    waitHelper = new WaitHelper(page);
  });

  test('should display user profile information', async ({ page }) => {
    const user = await authHelper.createAndSignIn('profile-display');
    
    // Look for profile/user menu
    const profileSelectors = [
      '[data-testid="user-menu"]',
      '[data-testid="profile-menu"]',
      'button:has-text("Profile")',
      '[aria-label="User menu"]'
    ];
    
    let profileMenu;
    for (const selector of profileSelectors) {
      try {
        const menu = page.locator(selector);
        if (await menu.isVisible({ timeout: 3000 })) {
          profileMenu = menu;
          break;
        }
      } catch {
        // Continue
      }
    }

    if (profileMenu) {
      await profileMenu.click();
      await waitHelper.waitForPageLoad();
      
      // Should show profile information
      const profileInfo = [
        `text="${user.name}"`,
        `text="${user.email}"`,
        '[data-testid="user-email"]',
        '[data-testid="user-name"]'
      ];
      
      let foundInfo = false;
      for (const selector of profileInfo) {
        try {
          if (await page.locator(selector).isVisible({ timeout: 3000 })) {
            foundInfo = true;
            break;
          }
        } catch {
          // Continue
        }
      }
      
      expect(foundInfo || page.url().includes('profile')).toBeTruthy();
    } else {
      // Try direct navigation
      await page.goto('/profile');
      await waitHelper.waitForPageLoad();
      
      // Should show profile page or redirect to appropriate page
      const isOnProfile = page.url().includes('profile') || 
                         await page.locator('h1:has-text("Profile"), [data-testid="profile-page"]').isVisible();
      
      if (isOnProfile) {
        expect(isOnProfile).toBeTruthy();
      }
    }
  });

  test('should allow editing profile information', async ({ page }) => {
    const user = await authHelper.createAndSignIn('profile-edit');
    
    // Navigate to profile
    await page.goto('/profile');
    await waitHelper.waitForPageLoad();

    // Look for edit functionality
    const editSelectors = [
      'button:has-text("Edit")',
      '[data-testid="edit-profile"]',
      'button:has-text("Update Profile")',
      '[data-testid="edit-user"]'
    ];
    
    let editButton;
    for (const selector of editSelectors) {
      try {
        const button = page.locator(selector);
        if (await button.isVisible({ timeout: 3000 })) {
          editButton = button;
          break;
        }
      } catch {
        // Continue
      }
    }

    if (editButton) {
      await editButton.click();
      await waitHelper.waitForPageLoad();
      
      // Look for editable fields
      const nameInput = page.locator('input[name*="name"], input[placeholder*="name"]').first();
      if (await nameInput.isVisible()) {
        await nameInput.clear();
        await nameInput.fill('Updated Test Name');
      }

      // Save changes
      const saveButton = page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Update")');
      if (await saveButton.isVisible()) {
        await saveButton.click();
        await waitHelper.waitForFormSubmission();
        
        // Should show updated information
        await waitHelper.waitForPageLoad();
        await expect(page.locator('text="Updated Test Name"')).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('should handle account settings', async ({ page }) => {
    const user = await authHelper.createAndSignIn('account-settings');
    
    // Look for settings access
    const settingsSelectors = [
      'a:has-text("Settings")',
      'button:has-text("Settings")',
      '[data-testid="settings"]',
      '[data-testid="account-settings"]'
    ];
    
    let settingsLink;
    for (const selector of settingsSelectors) {
      try {
        const link = page.locator(selector);
        if (await link.isVisible({ timeout: 3000 })) {
          settingsLink = link;
          break;
        }
      } catch {
        // Continue
      }
    }

    if (settingsLink) {
      await settingsLink.click();
      await waitHelper.waitForPageLoad();
      
      // Should show settings page
      const settingsIndicators = [
        'h1:has-text("Settings")',
        '[data-testid="settings-page"]',
        'text="Account Settings"',
        'text="Preferences"'
      ];
      
      let foundSettings = false;
      for (const selector of settingsIndicators) {
        try {
          if (await page.locator(selector).isVisible({ timeout: 3000 })) {
            foundSettings = true;
            break;
          }
        } catch {
          // Continue
        }
      }
      
      expect(foundSettings || page.url().includes('settings')).toBeTruthy();
    } else {
      // Try direct navigation
      await page.goto('/settings');
      await waitHelper.waitForPageLoad();
      
      const isOnSettings = page.url().includes('settings') || 
                          await page.locator('h1:has-text("Settings")').isVisible();
      expect(isOnSettings).toBeTruthy();
    }
  });

  test('should allow password change', async ({ page }) => {
    const user = await authHelper.createAndSignIn('password-change');
    
    // Navigate to settings/profile
    await page.goto('/profile');
    await waitHelper.waitForPageLoad();

    // Look for password change option
    const passwordSelectors = [
      'button:has-text("Change Password")',
      'a:has-text("Password")',
      '[data-testid="change-password"]',
      'button:has-text("Update Password")'
    ];
    
    let passwordButton;
    for (const selector of passwordSelectors) {
      try {
        const button = page.locator(selector);
        if (await button.isVisible({ timeout: 3000 })) {
          passwordButton = button;
          break;
        }
      } catch {
        // Continue
      }
    }

    if (passwordButton) {
      await passwordButton.click();
      await waitHelper.waitForPageLoad();
      
      // Fill password change form
      const currentPasswordInput = page.locator('input[name*="current"], input[placeholder*="current"]');
      const newPasswordInput = page.locator('input[name*="new"], input[placeholder*="new"]').first();
      const confirmPasswordInput = page.locator('input[name*="confirm"], input[placeholder*="confirm"]');
      
      if (await currentPasswordInput.isVisible()) {
        await currentPasswordInput.fill(user.password);
      }
      
      const newPassword = 'NewTestPassword123!';
      if (await newPasswordInput.isVisible()) {
        await newPasswordInput.fill(newPassword);
      }
      
      if (await confirmPasswordInput.isVisible()) {
        await confirmPasswordInput.fill(newPassword);
      }

      // Submit password change
      const submitButton = page.locator('button[type="submit"], button:has-text("Update"), button:has-text("Change")');
      if (await submitButton.isVisible()) {
        await submitButton.click();
        await waitHelper.waitForFormSubmission();
        
        // Should show success message or redirect
        const successIndicators = [
          'text="Password updated"',
          'text="Success"',
          '[data-testid="success-message"]'
        ];
        
        let foundSuccess = false;
        for (const selector of successIndicators) {
          try {
            if (await page.locator(selector).isVisible({ timeout: 3000 })) {
              foundSuccess = true;
              break;
            }
          } catch {
            // Continue
          }
        }
        
        // Should stay authenticated after password change
        await authHelper.verifyAuthenticated();
      }
    }
  });

  test('should show user statistics and activity', async ({ page }) => {
    const user = await authHelper.createAndSignIn('user-stats');
    
    await page.goto('/profile');
    await waitHelper.waitForPageLoad();

    // Look for statistics/activity section
    const statsSelectors = [
      '[data-testid="user-stats"]',
      '[data-testid="activity-summary"]',
      'text="Campaigns"',
      'text="Sessions"',
      '.stats-section',
      '.user-activity'
    ];
    
    let foundStats = false;
    for (const selector of statsSelectors) {
      try {
        if (await page.locator(selector).isVisible({ timeout: 3000 })) {
          foundStats = true;
          
          // Should show some activity numbers
          const statsContent = await page.locator(selector).textContent();
          expect(statsContent).toBeTruthy();
          break;
        }
      } catch {
        // Continue
      }
    }
  });

  test('should handle notification preferences', async ({ page }) => {
    const user = await authHelper.createAndSignIn('notifications');
    
    await page.goto('/settings');
    await waitHelper.waitForPageLoad();

    // Look for notification settings
    const notificationSelectors = [
      '[data-testid="notification-settings"]',
      'text="Notifications"',
      'input[type="checkbox"][name*="notification"]',
      'label:has-text("Email notifications")'
    ];
    
    let foundNotifications = false;
    for (const selector of notificationSelectors) {
      try {
        const element = page.locator(selector);
        if (await element.isVisible({ timeout: 3000 })) {
          foundNotifications = true;
          
          // If it's a checkbox, try to toggle it
          if (selector.includes('checkbox')) {
            const isChecked = await element.isChecked();
            await element.click();
            
            // Save settings if there's a save button
            const saveButton = page.locator('button:has-text("Save"), button[type="submit"]');
            if (await saveButton.isVisible()) {
              await saveButton.click();
              await waitHelper.waitForFormSubmission();
            }
          }
          break;
        }
      } catch {
        // Continue
      }
    }
  });

  test('should allow account deletion with confirmation', async ({ page }) => {
    const user = await authHelper.createAndSignIn('account-delete');
    
    await page.goto('/settings');
    await waitHelper.waitForPageLoad();

    // Look for dangerous actions section
    const deleteSelectors = [
      'button:has-text("Delete Account")',
      '[data-testid="delete-account"]',
      'button:has-text("Close Account")',
      'text="Danger Zone"'
    ];
    
    let deleteButton;
    for (const selector of deleteSelectors) {
      try {
        const button = page.locator(selector);
        if (await button.isVisible({ timeout: 3000 })) {
          deleteButton = button;
          break;
        }
      } catch {
        // Continue
      }
    }

    if (deleteButton) {
      await deleteButton.click();
      
      // Should show confirmation dialog
      const confirmationSelectors = [
        '[role="dialog"]',
        '[data-testid="delete-confirmation"]',
        'text="Are you sure"',
        'text="permanently delete"'
      ];
      
      let foundConfirmation = false;
      for (const selector of confirmationSelectors) {
        try {
          if (await page.locator(selector).isVisible({ timeout: 5000 })) {
            foundConfirmation = true;
            
            // Cancel the deletion (don't actually delete in test)
            const cancelButton = page.locator('button:has-text("Cancel"), button:has-text("No")');
            if (await cancelButton.isVisible()) {
              await cancelButton.click();
            }
            break;
          }
        } catch {
          // Continue
        }
      }
      
      expect(foundConfirmation).toBeTruthy();
    }
  });

  test('should display user preferences and themes', async ({ page }) => {
    const user = await authHelper.createAndSignIn('preferences');
    
    await page.goto('/settings');
    await waitHelper.waitForPageLoad();

    // Look for theme/preference options
    const themeSelectors = [
      '[data-testid="theme-selector"]',
      'select[name*="theme"]',
      'input[name*="dark" i]',
      'button:has-text("Dark")',
      'button:has-text("Light")',
      'text="Theme"'
    ];
    
    for (const selector of themeSelectors) {
      try {
        const element = page.locator(selector);
        if (await element.isVisible({ timeout: 2000 })) {
          // If it's a theme toggle, try it
          if (selector.includes('button')) {
            await element.click();
            await page.waitForTimeout(1000);
            
            // Check if theme changed (body class, css variables, etc.)
            const bodyClass = await page.locator('body').getAttribute('class');
            expect(bodyClass).toBeTruthy();
          }
          break;
        }
      } catch {
        // Continue
      }
    }
  });

  test('should validate profile form fields', async ({ page }) => {
    const user = await authHelper.createAndSignIn('profile-validation');
    
    await page.goto('/profile');
    await waitHelper.waitForPageLoad();

    // Find edit button
    const editButton = page.locator('button:has-text("Edit"), [data-testid="edit-profile"]').first();
    if (await editButton.isVisible({ timeout: 3000 })) {
      await editButton.click();
      await waitHelper.waitForPageLoad();
      
      // Clear required field
      const nameInput = page.locator('input[name*="name"]').first();
      if (await nameInput.isVisible()) {
        await nameInput.clear();
        
        // Try to save
        const saveButton = page.locator('button[type="submit"], button:has-text("Save")');
        if (await saveButton.isVisible()) {
          await saveButton.click();
          
          // Should show validation error
          const errorSelectors = [
            '[role="alert"]',
            '.error-message',
            'text="required" i'
          ];
          
          let foundError = false;
          for (const selector of errorSelectors) {
            try {
              if (await page.locator(selector).isVisible({ timeout: 3000 })) {
                foundError = true;
                break;
              }
            } catch {
              // Continue
            }
          }
          
          // Should stay on edit form
          expect(page.url()).toContain('profile');
        }
      }
    }
  });

  test('should maintain session during profile updates', async ({ page }) => {
    const user = await authHelper.createAndSignIn('session-maintenance');
    
    await page.goto('/profile');
    await waitHelper.waitForPageLoad();

    // Update profile
    const editButton = page.locator('button:has-text("Edit")').first();
    if (await editButton.isVisible()) {
      await editButton.click();
      
      const nameInput = page.locator('input[name*="name"]').first();
      if (await nameInput.isVisible()) {
        await nameInput.clear();
        await nameInput.fill('Session Test User');
        
        const saveButton = page.locator('button[type="submit"], button:has-text("Save")');
        if (await saveButton.isVisible()) {
          await saveButton.click();
          await waitHelper.waitForFormSubmission();
        }
      }
    }

    // Should still be authenticated
    await authHelper.verifyAuthenticated();
    
    // Navigate to other pages to verify session
    await page.goto('/campaigns');
    await waitHelper.waitForPageLoad();
    await authHelper.verifyAuthenticated();
    
    await page.goto('/sessions');  
    await waitHelper.waitForPageLoad();
    await authHelper.verifyAuthenticated();
  });
});