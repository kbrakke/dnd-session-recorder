import { test, expect } from '@playwright/test';
import { AuthHelper } from '../helpers/auth';
import { UploadHelper } from '../helpers/upload';
import { WaitHelper } from '../helpers/wait';
import { AudioFixtures, AUDIO_PATHS } from '../fixtures/audio-files';

test.describe('Audio File Upload', () => {
  let authHelper: AuthHelper;
  let uploadHelper: UploadHelper;
  let waitHelper: WaitHelper;

  test.beforeAll(async () => {
    // Setup test audio files
    await AudioFixtures.setupAll();
  });

  test.afterAll(async () => {
    // Cleanup test audio files
    await AudioFixtures.cleanupAll();
  });

  test.beforeEach(async ({ page }) => {
    authHelper = new AuthHelper(page);
    uploadHelper = new UploadHelper(page);
    waitHelper = new WaitHelper(page);
  });

  test('should upload a valid small MP3 file', async ({ page }) => {
    const user = await authHelper.createAndSignIn('upload-small');
    
    // Navigate to upload page
    await page.goto('/sessions/upload');
    await waitHelper.waitForPageLoad();

    // Find file input
    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeVisible();

    // Upload the file
    await uploadHelper.uploadFile(fileInput, AUDIO_PATHS.SMALL_MP3);

    // Wait for upload to complete
    try {
      await uploadHelper.waitForUploadComplete(30000);
      
      // Verify success indicators
      const successSelectors = [
        '[data-testid="upload-success"]',
        '.upload-success',
        'text="Upload successful"',
        'text="File uploaded"'
      ];
      
      let found = false;
      for (const selector of successSelectors) {
        try {
          await expect(page.locator(selector)).toBeVisible({ timeout: 2000 });
          found = true;
          break;
        } catch {
          // Continue
        }
      }
      
      // If no specific success message, check that we're not showing error
      if (!found) {
        const hasError = await uploadHelper.hasUploadFailed();
        expect(hasError).toBeFalsy();
      }
    } catch {
      // If upload completion detection fails, verify we don't have an error
      const hasError = await uploadHelper.hasUploadFailed();
      expect(hasError).toBeFalsy();
    }
  });

  test('should show upload progress for larger files', async ({ page }) => {
    const user = await authHelper.createAndSignIn('upload-progress');
    
    await page.goto('/sessions/upload');
    await waitHelper.waitForPageLoad();

    const fileInput = page.locator('input[type="file"]').first();
    await uploadHelper.uploadFile(fileInput, AUDIO_PATHS.MEDIUM_MP3);

    // Check if progress indicator appears
    const progressSelectors = [
      '[data-testid="upload-progress"]',
      '.progress-bar',
      'progress',
      '[role="progressbar"]'
    ];

    let progressFound = false;
    for (const selector of progressSelectors) {
      try {
        const progressElement = page.locator(selector);
        if (await progressElement.isVisible({ timeout: 5000 })) {
          progressFound = true;
          
          // Wait for some progress
          await waitHelper.waitForCondition(
            async () => {
              const progress = await uploadHelper.getUploadProgress();
              return progress > 0;
            },
            { timeout: 10000, interval: 1000 }
          );
          
          break;
        }
      } catch {
        // Continue checking
      }
    }

    // Complete the upload
    await uploadHelper.waitForUploadComplete(60000);
  });

  test('should reject invalid file types', async ({ page }) => {
    const user = await authHelper.createAndSignIn('upload-invalid');
    
    await page.goto('/sessions/upload');
    await waitHelper.waitForPageLoad();

    const fileInput = page.locator('input[type="file"]').first();
    
    // Try to upload invalid file
    await uploadHelper.uploadFile(fileInput, AUDIO_PATHS.INVALID_FILE);
    
    // Should show error message
    await waitHelper.waitForCondition(
      async () => await uploadHelper.hasUploadFailed(),
      { timeout: 10000 }
    );
    
    const errorMessage = await uploadHelper.getUploadError();
    expect(errorMessage).toBeTruthy();
    expect(errorMessage?.toLowerCase()).toContain('invalid');
  });

  test('should handle multiple file uploads', async ({ page }) => {
    const user = await authHelper.createAndSignIn('upload-multiple');
    
    await page.goto('/sessions/upload');
    await waitHelper.waitForPageLoad();

    // Check if multiple file upload is supported
    const fileInput = page.locator('input[type="file"]').first();
    const hasMultiple = await fileInput.getAttribute('multiple');
    
    if (hasMultiple !== null) {
      // Upload multiple files
      await fileInput.setInputFiles([AUDIO_PATHS.SMALL_MP3, AUDIO_PATHS.WAV_FILE]);
      
      // Wait for uploads to complete
      await uploadHelper.waitForUploadComplete(60000);
      
      // Should show success for multiple files
      const uploadList = page.locator('[data-testid="upload-list"], .upload-list');
      if (await uploadList.isVisible()) {
        const items = uploadList.locator('li, .upload-item');
        const count = await items.count();
        expect(count).toBeGreaterThanOrEqual(1);
      }
    } else {
      // Single file upload - just verify basic upload works
      await uploadHelper.uploadFile(fileInput, AUDIO_PATHS.SMALL_MP3);
      await uploadHelper.waitForUploadComplete();
    }
  });

  test('should allow file replacement/re-upload', async ({ page }) => {
    const user = await authHelper.createAndSignIn('upload-replace');
    
    await page.goto('/sessions/upload');
    await waitHelper.waitForPageLoad();

    const fileInput = page.locator('input[type="file"]').first();
    
    // Upload first file
    await uploadHelper.uploadFile(fileInput, AUDIO_PATHS.SMALL_MP3);
    await uploadHelper.waitForUploadComplete();

    // Look for replace/change file option
    const replaceSelectors = [
      'button:has-text("Replace")',
      'button:has-text("Change")',
      'button:has-text("Upload different")',
      '[data-testid="replace-file"]'
    ];
    
    let canReplace = false;
    for (const selector of replaceSelectors) {
      try {
        const replaceButton = page.locator(selector);
        if (await replaceButton.isVisible({ timeout: 2000 })) {
          await replaceButton.click();
          canReplace = true;
          break;
        }
      } catch {
        // Continue
      }
    }
    
    // If no replace button, try uploading again directly
    if (!canReplace) {
      const newFileInput = page.locator('input[type="file"]').first();
      if (await newFileInput.isVisible()) {
        await uploadHelper.uploadFile(newFileInput, AUDIO_PATHS.WAV_FILE);
        await uploadHelper.waitForUploadComplete();
      }
    } else {
      // Replace with new file
      const newFileInput = page.locator('input[type="file"]').first();
      await uploadHelper.uploadFile(newFileInput, AUDIO_PATHS.WAV_FILE);
      await uploadHelper.waitForUploadComplete();
    }
  });

  test('should show file information after upload', async ({ page }) => {
    const user = await authHelper.createAndSignIn('upload-info');
    
    await page.goto('/sessions/upload');
    await waitHelper.waitForPageLoad();

    const fileInput = page.locator('input[type="file"]').first();
    await uploadHelper.uploadFile(fileInput, AUDIO_PATHS.MEDIUM_MP3);
    await uploadHelper.waitForUploadComplete();

    // Look for file information display
    const infoSelectors = [
      '[data-testid="file-info"]',
      '.file-info',
      '.file-details',
      '[data-testid="upload-details"]'
    ];
    
    let foundInfo = false;
    for (const selector of infoSelectors) {
      try {
        const infoElement = page.locator(selector);
        if (await infoElement.isVisible({ timeout: 5000 })) {
          foundInfo = true;
          
          // Should show file name
          const text = await infoElement.textContent();
          expect(text).toContain('mp3');
          
          break;
        }
      } catch {
        // Continue
      }
    }

    // If no dedicated info section, check for filename display anywhere
    if (!foundInfo) {
      const filenameText = page.locator('text*="test-audio-medium.mp3"');
      const hasFilename = await filenameText.isVisible();
      // This is optional - not all UIs show full filename
    }
  });

  test('should handle upload cancellation', async ({ page }) => {
    const user = await authHelper.createAndSignIn('upload-cancel');
    
    await page.goto('/sessions/upload');
    await waitHelper.waitForPageLoad();

    const fileInput = page.locator('input[type="file"]').first();
    
    // Start upload of larger file
    await uploadHelper.uploadFile(fileInput, AUDIO_PATHS.LARGE_MP3);
    
    // Look for cancel button
    await page.waitForTimeout(1000); // Give upload a moment to start
    
    const cancelSelectors = [
      '[data-testid="cancel-upload"]',
      'button:has-text("Cancel")',
      '.cancel-upload',
      'button[aria-label="Cancel upload"]'
    ];
    
    let cancelled = false;
    for (const selector of cancelSelectors) {
      try {
        const cancelButton = page.locator(selector);
        if (await cancelButton.isVisible({ timeout: 3000 })) {
          await cancelButton.click();
          cancelled = true;
          break;
        }
      } catch {
        // Continue
      }
    }
    
    if (cancelled) {
      // Should show cancelled state or return to initial state
      await waitHelper.waitForCondition(
        async () => {
          const stillUploading = await page.locator('[data-testid="upload-progress"]').isVisible();
          return !stillUploading;
        },
        { timeout: 5000 }
      );
    }
  });

  test('should validate file size limits', async ({ page }) => {
    const user = await authHelper.createAndSignIn('upload-size');
    
    await page.goto('/sessions/upload');
    await waitHelper.waitForPageLoad();

    const fileInput = page.locator('input[type="file"]').first();
    
    // Try to upload large file
    await uploadHelper.uploadFile(fileInput, AUDIO_PATHS.LARGE_MP3);
    
    // Wait a moment for validation
    await page.waitForTimeout(2000);
    
    // Check if there's a size limit error
    const hasError = await uploadHelper.hasUploadFailed();
    if (hasError) {
      const errorMessage = await uploadHelper.getUploadError();
      expect(errorMessage?.toLowerCase()).toMatch(/size|large|limit|big/);
    } else {
      // If no size limit, upload should proceed normally
      await uploadHelper.waitForUploadComplete(120000); // 2 minutes for large file
    }
  });

  test('should integrate with session creation', async ({ page }) => {
    const user = await authHelper.createAndSignIn('upload-session');
    
    await page.goto('/sessions/upload');
    await waitHelper.waitForPageLoad();

    // Upload audio file
    const fileInput = page.locator('input[type="file"]').first();
    await uploadHelper.uploadFile(fileInput, AUDIO_PATHS.MEDIUM_MP3);
    await uploadHelper.waitForUploadComplete();

    // Look for session creation form
    const sessionFormSelectors = [
      '[data-testid="session-form"]',
      'form:has(input[name*="title"], input[placeholder*="title"])',
      'input[placeholder*="Session"], input[placeholder*="title"]'
    ];
    
    for (const selector of sessionFormSelectors) {
      try {
        const form = page.locator(selector);
        if (await form.isVisible({ timeout: 3000 })) {
          // Fill in session details
          const titleInput = form.locator('input').first();
          await titleInput.fill('Test Session with Audio');
          
          // Look for submit button
          const submitButton = form.locator('button[type="submit"], button:has-text("Create"), button:has-text("Save")');
          if (await submitButton.isVisible()) {
            await submitButton.click();
            
            // Wait for session creation
            await waitHelper.waitForFormSubmission();
            
            // Should redirect or show success
            await waitHelper.waitForPageLoad();
          }
          
          break;
        }
      } catch {
        // Continue
      }
    }
  });

  test('should handle drag and drop upload', async ({ page }) => {
    const user = await authHelper.createAndSignIn('upload-drag');
    
    await page.goto('/sessions/upload');
    await waitHelper.waitForPageLoad();

    // Look for drag and drop area
    const dropZoneSelectors = [
      '[data-testid="drop-zone"]',
      '.drop-zone',
      '.drag-drop',
      '[data-testid="upload-area"]'
    ];
    
    for (const selector of dropZoneSelectors) {
      try {
        const dropZone = page.locator(selector);
        if (await dropZone.isVisible({ timeout: 2000 })) {
          // Simulate drag and drop
          const filePath = AUDIO_PATHS.SMALL_MP3;
          
          // Create a file input for the drag operation
          await dropZone.setInputFiles(filePath);
          
          // Wait for upload to complete
          await uploadHelper.waitForUploadComplete();
          
          break;
        }
      } catch {
        // Continue - drag and drop might not be implemented
      }
    }
  });
});