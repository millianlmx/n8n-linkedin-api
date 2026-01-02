import { Router, Request, Response } from 'express';
import LinkedInService from '../services/LinkedInService';
import LinkedInBrowser from '../services/LinkedInBrowser';
import SessionManager from '../services/SessionManager';
import { requireAuth, AuthenticatedRequest } from '../middleware/session.middleware';
import { createServiceLogger } from '../utils/logger';

const router = Router();
const log = createServiceLogger('ProfileRoutes');

// Flag to control whether to use new LinkedInBrowser (should match LinkedInService)
const USE_NEW_BROWSER = true;

/**
 * Validates UUID format
 */
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Validates LinkedIn profile URL format
 */
function isValidLinkedInUrl(url: string): boolean {
  if (typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes('linkedin.com') && parsed.pathname.includes('/in/');
  } catch {
    return false;
  }
}

/**
 * POST /api/profile/scrape
 * Scrape a LinkedIn profile
 * Body: { url: string } (sessionId is optional when using new browser system)
 */
router.post('/scrape', async (req: Request, res: Response) => {
  const requestId = `scrape-${Date.now()}`;
  const startTime = Date.now();
  
  log.info('Profile scrape request received', { 
    requestId,
    useNewBrowser: USE_NEW_BROWSER,
  });

  try {
    const { sessionId, url } = req.body;
    
    // Validate URL first (required for both modes)
    if (!url) {
      log.warn('Missing URL', { requestId });
      return res.status(400).json({
        success: false,
        message: 'Profile URL is required',
        requestId,
      });
    }

    if (typeof url !== 'string') {
      log.warn('Invalid URL type', { requestId, type: typeof url, value: JSON.stringify(url) });
      return res.status(400).json({
        success: false,
        message: `URL must be a string, got ${typeof url}: ${JSON.stringify(url)}`,
        requestId,
      });
    }

    if (!isValidLinkedInUrl(url)) {
      log.warn('Invalid LinkedIn URL', { requestId, url });
      return res.status(400).json({
        success: false,
        message: `Invalid LinkedIn profile URL: "${url}". URL must be a valid LinkedIn profile URL (e.g., https://www.linkedin.com/in/username/)`,
        requestId,
      });
    }

    // When using new browser system, sessionId is optional
    if (USE_NEW_BROWSER) {
      // Check if browser is ready and authenticated
      if (!LinkedInBrowser.isReady()) {
        return res.status(503).json({
          success: false,
          message: 'Browser not initialized. Please call POST /api/auth/initialize first.',
          requestId,
        });
      }
      
      if (!LinkedInBrowser.isAuthenticated()) {
        return res.status(401).json({
          success: false,
          message: 'Not authenticated. Please call POST /api/auth/login first.',
          requestId,
        });
      }

      log.debug('Using new browser system for scraping', { requestId });
      
      // Call scrapeProfile with a dummy sessionId (will be ignored by new system)
      const result = await LinkedInService.scrapeProfile('unused', { url });

      const duration = Date.now() - startTime;
      log.info('Profile scrape completed successfully', { 
        requestId, 
        duration: `${duration}ms`,
        profileName: result.data?.name || 'unknown'
      });

      return res.json(result);
    }

    // Legacy mode: sessionId is required
    // Log the EXACT sessionId received (full value, not truncated)
    log.debug('Using legacy session system', {
      requestId,
      sessionIdRaw: sessionId,
      sessionIdLength: sessionId?.length,
      sessionIdType: typeof sessionId,
    });

    // Validate sessionId
    if (!sessionId) {
      log.warn('Missing sessionId', { requestId });
      return res.status(400).json({
        success: false,
        message: 'Session ID is required',
        requestId,
      });
    }

    if (typeof sessionId !== 'string') {
      log.warn('Invalid sessionId type', { requestId, type: typeof sessionId, value: String(sessionId) });
      return res.status(400).json({
        success: false,
        message: 'Session ID must be a string',
        requestId,
      });
    }

    if (!isValidUUID(sessionId)) {
      log.warn('Invalid sessionId format', { requestId, sessionId });
      
      // List available sessions to help debug
      const availableSessions = SessionManager.getAllSessions();
      log.info('Available sessions', { 
        requestId, 
        count: availableSessions.length,
        sessionIds: availableSessions.map(s => s.id)
      });
      
      return res.status(400).json({
        success: false,
        message: `Invalid Session ID format. Expected UUID, got: "${sessionId}". Use GET /api/auth/sessions to get valid session IDs.`,
        requestId,
        availableSessions: availableSessions.map(s => ({ id: s.id, isAuthenticated: s.isAuthenticated })),
      });
    }

    // Check if session exists before calling the service
    const session = SessionManager.getSession(sessionId);
    if (!session) {
      log.warn('Session not found', { requestId, sessionId });
      
      const availableSessions = SessionManager.getAllSessions();
      log.info('Available sessions', { 
        requestId, 
        count: availableSessions.length,
        sessionIds: availableSessions.map(s => s.id)
      });
      
      return res.status(404).json({
        success: false,
        message: `Session not found: ${sessionId}. Use GET /api/auth/sessions to get valid session IDs.`,
        requestId,
        availableSessions: availableSessions.map(s => ({ id: s.id, isAuthenticated: s.isAuthenticated })),
      });
    }

    if (!session.isAuthenticated) {
      log.warn('Session not authenticated', { requestId, sessionId });
      return res.status(401).json({
        success: false,
        message: 'Session is not authenticated. Please login first using POST /api/auth/login',
        requestId,
      });
    }

    log.debug('Calling LinkedInService.scrapeProfile', { requestId, sessionId: sessionId.substring(0, 8) });
    
    const result = await LinkedInService.scrapeProfile(sessionId, { url });

    const duration = Date.now() - startTime;
    log.info('Profile scrape completed successfully', { 
      requestId, 
      duration: `${duration}ms`,
      profileName: result.data?.name || 'unknown'
    });

    res.json(result);
  } catch (error: any) {
    const duration = Date.now() - startTime;
    log.error('Profile scrape failed', error, { 
      requestId, 
      duration: `${duration}ms`,
      errorMessage: error.message,
    });
    
    // Determine appropriate status code based on error
    let statusCode = 500;
    if (error.message.includes('Not authenticated') || error.message.includes('Session expired')) {
      statusCode = 401;
    } else if (error.message.includes('Session not found') || error.message.includes('Browser not initialized')) {
      statusCode = 404;
    }
    
    res.status(statusCode).json({
      success: false,
      message: error.message,
      requestId,
    });
  }
});

