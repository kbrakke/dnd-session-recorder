import { Page, Locator } from '@playwright/test';

export class WaitHelper {
  constructor(private page: Page) {}

  /**
   * Wait for an element to appear and be visible
   */
  async waitForVisible(selector: string, timeout: number = 10000): Promise<void> {
    await this.page.waitForSelector(selector, {
      state: 'visible',
      timeout,
    });
  }

  /**
   * Wait for an element to disappear
   */
  async waitForHidden(selector: string, timeout: number = 10000): Promise<void> {
    await this.page.waitForSelector(selector, {
      state: 'hidden',
      timeout,
    });
  }

  /**
   * Wait for page to load completely
   */
  async waitForPageLoad(timeout: number = 30000): Promise<void> {
    await this.page.waitForLoadState('networkidle', { timeout });
  }

  /**
   * Wait for API request to complete
   */
  async waitForApiRequest(urlPattern: string | RegExp, timeout: number = 10000): Promise<void> {
    await this.page.waitForResponse(urlPattern, { timeout });
  }

  /**
   * Wait for multiple API requests to complete
   */
  async waitForApiRequests(urlPatterns: (string | RegExp)[], timeout: number = 15000): Promise<void> {
    const promises = urlPatterns.map(pattern => 
      this.page.waitForResponse(pattern, { timeout })
    );
    await Promise.all(promises);
  }

  /**
   * Wait for loading spinner to disappear
   */
  async waitForLoadingComplete(timeout: number = 30000): Promise<void> {
    const loadingSelectors = [
      '[data-testid="loading"]',
      '.loading',
      '.spinner',
      '[data-testid="spinner"]',
      '.loading-overlay'
    ];

    for (const selector of loadingSelectors) {
      try {
        await this.page.waitForSelector(selector, { state: 'hidden', timeout: 2000 });
      } catch {
        // Continue if selector not found
      }
    }
  }

  /**
   * Wait for form submission to complete
   */
  async waitForFormSubmission(timeout: number = 15000): Promise<void> {
    // Wait for form to be submitted (button disabled or success message)
    const successSelectors = [
      '[data-testid="form-success"]',
      '.form-success',
      '[data-testid="success-message"]',
      '.success-message'
    ];

    const submitButton = this.page.locator('button[type="submit"], input[type="submit"]');
    
    // Check if submit button becomes disabled or if success message appears
    await Promise.race([
      // Wait for success message
      this.page.waitForSelector(successSelectors.join(', '), { timeout }),
      // Or wait for button to be re-enabled (indicating completion)
      submitButton.waitFor({ state: 'attached', timeout }).then(async () => {
        if (await submitButton.isDisabled()) {
          await submitButton.waitFor({ state: 'attached', timeout });
        }
      })
    ]);
  }

  /**
   * Wait for data to load in a table or list
   */
  async waitForDataLoad(containerSelector: string, timeout: number = 10000): Promise<void> {
    const container = this.page.locator(containerSelector);
    
    // Wait for container to be visible
    await container.waitFor({ state: 'visible', timeout });
    
    // Wait for loading state to finish
    await this.waitForLoadingComplete(timeout);
    
    // Ensure we have some content
    await this.page.waitForFunction(
      (selector) => {
        const element = document.querySelector(selector);
        return element && element.children.length > 0;
      },
      containerSelector,
      { timeout }
    );
  }

  /**
   * Wait with custom condition
   */
  async waitForCondition(
    condition: () => Promise<boolean> | boolean,
    options: { timeout?: number; interval?: number } = {}
  ): Promise<void> {
    const { timeout = 10000, interval = 500 } = options;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return;
      }
      await this.page.waitForTimeout(interval);
    }

    throw new Error(`Condition not met within ${timeout}ms`);
  }

  /**
   * Wait for AI processing to complete (transcription/summary)
   */
  async waitForAiProcessing(timeout: number = 120000): Promise<void> {
    const processingSelectors = [
      '[data-testid="ai-processing"]',
      '.ai-processing',
      '[data-testid="transcription-processing"]',
      '[data-testid="summary-processing"]'
    ];

    const completeSelectors = [
      '[data-testid="ai-complete"]',
      '.ai-complete',
      '[data-testid="transcription-complete"]',
      '[data-testid="summary-complete"]'
    ];

    // Wait for either processing to complete or complete indicator to appear
    await Promise.race([
      this.page.waitForSelector(processingSelectors.join(', '), { state: 'hidden', timeout }),
      this.page.waitForSelector(completeSelectors.join(', '), { state: 'visible', timeout })
    ]);
  }
}