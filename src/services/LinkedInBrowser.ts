import { Browser, Page } from 'puppeteer';
import puppeteer from 'puppeteer-extra';
import { createServiceLogger } from '../utils/logger';
import BrowserStateService from './BrowserStateService';

// Add stealth plugin to avoid detection (using require to avoid type issues)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const log = createServiceLogger('LinkedInBrowser');

/**
 * Browser state interface
 */
export interface BrowserState {
  browser: Browser;
  operationPage: Page;
  monitoringPage: Page | null;
  isAuthenticated: boolean;
  userIdentifier: string | null;
  monitoringInterval: NodeJS.Timeout | null;
}

/**
 * LinkedInBrowser - Singleton service for managing browser instance
 * 
 * This service manages:
 * - A single browser instance
 * - Two tabs: operation tab and monitoring tab
 * - Authentication state
 * - Cookie persistence
 */
class LinkedInBrowser {
  private state: BrowserState | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Check if browser is initialized and ready
   */
  isReady(): boolean {
    return this.state !== null && !this.state.browser.connected === false;
  }

  /**
   * Check if browser is authenticated with LinkedIn
   */
  isAuthenticated(): boolean {
    return this.state?.isAuthenticated ?? false;
  }

  /**
   * Get the operation page for performing LinkedIn actions
   */
  getOperationPage(): Page | null {
    return this.state?.operationPage ?? null;
  }

  /**
   * Get the monitoring page for message monitoring
   */
  getMonitoringPage(): Page | null {
    return this.state?.monitoringPage ?? null;
  }

  /**
   * Get the browser instance
   */
  getBrowser(): Browser | null {
    return this.state?.browser ?? null;
  }

  /**
   * Get full state (for debugging)
   */
  getState(): BrowserState | null {
    return this.state;
  }

  /**
   * Set authentication status
   */
  setAuthenticated(value: boolean): void {
    if (this.state) {
      const oldValue = this.state.isAuthenticated;
      this.state.isAuthenticated = value;
      if (oldValue !== value) {
        log.info('Authentication state changed', { oldValue, newValue: value });
      }
    }
  }

  /**
   * Set user identifier (email)
   */
  setUserIdentifier(identifier: string): void {
    if (this.state) {
      this.state.userIdentifier = identifier;
    }
  }

  /**
   * Get user identifier
   */
  getUserIdentifier(): string | null {
    return this.state?.userIdentifier ?? null;
  }

  /**
   * Find Chrome/Chromium executable
   */
  private findChrome(): string | undefined {
    const possiblePaths = [
      process.env.CHROME_BIN,
      process.env.PUPPETEER_EXECUTABLE_PATH,
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ];

    for (const path of possiblePaths) {
      if (path) {
        try {
          require('fs').accessSync(path);
          return path;
        } catch {
          continue;
        }
      }
    }

    return undefined;
  }

  /**
   * Initialize the browser with optional state restoration
   * @param userIdentifier - Email or identifier for state restoration
   */
  async initialize(userIdentifier?: string): Promise<{ sessionRestored: boolean; isAuthenticated: boolean }> {
    // Prevent multiple initializations
    if (this.initPromise) {
      await this.initPromise;
      return { 
        sessionRestored: false, 
        isAuthenticated: this.state?.isAuthenticated ?? false 
      };
    }

    if (this.state) {
      log.debug('Browser already initialized');
      return { 
        sessionRestored: false, 
        isAuthenticated: this.state.isAuthenticated 
      };
    }

    this.initPromise = this._doInitialize(userIdentifier);
    
    try {
      await this.initPromise;
      // After _doInitialize, state is guaranteed to be set
      const currentState = this.state as BrowserState | null;
      return {
        sessionRestored: currentState?.isAuthenticated ?? false,
        isAuthenticated: currentState?.isAuthenticated ?? false
      };
    } finally {
      this.initPromise = null;
    }
  }

  private async _doInitialize(userIdentifier?: string): Promise<void> {
    log.info('Initializing browser', { userIdentifier });

    const executablePath = this.findChrome();
    if (executablePath) {
      log.debug('Using Chrome executable', { path: executablePath });
    }

    // Launch browser with anti-detection settings
    const browser = await puppeteer.launch({
      headless: false,
      executablePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=VizDisplayCompositor',
        '--lang=en-US,en',
      ],
      defaultViewport: {
        width: 1920,
        height: 1080,
      },
      ignoreDefaultArgs: ['--enable-automation'],
    });

