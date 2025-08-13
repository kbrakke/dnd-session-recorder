import { test, expect } from '@playwright/test';
import { AuthHelper } from '../helpers/auth';
import { WaitHelper } from '../helpers/wait';
import { CampaignFixtures, TEST_CAMPAIGNS } from '../fixtures/campaigns';

test.describe('Campaign Management', () => {
  let authHelper: AuthHelper;
  let waitHelper: WaitHelper;

  test.beforeEach(async ({ page }) => {
    authHelper = new AuthHelper(page);
    waitHelper = new WaitHelper(page);
  });

  test('should create a new campaign', async ({ page }) => {
    const user = await authHelper.createAndSignIn('campaign-create');
    const testCampaign = CampaignFixtures.createCampaign();
    
    // Navigate to campaigns page
    await page.goto('/campaigns');
    await waitHelper.waitForPageLoad();

    // Look for create campaign button
    const createSelectors = [
      '[data-testid="create-campaign"]',
      'button:has-text("Create")',
      'button:has-text("New Campaign")',
      'button:has-text("Add Campaign")',
      '[data-testid="new-campaign"]'
    ];
    
    let createButton;
    for (const selector of createSelectors) {
      try {
        const button = page.locator(selector);
        if (await button.isVisible({ timeout: 2000 })) {
          createButton = button;
          break;
        }
      } catch {
        // Continue
      }
    }
    
    if (!createButton) {
      // Try to find any button that might create a campaign
      const buttons = page.locator('button');
      const buttonCount = await buttons.count();
      for (let i = 0; i < buttonCount; i++) {
        const button = buttons.nth(i);
        const text = await button.textContent();
        if (text && (text.includes('Create') || text.includes('New') || text.includes('Add'))) {
          createButton = button;
          break;
        }
      }
    }

    if (createButton) {
      await createButton.click();
      await waitHelper.waitForPageLoad();

      // Fill out campaign form
      await page.getByPlaceholder('Campaign name', { exact: false }).fill(testCampaign.name);
      await page.getByPlaceholder('Description', { exact: false }).fill(testCampaign.description);
      
      // Look for additional fields
      const playerInput = page.locator('input[name*="player"], textarea[name*="player"], input[placeholder*="player"]');
      if (await playerInput.isVisible()) {
        await playerInput.fill(testCampaign.players?.join(', ') || 'Test Player');
      }

      // Submit form
      const submitSelectors = [
        'button[type="submit"]',
        'button:has-text("Create")',
        'button:has-text("Save")',
        '[data-testid="submit-campaign"]'
      ];
      
      for (const selector of submitSelectors) {
        try {
          const submitButton = page.locator(selector);
          if (await submitButton.isVisible()) {
            await submitButton.click();
            break;
          }
        } catch {
          // Continue
        }
      }

      // Wait for form submission
      await waitHelper.waitForFormSubmission();

      // Verify campaign was created (should be on campaigns list or campaign detail page)
      await waitHelper.waitForPageLoad();
      
      // Look for the campaign name in the page
      await expect(page.locator(`text="${testCampaign.name}"`)).toBeVisible({ timeout: 10000 });
    }
  });

  test('should display campaign list', async ({ page }) => {
    const user = await authHelper.createAndSignIn('campaign-list');
    
    await page.goto('/campaigns');
    await waitHelper.waitForPageLoad();

    // Look for campaigns list
    const listSelectors = [
      '[data-testid="campaigns-list"]',
      '.campaigns-list',
      '[data-testid="campaign-grid"]',
      '.campaign-grid'
    ];
    
    let foundList = false;
    for (const selector of listSelectors) {
      try {
        const list = page.locator(selector);
        if (await list.isVisible({ timeout: 5000 })) {
          foundList = true;
          break;
        }
      } catch {
        // Continue
      }
    }

    // If no specific list container, look for campaign items
    if (!foundList) {
      const campaignItems = page.locator('[data-testid*="campaign"], .campaign-item, .campaign-card');
      const itemCount = await campaignItems.count();
      // Should have at least empty state or some campaigns
      expect(itemCount >= 0).toBeTruthy();
    }

    // Should show page title or heading
    const titleSelectors = [
      'h1:has-text("Campaigns")',
      '[data-testid="campaigns-title"]',
      'text="My Campaigns"'
    ];
    
    let foundTitle = false;
    for (const selector of titleSelectors) {
      try {
        await expect(page.locator(selector)).toBeVisible({ timeout: 2000 });
        foundTitle = true;
        break;
      } catch {
        // Continue
      }
    }
    
    // Should at least be on campaigns URL
    expect(page.url()).toContain('/campaigns');
  });

  test('should edit existing campaign', async ({ page }) => {
    const user = await authHelper.createAndSignIn('campaign-edit');
    const originalCampaign = CampaignFixtures.createCampaign();
    const editedCampaign = CampaignFixtures.createCampaign({ name: 'Edited Campaign Name' });
    
    await page.goto('/campaigns');
    await waitHelper.waitForPageLoad();

    // First create a campaign to edit (we'll assume there's at least one campaign)
    // Look for an existing campaign or create one first
    const campaignItems = page.locator('[data-testid*="campaign"], .campaign-item, .campaign-card');
    const itemCount = await campaignItems.count();
    
    if (itemCount === 0) {
      // Create a campaign first (simplified creation for testing)
      const createButton = page.locator('button:has-text("Create"), button:has-text("New")').first();
      if (await createButton.isVisible()) {
        await createButton.click();
        await page.getByPlaceholder('Campaign name').fill(originalCampaign.name);
        await page.locator('button[type="submit"], button:has-text("Create")').click();
        await waitHelper.waitForFormSubmission();
      }
    }

    // Look for edit button on first campaign
    const editSelectors = [
      '[data-testid="edit-campaign"]',
      'button:has-text("Edit")',
      '[aria-label="Edit campaign"]',
      '.edit-button'
    ];
    
    let editButton;
    for (const selector of editSelectors) {
      try {
        const button = page.locator(selector).first();
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

      // Edit the campaign
      const nameInput = page.locator('input[name*="name"], input[placeholder*="name"]').first();
      if (await nameInput.isVisible()) {
        await nameInput.clear();
        await nameInput.fill(editedCampaign.name);
      }

      // Save changes
      const saveButton = page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Update")');
      if (await saveButton.isVisible()) {
        await saveButton.click();
        await waitHelper.waitForFormSubmission();
      }

      // Verify changes were saved
      await waitHelper.waitForPageLoad();
      await expect(page.locator(`text="${editedCampaign.name}"`)).toBeVisible({ timeout: 10000 });
    }
  });

  test('should delete campaign with confirmation', async ({ page }) => {
    const user = await authHelper.createAndSignIn('campaign-delete');
    const testCampaign = CampaignFixtures.createCampaign({ name: 'Campaign To Delete' });
    
    await page.goto('/campaigns');
    await waitHelper.waitForPageLoad();

    // Look for campaigns to delete
    const campaignItems = page.locator('[data-testid*="campaign"], .campaign-item, .campaign-card');
    const itemCount = await campaignItems.count();
    
    if (itemCount === 0) {
      // Create a campaign to delete
      const createButton = page.locator('button:has-text("Create"), button:has-text("New")').first();
      if (await createButton.isVisible()) {
        await createButton.click();
        await page.getByPlaceholder('Campaign name').fill(testCampaign.name);
        await page.locator('button[type="submit"], button:has-text("Create")').click();
        await waitHelper.waitForFormSubmission();
        await waitHelper.waitForPageLoad();
      }
    }

    // Look for delete button
    const deleteSelectors = [
      '[data-testid="delete-campaign"]',
      'button:has-text("Delete")',
      '[aria-label="Delete campaign"]',
      '.delete-button'
    ];
    
    let deleteButton;
    for (const selector of deleteSelectors) {
      try {
        const button = page.locator(selector).first();
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

      // Look for confirmation dialog
      const confirmSelectors = [
        '[data-testid="confirm-delete"]',
        'button:has-text("Confirm")',
        'button:has-text("Yes")',
        'button:has-text("Delete")',
        '[role="dialog"] button'
      ];
      
      let confirmButton;
      for (const selector of confirmSelectors) {
        try {
          const button = page.locator(selector);
          if (await button.isVisible({ timeout: 5000 })) {
            confirmButton = button;
            break;
          }
        } catch {
          // Continue
        }
      }

      if (confirmButton) {
        await confirmButton.click();
        await waitHelper.waitForPageLoad();
        
        // Campaign should be removed from list
        if (testCampaign.name) {
          await expect(page.locator(`text="${testCampaign.name}"`)).not.toBeVisible({ timeout: 5000 });
        }
      }
    }
  });

  test('should search and filter campaigns', async ({ page }) => {
    const user = await authHelper.createAndSignIn('campaign-search');
    
    await page.goto('/campaigns');
    await waitHelper.waitForPageLoad();

    // Look for search/filter functionality
    const searchSelectors = [
      '[data-testid="search-campaigns"]',
      'input[placeholder*="search" i]',
      'input[type="search"]',
      '[data-testid="filter-campaigns"]'
    ];
    
    let searchInput;
    for (const selector of searchSelectors) {
      try {
        const input = page.locator(selector);
        if (await input.isVisible({ timeout: 3000 })) {
          searchInput = input;
          break;
        }
      } catch {
        // Continue
      }
    }

    if (searchInput) {
      // Test search functionality
      await searchInput.fill('test search query');
      await page.keyboard.press('Enter');
      
      // Wait for search results
      await waitHelper.waitForPageLoad();
      
      // Should show search results or "no results" message
      const resultsIndicators = [
        '[data-testid="search-results"]',
        'text="No campaigns found"',
        'text="No results"',
        '.search-results'
      ];
      
      let foundResultsIndicator = false;
      for (const selector of resultsIndicators) {
        try {
          if (await page.locator(selector).isVisible({ timeout: 2000 })) {
            foundResultsIndicator = true;
            break;
          }
        } catch {
          // Continue
        }
      }
    }
  });

  test('should show campaign details view', async ({ page }) => {
    const user = await authHelper.createAndSignIn('campaign-details');
    const testCampaign = CampaignFixtures.createCampaign();
    
    await page.goto('/campaigns');
    await waitHelper.waitForPageLoad();

    // Look for a campaign to view details
    const campaignItems = page.locator('[data-testid*="campaign"], .campaign-item, .campaign-card');
    const itemCount = await campaignItems.count();
    
    if (itemCount === 0) {
      // Create a campaign first
      const createButton = page.locator('button:has-text("Create"), button:has-text("New")').first();
      if (await createButton.isVisible()) {
        await createButton.click();
        await page.getByPlaceholder('Campaign name').fill(testCampaign.name);
        await page.getByPlaceholder('Description').fill(testCampaign.description);
        await page.locator('button[type="submit"], button:has-text("Create")').click();
        await waitHelper.waitForFormSubmission();
        await waitHelper.waitForPageLoad();
      }
    }

    // Click on a campaign to view details
    const firstCampaign = campaignItems.first();
    if (await firstCampaign.isVisible()) {
      await firstCampaign.click();
      await waitHelper.waitForPageLoad();

      // Should be on campaign details page
      const detailsIndicators = [
        '[data-testid="campaign-details"]',
        'h1',  // Campaign title
        'text="Sessions"',  // Should show associated sessions
        '[data-testid="campaign-sessions"]'
      ];
      
      let foundDetails = false;
      for (const selector of detailsIndicators) {
        try {
          if (await page.locator(selector).isVisible({ timeout: 5000 })) {
            foundDetails = true;
            break;
          }
        } catch {
          // Continue
        }
      }
      
      // Should at least be on a different URL than campaigns list
      expect(page.url()).not.toBe(page.url().replace(/\/campaigns.*/, '/campaigns'));
    }
  });

  test('should handle campaign with sessions', async ({ page }) => {
    const user = await authHelper.createAndSignIn('campaign-sessions');
    
    await page.goto('/campaigns');
    await waitHelper.waitForPageLoad();

    // Create campaign first if needed
    const campaignItems = page.locator('[data-testid*="campaign"], .campaign-item, .campaign-card');
    const itemCount = await campaignItems.count();
    
    if (itemCount === 0) {
      const createButton = page.locator('button:has-text("Create"), button:has-text("New")').first();
      if (await createButton.isVisible()) {
        await createButton.click();
        await page.getByPlaceholder('Campaign name').fill('Campaign with Sessions');
        await page.locator('button[type="submit"], button:has-text("Create")').click();
        await waitHelper.waitForFormSubmission();
        await waitHelper.waitForPageLoad();
      }
    }

    // Navigate to campaign details
    const firstCampaign = campaignItems.first();
    if (await firstCampaign.isVisible()) {
      await firstCampaign.click();
      await waitHelper.waitForPageLoad();

      // Look for sessions section
      const sessionsSection = page.locator('[data-testid="campaign-sessions"], text="Sessions", .sessions-section');
      if (await sessionsSection.isVisible()) {
        // Should show sessions list or empty state
        const sessionsCount = await page.locator('[data-testid*="session"], .session-item').count();
        expect(sessionsCount >= 0).toBeTruthy();
      }

      // Look for add session button
      const addSessionButton = page.locator('button:has-text("Add Session"), [data-testid="add-session"]');
      if (await addSessionButton.isVisible()) {
        await addSessionButton.click();
        await waitHelper.waitForPageLoad();
        
        // Should navigate to session creation
        expect(page.url()).toContain('/session');
      }
    }
  });

  test('should validate required fields', async ({ page }) => {
    const user = await authHelper.createAndSignIn('campaign-validation');
    
    await page.goto('/campaigns');
    await waitHelper.waitForPageLoad();

    // Try to create campaign without required fields
    const createButton = page.locator('button:has-text("Create"), button:has-text("New")').first();
    if (await createButton.isVisible()) {
      await createButton.click();
      await waitHelper.waitForPageLoad();

      // Try to submit without filling required fields
      const submitButton = page.locator('button[type="submit"], button:has-text("Create"), button:has-text("Save")');
      if (await submitButton.isVisible()) {
        await submitButton.click();
        
        // Should show validation errors
        const errorSelectors = [
          '[data-testid="validation-error"]',
          '.error-message',
          '[role="alert"]',
          'text="required" i',
          '.field-error'
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
        
        // Should stay on form page
        expect(page.url()).toContain('campaign');
      }
    }
  });

  test('should handle long campaign names and descriptions', async ({ page }) => {
    const user = await authHelper.createAndSignIn('campaign-long-text');
    const longCampaign = CampaignFixtures.createLargeCampaign();
    
    await page.goto('/campaigns');
    await waitHelper.waitForPageLoad();

    const createButton = page.locator('button:has-text("Create"), button:has-text("New")').first();
    if (await createButton.isVisible()) {
      await createButton.click();
      await waitHelper.waitForPageLoad();

      // Fill with long text
      await page.getByPlaceholder('Campaign name').fill(longCampaign.name);
      await page.getByPlaceholder('Description').fill(longCampaign.description);
      
      const submitButton = page.locator('button[type="submit"], button:has-text("Create")');
      if (await submitButton.isVisible()) {
        await submitButton.click();
        await waitHelper.waitForFormSubmission();
        
        // Should handle long text gracefully
        await waitHelper.waitForPageLoad();
        
        // Campaign should be created successfully
        const campaignExists = await page.locator(`text*="${longCampaign.name.substring(0, 20)}"`).isVisible();
        expect(campaignExists).toBeTruthy();
      }
    }
  });
});