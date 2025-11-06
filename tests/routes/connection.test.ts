import express from 'express';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import connectionRouter from '../../src/routes/connection.routes';
import LinkedInService from '../../src/services/LinkedInService';
import SessionManager from '../../src/services/SessionManager';

jest.mock('../../src/services/LinkedInService');
jest.mock('../../src/services/SessionManager');

const app = express();
app.use(express.json());
app.use('/api/connection', connectionRouter);

const mockedLinkedInService = LinkedInService as jest.Mocked<typeof LinkedInService>;
const mockedSessionManager = SessionManager as jest.Mocked<typeof SessionManager>;

// Function to read mock HTML file
const readMockHtml = (fileName: string): string => {
  return fs.readFileSync(path.join(__dirname, 'mocks', fileName), 'utf-8');
};

describe('Connection API', () => {
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

  describe('POST /api/connection/send-request', () => {
    it('should send a connection request successfully', async () => {
      // Setup
      mockedLinkedInService.sendConnectionRequest.mockResolvedValue({ success: true, message: 'Connection request sent' } as any);

      // Execution
      const response = await request(app)
        .post('/api/connection/send-request')
        .send({ sessionId: 'session123', profileUrl: 'https://www.linkedin.com/in/test-profile' });

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, message: 'Connection request sent' });
      expect(mockedLinkedInService.sendConnectionRequest).toHaveBeenCalledWith(
        'session123',
        'https://www.linkedin.com/in/test-profile',
        undefined
      );
    });

    it('should send a connection request with a message', async () => {
      // Setup
      const message = 'I would like to connect!';
      mockedLinkedInService.sendConnectionRequest.mockResolvedValue({ success: true, message: 'Connection request sent' } as any);

      // Execution
      const response = await request(app)
        .post('/api/connection/send-request')
        .send({ sessionId: 'session123', profileUrl: 'https://www.linkedin.com/in/test-profile', message });

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, message: 'Connection request sent' });
      expect(mockedLinkedInService.sendConnectionRequest).toHaveBeenCalledWith(
        'session123',
        'https://www.linkedin.com/in/test-profile',
        message
      );
    });

    it('should return a 400 error when sessionId is missing', async () => {
      // Setup - no sessionId provided

      // Execution
      const response = await request(app)
        .post('/api/connection/send-request')
        .send({ profileUrl: 'https://www.linkedin.com/in/test-profile' });

      // Assertion
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ success: false, message: 'Session ID and profile URL are required' });
    });

    it('should return a 400 error when profileUrl is missing', async () => {
      // Setup - no profileUrl provided

      // Execution
      const response = await request(app)
        .post('/api/connection/send-request')
        .send({ sessionId: 'session123' });

      // Assertion
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ success: false, message: 'Session ID and profile URL are required' });
    });

    it('should handle errors during connection request', async () => {
      // Setup
      mockedLinkedInService.sendConnectionRequest.mockRejectedValue(new Error('Connection failed'));

      // Execution
      const response = await request(app)
        .post('/api/connection/send-request')
        .send({ sessionId: 'session123', profileUrl: 'https://www.linkedin.com/in/test-profile' });

      // Assertion
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ success: false, message: 'Connection failed' });
    });
  });
});
