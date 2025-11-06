import express from 'express';
import request from 'supertest';
import authRouter from '../../src/routes/auth.routes';
import LinkedInService from '../../src/services/LinkedInService';
import SessionManager from '../../src/services/SessionManager';

jest.mock('../../src/services/LinkedInService');
jest.mock('../../src/services/SessionManager');

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);

const mockedLinkedInService = LinkedInService as jest.Mocked<typeof LinkedInService>;
const mockedSessionManager = SessionManager as jest.Mocked<typeof SessionManager>;

describe('Authentication API', () => {
  beforeEach(() => {
    // Clean up mocks between tests
    jest.clearAllMocks();
  });

  describe('POST /api/auth/init', () => {
    it('should initialize a browser session and return a session ID', async () => {
      // Setup
      const mockBrowser = { close: jest.fn() } as any;
      const mockPage = { goto: jest.fn(), url: jest.fn() } as any;
      mockedLinkedInService.initializeBrowser.mockResolvedValue({ 
        browser: mockBrowser, 
        page: mockPage 
      } as any);
      mockedSessionManager.createSession.mockReturnValue('session123');

      // Execution
      const response = await request(app).post('/api/auth/init');

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ 
        success: true, 
        sessionId: 'session123', 
        message: 'Browser initialized' 
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
        message: errorMessage 
      });
    });

    it('should handle unexpected errors during initialization', async () => {
      // Setup
      mockedLinkedInService.initializeBrowser.mockRejectedValue(new Error('Unexpected error'));

      // Execution
      const response = await request(app).post('/api/auth/init');

      // Assertion
      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should log in successfully with valid credentials', async () => {
      // Setup
      const credentials = { 
        sessionId: 'session123', 
        email: 'test@example.com', 
        password: 'password' 
      };
      mockedLinkedInService.login.mockResolvedValue({ success: true, message: '', redirectUrl: '' } as any);
      mockedSessionManager.getSession.mockReturnValue({} as any);

      // Execution
      const response = await request(app)
        .post('/api/auth/login')
        .send(credentials);

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ 
        success: true, 
        sessionId: 'session123', 
        message: 'Login successful' 
      });
    });

    it('should return a 400 error when sessionId is missing', async () => {
      // Setup
      const invalidRequest = { 
        email: 'test@example.com', 
        password: 'password' 
      };

      // Execution
      const response = await request(app)
        .post('/api/auth/login')
        .send(invalidRequest);

      // Assertion
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ 
        success: false, 
        message: 'Session ID is required' 
      });
    });

    it('should return a 401 error for invalid credentials', async () => {
      // Setup
      const invalidCredentials = { 
        sessionId: 'session123', 
        email: 'wrong@example.com', 
        password: 'wrong' 
      };
      mockedLinkedInService.login.mockRejectedValue(new Error('Invalid credentials'));
      mockedSessionManager.getSession.mockReturnValue({} as any);

      // Execution
      const response = await request(app)
        .post('/api/auth/login')
        .send(invalidCredentials);

      // Assertion
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    });

    it('should handle login timeout errors', async () => {
      // Setup
      mockedLinkedInService.login.mockRejectedValue(new Error('Login timeout'));
      mockedSessionManager.getSession.mockReturnValue({} as any);

      // Execution
      const response = await request(app)
        .post('/api/auth/login')
        .send({ sessionId: 'session123', email: 'test@example.com', password: 'password' });

      // Assertion
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body.message).toContain('timeout');
    });
  });

  describe('DELETE /api/auth/logout', () => {
    it('should log out successfully', async () => {
      // Setup
      mockedSessionManager.deleteSession.mockResolvedValue(undefined);

      // Execution
      const response = await request(app)
        .delete('/api/auth/logout')
        .send({ sessionId: 'session123' });

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ 
        success: true, 
        message: 'Logged out successfully' 
      });
      expect(mockedSessionManager.deleteSession).toHaveBeenCalledWith('session123');
    });

    it('should return a 400 error when sessionId is missing', async () => {
      // Setup - no sessionId provided

      // Execution
      const response = await request(app)
        .delete('/api/auth/logout')
        .send({});

      // Assertion
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ 
        success: false, 
        message: 'Session ID is required' 
      });
    });

    it('should handle errors when deleting session', async () => {
      // Setup
      mockedSessionManager.deleteSession.mockRejectedValue(new Error('Session not found'));

      // Execution
      const response = await request(app)
        .delete('/api/auth/logout')
        .send({ sessionId: 'invalid-session' });

      // Assertion
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ 
        success: false, 
        message: 'Session not found' 
      });
    });
  });

  describe('GET /api/auth/sessions', () => {
    it('should list all active sessions', async () => {
      // Setup
      const sessions = [
        { id: 'session1', isAuthenticated: true, createdAt: new Date() },
        { id: 'session2', isAuthenticated: false, createdAt: new Date() }
      ];
      mockedSessionManager.getAllSessions.mockReturnValue(sessions as any);

      // Execution
      const response = await request(app).get('/api/auth/sessions');

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ 
        success: true, 
        count: 2 
      });
      expect(response.body.sessions).toHaveLength(2);
      expect(response.body.sessions[0]).toMatchObject({ id: 'session1', isAuthenticated: true });
      expect(response.body.sessions[1]).toMatchObject({ id: 'session2', isAuthenticated: false });
    });

    it('should return empty array when no sessions exist', async () => {
      // Setup
      mockedSessionManager.getAllSessions.mockReturnValue([]);

      // Execution
      const response = await request(app).get('/api/auth/sessions');

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ 
        success: true, 
        sessions: [], 
        count: 0 
      });
    });

    it('should handle errors when retrieving sessions', async () => {
      // Setup
      mockedSessionManager.getAllSessions.mockImplementation(() => {
        throw new Error('Database error');
      });

      // Execution
      const response = await request(app).get('/api/auth/sessions');

      // Assertion
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ 
        success: false, 
        message: 'Database error' 
      });
    });
  });

  describe('GET /api/auth/session/:sessionId', () => {
    it('should return session details for a valid session ID', async () => {
      // Setup
      const session = {
        id: 'session123',
        isAuthenticated: true,
        createdAt: new Date(),
        lastUsed: new Date(),
        page: { url: () => 'https://www.linkedin.com/feed' },
      };
      mockedSessionManager.getSession.mockReturnValue(session as any);

      // Execution
      const response = await request(app).get('/api/auth/session/session123');

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.session).toMatchObject({
        id: 'session123',
        isAuthenticated: true,
        currentUrl: 'https://www.linkedin.com/feed'
      });
      expect(response.body.session).toHaveProperty('createdAt');
      expect(response.body.session).toHaveProperty('lastUsed');
    });

    it('should return a 404 error for non-existent session', async () => {
      // Setup
      mockedSessionManager.getSession.mockReturnValue(undefined);

      // Execution
      const response = await request(app).get('/api/auth/session/invalid-session');

      // Assertion
      expect(response.status).toBe(404);
      expect(response.body).toEqual({ 
        success: false, 
        message: 'Session not found' 
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
        message: 'Internal error' 
      });
    });
  });

  describe('POST /api/auth/force-authenticate', () => {
    it('should force authenticate a valid session', async () => {
      // Setup
      const session = {
        id: 'session123',
        isAuthenticated: false,
        page: { url: () => 'https://www.linkedin.com/feed' },
      };
      mockedSessionManager.getSession.mockReturnValue(session as any);
      mockedSessionManager.updateSession.mockReturnValue(undefined);

      // Execution
      const response = await request(app)
        .post('/api/auth/force-authenticate')
        .send({ sessionId: 'session123' });

      // Assertion
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        message: 'Session marked as authenticated',
        session: {
          id: 'session123',
          isAuthenticated: true,
          currentUrl: 'https://www.linkedin.com/feed'
        }
      });
      expect(mockedSessionManager.updateSession).toHaveBeenCalledWith('session123', {
        isAuthenticated: true
      });
    });

    it('should return a 400 error when sessionId is missing', async () => {
      // Setup - no sessionId provided

      // Execution
      const response = await request(app)
        .post('/api/auth/force-authenticate')
        .send({});

      // Assertion
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ 
        success: false, 
        message: 'Session ID is required' 
      });
    });

    it('should return a 404 error for non-existent session', async () => {
      // Setup
      mockedSessionManager.getSession.mockReturnValue(undefined);

      // Execution
      const response = await request(app)
        .post('/api/auth/force-authenticate')
        .send({ sessionId: 'invalid-session' });

      // Assertion
      expect(response.status).toBe(404);
      expect(response.body).toEqual({ 
        success: false, 
        message: 'Session not found' 
      });
    });

    it('should return a 400 error when still on login page', async () => {
      // Setup
      const mockUrl = jest.fn().mockReturnValue('https://www.linkedin.com/login');
      const session = {
        id: 'session123',
        isAuthenticated: false,
        page: { url: mockUrl },
      };
      mockedSessionManager.getSession.mockReturnValue(session as any);

      // Execution
      const response = await request(app)
        .post('/api/auth/force-authenticate')
        .send({ sessionId: 'session123' });

      // Assertion
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ 
        success: false, 
        message: 'Cannot force authenticate - still on login page',
        currentUrl: 'https://www.linkedin.com/login'
      });
    });

    it('should handle errors during force authentication', async () => {
      // Setup
      mockedSessionManager.getSession.mockImplementation(() => {
        throw new Error('Session error');
      });

      // Execution
      const response = await request(app)
        .post('/api/auth/force-authenticate')
        .send({ sessionId: 'session123' });

      // Assertion
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ 
        success: false, 
        message: 'Session error' 
      });
    });
  });
});