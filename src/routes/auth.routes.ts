import { Router, Request, Response } from 'express';
import LinkedInService from '../services/LinkedInService';
import LinkedInBrowser from '../services/LinkedInBrowser';
import SessionManager from '../services/SessionManager';
import BrowserStateService from '../services/BrowserStateService';
import { LoginRequest } from '../types';
import { createServiceLogger } from '../utils/logger';

const router = Router();
const log = createServiceLogger('AuthRoutes');

// Flag to control whether to use new LinkedInBrowser (should match LinkedInService)
const USE_NEW_BROWSER = true;

/**
 * POST /api/auth/initialize (new endpoint) or /api/auth/init (legacy)
 * Initialize the browser
 * Body: { email?: string } - Optional email to restore saved browser state
 */
router.post('/initialize', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    log.info('Received request to initialize browser', { email: email || 'not provided' });
    
    const result = await LinkedInService.initializeBrowser(email);
    
    if (USE_NEW_BROWSER) {
      // New system: no sessionId needed
      log.info('Browser initialized successfully', {
        sessionRestored: result.sessionRestored || false,
        isAuthenticated: result.isAuthenticated || false
      });
      
      // Start message monitoring if already authenticated
      if (result.isAuthenticated) {
        try {
          await LinkedInService.startMessageMonitoring('unused');
          log.info('Message monitoring started automatically');
        } catch (monitoringError: any) {
          log.warn('Failed to start automatic monitoring', { error: monitoringError.message });
        }
      }
      
      return res.json({
        success: true,
        sessionRestored: result.sessionRestored || false,
        isAuthenticated: result.isAuthenticated || false,
        message: result.sessionRestored ? 'Browser initialized with saved session' : 'Browser initialized',
      });
    }
    
    // Legacy mode: create session
    const { browser, page, sessionRestored } = result;
    const sessionId = SessionManager.createSession(browser, page);

    // If session was restored, mark as authenticated
    if (sessionRestored) {
      SessionManager.updateSession(sessionId, {
        isAuthenticated: true,
      });
      
      // Start message monitoring automatically
      try {
        await LinkedInService.startMessageMonitoring(sessionId);
        log.info('Message monitoring started automatically');
      } catch (monitoringError: any) {
        log.warn('Failed to start automatic monitoring', { error: monitoringError.message });
      }
    }

    log.info('Session created', { sessionId });
    res.json({
      success: true,
      sessionId,
      sessionRestored: sessionRestored || false,
      message: sessionRestored ? 'Browser initialized with saved session' : 'Browser initialized',
    });
  } catch (error: any) {
    log.error('Error initializing browser', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Legacy alias for /initialize
router.post('/init', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    log.info('Received request to initialize browser (legacy /init)', { email: email || 'not provided' });
    
    const result = await LinkedInService.initializeBrowser(email);
    const { browser, page, sessionRestored } = result;
    
    // Always create a session for backward compatibility
    const sessionId = SessionManager.createSession(browser, page);

    // If session was restored, mark as authenticated
    if (sessionRestored) {
      SessionManager.updateSession(sessionId, {
        isAuthenticated: true,
      });
      
      // Start message monitoring automatically
      try {
        await LinkedInService.startMessageMonitoring(sessionId);
        log.info('Message monitoring started automatically');
      } catch (monitoringError: any) {
        log.warn('Failed to start automatic monitoring', { error: monitoringError.message });
      }
    }

    log.info('Session created', { sessionId });
    res.json({
      success: true,
      sessionId,
      sessionRestored: sessionRestored || false,
      message: sessionRestored ? 'Browser initialized with saved session' : 'Browser initialized',
    });
  } catch (error: any) {
    log.error('Error initializing browser', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/auth/login
 * Login to LinkedIn
 * Body: { sessionId?: string, email?: string, password?: string }
 * sessionId is optional when using new browser system
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { sessionId, email, password } = req.body;

    if (USE_NEW_BROWSER) {
      // New system: sessionId is optional
      if (!LinkedInBrowser.isReady()) {
        return res.status(503).json({
          success: false,
          message: 'Browser not initialized. Please call POST /api/auth/initialize first.',
        });
      }
      
      // If already authenticated, return success
      if (LinkedInBrowser.isAuthenticated()) {
        log.info('Already authenticated');
        return res.json({
          success: true,
          sessionRestored: true,
          message: 'Already logged in',
        });
      }
      
      const userIdentifier = email || process.env.LINKEDIN_EMAIL;
      
      // Try to restore browser state with saved cookies
      if (userIdentifier) {
        log.info('Attempting to restore browser state', { userIdentifier });
        
        const page = LinkedInBrowser.getOperationPage()!;
        const hasState = await BrowserStateService.hasBrowserState(userIdentifier);
        
        if (hasState) {
          log.debug('Found saved browser state, restoring cookies...');
          const restored = await BrowserStateService.restoreBrowserState(userIdentifier, page);
          
          if (restored) {
            log.debug('Cookies restored, verifying session...');
            const isValid = await BrowserStateService.verifySession(page);
            
            if (isValid) {
              log.info('Session is valid - already logged in via cookies');
              LinkedInBrowser.setAuthenticated(true);
              LinkedInBrowser.setUserIdentifier(userIdentifier);
              
              // Start message monitoring automatically
              try {
                await LinkedInService.startMessageMonitoring('unused');
                log.info('Message monitoring started automatically');
              } catch (monitoringError: any) {
                log.warn('Failed to start automatic monitoring', { error: monitoringError.message });
              }
              
              return res.json({
                success: true,
                sessionRestored: true,
                message: 'Login successful (session restored from cookies)',
              });
            } else {
              log.warn('Saved session expired, proceeding with real login...');
              await BrowserStateService.deleteBrowserState(userIdentifier);
              await LinkedInBrowser.clearBrowserState();
            }
          }
        }
      }
      
      // Proceed with real login
      log.info('Initiating real LinkedIn login...');
      const credentials: LoginRequest = { email, password };
      await LinkedInService.login('unused', credentials);
      
      return res.json({
        success: true,
        sessionRestored: false,
        message: 'Login successful',
      });
    }

    // Legacy mode: sessionId is required
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required',
      });
    }

    const session = SessionManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found',
      });
    }

    const { page } = session;
    const userIdentifier = email || process.env.LINKEDIN_EMAIL;

    // Step 1: Try to restore browser state with saved cookies
    if (userIdentifier) {
      log.info('Attempting to restore browser state', { userIdentifier });
      
      const hasState = await BrowserStateService.hasBrowserState(userIdentifier);
      if (hasState) {
        log.debug('Found saved browser state, restoring cookies...');
        const restored = await BrowserStateService.restoreBrowserState(userIdentifier, page);
        
        if (restored) {
          log.debug('Cookies restored, verifying session...');
          
          // Step 2: Check if we're logged in by navigating to feed and checking URL
          const isValid = await BrowserStateService.verifySession(page);
          
          if (isValid) {
            // Step 3: Already logged in - skip real login
            log.info('Session is valid - already logged in via cookies');
            
            SessionManager.updateSession(sessionId, {
              isAuthenticated: true,
            });
            
            // Start message monitoring automatically
            try {
              await LinkedInService.startMessageMonitoring(sessionId);
              log.info('Message monitoring started automatically');
            } catch (monitoringError: any) {
              log.warn('Failed to start automatic monitoring', { error: monitoringError.message });
            }
            
            return res.json({
              success: true,
              sessionId,
              sessionRestored: true,
              message: 'Login successful (session restored from cookies)',
            });
          } else {
            log.warn('Saved session expired, proceeding with real login...');
            // Delete expired state
            await BrowserStateService.deleteBrowserState(userIdentifier);
            
            // Clear all cookies and storage to ensure a clean state
            const browser = page.browser();
            if (browser) {
              const client = await page.target().createCDPSession();
              await client.send('Network.clearBrowserCookies');
              await client.send('Network.clearBrowserCache');
            }
            
            // Clear localStorage and sessionStorage
            await page.evaluate(() => {
              localStorage.clear();
              sessionStorage.clear();
            });
            
            // Navigate to blank page to reset state
            await page.goto('about:blank', { waitUntil: 'domcontentloaded' });
          }
        }
      } else {
        log.debug('No saved browser state found, proceeding with real login...');
      }
    }

    // Step 4: Proceed with real login flow
    log.info('Initiating real LinkedIn login...');
    const credentials: LoginRequest = { email, password };
    await LinkedInService.login(sessionId, credentials);

    res.json({
      success: true,
      sessionId,
      sessionRestored: false,
      message: 'Login successful',
    });
  } catch (error: any) {
    res.status(401).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * GET /api/auth/status
 * Get current authentication status (new endpoint for new browser system)
 */
router.get('/status', (req: Request, res: Response) => {
  try {
    if (USE_NEW_BROWSER) {
      const status = LinkedInBrowser.getStatus();
      return res.json({
        success: true,
        ...status,
      });
    }
    
    // Legacy mode: check all sessions
    const sessions = SessionManager.getAllSessions();
    const authenticatedSessions = sessions.filter(s => s.isAuthenticated);
    
    res.json({
      success: true,
      ready: sessions.length > 0,
      authenticated: authenticatedSessions.length > 0,
      sessionCount: sessions.length,
      authenticatedCount: authenticatedSessions.length,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * DELETE /api/auth/logout
 * Logout and close browser session
 * Body: { sessionId?: string } - sessionId is optional when using new browser system
 */
router.delete('/logout', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;

    if (USE_NEW_BROWSER) {
      // Close the singleton browser
      await LinkedInBrowser.close();
      log.info('Browser closed');
      return res.json({
        success: true,
        message: 'Logged out successfully',
      });
    }

    // Legacy mode
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required',
      });
    }

    await SessionManager.deleteSession(sessionId);

    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * GET /api/auth/sessions
 * Get all active sessions (legacy endpoint - kept for backward compatibility)
 */
router.get('/sessions', (req: Request, res: Response) => {
  try {
    if (USE_NEW_BROWSER) {
      // Return status as a single "session"
      const status = LinkedInBrowser.getStatus();
      return res.json({
        success: true,
        sessions: status.ready ? [{
          id: 'singleton',
          isAuthenticated: status.authenticated,
          hasMonitoring: status.hasMonitoring,
          userIdentifier: status.userIdentifier,
        }] : [],
        count: status.ready ? 1 : 0,
      });
    }
    
    const sessions = SessionManager.getAllSessions();
    
    res.json({
      success: true,
      sessions: sessions,
      count: sessions.length,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * GET /api/auth/session/:sessionId
 * Get session details including authentication status (legacy endpoint)
 */
router.get('/session/:sessionId', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    
    if (USE_NEW_BROWSER && sessionId === 'singleton') {
      const status = LinkedInBrowser.getStatus();
      return res.json({
        success: true,
        session: {
          id: 'singleton',
          isAuthenticated: status.authenticated,
          hasMonitoring: status.hasMonitoring,
          userIdentifier: status.userIdentifier,
        },
      });
    }
    
    const session = SessionManager.getSession(sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found',
      });
    }
    
    res.json({
      success: true,
      session: {
        id: session.id,
        isAuthenticated: session.isAuthenticated,
        createdAt: session.createdAt,
        lastUsed: session.lastUsed,
        currentUrl: session.page.url(),
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/auth/force-authenticate
 * Force mark session as authenticated (workaround for timeout issues)
 * Body: { sessionId?: string } - sessionId is optional when using new browser system
 */
router.post('/force-authenticate', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;
    
    if (USE_NEW_BROWSER) {
      if (!LinkedInBrowser.isReady()) {
        return res.status(503).json({
          success: false,
          message: 'Browser not initialized',
        });
      }
      
      const page = LinkedInBrowser.getOperationPage();
      const currentUrl = page?.url() || '';
      
      // Only allow if already on a LinkedIn page (not login page)
      if (currentUrl.includes('/login')) {
        return res.status(400).json({
          success: false,
          message: 'Cannot force authenticate - still on login page',
          currentUrl,
        });
      }
      
      // Force authenticate
      LinkedInBrowser.setAuthenticated(true);
      
      // Start message monitoring
      log.info('Starting automatic message monitoring...');
      try {
        await LinkedInService.startMessageMonitoring('unused');
        log.info('Message monitoring started automatically');
      } catch (monitoringError: any) {
        log.warn('Failed to start automatic monitoring', { error: monitoringError.message });
      }
      
      return res.json({
        success: true,
        message: 'Session marked as authenticated',
        currentUrl,
      });
    }
    
    // Legacy mode
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required',
      });
    }
    
    const session = SessionManager.getSession(sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found',
      });
    }
    
    const currentUrl = session.page.url();
    
    // Only allow if already on a LinkedIn page (not login page)
    if (currentUrl.includes('/login')) {
      return res.status(400).json({
        success: false,
        message: 'Cannot force authenticate - still on login page',
        currentUrl,
      });
    }
    
    // Force authenticate
    SessionManager.updateSession(sessionId, {
      isAuthenticated: true,
    });
    
    // Automatically start message monitoring in a separate tab
    log.info('Starting automatic message monitoring...');
    try {
      await LinkedInService.startMessageMonitoring(sessionId);
      log.info('Message monitoring started automatically');
    } catch (monitoringError: any) {
      log.warn('Failed to start automatic monitoring', { error: monitoringError.message });
    }
    
    res.json({
      success: true,
      message: 'Session marked as authenticated',
      session: {
        id: session.id,
        isAuthenticated: true,
        currentUrl,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;
