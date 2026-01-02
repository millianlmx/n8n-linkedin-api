// Mock dependencies BEFORE imports to prevent @2captcha/captcha-solver import errors
jest.mock('puppeteer', () => ({
  launch: jest.fn(),
}));
jest.mock('puppeteer-extra', () => ({
  use: jest.fn(),
  launch: jest.fn(),
}));
jest.mock('puppeteer-extra-plugin-stealth', () => jest.fn());
jest.mock('@2captcha/captcha-solver', () => ({
  Solver: jest.fn().mockImplementation(() => ({
    recaptcha: jest.fn(),
    hcaptcha: jest.fn(),
  })),
}));
jest.mock('../../src/services/CaptchaService', () => ({
  default: {
    solveCaptcha: jest.fn(),
  },
}));

// Mock service modules with factory functions to ensure proper mock injection
const mockLinkedInBrowser = {
  isReady: jest.fn(),
  isAuthenticated: jest.fn(),
  getOperationPage: jest.fn(),
  getMonitoringPage: jest.fn(),
  getBrowser: jest.fn(),
  setAuthenticated: jest.fn(),
  setUserIdentifier: jest.fn(),
  initialize: jest.fn(),
  saveState: jest.fn(),
  getOrCreateMonitoringPage: jest.fn(),
  focusOperationPage: jest.fn(),
  focusMonitoringPage: jest.fn(),
  getLinkedInCookies: jest.fn(),
  closeMonitoringPage: jest.fn(),
  getStatus: jest.fn(),
  close: jest.fn(),
  clearBrowserState: jest.fn(),
};

const mockBrowserStateService = {
  hasBrowserState: jest.fn(),
  restoreBrowserState: jest.fn(),
  saveBrowserState: jest.fn(),
  verifySession: jest.fn(),
  deleteBrowserState: jest.fn(),
};

jest.mock('../../src/services/LinkedInService');
jest.mock('../../src/services/SessionManager');
jest.mock('../../src/services/LinkedInBrowser', () => ({
  default: mockLinkedInBrowser,
  __esModule: true,
}));
jest.mock('../../src/services/BrowserStateService', () => ({
  default: mockBrowserStateService,
  __esModule: true,
}));
jest.mock('../../src/services/CacheService');

import express from 'express';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import messageRouter from '../../src/routes/message.routes';
import LinkedInService from '../../src/services/LinkedInService';
import SessionManager from '../../src/services/SessionManager';

const app = express();
app.use(express.json());
app.use('/api/messages', messageRouter);

const mockedLinkedInService = LinkedInService as jest.Mocked<typeof LinkedInService>;
const mockedSessionManager = SessionManager as jest.Mocked<typeof SessionManager>;
// Use the module-level mock objects directly
const mockedLinkedInBrowser = mockLinkedInBrowser as {
  isReady: jest.Mock;
  isAuthenticated: jest.Mock;
  getOperationPage: jest.Mock;
  getMonitoringPage: jest.Mock;
  getBrowser: jest.Mock;
  setAuthenticated: jest.Mock;
  setUserIdentifier: jest.Mock;
  initialize: jest.Mock;
  saveState: jest.Mock;
  getOrCreateMonitoringPage: jest.Mock;
  focusOperationPage: jest.Mock;
  focusMonitoringPage: jest.Mock;
  getLinkedInCookies: jest.Mock;
  closeMonitoringPage: jest.Mock;
  getStatus: jest.Mock;
  close: jest.Mock;
  clearBrowserState: jest.Mock;
};

const readMockHtml = (fileName: string): string => {
  return fs.readFileSync(path.join(__dirname, 'mocks', fileName), 'utf-8');
};

