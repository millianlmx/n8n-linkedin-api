import express from 'express';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import messageRouter from '../../src/routes/message.routes';
import LinkedInService from '../../src/services/LinkedInService';
import SessionManager from '../../src/services/SessionManager';

jest.mock('../../src/services/LinkedInService');
jest.mock('../../src/services/SessionManager');
jest.mock('../../src/services/CacheService');

const app = express();
app.use(express.json());
app.use('/api/messages', messageRouter);

const mockedLinkedInService = LinkedInService as jest.Mocked<typeof LinkedInService>;
const mockedSessionManager = SessionManager as jest.Mocked<typeof SessionManager>;

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
  });

  describe('GET /api/messages/conversations', () => {
    it('should list all conversations', async () => {
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

    it('should return a 400 error when sessionId is missing', async () => {
      // Setup - no sessionId provided

      // Execution
      const response = await request(app)
        .get('/api/messages/conversations');

      // Assertion
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ success: false, message: 'Session ID is required' });
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
    it('should read messages from a conversation', async () => {
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

    it('should read messages from a conversation with profileUrl for caching', async () => {
      // Setup
      const mockMessages = [{ sender: 'Test User', message: 'Hello!', timestamp: '2023-01-01' }];
      const conversationUrl = 'https://linkedin.com/messaging/thread/123';
      const profileUrl = 'https://www.linkedin.com/in/test-user/';
      mockedLinkedInService.readConversation.mockResolvedValue({ success: true, data: mockMessages, cached: false } as any);

      // Execution
      const response = await request(app)
        .get('/api/messages/conversation')
        .query({ sessionId: 'session123', conversationUrl, profileUrl });

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: mockMessages, cached: false });
      expect(mockedLinkedInService.readConversation).toHaveBeenCalledWith('session123', conversationUrl, profileUrl, false);
    });

    it('should return cached conversation when available', async () => {
      // Setup
      const mockMessages = [{ sender: 'Test User', message: 'Hello!', timestamp: '2023-01-01' }];
      const conversationUrl = 'https://linkedin.com/messaging/thread/123';
      const profileUrl = 'https://www.linkedin.com/in/test-user/';
      mockedLinkedInService.readConversation.mockResolvedValue({ success: true, data: mockMessages, cached: true } as any);

      // Execution
      const response = await request(app)
        .get('/api/messages/conversation')
        .query({ sessionId: 'session123', conversationUrl, profileUrl });

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: mockMessages, cached: true });
      expect(response.body.cached).toBe(true);
    });

    it('should force refresh and bypass cache when forceRefresh is true', async () => {
      // Setup
      const mockMessages = [{ sender: 'Test User', message: 'Fresh data!', timestamp: '2023-01-02' }];
      const conversationUrl = 'https://linkedin.com/messaging/thread/123';
      const profileUrl = 'https://www.linkedin.com/in/test-user/';
      mockedLinkedInService.readConversation.mockResolvedValue({ success: true, data: mockMessages, cached: false } as any);

      // Execution
      const response = await request(app)
        .get('/api/messages/conversation')
        .query({ sessionId: 'session123', conversationUrl, profileUrl, forceRefresh: 'true' });

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: mockMessages, cached: false });
      expect(mockedLinkedInService.readConversation).toHaveBeenCalledWith('session123', conversationUrl, profileUrl, true);
    });

    it('should force refresh with forceRefresh=1', async () => {
      // Setup
      const mockMessages = [{ sender: 'Test User', message: 'Fresh data!', timestamp: '2023-01-02' }];
      const conversationUrl = 'https://linkedin.com/messaging/thread/123';
      const profileUrl = 'https://www.linkedin.com/in/test-user/';
      mockedLinkedInService.readConversation.mockResolvedValue({ success: true, data: mockMessages, cached: false } as any);

      // Execution
      const response = await request(app)
        .get('/api/messages/conversation')
        .query({ sessionId: 'session123', conversationUrl, profileUrl, forceRefresh: '1' });

      // Assertion
      expect(response.status).toBe(200);
      expect(mockedLinkedInService.readConversation).toHaveBeenCalledWith('session123', conversationUrl, profileUrl, true);
    });

    it('should return a 400 error when sessionId is missing', async () => {
      // Setup - no sessionId provided

      // Execution
      const response = await request(app)
        .get('/api/messages/conversation')
        .query({ conversationUrl: 'https://linkedin.com/messaging/thread/123' });

      // Assertion
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ success: false, message: 'Session ID is required' });
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
    it('should send a message to a conversation', async () => {
      // Setup
      const messageData = {
        sessionId: 'session123',
        conversationId: 'https://linkedin.com/messaging/thread/123',
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
        conversationId: messageData.conversationId,
        message: messageData.message
      });
    });

    it('should return a 400 error when sessionId is missing', async () => {
      // Setup - no sessionId provided

      // Execution
      const response = await request(app)
        .post('/api/messages/send')
        .send({ conversationId: 'thread123', message: 'Test' });

      // Assertion
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ success: false, message: 'Session ID, conversation ID, and message are required' });
    });

    it('should return a 400 error when conversationId is missing', async () => {
      // Setup - no conversationId provided

      // Execution
      const response = await request(app)
        .post('/api/messages/send')
        .send({ sessionId: 'session123', message: 'Test' });

      // Assertion
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ success: false, message: 'Session ID, conversation ID, and message are required' });
    });

    it('should return a 400 error when message is missing', async () => {
      // Setup - no message provided

      // Execution
      const response = await request(app)
        .post('/api/messages/send')
        .send({ sessionId: 'session123', conversationId: 'thread123' });

      // Assertion
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ success: false, message: 'Session ID, conversation ID, and message are required' });
    });

    it('should handle errors when sending message', async () => {
      // Setup
      mockedLinkedInService.sendMessage.mockRejectedValue(new Error('Failed to send message'));

      // Execution
      const response = await request(app)
        .post('/api/messages/send')
        .send({ sessionId: 'session123', conversationId: 'thread123', message: 'Test' });

      // Assertion
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ success: false, message: 'Failed to send message' });
    });
  });

  describe('GET /api/messages/unread', () => {
    it('should get unread messages', async () => {
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

    it('should return a 400 error when sessionId is missing', async () => {
      // Setup - no sessionId provided

      // Execution
      const response = await request(app)
        .get('/api/messages/unread');

      // Assertion
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ success: false, message: 'Session ID is required' });
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
