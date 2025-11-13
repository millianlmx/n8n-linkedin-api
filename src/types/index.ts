import { Browser, Page } from 'puppeteer';

export interface LinkedInSession {
  id: string;
  browser: Browser;
  page: Page;
  isAuthenticated: boolean;
  createdAt: Date;
  lastUsed: Date;
  monitoringPage?: Page; // Dedicated page for message monitoring
  monitoringInterval?: NodeJS.Timeout; // Interval for refreshing monitoring
}

export interface LoginRequest {
  email?: string;
  password?: string;
}

export interface LoginResponse {
  success: boolean;
  sessionId: string;
  token?: string;
  message?: string;
}

export interface ProfileScrapeRequest {
  url: string;
}

export interface ConnectRequest {
  url: string;
  message?: string;
}

export interface SendMessageRequest {
  conversationUrl: string;
  message: string;
}

export interface MessageResponse {
  success: boolean;
  message?: string;
  data?: any;
}

export interface ConversationMessage {
  sender: string;
  message: string;
  timestamp: string;
}

export interface Conversation {
  id: string;
  name: string;
  lastMessage?: string;
  timestamp?: string;
}