/**
 * POST /api/profile/visit
 * Visit a LinkedIn profile
 * Body: { sessionId: string, url: string }
 */
router.post('/visit', async (req: Request, res: Response) => {
  const requestId = `visit-${Date.now()}`;
  const startTime = Date.now();
  
  log.info('Profile visit request received', { 
    requestId,
    body: JSON.stringify(req.body),
  });

  try {
    const { sessionId, url } = req.body;

    // Validate sessionId
    if (!sessionId || typeof sessionId !== 'string') {
      log.warn('Invalid sessionId', { requestId, sessionId });
      return res.status(400).json({
        success: false,
        message: 'Valid Session ID is required',
        requestId,
      });
    }

    if (!isValidUUID(sessionId)) {
      const availableSessions = SessionManager.getAllSessions();
      return res.status(400).json({
        success: false,
        message: `Invalid Session ID format. Use GET /api/auth/sessions to get valid session IDs.`,
        requestId,
        availableSessions: availableSessions.map(s => ({ id: s.id, isAuthenticated: s.isAuthenticated })),
      });
    }

    // Validate URL
    if (!url || typeof url !== 'string') {
      log.warn('Invalid URL', { requestId, url: String(url) });
      return res.status(400).json({
        success: false,
        message: `URL must be a valid string, got: ${typeof url}`,
        requestId,
      });
    }

    if (!isValidLinkedInUrl(url)) {
      return res.status(400).json({
        success: false,
        message: `Invalid LinkedIn profile URL: "${url}"`,
        requestId,
      });
    }

    // Check session exists and is authenticated
    const session = SessionManager.getSession(sessionId);
    if (!session) {
      const availableSessions = SessionManager.getAllSessions();
      return res.status(404).json({
        success: false,
        message: `Session not found: ${sessionId}`,
        requestId,
        availableSessions: availableSessions.map(s => ({ id: s.id, isAuthenticated: s.isAuthenticated })),
      });
    }

    if (!session.isAuthenticated) {
      return res.status(401).json({
        success: false,
        message: 'Session is not authenticated. Please login first.',
        requestId,
      });
    }

    log.debug('Calling LinkedInService.visitProfile', { requestId });
    
    const result = await LinkedInService.visitProfile(sessionId, url);

    const duration = Date.now() - startTime;
    log.info('Profile visit completed successfully', { requestId, duration: `${duration}ms` });

    res.json(result);
  } catch (error: any) {
    const duration = Date.now() - startTime;
    log.error('Profile visit failed', error, { 
      requestId, 
      duration: `${duration}ms`,
      errorMessage: error.message 
    });
    
    let statusCode = 500;
    if (error.message.includes('Not authenticated') || error.message.includes('Session expired')) {
      statusCode = 401;
    } else if (error.message.includes('Session not found')) {
      statusCode = 404;
    }
    
    res.status(statusCode).json({
      success: false,
      message: error.message,
      requestId,
    });
  }
});

