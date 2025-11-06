import { Router, Request, Response } from 'express';
import LinkedInService from '../services/LinkedInService';

const router = Router();

/**
 * POST /api/connection/send-request
 * Send a connection request to a LinkedIn profile
 * Body: { sessionId: string, profileUrl: string, message?: string }
 */
router.post('/send-request', async (req: Request, res: Response) => {
  try {
    const { sessionId, profileUrl, message } = req.body;

    if (!sessionId || !profileUrl) {
      return res.status(400).json({
        success: false,
        message: 'Session ID and profile URL are required',
      });
    }

    const result = await LinkedInService.sendConnectionRequest(sessionId, profileUrl, message);

    res.json(result);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;