describe('Messaging API', () => {
  const mockPage = {
    goto: jest.fn(),
    content: jest.fn(),
    click: jest.fn(),
    waitForSelector: jest.fn(),
    type: jest.fn(),
  };

  const mockSession = {
    id: 'session123',
    isAuthenticated: true,
    browser: {},
    page: mockPage,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedSessionManager.getSession.mockReturnValue(mockSession as any);
    
    // Default mock setup for LinkedInBrowser (new system)
    mockedLinkedInBrowser.isReady.mockReturnValue(true);
    mockedLinkedInBrowser.isAuthenticated.mockReturnValue(true);
    mockedLinkedInBrowser.getOperationPage.mockReturnValue(mockPage as any);
  });

  describe('GET /api/messages/conversations', () => {
    it('should list all conversations with sessionId (legacy)', async () => {
      // Setup
      const mockConversations = [{ name: 'Test User', url: 'https://linkedin.com/messaging/thread/123' }];
      mockedLinkedInService.listConversations.mockResolvedValue({ success: true, data: mockConversations } as any);

      // Execution
      const response = await request(app)
        .get('/api/messages/conversations')
        .query({ sessionId: 'session123' });

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: mockConversations });
      expect(mockedLinkedInService.listConversations).toHaveBeenCalledWith('session123');
    });

    it('should list all conversations without sessionId (new system)', async () => {
      // Setup
      const mockConversations = [{ name: 'Test User', url: 'https://linkedin.com/messaging/thread/123' }];
      mockedLinkedInService.listConversations.mockResolvedValue({ success: true, data: mockConversations } as any);

      // Execution
      const response = await request(app)
        .get('/api/messages/conversations');

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: mockConversations });
    });

    it('should return 503 when browser not ready and no sessionId (new system)', async () => {
      // Setup
      mockedLinkedInBrowser.isReady.mockReturnValue(false);

      // Execution
      const response = await request(app)
        .get('/api/messages/conversations');

      // Assertion
      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({
        success: false,
        message: 'Browser not initialized. Please call POST /api/auth/initialize first.',
      });
    });

    it('should handle errors when listing conversations', async () => {
      // Setup
      mockedLinkedInService.listConversations.mockRejectedValue(new Error('Failed to fetch conversations'));

      // Execution
      const response = await request(app)
        .get('/api/messages/conversations')
        .query({ sessionId: 'session123' });

      // Assertion
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ success: false, message: 'Failed to fetch conversations' });
    });
  });

  describe('GET /api/messages/conversation', () => {
    it('should read messages from a conversation with sessionId (legacy)', async () => {
      // Setup
      const mockMessages = [{ sender: 'Test User', message: 'Hello!', timestamp: '2023-01-01' }];
      const conversationUrl = 'https://linkedin.com/messaging/thread/123';
      mockedLinkedInService.readConversation.mockResolvedValue({ success: true, data: mockMessages } as any);

      // Execution
      const response = await request(app)
        .get('/api/messages/conversation')
        .query({ sessionId: 'session123', conversationUrl });

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: mockMessages });
      expect(mockedLinkedInService.readConversation).toHaveBeenCalledWith('session123', conversationUrl, undefined, false);
    });

    it('should read messages from a conversation without sessionId (new system)', async () => {
      // Setup
      const mockMessages = [{ sender: 'Test User', message: 'Hello!', timestamp: '2023-01-01' }];
      const conversationUrl = 'https://linkedin.com/messaging/thread/123';
      mockedLinkedInService.readConversation.mockResolvedValue({ success: true, data: mockMessages } as any);

      // Execution
      const response = await request(app)
        .get('/api/messages/conversation')
        .query({ conversationUrl });

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: mockMessages });
    });

    it('should read messages from a conversation with profileUrl for caching', async () => {
      // Setup
      const mockMessages = [{ sender: 'Test User', message: 'Hello!', timestamp: '2023-01-01' }];
      const conversationUrl = 'https://linkedin.com/messaging/thread/123';
      const profileUrl = 'https://www.linkedin.com/in/test-user/';
      mockedLinkedInService.readConversation.mockResolvedValue({ success: true, data: mockMessages, cached: false, cacheUpdated: true } as any);

      // Execution
      const response = await request(app)
        .get('/api/messages/conversation')
        .query({ sessionId: 'session123', conversationUrl, profileUrl });

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: mockMessages, cached: false, cacheUpdated: true });
      expect(mockedLinkedInService.readConversation).toHaveBeenCalledWith('session123', conversationUrl, profileUrl, false);
    });

    it('should return cached conversation when available', async () => {
      // Setup
      const mockMessages = [{ sender: 'Test User', message: 'Hello!', timestamp: '2023-01-01' }];
      const conversationUrl = 'https://linkedin.com/messaging/thread/123';
      const profileUrl = 'https://www.linkedin.com/in/test-user/';
      mockedLinkedInService.readConversation.mockResolvedValue({ success: true, data: mockMessages, cached: true, cacheUpdated: false } as any);

      // Execution
      const response = await request(app)
        .get('/api/messages/conversation')
        .query({ sessionId: 'session123', conversationUrl, profileUrl });

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: mockMessages, cached: true, cacheUpdated: false });
      expect(mockedLinkedInService.readConversation).toHaveBeenCalledWith('session123', conversationUrl, profileUrl, false);
    });

    it('should force refresh and bypass cache when forceRefresh is true', async () => {
      // Setup
      const mockMessages = [{ sender: 'Test User', message: 'Fresh data!', timestamp: '2023-01-02' }];
      const conversationUrl = 'https://linkedin.com/messaging/thread/123';
      const profileUrl = 'https://www.linkedin.com/in/test-user/';
      mockedLinkedInService.readConversation.mockResolvedValue({ success: true, data: mockMessages, cached: false, cacheUpdated: true } as any);

      // Execution
      const response = await request(app)
        .get('/api/messages/conversation')
        .query({ sessionId: 'session123', conversationUrl, profileUrl, forceRefresh: 'true' });

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: mockMessages, cached: false, cacheUpdated: true });
      expect(mockedLinkedInService.readConversation).toHaveBeenCalledWith('session123', conversationUrl, profileUrl, true);
    });

    it('should force refresh with forceRefresh=1', async () => {
      // Setup
      const mockMessages = [{ sender: 'Test User', message: 'Fresh data!', timestamp: '2023-01-02' }];
      const conversationUrl = 'https://linkedin.com/messaging/thread/123';
      const profileUrl = 'https://www.linkedin.com/in/test-user/';
      mockedLinkedInService.readConversation.mockResolvedValue({ success: true, data: mockMessages, cached: false, cacheUpdated: true } as any);

      // Execution
      const response = await request(app)
        .get('/api/messages/conversation')
        .query({ sessionId: 'session123', conversationUrl, profileUrl, forceRefresh: '1' });

      // Assertion
      expect(response.status).toBe(200);
      expect(mockedLinkedInService.readConversation).toHaveBeenCalledWith('session123', conversationUrl, profileUrl, true);
    });

    it('should return cacheUpdated=false when force refresh finds no changes', async () => {
      // Setup
      const mockMessages = [{ sender: 'Test User', message: 'Same data', timestamp: '2023-01-01' }];
      const conversationUrl = 'https://linkedin.com/messaging/thread/123';
      const profileUrl = 'https://www.linkedin.com/in/test-user/';
      // Simulate no changes detected
      mockedLinkedInService.readConversation.mockResolvedValue({ success: true, data: mockMessages, cached: false, cacheUpdated: false } as any);

      // Execution
      const response = await request(app)
        .get('/api/messages/conversation')
        .query({ sessionId: 'session123', conversationUrl, profileUrl, forceRefresh: 'true' });

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: mockMessages, cached: false, cacheUpdated: false });
      expect(response.body.cacheUpdated).toBe(false);
    });

    it('should return 503 when browser not ready and no sessionId (new system)', async () => {
      // Setup
      mockedLinkedInBrowser.isReady.mockReturnValue(false);

      // Execution
      const response = await request(app)
        .get('/api/messages/conversation')
        .query({ conversationUrl: 'https://linkedin.com/messaging/thread/123' });

      // Assertion
      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({
        success: false,
        message: 'Browser not initialized. Please call POST /api/auth/initialize first.',
      });
    });

    it('should return a 400 error when conversationUrl is missing', async () => {
      // Setup - no conversationUrl provided

      // Execution
      const response = await request(app)
        .get('/api/messages/conversation')
        .query({ sessionId: 'session123' });

      // Assertion
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ success: false, message: 'Conversation URL is required' });
    });

    it('should return a 400 error when conversationUrl is invalid', async () => {
      // Setup - invalid conversationUrl

      // Execution
      const response = await request(app)
        .get('/api/messages/conversation')
        .query({ sessionId: 'session123', conversationUrl: 'invalid-url' });

      // Assertion
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ success: false, message: 'Invalid conversation URL. Must be a LinkedIn messaging thread URL' });
    });

    it('should handle errors when reading conversation', async () => {
      // Setup
      mockedLinkedInService.readConversation.mockRejectedValue(new Error('Conversation not found'));

      // Execution
      const response = await request(app)
        .get('/api/messages/conversation')
        .query({ sessionId: 'session123', conversationUrl: 'https://linkedin.com/messaging/thread/123' });

      // Assertion
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ success: false, message: 'Conversation not found' });
    });
  });

  describe('POST /api/messages/send', () => {
    it('should send a message to a conversation with sessionId (legacy)', async () => {
      // Setup
      const messageData = {
        sessionId: 'session123',
        conversationUrl: 'https://linkedin.com/messaging/thread/123',
        message: 'Test message'
      };
      mockedLinkedInService.sendMessage.mockResolvedValue({ success: true, message: 'Message sent' } as any);

      // Execution
      const response = await request(app)
        .post('/api/messages/send')
        .send(messageData);

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, message: 'Message sent' });
      expect(mockedLinkedInService.sendMessage).toHaveBeenCalledWith('session123', {
        conversationUrl: messageData.conversationUrl,
        message: messageData.message
      });
    });

    it('should send a message to a conversation without sessionId (new system)', async () => {
      // Setup
      const messageData = {
        conversationUrl: 'https://linkedin.com/messaging/thread/123',
        message: 'Test message'
      };
      mockedLinkedInService.sendMessage.mockResolvedValue({ success: true, message: 'Message sent' } as any);

      // Execution
      const response = await request(app)
        .post('/api/messages/send')
        .send(messageData);

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, message: 'Message sent' });
    });

    it('should return 503 when browser not ready and no sessionId (new system)', async () => {
      // Setup
      mockedLinkedInBrowser.isReady.mockReturnValue(false);

      // Execution
      const response = await request(app)
        .post('/api/messages/send')
        .send({ conversationUrl: 'https://linkedin.com/messaging/thread/123', message: 'Test' });

      // Assertion
      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({
        success: false,
        message: 'Browser not initialized. Please call POST /api/auth/initialize first.',
      });
    });

    it('should return a 400 error when conversationUrl is missing', async () => {
      // Setup - no conversationUrl provided

      // Execution
      const response = await request(app)
        .post('/api/messages/send')
        .send({ sessionId: 'session123', message: 'Test' });

      // Assertion
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ success: false, message: 'Conversation URL and message are required' });
    });

    it('should return a 400 error when message is missing', async () => {
      // Setup - no message provided

      // Execution
      const response = await request(app)
        .post('/api/messages/send')
        .send({ sessionId: 'session123', conversationUrl: 'https://linkedin.com/messaging/thread/123' });

      // Assertion
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ success: false, message: 'Conversation URL and message are required' });
    });

    it('should return a 400 error when conversationUrl is invalid', async () => {
      // Setup - invalid conversationUrl

      // Execution
      const response = await request(app)
        .post('/api/messages/send')
        .send({ sessionId: 'session123', conversationUrl: 'invalid-url', message: 'Test' });

      // Assertion
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ success: false, message: 'Invalid conversation URL. Must be a LinkedIn messaging thread URL' });
    });

    it('should handle errors when sending message', async () => {
      // Setup
      mockedLinkedInService.sendMessage.mockRejectedValue(new Error('Failed to send message'));

      // Execution
      const response = await request(app)
        .post('/api/messages/send')
        .send({ sessionId: 'session123', conversationUrl: 'https://linkedin.com/messaging/thread/123', message: 'Test' });

      // Assertion
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ success: false, message: 'Failed to send message' });
    });
  });

  describe('GET /api/messages/unread', () => {
    it('should get unread messages with sessionId (legacy)', async () => {
      // Setup
      const mockUnreadMessages = [{ sender: 'User1', message: 'New message' }];
      mockedLinkedInService.getUnreadMessages.mockResolvedValue({ success: true, data: mockUnreadMessages } as any);

      // Execution
      const response = await request(app)
        .get('/api/messages/unread')
        .query({ sessionId: 'session123' });

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: mockUnreadMessages });
      expect(mockedLinkedInService.getUnreadMessages).toHaveBeenCalledWith('session123');
    });

    it('should get unread messages without sessionId (new system)', async () => {
      // Setup
      const mockUnreadMessages = [{ sender: 'User1', message: 'New message' }];
      mockedLinkedInService.getUnreadMessages.mockResolvedValue({ success: true, data: mockUnreadMessages } as any);

      // Execution
      const response = await request(app)
        .get('/api/messages/unread');

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: mockUnreadMessages });
    });

    it('should return 503 when browser not ready and no sessionId (new system)', async () => {
      // Setup
      mockedLinkedInBrowser.isReady.mockReturnValue(false);

      // Execution
      const response = await request(app)
        .get('/api/messages/unread');

      // Assertion
      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({
        success: false,
        message: 'Browser not initialized. Please call POST /api/auth/initialize first.',
      });
    });

    it('should handle errors when getting unread messages', async () => {
      // Setup
      mockedLinkedInService.getUnreadMessages.mockRejectedValue(new Error('Failed to fetch unread messages'));

      // Execution
      const response = await request(app)
        .get('/api/messages/unread')
        .query({ sessionId: 'session123' });

      // Assertion
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ success: false, message: 'Failed to fetch unread messages' });
    });
  });
});
