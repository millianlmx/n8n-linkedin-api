import puppeteer, { Browser, Page } from 'puppeteer';
import SessionManager from './SessionManager';
import { CacheService } from './CacheService';
import CaptchaService from './CaptchaService';
import BrowserStateService from './BrowserStateService';
import { SendMessageRequest, LoginRequest, ProfileScrapeRequest } from '../types';
import * as DOMFunctions from '../utils/linkedin-dom-functions';

import { existsSync } from 'fs';

/**
 * LinkedIn Service
 * Handles all LinkedIn automation operations including authentication,
 * profile scraping, connections, and messaging.
 */
class LinkedInService {
  private cacheService: CacheService;

  constructor() {
    this.cacheService = new CacheService();
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
      console.log('🔄 Switching to operation tab...');
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
      console.log('🔄 Switching back to monitoring tab...');
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
    console.log('🚀 Initializing browser...');
    
    const executablePath = this.findChrome();
    if (executablePath) {
      console.log(`📍 Using Chrome at: ${executablePath}`);
    } else {
      console.log('📍 Using bundled Chromium');
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
        if (type === 'log') console.log(`[Browser] ${text}`);
      });
      
      // Set user agent to match real browser
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );
      
      // Try to restore browser state if user identifier is provided
      if (userIdentifier) {
        const hasState = await BrowserStateService.hasBrowserState(userIdentifier);
        if (hasState) {
          console.log('🔄 Restoring saved browser state...');
          const restored = await BrowserStateService.restoreBrowserState(userIdentifier, page);
          
          if (restored) {
            // Verify if the session is still valid
            const isValid = await BrowserStateService.verifySession(page);
            
            if (isValid) {
              console.log('✅ Browser state restored and session is valid');
              console.log('✅ Skipping login - using saved session\n');
              
              // Return with sessionRestored flag and isAuthenticated flag
              // The caller should set isAuthenticated on the session after creating it
              return { browser, page, sessionRestored: true, isAuthenticated: true };
            } else {
              console.log('⚠️  Saved session expired, will need to login again');
              // Delete expired state
              await BrowserStateService.deleteBrowserState(userIdentifier);
            }
          }
        }
      }
      
      console.log('✅ Browser initialized successfully\n');
      return { browser, page, sessionRestored: false };
    } catch (error: any) {
      console.error('❌ Failed to initialize browser:', error.message);
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
      console.log('🔐 Logging in to LinkedIn...');
      
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
      console.log(`📍 Current URL after login: ${currentUrl}`);

      // Only check for CAPTCHA if we're on the challenge page
      if (currentUrl.includes('/checkpoint/challenge')) {
        console.log('🔒 LinkedIn challenge page detected!');
        
        // Check for CAPTCHA challenge
        const hasCaptcha = await CaptchaService.detectRecaptcha(page);
        if (hasCaptcha) {
          console.log('🔒 reCAPTCHA challenge detected!');
          
          if (CaptchaService.isAvailable()) {
            console.log('🤖 Attempting to solve CAPTCHA automatically...');
            const solved = await CaptchaService.handleRecaptchaChallenge(page);
            
            if (solved) {
              console.log('✅ CAPTCHA solved! Waiting for page to process...');
              // Wait for navigation after CAPTCHA is solved
              await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {
                console.log('   Navigation timeout - checking current URL...');
              });
              await this.wait(2000);
              currentUrl = page.url();
              console.log(`📍 URL after CAPTCHA solve: ${currentUrl}`);
            } else {
              console.warn('⚠️  Failed to solve CAPTCHA automatically');
              throw new Error('CAPTCHA challenge detected but could not be solved automatically. Please solve it manually or check your 2Captcha API key.');
            }
          } else {
            throw new Error('CAPTCHA challenge detected but 2Captcha service is not configured. Please set CAPTCHA_API_KEY in your .env file or solve it manually.');
          }
        } else {
          console.log('⚠️  Challenge page detected but no reCAPTCHA found - may need manual intervention');
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

        console.log('✅ Login successful');
        
        // Save browser state (cookies, localStorage, sessionStorage)
        try {
          const userIdentifier = credentials.email || process.env.LINKEDIN_EMAIL || sessionId;
          await BrowserStateService.saveBrowserState(userIdentifier, page);
          console.log('✅ Browser state saved for future sessions');
        } catch (saveError: any) {
          console.warn(`⚠️  Failed to save browser state: ${saveError.message}`);
        }
        
        // Automatically start message monitoring in a separate tab
        console.log('🚀 Starting automatic message monitoring...');
        try {
          await this.startMessageMonitoring(sessionId);
          console.log('✅ Message monitoring started automatically\n');
        } catch (monitoringError: any) {
          console.warn(`⚠️  Failed to start automatic monitoring: ${monitoringError.message}`);
          console.log('   You can start it manually later\n');
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
        console.warn(`⚠️  Unknown post-login URL: ${currentUrl}`);
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
      console.error('❌ Login failed:', error.message);
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
      console.log('📬 Starting message monitoring...');

      // Create a new page for monitoring
      const monitoringPage = await session.browser.newPage();
      
      // Forward console logs from browser to Node.js (excluding errors to reduce noise)
      monitoringPage.on('console', (msg) => {
        const type = msg.type();
        const text = msg.text();
        if (type === 'log') console.log(`[Browser] ${text}`);
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
        };
      });

      // Navigate to messaging page (faster loading)
      await monitoringPage.goto('https://www.linkedin.com/messaging/', {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });
      console.log('✅ Monitoring page loaded');

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
          console.log('📨 Processing new message notification...');
          
          // Get unread conversations
          const conversations = await monitoringPage.evaluate(() => {
            return (window as any).processUnreadConversations();
          });

          if (conversations.length > 0) {
            console.log(`📨 Found ${conversations.length} unread conversation(s)`);
            
            // Process each unread conversation
            for (const conv of conversations) {
              try {
                console.log(`  📍 Processing: ${conv.name}`);
                
                // Click on the conversation to open it
                await monitoringPage.evaluate((elementId) => {
                  return (window as any).MessagingDOMFunctions.clickConversation(elementId);
                }, conv.elementId);
                
                // Wait for the conversation to load
                await this.wait(2000);
                
                // Get the current URL which should now be the conversation URL
                const currentUrl = monitoringPage.url();
                console.log(`  📍 Conversation URL: ${currentUrl}`);
                
                // Extract shortened profile URL from the thread detail section
                const shortenedProfileUrl = await monitoringPage.evaluate(() => {
                  return (window as any).MessagingDOMFunctions.extractProfileUrl();
                });
                
                if (!shortenedProfileUrl) {
                  console.log(`  ⚠️  Could not extract profile URL for: ${conv.name}`);
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
                  console.log(`  📍 Profile URL: ${cleanProfileUrl}`);
                  
                  // Close the profile page
                  await profilePage.close();
                } catch (error: any) {
                  console.error(`  ❌ Failed to resolve profile URL: ${error.message}`);
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
                  console.log(`  ✅ Added ${uniqueNewMessages.length} new message(s) for ${conv.name}`);
                } else {
                  // No existing cache, use all messages
                  updatedMessages = newMessages;
                  console.log(`  ✅ Cached ${newMessages.length} message(s) for ${conv.name}`);
                }
                
                // Update cache with merged messages
                await this.cacheService.cacheConversation(cleanProfileUrl, updatedMessages);
                
              } catch (error: any) {
                console.error(`  ❌ Failed to process conversation ${conv.name}: ${error.message}`);
              }
            }
            
            // After processing all conversations, navigate back to messaging list
            console.log('🔄 Returning to messaging list...');
            await monitoringPage.goto('https://www.linkedin.com/messaging/', {
              waitUntil: 'domcontentloaded',
              timeout: 15000,
            });
            
            // Wait for page to stabilize
            await this.wait(2000);
            
            // Re-setup the observer
            const reObserverSetup = await setupObserver();
            if (reObserverSetup.success) {
              console.log(`✅ Observer re-established on: ${reObserverSetup.selector}`);
            } else {
              console.error('⚠️  Failed to re-establish observer');
            }
            
            // Re-setup event listener (critical - gets lost on navigation)
            await monitoringPage.evaluate(() => {
              (window as any).MessagingDOMFunctions.reSetupMessageEventListener();
            });
          }
        } catch (error: any) {
          console.error('❌ Message processing error:', error.message);
        } finally {
          isProcessing = false;
        }
      });

      // Set up initial MutationObserver
      const observerSetup = await setupObserver();

      if (observerSetup.success) {
        console.log(`✅ MutationObserver set up on: ${observerSetup.selector}`);
      } else {
        console.error('❌ Could not find conversation list element');
        throw new Error('Conversation list element not found');
      }

      // Set up event listener in the page to call our exposed function
      await monitoringPage.evaluate(() => {
        (window as any).MessagingDOMFunctions.setupMessageEventListener();
      });

      // Set up periodic refresh (every 15 minutes) as backup
      const monitoringInterval = setInterval(async () => {
        try {
          console.log('🔄 Periodic refresh (backup check)...');
          
          if (monitoringPage.isClosed()) {
            console.log('⚠️  Monitoring page closed, stopping monitoring');
            clearInterval(monitoringInterval);
            return;
          }

          // Reload the messaging page to ensure observer is still working
          await monitoringPage.reload({ waitUntil: 'domcontentloaded' });
          await this.wait(2000);

          // Re-setup the observer after reload
          await monitoringPage.evaluate(() => {
            let conversationList = document.querySelector('#main > div > div.scaffold-layout__list-detail-inner.scaffold-layout__list-detail-inner--grow > div.scaffold-layout__list.msg__list > div.relative.display-flex.justify-center.flex-column.overflow-hidden.msg-conversations-container--inbox-shortcuts > ul');
            
            if (!conversationList) {
              conversationList = document.querySelector('.msg-conversations-container__conversations-list') ||
                               document.querySelector('ul[class*="msg-conversations"]') ||
                               document.querySelector('.scaffold-layout__list ul');
            }
            
            if (conversationList && !(window as any).messageObserver) {
              console.log('✅ Re-establishing observer after reload, found:', conversationList.className);
              
              const observer = new MutationObserver((mutations) => {
                console.log(`🔍 MutationObserver triggered (${mutations.length} mutations)`);
                let hasUnreadChanges = false;
                
                for (const mutation of mutations) {
                  console.log(`  Mutation type: ${mutation.type}, target:`, mutation.target);
                  
                  if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                      if (node.nodeType === Node.ELEMENT_NODE) {
                        const element = node as HTMLElement;
                        if (element.querySelector?.('.msg-conversation-card__unread-count') ||
                            element.classList?.contains('msg-conversation-listitem')) {
                          console.log('  ✅ Found unread badge or new conversation item');
                          hasUnreadChanges = true;
                        }
                      }
                    });
                  } else if (mutation.type === 'attributes') {
                    const target = mutation.target as HTMLElement;
                    if (target.classList?.contains('msg-conversation-card__unread-count') ||
                        target.querySelector?.('.msg-conversation-card__unread-count')) {
                      console.log('  ✅ Unread badge attribute changed');
                      hasUnreadChanges = true;
                    }
                  }
                  
                  if (hasUnreadChanges) break;
                }

                if (hasUnreadChanges) {
                  console.log('🔔 New message detected by observer - triggering event');
                  window.dispatchEvent(new CustomEvent('linkedin-new-message'));
                }
              });

              observer.observe(conversationList, {
                childList: true,
                subtree: true,
                attributes: true,
                characterData: true
              });

              console.log('👁️  Observer re-established successfully');
              (window as any).messageObserver = observer;
            } else if (!conversationList) {
              console.error('❌ Could not find conversation list element after reload');
            }
          });

          console.log('✓ Observer refreshed');
        } catch (error: any) {
          console.error('❌ Monitoring refresh error:', error.message);
        }
      }, 15 * 60 * 1000); // 15 minutes

      // Store interval in session
      SessionManager.updateSession(sessionId, {
        monitoringInterval,
      });

      console.log('✅ Message monitoring started (refresh every 15 minutes)\n');
      return { success: true, message: 'Message monitoring started' };
    } catch (error: any) {
      console.error('❌ Failed to start monitoring:', error.message);
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
      console.log('🛑 Stopping message monitoring...');

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

      console.log('✅ Message monitoring stopped\n');
      return { success: true, message: 'Message monitoring stopped' };
    } catch (error: any) {
      console.error('❌ Failed to stop monitoring:', error.message);
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
        console.log(`    📍 Extracted profile URL: ${profileUrl}`);
      }

      return profileUrl;
    } catch (error: any) {
      console.error(`    ❌ Failed to extract profile URL: ${error.message}`);
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
    const session = SessionManager.getSession(sessionId);
    if (!session || !session.isAuthenticated) {
      throw new Error('Not authenticated');
    }

    const cachedProfile = await this.cacheService.getProfile(request.url);
    if (cachedProfile) {
      console.log(`✅ Returning cached profile for: ${request.url}`);
      return { success: true, data: cachedProfile };
    }

    const { page } = session;

    try {
      // Switch to operation page
      await this.switchToOperationPage(sessionId);

      console.log(`📖 Scraping profile: ${request.url}`);
      
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
        console.log('⚠️  Main content selector timeout, continuing...');
      });

      // Wait for content to render after scrolling
      await this.wait(1000);
      
      console.log('✅ Page content loaded');

      // Extract profile data using extracted DOM function
      const profileData = await page.evaluate(DOMFunctions.extractProfileData);

      console.log(`✅ Profile scraped: ${profileData.name}\n`);

      // Save to cache
      await this.cacheService.cacheProfile(request.url, profileData);

      // Switch back to monitoring page
      await this.switchToMonitoringPage(sessionId);

      return { success: true, data: profileData };
    } catch (error: any) {
      console.error('❌ Profile scraping failed:', error.message);
      // Switch back to monitoring page even on error
      await this.switchToMonitoringPage(sessionId);
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
      console.log('📬 Fetching conversations...');
      
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

      console.log(`📋 Found ${conversationsData.length} conversations, extracting URLs for first 25...\n`);

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

          console.log(`  ${i + 1}/${maxConversations}: ${conversationsData[i].name} -> ${currentUrl}`);
        } catch (error) {
          console.error(`  ⚠️  Failed to get URL for conversation ${i + 1}:`, error);
          // Add without URL
          conversations.push(conversationsData[i]);
        }
      }

      // Add remaining conversations without URLs (if more than 25)
      if (conversationsData.length > 25) {
        for (let i = 25; i < conversationsData.length; i++) {
          conversations.push(conversationsData[i]);
        }
        console.log(`\n  ℹ️  Added ${conversationsData.length - 25} more conversations without URLs`);
      }

      console.log(`\n✅ Extracted ${conversations.length} conversations (${maxConversations} with URLs)\n`);
      return { success: true, data: conversations };
    } catch (error: any) {
      console.error('❌ Failed to list conversations:', error.message);
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
      console.log('📬 Getting unread messages...');
      
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

      console.log(`📬 Found ${unreadConversations.length} unread conversations\n`);

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

          console.log(`  ${i + 1}/${unreadConversations.length}: ${conv.name} (${conv.unreadCount} unread) -> ${currentUrl}`);
        } catch (error) {
          console.error(`  ⚠️  Failed to get URL for unread conversation ${i + 1}:`, error);
          unreadWithUrls.push(unreadConversations[i]);
        }
      }

      console.log(`\n✅ Retrieved ${unreadWithUrls.length} unread conversations\n`);
      return { success: true, data: unreadWithUrls };
    } catch (error: any) {
      console.error('❌ Failed to get unread messages:', error.message);
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
      console.log(`🔍 Checking cache for conversation with profile: ${profileUrl}`);
      const cachedConversation = await this.cacheService.getConversation(profileUrl);
      
      if (cachedConversation) {
        console.log(`✅ Cache hit! Returning cached conversation\n`);
        return { success: true, data: cachedConversation, cached: true, cacheUpdated: false };
      }
      
      console.log(`❌ Cache miss. Fetching conversation from LinkedIn...\n`);
    } else if (forceRefresh && profileUrl) {
      console.log(`🔄 Force refresh enabled. Fetching from LinkedIn to check for updates...\n`);
    }

    const { page } = session;

    try {
      // Switch to operation page
      await this.switchToOperationPage(sessionId);

      console.log(`📖 Reading conversation: ${conversationUrl}`);
      
      // Navigate to the conversation (conversationUrl is always a full URL)
      await page.goto(conversationUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // Wait for messages
      await page.waitForSelector('.msg-s-message-list', { timeout: 10000 });

      // Extract messages
      const messages = await page.evaluate(DOMFunctions.extractConversationMessages);

      console.log(`✅ Successfully read conversation with ${messages.length} messages\n`);
      
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
              console.log(`💾 Cache updated - new messages detected (${messages.length} messages)\n`);
            } else {
              console.log(`💾 Cache created with fresh data (${messages.length} messages)\n`);
            }
          } else {
            console.log(`✓ No changes detected - cache not updated (${messages.length} messages)\n`);
          }
        } else {
          // Normal cache miss - always cache
          await this.cacheService.cacheConversation(profileUrl, messages);
          cacheUpdated = true;
          console.log(`💾 Conversation cached for future requests (${messages.length} messages)\n`);
        }
      }
      
      // Switch back to monitoring page
      await this.switchToMonitoringPage(sessionId);

      return { success: true, data: messages, cached: false, cacheUpdated };
    } catch (error: any) {
      console.error('❌ Failed to read conversation:', error.message);
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
      // Switch to operation page
      await this.switchToOperationPage(sessionId);

      console.log(`💬 Sending message to: ${request.conversationUrl}`);
      
      // Navigate to the conversation
      const fullUrl = request.conversationUrl;
        
      await page.goto(fullUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

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
          console.log('  ✓ Clicked send button (class selector)');
        }
      } catch (error) {
        console.log('  ⚠️  Class selector failed, trying alternative...');
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
          console.log('  ✓ Clicked send button (text selector)');
        } catch (error) {
          console.log('  ⚠️  Text selector failed, trying final method...');
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
          console.log('  ✓ Clicked send button (form selector)');
        } catch (error) {
          console.log('  ⚠️  Form selector failed');
        }
      }

      if (!buttonClicked) {
        throw new Error('Could not find or click send button');
      }

      await this.wait(2000);

      console.log('✅ Message sent successfully\n');

      // Switch back to monitoring page
      await this.switchToMonitoringPage(sessionId);

      return { success: true, message: 'Message sent successfully' };
    } catch (error: any) {
      console.error('❌ Failed to send message:', error.message);
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

      console.log(`👀 Visiting profile: ${profileUrl}`);
      
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
        console.log('⚠️  Main content selector timeout, continuing...');
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

      console.log('✅ Profile visited\n');

      // Switch back to monitoring page
      await this.switchToMonitoringPage(sessionId);

      return { success: true, message: 'Profile visited' };
    } catch (error: any) {
      console.error('❌ Failed to visit profile:', error.message);
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
      // Switch to operation page
      await this.switchToOperationPage(sessionId);

      console.log(`🤝 Sending connection request to: ${profileUrl}`);
      
      // Navigate to profile
      await page.goto(profileUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 10000,
      });

      // Wait for profile to load - use Promise.race for faster fallback
      await Promise.race([
        page.waitForSelector('.ph5.pb5', { timeout: 4000 }),
        page.waitForSelector('main', { timeout: 4000 }),
        page.waitForSelector('h1', { timeout: 4000 }),
        page.waitForSelector('button[aria-label*="Invitez"]', { timeout: 4000 }), // Connect button
      ]).catch(() => {
        console.log('⚠️  Profile content timeout, continuing...');
      });

      // Check connection degree to determine if we can send a request
      const connectionDegree = await page.evaluate(() => {
        const degreeEl = document.querySelector('.distance-badge .dist-value');
        return degreeEl?.textContent?.trim() || '';
      });

      console.log(`  Connection degree: ${connectionDegree}`);

      // Check if already connected (1st degree)
      if (connectionDegree === '1er' || connectionDegree === '1st') {
        console.log('  ℹ️  Already connected to this person');
        return { success: false, message: 'Already connected' };
      }

      // Detect which UI flow to use (Premium vs Regular)
      const uiType = await page.evaluate(() => {
        // Check for Plus dropdown button (premium profile)
        const plusButton = document.querySelector(
            "#profile-content > div > div.scaffold-layout.scaffold-layout--breakpoint-xl.scaffold-layout--main-aside.scaffold-layout--reflow.pv-profile.pvs-loader-wrapper__shimmer--animate > div > div > main > section.artdeco-card.AGDDJEWUIGxvUeCWnjRyxxuoAIoropDXce > div.ph5.pb5 > div.dLQclXVMsTccpCHwnLzWAwBcxvhuzSNgedE > div > div.artdeco-dropdown.artdeco-dropdown--placement-bottom.artdeco-dropdown--justification-left.ember-view > button"
        ) as HTMLButtonElement;
        
        if (plusButton) {
          return 'premium';
        }

        // Check for direct connect button (regular profile)
        const directButton = document.querySelector('button[aria-label*="Invitez"]') ||
          Array.from(document.querySelectorAll('button.artdeco-button--primary')).find(btn => {
            const text = btn.textContent?.trim() || '';
            return text.includes('Se connecter') || text.includes('Connect');
          });
        
        if (directButton) {
          return 'regular';
        }
        
        return 'unknown';
      });

      console.log(`  🔍 Detected UI type: ${uiType}`);

      let buttonClicked = false;

      if (uiType === 'regular') {
        // Regular flow: Direct "Se connecter" button
        console.log('  📱 Using regular profile flow...');
        
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
          console.log('  ❌ Connect button not found');
          return { success: false, message: 'Connect button not found' };
        }

        console.log('  ✅ Clicked direct connect button');

      } else if (uiType === 'premium') {
        // Premium flow: Plus button -> dropdown -> "Se connecter"
        console.log('  💎 Using Premium profile flow...');
        
        // Click the "Plus" dropdown button
        const plusButtonClicked = await page.evaluate(() => {
          const plusButton = document.querySelector(
            "#profile-content > div > div.scaffold-layout.scaffold-layout--breakpoint-xl.scaffold-layout--main-aside.scaffold-layout--reflow.pv-profile.pvs-loader-wrapper__shimmer--animate > div > div > main > section.artdeco-card.AGDDJEWUIGxvUeCWnjRyxxuoAIoropDXce > div.ph5.pb5 > div.dLQclXVMsTccpCHwnLzWAwBcxvhuzSNgedE > div > div.artdeco-dropdown.artdeco-dropdown--placement-bottom.artdeco-dropdown--justification-left.ember-view > button"
          ) as HTMLButtonElement;
          
          if (plusButton) {
            plusButton.click();
            return true;
          }
          return false;
        });

        if (!plusButtonClicked) {
          console.log('  ❌ Plus button not found');
          return { success: false, message: 'Plus button not found' };
        }

        console.log('  ✅ Clicked Plus button, waiting for dropdown...');
        await this.wait(500);

        // Click "Se connecter" in the dropdown menu
        buttonClicked = await page.evaluate(() => {
          const dropdownItems = document.querySelectorAll('.artdeco-dropdown__content ul li');
          
          for (const item of Array.from(dropdownItems)) {
            const text = item.textContent?.trim() || '';
            if (text.includes('Se connecter') || text.includes('Connect')) {
              const clickableDiv = item.querySelector('div') as HTMLElement;
              if (clickableDiv) {
                clickableDiv.click();
                return true;
              }
            }
          }
          return false;
        });

        if (!buttonClicked) {
          console.log('  ❌ Connect option not found in dropdown');
          return { success: false, message: 'Connect option not found in dropdown' };
        }

        console.log('  ✅ Clicked "Se connecter" from dropdown');

      } else {
        console.log('  ❌ Could not detect UI type (neither regular nor premium)');
        return { success: false, message: 'Could not find connect button (unknown UI type)' };
      }

      // Wait for modal to appear
      await this.wait(500);

      // Check if there's an "Ajouter une note" button in the modal
      const hasAddNoteButton = await page.evaluate(DOMFunctions.checkAddNoteButton);

      if (hasAddNoteButton && message) {
        console.log('  📝 "Ajouter une note" button found');
        
        // Click "Ajouter une note" button
        const noteButtonClicked = await page.evaluate(DOMFunctions.clickAddNoteButton);

        if (noteButtonClicked) {
          console.log('  ✅ Clicked "Ajouter une note" button');
          
          // Wait for textarea to appear
          await this.wait(300);
          
          // Type the message in the textarea
          console.log('  📝 Adding custom message...');
          
          await page.evaluate(DOMFunctions.typeNoteMessage, message);
          
          await this.wait(200);
          console.log('  ✅ Message added');
        }
      }

      // Click the "Envoyer une invitation" button
      await this.wait(200);
      
      const sendClicked = await page.evaluate(DOMFunctions.clickSendInvitation);

      if (!sendClicked) {
        console.log('  ❌ Send button not found or disabled');
        return { success: false, message: 'Send button not found or disabled' };
      }

      console.log('  ✅ Connection request sent\n');
      
      // Wait briefly for confirmation
      await this.wait(300);

      // Switch back to monitoring page
      await this.switchToMonitoringPage(sessionId);

      return { success: true, message: 'Connection request sent' };
    } catch (error: any) {
      console.error('❌ Failed to send connection request:', error.message);
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

      console.log('👁️  Fetching profile views...');
      
      // Navigate to own profile
      await page.goto('https://www.linkedin.com/me/', {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // Wait for profile data
      await page.waitForSelector('.text-heading-xlarge', { timeout: 10000 });

      const profileData = await page.evaluate(DOMFunctions.extractProfileViews);

      console.log(`✅ Your profile: ${profileData.name}\n`);

      // Switch back to monitoring page
      await this.switchToMonitoringPage(sessionId);

      return { 
        success: true, 
        data: {
          profile: profileData
        }
      };
    } catch (error: any) {
      console.error('❌ Failed to get profile views:', error.message);
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
      console.log(`🔍 Searching for people: "${keywords}" (limit: ${limit})`);
      
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

      console.log(`✅ Found ${profiles.length} profiles\n`);
      return { success: true, data: profiles };
    } catch (error: any) {
      console.error('❌ Search failed:', error.message);
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
      console.log(`💬 Getting conversation URL for profile: ${profileUrl}`);
      
      // Navigate to profile
      await page.goto(profileUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 10000,
      });

      // Log current URL to verify navigation
      const currentUrl = page.url();
      console.log(`  📍 Current URL after navigation: ${currentUrl}`);

      // Wait for profile to load
      await Promise.race([
        page.waitForSelector('.ph5.pb5', { timeout: 4000 }),
        page.waitForSelector('main', { timeout: 4000 }),
        page.waitForSelector('h1', { timeout: 4000 }),
      ]).catch(() => {
        console.log('⚠️  Profile content timeout, continuing...');
      });

      await this.wait(1000);

      // Check connection status
      const connectionStatus = await page.evaluate(DOMFunctions.checkConnectionStatus);
      console.log(`  Connection status: ${connectionStatus.status}`);

      // Check if we hit a login page/modal
      if (connectionStatus.status === 'not_authenticated') {
        console.error('  ❌ Session expired or login required!');
        console.error('  💡 The browser is showing a login page instead of the profile.');
        console.error('  💡 Please re-authenticate by calling the login endpoint.');
        
        // Mark session as not authenticated
        SessionManager.updateSession(sessionId, {
          isAuthenticated: false,
        });
        
        throw new Error('Session expired. Please login again.');
      }

      // If pending, wait for connection to be accepted
      if (connectionStatus.status === 'pending') {
        console.log('  ⏳ Connection request is pending. Waiting for acceptance...');
        throw new Error('Connection request was not accepted');
      } else if (!connectionStatus.connected) {
        throw new Error('User is not connected. Please send a connection request first.');
      }

      // Extract profile name
      const profileName = await page.evaluate(DOMFunctions.extractProfileName);
      console.log(`  Profile name: ${profileName}`);

      if (!profileName) {
        throw new Error('Could not extract profile name');
      }

      // Split name into first and last name
      const nameParts = profileName.split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || nameParts[0]; // If only one name, use it as both

      console.log(`  Searching for: ${firstName} ${lastName}`);

      // Navigate to messaging
      console.log('  📬 Navigating to messaging...');
      await page.goto('https://www.linkedin.com/messaging/', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      // Wait for conversations list to load
      await page.waitForSelector('.msg-conversations-container__conversations-list', { timeout: 10000 });
      await this.wait(2000);

      // Find and click on the conversation by matching name
      console.log(`  🔍 Searching for conversation in list (will scroll up to 5 times if needed)...`);
      const result = await page.evaluate(DOMFunctions.findAndClickConversationByName, firstName, lastName);

      if (!result.success) {
        throw new Error(`No conversation found for ${profileName}. Make sure you have messaged this person before.`);
      }

      console.log(`  ✅ Found and clicked conversation: ${result.name}`);

      // Wait for URL to change
      await this.wait(1000);

      // Get the conversation URL
      const conversationUrl = page.url();
      console.log(`  ✅ Conversation URL: ${conversationUrl}\n`);

      return { 
        success: true, 
        data: {
          profileName,
          conversationUrl
        }
      };
    } catch (error: any) {
      console.error('❌ Failed to get conversation URL:', error.message);
      throw new Error(`Failed to get conversation URL: ${error.message}`);
    }
  }
}

export default new LinkedInService();
