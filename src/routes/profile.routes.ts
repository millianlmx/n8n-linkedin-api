import { Router, Request, Response } from 'express';
import LinkedInService from '../services/LinkedInService';

const router = Router();

/**
 * POST /api/profile/scrape
 * Scrape a LinkedIn profile
 * Body: { sessionId: string, url: string }
 */
router.post('/scrape', async (req: Request, res: Response) => {
  try {
    const { sessionId, url } = req.body;

    if (!sessionId || !url) {
      return res.status(400).json({
        success: false,
        message: 'Session ID and profile URL are required',
      });
    }

    const result = await LinkedInService.scrapeProfile(sessionId, { url });

    res.json(result);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/profile/visit
 * Visit a LinkedIn profile
 * Body: { sessionId: string, url: string }
 */
router.post('/visit', async (req: Request, res: Response) => {
  try {
    const { sessionId, url } = req.body;

    if (!sessionId || !url) {
      return res.status(400).json({
        success: false,
        message: 'Session ID and profile URL are required',
      });
    }

    const result = await LinkedInService.visitProfile(sessionId, url);

    res.json(result);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * GET /api/profile/views
 * Get profile views
 * Query: sessionId
 */
router.get('/views', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.query;

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required',
      });
    }

    const result = await LinkedInService.getProfileViews(sessionId);

    res.json(result);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;
