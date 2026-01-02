import { Router, Request, Response } from 'express';
import LinkedInService from '../services/LinkedInService';
import LinkedInBrowser from '../services/LinkedInBrowser';
import { createServiceLogger } from '../utils/logger';

const router = Router();
const log = createServiceLogger('SearchRoutes');

// Flag to control whether to use new LinkedInBrowser (should match LinkedInService)
const USE_NEW_BROWSER = true;

/**
 * POST /api/search/people
 * Search for people on LinkedIn
 * Body: { sessionId?: string, keywords: string, limit?: number }
 * sessionId is optional when using new browser system
 */
router.post('/people', async (req: Request, res: Response) => {
  try {
    const { sessionId, keywords, limit } = req.body;

    // Check authentication
    if (USE_NEW_BROWSER) {
      if (!LinkedInBrowser.isReady()) {
        return res.status(503).json({
          success: false,
          message: 'Browser not initialized. Please call POST /api/auth/initialize first.',
        });
      }
      if (!LinkedInBrowser.isAuthenticated()) {
        return res.status(401).json({
          success: false,
          message: 'Not authenticated. Please call POST /api/auth/login first.',
        });
      }
    } else {
      // Legacy mode
      if (!sessionId) {
        return res.status(400).json({
          success: false,
          message: 'Session ID is required',
        });
      }
    }

    if (!keywords) {
      return res.status(400).json({
        success: false,
        message: 'Keywords are required',
      });
    }

    const result = await LinkedInService.searchPeople(
      sessionId || 'unused',
      keywords,
      limit || 50
    );

    res.json(result);
  } catch (error: any) {
    log.error('Search people failed', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;
