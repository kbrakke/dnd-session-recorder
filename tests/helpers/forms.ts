import { Page, Locator } from '@playwright/test';

export class FormHelper {
  constructor(private page: Page) {}

  /**
   * Fill a form field by placeholder or name
   */
  async fillField(field: string, value: string): Promise<boolean> {
    const selectors = [
      `input[placeholder*="${field}" i]`,
      `input[name*="${field}" i]`,
      `textarea[placeholder*="${field}" i]`,
      `textarea[name*="${field}" i]`,
      `[data-testid*="${field}" i] input`,
      `[data-testid*="${field}" i] textarea`
    ];

    for (const selector of selectors) {
      try {
        const element = this.page.locator(selector).first();
        if (await element.isVisible({ timeout: 2000 })) {
          await element.fill(value);
          return true;
        }
      } catch {
        // Continue to next selector
      }
    }
    return false;
  }

  /**
   * Submit form with proper validation waiting
   */
  async submitForm(options: { timeout?: number } = {}): Promise<boolean> {
    const { timeout = 15000 } = options;
    
    // Look for submit button
    const submitSelectors = [
      'button[type="submit"]',
      'button:has-text("Create")',
      'button:has-text("Save")',
      'button:has-text("Submit")',
      'input[type="submit"]'
    ];

    let submitButton: Locator | null = null;
    for (const selector of submitSelectors) {
      try {
        const button = this.page.locator(selector).first();
        if (await button.isVisible({ timeout: 2000 })) {
          submitButton = button;
          break;
        }
      } catch {
        // Continue
      }
    }

    if (!submitButton) {
      return false;
    }

    try {
      // Check if button is disabled
      const isDisabled = await submitButton.isDisabled();
      
      if (isDisabled) {
        // Wait for button to be enabled
        try {
          await this.page.waitForFunction(() => {
            const buttons = document.querySelectorAll('button[type="submit"], button');
            return Array.from(buttons).some(btn => {
              const button = btn as HTMLButtonElement;
              if (button.disabled) return false;
              const text = button.textContent?.toLowerCase() || '';
              return button.type === 'submit' || text.includes('create') || text.includes('save') || text.includes('submit');
            });
          }, { timeout: 10000 });
        } catch (waitError) {
          console.log('Submit button remained disabled after 10s wait');
          
          // Try to diagnose why the button is disabled
          const hasErrors = await this.hasValidationErrors();
          if (hasErrors) {
            console.log('Form has validation errors');
          }
          
          // Check if required fields are filled
          const requiredInputs = await this.page.locator('input[required], textarea[required], select[required]').all();
          for (const input of requiredInputs) {
            const value = await input.inputValue().catch(() => '');
            const name = await input.getAttribute('name') || await input.getAttribute('placeholder') || 'unknown';
            if (!value) {
              console.log(`Required field not filled: ${name}`);
            }
          }
          
          return false;
        }
      }

      await submitButton.click();
      
      // Wait for form submission to complete
      await this.waitForSubmissionComplete(timeout);
      return true;
    } catch (error) {
      console.log('Form submission failed:', error);
      return false;
    }
  }

  /**
   * Wait for form submission to complete
   */
  private async waitForSubmissionComplete(timeout: number): Promise<void> {
    // Wait for either:
    // 1. URL change (redirect)
    // 2. Success message
    // 3. Loading state to disappear
    
    const currentUrl = this.page.url();
    
    try {
      await Promise.race([
        // URL change (redirect)
        this.page.waitForFunction((url) => window.location.href !== url, currentUrl, { timeout }),
        
        // Success message appears
        this.page.waitForSelector([
          '[data-testid="success-message"]',
          '[data-testid="form-success"]',
          '.success-message',
          'text="Success"',
          'text="Created"',
          'text="Saved"'
        ].join(', '), { timeout }),
        
        // Loading spinner disappears
        this.page.waitForSelector([
          '[data-testid="loading"]',
          '.loading',
          '.spinner',
          '[disabled]'
        ].join(', '), { state: 'hidden', timeout })
      ]);
    } catch {
      // If none of the above work, just wait for network idle
      await this.page.waitForLoadState('networkidle', { timeout: Math.min(timeout, 10000) });
    }
  }

  /**
   * Fill out a complete session form
   */
  async fillSessionForm(data: { title: string; notes?: string; campaign?: string }): Promise<void> {
    await this.fillField('title', data.title);
    
    if (data.notes) {
      await this.fillField('notes', data.notes);
    }
    
    if (data.campaign) {
      // Try to select campaign
      const campaignSelect = this.page.locator('select[name*="campaign"], [data-testid="campaign-select"]').first();
      if (await campaignSelect.isVisible({ timeout: 2000 })) {
        const options = await campaignSelect.locator('option').allTextContents();
        const matchingOption = options.find(opt => opt.includes(data.campaign!));
        if (matchingOption) {
          await campaignSelect.selectOption({ label: matchingOption });
        }
      }
    }
  }

  /**
   * Fill out a complete campaign form
   */
  async fillCampaignForm(data: { name: string; description?: string; players?: string[] }): Promise<void> {
    await this.fillField('name', data.name);
    
    if (data.description) {
      await this.fillField('description', data.description);
    }
    
    if (data.players) {
      await this.fillField('players', data.players.join(', '));
    }
  }

  /**
   * Check if form has validation errors
   */
  async hasValidationErrors(): Promise<boolean> {
    const errorSelectors = [
      '[role="alert"]',
      '.error-message',
      '[data-testid="validation-error"]',
      '.field-error',
      'text="required" i',
      'text="invalid" i'
    ];

    for (const selector of errorSelectors) {
      try {
        if (await this.page.locator(selector).isVisible({ timeout: 1000 })) {
          return true;
        }
      } catch {
        // Continue
      }
    }
    return false;
  }
}