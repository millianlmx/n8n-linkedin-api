import { LinkedInSession } from '../types';
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

  getAllSessions(): string[] {
    return Array.from(this.sessions.keys());
  }
}

export default new SessionManager();
