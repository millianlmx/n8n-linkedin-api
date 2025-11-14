import { Page } from 'puppeteer-core';
import { Solver } from '@2captcha/captcha-solver';
import dotenv from 'dotenv';

// Ensure environment variables are loaded
dotenv.config();

/**
 * Service for solving CAPTCHAs using 2Captcha API with click-based solving
 * Uses the approach from https://github.com/2captcha/puppeteer-recaptcha-solver-using-clicks
 */
export class CaptchaService {
  private solver: Solver | null = null;
  private apiKey: string | null = null;
  private initialized: boolean = false;

  constructor() {
    this.initialize();
  }

  /**
   * Initialize the service (can be called multiple times safely)
   */
  private initialize() {
    if (this.initialized) {
      return;
    }

    // Try both variable names for backwards compatibility
    this.apiKey = process.env.CAPTCHA_API_KEY || process.env['2CAPTCHA_API_KEY'] || null;
    
    if (this.apiKey && this.apiKey !== 'your_2captcha_api_key') {
      this.solver = new Solver(this.apiKey);
      console.log('✅ 2Captcha service initialized (click-based solver)');
      console.log(`   API Key: ${this.apiKey.substring(0, 8)}...${this.apiKey.substring(this.apiKey.length - 4)}`);
      this.initialized = true;
    } else {
      console.warn('⚠️  2Captcha API key not configured - CAPTCHA solving disabled');
      console.warn('   Set CAPTCHA_API_KEY in your .env file');
      console.warn(`   Current value: ${this.apiKey || 'undefined'}`);
    }
  }

  /**
   * Check if CAPTCHA service is available
   */
  isAvailable(): boolean {
    return this.solver !== null;
  }

  /**
   * Detect if there's a reCAPTCHA v2 challenge on the page
   */
  async detectRecaptcha(page: Page): Promise<boolean> {
    try {
      const hasRecaptcha = await page.evaluate(() => {
        // Check for reCAPTCHA iframe
        const recaptchaFrame = document.querySelector('iframe[src*="recaptcha"]');
        
        // Check for reCAPTCHA div
        const recaptchaDiv = document.querySelector('.g-recaptcha') || 
                            document.querySelector('[data-sitekey]');
        
        return !!(recaptchaFrame || recaptchaDiv);
      });
      
      return hasRecaptcha;
    } catch (error) {
      return false;
    }
  }

