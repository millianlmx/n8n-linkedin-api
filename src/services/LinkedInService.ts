import puppeteer, { Browser, Page } from 'puppeteer';
import SessionManager from './SessionManager';
import { CacheService } from './CacheService';
import CaptchaService from './CaptchaService';
import BrowserStateService from './BrowserStateService';
import MetricsService from './MetricsService';
import { SendMessageRequest, LoginRequest, ProfileScrapeRequest } from '../types';
import * as DOMFunctions from '../utils/linkedin-dom-functions';
import * as MessagingDOMFunctions from '../utils/messaging-dom-functions';
import { createServiceLogger } from '../utils/logger';

import { existsSync } from 'fs';

const log = createServiceLogger('LinkedIn');

/**
 * LinkedIn Service
 * Handles all LinkedIn automation operations including authentication,
 * profile scraping, connections, and messaging.
 */
class LinkedInService {
  private cacheService: CacheService;
  private lastRequestTime: number = 0;
  private minRequestInterval: number = 2000; // Minimum 2 seconds between requests

  constructor() {
    this.cacheService = new CacheService();
  }

  /**
   * Enforce rate limiting between LinkedIn requests
   * @private
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      log.debug('Rate limiting: waiting before next request', { waitTime });
      await this.wait(waitTime);
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Reset session by navigating to LinkedIn feed
   * Used when rate limiting or navigation errors are detected
   * @param page - Puppeteer page instance
   * @private
   */
  private async resetToFeed(page: Page): Promise<void> {
    log.info('Resetting session by navigating to LinkedIn feed');

    try {
      await page.goto('https://www.linkedin.com/feed/', {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });

      // Wait for feed to load
      await Promise.race([
        page.waitForSelector('.scaffold-layout__main', { timeout: 5000 }),
        page.waitForSelector('main', { timeout: 5000 }),
      ]).catch(() => {
        log.debug('Feed load timeout, continuing');
      });

      // Wait a bit for the page to stabilize
      await this.wait(2000);

      log.info('Successfully reset to LinkedIn feed');
    } catch (error: any) {
      log.error('Failed to reset to feed', error);
      throw new Error('Unable to reset session. Please try again later.');
    }
  }

  /**
   * Helper function to wait for a specified duration
   * Replaces deprecated page.waitForTimeout()
   * @param ms - Milliseconds to wait
   * @private
   */
  private async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Switch to the operation page (main page) for performing LinkedIn actions
   * If monitoring is active, this brings the operation page to the front
   * @param sessionId - Session identifier
   * @private
   */
  private async switchToOperationPage(sessionId: string): Promise<void> {
    const session = SessionManager.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // If monitoring page exists, bring the operation page to front
    if (session.monitoringPage && !session.monitoringPage.isClosed()) {
      log.debug('Switching to operation tab', { sessionId });
      await session.page.bringToFront();
      await this.wait(300); // Small delay for tab switch
    }
  }

  /**
   * Switch back to the monitoring page after completing an operation
   * If monitoring is active, this brings the monitoring page to the front
   * @param sessionId - Session identifier
   * @private
   */
  private async switchToMonitoringPage(sessionId: string): Promise<void> {
    const session = SessionManager.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // If monitoring page exists, bring it back to front
    if (session.monitoringPage && !session.monitoringPage.isClosed()) {
      log.debug('Switching back to monitoring tab', { sessionId });
      await session.monitoringPage.bringToFront();
      await this.wait(300); // Small delay for tab switch
    }
  }

  /**
   * Finds the Chrome/Chromium executable path on the system
   * @returns Path to Chrome executable or null if not found
   * @private
   */
  private findChrome(): string | null {
    const macPaths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    ];

    // Common Chrome locations on Linux
    const linuxPaths = [
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/snap/bin/chromium',
    ];

    const paths = process.platform === 'darwin' ? macPaths : linuxPaths;

    for (const path of paths) {
      if (existsSync(path)) {
        return path;
      }
    }

