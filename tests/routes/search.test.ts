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
import searchRouter from '../../src/routes/search.routes';
import LinkedInService from '../../src/services/LinkedInService';
import SessionManager from '../../src/services/SessionManager';

const app = express();
app.use(express.json());
app.use('/api/search', searchRouter);

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

describe('Search API', () => {
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

  describe('POST /api/search/people', () => {
    it('should search for people by keywords with sessionId (legacy)', async () => {
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

    it('should search for people by keywords without sessionId (new system)', async () => {
      // Setup
      const mockSearchResults = [{ name: 'John Doe', url: 'https://linkedin.com/in/johndoe' }];
      const keywords = 'Software Engineer';
      const limit = 10;
      mockedLinkedInService.searchPeople.mockResolvedValue({ success: true, data: mockSearchResults } as any);

      // Execution
      const response = await request(app)
        .post('/api/search/people')
        .send({ keywords, limit });

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: mockSearchResults });
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

    it('should return 503 when browser not ready and no sessionId (new system)', async () => {
      // Setup
      mockedLinkedInBrowser.isReady.mockReturnValue(false);

      // Execution
      const response = await request(app)
        .post('/api/search/people')
        .send({ keywords: 'Engineer' });

      // Assertion
      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({
        success: false,
        message: 'Browser not initialized. Please call POST /api/auth/initialize first.',
      });
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
