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

export interface SessionSummary {
  id: string;
  isAuthenticated: boolean;
  createdAt: Date;
  lastUsed: Date;
  currentUrl: string;
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
  forceRefresh?: boolean;
}

export interface ConnectRequest {
  url: string;
  message?: string;
}

export interface SendMessageRequest {
  conversationUrl: string;
  message: string;
  profileUrl?: string; // Optional profile URL for cache update
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

export interface CompanySearchRequest {
  keywords: string;
  limit?: number;
  companySize?: string[];     // ["B","C","D"...]
  industry?: string[];        // ["96","6"...]
  location?: string[];        // ["105015875"...]
}

export interface CompanySearchResult {
  name: string;
  url: string;
  industry: string;
  location: string;
  description: string;
  followers: string;
  logoUrl: string;
}

export interface CompanyMemberResult {
  company: {
    name: string;
    url: string;
    employeeRange: string;
    companyId: string;
  };
  members: {
    name: string;
    title: string;
    location: string;
    profileUrl: string;
  }[];
  searchStrategy: 'founder' | 'clevel';
}
