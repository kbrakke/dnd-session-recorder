import { Page, Locator } from '@playwright/test';

export class UploadHelper {
  constructor(private page: Page) {}

  /**
   * Upload a file using the file input
   */
  async uploadFile(fileInput: Locator, filePath: string): Promise<void> {
    await fileInput.setInputFiles(filePath);
  }

  /**
   * Wait for upload to complete
   */
  async waitForUploadComplete(timeout: number = 60000): Promise<void> {
    await this.page.waitForSelector('[data-testid="upload-complete"], .upload-success', {
      timeout,
    });
  }

  /**
   * Get upload progress percentage
   */
  async getUploadProgress(): Promise<number> {
    const progressBar = this.page.locator('[data-testid="upload-progress"], .progress-bar');
    const value = await progressBar.getAttribute('value');
    const ariaValueNow = await progressBar.getAttribute('aria-valuenow');
    
    if (value) {
      return parseInt(value);
    } else if (ariaValueNow) {
      return parseInt(ariaValueNow);
    }
    
    return 0;
  }

  /**
   * Wait for upload progress to reach a certain percentage
   */
  async waitForProgress(targetProgress: number, timeout: number = 30000): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const currentProgress = await this.getUploadProgress();
      if (currentProgress >= targetProgress) {
        return;
      }
      await this.page.waitForTimeout(500);
    }
    
    throw new Error(`Upload did not reach ${targetProgress}% within ${timeout}ms`);
  }

  /**
   * Check if upload has failed
   */
  async hasUploadFailed(): Promise<boolean> {
    const errorSelector = '[data-testid="upload-error"], .upload-error, [role="alert"]';
    const errorElement = this.page.locator(errorSelector);
    return await errorElement.isVisible();
  }

  /**
   * Get upload error message
   */
  async getUploadError(): Promise<string | null> {
    const errorSelector = '[data-testid="upload-error"], .upload-error, [role="alert"]';
    const errorElement = this.page.locator(errorSelector);
    
    if (await errorElement.isVisible()) {
      return await errorElement.textContent();
    }
    
    return null;
  }

  /**
   * Cancel ongoing upload
   */
  async cancelUpload(): Promise<void> {
    const cancelButton = this.page.locator('[data-testid="cancel-upload"], .cancel-upload');
    if (await cancelButton.isVisible()) {
      await cancelButton.click();
    }
  }

  /**
   * Retry failed upload
   */
  async retryUpload(): Promise<void> {
    const retryButton = this.page.locator('[data-testid="retry-upload"], .retry-upload');
    if (await retryButton.isVisible()) {
      await retryButton.click();
    }
  }
}