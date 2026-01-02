import SessionManager from '../../src/services/SessionManager';
import { Browser, Page } from 'puppeteer';

describe('SessionManager', () => {
  let mockBrowser: jest.Mocked<Browser>;
  let mockPage: jest.Mocked<Page>;

  beforeEach(() => {
    // Clear all sessions before each test
    const allSessions = SessionManager.getAllSessions();
    allSessions.forEach(session => {
      SessionManager.deleteSession(session.id);
    });

    // Create mock browser and page
    mockBrowser = {
      close: jest.fn().mockResolvedValue(undefined),
    } as any;

    mockPage = {
      goto: jest.fn(),
      url: jest.fn(),
    } as any;
  });

  describe('createSession', () => {
    it('should create a new session and return session ID', () => {
      // Setup
      const initialSessionCount = SessionManager.getAllSessions().length;

      // Execution
      const sessionId = SessionManager.createSession(mockBrowser, mockPage);

      // Assertion
      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe('string');
      expect(sessionId.length).toBeGreaterThan(0);
      expect(SessionManager.getAllSessions().length).toBe(initialSessionCount + 1);
    });

    it('should create session with correct initial properties', () => {
      // Setup & Execution
      const sessionId = SessionManager.createSession(mockBrowser, mockPage);
      const session = SessionManager.getSession(sessionId);

      // Assertion
      expect(session).toBeDefined();
      expect(session?.id).toBe(sessionId);
      expect(session?.browser).toBe(mockBrowser);
      expect(session?.page).toBe(mockPage);
      expect(session?.isAuthenticated).toBe(false);
      expect(session?.createdAt).toBeInstanceOf(Date);
      expect(session?.lastUsed).toBeInstanceOf(Date);
    });

    it('should create unique session IDs for multiple sessions', () => {
      // Setup & Execution
      const sessionId1 = SessionManager.createSession(mockBrowser, mockPage);
      const sessionId2 = SessionManager.createSession(mockBrowser, mockPage);
      const sessionId3 = SessionManager.createSession(mockBrowser, mockPage);

      // Assertion
      expect(sessionId1).not.toBe(sessionId2);
      expect(sessionId2).not.toBe(sessionId3);
      expect(sessionId1).not.toBe(sessionId3);
    });
  });

  describe('getSession', () => {
    it('should retrieve an existing session', () => {
      // Setup
      const sessionId = SessionManager.createSession(mockBrowser, mockPage);

      // Execution
      const session = SessionManager.getSession(sessionId);

      // Assertion
      expect(session).toBeDefined();
      expect(session?.id).toBe(sessionId);
    });

    it('should return undefined for non-existent session', () => {
      // Setup
      const nonExistentId = 'non-existent-session-id';

      // Execution
      const session = SessionManager.getSession(nonExistentId);

      // Assertion
      expect(session).toBeUndefined();
    });

    it('should update lastUsed timestamp when retrieving session', () => {
      // Setup
      const sessionId = SessionManager.createSession(mockBrowser, mockPage);
      const originalSession = SessionManager.getSession(sessionId);
      const originalLastUsed = originalSession?.lastUsed.getTime();

      // Wait a bit to ensure timestamp difference
      jest.advanceTimersByTime(100);

      // Execution
      const updatedSession = SessionManager.getSession(sessionId);

      // Assertion
      expect(updatedSession?.lastUsed.getTime()).toBeGreaterThanOrEqual(originalLastUsed!);
    });
  });

  describe('updateSession', () => {
    it('should update session properties', () => {
      // Setup
      const sessionId = SessionManager.createSession(mockBrowser, mockPage);

      // Execution
      SessionManager.updateSession(sessionId, { isAuthenticated: true });
      const session = SessionManager.getSession(sessionId);

      // Assertion
      expect(session?.isAuthenticated).toBe(true);
    });

    it('should update lastUsed timestamp when updating session', () => {
      // Setup
      const sessionId = SessionManager.createSession(mockBrowser, mockPage);
      const originalSession = SessionManager.getSession(sessionId);
      const originalLastUsed = originalSession?.lastUsed.getTime();

      // Wait a bit
      jest.advanceTimersByTime(100);

      // Execution
      SessionManager.updateSession(sessionId, { isAuthenticated: true });
      const updatedSession = SessionManager.getSession(sessionId);

      // Assertion
      expect(updatedSession?.lastUsed.getTime()).toBeGreaterThanOrEqual(originalLastUsed!);
    });

    it('should not throw error when updating non-existent session', () => {
      // Setup
      const nonExistentId = 'non-existent-session-id';

      // Execution & Assertion
      expect(() => {
        SessionManager.updateSession(nonExistentId, { isAuthenticated: true });
      }).not.toThrow();
    });

    it('should update multiple properties at once', () => {
      // Setup
      const sessionId = SessionManager.createSession(mockBrowser, mockPage);

      // Execution
      SessionManager.updateSession(sessionId, {
        isAuthenticated: true,
      });
      const session = SessionManager.getSession(sessionId);

      // Assertion
      expect(session?.isAuthenticated).toBe(true);
    });
  });

  describe('deleteSession', () => {
    it('should delete an existing session', async () => {
      // Setup
      const sessionId = SessionManager.createSession(mockBrowser, mockPage);
      expect(SessionManager.getSession(sessionId)).toBeDefined();

      // Execution
      await SessionManager.deleteSession(sessionId);

      // Assertion
      expect(SessionManager.getSession(sessionId)).toBeUndefined();
      expect(mockBrowser.close).toHaveBeenCalledTimes(1);
    });

    it('should close browser when deleting session', async () => {
      // Setup
      const sessionId = SessionManager.createSession(mockBrowser, mockPage);

      // Execution
      await SessionManager.deleteSession(sessionId);

      // Assertion
      expect(mockBrowser.close).toHaveBeenCalled();
    });

    it('should handle browser close errors gracefully', async () => {
      // Setup
      const sessionId = SessionManager.createSession(mockBrowser, mockPage);
      mockBrowser.close.mockRejectedValue(new Error('Browser close error'));

      // Execution - should not throw even if browser.close() fails
      await SessionManager.deleteSession(sessionId);

      // Assertion - session should still be deleted despite browser close error
      expect(SessionManager.getSession(sessionId)).toBeUndefined();
    });

    it('should not throw error when deleting non-existent session', async () => {
      // Setup
      const nonExistentId = 'non-existent-session-id';

      // Execution & Assertion
      await expect(SessionManager.deleteSession(nonExistentId)).resolves.not.toThrow();
    });
  });

  describe('getAllSessions', () => {
    it('should return empty array when no sessions exist', () => {
      // Setup - no sessions created

      // Execution
      const sessions = SessionManager.getAllSessions();

      // Assertion
      expect(sessions).toEqual([]);
      expect(sessions.length).toBe(0);
    });

    it('should return all session summaries', () => {
      // Setup
      const sessionId1 = SessionManager.createSession(mockBrowser, mockPage);
      const sessionId2 = SessionManager.createSession(mockBrowser, mockPage);
      const sessionId3 = SessionManager.createSession(mockBrowser, mockPage);

      // Execution
      const sessions = SessionManager.getAllSessions();

      // Assertion
      expect(sessions).toHaveLength(3);
      const sessionIds = sessions.map(s => s.id);
      expect(sessionIds).toContain(sessionId1);
      expect(sessionIds).toContain(sessionId2);
      expect(sessionIds).toContain(sessionId3);
    });

    it('should return array of session summary objects', () => {
      // Setup
      SessionManager.createSession(mockBrowser, mockPage);
      SessionManager.createSession(mockBrowser, mockPage);

      // Execution
      const sessions = SessionManager.getAllSessions();

      // Assertion
      expect(Array.isArray(sessions)).toBe(true);
      sessions.forEach(session => {
        expect(typeof session.id).toBe('string');
        expect(typeof session.isAuthenticated).toBe('boolean');
        expect(session.createdAt).toBeInstanceOf(Date);
        expect(session.lastUsed).toBeInstanceOf(Date);
      });
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('should remove expired sessions', async () => {
      // Setup
      const sessionId = SessionManager.createSession(mockBrowser, mockPage);
      
      // Manually set lastUsed to 31 minutes ago (beyond 30 minute timeout)
      const session = SessionManager.getSession(sessionId);
      if (session) {
        session.lastUsed = new Date(Date.now() - 31 * 60 * 1000);
      }

      // Execution
      await SessionManager.cleanupExpiredSessions();

      // Assertion
      expect(SessionManager.getSession(sessionId)).toBeUndefined();
      expect(mockBrowser.close).toHaveBeenCalled();
    });

    it('should keep non-expired sessions', async () => {
      // Setup
      const sessionId = SessionManager.createSession(mockBrowser, mockPage);
      
      // Session is fresh (just created)

      // Execution
      await SessionManager.cleanupExpiredSessions();

      // Assertion
      expect(SessionManager.getSession(sessionId)).toBeDefined();
      expect(mockBrowser.close).not.toHaveBeenCalled();
    });

    it('should clean up multiple expired sessions', async () => {
      // Setup
      const sessionId1 = SessionManager.createSession(mockBrowser, mockPage);
      const sessionId2 = SessionManager.createSession(mockBrowser, mockPage);
      const sessionId3 = SessionManager.createSession(mockBrowser, mockPage);

      // Set all sessions as expired
      [sessionId1, sessionId2, sessionId3].forEach(id => {
        const session = SessionManager.getSession(id);
        if (session) {
          session.lastUsed = new Date(Date.now() - 31 * 60 * 1000);
        }
      });

      // Execution
      await SessionManager.cleanupExpiredSessions();

      // Assertion
      expect(SessionManager.getAllSessions()).toHaveLength(0);
      expect(mockBrowser.close).toHaveBeenCalledTimes(3);
    });

    it('should handle mixed expired and non-expired sessions', async () => {
      // Setup
      const expiredSessionId = SessionManager.createSession(mockBrowser, mockPage);
      const activeSessionId = SessionManager.createSession(mockBrowser, mockPage);

      // Set one session as expired
      const expiredSession = SessionManager.getSession(expiredSessionId);
      if (expiredSession) {
        expiredSession.lastUsed = new Date(Date.now() - 31 * 60 * 1000);
      }

      // Execution
      await SessionManager.cleanupExpiredSessions();

      // Assertion
      expect(SessionManager.getSession(expiredSessionId)).toBeUndefined();
      expect(SessionManager.getSession(activeSessionId)).toBeDefined();
      expect(SessionManager.getAllSessions()).toHaveLength(1);
    });
  });
});
