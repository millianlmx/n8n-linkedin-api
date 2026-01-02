import { Router, Request, Response } from 'express';
import LinkedInService from '../services/LinkedInService';
import LinkedInBrowser from '../services/LinkedInBrowser';
import { createServiceLogger } from '../utils/logger';

const router = Router();
const log = createServiceLogger('MessageRoutes');

// Flag to control whether to use new LinkedInBrowser (should match LinkedInService)
const USE_NEW_BROWSER = true;

/**
 * Helper to check authentication status
 */
function checkAuth(sessionId?: string): { ok: boolean; error?: { status: number; message: string } } {
  if (USE_NEW_BROWSER) {
    if (!LinkedInBrowser.isReady()) {
      return { ok: false, error: { status: 503, message: 'Browser not initialized. Please call POST /api/auth/initialize first.' } };
    }
    if (!LinkedInBrowser.isAuthenticated()) {
      return { ok: false, error: { status: 401, message: 'Not authenticated. Please call POST /api/auth/login first.' } };
    }
    return { ok: true };
  }
  
  // Legacy mode
  if (!sessionId) {
    return { ok: false, error: { status: 400, message: 'Session ID is required' } };
  }
  return { ok: true };
}

/**
 * POST /api/messages/monitoring/start
 * Start message monitoring for a session
 * Body: { sessionId?: string } - sessionId is optional when using new browser system
 */
router.post('/monitoring/start', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;
    
    const authCheck = checkAuth(sessionId);
    if (!authCheck.ok) {
      return res.status(authCheck.error!.status).json({
        success: false,
        message: authCheck.error!.message,
      });
    }

    const result = await LinkedInService.startMessageMonitoring(sessionId || 'unused');
    res.json(result);
  } catch (error: any) {
    log.error('Start monitoring failed', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/messages/monitoring/stop
 * Stop message monitoring for a session
 * Body: { sessionId?: string } - sessionId is optional when using new browser system
 */
router.post('/monitoring/stop', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;

    const authCheck = checkAuth(sessionId);
    if (!authCheck.ok) {
      return res.status(authCheck.error!.status).json({
        success: false,
        message: authCheck.error!.message,
      });
    }

    const result = await LinkedInService.stopMessageMonitoring(sessionId || 'unused');
    res.json(result);
  } catch (error: any) {
    log.error('Stop monitoring failed', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * GET /api/messages/conversations
 * List all conversations
 * Query: sessionId (optional when using new browser system)
 */
router.get('/conversations', async (req: Request, res: Response) => {
  try {
    const sessionId = req.query.sessionId as string | undefined;

    const authCheck = checkAuth(sessionId);
    if (!authCheck.ok) {
      return res.status(authCheck.error!.status).json({
        success: false,
        message: authCheck.error!.message,
      });
    }

    const result = await LinkedInService.listConversations(sessionId || 'unused');

    res.json(result);
  } catch (error: any) {
    log.error('List conversations failed', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * GET /api/messages/unread
 * Get all unread/new messages
 * Query: sessionId (optional when using new browser system)
 */
router.get('/unread', async (req: Request, res: Response) => {
  try {
    const sessionId = req.query.sessionId as string | undefined;

    const authCheck = checkAuth(sessionId);
    if (!authCheck.ok) {
      return res.status(authCheck.error!.status).json({
        success: false,
        message: authCheck.error!.message,
      });
    }

    const result = await LinkedInService.getUnreadMessages(sessionId || 'unused');

    res.json(result);
  } catch (error: any) {
    log.error('Get unread messages failed', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * GET /api/messages/conversation
 * Read a specific conversation
 * Query: sessionId (optional), conversationUrl, profileUrl (optional, for caching), forceRefresh (optional, bypass cache)
 */
router.get('/conversation', async (req: Request, res: Response) => {
  try {
    const sessionId = req.query.sessionId as string | undefined;
    const { conversationUrl, profileUrl, forceRefresh } = req.query;

    const authCheck = checkAuth(sessionId);
    if (!authCheck.ok) {
      return res.status(authCheck.error!.status).json({
        success: false,
        message: authCheck.error!.message,
      });
    }

    if (!conversationUrl || typeof conversationUrl !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Conversation URL is required',
      });
    }

    // Validate conversationUrl is a proper LinkedIn messaging URL
    if (!conversationUrl.startsWith('https://www.linkedin.com/messaging/thread/') && 
        !conversationUrl.startsWith('https://linkedin.com/messaging/thread/')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid conversation URL. Must be a LinkedIn messaging thread URL',
      });
    }

    const profileUrlStr = profileUrl && typeof profileUrl === 'string' ? profileUrl : undefined;
    const forceRefreshBool = forceRefresh === 'true' || forceRefresh === '1';
    const result = await LinkedInService.readConversation(sessionId || 'unused', conversationUrl, profileUrlStr, forceRefreshBool);

    res.json(result);
  } catch (error: any) {
    log.error('Read conversation failed', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/messages/send
 * Send a message to a conversation
 * Body: { sessionId?: string, conversationUrl: string, message: string, profileUrl?: string }
 */
router.post('/send', async (req: Request, res: Response) => {
  try {
    const { sessionId, conversationUrl, message, profileUrl } = req.body;

    const authCheck = checkAuth(sessionId);
    if (!authCheck.ok) {
      return res.status(authCheck.error!.status).json({
        success: false,
        message: authCheck.error!.message,
      });
    }

    if (!conversationUrl || !message) {
      return res.status(400).json({
        success: false,
        message: 'Conversation URL and message are required',
      });
    }

    // Validate conversationUrl is a proper LinkedIn messaging URL
    if (!conversationUrl.startsWith('https://www.linkedin.com/messaging/thread/') && 
        !conversationUrl.startsWith('https://linkedin.com/messaging/thread/')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid conversation URL. Must be a LinkedIn messaging thread URL',
      });
    }

    const result = await LinkedInService.sendMessage(sessionId || 'unused', {
      conversationUrl,
      message,
      profileUrl: profileUrl && typeof profileUrl === 'string' ? profileUrl : undefined,
    });

    res.json(result);
  } catch (error: any) {
    log.error('Send message failed', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * GET /api/messages/conversation-url
 * Get conversation URL from a LinkedIn profile URL
 * Query: sessionId (optional), profileUrl
 * 
 * This endpoint:
 * 1. Checks if the user is connected (1st degree)
 * 2. If pending, waits for connection acceptance (up to 5 minutes)
 * 3. Navigates to messaging and searches for the person
 * 4. Returns the conversation URL
 */
router.get('/conversation-url', async (req: Request, res: Response) => {
  try {
    const sessionId = req.query.sessionId as string | undefined;
    const { profileUrl } = req.query;

    const authCheck = checkAuth(sessionId);
    if (!authCheck.ok) {
      return res.status(authCheck.error!.status).json({
        success: false,
        message: authCheck.error!.message,
      });
    }

    if (!profileUrl || typeof profileUrl !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Profile URL is required',
      });
    }

    const result = await LinkedInService.getConversationUrlFromProfile(sessionId || 'unused', profileUrl);

    res.json(result);
  } catch (error: any) {
    log.error('Get conversation URL failed', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;
