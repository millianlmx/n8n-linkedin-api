import { Router, Request, Response } from 'express';
import LinkedInService from '../services/LinkedInService';
import LinkedInBrowser from '../services/LinkedInBrowser';
import BrowserStateService from '../services/BrowserStateService';
import { LoginRequest } from '../types';
import { createServiceLogger } from '../utils/logger';

const router = Router();
const log = createServiceLogger('AuthRoutes');

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
  } catch (error: any) {
    log.error('Error initializing browser', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Legacy alias for /initialize (kept for backward compatibility)
router.post('/init', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    log.info('Received request to initialize browser (legacy /init)', { email: email || 'not provided' });
    
    const result = await LinkedInService.initializeBrowser(email);
    
    log.info('Browser initialized successfully', {
      sessionRestored: result.sessionRestored || false,
      isAuthenticated: result.isAuthenticated || false
    });
    
    // Start message monitoring if already authenticated
    if (result.sessionRestored && result.isAuthenticated) {
      try {
        await LinkedInService.startMessageMonitoring('unused');
        log.info('Message monitoring started automatically');
      } catch (monitoringError: any) {
        log.warn('Failed to start automatic monitoring', { error: monitoringError.message });
      }
    }

    // Return a fake sessionId for backward compatibility with existing clients
    res.json({
      success: true,
      sessionId: 'singleton',
      sessionRestored: result.sessionRestored || false,
      message: result.sessionRestored ? 'Browser initialized with saved session' : 'Browser initialized',
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
 * sessionId is optional (ignored - kept for backward compatibility)
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

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
  } catch (error: any) {
    res.status(401).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * GET /api/auth/status
 * Get current authentication status
 */
router.get('/status', (_req: Request, res: Response) => {
  try {
    const status = LinkedInBrowser.getStatus();
    return res.json({
      success: true,
      ...status,
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
 * Body: { sessionId?: string } - sessionId is optional (ignored - kept for backward compatibility)
 */
router.delete('/logout', async (_req: Request, res: Response) => {
  try {
    await LinkedInBrowser.close();
    log.info('Browser closed');
    return res.json({
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
 * Get all active sessions (kept for backward compatibility)
 * Returns status as a single "session" since we use singleton browser
 */
router.get('/sessions', (_req: Request, res: Response) => {
  try {
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
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * GET /api/auth/session/:sessionId
 * Get session details including authentication status (kept for backward compatibility)
 */
router.get('/session/:sessionId', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    
    // Accept 'singleton' or any sessionId (for backward compatibility)
    if (sessionId === 'singleton' || LinkedInBrowser.isReady()) {
      const status = LinkedInBrowser.getStatus();
      return res.json({
        success: true,
        session: {
          id: sessionId,
          isAuthenticated: status.authenticated,
          hasMonitoring: status.hasMonitoring,
          userIdentifier: status.userIdentifier,
        },
      });
    }
    
    return res.status(404).json({
      success: false,
      message: 'Session not found (browser not initialized)',
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
 * Body: { sessionId?: string } - sessionId is optional (ignored - kept for backward compatibility)
 */
router.post('/force-authenticate', async (_req: Request, res: Response) => {
  try {
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
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;
