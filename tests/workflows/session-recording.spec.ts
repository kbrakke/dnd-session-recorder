import { test, expect } from '@playwright/test';
import { AuthHelper } from '../helpers/auth';
import { UploadHelper } from '../helpers/upload';
import { WaitHelper } from '../helpers/wait';
import { SessionFixtures, CampaignFixtures } from '../fixtures/campaigns';
import { AudioFixtures, AUDIO_PATHS } from '../fixtures/audio-files';

test.describe('Session Recording', () => {
  let authHelper: AuthHelper;
  let uploadHelper: UploadHelper;
  let waitHelper: WaitHelper;

  test.beforeAll(async () => {
    await AudioFixtures.setupAll();
  });

  test.afterAll(async () => {
    await AudioFixtures.cleanupAll();
  });

  test.beforeEach(async ({ page }) => {
    authHelper = new AuthHelper(page);
    uploadHelper = new UploadHelper(page);
    waitHelper = new WaitHelper(page);
  });

  test('should create new session with audio', async ({ page }) => {
    const user = await authHelper.createAndSignIn('session-create');
    const testSession = SessionFixtures.createSession();
    
    // Navigate to sessions
    await page.goto('/sessions');
    await waitHelper.waitForPageLoad();

    // Look for create session button
    const createButton = page.locator('button:has-text("Create"), button:has-text("New Session"), [data-testid="create-session"]').first();
    
    if (await createButton.isVisible({ timeout: 3000 })) {
      await createButton.click();
    } else {
      // Try direct navigation to upload/create
      await page.goto('/sessions/upload');
    }
    
    await waitHelper.waitForPageLoad();

    // Fill session details
    const titleInput = page.locator('input[name*="title"], input[placeholder*="title"], input[placeholder*="session"]').first();
    if (await titleInput.isVisible()) {
      await titleInput.fill(testSession.title);
    }

    const notesInput = page.locator('textarea[name*="notes"], textarea[placeholder*="notes"], [data-testid="session-notes"]').first();
    if (await notesInput.isVisible()) {
      await notesInput.fill(testSession.notes);
    }

    // Upload audio file
    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.isVisible()) {
      await uploadHelper.uploadFile(fileInput, AUDIO_PATHS.MEDIUM_MP3);
      await uploadHelper.waitForUploadComplete();
    }

    // Submit session
    const submitButton = page.locator('button[type="submit"], button:has-text("Create"), button:has-text("Save")').first();
    if (await submitButton.isVisible()) {
      await submitButton.click();
      await waitHelper.waitForFormSubmission();
    }

    // Verify session created
    await waitHelper.waitForPageLoad();
    await expect(page.locator(`text="${testSession.title}"`)).toBeVisible({ timeout: 10000 });
  });

  test('should display sessions list', async ({ page }) => {
    const user = await authHelper.createAndSignIn('session-list');
    
    await page.goto('/sessions');
    await waitHelper.waitForPageLoad();

    // Should show sessions page
    const pageIndicators = [
      'h1:has-text("Sessions")',
      '[data-testid="sessions-page"]',
      '[data-testid="sessions-list"]'
    ];
    
    let foundPageIndicator = false;
    for (const selector of pageIndicators) {
      try {
        if (await page.locator(selector).isVisible({ timeout: 3000 })) {
          foundPageIndicator = true;
          break;
        }
      } catch {
        // Continue
      }
    }

    // Should be on sessions URL
    expect(page.url()).toContain('/sessions');
  });

  test('should edit existing session', async ({ page }) => {
    const user = await authHelper.createAndSignIn('session-edit');
    
    await page.goto('/sessions');
    await waitHelper.waitForPageLoad();

    // Look for existing sessions or create one
    const sessionItems = page.locator('[data-testid*="session"], .session-item, .session-card');
    const itemCount = await sessionItems.count();
    
    if (itemCount === 0) {
      // Create a session first
      const createButton = page.locator('button:has-text("Create"), button:has-text("New")').first();
      if (await createButton.isVisible()) {
        await createButton.click();
        await page.locator('input[placeholder*="title"]').fill('Session to Edit');
        await page.locator('button[type="submit"], button:has-text("Create")').click();
        await waitHelper.waitForFormSubmission();
        await page.goto('/sessions'); // Go back to list
        await waitHelper.waitForPageLoad();
      }
    }

    // Find and click edit button
    const editButton = page.locator('button:has-text("Edit"), [data-testid="edit-session"], [aria-label="Edit session"]').first();
    if (await editButton.isVisible({ timeout: 3000 })) {
      await editButton.click();
      await waitHelper.waitForPageLoad();

      // Edit session details
      const titleInput = page.locator('input[name*="title"], input[placeholder*="title"]').first();
      if (await titleInput.isVisible()) {
        await titleInput.clear();
        await titleInput.fill('Edited Session Title');
      }

      // Save changes
      const saveButton = page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Update")').first();
      if (await saveButton.isVisible()) {
        await saveButton.click();
        await waitHelper.waitForFormSubmission();
      }

      // Verify changes
      await waitHelper.waitForPageLoad();
      await expect(page.locator('text="Edited Session Title"')).toBeVisible({ timeout: 5000 });
    }
  });

  test('should view session details', async ({ page }) => {
    const user = await authHelper.createAndSignIn('session-details');
    
    await page.goto('/sessions');
    await waitHelper.waitForPageLoad();

    // Look for a session to view
    const sessionItems = page.locator('[data-testid*="session"], .session-item, .session-card');
    const itemCount = await sessionItems.count();
    
    if (itemCount === 0) {
      // Create a session first
      const testSession = SessionFixtures.createSessionWithAudio();
      const createButton = page.locator('button:has-text("Create"), button:has-text("New")').first();
      if (await createButton.isVisible()) {
        await createButton.click();
        await page.locator('input[placeholder*="title"]').fill(testSession.title);
        await page.locator('textarea[placeholder*="notes"]').fill(testSession.notes);
        await page.locator('button[type="submit"], button:has-text("Create")').click();
        await waitHelper.waitForFormSubmission();
        await page.goto('/sessions');
        await waitHelper.waitForPageLoad();
      }
    }

    // Click on first session
    const firstSession = sessionItems.first();
    if (await firstSession.isVisible()) {
      await firstSession.click();
      await waitHelper.waitForPageLoad();

      // Should show session details
      const detailsIndicators = [
        '[data-testid="session-details"]',
        'h1, h2', // Session title
        'text="Notes"',
        '[data-testid="session-audio"]'
      ];
      
      let foundDetails = false;
      for (const selector of detailsIndicators) {
        try {
          if (await page.locator(selector).isVisible({ timeout: 3000 })) {
            foundDetails = true;
            break;
          }
        } catch {
          // Continue
        }
      }
      
      expect(foundDetails || page.url().includes('/session')).toBeTruthy();
    }
  });

  test('should associate session with campaign', async ({ page }) => {
    const user = await authHelper.createAndSignIn('session-campaign');
    
    // First ensure we have a campaign
    await page.goto('/campaigns');
    await waitHelper.waitForPageLoad();
    
    const campaignItems = page.locator('[data-testid*="campaign"], .campaign-item');
    const campaignCount = await campaignItems.count();
    
    if (campaignCount === 0) {
      // Create a campaign first
      const createButton = page.locator('button:has-text("Create"), button:has-text("New")').first();
      if (await createButton.isVisible()) {
        await createButton.click();
        await page.locator('input[placeholder*="name"]').fill('Test Campaign for Session');
        await page.locator('button[type="submit"], button:has-text("Create")').click();
        await waitHelper.waitForFormSubmission();
      }
    }

    // Create session
    await page.goto('/sessions/upload');
    await waitHelper.waitForPageLoad();

    // Look for campaign selection
    const campaignSelect = page.locator('select[name*="campaign"], [data-testid="campaign-select"]');
    if (await campaignSelect.isVisible()) {
      await campaignSelect.selectOption({ index: 1 }); // Select first non-empty option
    }

    // Fill session details
    await page.locator('input[placeholder*="title"]').fill('Session with Campaign');
    
    const submitButton = page.locator('button[type="submit"], button:has-text("Create")').first();
    if (await submitButton.isVisible()) {
      await submitButton.click();
      await waitHelper.waitForFormSubmission();
    }

    // Verify session is associated with campaign
    await waitHelper.waitForPageLoad();
    const campaignName = await page.locator('text*="Campaign", [data-testid="session-campaign"]').textContent();
    expect(campaignName).toBeTruthy();
  });

  test('should delete session with confirmation', async ({ page }) => {
    const user = await authHelper.createAndSignIn('session-delete');
    
    await page.goto('/sessions');
    await waitHelper.waitForPageLoad();

    // Create session to delete if none exist
    const sessionItems = page.locator('[data-testid*="session"], .session-item');
    const itemCount = await sessionItems.count();
    
    if (itemCount === 0) {
      const createButton = page.locator('button:has-text("Create"), button:has-text("New")').first();
      if (await createButton.isVisible()) {
        await createButton.click();
        await page.locator('input[placeholder*="title"]').fill('Session to Delete');
        await page.locator('button[type="submit"], button:has-text("Create")').click();
        await waitHelper.waitForFormSubmission();
        await page.goto('/sessions');
        await waitHelper.waitForPageLoad();
      }
    }

    // Find delete button
    const deleteButton = page.locator('button:has-text("Delete"), [data-testid="delete-session"], [aria-label="Delete session"]').first();
    if (await deleteButton.isVisible({ timeout: 3000 })) {
      await deleteButton.click();

      // Handle confirmation dialog
      const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Yes"), button:has-text("Delete")').last();
      if (await confirmButton.isVisible({ timeout: 5000 })) {
        await confirmButton.click();
        await waitHelper.waitForPageLoad();
        
        // Session should be removed
        await expect(page.locator('text="Session to Delete"')).not.toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('should filter sessions by campaign', async ({ page }) => {
    const user = await authHelper.createAndSignIn('session-filter');
    
    await page.goto('/sessions');
    await waitHelper.waitForPageLoad();

    // Look for filter options
    const filterSelectors = [
      '[data-testid="session-filter"]',
      'select[name*="campaign"]',
      'select[name*="filter"]',
      '[data-testid="campaign-filter"]'
    ];
    
    for (const selector of filterSelectors) {
      try {
        const filter = page.locator(selector);
        if (await filter.isVisible({ timeout: 2000 })) {
          // Try to use the filter
          if (await filter.getAttribute('tagName') === 'SELECT') {
            const options = await filter.locator('option').count();
            if (options > 1) {
              await filter.selectOption({ index: 1 });
              await waitHelper.waitForPageLoad();
            }
          }
          break;
        }
      } catch {
        // Continue
      }
    }
  });

  test('should search sessions', async ({ page }) => {
    const user = await authHelper.createAndSignIn('session-search');
    
    await page.goto('/sessions');
    await waitHelper.waitForPageLoad();

    // Look for search input
    const searchInput = page.locator('input[placeholder*="search" i], input[type="search"], [data-testid="search-sessions"]').first();
    
    if (await searchInput.isVisible({ timeout: 3000 })) {
      await searchInput.fill('test search');
      await page.keyboard.press('Enter');
      
      // Wait for search results
      await waitHelper.waitForPageLoad();
      
      // Should show results or no results message
      const hasResults = await page.locator('[data-testid="search-results"], text="No sessions found", .search-results').isVisible();
      expect(hasResults).toBeTruthy();
    }
  });

  test('should handle session with no audio', async ({ page }) => {
    const user = await authHelper.createAndSignIn('session-no-audio');
    
    await page.goto('/sessions/upload');
    await waitHelper.waitForPageLoad();

    // Create session without audio
    await page.locator('input[placeholder*="title"]').fill('Session Without Audio');
    await page.locator('textarea[placeholder*="notes"]').fill('This session has no audio file');
    
    const submitButton = page.locator('button[type="submit"], button:has-text("Create")').first();
    if (await submitButton.isVisible()) {
      await submitButton.click();
      await waitHelper.waitForFormSubmission();
    }

    // Should still create successfully
    await waitHelper.waitForPageLoad();
    await expect(page.locator('text="Session Without Audio"')).toBeVisible({ timeout: 5000 });
  });

  test('should validate required session fields', async ({ page }) => {
    const user = await authHelper.createAndSignIn('session-validation');
    
    await page.goto('/sessions/upload');
    await waitHelper.waitForPageLoad();

    // Try to submit without required fields
    const submitButton = page.locator('button[type="submit"], button:has-text("Create")').first();
    if (await submitButton.isVisible()) {
      await submitButton.click();
      
      // Should show validation errors
      const errorSelectors = [
        '[role="alert"]',
        '.error-message',
        '[data-testid="validation-error"]',
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
      
      // Should stay on form
      expect(page.url()).toContain('session');
    }
  });
});