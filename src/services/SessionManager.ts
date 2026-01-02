import { LinkedInSession, SessionSummary } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { Browser, Page } from 'puppeteer';
import { createServiceLogger } from '../utils/logger';

const log = createServiceLogger('SessionManager');

class SessionManager {
  private sessions: Map<string, LinkedInSession> = new Map();
  private readonly SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

  createSession(browser: Browser, page: Page): string {
    const sessionId = uuidv4();
    const session: LinkedInSession = {
      id: sessionId,
      browser,
      page,
      isAuthenticated: false,
      createdAt: new Date(),
      lastUsed: new Date(),
    };
    
    this.sessions.set(sessionId, session);
    log.info('Session created', { sessionId, isAuthenticated: false });
    return sessionId;
  }

  getSession(sessionId: string): LinkedInSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastUsed = new Date();
      log.debug('Session retrieved', { 
        sessionId: sessionId.substring(0, 8), 
        isAuthenticated: session.isAuthenticated,
        ageMinutes: Math.round((Date.now() - session.createdAt.getTime()) / 60000)
      });
    } else {
      log.warn('Session not found in map', { 
        sessionId: sessionId.substring(0, 8),
        availableSessions: Array.from(this.sessions.keys()).map(id => id.substring(0, 8))
      });
    }
    return session;
  }

  updateSession(sessionId: string, updates: Partial<LinkedInSession>): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      const oldAuth = session.isAuthenticated;
      Object.assign(session, updates);
      session.lastUsed = new Date();
      
      // Log authentication state changes
      if ('isAuthenticated' in updates && updates.isAuthenticated !== oldAuth) {
        log.info('Session authentication state changed', { 
          sessionId: sessionId.substring(0, 8), 
          oldState: oldAuth,
          newState: updates.isAuthenticated 
        });
      }
    } else {
      log.warn('Cannot update session - not found', { sessionId: sessionId.substring(0, 8) });
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      log.info('Deleting session', { sessionId: sessionId.substring(0, 8) });
      try {
        // Clear monitoring interval if exists
        if (session.monitoringInterval) {
          clearInterval(session.monitoringInterval);
        }
        
        // Close monitoring page if exists
        if (session.monitoringPage && !session.monitoringPage.isClosed()) {
          await session.monitoringPage.close();
        }
        
        await session.browser.close();
      } catch (error) {
        log.error('Error closing browser:', error);
      }
      this.sessions.delete(sessionId);
      log.info('Session deleted', { sessionId: sessionId.substring(0, 8) });
    }
  }

  async cleanupExpiredSessions(): Promise<void> {
    const now = Date.now();
    let cleanedCount = 0;
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastUsed.getTime() > this.SESSION_TIMEOUT) {
        log.info('Cleaning up expired session', { 
          sessionId: sessionId.substring(0, 8),
          lastUsedMinutesAgo: Math.round((now - session.lastUsed.getTime()) / 60000)
        });
        await this.deleteSession(sessionId);
        cleanedCount++;
      }
    }
    if (cleanedCount > 0) {
      log.info('Session cleanup completed', { cleanedCount });
    }
  }

  getAllSessions(): SessionSummary[] {
    const sessions = Array.from(this.sessions.values()).map(session => ({
      id: session.id,
      isAuthenticated: session.isAuthenticated,
      createdAt: session.createdAt,
      lastUsed: session.lastUsed,
      currentUrl: session.page.url(),
    }));
    log.debug('All sessions requested', { 
      count: sessions.length,
      authenticated: sessions.filter(s => s.isAuthenticated).length
    });
    return sessions;
  }
}

export default new SessionManager();
