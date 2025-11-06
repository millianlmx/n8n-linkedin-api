import express from 'express';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import profileRouter from '../../src/routes/profile.routes';
import LinkedInService from '../../src/services/LinkedInService';
import SessionManager from '../../src/services/SessionManager';

jest.mock('../../src/services/LinkedInService');
jest.mock('../../src/services/SessionManager');

const app = express();
app.use(express.json());
app.use('/api/profile', profileRouter);

const mockedLinkedInService = LinkedInService as jest.Mocked<typeof LinkedInService>;
const mockedSessionManager = SessionManager as jest.Mocked<typeof SessionManager>;

const readMockHtml = (fileName: string): string => {
  return fs.readFileSync(path.join(__dirname, 'mocks', fileName), 'utf-8');
};

describe('Profile API', () => {
  const mockPage = {
    goto: jest.fn(),
    content: jest.fn(),
  };

  const mockSession = {
    id: 'session123',
    isAuthenticated: true,
    page: mockPage,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedSessionManager.getSession.mockReturnValue(mockSession as any);
  });

  describe('POST /api/profile/scrape', () => {
    it('should scrape a profile successfully', async () => {
      // Setup
      const mockProfileData = { name: 'John Doe', title: 'Software Engineer' };
      const profileUrl = 'https://www.linkedin.com/in/johndoe';
      mockedLinkedInService.scrapeProfile.mockResolvedValue({ success: true, data: mockProfileData } as any);

      // Execution
      const response = await request(app)
        .post('/api/profile/scrape')
        .send({ sessionId: 'session123', url: profileUrl });

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: mockProfileData });
      expect(mockedLinkedInService.scrapeProfile).toHaveBeenCalledWith('session123', { url: profileUrl });
    });

    it('should return a 400 error when sessionId is missing', async () => {
      // Setup - no sessionId provided

      // Execution
      const response = await request(app)
        .post('/api/profile/scrape')
        .send({ url: 'https://www.linkedin.com/in/johndoe' });

      // Assertion
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ success: false, message: 'Session ID and profile URL are required' });
    });

    it('should return a 400 error when url is missing', async () => {
      // Setup - no url provided

      // Execution
      const response = await request(app)
        .post('/api/profile/scrape')
        .send({ sessionId: 'session123' });

      // Assertion
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ success: false, message: 'Session ID and profile URL are required' });
    });

    it('should handle errors when scraping profile', async () => {
      // Setup
      mockedLinkedInService.scrapeProfile.mockRejectedValue(new Error('Profile not found'));

      // Execution
      const response = await request(app)
        .post('/api/profile/scrape')
        .send({ sessionId: 'session123', url: 'https://www.linkedin.com/in/invalid' });

      // Assertion
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ success: false, message: 'Profile not found' });
    });
  });

  describe('POST /api/profile/visit', () => {
    it('should visit a profile successfully', async () => {
      // Setup
      const profileUrl = 'https://www.linkedin.com/in/johndoe';
      mockedLinkedInService.visitProfile.mockResolvedValue({ success: true, message: 'Profile visited' } as any);

      // Execution
      const response = await request(app)
        .post('/api/profile/visit')
        .send({ sessionId: 'session123', url: profileUrl });

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, message: 'Profile visited' });
      expect(mockedLinkedInService.visitProfile).toHaveBeenCalledWith('session123', profileUrl);
    });

    it('should return a 400 error when sessionId is missing', async () => {
      // Setup - no sessionId provided

      // Execution
      const response = await request(app)
        .post('/api/profile/visit')
        .send({ url: 'https://www.linkedin.com/in/johndoe' });

      // Assertion
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ success: false, message: 'Session ID and profile URL are required' });
    });

    it('should return a 400 error when url is missing', async () => {
      // Setup - no url provided

      // Execution
      const response = await request(app)
        .post('/api/profile/visit')
        .send({ sessionId: 'session123' });

      // Assertion
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ success: false, message: 'Session ID and profile URL are required' });
    });

    it('should handle errors when visiting profile', async () => {
      // Setup
      mockedLinkedInService.visitProfile.mockRejectedValue(new Error('Failed to visit profile'));

      // Execution
      const response = await request(app)
        .post('/api/profile/visit')
        .send({ sessionId: 'session123', url: 'https://www.linkedin.com/in/johndoe' });

      // Assertion
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ success: false, message: 'Failed to visit profile' });
    });
  });

  describe('GET /api/profile/views', () => {
    it('should get profile views successfully', async () => {
      // Setup
      const mockProfileViews = { profile: { name: 'Test User' } };
      mockedLinkedInService.getProfileViews.mockResolvedValue({ success: true, data: mockProfileViews } as any);

      // Execution
      const response = await request(app)
        .get('/api/profile/views')
        .query({ sessionId: 'session123' });

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: mockProfileViews });
      expect(mockedLinkedInService.getProfileViews).toHaveBeenCalledWith('session123');
    });

    it('should return a 400 error when sessionId is missing', async () => {
      // Setup - no sessionId provided

      // Execution
      const response = await request(app)
        .get('/api/profile/views');

      // Assertion
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ success: false, message: 'Session ID is required' });
    });

    it('should handle errors when getting profile views', async () => {
      // Setup
      mockedLinkedInService.getProfileViews.mockRejectedValue(new Error('Failed to fetch profile views'));

      // Execution
      const response = await request(app)
        .get('/api/profile/views')
        .query({ sessionId: 'session123' });

      // Assertion
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ success: false, message: 'Failed to fetch profile views' });
    });
  });
});
