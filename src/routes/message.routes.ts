import { Router, Request, Response } from 'express';
import LinkedInService from '../services/LinkedInService';

const router = Router();

/**
 * POST /api/messages/monitoring/start
 * Start message monitoring for a session
 * Body: { sessionId: string }
 */
router.post('/monitoring/start', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required',
      });
    }

    const result = await LinkedInService.startMessageMonitoring(sessionId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/messages/monitoring/stop
 * Stop message monitoring for a session
 * Body: { sessionId: string }
 */
router.post('/monitoring/stop', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required',
      });
    }

    const result = await LinkedInService.stopMessageMonitoring(sessionId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * GET /api/messages/conversations
 * List all conversations
 * Query: sessionId
 */
router.get('/conversations', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.query;

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required',
      });
    }

    const result = await LinkedInService.listConversations(sessionId);

    res.json(result);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * GET /api/messages/unread
 * Get all unread/new messages
 * Query: sessionId
 */
router.get('/unread', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.query;

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required',
      });
    }

    const result = await LinkedInService.getUnreadMessages(sessionId);

    res.json(result);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * GET /api/messages/conversation
 * Read a specific conversation
 * Query: sessionId, conversationUrl, profileUrl (optional, for caching), forceRefresh (optional, bypass cache)
 */
router.get('/conversation', async (req: Request, res: Response) => {
  try {
    const { sessionId, conversationUrl, profileUrl, forceRefresh } = req.query;

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required',
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
    const result = await LinkedInService.readConversation(sessionId, conversationUrl, profileUrlStr, forceRefreshBool);

    res.json(result);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * POST /api/messages/send
 * Send a message to a conversation
 * Body: { sessionId: string, conversationUrl: string, message: string }
 */
router.post('/send', async (req: Request, res: Response) => {
  try {
    const { sessionId, conversationUrl, message } = req.body;

    if (!sessionId || !conversationUrl || !message) {
      return res.status(400).json({
        success: false,
        message: 'Session ID, conversation URL, and message are required',
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

    const result = await LinkedInService.sendMessage(sessionId, {
      conversationUrl,
      message,
    });

    res.json(result);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * GET /api/messages/conversation-url
 * Get conversation URL from a LinkedIn profile URL
 * Query: sessionId, profileUrl
 * 
 * This endpoint:
 * 1. Checks if the user is connected (1st degree)
 * 2. If pending, waits for connection acceptance (up to 5 minutes)
 * 3. Navigates to messaging and searches for the person
 * 4. Returns the conversation URL
 */
router.get('/conversation-url', async (req: Request, res: Response) => {
  try {
    const { sessionId, profileUrl } = req.query;

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required',
      });
    }

    if (!profileUrl || typeof profileUrl !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Profile URL is required',
      });
    }

    const result = await LinkedInService.getConversationUrlFromProfile(sessionId, profileUrl);

    res.json(result);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;
