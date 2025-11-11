import * as puppeteer from 'puppeteer';
import SessionManager from './SessionManager';
import { LoginRequest, ProfileScrapeRequest, SendMessageRequest } from '../types';
import { existsSync } from 'fs';
import { CacheService } from './CacheService';
import * as DOMFunctions from '../utils/linkedin-dom-functions';

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
   * @returns Browser instance and new page
   */
  async initializeBrowser() {
    console.log('🚀 Initializing browser...');
    
    const executablePath = this.findChrome();
    if (executablePath) {
      console.log(`📍 Using Chrome at: ${executablePath}`);
    } else {
      console.log('📍 Using bundled Chromium');
    }
    
    try {
      const browser = await puppeteer.launch({
        headless: true,
        executablePath: executablePath || undefined,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
        ],
        defaultViewport: {
          width: 1366,
          height: 768,
        },
      });

      const page = await browser.newPage();
      
      // Set user agent to avoid detection
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );
      
      console.log('✅ Browser initialized successfully\n');
      return { browser, page };
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

      // Check if we're on the feed page (successful login)
      const currentUrl = page.url();
      console.log(`📍 Current URL after login: ${currentUrl}`);
      
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

        console.log('✅ Login successful\n');
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

      return { success: true, data: profileData };
    } catch (error: any) {
      console.error('❌ Profile scraping failed:', error.message);
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
      
      return { success: true, data: messages, cached: false, cacheUpdated };
    } catch (error: any) {
      console.error('❌ Failed to read conversation:', error.message);
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
      return { success: true, message: 'Message sent successfully' };
    } catch (error: any) {
      console.error('❌ Failed to send message:', error.message);
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
      return { success: true, message: 'Profile visited' };
    } catch (error: any) {
      console.error('❌ Failed to visit profile:', error.message);
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

      // Try to find direct "Se connecter" button first (non-premium)
      let buttonClicked = await page.evaluate(() => {
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

      // If direct button not found, try Premium flow (Plus button -> dropdown)
      if (!buttonClicked) {
        console.log('  🔍 Direct connect button not found, trying Premium flow...');
        
        // Click the "Plus" dropdown button
        const plusButtonClicked = await page.evaluate(() => {
          const plusButton = document.querySelector(
            '.artdeco-dropdown button'
          ) as HTMLButtonElement;
          
          if (plusButton) {
            plusButton.click();
            return true;
          }
          return false;
        });

        if (!plusButtonClicked) {
          console.log('  ❌ Plus button not found');
          return { success: false, message: 'Connect button not found (tried both direct and dropdown)' };
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
        console.log('  ✅ Clicked direct connect button');
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

      return { success: true, message: 'Connection request sent' };
    } catch (error: any) {
      console.error('❌ Failed to send connection request:', error.message);
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
      return { 
        success: true, 
        data: {
          profile: profileData
        }
      };
    } catch (error: any) {
      console.error('❌ Failed to get profile views:', error.message);
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
