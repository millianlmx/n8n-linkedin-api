import { Router, Request, Response } from 'express';
import LinkedInService from '../services/LinkedInService';

const router = Router();

/**
 * POST /api/search/people
 * Search for people on LinkedIn
 * Body: { sessionId: string, keywords: string, limit?: number }
 */
router.post('/people', async (req: Request, res: Response) => {
  try {
    const { sessionId, keywords, limit } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required',
      });
    }

    if (!keywords) {
      return res.status(400).json({
        success: false,
        message: 'Keywords are required',
      });
    }

    const result = await LinkedInService.searchPeople(
      sessionId,
      keywords,
      limit || 50
    );

    res.json(result);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;
