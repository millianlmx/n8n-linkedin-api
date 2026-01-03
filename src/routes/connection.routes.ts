import { Router, Request, Response } from 'express';
import LinkedInService from '../services/LinkedInService';
import LinkedInBrowser from '../services/LinkedInBrowser';
import { createServiceLogger } from '../utils/logger';

const router = Router();
const log = createServiceLogger('ConnectionRoutes');

/**
 * POST /api/connection/send-request
 * Send a connection request to a LinkedIn profile
 * Body: { profileUrl: string, message?: string, sessionId?: string }
 * sessionId is optional (ignored - kept for backward compatibility)
 */
router.post('/send-request', async (req: Request, res: Response) => {
  try {
    const { profileUrl, message } = req.body;

    // Check authentication
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

    if (!profileUrl) {
      return res.status(400).json({
        success: false,
        message: 'Profile URL is required',
      });
    }

    const result = await LinkedInService.sendConnectionRequest('unused', profileUrl, message);

    res.json(result);
  } catch (error: any) {
    log.error('Send connection request failed', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;
