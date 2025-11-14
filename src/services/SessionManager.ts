import { LinkedInSession, SessionSummary } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { Browser, Page } from 'puppeteer';

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
    return sessionId;
  }

  getSession(sessionId: string): LinkedInSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastUsed = new Date();
    }
    return session;
  }

  updateSession(sessionId: string, updates: Partial<LinkedInSession>): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      Object.assign(session, updates);
      session.lastUsed = new Date();
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
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
        console.error('Error closing browser:', error);
      }
      this.sessions.delete(sessionId);
    }
  }

  async cleanupExpiredSessions(): Promise<void> {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastUsed.getTime() > this.SESSION_TIMEOUT) {
        await this.deleteSession(sessionId);
      }
    }
  }

  getAllSessions(): SessionSummary[] {
    return Array.from(this.sessions.values()).map(session => ({
      id: session.id,
      isAuthenticated: session.isAuthenticated,
      createdAt: session.createdAt,
      lastUsed: session.lastUsed,
      currentUrl: session.page.url(),
    }));
  }
}

export default new SessionManager();
