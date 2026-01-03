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
import profileRouter from '../../src/routes/profile.routes';
import LinkedInService from '../../src/services/LinkedInService';
import SessionManager from '../../src/services/SessionManager';

const app = express();
app.use(express.json());
app.use('/api/profile', profileRouter);

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

describe('Profile API', () => {
  const mockPage = {
    goto: jest.fn(),
    content: jest.fn(),
  };

  // Use a valid UUID for the session ID
  const validSessionId = '550e8400-e29b-41d4-a716-446655440000';

  const mockSession = {
    id: validSessionId,
    isAuthenticated: true,
    page: mockPage,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedSessionManager.getSession.mockReturnValue(mockSession as any);
    mockedSessionManager.getAllSessions.mockReturnValue([mockSession] as any);
    
    // Default mock setup for LinkedInBrowser (new system)
    mockedLinkedInBrowser.isReady.mockReturnValue(true);
    mockedLinkedInBrowser.isAuthenticated.mockReturnValue(true);
    mockedLinkedInBrowser.getOperationPage.mockReturnValue(mockPage as any);
  });

  describe('POST /api/profile/scrape', () => {
    it('should scrape a profile successfully (new browser system - sessionId ignored)', async () => {
      // Setup
      const mockProfileData = { name: 'John Doe', title: 'Software Engineer' };
      const profileUrl = 'https://www.linkedin.com/in/johndoe';
      mockedLinkedInService.scrapeProfile.mockResolvedValue({ success: true, data: mockProfileData } as any);

      // Execution - even with sessionId, the new browser system is used
      const response = await request(app)
        .post('/api/profile/scrape')
        .send({ sessionId: validSessionId, url: profileUrl });

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: mockProfileData });
      // Note: With USE_NEW_BROWSER=true, scrapeProfile is called with 'unused' as sessionId
      expect(mockedLinkedInService.scrapeProfile).toHaveBeenCalledWith('unused', { url: profileUrl });
    });

    it('should scrape a profile successfully without sessionId (new system)', async () => {
      // Setup
      const mockProfileData = { name: 'John Doe', title: 'Software Engineer' };
      const profileUrl = 'https://www.linkedin.com/in/johndoe';
      mockedLinkedInService.scrapeProfile.mockResolvedValue({ success: true, data: mockProfileData } as any);

      // Execution
      const response = await request(app)
        .post('/api/profile/scrape')
        .send({ url: profileUrl });

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: mockProfileData });
    });

    it('should return 503 when browser not ready and no sessionId (new system)', async () => {
      // Setup
      mockedLinkedInBrowser.isReady.mockReturnValue(false);

      // Execution
      const response = await request(app)
        .post('/api/profile/scrape')
        .send({ url: 'https://www.linkedin.com/in/johndoe' });

      // Assertion
      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({
        success: false,
        message: 'Browser not initialized. Please call POST /api/auth/initialize first.',
      });
    });

    it('should return a 400 error when url is missing', async () => {
      // Setup - no url provided

      // Execution
      const response = await request(app)
        .post('/api/profile/scrape')
        .send({ sessionId: validSessionId });

      // Assertion
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ success: false, message: 'Profile URL is required' });
    });

    it('should handle errors when scraping profile', async () => {
      // Setup
      mockedLinkedInService.scrapeProfile.mockRejectedValue(new Error('Profile not found'));

      // Execution
      const response = await request(app)
        .post('/api/profile/scrape')
        .send({ sessionId: validSessionId, url: 'https://www.linkedin.com/in/invalid' });

      // Assertion
      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({ success: false, message: 'Profile not found' });
    });
  });

  describe('POST /api/profile/visit', () => {
    // Note: The /visit endpoint now uses singleton browser (sessionId is ignored)
    it('should visit a profile successfully with sessionId (backward compat)', async () => {
      // Setup
      const profileUrl = 'https://www.linkedin.com/in/johndoe';
      mockedLinkedInService.visitProfile.mockResolvedValue({ success: true, message: 'Profile visited' } as any);

      // Execution - sessionId is accepted but ignored (singleton browser)
      const response = await request(app)
        .post('/api/profile/visit')
        .send({ sessionId: validSessionId, url: profileUrl });

      // Assertion - sessionId is ignored, 'unused' is passed to service
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, message: 'Profile visited' });
      expect(mockedLinkedInService.visitProfile).toHaveBeenCalledWith('unused', profileUrl);
    });

    it('should visit a profile without sessionId (new system)', async () => {
      // Setup
      const profileUrl = 'https://www.linkedin.com/in/johndoe';
      mockedLinkedInService.visitProfile.mockResolvedValue({ success: true, message: 'Profile visited' } as any);

      // Execution
      const response = await request(app)
        .post('/api/profile/visit')
        .send({ url: profileUrl });

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, message: 'Profile visited' });
      expect(mockedLinkedInService.visitProfile).toHaveBeenCalledWith('unused', profileUrl);
    });

    it('should return a 400 error when url is missing', async () => {
      // Setup - no url provided

      // Execution
      const response = await request(app)
        .post('/api/profile/visit')
        .send({ sessionId: validSessionId });

      // Assertion
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('URL must be a valid string');
    });

    it('should handle errors when visiting profile', async () => {
      // Setup
      mockedLinkedInService.visitProfile.mockRejectedValue(new Error('Failed to visit profile'));

      // Execution
      const response = await request(app)
        .post('/api/profile/visit')
        .send({ sessionId: validSessionId, url: 'https://www.linkedin.com/in/johndoe' });

      // Assertion
      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({ success: false, message: 'Failed to visit profile' });
    });
  });

  describe('GET /api/profile/views', () => {
    it('should get profile views successfully with sessionId (backward compat)', async () => {
      // Setup
      const mockProfileViews = { profile: { name: 'Test User' } };
      mockedLinkedInService.getProfileViews.mockResolvedValue({ success: true, data: mockProfileViews } as any);

      // Execution - sessionId is accepted but ignored (singleton browser)
      const response = await request(app)
        .get('/api/profile/views')
        .query({ sessionId: validSessionId });

      // Assertion - sessionId is ignored, 'unused' is passed to service
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: mockProfileViews });
      expect(mockedLinkedInService.getProfileViews).toHaveBeenCalledWith('unused');
    });

    it('should get profile views without sessionId (new system)', async () => {
      // Setup
      const mockProfileViews = { profile: { name: 'Test User' } };
      mockedLinkedInService.getProfileViews.mockResolvedValue({ success: true, data: mockProfileViews } as any);

      // Execution
      const response = await request(app)
        .get('/api/profile/views');

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: mockProfileViews });
      expect(mockedLinkedInService.getProfileViews).toHaveBeenCalledWith('unused');
    });

    it('should handle errors when getting profile views', async () => {
      // Setup
      mockedLinkedInService.getProfileViews.mockRejectedValue(new Error('Failed to fetch profile views'));

      // Execution
      const response = await request(app)
        .get('/api/profile/views')
        .query({ sessionId: validSessionId });

      // Assertion
      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({ success: false, message: 'Failed to fetch profile views' });
    });
  });
});
