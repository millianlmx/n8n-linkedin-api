import express from 'express';
import request from 'supertest';
import searchRouter from '../../src/routes/search.routes';
import LinkedInService from '../../src/services/LinkedInService';
import SessionManager from '../../src/services/SessionManager';

jest.mock('../../src/services/LinkedInService');
jest.mock('../../src/services/SessionManager');

const app = express();
app.use(express.json());
app.use('/api/search', searchRouter);

const mockedLinkedInService = LinkedInService as jest.Mocked<typeof LinkedInService>;
const mockedSessionManager = SessionManager as jest.Mocked<typeof SessionManager>;

describe('Search API', () => {
  const mockSession = {
    id: 'session123',
    isAuthenticated: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedSessionManager.getSession.mockReturnValue(mockSession as any);
  });

  describe('POST /api/search/people', () => {
    it('should search for people by keywords', async () => {
      // Setup
      const mockSearchResults = [{ name: 'John Doe', url: 'https://linkedin.com/in/johndoe' }];
      const keywords = 'Software Engineer';
      const limit = 10;
      mockedLinkedInService.searchPeople.mockResolvedValue({ success: true, data: mockSearchResults } as any);

      // Execution
      const response = await request(app)
        .post('/api/search/people')
        .send({ sessionId: 'session123', keywords, limit });

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: mockSearchResults });
      expect(mockedLinkedInService.searchPeople).toHaveBeenCalledWith('session123', keywords, limit);
    });

    it('should respect the limit parameter', async () => {
      // Setup
      const mockSearchResults = [{ name: 'John Doe' }, { name: 'Jane Doe' }];
      const keywords = 'Engineer';
      const limit = 2;
      mockedLinkedInService.searchPeople.mockResolvedValue({ success: true, data: mockSearchResults } as any);

      // Execution
      const response = await request(app)
        .post('/api/search/people')
        .send({ sessionId: 'session123', keywords, limit });

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body.data.length).toBe(2);
      expect(mockedLinkedInService.searchPeople).toHaveBeenCalledWith('session123', keywords, limit);
    });

    it('should use default limit of 50 when not provided', async () => {
      // Setup
      const mockSearchResults = [{ name: 'John Doe' }];
      const keywords = 'Developer';
      mockedLinkedInService.searchPeople.mockResolvedValue({ success: true, data: mockSearchResults } as any);

      // Execution
      const response = await request(app)
        .post('/api/search/people')
        .send({ sessionId: 'session123', keywords });

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: mockSearchResults });
      expect(mockedLinkedInService.searchPeople).toHaveBeenCalledWith('session123', keywords, 50);
    });

    it('should return a 400 error when sessionId is missing', async () => {
      // Setup - no sessionId provided

      // Execution
      const response = await request(app)
        .post('/api/search/people')
        .send({ keywords: 'Engineer' });

      // Assertion
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ success: false, message: 'Session ID is required' });
    });

    it('should return a 400 error when keywords are missing', async () => {
      // Setup - no keywords provided

      // Execution
      const response = await request(app)
        .post('/api/search/people')
        .send({ sessionId: 'session123' });

      // Assertion
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ success: false, message: 'Keywords are required' });
    });

    it('should handle errors during search', async () => {
      // Setup
      mockedLinkedInService.searchPeople.mockRejectedValue(new Error('Search failed'));

      // Execution
      const response = await request(app)
        .post('/api/search/people')
        .send({ sessionId: 'session123', keywords: 'Engineer' });

      // Assertion
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ success: false, message: 'Search failed' });
    });
  });
});
