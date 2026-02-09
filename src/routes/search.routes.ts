import { Router, Request, Response } from 'express';
import LinkedInService from '../services/LinkedInService';
import LinkedInBrowser from '../services/LinkedInBrowser';
import { createServiceLogger } from '../utils/logger';

const router = Router();
const log = createServiceLogger('SearchRoutes');

/**
 * POST /api/search/people
 * Search for people on LinkedIn
 * Body: { keywords: string, limit?: number, sessionId?: string }
 * sessionId is optional (ignored - kept for backward compatibility)
 */
router.post('/people', async (req: Request, res: Response) => {
  try {
    const { keywords, limit } = req.body;

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

    if (!keywords) {
      return res.status(400).json({
        success: false,
        message: 'Keywords are required',
      });
    }

    const result = await LinkedInService.searchPeople(
      'unused',
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

/**
 * POST /api/search/companies
 * Search for companies on LinkedIn
 * Body: { keywords: string, limit?: number, companySize?: string[], industry?: string[], location?: string[] }
 */
router.post('/companies', async (req: Request, res: Response) => {
  try {
    const { keywords, limit, companySize, industry, location } = req.body;

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

    if (!keywords) {
      return res.status(400).json({
        success: false,
        message: 'Keywords are required',
      });
    }

    const result = await LinkedInService.searchCompanies(
      'unused',
      keywords,
      limit || 10,
      companySize,
      industry,
      location
    );

    res.json(result);
  } catch (error: any) {
    log.error('Search companies failed', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;