  /**
   * Extract reCAPTCHA site key from the page
   */
  async extractSiteKey(page: Page): Promise<string | null> {
    try {
      const siteKey = await page.evaluate(() => {
        // Try to find site key in data-sitekey attribute
        const recaptchaElement = document.querySelector('[data-sitekey]');
        if (recaptchaElement) {
          return recaptchaElement.getAttribute('data-sitekey');
        }
        
        // Try to find site key in iframe src
        const iframe = document.querySelector('iframe[src*="recaptcha"]') as HTMLIFrameElement;
        if (iframe && iframe.src) {
          const match = iframe.src.match(/[?&]k=([^&]+)/);
          if (match) {
            return match[1];
          }
        }
        
        // Try to find in script tags
        const scripts = Array.from(document.querySelectorAll('script'));
        for (const script of scripts) {
          const match = script.textContent?.match(/['"](6L[a-zA-Z0-9_-]{38,})['"]/);
          if (match) {
            return match[1];
          }
        }
        
        return null;
      });
      
      return siteKey;
    } catch (error) {
      console.error('Failed to extract site key:', error);
      return null;
    }
  }

  /**
   * Inject CSS to fix reCAPTCHA iframe sizing issues
   */
  private async fixRecaptchaIframeSize(page: Page): Promise<void> {
    try {
      console.log('🎨 Injecting CSS to fix reCAPTCHA iframe size...');
      
      // Inject CSS in the main page to fix iframe sizing
      await page.evaluate(() => {
        const style = document.createElement('style');
        style.textContent = `
          /* Scale up the reCAPTCHA iframe container */
          iframe[src*="recaptcha/api2/bframe"] {
            width: 600px !important;
            height: 800px !important;
            min-width: 600px !important;
            min-height: 800px !important;
            transform: scale(1.5) !important;
            transform-origin: top left !important;
            border: 2px solid #4285f4 !important;
          }
          
          iframe[src*="recaptcha/api2/anchor"] {
            width: 304px !important;
            height: 78px !important;
          }
          
          /* Ensure parent containers don't constrain the iframe */
          iframe[src*="recaptcha"] {
            max-width: none !important;
            max-height: none !important;
            position: relative !important;
            z-index: 10000 !important;
          }
        `;
        document.head.appendChild(style);
        console.log('✅ CSS injected to main page');
      });
      
      // Also inject minimal CSS inside the bframe iframe to ensure visibility
      const frames = page.frames();
      for (const frame of frames) {
        const frameUrl = frame.url();
        if (frameUrl.includes('recaptcha') && frameUrl.includes('bframe')) {
          await frame.evaluate(() => {
            const style = document.createElement('style');
            style.textContent = `
              /* Ensure containers are visible and not clipped */
              #rc-imageselect {
                overflow: visible !important;
              }
              
              .rc-imageselect-payload {
                overflow: visible !important;
              }
              
              .rc-imageselect-challenge {
                overflow: visible !important;
              }
              
              /* Ensure images load properly */
              .rc-image-tile-wrapper img {
                display: block !important;
              }
            `;
            document.head.appendChild(style);
            console.log('✅ CSS injected to bframe iframe');
          });
          console.log('✅ reCAPTCHA iframe CSS fixed');
        }
      }
      
      // Wait a bit for CSS to apply
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error: any) {
      console.warn('⚠️  Failed to inject CSS:', error.message);
    }
  }

  /**
   * Extract CAPTCHA parameters from the challenge iframe
   * Based on utils/initCaptchaParamsExtractor.js from the reference implementation
   */
  private async extractCaptchaParams(page: Page): Promise<{
    body: string;
    comment: string;
    rows: number;
    columns: number;
  } | null> {
    try {
      // Find the bframe (challenge iframe)
      const frames = page.frames();
      for (const frame of frames) {
        const frameUrl = frame.url();
        if (frameUrl.includes('recaptcha') && frameUrl.includes('bframe')) {
          console.log('📋 Found challenge iframe, applying CSS fixes...');
          
          // Apply CSS fixes now that we found the iframe
          await this.fixRecaptchaIframeSize(page);
          
          console.log('📋 Extracting CAPTCHA parameters from challenge iframe...');
          
          // Wait for the image to load with longer timeout
          try {
            await frame.waitForSelector('.rc-image-tile-wrapper img', { timeout: 10000 });
            console.log('✅ Image element found in iframe');
          } catch (e) {
            console.warn('⚠️  Image element not found, trying alternative selectors...');
            // Try alternative selector
            await frame.waitForSelector('img.rc-image-tile-44, img.rc-image-tile-33', { timeout: 5000 });
          }
          
          const params = await frame.evaluate(async () => {
            // Extract the instruction text
            const descWrapper = document.querySelector('.rc-imageselect-desc-wrapper');
            const comment = descWrapper ? descWrapper.textContent?.replace(/\n/g, ' ').trim() : '';
            
            // Extract the grid size
            const table = document.querySelector('.rc-imageselect-table-33, .rc-imageselect-table-44');
            let rows = 3;
            let columns = 3;
            
            if (table) {
              if (table.classList.contains('rc-imageselect-table-44')) {
                rows = 4;
                columns = 4;
              }
            }
            
            // Extract the image and convert to base64 if needed
            const img = document.querySelector('.rc-image-tile-wrapper img') as HTMLImageElement;
            let body = '';
            
            if (img) {
              // Wait for image to load
              if (!img.complete) {
                await new Promise((resolve) => {
                  img.onload = resolve;
                  img.onerror = resolve;
                  // Timeout after 5 seconds
                  setTimeout(resolve, 5000);
                });
              }
              
              // If already base64, use it directly
              if (img.src.startsWith('data:image')) {
                body = img.src;
              } else {
                // Otherwise, convert to base64
                try {
                  const canvas = document.createElement('canvas');
                  canvas.width = img.naturalWidth || img.width || 400;
                  canvas.height = img.naturalHeight || img.height || 400;
                  const ctx = canvas.getContext('2d');
                  if (ctx) {
                    ctx.drawImage(img, 0, 0);
                    body = canvas.toDataURL('image/png');
                  }
                } catch (e) {
                  console.error('Failed to convert image to base64:', e);
                  // Fallback: try to fetch the image and convert
                  try {
                    const response = await fetch(img.src);
                    const blob = await response.blob();
                    const reader = new FileReader();
                    body = await new Promise((resolve) => {
                      reader.onloadend = () => resolve(reader.result as string);
                      reader.readAsDataURL(blob);
                    });
                  } catch (fetchError) {
                    console.error('Failed to fetch image:', fetchError);
                    body = img.src; // Last resort fallback
                  }
                }
              }
            }
            
            return { body, comment, rows, columns };
          });
          
          if (params.body && params.comment) {
            console.log(`   Instructions: "${params.comment}"`);
            console.log(`   Grid size: ${params.rows}x${params.columns}`);
            const isBase64 = params.body.startsWith('data:image');
            console.log(`   Image format: ${isBase64 ? 'base64' : 'URL'}`);
            console.log(`   Image data length: ${params.body.length} chars`);
            if (isBase64) {
              console.log(`   ✅ Image successfully converted to base64`);
            } else {
              console.warn(`   ⚠️  Image is still a URL, may cause issues with 2Captcha`);
            }
            return params;
          }
        }
      }
      
      console.error('❌ Could not find challenge iframe or extract parameters');
      return null;
    } catch (error: any) {
      console.error('❌ Failed to extract CAPTCHA parameters:', error.message);
      return null;
    }
  }

  /**
   * Solve reCAPTCHA v2 and return the solution (either token or click coordinates)
   */
  async solveRecaptchaWithClicks(page: Page): Promise<{ type: 'token' | 'clicks', data: string | number[] } | null> {
    if (!this.solver) {
      console.warn('⚠️  2Captcha solver not initialized');
      return null;
    }

    try {
      console.log('🔍 Detecting reCAPTCHA challenge...');
      
      // Check if reCAPTCHA exists
      const hasRecaptcha = await this.detectRecaptcha(page);
      if (!hasRecaptcha) {
        console.log('ℹ️  No reCAPTCHA detected on page');
        return null;
      }
      
      // Extract CAPTCHA parameters (image, instructions, grid size)
      const captchaParams = await this.extractCaptchaParams(page);
      if (!captchaParams) {
        console.error('❌ Could not extract CAPTCHA parameters');
        return null;
      }
      
      console.log('🤖 Sending CAPTCHA to 2Captcha for solving (grid method)...');
      console.log('⏳ This may take 30-90 seconds...');
      
      // Use the grid solver for click-based solving
      const result = await this.solver.grid({
        body: captchaParams.body,
        textinstructions: captchaParams.comment,
        cols: captchaParams.columns,
        rows: captchaParams.rows,
        recaptcha: 1, // Required parameter to indicate this is a reCAPTCHA grid
        lang: 'en', // or 'fr' if you want French instructions
      });
      
      const solution = result.data;
      console.log('✅ CAPTCHA solved! Received solution');
      console.log(`   Solution: ${solution}`);
      
      // Check if it's a click-based solution (format: "click:3/6/8")
      if (solution.startsWith('click:')) {
        const clicksStr = solution.replace('click:', '');
        const clicks = clicksStr.split('/').map(n => parseInt(n, 10));
        console.log(`   Type: Click-based (${clicks.length} cells to click)`);
        console.log(`   Cells: ${clicks.join(', ')}`);
        return { type: 'clicks', data: clicks };
      } else {
        // Regular token
        console.log(`   Type: Token`);
        console.log(`   Token: ${solution.substring(0, 50)}...`);
        return { type: 'token', data: solution };
      }
      
    } catch (error: any) {
      console.error('❌ Failed to solve CAPTCHA:', error.message);
      return null;
    }
  }

  /**
   * Calculate coordinates for clicking a specific cell in the reCAPTCHA grid
   * Based on the GitHub project: https://github.com/2captcha/puppeteer-recaptcha-solver-using-clicks
   */
  private calculateCellCoordinates(
    boundingBox: { x: number; y: number; width: number; height: number },
    cellNumber: number,
    gridSize: number
  ): { x: number; y: number } | null {
    let x = boundingBox.x;
    let y = boundingBox.y;
    
    if (gridSize === 3) {
      // 3x3 grid layout
      switch (cellNumber) {
        case 1:
          x = x + 60;
          y = y + 120 + 65;
          break;
        case 2:
          x = x + 60 + 130;
          y = y + 120 + 65;
          break;
        case 3:
          x = x + 60 + 130 + 130;
          y = y + 120 + 65;
          break;
        case 4:
          x = x + 60;
          y = y + 120 + 130 + 65;
          break;
        case 5:
          x = x + 60 + 130;
          y = y + 120 + 130 + 65;
          break;
        case 6:
          x = x + 60 + 130 + 130;
          y = y + 120 + 130 + 65;
          break;
        case 7:
          x = x + 60;
          y = y + 120 + 130 + 130 + 65;
          break;
        case 8:
          x = x + 60 + 130;
          y = y + 120 + 130 + 130 + 65;
          break;
        case 9:
          x = x + 60 + 130 + 130;
          y = y + 120 + 130 + 130 + 65;
          break;
        default:
          console.error(`Invalid cell number: ${cellNumber}`);
          return null;
      }
    } else if (gridSize === 4) {
      // 4x4 grid layout
      const heightTop = 130;
      const width = 95;
      
      switch (cellNumber) {
        case 1:
          x = x + 45;
          y = y + 45 + heightTop;
          break;
        case 2:
          x = x + 45 + width;
          y = y + 45 + heightTop;
          break;
        case 3:
          x = x + 45 + width * 2;
          y = y + 45 + heightTop;
          break;
        case 4:
          x = x + 45 + width * 3;
          y = y + 45 + heightTop;
          break;
        case 5:
          x = x + 45;
          y = y + 45 + heightTop + width;
          break;
        case 6:
          x = x + 45 + width;
          y = y + 45 + heightTop + width;
          break;
        case 7:
          x = x + 45 + width * 2;
          y = y + 45 + heightTop + width;
          break;
        case 8:
          x = x + 45 + width * 3;
          y = y + 45 + heightTop + width;
          break;
        case 9:
          x = x + 45;
          y = y + 45 + heightTop + width * 2;
          break;
        case 10:
          x = x + 45 + width;
          y = y + 45 + heightTop + width * 2;
          break;
        case 11:
          x = x + 45 + width * 2;
          y = y + 45 + heightTop + width * 2;
          break;
        case 12:
          x = x + 45 + width * 3;
          y = y + 45 + heightTop + width * 2;
          break;
        case 13:
          x = x + 45;
          y = y + 45 + heightTop + width * 3;
          break;
        case 14:
          x = x + 45 + width;
          y = y + 45 + heightTop + width * 3;
          break;
        case 15:
          x = x + 45 + width * 2;
          y = y + 45 + heightTop + width * 3;
          break;
        case 16:
          x = x + 45 + width * 3;
          y = y + 45 + heightTop + width * 3;
          break;
        default:
          console.error(`Invalid cell number: ${cellNumber}`);
          return null;
      }
    } else {
      console.error(`Unsupported grid size: ${gridSize}`);
      return null;
    }
    
    // Add small random offset to mimic human behavior (1-5 pixels)
    x = x + Math.floor(Math.random() * 5) + 1;
    y = y + Math.floor(Math.random() * 5) + 1;
    
    return { x, y };
  }

  /**
   * Calculate coordinates for clicking the VERIFY button
   */
  private calculateVerifyButtonCoordinates(
    boundingBox: { x: number; y: number; width: number; height: number }
  ): { x: number; y: number } {
    // VERIFY button is typically at the bottom-right of the reCAPTCHA iframe
    // Approximate position based on standard reCAPTCHA layout
    const x = boundingBox.x + boundingBox.width - 80;
    const y = boundingBox.y + boundingBox.height - 30;
    
    return { x, y };
  }

  /**
   * Inject CAPTCHA solution into the page
   */
  async injectCaptchaSolution(page: Page, solution: string): Promise<boolean> {
    try {
      console.log('💉 Injecting CAPTCHA solution into page...');
      
      const injected = await page.evaluate((token) => {
        
        // Method 1: Find all possible reCAPTCHA response textareas
        const responseFields = [
          document.querySelector('#g-recaptcha-response'),
          document.querySelector('textarea[name="g-recaptcha-response"]'),
          ...Array.from(document.querySelectorAll('textarea')).filter(
            (el) => el.name?.includes('recaptcha') || el.id?.includes('recaptcha')
          )
        ].filter(Boolean) as HTMLTextAreaElement[];
        
        if (responseFields.length > 0) {
          console.log(`Found ${responseFields.length} reCAPTCHA response field(s)`);
          
          // Inject token into all found fields
          responseFields.forEach((field) => {
            field.style.display = 'block';
            field.innerHTML = token;
            field.value = token;
          });
          
          // Method 2: Override grecaptcha.getResponse to return our token
          if (typeof (window as any).grecaptcha !== 'undefined') {
            try {
              // Store original function
              const originalGetResponse = (window as any).grecaptcha.getResponse;
              
              // Override to return our token
              (window as any).grecaptcha.getResponse = function(widgetId?: number) {
                console.log('grecaptcha.getResponse called, returning token');
                return token;
              };
              
              // Also try to execute the callback directly if it exists
              if ((window as any).grecaptcha.execute) {
                try {
                  (window as any).grecaptcha.execute();
                  console.log('Called grecaptcha.execute()');
                } catch (e) {
                  console.log('Could not call grecaptcha.execute:', e);
                }
              }
              
              console.log('Overrode grecaptcha.getResponse');
            } catch (e) {
              console.log('Could not override grecaptcha.getResponse:', e);
            }
          }
          
          // Method 3: Find and trigger callback functions
          const callbackElements = document.querySelectorAll('[data-callback]');
          callbackElements.forEach((el) => {
            const callbackName = el.getAttribute('data-callback');
            if (callbackName && typeof (window as any)[callbackName] === 'function') {
              try {
                (window as any)[callbackName](token);
                console.log(`Triggered callback: ${callbackName}`);
              } catch (e) {
                console.log(`Failed to trigger callback ${callbackName}:`, e);
              }
            }
          });
          
          // Method 4: Dispatch change events on response fields
          responseFields.forEach((field) => {
            field.dispatchEvent(new Event('input', { bubbles: true }));
            field.dispatchEvent(new Event('change', { bubbles: true }));
          });
          
          // Method 5: Try to find and trigger any form submission callbacks
          // Look for forms containing the reCAPTCHA
          const forms = document.querySelectorAll('form');
          forms.forEach((form) => {
            if (form.querySelector('textarea[name="g-recaptcha-response"]')) {
              // Trigger form validation/submission events
              form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
              console.log('Triggered form submit event');
            }
          });
          
          return true;
        }
        
        console.log('No reCAPTCHA response fields found');
        return false;
      }, solution);
      
      if (injected) {
        console.log('✅ CAPTCHA solution injected successfully');
        
        // Wait longer for reCAPTCHA to process the solution
        console.log('⏳ Waiting for reCAPTCHA to process solution...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Try to click the VALIDER/Verify button in the reCAPTCHA challenge iframe
        let submitButtonClicked = false;
        try {
          const frames = page.frames();
          for (const frame of frames) {
            const frameUrl = frame.url();
            // Look for the bframe (challenge iframe)
            if (frameUrl.includes('recaptcha') && frameUrl.includes('bframe')) {
              console.log('Found reCAPTCHA challenge iframe (bframe)');
              
              try {
                // Check if the verify button is enabled (solution processed)
                const buttonReady = await frame.evaluate(() => {
                  const verifyBtn = document.querySelector('#recaptcha-verify-button') as HTMLButtonElement;
                  if (verifyBtn) {
                    const isDisabled = verifyBtn.disabled || verifyBtn.hasAttribute('disabled');
                    const ariaDisabled = verifyBtn.getAttribute('aria-disabled') === 'true';
                    console.log(`Verify button - disabled: ${isDisabled}, aria-disabled: ${ariaDisabled}`);
                    return !isDisabled && !ariaDisabled;
                  }
                  return false;
                });
                
                if (!buttonReady) {
                  console.log('⚠️  Verify button not ready yet, waiting additional 3 seconds...');
                  await new Promise(resolve => setTimeout(resolve, 3000));
                }
                
                // Wait for and click the verify/validate button
                await frame.waitForSelector('#recaptcha-verify-button', { timeout: 3000 });
                await frame.click('#recaptcha-verify-button');
                console.log('✅ Clicked VERIFY button in challenge iframe');
                submitButtonClicked = true;
                
                // Wait for the challenge to process
                await new Promise(resolve => setTimeout(resolve, 3000));
                break;
              } catch (e) {
                console.log('Could not find/click verify button in iframe:', e);
              }
            }
          }
        } catch (e) {
          console.log('Error handling challenge iframe:', e);
        }
        
        // If we didn't click the button in iframe, try in main page
        if (!submitButtonClicked) {
          const submitted = await page.evaluate(() => {
            const submitButtons = [
              // Standard submit buttons
              document.querySelector('button[type="submit"]'),
              document.querySelector('input[type="submit"]'),
              document.querySelector('button.submit'),
              document.querySelector('[data-test-id*="submit"]'),
              // LinkedIn-specific challenge buttons
              document.querySelector('button[data-litms-control-urn*="submit"]'),
              document.querySelector('button.challenge-dialog__action-btn'),
              document.querySelector('.challenge-dialog button'),
              // Generic buttons with submit-like text
              ...Array.from(document.querySelectorAll('button')).filter(
                (btn) => {
                  const text = btn.textContent?.toLowerCase() || '';
                  return text.includes('submit') ||
                         text.includes('verify') ||
                         text.includes('continue') ||
                         text.includes('next') ||
                         text.includes('confirm') ||
                         text.includes('valider'); // French for "validate"
                }
              )
            ].filter(Boolean);
            
            if (submitButtons.length > 0) {
              console.log(`Found ${submitButtons.length} submit button(s)`);
              
              // Try each button until one works
              for (let i = 0; i < submitButtons.length; i++) {
                try {
                  const btn = submitButtons[i] as HTMLElement;
                  console.log(`Clicking button ${i + 1}: ${btn.textContent?.trim()}`);
                  btn.click();
                  return true;
                } catch (e) {
                  console.log(`Failed to click button ${i + 1}:`, e);
                }
              }
            }
            
            console.log('No submit button found or all clicks failed');
            return false;
          });
          
          submitButtonClicked = submitted;
        }
        
        const submitted = submitButtonClicked;
        
        if (submitted) {
          console.log('✅ Submit button clicked');
        } else {
          console.log('⚠️  No submit button found - may need manual submission');
        }
        
        return true;
      } else {
        console.warn('⚠️  Could not find reCAPTCHA response field');
        return false;
      }
      
    } catch (error: any) {
      console.error('❌ Failed to inject CAPTCHA solution:', error.message);
      return false;
    }
  }

  /**
   * Complete workflow: detect, solve, and inject CAPTCHA solution using click-based approach
   * Handles multiple sequential CAPTCHAs if LinkedIn shows them
   */
  async handleRecaptchaChallenge(page: Page, maxAttempts: number = 3): Promise<boolean> {
    if (!this.isAvailable()) {
      console.warn('⚠️  2Captcha service not available - skipping CAPTCHA solving');
      return false;
    }

    let attemptCount = 0;
    let checkboxAlreadyClicked = false;
    
    while (attemptCount < maxAttempts) {
      attemptCount++;
      console.log(`\n🔄 CAPTCHA solving attempt ${attemptCount}/${maxAttempts}...`);
      
      try {
        // Take a screenshot before solving (for debugging)
        try {
          await page.screenshot({ path: `captcha-before-attempt${attemptCount}.png`, fullPage: false });
          console.log(`📸 Screenshot saved: captcha-before-attempt${attemptCount}.png`);
        } catch (e) {
          // Ignore screenshot errors
        }
        
        // STEP 1: Click the checkbox first to trigger the challenge (only on first attempt)
        if (!checkboxAlreadyClicked) {
          console.log('🖱️  Clicking reCAPTCHA checkbox to trigger challenge...');
          try {
            // Find the reCAPTCHA badge iframe using the title attribute
            const iframeElementHandle = await page.$('iframe[title="reCAPTCHA"]');
            
            if (iframeElementHandle) {
              const recaptchaBadgeIframe = await iframeElementHandle.contentFrame();
              
              if (recaptchaBadgeIframe) {
                console.log('Found reCAPTCHA badge iframe');
                
                // Click on checkbox reCAPTCHA using evaluate (more reliable than frame.click)
                const clicked = await recaptchaBadgeIframe.evaluate(() => {
                  const recaptchaCheckbox = document.querySelector('span.recaptcha-checkbox-unchecked');
                  if (recaptchaCheckbox) {
                    (recaptchaCheckbox as HTMLElement).click();
                    return true;
                  }
                  return false;
                });
                
                if (clicked) {
                  console.log('✅ Clicked reCAPTCHA checkbox via evaluate');
                } else {
                  console.log('⚠️  Checkbox already checked or not found');
                }
                
                checkboxAlreadyClicked = true;
                
                // Wait longer for image challenge to appear
                console.log('⏳ Waiting 8 seconds for image challenge to appear...');
                await new Promise(resolve => setTimeout(resolve, 8000));
                
                // Check if challenge appeared
                const challengeAppeared = await page.evaluate(() => {
                  const frames = Array.from(document.querySelectorAll('iframe'));
                  return frames.some(iframe => iframe.src.includes('bframe'));
                });
                
                if (challengeAppeared) {
                  console.log('✅ Image challenge iframe detected');
                } else {
                  console.warn('⚠️  Image challenge iframe not detected yet');
                }
              } else {
                console.warn('⚠️  Could not access reCAPTCHA badge iframe content');
                checkboxAlreadyClicked = true;
              }
            } else {
              console.warn('⚠️  Could not find reCAPTCHA badge iframe - image challenge may already be visible');
              checkboxAlreadyClicked = true;
            }
            
          } catch (e) {
            console.log('Error clicking checkbox:', e);
            checkboxAlreadyClicked = true;
          }
        } else {
          console.log('ℹ️  Skipping checkbox click - already clicked in previous attempt');
          console.log('⏳ Waiting for new image challenge to load...');
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
        // STEP 2: Solve the CAPTCHA (CSS injection happens inside extractCaptchaParams)
        const solution = await this.solveRecaptchaWithClicks(page);
        if (!solution) {
          // Take screenshot on failure
          try {
            await page.screenshot({ path: `captcha-solve-failed-attempt${attemptCount}.png`, fullPage: false });
            console.log(`📸 Screenshot saved: captcha-solve-failed-attempt${attemptCount}.png`);
          } catch (e) {
            // Ignore
          }
          
          console.warn(`⚠️  CAPTCHA solving failed on attempt ${attemptCount}`);
          continue; // Try again
        }
        
        // STEP 4: Apply the solution based on type
        if (solution.type === 'clicks') {
          // Click-based solution: click on specific cells using coordinates
          console.log('🖱️  Applying click-based solution...');
          const cells = solution.data as number[];
          
          try {
            // Find the reCAPTCHA bframe iframe element (not the frame itself, but the iframe element on the page)
            const iframeElement = await page.$('iframe[src*="https://www.google.com/recaptcha/api2/bframe"]');
            
            if (!iframeElement) {
              console.error('❌ Could not find reCAPTCHA bframe iframe element');
            } else {
              console.log('Found reCAPTCHA bframe iframe element');
              
              // Get the bounding box of the iframe
              const boundingBox = await iframeElement.boundingBox();
              
              if (!boundingBox) {
                console.error('❌ Could not get iframe bounding box');
              } else {
                console.log(`Iframe position: x=${boundingBox.x}, y=${boundingBox.y}, width=${boundingBox.width}, height=${boundingBox.height}`);
                
                // Click on each cell using calculated coordinates with proper delays
                const timeToSleep = 100; // ms delay between clicks
                
                for (let i = 0; i < cells.length; i++) {
                  const cellNumber = cells[i];
                  const coords = this.calculateCellCoordinates(boundingBox, cellNumber, 3);
                  
                  if (coords) {
                    // Add delay before each click (increases with each click)
                    await new Promise(resolve => setTimeout(resolve, timeToSleep * i));
                    
                    console.log(`🎯 Clicking cell ${cellNumber} at coordinates x=${coords.x}, y=${coords.y}`);
                    await page.mouse.click(coords.x, coords.y);
                    console.log(`✅ Clicked cell ${cellNumber}`);
                  }
                }
                
                // Wait a bit for reCAPTCHA to process
                console.log('⏳ Waiting for reCAPTCHA to process clicks...');
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Click the verify button using coordinates
                const verifyCoords = this.calculateVerifyButtonCoordinates(boundingBox);
                console.log(`Clicking VERIFY button at coordinates x=${verifyCoords.x}, y=${verifyCoords.y}`);
                await page.mouse.click(verifyCoords.x, verifyCoords.y);
                console.log('✅ Clicked VERIFY button');
              }
            }
          } catch (e) {
            console.log('Error applying click-based solution:', e);
          }
        } else {
          // Token-based solution: inject token
          console.log('💉 Injecting token-based solution...');
          const token = solution.data as string;
          const injected = await this.injectCaptchaSolution(page, token);
          if (!injected) {
            console.warn(`⚠️  Failed to inject solution on attempt ${attemptCount}`);
            continue;
          }
          
          // Click the verify button
          try {
            const frames = page.frames();
            for (const frame of frames) {
              const frameUrl = frame.url();
              if (frameUrl.includes('recaptcha') && frameUrl.includes('bframe')) {
                console.log('Found reCAPTCHA challenge iframe (bframe)');
                
                try {
                  await frame.waitForSelector('#recaptcha-verify-button', { timeout: 3000 });
                  await frame.click('#recaptcha-verify-button');
                  console.log('✅ Clicked VERIFY button');
                  break;
                } catch (e) {
                  console.log('Could not find/click verify button:', e);
                }
              }
            }
          } catch (e) {
            console.log('Error clicking verify button:', e);
          }
        }
        
        // Take a screenshot after solving (for debugging)
        try {
          await page.screenshot({ path: `captcha-after-attempt${attemptCount}.png`, fullPage: false });
          console.log(`📸 Screenshot saved: captcha-after-attempt${attemptCount}.png`);
        } catch (e) {
          // Ignore screenshot errors
        }
        
        // STEP 3: Wait for navigation and check if we're redirected
        console.log('⏳ Waiting for page to process CAPTCHA solution...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        const currentUrl = page.url();
        console.log(`📍 Current URL after CAPTCHA: ${currentUrl}`);
        
        // Check if we're still on the challenge page
        if (currentUrl.includes('/checkpoint/challenge')) {
          console.log('⚠️  Still on challenge page - LinkedIn may be showing another CAPTCHA');
          
          // Check if there's another CAPTCHA
          const hasAnotherCaptcha = await this.detectRecaptcha(page);
          if (hasAnotherCaptcha) {
            console.log('🔄 Another CAPTCHA detected - will solve it in next iteration');
            continue; // Loop again to solve the next CAPTCHA
          } else {
            console.log('✅ No more CAPTCHAs detected');
            return true;
          }
        } else {
          // Successfully navigated away from challenge page
          console.log('✅ Successfully navigated away from challenge page!');
          return true;
        }
        
      } catch (error: any) {
        console.error(`❌ Failed on attempt ${attemptCount}:`, error.message);
        
        // Take screenshot on error
        try {
          await page.screenshot({ path: `captcha-error-attempt${attemptCount}.png`, fullPage: false });
          console.log(`📸 Screenshot saved: captcha-error-attempt${attemptCount}.png`);
        } catch (e) {
          // Ignore
        }
        
        if (attemptCount >= maxAttempts) {
          return false;
        }
        
        // Wait before retrying
        console.log('⏳ Waiting 3 seconds before retry...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    console.error(`❌ Failed to solve CAPTCHA after ${maxAttempts} attempts`);
    return false;
  }
}

export default new CaptchaService();