    // Get the default page (operation page)
    const pages = await browser.pages();
    const operationPage = pages[0] || await browser.newPage();

    // Set up console logging for debugging
    operationPage.on('console', (msg) => {
      if (msg.type() === 'error') {
        log.debug('[Browser] ' + msg.text());
      }
    });

    // Initialize state
    this.state = {
      browser,
      operationPage,
      monitoringPage: null,
      isAuthenticated: false,
      userIdentifier: userIdentifier || null,
      monitoringInterval: null,
    };

    // Try to restore browser state if identifier provided
    if (userIdentifier) {
      log.debug('Attempting to restore browser state', { userIdentifier });
      
      try {
        const hasState = await BrowserStateService.hasBrowserState(userIdentifier);
        
        if (hasState) {
          const restored = await BrowserStateService.restoreBrowserState(userIdentifier, operationPage);
          
          if (restored) {
            // Verify the session is still valid
            const isValid = await BrowserStateService.verifySession(operationPage);
            
            if (isValid) {
              log.info('Session restored and verified successfully');
              this.state.isAuthenticated = true;
            } else {
              log.warn('Saved session expired');
              await BrowserStateService.deleteBrowserState(userIdentifier);
              await this.clearBrowserState();
            }
          }
        }
      } catch (error: any) {
        log.warn('Failed to restore browser state', { error: error.message });
      }
    }