    return null;
  }

  /**
   * Initializes a Puppeteer browser instance
   * @param userIdentifier - Optional user identifier to restore browser state
   * @returns Browser instance and new page
   */
  async initializeBrowser(userIdentifier?: string) {
    const startTime = Date.now();
    log.info('Initializing browser', { userIdentifier });

    const executablePath = this.findChrome();
    if (executablePath) {
      log.debug('Using Chrome executable', { path: executablePath });
    }

    try {
      const browser = await puppeteer.launch({
        headless: process.env.HEADLESS ? true : false,
        executablePath: executablePath || undefined,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage', // Overcome limited resource problems in containers
          '--disable-gpu', // Not needed in headless mode
          '--disable-software-rasterizer',
          '--disable-extensions',
          '--no-first-run',
          '--no-zygote',
          '--single-process', // Required for some container environments
          // Prevent background tab throttling
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-features=CalculateNativeWinOcclusion',
        ],
        defaultViewport: {
          width: 1366,
          height: 768,
        },
      });

      // Close the default blank page that Puppeteer creates
      const pages = await browser.pages();
      if (pages.length > 0) {
        await pages[0].close();
      }

      const page = await browser.newPage();

      // Forward console logs from browser to Node.js console
      page.on('console', (msg) => {
        const type = msg.type();
        const text = msg.text();
        if (type === 'log') log.debug('[Browser]', { message: text });
      });

      // Set user agent to match real browser
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      // Try to restore browser state if user identifier is provided
      if (userIdentifier) {
        const hasState = await BrowserStateService.hasBrowserState(userIdentifier);
        if (hasState) {
          log.debug('Attempting to restore browser state', { userIdentifier });
          const restored = await BrowserStateService.restoreBrowserState(userIdentifier, page);

          if (restored) {
            // Verify if the session is still valid
            const isValid = await BrowserStateService.verifySession(page);

            if (isValid) {
              log.info('Browser state restored successfully', { userIdentifier });
              MetricsService.trackBrowserLifecycle('init');
              MetricsService.trackLinkedInOperation('browser_init', (Date.now() - startTime) / 1000, true);
              return { browser, page, sessionRestored: true, isAuthenticated: true };
            } else {
              log.warn('Saved session expired', { userIdentifier });
              await BrowserStateService.deleteBrowserState(userIdentifier);

              // Clear all cookies and storage to ensure a clean state
              log.debug('Clearing cookies and storage');
              const client = await page.target().createCDPSession();
              await client.send('Network.clearBrowserCookies');
              await client.send('Network.clearBrowserCache');

              // Clear localStorage and sessionStorage
              await page.evaluate(() => {
                localStorage.clear();
                sessionStorage.clear();
              });

              // Navigate to a blank page to reset the page state
              // This ensures the page is in a clean state for subsequent login attempts
              await page.goto('about:blank', { waitUntil: 'domcontentloaded' });
              log.debug('Page reset to blank state after expired session');
            }
          }
        }
      }

      log.info('Browser initialized successfully');
      MetricsService.trackBrowserLifecycle('init');
      MetricsService.trackLinkedInOperation('browser_init', (Date.now() - startTime) / 1000, true);
      return { browser, page, sessionRestored: false };
    } catch (error: any) {
      log.error('Failed to initialize browser', error);
      MetricsService.trackLinkedInOperation('browser_init', (Date.now() - startTime) / 1000, false);
      throw new Error(`Failed to initialize browser: ${error.message}`);
    }
  }

  /**
   * Authenticates with LinkedIn using provided credentials
   * @param sessionId - Unique session identifier
   * @param credentials - LinkedIn login credentials
   * @returns Success status and redirect URL
   */
  async login(sessionId: string, credentials: LoginRequest) {
    const session = SessionManager.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const { page } = session;

    try {
      log.info('Initiating LinkedIn login', { sessionId });

      const username = credentials.email || process.env.LINKEDIN_EMAIL;
      const password = credentials.password || process.env.LINKEDIN_PASSWORD;

      if (!username || !password) {
        throw new Error('Email and password are required');
      }
      await page.goto('https://www.linkedin.com/login', {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // Wait for login form
      await page.waitForSelector('#username', { timeout: 10000 });

      // Fill in credentials
      await page.type('#username', username, { delay: 100 });
      await page.type('#password', password, { delay: 100 });

      // Click login button and wait for navigation
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }),
        page.click('button[type="submit"]'),
      ]);

      // Wait a bit for any redirects to complete
      await this.wait(2000);

      // Check current URL to determine next action
      let currentUrl = page.url();
      log.debug('Login navigation completed', { currentUrl });

      // Only check for CAPTCHA if we're on the challenge page
      if (currentUrl.includes('/checkpoint/challenge')) {
        log.warn('LinkedIn challenge page detected', { currentUrl });

        // Check for CAPTCHA challenge
        const hasCaptcha = await CaptchaService.detectRecaptcha(page);
        if (hasCaptcha) {
          log.info('reCAPTCHA challenge detected');

          if (CaptchaService.isAvailable()) {
            log.info('Attempting to solve CAPTCHA automatically');
            const solved = await CaptchaService.handleRecaptchaChallenge(page);

            if (solved) {
              log.info('CAPTCHA solved successfully');
              await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {
                log.debug('Navigation timeout after CAPTCHA solve');
              });
              await this.wait(2000);
              currentUrl = page.url();
              log.debug('URL after CAPTCHA solve', { currentUrl });
            } else {
              log.warn('Failed to solve CAPTCHA automatically');
              throw new Error('CAPTCHA challenge detected but could not be solved automatically. Please solve it manually or check your 2Captcha API key.');
            }
          } else {
            throw new Error('CAPTCHA challenge detected but 2Captcha service is not configured. Please set CAPTCHA_API_KEY in your .env file or solve it manually.');
          }
        } else {
          log.warn('Challenge page detected but no reCAPTCHA found');
          throw new Error('LinkedIn security challenge detected. Please complete it manually in the browser.');
        }
      }

      // Check for successful login indicators
      const isLoggedIn = currentUrl.includes('/feed') ||
        currentUrl.includes('/check/add-phone') ||
        currentUrl.includes('/mynetwork') ||
        currentUrl.includes('/jobs') ||
        currentUrl.includes('/messaging') ||
        !currentUrl.includes('/login');

      if (isLoggedIn && !currentUrl.includes('/checkpoint')) {
        SessionManager.updateSession(sessionId, {
          isAuthenticated: true,
        });

        log.info('Login successful', { sessionId });

        // Save browser state (cookies, localStorage, sessionStorage)
        try {
          const userIdentifier = credentials.email || process.env.LINKEDIN_EMAIL || sessionId;
          await BrowserStateService.saveBrowserState(userIdentifier, page);
        } catch (saveError: any) {
          log.warn('Failed to save browser state', saveError);
        }

        // Automatically start message monitoring in a separate tab
        log.debug('Starting automatic message monitoring', { sessionId });
        try {
          await this.startMessageMonitoring(sessionId);
          log.info('Message monitoring started', { sessionId });
        } catch (monitoringError: any) {
          log.warn('Failed to start automatic monitoring', { sessionId, error: monitoringError.message });
        }

        return {
          success: true,
          message: 'Login successful',
          redirectUrl: currentUrl
        };
      } else if (currentUrl.includes('/checkpoint/challenge')) {
        throw new Error('LinkedIn security challenge detected. Please complete it manually in the browser.');
      } else if (currentUrl.includes('/login')) {
        throw new Error('Login failed. Please check your credentials.');
      } else {
        // Unknown state - mark as authenticated but warn
        log.warn('Unknown post-login URL', { currentUrl });
        SessionManager.updateSession(sessionId, {
          isAuthenticated: true,
        });
        return {
          success: true,
          message: 'Login completed (unknown state)',
          redirectUrl: currentUrl
        };
      }
    } catch (error: any) {
      log.error('Login failed', error, { sessionId });
      throw new Error(`Login failed: ${error.message}`);
    }
  }

  /**
   * Start message monitoring in a dedicated browser tab
   * Refreshes every 15 minutes to check for new messages
   */
  async startMessageMonitoring(sessionId: string) {
    const session = SessionManager.getSession(sessionId);
    if (!session || !session.isAuthenticated) {
      throw new Error('Not authenticated');
    }

    try {
      log.info('Starting message monitoring', { sessionId });

      // Create a new page for monitoring
      const monitoringPage = await session.browser.newPage();

      // Forward console logs from browser to Node.js (excluding errors to reduce noise)
      monitoringPage.on('console', (msg) => {
        const type = msg.type();
        const text = msg.text();
        if (type === 'log') log.debug('[Browser]', { message: text });
        // Skip browser errors to avoid polluting logs
      });

      // Inject the MessagingDOMFunctions into the page context BEFORE navigation
      await monitoringPage.evaluateOnNewDocument(() => {
        (window as any).MessagingDOMFunctions = {
          processUnreadConversations: () => {
            const convElements = document.querySelectorAll('.msg-conversation-listitem');
            const unreadConvs: any[] = [];

            convElements.forEach((conv) => {
              const unreadBadge = conv.querySelector('.msg-conversation-card__unread-count');

              if (unreadBadge) {
                const nameEl = conv.querySelector('.msg-conversation-listitem__participant-names');
                const conversationCard = conv.querySelector('.msg-conversation-card');
                const conversationId = conversationCard?.id || '';

                if (nameEl && conversationId) {
                  const liId = conv.id;
                  const convData = {
                    name: nameEl.textContent?.trim() || '',
                    elementId: liId,
                    unreadCount: unreadBadge.textContent?.trim() || '1',
                  };
                  unreadConvs.push(convData);
                }
              }
            });

            return unreadConvs;
          },

          setupMessageObserver: () => {
            if ((window as any).messageObserver) {
              (window as any).messageObserver.disconnect();
            }

            let conversationList = document.querySelector('#main > div > div.scaffold-layout__list-detail-inner.scaffold-layout__list-detail-inner--grow > div.scaffold-layout__list.msg__list > div.relative.display-flex.justify-center.flex-column.overflow-hidden.msg-conversations-container--inbox-shortcuts > ul');

            if (!conversationList) {
              conversationList = document.querySelector('.msg-conversations-container__conversations-list') ||
                document.querySelector('ul[class*="msg-conversations"]') ||
                document.querySelector('.scaffold-layout__list ul');
            }

            if (conversationList) {
              const observer = new MutationObserver((mutations) => {
                let hasUnreadChanges = false;

                for (const mutation of mutations) {
                  if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                      if (node.nodeType === Node.ELEMENT_NODE) {
                        const element = node as HTMLElement;
                        if (element.querySelector?.('.msg-conversation-card__unread-count') ||
                          element.classList?.contains('msg-conversation-listitem')) {
                          hasUnreadChanges = true;
                        }
                      }
                    });
                  } else if (mutation.type === 'attributes') {
                    const target = mutation.target as HTMLElement;
                    if (target.classList?.contains('msg-conversation-card__unread-count') ||
                      target.querySelector?.('.msg-conversation-card__unread-count')) {
                      hasUnreadChanges = true;
                    }
                  }

                  if (hasUnreadChanges) break;
                }

                if (hasUnreadChanges) {
                  window.dispatchEvent(new CustomEvent('linkedin-new-message'));
                }
              });

              observer.observe(conversationList, {
                childList: true,
                subtree: true,
                attributes: true,
                characterData: true
              });

              (window as any).messageObserver = observer;

              return {
                success: true,
                selector: conversationList.className || 'ul',
                elementFound: true
              };
            } else {
              return {
                success: false,
                selector: null,
                elementFound: false
              };
            }
          },

          clickConversation: (elementId: string) => {
            const convElement = document.getElementById(elementId);
            if (convElement) {
              const linkEl = convElement.querySelector('.msg-conversation-listitem__link');
              if (linkEl) {
                (linkEl as HTMLElement).click();
                return true;
              }
            }
            return false;
          },

          extractProfileUrl: () => {
            const profileLink = document.querySelector('#thread-detail-jump-target > div > a');
            if (profileLink) {
              return profileLink.getAttribute('href');
            }
            return null;
          },

          setupMessageEventListener: () => {
            (window as any).messageHandler = () => {
              (window as any).handleNewMessage();
            };

            window.addEventListener('linkedin-new-message', (window as any).messageHandler);
          },

          reSetupMessageEventListener: () => {
            window.removeEventListener('linkedin-new-message', (window as any).messageHandler);

            (window as any).messageHandler = () => {
              (window as any).handleNewMessage();
            };

            window.addEventListener('linkedin-new-message', (window as any).messageHandler);
          },

          startHeartbeat: () => {
            if ((window as any).monitoringHeartbeat) {
              clearInterval((window as any).monitoringHeartbeat);
            }

            (window as any).monitoringHeartbeat = setInterval(() => {
              console.log('💓 Monitoring Heartbeat');

              // 1. Anti-Throttling: trivial DOM manipulation to prove activity
              // This forces the browser to prioritize this tab's rendering
              const tick = document.getElementById('monitoring-tick');
              if (!tick) {
                const div = document.createElement('div');
                div.id = 'monitoring-tick';
                div.style.display = 'none';
                document.body.appendChild(div);
              } else {
                tick.innerText = Date.now().toString();
              }

              // 2. Observer Health Check
              const conversationList = document.querySelector('.msg-conversations-container__conversations-list') ||
                document.querySelector('ul[class*="msg-conversations"]');

              // If the list exists but our observer is disconnected (or the list was replaced by React)
              if (conversationList && !(window as any).messageObserver) {
                console.log('⚠️ Observer missing, restarting...');
                window.dispatchEvent(new CustomEvent('linkedin-restart-observer'));
              }
            }, 10000); // Check every 10 seconds
          },
        };
      });

      // Navigate to messaging page (faster loading)
      await monitoringPage.goto('https://www.linkedin.com/messaging/', {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });
      log.debug('Monitoring page loaded');

      // Wait for conversation list to be present
      await this.wait(2000);

      // Store monitoring page in session
      SessionManager.updateSession(sessionId, {
        monitoringPage,
      });

      // Flag to prevent concurrent processing
      let isProcessing = false;

      // Function to setup the observer (can be called multiple times)
      const setupObserver = async () => {
        const observerSetup = await monitoringPage.evaluate(() => {
          // Inject DOM functions into window
          (window as any).processUnreadConversations = (window as any).MessagingDOMFunctions.processUnreadConversations;

          // Setup the observer
          return (window as any).MessagingDOMFunctions.setupMessageObserver();
        });

        return observerSetup;
      };

      // IMPORTANT: Expose function BEFORE setting up the observer
      // This allows the browser to call our Node.js function
      await monitoringPage.exposeFunction('handleNewMessage', async () => {
        // Prevent concurrent executions
        if (isProcessing) {
          return;
        }

        isProcessing = true;

        try {
          log.debug('Processing new message notification');

          // Get unread conversations
          const conversations = await monitoringPage.evaluate(() => {
            return (window as any).processUnreadConversations();
          });

          if (conversations.length > 0) {
            log.info('Found unread conversations', { count: conversations.length });

            // Process each unread conversation
            for (const conv of conversations) {
              try {
                log.debug('Processing conversation', { name: conv.name });

                // Click on the conversation to open it
                await monitoringPage.evaluate((elementId) => {
                  return (window as any).MessagingDOMFunctions.clickConversation(elementId);
                }, conv.elementId);

                // Wait for the conversation to load
                await this.wait(2000);

                // Get the current URL which should now be the conversation URL
                const currentUrl = monitoringPage.url();
                log.debug('Conversation URL extracted', { url: currentUrl });

                // Extract shortened profile URL from the thread detail section
                const shortenedProfileUrl = await monitoringPage.evaluate(() => {
                  return (window as any).MessagingDOMFunctions.extractProfileUrl();
                });

                if (!shortenedProfileUrl) {
                  log.warn('Could not extract profile URL', { name: conv.name });
                  continue;
                }

                // Open the shortened URL in a new tab to get the real profile URL
                const profilePage = await session.browser.newPage();
                let cleanProfileUrl: string;

                try {
                  // Navigate to the shortened URL (don't wait for full load)
                  await profilePage.goto(shortenedProfileUrl, {
                    waitUntil: 'domcontentloaded',
                    timeout: 10000,
                  });

                  // Wait 3 seconds for redirect to complete
                  await this.wait(3000);

                  // Get the real profile URL from the browser
                  const realProfileUrl = profilePage.url();

                  // Clean profile URL (remove query params)
                  cleanProfileUrl = realProfileUrl.split('?')[0];
                  log.debug('Profile URL extracted', { profileUrl: cleanProfileUrl });

                  // Close the profile page
                  await profilePage.close();
                } catch (error: any) {
                  log.error('Failed to resolve profile URL', error);
                  await profilePage.close();
                  continue;
                }

                // Get existing cached messages
                const cachedMessages = await this.cacheService.getConversation(cleanProfileUrl);

                // Fetch only the visible new messages from LinkedIn (no scrolling)
                const newMessages = await this.readConversationInternal(monitoringPage, currentUrl, cleanProfileUrl, false);

                // Merge: append new messages to existing cache
                let updatedMessages;
                if (cachedMessages && Array.isArray(cachedMessages)) {
                  // Filter out duplicates by checking message content and timestamp
                  const existingMessageIds = new Set(
                    cachedMessages.map((m: any) => `${m.sender}_${m.timestamp}_${m.message}`)
                  );

                  const uniqueNewMessages = newMessages.filter((m: any) =>
                    !existingMessageIds.has(`${m.sender}_${m.timestamp}_${m.message}`)
                  );

                  // Append new messages to the end
                  updatedMessages = [...cachedMessages, ...uniqueNewMessages];
                  log.info('Added new messages', { count: uniqueNewMessages.length, name: conv.name });
                } else {
                  // No existing cache, use all messages
                  updatedMessages = newMessages;
                  log.debug('Cached messages', { count: newMessages.length, name: conv.name });
                }

                // Update cache with merged messages
                await this.cacheService.cacheConversation(cleanProfileUrl, updatedMessages);

              } catch (error: any) {
                log.error('Failed to process conversation', error, { name: conv.name });
              }
            }

            // After processing all conversations, navigate back to messaging list
            log.debug('Returning to messaging list');
            await monitoringPage.goto('https://www.linkedin.com/messaging/', {
              waitUntil: 'domcontentloaded',
              timeout: 15000,
            });

            // Wait for page to stabilize
            await this.wait(2000);

            // Re-setup the observer
            const reObserverSetup = await setupObserver();
            if (reObserverSetup.success) {
              log.debug('Observer re-established', { selector: reObserverSetup.selector });
            } else {
              log.warn('Failed to re-establish observer');
            }

            // Re-setup event listener (critical - gets lost on navigation)
            await monitoringPage.evaluate(() => {
              (window as any).MessagingDOMFunctions.reSetupMessageEventListener();
            });
          }
        } catch (error: any) {
          log.error('Message processing error', error);
        } finally {
          isProcessing = false;
        }
      });

      // Set up initial MutationObserver
      const observerSetup = await setupObserver();

      if (observerSetup.success) {
        log.debug('MutationObserver set up', { selector: observerSetup.selector });
      } else {
        log.error('Could not find conversation list element');
        throw new Error('Conversation list element not found');
      }

      // Set up event listener in the page to call our exposed function
      await monitoringPage.evaluate(() => {
        (window as any).MessagingDOMFunctions.setupMessageEventListener();
      });

      // Set up heartbeat restart listener and start heartbeat
      await monitoringPage.evaluate(() => {
        window.addEventListener('linkedin-restart-observer', () => {
          (window as any).MessagingDOMFunctions.setupMessageObserver();
        });
        // Start the heartbeat
        (window as any).MessagingDOMFunctions.startHeartbeat();
      });

      // Set up periodic refresh (every 9 minutes) as backup
      const monitoringInterval = setInterval(async () => {
        try {
          log.debug('Periodic refresh (backup check)');

          if (monitoringPage.isClosed()) {
            log.warn('Monitoring page closed, stopping monitoring');
            clearInterval(monitoringInterval);
            return;
          }

          // Add mouse movement before reload to simulate user activity
          try {
            await monitoringPage.mouse.move(
              Math.random() * 500,
              Math.random() * 500
            );
            await this.wait(500);
          } catch (e) {
            // Ignore mouse movement errors
          }

          // Reload the messaging page to ensure observer is still working
          try {
            await monitoringPage.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
          } catch (reloadError: any) {
            // If reload times out, check if page is still accessible
            if (reloadError.message.includes('Navigation timeout')) {
              log.warn('Monitoring page reload timeout - possible rate limiting, skipping refresh');
              return; // Skip this refresh cycle
            }
            throw reloadError;
          }
          await this.wait(2000);

          // Re-setup the observer after reload
          const observerReestablished = await monitoringPage.evaluate(() => {
            let conversationList = document.querySelector('#main > div > div.scaffold-layout__list-detail-inner.scaffold-layout__list-detail-inner--grow > div.scaffold-layout__list.msg__list > div.relative.display-flex.justify-center.flex-column.overflow-hidden.msg-conversations-container--inbox-shortcuts > ul');

            if (!conversationList) {
              conversationList = document.querySelector('.msg-conversations-container__conversations-list') ||
                document.querySelector('ul[class*="msg-conversations"]') ||
                document.querySelector('.scaffold-layout__list ul');
            }

            if (conversationList && !(window as any).messageObserver) {
              // Note: Cannot use log.debug here as we're in browser context

              const observer = new MutationObserver((mutations) => {
                let hasUnreadChanges = false;

                for (const mutation of mutations) {
                  if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                      if (node.nodeType === Node.ELEMENT_NODE) {
                        const element = node as HTMLElement;
                        if (element.querySelector?.('.msg-conversation-card__unread-count') ||
                          element.classList?.contains('msg-conversation-listitem')) {
                          hasUnreadChanges = true;
                        }
                      }
                    });
                  } else if (mutation.type === 'attributes') {
                    const target = mutation.target as HTMLElement;
                    if (target.classList?.contains('msg-conversation-card__unread-count') ||
                      target.querySelector?.('.msg-conversation-card__unread-count')) {
                      hasUnreadChanges = true;
                    }
                  }

                  if (hasUnreadChanges) break;
                }

                if (hasUnreadChanges) {
                  window.dispatchEvent(new CustomEvent('linkedin-new-message'));
                }
              });

              observer.observe(conversationList, {
                childList: true,
                subtree: true,
                attributes: true,
                characterData: true
              });

              (window as any).messageObserver = observer;
              return true; // Successfully re-established
            }
            return false; // Could not find conversation list
          });

          if (observerReestablished) {
            log.debug('Observer re-established successfully');
          } else {
            log.warn('Could not find conversation list element after reload');
          }

          // Restart the heartbeat after reload
          await monitoringPage.evaluate(() => {
            (window as any).MessagingDOMFunctions.setupMessageEventListener();
            (window as any).MessagingDOMFunctions.startHeartbeat();
          });

          log.debug('Observer refresh completed');
        } catch (error: any) {
          log.error('Monitoring refresh error', error);
        }
      }, 9 * 60 * 1000); // 9 minutes (safely under the 10-minute throttling threshold)

      // Store interval in session
      SessionManager.updateSession(sessionId, {
        monitoringInterval,
      });

      log.info('Message monitoring started');
      return { success: true, message: 'Message monitoring started' };
    } catch (error: any) {
      log.error('Failed to start monitoring', error);
      throw new Error(`Failed to start monitoring: ${error.message}`);
    }
  }

  /**
   * Stop message monitoring
   */
  async stopMessageMonitoring(sessionId: string) {
    const session = SessionManager.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    try {
      log.info('Stopping message monitoring', { sessionId });

      if (session.monitoringInterval) {
        clearInterval(session.monitoringInterval);
      }

      if (session.monitoringPage && !session.monitoringPage.isClosed()) {
        await session.monitoringPage.close();
      }

      SessionManager.updateSession(sessionId, {
        monitoringPage: undefined,
        monitoringInterval: undefined,
      });

      log.info('Message monitoring stopped', { sessionId });
      return { success: true, message: 'Message monitoring stopped' };
    } catch (error: any) {
      log.error('Failed to stop monitoring', error, { sessionId });
      throw new Error(`Failed to stop monitoring: ${error.message}`);
    }
  }

  /**
   * Extract profile URL from conversation URL
   */
  private async extractProfileUrlFromConversation(page: Page, conversationUrl: string): Promise<string | null> {
    try {
      // Navigate to conversation
      const fullUrl = conversationUrl.startsWith('http')
        ? conversationUrl
        : `https://www.linkedin.com${conversationUrl}`;

      await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await this.wait(2000); // Wait for conversation to fully load

      // Extract profile URL from conversation header - try multiple selectors
      const profileUrl = await page.evaluate(() => {
        // Try different selectors for profile link
        const selectors = [
          '.msg-thread__link-to-profile',
          'a[href*="/in/"]',
          '.msg-entity-lockup__entity-title a',
          '.msg-thread__topbar a[href*="/in/"]'
        ];

        for (const selector of selectors) {
          const link = document.querySelector(selector) as HTMLAnchorElement;
          if (link && link.href && link.href.includes('/in/')) {
            // Clean up the URL to get just the profile URL
            const url = link.href.split('?')[0]; // Remove query params
            return url;
          }
        }

        return null;
      });

      if (profileUrl) {
        log.debug('Extracted profile URL', { profileUrl });
      }

      return profileUrl;
    } catch (error: any) {
      log.error('Failed to extract profile URL', error);
      return null;
    }
  }

  /**
   * Internal method to read conversation (used by monitoring)
   */
  private async readConversationInternal(page: Page, conversationUrl: string, profileUrl: string, forceCache: boolean = false) {
    try {
      const fullUrl = conversationUrl.startsWith('http')
        ? conversationUrl
        : `https://www.linkedin.com${conversationUrl}`;

      await page.goto(fullUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      await page.waitForSelector('.msg-s-message-list', { timeout: 10000 });
      const messages = await page.evaluate(DOMFunctions.extractConversationMessages);

      // Always cache when called from monitoring
      if (forceCache && profileUrl) {
        await this.cacheService.cacheConversation(profileUrl, messages);
      }

      return messages;
    } catch (error: any) {
      throw new Error(`Failed to read conversation: ${error.message}`);
    }
  }

  /**
   * Scrapes a LinkedIn profile with caching support
   * @param sessionId - Unique session identifier
   * @param request - Profile scrape request containing the profile URL
   * @returns Scraped profile data (from cache or fresh scrape)
   */
  async scrapeProfile(sessionId: string, request: ProfileScrapeRequest) {
    const startTime = Date.now();
    const session = SessionManager.getSession(sessionId);
    if (!session || !session.isAuthenticated) {
      throw new Error('Not authenticated');
    }

    const cachedProfile = await this.cacheService.getProfile(request.url);
    if (cachedProfile) {
      log.debug('Returning cached profile', { url: request.url });
      MetricsService.trackCacheOperation('get', 'hit');
      return { success: true, data: cachedProfile };
    }

    MetricsService.trackCacheOperation('get', 'miss');

    const { page } = session;

    try {
      // Enforce rate limiting
      await this.enforceRateLimit();

      // Switch to operation page
      await this.switchToOperationPage(sessionId);

      log.info('Scraping profile', { url: request.url });

      // Navigate to profile with domcontentloaded (faster than networkidle2)
      await page.goto(request.url, {
        waitUntil: 'domcontentloaded',
        timeout: 10000, // Reduced from 60s to 10s
      });

      // Wait for main content to appear - use Promise.race for faster fallback
      await Promise.race([
        page.waitForSelector('.scaffold-layout__main', { timeout: 4000 }),
        page.waitForSelector('main', { timeout: 4000 }),
        page.waitForSelector('h1', { timeout: 4000 }), // Name should always be present
      ]).catch(() => {
        // If all fail, continue anyway - data extraction will handle missing elements
        log.debug('Main content selector timeout, continuing');
      });

      // Wait for content to render after scrolling
      await this.wait(1000);

      log.debug('Page content loaded');

      // Extract profile data using extracted DOM function
      const profileData = await page.evaluate(DOMFunctions.extractProfileData);

      log.info('Profile scraped successfully', { name: profileData.name });

      // Save to cache
      await this.cacheService.cacheProfile(request.url, profileData);
      MetricsService.trackCacheOperation('set', 'success');

      // Switch back to monitoring page
      await this.switchToMonitoringPage(sessionId);

      // Track successful operation
      const duration = (Date.now() - startTime) / 1000;
      MetricsService.trackLinkedInOperation('profile_scrape', duration, true);

      return { success: true, data: profileData };
    } catch (error: any) {
      log.error('Profile scraping failed', error);
      // Switch back to monitoring page even on error
      await this.switchToMonitoringPage(sessionId);

      // Track failed operation
      const duration = (Date.now() - startTime) / 1000;
      MetricsService.trackLinkedInOperation('profile_scrape', duration, false);

      throw new Error(`Profile scraping failed: ${error.message}`);
    }
  }

  async listConversations(sessionId: string) {
    const session = SessionManager.getSession(sessionId);
    if (!session || !session.isAuthenticated) {
      throw new Error('Not authenticated');
    }

    const { page } = session;

    try {
      log.info('Fetching conversations', { sessionId });

      // Navigate to messaging
      await page.goto('https://www.linkedin.com/messaging/', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      // Wait for conversations list to load
      await page.waitForSelector('.msg-conversations-container__conversations-list', { timeout: 10000 });

      // Wait a bit for conversations to render
      await this.wait(2000);

      // Scroll the conversations list to load more conversations
      await page.evaluate(() => {
        const scrollContainer = document.querySelector(
          '#main > div > div.scaffold-layout__list-detail-inner.scaffold-layout__list-detail-inner--grow > div.scaffold-layout__list.msg__list > div.relative.display-flex.justify-center.flex-column.overflow-hidden.msg-conversations-container--inbox-shortcuts > ul'
        );

        if (scrollContainer) {
          // Scroll to bottom multiple times to load more conversations
          const scrollHeight = scrollContainer.scrollHeight;
          let currentScroll = 0;
          const scrollStep = 500;

          const scrollInterval = setInterval(() => {
            if (currentScroll < scrollHeight) {
              currentScroll += scrollStep;
              scrollContainer.scrollTop = currentScroll;
            } else {
              clearInterval(scrollInterval);
            }
          }, 100);

          // Wait for scroll to complete
          setTimeout(() => clearInterval(scrollInterval), 3000);
        }
      });

      // Wait for additional conversations to load
      await this.wait(3000);

      // First, collect basic conversation data
      const conversationsData = await page.evaluate(DOMFunctions.extractConversationsList);

      log.info('Found conversations', { total: conversationsData.length, processing: Math.min(25, conversationsData.length) });

      // Now click on each conversation (max 25) to get the actual URL
      const maxConversations = Math.min(25, conversationsData.length);
      const conversations: any[] = [];

      for (let i = 0; i < maxConversations; i++) {
        try {
          // Click on the conversation
          await page.evaluate((index) => {
            const convItems = document.querySelectorAll('li.msg-conversation-listitem');
            const item = convItems[index];
            if (item) {
              const linkEl = item.querySelector('.msg-conversation-listitem__link') as HTMLElement;
              if (linkEl) {
                linkEl.click();
              }
            }
          }, i);

          // Wait for URL to change with random delay (0-500ms) to avoid blacklist
          const randomDelay = Math.floor(Math.random() * 500);
          await this.wait(randomDelay);

          // Get the current URL
          const currentUrl = page.url();

          // Add URL to conversation data
          conversations.push({
            ...conversationsData[i],
            url: currentUrl,
          });

          log.debug('Processing conversation', { index: i + 1, total: maxConversations, name: conversationsData[i].name, url: currentUrl });
        } catch (error) {
          log.warn('Failed to get URL for conversation', { index: i + 1, error });
          // Add without URL
          conversations.push(conversationsData[i]);
        }
      }

      // Add remaining conversations without URLs (if more than 25)
      if (conversationsData.length > 25) {
        for (let i = 25; i < conversationsData.length; i++) {
          conversations.push(conversationsData[i]);
        }
        log.debug('Added conversations without URLs', { count: conversationsData.length - 25 });
      }

      log.info('Extracted conversations', { total: conversations.length, withUrls: maxConversations });
      return { success: true, data: conversations };
    } catch (error: any) {
      log.error('Failed to list conversations', error);
      throw new Error(`Failed to list conversations: ${error.message}`);
    }
  }

  async getUnreadMessages(sessionId: string) {
    const session = SessionManager.getSession(sessionId);
    if (!session || !session.isAuthenticated) {
      throw new Error('Not authenticated');
    }

    const { page } = session;

    try {
      log.info('Getting unread messages', { sessionId });

      // Navigate to messaging page
      await page.goto('https://www.linkedin.com/messaging/', {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // Wait for conversations list to load
      await page.waitForSelector('.msg-conversations-container__conversations-list', { timeout: 10000 });
      await this.wait(2000);

      // Extract unread conversations
      const unreadConversations = await page.evaluate(DOMFunctions.extractUnreadConversations);

      log.info('Found unread conversations', { count: unreadConversations.length });

      // Click on each unread conversation to get URL
      const unreadWithUrls: any[] = [];

      for (let i = 0; i < unreadConversations.length; i++) {
        try {
          const conv = unreadConversations[i];

          // Click on the conversation
          await page.evaluate((index) => {
            const convItems = document.querySelectorAll('li.msg-conversation-listitem');
            const item = convItems[index];
            if (item) {
              const linkEl = item.querySelector('.msg-conversation-listitem__link') as HTMLElement;
              if (linkEl) {
                linkEl.click();
              }
            }
          }, conv.index);

          // Wait for URL to change
          await this.wait(500);

          // Get the current URL
          const currentUrl = page.url();

          // Add URL to conversation data
          unreadWithUrls.push({
            ...conv,
            url: currentUrl,
          });

          log.debug('Processing unread conversation', { index: i + 1, total: unreadConversations.length, name: conv.name, unreadCount: conv.unreadCount, url: currentUrl });
        } catch (error) {
          log.warn('Failed to get URL for unread conversation', { index: i + 1, error });
          unreadWithUrls.push(unreadConversations[i]);
        }
      }

      log.info('Retrieved unread conversations', { count: unreadWithUrls.length });
      return { success: true, data: unreadWithUrls };
    } catch (error: any) {
      log.error('Failed to get unread messages', error);
      throw new Error(`Failed to get unread messages: ${error.message}`);
    }
  }

  async readConversation(sessionId: string, conversationUrl: string, profileUrl?: string, forceRefresh: boolean = false) {
    const session = SessionManager.getSession(sessionId);
    if (!session || !session.isAuthenticated) {
      throw new Error('Not authenticated');
    }

    // Check cache if profileUrl is provided and forceRefresh is false
    if (profileUrl && !forceRefresh) {
      log.debug('Checking cache for conversation', { profileUrl });
      const cachedConversation = await this.cacheService.getConversation(profileUrl);

      if (cachedConversation) {
        log.debug('Cache hit - returning cached conversation');
        return { success: true, data: cachedConversation, cached: true, cacheUpdated: false };
      }

      log.debug('Cache miss - fetching from LinkedIn');
    } else if (forceRefresh && profileUrl) {
      log.debug('Force refresh enabled - fetching from LinkedIn');
    }

    const { page } = session;

    try {
      // Enforce rate limiting
      await this.enforceRateLimit();

      // Switch to operation page
      await this.switchToOperationPage(sessionId);

      log.info('Reading conversation', { conversationUrl });

      // Navigate to the conversation with domcontentloaded (faster than networkidle2)
      let navigationSucceeded = false;
      let retryCount = 0;
      const maxRetries = 1;

      while (!navigationSucceeded && retryCount <= maxRetries) {
        try {
          await page.goto(conversationUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 10000,
          });
          navigationSucceeded = true;
        } catch (navError: any) {
          // If navigation times out, check if we're being rate limited
          if (navError.message.includes('Navigation timeout')) {
            log.warn('Navigation timeout - possible rate limiting', { conversationUrl, retryCount });

            await this.wait(3000);
            const currentUrl = page.url();

            // If we're on a messaging page, consider it successful
            if (currentUrl.includes('linkedin.com/messaging/')) {
              log.debug('Navigation timed out but page loaded', { currentUrl });
              navigationSucceeded = true;
            } else if (retryCount < maxRetries) {
              // Reset to feed and retry
              log.info('Resetting to feed before retry', { retryCount: retryCount + 1 });
              await this.resetToFeed(page);
              retryCount++;
            } else {
              throw new Error('LinkedIn may be rate limiting requests. Please wait a few minutes and try again.');
            }
          } else {
            throw navError;
          }
        }
      }

      // Wait 4 seconds for page to fully load (good fiber connection)
      await this.wait(4000);

      // Wait for messages with better error handling
      try {
        await page.waitForSelector('.msg-s-message-list', { timeout: 10000 });
      } catch (selectorError: any) {
        // Check if we're on a rate limit or error page
        const currentUrl = page.url();
        const pageTitle = await page.title();

        log.error('Message list not found', { currentUrl, pageTitle });

        if (pageTitle.includes('Security Verification') || pageTitle.includes('Vérification')) {
          throw new Error('LinkedIn security verification required. Please complete verification in browser.');
        }

        throw new Error('Unable to load conversation. LinkedIn may be rate limiting requests. Please wait and try again.');
      }

      // Extract messages
      const messages = await page.evaluate(DOMFunctions.extractConversationMessages);

      log.info('Successfully read conversation', { messageCount: messages.length });

      // Track if cache was updated
      let cacheUpdated = false;

      // Cache the conversation if profileUrl is provided
      if (profileUrl) {
        // If force refresh, check if data has changed before updating cache
        if (forceRefresh) {
          const cachedConversation = await this.cacheService.getConversation(profileUrl);

          // Compare fresh data with cached data
          const hasChanges = !cachedConversation ||
            JSON.stringify(cachedConversation) !== JSON.stringify(messages);

          if (hasChanges) {
            await this.cacheService.cacheConversation(profileUrl, messages);
            cacheUpdated = true;
            if (cachedConversation) {
              log.info('Cache updated - new messages detected', { messageCount: messages.length });
            } else {
              log.info('Cache created with fresh data', { messageCount: messages.length });
            }
          } else {
            log.debug('No changes detected - cache not updated', { messageCount: messages.length });
          }
        } else {
          // Normal cache miss - always cache
          await this.cacheService.cacheConversation(profileUrl, messages);
          cacheUpdated = true;
          log.info('Conversation cached', { messageCount: messages.length });
        }
      }

      // Switch back to monitoring page
      await this.switchToMonitoringPage(sessionId);

      return { success: true, data: messages, cached: false, cacheUpdated };
    } catch (error: any) {
      log.error('Failed to read conversation', error);
      // Switch back to monitoring page even on error
      await this.switchToMonitoringPage(sessionId);
      throw new Error(`Failed to read conversation: ${error.message}`);
    }
  }

  async sendMessage(sessionId: string, request: SendMessageRequest) {
    const session = SessionManager.getSession(sessionId);
    if (!session || !session.isAuthenticated) {
      throw new Error('Not authenticated');
    }

    const { page } = session;

    try {
      // Enforce rate limiting
      await this.enforceRateLimit();

      // Switch to operation page
      await this.switchToOperationPage(sessionId);

      log.info('Sending message', { conversationUrl: request.conversationUrl });

      // Navigate to the conversation with domcontentloaded (faster than networkidle2)
      const fullUrl = request.conversationUrl;

      let navigationSucceeded = false;
      let retryCount = 0;
      const maxRetries = 1;

      while (!navigationSucceeded && retryCount <= maxRetries) {
        try {
          await page.goto(fullUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 10000,
          });
          navigationSucceeded = true;
        } catch (navError: any) {
          // If navigation times out, check if we're being rate limited
          if (navError.message.includes('Navigation timeout')) {
            log.warn('Navigation timeout - possible rate limiting', { conversationUrl: fullUrl, retryCount });

            await this.wait(3000);
            const currentUrl = page.url();

            // If we're on a messaging page, consider it successful
            if (currentUrl.includes('linkedin.com/messaging/')) {
              log.debug('Navigation timed out but page loaded', { currentUrl });
              navigationSucceeded = true;
            } else if (retryCount < maxRetries) {
              // Reset to feed and retry
              log.info('Resetting to feed before retry', { retryCount: retryCount + 1 });
              await this.resetToFeed(page);
              retryCount++;
            } else {
              throw new Error('LinkedIn may be rate limiting requests. Please wait a few minutes and try again.');
            }
          } else {
            throw navError;
          }
        }
      }

      // Wait 4 seconds for page to fully load (good fiber connection)
      await this.wait(4000);

      // Wait for message input
      await page.waitForSelector('.msg-form__contenteditable', { timeout: 10000 });

      // Type the message
      await page.click('.msg-form__contenteditable');
      await page.type('.msg-form__contenteditable', request.message, { delay: 50 });

      // Wait a bit for the send button to become enabled
      await this.wait(500);

      // Click send button - try multiple selectors
      let buttonClicked = false;

      // Try selector 1: Class-based selector
      try {
        const sendButton = await page.$('.msg-form__send-button');
        if (sendButton) {
          await sendButton.click();
          buttonClicked = true;
          log.debug('Clicked send button', { method: 'class selector' });
        }
      } catch (error) {
        log.debug('Class selector failed, trying alternative');
      }

      // Try selector 2: Text-based selector
      if (!buttonClicked) {
        try {
          await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const sendBtn = buttons.find(btn =>
              btn.textContent?.trim() === 'Envoyer' ||
              btn.textContent?.trim() === 'Send'
            );
            if (sendBtn) {
              (sendBtn as HTMLElement).click();
            }
          });
          buttonClicked = true;
          log.debug('Clicked send button', { method: 'text selector' });
        } catch (error) {
          log.debug('Text selector failed, trying final method');
        }
      }

      // Try selector 3: Form submit
      if (!buttonClicked) {
        try {
          await page.evaluate(() => {
            const form = document.querySelector('.msg-form') as HTMLFormElement;
            if (form) {
              // Find the send button within the form
              const sendButton = form.querySelector('button[type="submit"]') as HTMLButtonElement;
              if (sendButton && !sendButton.disabled) {
                sendButton.click();
              } else {
                // Try any enabled button in the right actions area
                const rightActions = form.querySelector('.msg-form__right-actions');
                if (rightActions) {
                  const btn = rightActions.querySelector('button:not([disabled])') as HTMLButtonElement;
                  if (btn) {
                    btn.click();
                  }
                }
              }
            }
          });
          buttonClicked = true;
          log.debug('Clicked send button', { method: 'form selector' });
        } catch (error) {
          log.warn('Form selector failed');
        }
      }

      if (!buttonClicked) {
        throw new Error('Could not find or click send button');
      }

      await this.wait(2000);

      log.info('Message sent successfully', { conversationUrl: request.conversationUrl });

      // Update cache with the new message if profileUrl is provided
      if (request.profileUrl) {
        try {
          log.debug('Updating cache with sent message', { profileUrl: request.profileUrl });

          // Get existing cached messages
          const cachedMessages = await this.cacheService.getConversation(request.profileUrl) || [];

          // Create the new message object
          const now = new Date();
          const months = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
            'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
          const day = now.getDate();
          const month = months[now.getMonth()];
          const hours = now.getHours().toString().padStart(2, '0');
          const minutes = now.getMinutes().toString().padStart(2, '0');
          const timestamp = `${day} ${month} ${hours}:${minutes}`;

          const newMessage = {
            sender: 'You', // Sent by the current user
            message: request.message,
            timestamp
          };

          // Append the new message to the cache
          const updatedMessages = [...cachedMessages, newMessage];
          await this.cacheService.cacheConversation(request.profileUrl, updatedMessages);

          log.info('Cache updated with sent message', {
            profileUrl: request.profileUrl,
            messageCount: updatedMessages.length
          });
        } catch (cacheError: any) {
          // Don't fail the whole operation if cache update fails
          log.warn('Failed to update cache after sending message', {
            error: cacheError.message,
            profileUrl: request.profileUrl
          });
        }
      } else {
        log.debug('No profileUrl provided, skipping cache update');
      }

      // Switch back to monitoring page
      await this.switchToMonitoringPage(sessionId);

      return { success: true, message: 'Message sent successfully' };
    } catch (error: any) {
      log.error('Failed to send message', error);
      // Switch back to monitoring page even on error
      await this.switchToMonitoringPage(sessionId);
      throw new Error(`Failed to send message: ${error.message}`);
    }
  }

  async visitProfile(sessionId: string, profileUrl: string) {
    const session = SessionManager.getSession(sessionId);
    if (!session || !session.isAuthenticated) {
      throw new Error('Not authenticated');
    }

    const { page } = session;

    try {
      // Switch to operation page
      await this.switchToOperationPage(sessionId);

      log.info('Visiting profile', { profileUrl });

      // Navigate to profile with domcontentloaded (faster)
      await page.goto(profileUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 10000, // Reduced from 60s to 10s
      });

      // Wait for main content - use Promise.race for faster fallback
      await Promise.race([
        page.waitForSelector('.scaffold-layout__main', { timeout: 4000 }),
        page.waitForSelector('main', { timeout: 4000 }),
        page.waitForSelector('h1', { timeout: 4000 }),
      ]).catch(() => {
        log.debug('Main content selector timeout, continuing');
      });

      // Scroll down to simulate viewing - use requestAnimationFrame for natural scrolling
      await page.evaluate(() => {
        return new Promise<void>((resolve) => {
          let scrollCount = 0;
          const maxScrolls = 3;
          const scrollStep = window.innerHeight / 2;

          const scroll = () => {
            if (scrollCount >= maxScrolls) {
              resolve();
              return;
            }

            window.scrollBy({ top: scrollStep, behavior: 'smooth' });
            scrollCount++;

            // Use requestAnimationFrame for natural timing (typically 16ms per frame)
            // Wait ~300ms between scrolls (natural human behavior)
            setTimeout(() => requestAnimationFrame(scroll), 300);
          };

          scroll();
        });
      });

      log.info('Profile visited successfully', { profileUrl });

      // Switch back to monitoring page
      await this.switchToMonitoringPage(sessionId);

      return { success: true, message: 'Profile visited' };
    } catch (error: any) {
      log.error('Failed to visit profile', error, { profileUrl });
      // Switch back to monitoring page even on error
      await this.switchToMonitoringPage(sessionId);
      throw new Error(`Failed to visit profile: ${error.message}`);
    }
  }

  async sendConnectionRequest(sessionId: string, profileUrl: string, message?: string) {
    const session = SessionManager.getSession(sessionId);
    if (!session || !session.isAuthenticated) {
      throw new Error('Not authenticated');
    }

    const { page } = session;

    try {
      // Enforce rate limiting
      await this.enforceRateLimit();

      // Switch to operation page
      await this.switchToOperationPage(sessionId);

      log.info('Sending connection request', { profileUrl });

      // Navigate to profile
      await page.goto(profileUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 10000,
      });

      // Wait for profile to load - use Promise.race for faster fallback
      await Promise.race([
        page.waitForSelector('.ph5', { timeout: 4000 }),
        page.waitForSelector('main', { timeout: 4000 }),
        page.waitForSelector('h1', { timeout: 4000 }),
        page.waitForSelector('button[aria-label*="Invitez"]', { timeout: 4000 }), // Connect button
      ]).catch(() => {
        log.debug('Profile content timeout, continuing');
      });

      // Check connection degree to determine if we can send a request
      const connectionDegree = await page.evaluate(() => {
        const degreeEl = document.querySelector('.distance-badge .dist-value');
        return degreeEl?.textContent?.trim() || '';
      });

      log.debug('Connection degree detected', { degree: connectionDegree });

      // Check if already connected (1st degree)
      if (connectionDegree === '1er' || connectionDegree === '1st') {
        log.info('Already connected to this person', { profileUrl });
        return { success: false, message: 'Already connected' };
      }

      // Detect which UI flow to use and check if connection button exists
      const connectionCheck = await page.evaluate(() => {
        // Try multiple selectors for profile header (LinkedIn changes classes frequently)
        const profileHeader = document.querySelector('section.artdeco-card > div.ph5') ||
          document.querySelector('section.artdeco-card > div.ph5.pb5') ||
          document.querySelector('div.ph5');

        if (!profileHeader) {
          return { uiType: 'unknown', hasConnectButton: false };
        }

        // Check for direct "Se connecter" button in the action bar
        const directConnectButton = profileHeader.querySelector(
          'div.fkPRblCvkHKJfCAECsQUDHyUlbzCBcJti > div > button'
        ) as HTMLButtonElement;

        if (directConnectButton) {
          const buttonText = directConnectButton.textContent?.trim() || '';
          if (buttonText.includes('Se connecter') || buttonText.includes('Connect')) {
            return { uiType: 'direct', hasConnectButton: true };
          }
        }

        // Check for "More" dropdown button
        const moreButton = profileHeader.querySelector(
          'div.fkPRblCvkHKJfCAECsQUDHyUlbzCBcJti > div > div.artdeco-dropdown > button'
        ) as HTMLButtonElement;

        if (moreButton) {
          return { uiType: 'dropdown', hasConnectButton: true };
        }

        // Fallback: try to find any connect button
        const fallbackButton = document.querySelector('button[aria-label*="Invitez"]') ||
          Array.from(document.querySelectorAll('button.artdeco-button--primary')).find(btn => {
            const text = btn.textContent?.trim() || '';
            return text.includes('Se connecter') || text.includes('Connect');
          });

        if (fallbackButton) {
          return { uiType: 'regular', hasConnectButton: true };
        }

        return { uiType: 'none', hasConnectButton: false };
      });

      log.debug('Connection check result', connectionCheck);

      // If no connect button found, assume already sent or connected
      if (!connectionCheck.hasConnectButton || connectionCheck.uiType === 'none') {
        log.info('No connect button found - connection request likely already sent', { profileUrl });
        return { success: false, message: 'Connection request already sent or not available' };
      }

      let buttonClicked = false;

      if (connectionCheck.uiType === 'direct') {
        // Direct "Se connecter" button flow
        log.debug('Using direct connect button flow');

        buttonClicked = await page.evaluate(() => {
          const profileHeader = document.querySelector('section.artdeco-card > div.ph5') ||
            document.querySelector('section.artdeco-card > div.ph5.pb5') ||
            document.querySelector('div.ph5');

          if (!profileHeader) return false;

          const directConnectButton = profileHeader.querySelector(
            'div.fkPRblCvkHKJfCAECsQUDHyUlbzCBcJti > div > button'
          ) as HTMLButtonElement;

          if (directConnectButton) {
            const buttonText = directConnectButton.textContent?.trim() || '';
            if (buttonText.includes('Se connecter') || buttonText.includes('Connect')) {
              directConnectButton.click();
              return true;
            }
          }

          return false;
        });

        if (!buttonClicked) {
          log.warn('Direct connect button not found or not clickable');
          return { success: false, message: 'Connect button not found' };
        }

        log.debug('Clicked direct connect button');

      } else if (connectionCheck.uiType === 'dropdown') {
        // Dropdown flow: Click "More" button, then find "Se connecter" in dropdown
        log.debug('Using dropdown flow');

        // Click the "More" dropdown button
        const moreButtonClicked = await page.evaluate(() => {
          const profileHeader = document.querySelector('section.artdeco-card > div.ph5') ||
            document.querySelector('section.artdeco-card > div.ph5.pb5') ||
            document.querySelector('div.ph5');

          if (!profileHeader) return false;

          const moreButton = profileHeader.querySelector(
            'div.fkPRblCvkHKJfCAECsQUDHyUlbzCBcJti > div > div.artdeco-dropdown > button'
          ) as HTMLButtonElement;

          if (moreButton) {
            moreButton.click();
            return true;
          }
          return false;
        });

        if (!moreButtonClicked) {
          log.warn('More button not found');
          return { success: false, message: 'More button not found' };
        }

        log.debug('Clicked More button, waiting for dropdown');
        await this.wait(500);

        // Click "Se connecter" in the dropdown menu
        buttonClicked = await page.evaluate(() => {
          const profileHeader = document.querySelector('section.artdeco-card > div.ph5') ||
            document.querySelector('section.artdeco-card > div.ph5.pb5') ||
            document.querySelector('div.ph5');

          if (!profileHeader) return false;

          const dropdownMenu = profileHeader.querySelector(
            'div.fkPRblCvkHKJfCAECsQUDHyUlbzCBcJti > div > div.artdeco-dropdown > div > div > ul'
          );

          if (!dropdownMenu) return false;

          const menuItems = dropdownMenu.querySelectorAll('li > div');

          for (const item of Array.from(menuItems)) {
            const text = item.textContent?.trim() || '';
            if (text.includes('Se connecter') || text.includes('Connect')) {
              (item as HTMLElement).click();
              return true;
            }
          }
          return false;
        });

        if (!buttonClicked) {
          log.warn('Connect option not found in dropdown');
          return { success: false, message: 'Connect option not found in dropdown' };
        }

        log.debug('Clicked connect option from dropdown');

      } else if (connectionCheck.uiType === 'regular') {
        // Fallback regular flow: Try to find any connect button
        log.debug('Using fallback regular profile flow');

        buttonClicked = await page.evaluate(() => {
          // Try aria-label selector first
          let connectButton = document.querySelector(
            'button[aria-label*="Invitez"]'
          ) as HTMLButtonElement;

          if (!connectButton) {
            // Try finding by button text content
            const buttons = Array.from(document.querySelectorAll('button.artdeco-button--primary'));
            connectButton = buttons.find(btn => {
              const text = btn.textContent?.trim() || '';
              return text.includes('Se connecter') || text.includes('Connect');
            }) as HTMLButtonElement;
          }

          if (connectButton) {
            connectButton.click();
            return true;
          }

          return false;
        });

        if (!buttonClicked) {
          log.warn('Connect button not found in fallback flow');
          return { success: false, message: 'Connect button not found' };
        }

        log.debug('Clicked connect button (fallback flow)');

      } else {
        log.error('Unknown UI type detected');
        return { success: false, message: 'Could not find connect button (unknown UI type)' };
      }

      // Wait for modal to appear
      await this.wait(500);

      // Check if there's an "Ajouter une note" button in the modal
      const hasAddNoteButton = await page.evaluate(DOMFunctions.checkAddNoteButton);

      if (hasAddNoteButton && message) {
        log.debug('Add note button found');

        // Click "Ajouter une note" button
        const noteButtonClicked = await page.evaluate(DOMFunctions.clickAddNoteButton);

        if (noteButtonClicked) {
          log.debug('Clicked add note button');

          // Wait for textarea to appear
          await this.wait(300);

          // Type the message in the textarea
          log.debug('Adding custom message');

          await page.evaluate(DOMFunctions.typeNoteMessage, message);

          await this.wait(200);
          log.debug('Message added to connection request');
        }
      }

      // Click the "Envoyer une invitation" button
      await this.wait(200);

      const sendClicked = await page.evaluate(DOMFunctions.clickSendInvitation);

      if (!sendClicked) {
        log.warn('Send button not found or disabled');
        return { success: false, message: 'Send button not found or disabled' };
      }

      log.info('Connection request sent successfully', { profileUrl });

      // Wait briefly for confirmation
      await this.wait(300);

      // Switch back to monitoring page
      await this.switchToMonitoringPage(sessionId);

      return { success: true, message: 'Connection request sent' };
    } catch (error: any) {
      log.error('Failed to send connection request', error, { profileUrl });
      // Switch back to monitoring page even on error
      await this.switchToMonitoringPage(sessionId);
      throw new Error(`Failed to send connection request: ${error.message}`);
    }
  }

  async getProfileViews(sessionId: string) {
    const session = SessionManager.getSession(sessionId);
    if (!session || !session.isAuthenticated) {
      throw new Error('Not authenticated');
    }

    const { page } = session;

    try {
      // Switch to operation page
      await this.switchToOperationPage(sessionId);

      log.info('Fetching profile views', { sessionId });

      // Navigate to own profile
      await page.goto('https://www.linkedin.com/me/', {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // Wait for profile data
      await page.waitForSelector('.text-heading-xlarge', { timeout: 10000 });

      const profileData = await page.evaluate(DOMFunctions.extractProfileViews);

      log.info('Profile views retrieved', { profileName: profileData.name });

      // Switch back to monitoring page
      await this.switchToMonitoringPage(sessionId);

      return {
        success: true,
        data: {
          profile: profileData
        }
      };
    } catch (error: any) {
      log.error('Failed to get profile views', error);
      // Switch back to monitoring page even on error
      await this.switchToMonitoringPage(sessionId);
      throw new Error(`Failed to get profile views: ${error.message}`);
    }
  }

  async searchPeople(sessionId: string, keywords: string, limit: number = 50) {
    const session = SessionManager.getSession(sessionId);
    if (!session || !session.isAuthenticated) {
      throw new Error('Not authenticated');
    }

    const { page } = session;

    try {
      log.info('Searching for people', { keywords, limit });

      // Navigate to search
      const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords)}`;
      await page.goto(searchUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // Wait for results
      await page.waitForSelector('.search-results-container', { timeout: 10000 });

      // Extract profiles
      const profiles = await page.evaluate((maxResults) => {
        const resultItems = document.querySelectorAll('.reusable-search__result-container');
        const results: any[] = [];

        resultItems.forEach((item, index) => {
          if (index >= maxResults) return;

          const nameEl = item.querySelector('.entity-result__title-text a span[aria-hidden="true"]');
          const titleEl = item.querySelector('.entity-result__primary-subtitle');
          const locationEl = item.querySelector('.entity-result__secondary-subtitle');
          const linkEl = item.querySelector('.entity-result__title-text a');

          if (nameEl && linkEl) {
            results.push({
              name: nameEl.textContent?.trim() || '',
              title: titleEl?.textContent?.trim() || '',
              location: locationEl?.textContent?.trim() || '',
              url: linkEl.getAttribute('href')?.split('?')[0] || '',
            });
          }
        });

        return results;
      }, limit);

      log.info('Search completed', { profileCount: profiles.length });
      return { success: true, data: profiles };
    } catch (error: any) {
      log.error('Search failed', error, { keywords });
      throw new Error(`Search failed: ${error.message}`);
    }
  }

  async getConversationUrlFromProfile(sessionId: string, profileUrl: string) {
    const session = SessionManager.getSession(sessionId);
    if (!session || !session.isAuthenticated) {
      throw new Error('Not authenticated');
    }

    const { page } = session;

    try {
      // Enforce rate limiting
      await this.enforceRateLimit();

      log.info('Getting conversation URL', { profileUrl });

      // Navigate to profile with error handling for rate limiting
      let navigationSucceeded = false;
      let retryCount = 0;
      const maxRetries = 1;

      while (!navigationSucceeded && retryCount <= maxRetries) {
        try {
          await page.goto(profileUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 10000,
          });
          navigationSucceeded = true;
        } catch (navError: any) {
          // If navigation times out, check if we're being rate limited
          if (navError.message.includes('Navigation timeout')) {
            log.warn('Navigation timeout - possible rate limiting', { profileUrl, retryCount });

            // Wait and check current URL
            await this.wait(3000);
            const currentUrl = page.url();

            // If we're on the profile page, consider it successful
            if (currentUrl.includes('linkedin.com/in/')) {
              log.debug('Navigation timed out but page loaded', { currentUrl });
              navigationSucceeded = true;
            } else if (retryCount < maxRetries) {
              // Reset to feed and retry
              log.info('Resetting to feed before retry', { retryCount: retryCount + 1 });
              await this.resetToFeed(page);
              retryCount++;
            } else {
              throw new Error('LinkedIn may be rate limiting requests. Please wait a few minutes and try again.');
            }
          } else {
            throw navError;
          }
        }
      }

      // Log current URL to verify navigation
      const currentUrl = page.url();
      log.debug('Navigation completed', { currentUrl });

      // Wait for profile to load
      await Promise.race([
        page.waitForSelector('.ph5', { timeout: 4000 }),
        page.waitForSelector('main', { timeout: 4000 }),
        page.waitForSelector('h1', { timeout: 4000 }),
      ]).catch(() => {
        log.debug('Profile content timeout, continuing');
      });

      // Wait for action buttons to be present (Message, Connect, or Pending buttons)
      await Promise.race([
        page.waitForSelector('button[aria-label*="message"]', { timeout: 4000 }),
        page.waitForSelector('button[aria-label*="Message"]', { timeout: 4000 }),
        page.waitForSelector('button[aria-label*="attente"]', { timeout: 4000 }),
        page.waitForSelector('button[aria-label*="Invitez"]', { timeout: 4000 }),
        page.waitForSelector('.fkPRblCvkHKJfCAECsQUDHyUlbzCBcJti button', { timeout: 4000 }),
      ]).catch(() => {
        log.debug('Action buttons timeout, continuing');
      });

      // Additional wait for page to stabilize
      await this.wait(2000);

      // Check connection status
      const connectionStatus = await page.evaluate(DOMFunctions.checkConnectionStatus);
      log.debug('Connection status checked', { status: connectionStatus.status });

      // Check if we hit a login page/modal
      if (connectionStatus.status === 'not_authenticated') {
        log.error('Session expired or login required', { currentUrl });

        // Mark session as not authenticated
        SessionManager.updateSession(sessionId, {
          isAuthenticated: false,
        });

        throw new Error('Session expired. Please login again.');
      }

      // If pending, check if Message button is available (Premium users can message pending connections)
      if (connectionStatus.status === 'pending') {
        log.info('Connection request is pending - checking if messaging is available', { profileUrl });

        // Check if Message button exists (Premium feature)
        const hasMessageButton = await page.evaluate(() => {
          const messageButton = Array.from(document.querySelectorAll('button')).find(btn => {
            const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
            const text = btn.textContent?.toLowerCase() || '';
            return ariaLabel.includes('message') || ariaLabel.includes('envoyer un message') ||
              text.includes('message');
          });
          return !!messageButton;
        });

        if (!hasMessageButton) {
          log.warn('Connection pending and no message button found', { profileUrl });
          throw new Error('Connection request is pending. Wait for acceptance or upgrade to Premium to message.');
        }

        log.info('Message button available despite pending connection (Premium)', { profileUrl });
        // Continue to get conversation URL
      } else if (!connectionStatus.connected) {
        throw new Error('User is not connected. Please send a connection request first.');
      }

      // Extract profile name
      const profileName = await page.evaluate(DOMFunctions.extractProfileName);
      log.debug('Profile name extracted', { profileName });

      if (!profileName) {
        throw new Error('Could not extract profile name');
      }

      // Split name into first and last name
      const nameParts = profileName.split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || nameParts[0]; // If only one name, use it as both

      log.debug('Searching for conversation', { firstName, lastName });

      // Navigate to messaging
      log.debug('Navigating to messaging');
      await page.goto('https://www.linkedin.com/messaging/', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      // Wait for conversations list to load
      await page.waitForSelector('.msg-conversations-container__conversations-list', { timeout: 10000 });
      await this.wait(2000);

      // Find and click on the conversation by matching name
      log.debug('Searching for conversation in list');
      const result = await page.evaluate(DOMFunctions.findAndClickConversationByName, firstName, lastName);

      if (!result.success) {
        throw new Error(`No conversation found for ${profileName}. Make sure you have messaged this person before.`);
      }

      log.debug('Found and clicked conversation', { name: result.name });

      // Wait for URL to change
      await this.wait(1000);

      // Get the conversation URL
      const conversationUrl = page.url();
      log.info('Conversation URL retrieved', { conversationUrl });

      return {
        success: true,
        data: {
          profileName,
          conversationUrl
        }
      };
    } catch (error: any) {
      log.error('Failed to get conversation URL', error, { profileUrl });
      throw new Error(`Failed to get conversation URL: ${error.message}`);
    }
  }
}

export default new LinkedInService();