/**
 * GET /api/profile/views
 * Get profile views
 * Query: sessionId
 */
router.get('/views', async (req: Request, res: Response) => {
  const requestId = `views-${Date.now()}`;
  const startTime = Date.now();
  
  log.info('Profile views request received', { 
    requestId,
    query: JSON.stringify(req.query),
  });

  try {
    const { sessionId } = req.query;

    if (!sessionId || typeof sessionId !== 'string') {
      log.warn('Invalid sessionId', { requestId });
      return res.status(400).json({
        success: false,
        message: 'Session ID is required as query parameter',
        requestId,
      });
    }

    if (!isValidUUID(sessionId)) {
      const availableSessions = SessionManager.getAllSessions();
      return res.status(400).json({
        success: false,
        message: `Invalid Session ID format. Use GET /api/auth/sessions to get valid session IDs.`,
        requestId,
        availableSessions: availableSessions.map(s => ({ id: s.id, isAuthenticated: s.isAuthenticated })),
      });
    }

    // Check session exists and is authenticated
    const session = SessionManager.getSession(sessionId);
    if (!session) {
      const availableSessions = SessionManager.getAllSessions();
      return res.status(404).json({
        success: false,
        message: `Session not found: ${sessionId}`,
        requestId,
        availableSessions: availableSessions.map(s => ({ id: s.id, isAuthenticated: s.isAuthenticated })),
      });
    }

    if (!session.isAuthenticated) {
      return res.status(401).json({
        success: false,
        message: 'Session is not authenticated. Please login first.',
        requestId,
      });
    }

    log.debug('Calling LinkedInService.getProfileViews', { requestId });
    
    const result = await LinkedInService.getProfileViews(sessionId);

    const duration = Date.now() - startTime;
    log.info('Profile views retrieved successfully', { requestId, duration: `${duration}ms` });

    res.json(result);
  } catch (error: any) {
    const duration = Date.now() - startTime;
    log.error('Profile views retrieval failed', error, { 
      requestId, 
      duration: `${duration}ms`,
      errorMessage: error.message 
    });
    
    let statusCode = 500;
    if (error.message.includes('Not authenticated') || error.message.includes('Session expired')) {
      statusCode = 401;
    } else if (error.message.includes('Session not found')) {
      statusCode = 404;
    }
    
    res.status(statusCode).json({
      success: false,
      message: error.message,
      requestId,
    });
  }
});

export default router;