    log.info('Browser initialized successfully', { 
      isAuthenticated: this.state.isAuthenticated 
    });
  }

  /**
   * Clear all cookies and storage from the browser
   */
  async clearBrowserState(): Promise<void> {
    if (!this.state) return;

    const { operationPage } = this.state;

    try {
      const client = await operationPage.target().createCDPSession();
      await client.send('Network.clearBrowserCookies');
      await client.send('Network.clearBrowserCache');
      
      await operationPage.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
      
      await operationPage.goto('about:blank', { waitUntil: 'domcontentloaded' });
      
      log.debug('Browser state cleared');
    } catch (error: any) {
      log.warn('Failed to clear browser state', { error: error.message });
    }
  }

  /**
   * Create or get the monitoring page
   * Ensures cookies are properly shared with the new page
   */
  async getOrCreateMonitoringPage(): Promise<Page> {
    if (!this.state) {
      throw new Error('Browser not initialized');
    }

    if (this.state.monitoringPage && !this.state.monitoringPage.isClosed()) {
      return this.state.monitoringPage;
    }

    // Get current cookies BEFORE creating new page
    const browserContext = this.state.browser.defaultBrowserContext();
    const cookiesBeforeNewPage = await browserContext.cookies();
    const linkedInCookiesBefore = cookiesBeforeNewPage.filter(c => c.domain.includes('linkedin.com'));
    
    log.debug('Cookies before creating monitoring page', {
      total: cookiesBeforeNewPage.length,
      linkedIn: linkedInCookiesBefore.length,
      hasLiAt: linkedInCookiesBefore.some(c => c.name === 'li_at')
    });

    // Create new monitoring page
    const monitoringPage = await this.state.browser.newPage();
    
    // Set up console logging
    monitoringPage.on('console', (msg) => {
      if (msg.type() === 'error') {
        log.debug('[Monitoring] ' + msg.text());
      }
    });

    // Verify cookies still exist after newPage()
    const cookiesAfterNewPage = await browserContext.cookies();
    const linkedInCookiesAfter = cookiesAfterNewPage.filter(c => c.domain.includes('linkedin.com'));
    
    log.debug('Cookies after creating monitoring page', {
      total: cookiesAfterNewPage.length,
      linkedIn: linkedInCookiesAfter.length,
      hasLiAt: linkedInCookiesAfter.some(c => c.name === 'li_at'),
      cookieDiff: linkedInCookiesBefore.length - linkedInCookiesAfter.length
    });

    // If cookies were lost, try to restore them from the saved state
    if (linkedInCookiesBefore.some(c => c.name === 'li_at') && 
        !linkedInCookiesAfter.some(c => c.name === 'li_at')) {
      log.warn('Cookies lost after newPage() - attempting to restore');
      
      // Re-set the cookies that were lost
      if (linkedInCookiesBefore.length > 0) {
        await browserContext.setCookie(...linkedInCookiesBefore);
        log.info('Cookies restored after newPage()');
      }
    }

    this.state.monitoringPage = monitoringPage;
    log.debug('Monitoring page created');
    
    return monitoringPage;
  }

  /**
   * Set the monitoring interval
   */
  setMonitoringInterval(interval: NodeJS.Timeout): void {
    if (this.state) {
      // Clear existing interval if any
      if (this.state.monitoringInterval) {
        clearInterval(this.state.monitoringInterval);
      }
      this.state.monitoringInterval = interval;
    }
  }

  /**
   * Bring operation page to front
   */
  async focusOperationPage(): Promise<void> {
    if (this.state?.operationPage) {
      await this.state.operationPage.bringToFront();
    }
  }

  /**
   * Bring monitoring page to front
   */
  async focusMonitoringPage(): Promise<void> {
    if (this.state?.monitoringPage && !this.state.monitoringPage.isClosed()) {
      await this.state.monitoringPage.bringToFront();
    }
  }

  /**
   * Close monitoring page and clear monitoring interval
   */
  async closeMonitoringPage(): Promise<void> {
    if (!this.state) return;

    log.info('Closing monitoring page');

    // Clear monitoring interval
    if (this.state.monitoringInterval) {
      clearInterval(this.state.monitoringInterval);
      this.state.monitoringInterval = null;
    }

    // Close monitoring page
    if (this.state.monitoringPage && !this.state.monitoringPage.isClosed()) {
      await this.state.monitoringPage.close();
      this.state.monitoringPage = null;
    }

    log.info('Monitoring page closed');
  }

  /**
   * Get cookies for LinkedIn domains using browser context
   * This ensures we get ALL cookies regardless of current page
   */
  async getLinkedInCookies(): Promise<{ valid: boolean; hasLiAt: boolean; cookieCount: number; cookies: any[] }> {
    if (!this.state?.browser) {
      return { valid: false, hasLiAt: false, cookieCount: 0, cookies: [] };
    }

    try {
      // Use browser context to get ALL cookies, not just current page cookies
      const browserContext = this.state.browser.defaultBrowserContext();
      const allCookies = await browserContext.cookies();

      // Filter for LinkedIn cookies
      const linkedInCookies = allCookies.filter(c => 
        c.domain.includes('linkedin.com')
      );
      
      const hasLiAt = linkedInCookies.some(c => c.name === 'li_at');
      const valid = hasLiAt && linkedInCookies.length > 5;

      log.debug('Cookie check (browser context)', {
        total: allCookies.length,
        linkedIn: linkedInCookies.length,
        hasLiAt,
        valid,
        cookieNames: linkedInCookies.map(c => c.name).join(', ')
      });

      return { valid, hasLiAt, cookieCount: linkedInCookies.length, cookies: linkedInCookies };
    } catch (error: any) {
      log.warn('Failed to get cookies', { error: error.message });
      return { valid: false, hasLiAt: false, cookieCount: 0, cookies: [] };
    }
  }

  /**
   * Save current browser state to database
   */
  async saveState(): Promise<void> {
    if (!this.state?.operationPage || !this.state.userIdentifier) {
      log.warn('Cannot save state - no page or user identifier');
      return;
    }

    try {
      await BrowserStateService.saveBrowserState(
        this.state.userIdentifier,
        this.state.operationPage
      );
      log.info('Browser state saved');
    } catch (error: any) {
      log.warn('Failed to save browser state', { error: error.message });
    }
  }

  /**
   * Close browser and cleanup
   */
  async close(): Promise<void> {
    if (!this.state) return;

    log.info('Closing browser');

    try {
      // Clear monitoring interval
      if (this.state.monitoringInterval) {
        clearInterval(this.state.monitoringInterval);
      }

      // Close monitoring page
      if (this.state.monitoringPage && !this.state.monitoringPage.isClosed()) {
        await this.state.monitoringPage.close();
      }

      // Close browser
      await this.state.browser.close();
    } catch (error: any) {
      log.error('Error closing browser', error);
    }

    this.state = null;
  }

  /**
   * Get status summary
   */
  getStatus(): {
    ready: boolean;
    authenticated: boolean;
    hasMonitoring: boolean;
    userIdentifier: string | null;
  } {
    return {
      ready: this.isReady(),
      authenticated: this.isAuthenticated(),
      hasMonitoring: this.state?.monitoringPage !== null && !this.state?.monitoringPage?.isClosed(),
      userIdentifier: this.state?.userIdentifier ?? null,
    };
  }
}

// Export singleton instance
export default new LinkedInBrowser();
