import { Router, Request, Response } from 'express';
import LinkedInService from '../services/LinkedInService';
import { createServiceLogger } from '../utils/logger';

const router = Router();
const log = createServiceLogger('ProfileRoutes');

/**
 * POST /api/profile/scrape
 * Scrape a LinkedIn profile
 * Body: { sessionId: string, url: string }
 */
router.post('/scrape', async (req: Request, res: Response) => {
  const requestId = `scrape-${Date.now()}`;
  const startTime = Date.now();
  
  log.info('Profile scrape request received', { 
    requestId,
    sessionId: req.body.sessionId ? `${req.body.sessionId.substring(0, 8)}...` : 'missing',
    url: req.body.url || 'missing'
  });

  try {
    const { sessionId, url } = req.body;

    if (!sessionId || !url) {
      log.warn('Missing required parameters', { requestId, hasSessionId: !!sessionId, hasUrl: !!url });
      return res.status(400).json({
        success: false,
        message: 'Session ID and profile URL are required',
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
      errorStack: error.stack
    });
    
    // Determine appropriate status code based on error
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
 * POST /api/profile/visit
 * Visit a LinkedIn profile
 * Body: { sessionId: string, url: string }
 */
router.post('/visit', async (req: Request, res: Response) => {
  const requestId = `visit-${Date.now()}`;
  const startTime = Date.now();
  
  log.info('Profile visit request received', { 
    requestId,
    sessionId: req.body.sessionId ? `${req.body.sessionId.substring(0, 8)}...` : 'missing',
    url: req.body.url || 'missing'
  });

  try {
    const { sessionId, url } = req.body;

    if (!sessionId || !url) {
      log.warn('Missing required parameters', { requestId, hasSessionId: !!sessionId, hasUrl: !!url });
      return res.status(400).json({
        success: false,
        message: 'Session ID and profile URL are required',
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
    sessionId: req.query.sessionId ? `${String(req.query.sessionId).substring(0, 8)}...` : 'missing'
  });

  try {
    const { sessionId } = req.query;

    if (!sessionId || typeof sessionId !== 'string') {
      log.warn('Missing required parameters', { requestId, hasSessionId: !!sessionId });
      return res.status(400).json({
        success: false,
        message: 'Session ID is required',
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
