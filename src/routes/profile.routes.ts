import { Router, Request, Response } from 'express';
import LinkedInService from '../services/LinkedInService';
import LinkedInBrowser from '../services/LinkedInBrowser';
import { createServiceLogger } from '../utils/logger';

const router = Router();
const log = createServiceLogger('ProfileRoutes');

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
 * Body: { url: string, sessionId?: string } (sessionId is optional - ignored for backward compatibility)
 */
router.post('/scrape', async (req: Request, res: Response) => {
  const requestId = `scrape-${Date.now()}`;
  const startTime = Date.now();
  
  log.info('Profile scrape request received', { requestId });

  try {
    const { url } = req.body;
    
    // Validate URL first
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

    log.debug('Scraping profile', { requestId, url });
    
    const result = await LinkedInService.scrapeProfile('unused', { url });

    const duration = Date.now() - startTime;
    log.info('Profile scrape completed successfully', { 
      requestId, 
      duration: `${duration}ms`,
      profileName: result.data?.name || 'unknown'
    });

    return res.json(result);
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
 * Body: { url: string, sessionId?: string } (sessionId is optional - ignored for backward compatibility)
 */
router.post('/visit', async (req: Request, res: Response) => {
  const requestId = `visit-${Date.now()}`;
  const startTime = Date.now();
  
  log.info('Profile visit request received', { requestId });

  try {
    const { url } = req.body;

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

    // Check browser is ready and authenticated
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

    log.debug('Calling LinkedInService.visitProfile', { requestId });
    
    const result = await LinkedInService.visitProfile('unused', url);

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
 * Query: sessionId (optional - ignored for backward compatibility)
 */
router.get('/views', async (req: Request, res: Response) => {
  const requestId = `views-${Date.now()}`;
  const startTime = Date.now();
  
  log.info('Profile views request received', { requestId });

  try {
    // Check browser is ready and authenticated
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

    log.debug('Calling LinkedInService.getProfileViews', { requestId });
    
    const result = await LinkedInService.getProfileViews('unused');

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
