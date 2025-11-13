import { Page } from 'puppeteer-core';
import { Pool } from 'pg';
import { logger } from '../utils/logger';

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
      
      logger.info('✅ Browser state database initialized successfully');
    } catch (error) {
      logger.error('❌ Browser state database initialization error:', error);
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
      console.log(`💾 Saving browser state for: ${userIdentifier}`);
      
      // Get all cookies from the browser
      const cookies = await page.cookies();
      console.log(`   📦 Saved ${cookies.length} cookies`);
      
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
      
      console.log(`   📦 Saved ${Object.keys(storageData.localStorage).length} localStorage items`);
      console.log(`   📦 Saved ${Object.keys(storageData.sessionStorage).length} sessionStorage items`);
      
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
      
      logger.info(`✅ Browser state saved for: ${userIdentifier}`);
    } catch (error) {
      logger.error('❌ Failed to save browser state:', error);
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
      console.log(`🔄 Restoring browser state for: ${userIdentifier}`);
      
      // Retrieve from database
      const result = await client.query(
        'SELECT cookies, local_storage, session_storage, user_agent FROM browser_state WHERE user_identifier = $1',
        [userIdentifier]
      );
      
      if (result.rows.length === 0) {
        console.log(`   ℹ️  No saved browser state found for: ${userIdentifier}`);
        return false;
      }
      
      const { cookies, local_storage, session_storage, user_agent } = result.rows[0];
      
      // Set user agent if available
      if (user_agent) {
        await page.setUserAgent(user_agent);
        console.log(`   ✅ Restored user agent`);
      }
      
      // Restore cookies
      if (cookies && Array.isArray(cookies)) {
        await page.setCookie(...cookies);
        console.log(`   ✅ Restored ${cookies.length} cookies`);
      }
      
      // Navigate to LinkedIn first to set the correct domain for storage
      await page.goto('https://www.linkedin.com', { 
        waitUntil: 'domcontentloaded',
        timeout: 10000 
      });
      
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
      
      console.log(`   ✅ Restored localStorage and sessionStorage`);
      
      logger.info(`✅ Browser state restored for: ${userIdentifier}`);
      return true;
    } catch (error) {
      logger.error('❌ Failed to restore browser state:', error);
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
      logger.error('❌ Failed to check browser state:', error);
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
      
      logger.info(`✅ Browser state deleted for: ${userIdentifier}`);
    } catch (error) {
      logger.error('❌ Failed to delete browser state:', error);
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
      console.log('🔍 Verifying session validity...');
      
      // Navigate to LinkedIn feed (requires authentication)
      await page.goto('https://www.linkedin.com/feed/', {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });
      
      // Wait a bit for any redirects
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const currentUrl = page.url();
      
      // Check if we're still on the feed page (not redirected to login)
      const isValid = currentUrl.includes('/feed') && !currentUrl.includes('/login');
      
      if (isValid) {
        console.log('   ✅ Session is valid');
      } else {
        console.log('   ❌ Session expired or invalid');
      }
      
      return isValid;
    } catch (error) {
      logger.error('❌ Failed to verify session:', error);
      return false;
    }
  }
}

export default new BrowserStateService();
