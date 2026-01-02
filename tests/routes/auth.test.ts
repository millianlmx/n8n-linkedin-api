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
import authRouter from '../../src/routes/auth.routes';
import LinkedInService from '../../src/services/LinkedInService';
import SessionManager from '../../src/services/SessionManager';

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);

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
const mockedBrowserStateService = mockBrowserStateService as {
  hasBrowserState: jest.Mock;
  restoreBrowserState: jest.Mock;
  saveBrowserState: jest.Mock;
  verifySession: jest.Mock;
  deleteBrowserState: jest.Mock;
};

describe('Authentication API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock setup for LinkedInBrowser
    mockedLinkedInBrowser.isReady.mockReturnValue(true);
    mockedLinkedInBrowser.isAuthenticated.mockReturnValue(false);
    mockedLinkedInBrowser.getStatus.mockReturnValue({
      ready: true,
      authenticated: false,
      hasMonitoring: false,
      userIdentifier: null,
    });
  });

  describe('POST /api/auth/initialize (new endpoint)', () => {
    it('should initialize browser successfully without saved session', async () => {
      // Setup
      mockedLinkedInService.initializeBrowser.mockResolvedValue({
        browser: {} as any,
        page: {} as any,
        sessionRestored: false,
        isAuthenticated: false,
      });

      // Execution
      const response = await request(app).post('/api/auth/initialize');

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        sessionRestored: false,
        isAuthenticated: false,
        message: 'Browser initialized',
      });
      expect(mockedLinkedInService.initializeBrowser).toHaveBeenCalledTimes(1);
    });

    it('should initialize browser with restored session', async () => {
      // Setup
      mockedLinkedInService.initializeBrowser.mockResolvedValue({
        browser: {} as any,
        page: {} as any,
        sessionRestored: true,
        isAuthenticated: true,
      });
      mockedLinkedInService.startMessageMonitoring.mockResolvedValue({ success: true } as any);

      // Execution
      const response = await request(app)
        .post('/api/auth/initialize')
        .send({ email: 'test@example.com' });

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        sessionRestored: true,
        isAuthenticated: true,
        message: 'Browser initialized with saved session',
      });
      expect(mockedLinkedInService.initializeBrowser).toHaveBeenCalledWith('test@example.com');
    });

    it('should return 500 error if browser initialization fails', async () => {
      // Setup
      mockedLinkedInService.initializeBrowser.mockRejectedValue(new Error('Failed to launch browser'));

      // Execution
      const response = await request(app).post('/api/auth/initialize');

      // Assertion
      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        success: false,
        message: 'Failed to launch browser',
      });
    });
  });

  describe('POST /api/auth/init (legacy endpoint)', () => {
    it('should initialize a browser session and return a session ID', async () => {
      // Setup
      const mockBrowser = { close: jest.fn() } as any;
      const mockPage = { goto: jest.fn(), url: jest.fn() } as any;
      mockedLinkedInService.initializeBrowser.mockResolvedValue({
        browser: mockBrowser,
        page: mockPage,
        sessionRestored: false,
        isAuthenticated: false,
      });
      mockedSessionManager.createSession.mockReturnValue('session123');

      // Execution
      const response = await request(app).post('/api/auth/init');

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        sessionId: 'session123',
        sessionRestored: false,
        message: 'Browser initialized',
      });
      expect(mockedLinkedInService.initializeBrowser).toHaveBeenCalledTimes(1);
      expect(mockedSessionManager.createSession).toHaveBeenCalledWith(mockBrowser, mockPage);
    });

    it('should return a 500 error if browser initialization fails', async () => {
      // Setup
      const errorMessage = 'Failed to launch browser';
      mockedLinkedInService.initializeBrowser.mockRejectedValue(new Error(errorMessage));

      // Execution
      const response = await request(app).post('/api/auth/init');

      // Assertion
      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        success: false,
        message: errorMessage,
      });
    });
  });

  describe('GET /api/auth/status (new endpoint)', () => {
    it('should return browser status when ready and authenticated', async () => {
      // Setup
      mockedLinkedInBrowser.getStatus.mockReturnValue({
        ready: true,
        authenticated: true,
        hasMonitoring: true,
        userIdentifier: 'test@example.com',
      });

      // Execution
      const response = await request(app).get('/api/auth/status');

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        ready: true,
        authenticated: true,
        hasMonitoring: true,
        userIdentifier: 'test@example.com',
      });
    });

    it('should return browser status when not ready', async () => {
      // Setup
      mockedLinkedInBrowser.getStatus.mockReturnValue({
        ready: false,
        authenticated: false,
        hasMonitoring: false,
        userIdentifier: null,
      });

      // Execution
      const response = await request(app).get('/api/auth/status');

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        ready: false,
        authenticated: false,
      });
    });

    it('should handle errors when getting status', async () => {
      // Setup
      mockedLinkedInBrowser.getStatus.mockImplementation(() => {
        throw new Error('Status error');
      });

      // Execution
      const response = await request(app).get('/api/auth/status');

      // Assertion
      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        success: false,
        message: 'Status error',
      });
    });
  });

  describe('POST /api/auth/login', () => {
    it('should return 503 when browser not initialized (new system)', async () => {
      // Setup
      mockedLinkedInBrowser.isReady.mockReturnValue(false);

      // Execution
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'password' });

      // Assertion
      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({
        success: false,
        message: 'Browser not initialized. Please call POST /api/auth/initialize first.',
      });
    });

    it('should return success when already authenticated (new system)', async () => {
      // Setup
      mockedLinkedInBrowser.isReady.mockReturnValue(true);
      mockedLinkedInBrowser.isAuthenticated.mockReturnValue(true);

      // Execution
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'password' });

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        sessionRestored: true,
        message: 'Already logged in',
      });
    });

    it('should restore session from cookies when available (new system)', async () => {
      // Setup
      const mockPage = { goto: jest.fn(), url: jest.fn() };
      mockedLinkedInBrowser.isReady.mockReturnValue(true);
      mockedLinkedInBrowser.isAuthenticated.mockReturnValue(false);
      mockedLinkedInBrowser.getOperationPage.mockReturnValue(mockPage as any);
      mockedBrowserStateService.hasBrowserState.mockResolvedValue(true);
      mockedBrowserStateService.restoreBrowserState.mockResolvedValue(true);
      mockedBrowserStateService.verifySession.mockResolvedValue(true);
      mockedLinkedInService.startMessageMonitoring.mockResolvedValue({ success: true } as any);

      // Execution
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'password' });

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        sessionRestored: true,
        message: 'Login successful (session restored from cookies)',
      });
      expect(mockedLinkedInBrowser.setAuthenticated).toHaveBeenCalledWith(true);
    });

    it('should perform real login when no saved session (new system)', async () => {
      // Setup
      const mockPage = { goto: jest.fn(), url: jest.fn() };
      mockedLinkedInBrowser.isReady.mockReturnValue(true);
      mockedLinkedInBrowser.isAuthenticated.mockReturnValue(false);
      mockedLinkedInBrowser.getOperationPage.mockReturnValue(mockPage as any);
      mockedBrowserStateService.hasBrowserState.mockResolvedValue(false);
      mockedLinkedInService.login.mockResolvedValue({ success: true, message: 'Login successful' } as any);

      // Execution
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'password' });

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        sessionRestored: false,
        message: 'Login successful',
      });
      expect(mockedLinkedInService.login).toHaveBeenCalled();
    });

    it('should return 401 for login failure', async () => {
      // Setup
      const mockPage = { goto: jest.fn(), url: jest.fn() };
      mockedLinkedInBrowser.isReady.mockReturnValue(true);
      mockedLinkedInBrowser.isAuthenticated.mockReturnValue(false);
      mockedLinkedInBrowser.getOperationPage.mockReturnValue(mockPage as any);
      mockedBrowserStateService.hasBrowserState.mockResolvedValue(false);
      mockedLinkedInService.login.mockRejectedValue(new Error('Invalid credentials'));

      // Execution
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'wrong@example.com', password: 'wrong' });

      // Assertion
      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        success: false,
        message: 'Invalid credentials',
      });
    });
  });

  describe('DELETE /api/auth/logout', () => {
    it('should close browser and log out successfully (new system)', async () => {
      // Setup
      mockedLinkedInBrowser.close.mockResolvedValue(undefined);

      // Execution
      const response = await request(app)
        .delete('/api/auth/logout')
        .send({});

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: 'Logged out successfully',
      });
      expect(mockedLinkedInBrowser.close).toHaveBeenCalled();
    });

    it('should handle errors when closing browser', async () => {
      // Setup
      mockedLinkedInBrowser.close.mockRejectedValue(new Error('Close failed'));

      // Execution
      const response = await request(app)
        .delete('/api/auth/logout')
        .send({});

      // Assertion
      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        success: false,
        message: 'Close failed',
      });
    });
  });

  describe('GET /api/auth/sessions', () => {
    it('should return singleton session when browser is ready (new system)', async () => {
      // Setup
      mockedLinkedInBrowser.getStatus.mockReturnValue({
        ready: true,
        authenticated: true,
        hasMonitoring: true,
        userIdentifier: 'test@example.com',
      });

      // Execution
      const response = await request(app).get('/api/auth/sessions');

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        count: 1,
      });
      expect(response.body.sessions).toHaveLength(1);
      expect(response.body.sessions[0]).toMatchObject({
        id: 'singleton',
        isAuthenticated: true,
        hasMonitoring: true,
        userIdentifier: 'test@example.com',
      });
    });

    it('should return empty array when browser is not ready (new system)', async () => {
      // Setup
      mockedLinkedInBrowser.getStatus.mockReturnValue({
        ready: false,
        authenticated: false,
        hasMonitoring: false,
        userIdentifier: null,
      });

      // Execution
      const response = await request(app).get('/api/auth/sessions');

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        sessions: [],
        count: 0,
      });
    });

    it('should handle errors when retrieving sessions', async () => {
      // Setup
      mockedLinkedInBrowser.getStatus.mockImplementation(() => {
        throw new Error('Database error');
      });

      // Execution
      const response = await request(app).get('/api/auth/sessions');

      // Assertion
      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        success: false,
        message: 'Database error',
      });
    });
  });

  describe('GET /api/auth/session/:sessionId', () => {
    it('should return singleton session details (new system)', async () => {
      // Setup
      mockedLinkedInBrowser.getStatus.mockReturnValue({
        ready: true,
        authenticated: true,
        hasMonitoring: true,
        userIdentifier: 'test@example.com',
      });

      // Execution
      const response = await request(app).get('/api/auth/session/singleton');

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        session: {
          id: 'singleton',
          isAuthenticated: true,
          hasMonitoring: true,
          userIdentifier: 'test@example.com',
        },
      });
    });

    it('should return 404 for non-existent legacy session', async () => {
      // Setup
      mockedSessionManager.getSession.mockReturnValue(undefined);

      // Execution
      const response = await request(app).get('/api/auth/session/invalid-session');

      // Assertion
      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        message: 'Session not found',
      });
    });

    it('should handle errors when retrieving session details', async () => {
      // Setup
      mockedSessionManager.getSession.mockImplementation(() => {
        throw new Error('Internal error');
      });

      // Execution
      const response = await request(app).get('/api/auth/session/session123');

      // Assertion
      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        success: false,
        message: 'Internal error',
      });
    });
  });

  describe('POST /api/auth/force-authenticate', () => {
    it('should force authenticate when browser is ready and not on login page (new system)', async () => {
      // Setup
      const mockPage = { url: jest.fn().mockReturnValue('https://www.linkedin.com/feed') };
      mockedLinkedInBrowser.isReady.mockReturnValue(true);
      mockedLinkedInBrowser.getOperationPage.mockReturnValue(mockPage as any);
      mockedLinkedInService.startMessageMonitoring.mockResolvedValue({ success: true } as any);

      // Execution
      const response = await request(app)
        .post('/api/auth/force-authenticate')
        .send({});

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        message: 'Session marked as authenticated',
        currentUrl: 'https://www.linkedin.com/feed',
      });
      expect(mockedLinkedInBrowser.setAuthenticated).toHaveBeenCalledWith(true);
    });

    it('should return 503 when browser is not ready (new system)', async () => {
      // Setup
      mockedLinkedInBrowser.isReady.mockReturnValue(false);

      // Execution
      const response = await request(app)
        .post('/api/auth/force-authenticate')
        .send({});

      // Assertion
      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({
        success: false,
        message: 'Browser not initialized',
      });
    });

    it('should return 400 when still on login page (new system)', async () => {
      // Setup
      const mockPage = { url: jest.fn().mockReturnValue('https://www.linkedin.com/login') };
      mockedLinkedInBrowser.isReady.mockReturnValue(true);
      mockedLinkedInBrowser.getOperationPage.mockReturnValue(mockPage as any);

      // Execution
      const response = await request(app)
        .post('/api/auth/force-authenticate')
        .send({});

      // Assertion
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        message: 'Cannot force authenticate - still on login page',
        currentUrl: 'https://www.linkedin.com/login',
      });
    });

    it('should handle errors during force authentication', async () => {
      // Setup
      mockedLinkedInBrowser.isReady.mockImplementation(() => {
        throw new Error('Session error');
      });

      // Execution
      const response = await request(app)
        .post('/api/auth/force-authenticate')
        .send({});

      // Assertion
      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        success: false,
        message: 'Session error',
      });
    });
  });
});
