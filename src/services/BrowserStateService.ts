import { Page } from 'puppeteer-core';
import { Pool } from 'pg';
import { createServiceLogger } from '../utils/logger';

const log = createServiceLogger('BrowserState');

/**
 * Browser State Service
 * Manages browser state persistence including cookies, localStorage, and sessionStorage
 * to avoid repeated logins and CAPTCHA challenges
 */
export class BrowserStateService {
  private pool: Pool;
  private initPromise: Promise<void>;

  constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'linkedin',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    
    this.initPromise = this.initDatabase();
  }

  /**
   * Initializes the database schema for browser state storage
   * @private
   */
  private async initDatabase(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Create browser_state table
      await client.query(`
        CREATE TABLE IF NOT EXISTS browser_state (
          id SERIAL PRIMARY KEY,
          user_identifier VARCHAR(255) UNIQUE NOT NULL,
          cookies JSONB NOT NULL,
          local_storage JSONB,
          session_storage JSONB,
          user_agent VARCHAR(500),
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await client.query('CREATE INDEX IF NOT EXISTS idx_user_identifier ON browser_state(user_identifier)');
      
      log.info('Browser state database initialized');
    } catch (error) {
      log.error('Failed to initialize browser state database', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Saves the current browser state (cookies, localStorage, sessionStorage)
   * @param userIdentifier - Unique identifier for the user (e.g., email or session ID)
   * @param page - Puppeteer page instance
   */
  async saveBrowserState(userIdentifier: string, page: Page): Promise<void> {
    await this.initPromise;
    
    const client = await this.pool.connect();
    try {
      log.debug('Saving browser state', { userIdentifier });
      
      // Get all cookies from the browser using browser context API
      const browser = page.browser();
      if (!browser) {
        throw new Error('Browser instance not available');
      }
      const browserContext = browser.defaultBrowserContext();
      const cookies = await browserContext.cookies();
      
      // Get localStorage and sessionStorage
      const storageData = await page.evaluate(() => {
        const getStorage = (storage: Storage) => {
          const data: Record<string, string> = {};
          for (let i = 0; i < storage.length; i++) {
            const key = storage.key(i);
            if (key) {
              data[key] = storage.getItem(key) || '';
            }
          }
          return data;
        };
        
        return {
          localStorage: getStorage(localStorage),
          sessionStorage: getStorage(sessionStorage),
        };
      });
      
      log.debug('Browser state collected', { 
        cookieCount: cookies.length,
        localStorageItems: Object.keys(storageData.localStorage).length,
        sessionStorageItems: Object.keys(storageData.sessionStorage).length
      });
      
      // Get user agent
      const userAgent = await page.evaluate(() => navigator.userAgent);
      
      // Store in database
      await client.query(
        `INSERT INTO browser_state (user_identifier, cookies, local_storage, session_storage, user_agent)
         VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5)
         ON CONFLICT (user_identifier) DO UPDATE
         SET cookies = $2::jsonb, 
             local_storage = $3::jsonb, 
             session_storage = $4::jsonb,
             user_agent = $5,
             updated_at = NOW()`,
        [
          userIdentifier,
          JSON.stringify(cookies),
          JSON.stringify(storageData.localStorage),
          JSON.stringify(storageData.sessionStorage),
          userAgent
        ]
      );
      
      log.info('Browser state saved', { userIdentifier });
    } catch (error) {
      log.error('Failed to save browser state', error, { userIdentifier });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Restores browser state (cookies, localStorage, sessionStorage) to a page
   * @param userIdentifier - Unique identifier for the user
   * @param page - Puppeteer page instance
   * @returns true if state was restored, false if no state found
   */
  async restoreBrowserState(userIdentifier: string, page: Page): Promise<boolean> {
    await this.initPromise;
    
    const client = await this.pool.connect();
    try {
      log.debug('Restoring browser state', { userIdentifier });
      
      // Retrieve from database
      const result = await client.query(
        'SELECT cookies, local_storage, session_storage, user_agent FROM browser_state WHERE user_identifier = $1',
        [userIdentifier]
      );
      
      if (result.rows.length === 0) {
        log.debug('No saved browser state found', { userIdentifier });
        return false;
      }
      
      const { cookies, local_storage, session_storage, user_agent } = result.rows[0];
      
      // Set user agent if available
      if (user_agent) {
        await page.setUserAgent(user_agent);
      }
      
      // Navigate to LinkedIn first to set the correct domain for cookies and storage
      await page.goto('https://www.linkedin.com', { 
        waitUntil: 'domcontentloaded',
        timeout: 10000 
      });
      
      // Wait a bit for the page to load
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Get browser context for cookie operations
      const browser = page.browser();
      if (!browser) {
        throw new Error('Browser instance not available');
      }
      const browserContext = browser.defaultBrowserContext();
      
      // Restore cookies AFTER navigating to LinkedIn domain
      // This ensures cookies are set with the correct domain context
      if (cookies && Array.isArray(cookies)) {
        // Filter out any invalid cookies and ensure they have the correct domain
        const validCookies = cookies.filter((cookie: any) => {
          // Ensure cookie has required fields
          return cookie.name && cookie.value && 
                 (cookie.domain === '.linkedin.com' || 
                  cookie.domain === 'linkedin.com' || 
                  cookie.domain === '.www.linkedin.com' ||
                  cookie.domain === 'www.linkedin.com');
        });
        
        log.debug('Restoring cookies', { 
          total: cookies.length, 
          valid: validCookies.length 
        });
        
        if (validCookies.length > 0) {
          await browserContext.setCookie(...validCookies);
          
          // Verify cookies were set
          const setCookies = await browserContext.cookies();
          log.debug('Cookies set successfully', { count: setCookies.length });
        }
      }
      
      // Restore localStorage and sessionStorage
      await page.evaluate((storageData: { localStorage: Record<string, string>, sessionStorage: Record<string, string> }) => {
        // Restore localStorage
        if (storageData.localStorage) {
          for (const [key, value] of Object.entries(storageData.localStorage)) {
            try {
              localStorage.setItem(key, value);
            } catch (e) {
              console.warn(`Failed to set localStorage key: ${key}`, e);
            }
          }
        }
        
        // Restore sessionStorage
        if (storageData.sessionStorage) {
          for (const [key, value] of Object.entries(storageData.sessionStorage)) {
            try {
              sessionStorage.setItem(key, value);
            } catch (e) {
              console.warn(`Failed to set sessionStorage key: ${key}`, e);
            }
          }
        }
      }, { localStorage: local_storage || {}, sessionStorage: session_storage || {} });
      
      // Reload the page to ensure cookies and storage are properly applied
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 10000 });
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Verify cookies are still present after reload
      const finalCookies = await browserContext.cookies();
      
      log.info('Browser state restored', { 
        userIdentifier,
        cookieCount: cookies?.length || 0,
        cookiesAfterRestore: finalCookies.length,
        localStorageItems: Object.keys(local_storage || {}).length,
        sessionStorageItems: Object.keys(session_storage || {}).length
      });
      
      if (finalCookies.length === 0 && cookies && cookies.length > 0) {
        log.warn('Cookies were not properly restored', { userIdentifier });
        return false;
      }
      
      return true;
    } catch (error) {
      log.error('Failed to restore browser state', error, { userIdentifier });
      return false;
    } finally {
      client.release();
    }
  }

  /**
   * Checks if browser state exists for a user
   * @param userIdentifier - Unique identifier for the user
   * @returns true if state exists, false otherwise
   */
  async hasBrowserState(userIdentifier: string): Promise<boolean> {
    await this.initPromise;
    
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT id FROM browser_state WHERE user_identifier = $1',
        [userIdentifier]
      );
      
      return result.rows.length > 0;
    } catch (error) {
      log.error('Failed to check browser state', error);
      return false;
    } finally {
      client.release();
    }
  }

  /**
   * Deletes browser state for a user
   * @param userIdentifier - Unique identifier for the user
   */
  async deleteBrowserState(userIdentifier: string): Promise<void> {
    await this.initPromise;
    
    const client = await this.pool.connect();
    try {
      await client.query(
        'DELETE FROM browser_state WHERE user_identifier = $1',
        [userIdentifier]
      );
      
      log.info('Browser state deleted', { userIdentifier });
    } catch (error) {
      log.error('Failed to delete browser state', error, { userIdentifier });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Verifies if the saved session is still valid by checking LinkedIn
   * @param page - Puppeteer page instance with restored state
   * @returns true if session is valid, false otherwise
   */
  async verifySession(page: Page): Promise<boolean> {
    try {
      log.debug('Verifying session validity');
      
      // Navigate to LinkedIn feed (requires authentication)
      await page.goto('https://www.linkedin.com/feed/', {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });
      
      // Wait a bit for any redirects and page to fully load
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const currentUrl = page.url();
      
      // Take a screenshot for debugging if in development mode
      if (process.env.NODE_ENV !== 'production' && process.env.DEBUG_SCREENSHOTS === 'true') {
        try {
          const screenshotPath = `/tmp/session-verify-${Date.now()}.png` as const;
          await page.screenshot({ path: screenshotPath as any });
          log.debug('Debug screenshot saved', { path: screenshotPath });
        } catch (e) {
          // Ignore screenshot errors
        }
      }
      
      // Check multiple indicators of a valid session
      const urlCheck = currentUrl.includes('/feed') && !currentUrl.includes('/login');
      
      // Check for login page elements in the DOM
      const pageCheck = await page.evaluate(() => {
        // Check for login form (indicates we're on login page)
        const hasLoginForm = !!document.querySelector('form[data-id="sign-in-form"]');
        const hasPasswordField = !!document.querySelector('input[type="password"][name="session_password"]');
        const hasEmailField = !!document.querySelector('input[name="session_key"]');
        
        // Check for feed elements (indicates we're on feed page)
        const hasFeedElement = !!document.querySelector('.feed-shared-update-v2') || 
                               !!document.querySelector('[data-id="feed-shared-update"]') ||
                               !!document.querySelector('.scaffold-finite-scroll__content');
        const hasGlobalNav = !!document.querySelector('.global-nav');
        
        // Additional checks for authenticated state
        const hasSearchBar = !!document.querySelector('input[placeholder*="Search"]') ||
                            !!document.querySelector('input[placeholder*="Rechercher"]');
        const hasProfileNav = !!document.querySelector('[data-control-name="nav.settings_signout"]') ||
                             !!document.querySelector('.global-nav__me-photo');
        
        // Get page title for debugging
        const pageTitle = document.title;
        
        // Check for any error messages or challenge pages
        // Only check for specific challenge elements, not generic text
        const hasChallenge = !!document.querySelector('[data-test-id="challenge"]') ||
                            !!document.querySelector('.challenge-page') ||
                            !!document.querySelector('[data-id="verification-challenge"]');
        
        return {
          hasLoginForm,
          hasPasswordField,
          hasEmailField,
          hasFeedElement,
          hasGlobalNav,
          hasSearchBar,
          hasProfileNav,
          hasChallenge,
          pageTitle,
          isOnLoginPage: hasLoginForm || (hasPasswordField && hasEmailField),
          isOnFeedPage: hasFeedElement || hasGlobalNav || hasSearchBar || hasProfileNav,
        };
      });
      
      // Check for challenge page
      if (pageCheck.hasChallenge) {
        log.warn('Challenge/verification page detected', { currentUrl, pageTitle: pageCheck.pageTitle });
        return false;
      }
      
      // Session is valid if:
      // 1. URL contains /feed AND
      // 2. We're not on a login page AND
      // 3. We can see feed elements OR global nav OR search bar OR profile nav
      const isValid = urlCheck && 
                     !pageCheck.isOnLoginPage && 
                     pageCheck.isOnFeedPage;
      
      if (isValid) {
        log.info('Session verified as valid', { currentUrl });
      } else {
        log.warn('Session expired or invalid', { 
          currentUrl,
          urlCheck,
          isOnLoginPage: pageCheck.isOnLoginPage,
          hasFeedelements: pageCheck.isOnFeedPage,
          pageTitle: pageCheck.pageTitle
        });
      }
      
      return isValid;
    } catch (error) {
      log.error('Failed to verify session', error);
      return false;
    }
  }
}

export default new BrowserStateService();
