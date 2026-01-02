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
import connectionRouter from '../../src/routes/connection.routes';
import LinkedInService from '../../src/services/LinkedInService';
import SessionManager from '../../src/services/SessionManager';

const app = express();
app.use(express.json());
app.use('/api/connection', connectionRouter);

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
    
    // Default mock setup for LinkedInBrowser (new system)
    mockedLinkedInBrowser.isReady.mockReturnValue(true);
    mockedLinkedInBrowser.isAuthenticated.mockReturnValue(true);
    mockedLinkedInBrowser.getOperationPage.mockReturnValue(mockPage as any);
  });

  describe('POST /api/connection/send-request', () => {
    it('should send a connection request successfully with sessionId (legacy)', async () => {
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

    it('should send a connection request successfully without sessionId (new system)', async () => {
      // Setup
      mockedLinkedInService.sendConnectionRequest.mockResolvedValue({ success: true, message: 'Connection request sent' } as any);

      // Execution
      const response = await request(app)
        .post('/api/connection/send-request')
        .send({ profileUrl: 'https://www.linkedin.com/in/test-profile' });

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, message: 'Connection request sent' });
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

    it('should return 503 when browser not ready and no sessionId (new system)', async () => {
      // Setup
      mockedLinkedInBrowser.isReady.mockReturnValue(false);

      // Execution
      const response = await request(app)
        .post('/api/connection/send-request')
        .send({ profileUrl: 'https://www.linkedin.com/in/test-profile' });

      // Assertion
      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({
        success: false,
        message: 'Browser not initialized. Please call POST /api/auth/initialize first.',
      });
    });

    it('should return a 400 error when profileUrl is missing', async () => {
      // Setup - no profileUrl provided

      // Execution
      const response = await request(app)
        .post('/api/connection/send-request')
        .send({ sessionId: 'session123' });

      // Assertion
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ success: false, message: 'Profile URL is required' });
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
