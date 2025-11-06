/**
 * Type definitions for LinkedIn API Services
 * This file ensures all route files have proper type definitions for services
 */

import { Browser, Page } from 'puppeteer';
import { 
  LinkedInSession, 
  LoginRequest, 
  LoginResponse,
  ProfileScrapeRequest, 
  ConnectRequest, 
  SendMessageRequest,
  MessageResponse,
  Conversation,
  ConversationMessage
} from '../types';

/**
 * Session Manager Service
 * Handles browser session lifecycle and management
 */
declare class SessionManager {
  /**
   * Create a new session with browser and page instances
   * @param browser - Puppeteer browser instance
   * @param page - Puppeteer page instance
   * @returns Session ID (UUID)
   */
  createSession(browser: Browser, page: Page): string;

  /**
   * Get an existing session by ID
   * @param sessionId - Session ID to retrieve
   * @returns Session object or undefined if not found
   */
  getSession(sessionId: string): LinkedInSession | undefined;

  /**
   * Update session properties
   * @param sessionId - Session ID to update
   * @param updates - Partial session object with updates
   */
  updateSession(sessionId: string, updates: Partial<LinkedInSession>): void;

  /**
   * Delete a session and close its browser
   * @param sessionId - Session ID to delete
   */
  deleteSession(sessionId: string): Promise<void>;

  /**
   * Clean up expired sessions (older than 30 minutes)
   */
  cleanupExpiredSessions(): Promise<void>;

  /**
   * Get all active session IDs
   * @returns Array of session IDs
   */
  getAllSessions(): string[];
}

/**
 * LinkedIn Service
 * Main service for LinkedIn automation and scraping
 */
declare class LinkedInService {
  /**
   * Initialize a new browser instance
   * @returns Browser and page instances
   */
  initializeBrowser(): Promise<{ browser: Browser; page: Page }>;

  /**
   * Login to LinkedIn with credentials
   * @param sessionId - Session ID
   * @param credentials - Login credentials (email and password)
   * @returns Login response with success status
   */
  login(sessionId: string, credentials: LoginRequest): Promise<LoginResponse>;

  /**
   * Scrape a LinkedIn profile
   * @param sessionId - Session ID
   * @param request - Profile scrape request with URL
   * @returns Profile data including name, headline, location, etc.
   */
  scrapeProfile(sessionId: string, request: ProfileScrapeRequest): Promise<any>;

  /**
   * Send a connection request to a LinkedIn user
   * @param sessionId - Session ID
   * @param request - Connection request with URL and optional message
   * @returns Success status and message
   */
  connectWithUser(sessionId: string, request: ConnectRequest): Promise<MessageResponse>;

  /**
   * List all conversations in LinkedIn messaging
   * @param sessionId - Session ID
   * @returns Array of conversations with IDs, names, and last messages
   */
  listConversations(sessionId: string): Promise<Conversation[]>;

  /**
   * Get unread messages from LinkedIn
   * @param sessionId - Session ID
   * @returns Array of unread conversations
   */
  getUnreadMessages(sessionId: string): Promise<any[]>;

  /**
   * Read messages from a specific conversation
   * @param sessionId - Session ID
   * @param conversationUrl - Conversation URL or ID
   * @returns Array of messages with sender, content, and timestamp
   */
  readConversation(sessionId: string, conversationUrl: string): Promise<ConversationMessage[]>;

  /**
   * Send a message in a conversation
   * @param sessionId - Session ID
   * @param request - Message request with conversation ID and message text
   * @returns Success status and message
   */
  sendMessage(sessionId: string, request: SendMessageRequest): Promise<MessageResponse>;

  /**
   * Visit a LinkedIn profile (for analytics/tracking)
   * @param sessionId - Session ID
   * @param profileUrl - Profile URL to visit
   * @returns Success status and message
   */
  visitProfile(sessionId: string, profileUrl: string): Promise<MessageResponse>;

  /**
   * Send a connection request with optional custom message
   * @param sessionId - Session ID
   * @param profileUrl - Profile URL to connect with
   * @param message - Optional custom message to include
   * @returns Success status and message
   */
  sendConnectionRequest(sessionId: string, profileUrl: string, message?: string): Promise<MessageResponse>;

  /**
   * Get profile views (who viewed your profile)
   * @param sessionId - Session ID
   * @returns Array of profile views with viewer information
   */
  getProfileViews(sessionId: string): Promise<any[]>;

  /**
   * Search for people on LinkedIn
   * @param sessionId - Session ID
   * @param keywords - Search keywords
   * @param limit - Maximum number of results (default: 50)
   * @returns Array of search results with profile information
   */
  searchPeople(sessionId: string, keywords: string, limit?: number): Promise<any[]>;
}

/**
 * Singleton instances exported from services
 */
declare const sessionManager: SessionManager;
declare const linkedInService: LinkedInService;

// LinkedInService is exported as a singleton instance, not a class
export { SessionManager, linkedInService as LinkedInService, sessionManager };
export default linkedInService;
