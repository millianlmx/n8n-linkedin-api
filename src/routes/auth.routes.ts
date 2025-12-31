import { Router, Request, Response } from 'express';
import LinkedInService from '../services/LinkedInService';
import SessionManager from '../services/SessionManager';
import BrowserStateService from '../services/BrowserStateService';
import { LoginRequest } from '../types';

const router = Router();

/**
 * POST /api/auth/init
 * Initialize a new browser session
 * Body: { email?: string } - Optional email to restore saved browser state
 */
router.post('/init', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    console.log('📥 Received request to initialize browser');
    
    if (email) {
      console.log(`   Using email for state restoration: ${email}`);
    }
    
    const { browser, page, sessionRestored } = await LinkedInService.initializeBrowser(email);
    const sessionId = SessionManager.createSession(browser, page);

    // If session was restored, mark as authenticated
    if (sessionRestored) {
      SessionManager.updateSession(sessionId, {
        isAuthenticated: true,
      });
      
      // Start message monitoring automatically
      try {
        await LinkedInService.startMessageMonitoring(sessionId);
        console.log('✅ Message monitoring started automatically');
      } catch (monitoringError: any) {
        console.warn(`⚠️  Failed to start automatic monitoring: ${monitoringError.message}`);
      }
    }

    console.log(`✅ Session created with ID: ${sessionId}`);
    res.json({
      success: true,
      sessionId,
      sessionRestored: sessionRestored || false,
      message: sessionRestored ? 'Browser initialized with saved session' : 'Browser initialized',
    });
  } catch (error: any) {
    console.error('❌ Error initializing browser:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/auth/login
 * Login to LinkedIn
 * Body: { sessionId: string, email?: string, password?: string }
 * 
 * This endpoint will:
 * 1. Try to restore browser state with saved cookies
 * 2. Check if already logged in by navigating to feed and checking URL redirect
 * 3. If logged in, skip real login and return success
 * 4. If not logged in, proceed with real login flow
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { sessionId, email, password } = req.body;

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
      console.log(`🔐 Attempting to restore browser state for: ${userIdentifier}`);
      
      const hasState = await BrowserStateService.hasBrowserState(userIdentifier);
      if (hasState) {
        console.log('   Found saved browser state, restoring cookies...');
        const restored = await BrowserStateService.restoreBrowserState(userIdentifier, page);
        
        if (restored) {
          console.log('   Cookies restored, verifying session...');
          
          // Step 2: Check if we're logged in by navigating to feed and checking URL
          const isValid = await BrowserStateService.verifySession(page);
          
          if (isValid) {
            // Step 3: Already logged in - skip real login
            console.log('✅ Session is valid - already logged in via cookies');
            
            SessionManager.updateSession(sessionId, {
              isAuthenticated: true,
            });
            
            // Start message monitoring automatically
            try {
              await LinkedInService.startMessageMonitoring(sessionId);
              console.log('✅ Message monitoring started automatically');
            } catch (monitoringError: any) {
              console.warn(`⚠️  Failed to start automatic monitoring: ${monitoringError.message}`);
            }
            
            return res.json({
              success: true,
              sessionId,
              sessionRestored: true,
              message: 'Login successful (session restored from cookies)',
            });
          } else {
            console.log('⚠️  Saved session expired, proceeding with real login...');
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
        console.log('   No saved browser state found, proceeding with real login...');
      }
    }

    // Step 4: Proceed with real login flow
    console.log('🔑 Initiating real LinkedIn login...');
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
 * DELETE /api/auth/logout
 * Logout and close browser session
 * Body: { sessionId: string }
 */
router.delete('/logout', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;

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
 * Get all active sessions
 */
router.get('/sessions', (req: Request, res: Response) => {
  try {
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
 * Get session details including authentication status
 */
router.get('/session/:sessionId', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
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
 * Force mark a session as authenticated (workaround for timeout issues)
 * Body: { sessionId: string }
 */
router.post('/force-authenticate', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;
    
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
    console.log('🚀 Starting automatic message monitoring...');
    try {
      await LinkedInService.startMessageMonitoring(sessionId);
      console.log('✅ Message monitoring started automatically');
    } catch (monitoringError: any) {
      console.warn(`⚠️  Failed to start automatic monitoring: ${monitoringError.message}`);
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
