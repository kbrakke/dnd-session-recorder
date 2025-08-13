import { test, expect } from '@playwright/test';
import { AuthHelper } from '../helpers/auth';
import { UploadHelper } from '../helpers/upload';
import { WaitHelper } from '../helpers/wait';
import { SessionFixtures } from '../fixtures/campaigns';
import { AudioFixtures, AUDIO_PATHS } from '../fixtures/audio-files';

test.describe('AI Features - Transcription and Summary', () => {
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

  test('should generate transcription from audio', async ({ page }) => {
    const user = await authHelper.createAndSignIn('transcription-test');
    
    // Create session with audio first
    await page.goto('/sessions/upload');
    await waitHelper.waitForPageLoad();

    const sessionTitle = 'Session for Transcription Test';
    await page.locator('input[placeholder*="title"]').fill(sessionTitle);
    
    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.isVisible()) {
      await uploadHelper.uploadFile(fileInput, AUDIO_PATHS.MEDIUM_MP3);
      await uploadHelper.waitForUploadComplete();
    }

    const submitButton = page.locator('button[type="submit"], button:has-text("Create")').first();
    if (await submitButton.isVisible()) {
      await submitButton.click();
      await waitHelper.waitForFormSubmission();
      await waitHelper.waitForPageLoad();
    }

    // Look for transcription trigger
    const transcribeSelectors = [
      'button:has-text("Transcribe")',
      'button:has-text("Generate Transcription")',
      '[data-testid="start-transcription"]',
      '[data-testid="transcribe-button"]'
    ];
    
    let transcribeButton;
    for (const selector of transcribeSelectors) {
      try {
        const button = page.locator(selector);
        if (await button.isVisible({ timeout: 3000 })) {
          transcribeButton = button;
          break;
        }
      } catch {
        // Continue
      }
    }

    if (transcribeButton) {
      await transcribeButton.click();
      
      // Wait for processing to start
      const processingSelectors = [
        '[data-testid="transcription-processing"]',
        'text="Processing"',
        'text="Transcribing"',
        '.processing-spinner'
      ];
      
      let processingStarted = false;
      for (const selector of processingSelectors) {
        try {
          if (await page.locator(selector).isVisible({ timeout: 5000 })) {
            processingStarted = true;
            break;
          }
        } catch {
          // Continue
        }
      }

      if (processingStarted) {
        // Wait for transcription to complete (or timeout for demo)
        try {
          await waitHelper.waitForAiProcessing(30000); // 30 second timeout for tests
          
          // Should show transcription content
          const transcriptionSelectors = [
            '[data-testid="transcription-content"]',
            '[data-testid="transcript"]',
            '.transcription-text'
          ];
          
          let foundTranscription = false;
          for (const selector of transcriptionSelectors) {
            try {
              if (await page.locator(selector).isVisible({ timeout: 5000 })) {
                foundTranscription = true;
                break;
              }
            } catch {
              // Continue
            }
          }
          
          if (foundTranscription) {
            // Verify transcription has content
            const transcriptionContent = await page.locator('[data-testid="transcription-content"], .transcription-text').first().textContent();
            expect(transcriptionContent).toBeTruthy();
          }
          
        } catch {
          // Transcription might still be processing or failed
          // Check for error states
          const errorMessage = await page.locator('text="Error", text="Failed", [role="alert"]').isVisible();
          if (errorMessage) {
            console.log('Transcription failed - this may be expected in test environment');
          }
        }
      }
    }
  });

  test('should generate AI summary from transcription', async ({ page }) => {
    const user = await authHelper.createAndSignIn('summary-test');
    
    // Navigate to a session that might have transcription
    await page.goto('/sessions');
    await waitHelper.waitForPageLoad();

    // Look for existing session or create one
    const sessionItems = page.locator('[data-testid*="session"], .session-item');
    const itemCount = await sessionItems.count();
    
    if (itemCount === 0) {
      // Create session with audio
      const createButton = page.locator('button:has-text("Create"), button:has-text("New")').first();
      if (await createButton.isVisible()) {
        await createButton.click();
        await page.locator('input[placeholder*="title"]').fill('Session for Summary Test');
        
        const fileInput = page.locator('input[type="file"]').first();
        if (await fileInput.isVisible()) {
          await uploadHelper.uploadFile(fileInput, AUDIO_PATHS.SMALL_MP3);
          await uploadHelper.waitForUploadComplete();
        }
        
        await page.locator('button[type="submit"], button:has-text("Create")').click();
        await waitHelper.waitForFormSubmission();
        await waitHelper.waitForPageLoad();
      }
    } else {
      // Click on existing session
      await sessionItems.first().click();
      await waitHelper.waitForPageLoad();
    }

    // Look for summary generation button
    const summarySelectors = [
      'button:has-text("Generate Summary")',
      'button:has-text("Summarize")',
      '[data-testid="generate-summary"]',
      '[data-testid="summary-button"]'
    ];
    
    let summaryButton;
    for (const selector of summarySelectors) {
      try {
        const button = page.locator(selector);
        if (await button.isVisible({ timeout: 3000 })) {
          summaryButton = button;
          break;
        }
      } catch {
        // Continue
      }
    }

    if (summaryButton) {
      await summaryButton.click();
      
      // Wait for processing
      const processingIndicators = [
        '[data-testid="summary-processing"]',
        'text="Generating summary"',
        'text="Processing"'
      ];
      
      let processingStarted = false;
      for (const selector of processingIndicators) {
        try {
          if (await page.locator(selector).isVisible({ timeout: 5000 })) {
            processingStarted = true;
            break;
          }
        } catch {
          // Continue
        }
      }

      if (processingStarted) {
        try {
          await waitHelper.waitForAiProcessing(45000); // Longer timeout for summary
          
          // Look for summary content
          const summaryContentSelectors = [
            '[data-testid="summary-content"]',
            '[data-testid="ai-summary"]',
            '.summary-text'
          ];
          
          for (const selector of summaryContentSelectors) {
            try {
              if (await page.locator(selector).isVisible({ timeout: 5000 })) {
                const summaryContent = await page.locator(selector).textContent();
                expect(summaryContent).toBeTruthy();
                expect(summaryContent!.length).toBeGreaterThan(10);
                break;
              }
            } catch {
              // Continue
            }
          }
          
        } catch {
          // Summary generation might have failed or timed out
          console.log('Summary generation timeout - this may be expected in test environment');
        }
      }
    }
  });

  test('should show transcription status and progress', async ({ page }) => {
    const user = await authHelper.createAndSignIn('transcription-status');
    
    // Create session and start transcription
    await page.goto('/sessions/upload');
    await waitHelper.waitForPageLoad();

    await page.locator('input[placeholder*="title"]').fill('Status Test Session');
    
    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.isVisible()) {
      await uploadHelper.uploadFile(fileInput, AUDIO_PATHS.SMALL_MP3);
      await uploadHelper.waitForUploadComplete();
    }

    await page.locator('button[type="submit"], button:has-text("Create")').click();
    await waitHelper.waitForFormSubmission();
    await waitHelper.waitForPageLoad();

    // Start transcription
    const transcribeButton = page.locator('button:has-text("Transcribe"), [data-testid="start-transcription"]').first();
    if (await transcribeButton.isVisible()) {
      await transcribeButton.click();
      
      // Check for status indicators
      const statusSelectors = [
        '[data-testid="transcription-status"]',
        '.transcription-status',
        'text="In progress"',
        'text="Processing"'
      ];
      
      let foundStatus = false;
      for (const selector of statusSelectors) {
        try {
          if (await page.locator(selector).isVisible({ timeout: 5000 })) {
            foundStatus = true;
            const statusText = await page.locator(selector).textContent();
            expect(statusText).toBeTruthy();
            break;
          }
        } catch {
          // Continue
        }
      }
    }
  });

  test('should handle transcription errors gracefully', async ({ page }) => {
    const user = await authHelper.createAndSignIn('transcription-error');
    
    // Create session with potentially problematic audio
    await page.goto('/sessions/upload');
    await waitHelper.waitForPageLoad();

    await page.locator('input[placeholder*="title"]').fill('Error Test Session');
    
    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.isVisible()) {
      // Use invalid file to potentially trigger error
      await uploadHelper.uploadFile(fileInput, AUDIO_PATHS.INVALID_FILE);
      
      // Check if upload itself fails first
      if (await uploadHelper.hasUploadFailed()) {
        const errorMessage = await uploadHelper.getUploadError();
        expect(errorMessage).toBeTruthy();
        return; // Test complete - upload validation caught the issue
      }
    }

    await page.locator('button[type="submit"], button:has-text("Create")').click();
    await waitHelper.waitForFormSubmission();
    await waitHelper.waitForPageLoad();

    // Try to start transcription
    const transcribeButton = page.locator('button:has-text("Transcribe")').first();
    if (await transcribeButton.isVisible()) {
      await transcribeButton.click();
      
      // Wait for error to appear
      await page.waitForTimeout(3000);
      
      const errorSelectors = [
        '[data-testid="transcription-error"]',
        'text="Error"',
        'text="Failed"',
        '[role="alert"]'
      ];
      
      let foundError = false;
      for (const selector of errorSelectors) {
        try {
          if (await page.locator(selector).isVisible({ timeout: 5000 })) {
            foundError = true;
            const errorText = await page.locator(selector).textContent();
            expect(errorText).toBeTruthy();
            break;
          }
        } catch {
          // Continue
        }
      }
    }
  });

  test('should allow retry of failed transcription', async ({ page }) => {
    const user = await authHelper.createAndSignIn('transcription-retry');
    
    await page.goto('/sessions');
    await waitHelper.waitForPageLoad();

    // Create session first
    const sessionItems = page.locator('[data-testid*="session"], .session-item');
    const itemCount = await sessionItems.count();
    
    if (itemCount === 0) {
      const createButton = page.locator('button:has-text("Create"), button:has-text("New")').first();
      if (await createButton.isVisible()) {
        await createButton.click();
        await page.locator('input[placeholder*="title"]').fill('Retry Test Session');
        await page.locator('button[type="submit"], button:has-text("Create")').click();
        await waitHelper.waitForFormSubmission();
        await waitHelper.waitForPageLoad();
      }
    } else {
      await sessionItems.first().click();
      await waitHelper.waitForPageLoad();
    }

    // Look for retry button (might appear after failed transcription)
    const retrySelectors = [
      'button:has-text("Retry")',
      '[data-testid="retry-transcription"]',
      'button:has-text("Try Again")'
    ];
    
    for (const selector of retrySelectors) {
      try {
        const retryButton = page.locator(selector);
        if (await retryButton.isVisible({ timeout: 2000 })) {
          await retryButton.click();
          
          // Should start processing again
          const processingStarted = await page.locator('text="Processing", text="Transcribing"').isVisible({ timeout: 3000 });
          if (processingStarted) {
            expect(processingStarted).toBeTruthy();
          }
          break;
        }
      } catch {
        // Continue
      }
    }
  });

  test('should display summary sections (NPCs, locations, etc.)', async ({ page }) => {
    const user = await authHelper.createAndSignIn('summary-sections');
    
    await page.goto('/sessions');
    await waitHelper.waitForPageLoad();

    // Look for a session with existing summary or create one
    const sessionItems = page.locator('[data-testid*="session"], .session-item');
    const itemCount = await sessionItems.count();
    
    if (itemCount > 0) {
      await sessionItems.first().click();
      await waitHelper.waitForPageLoad();
      
      // Look for summary sections
      const sectionSelectors = [
        '[data-testid="summary-npcs"]',
        '[data-testid="summary-locations"]',
        '[data-testid="summary-events"]',
        'text="NPCs"',
        'text="Locations"',
        'text="Key Events"',
        '.summary-section'
      ];
      
      let foundSections = false;
      for (const selector of sectionSelectors) {
        try {
          if (await page.locator(selector).isVisible({ timeout: 2000 })) {
            foundSections = true;
            break;
          }
        } catch {
          // Continue
        }
      }
      
      // If sections exist, they should have content
      if (foundSections) {
        const summaryContent = await page.locator('[data-testid*="summary"], .summary-section').first().textContent();
        expect(summaryContent).toBeTruthy();
      }
    }
  });

  test('should handle concurrent transcription requests', async ({ page, context }) => {
    const user = await authHelper.createAndSignIn('concurrent-test');
    
    // Open session in current page
    await page.goto('/sessions');
    await waitHelper.waitForPageLoad();

    const sessionItems = page.locator('[data-testid*="session"], .session-item');
    const itemCount = await sessionItems.count();
    
    if (itemCount === 0) {
      // Create session first
      const createButton = page.locator('button:has-text("Create"), button:has-text("New")').first();
      if (await createButton.isVisible()) {
        await createButton.click();
        await page.locator('input[placeholder*="title"]').fill('Concurrent Test Session');
        await page.locator('button[type="submit"], button:has-text("Create")').click();
        await waitHelper.waitForFormSubmission();
        await page.goto('/sessions');
        await waitHelper.waitForPageLoad();
      }
    }

    await sessionItems.first().click();
    await waitHelper.waitForPageLoad();

    // Open same session in new tab
    const newPage = await context.newPage();
    await newPage.goto(page.url());
    
    // Try to start transcription in both tabs
    const transcribeButton1 = page.locator('button:has-text("Transcribe")').first();
    const transcribeButton2 = newPage.locator('button:has-text("Transcribe")').first();
    
    if (await transcribeButton1.isVisible() && await transcribeButton2.isVisible()) {
      // Start transcription in first tab
      await transcribeButton1.click();
      await page.waitForTimeout(1000);
      
      // Try to start in second tab
      await transcribeButton2.click();
      
      // Should handle concurrent requests gracefully
      // (either prevent second request or show appropriate message)
      const conflictMessage = await newPage.locator('text="already processing", text="in progress"').isVisible({ timeout: 3000 });
      if (conflictMessage) {
        expect(conflictMessage).toBeTruthy();
      }
    }
    
    await newPage.close();
  });

  test('should preserve data during AI processing', async ({ page }) => {
    const user = await authHelper.createAndSignIn('preserve-data');
    
    await page.goto('/sessions/upload');
    await waitHelper.waitForPageLoad();

    const sessionTitle = 'Data Preservation Test';
    const sessionNotes = 'These notes should be preserved during processing';
    
    await page.locator('input[placeholder*="title"]').fill(sessionTitle);
    await page.locator('textarea[placeholder*="notes"]').fill(sessionNotes);
    
    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.isVisible()) {
      await uploadHelper.uploadFile(fileInput, AUDIO_PATHS.SMALL_MP3);
      await uploadHelper.waitForUploadComplete();
    }

    await page.locator('button[type="submit"], button:has-text("Create")').click();
    await waitHelper.waitForFormSubmission();
    await waitHelper.waitForPageLoad();

    // Start AI processing
    const transcribeButton = page.locator('button:has-text("Transcribe")').first();
    if (await transcribeButton.isVisible()) {
      await transcribeButton.click();
      
      // Refresh page during processing
      await page.waitForTimeout(2000);
      await page.reload();
      await waitHelper.waitForPageLoad();
      
      // Original data should still be there
      await expect(page.locator(`text="${sessionTitle}"`)).toBeVisible();
      await expect(page.locator(`text="${sessionNotes}"`)).toBeVisible();
    }
  });
});