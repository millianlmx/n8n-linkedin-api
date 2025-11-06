import { Router, Request, Response } from 'express';
import LinkedInService from '../services/LinkedInService';
import SessionManager from '../services/SessionManager';
import { LoginRequest } from '../types';

const router = Router();

/**
 * POST /api/auth/init
 * Initialize a new browser session
 */
router.post('/init', async (req: Request, res: Response) => {
  try {
    console.log('📥 Received request to initialize browser');
    const { browser, page } = await LinkedInService.initializeBrowser();
    const sessionId = SessionManager.createSession(browser, page);

    console.log(`✅ Session created with ID: ${sessionId}`);
    res.json({
      success: true,
      sessionId,
      message: 'Browser initialized',
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

    const credentials: LoginRequest = { email, password };
    await LinkedInService.login(sessionId, credentials);

    res.json({
      success: true,
      sessionId,
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
router.post('/force-authenticate', (req: Request, res: Response) => {
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
