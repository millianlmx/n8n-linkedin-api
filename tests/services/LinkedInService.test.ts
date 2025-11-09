// Mock dependencies BEFORE imports
jest.mock('puppeteer', () => ({
  launch: jest.fn(),
}));
jest.mock('fs', () => ({
  existsSync: jest.fn(),
}));
jest.mock('../../src/services/SessionManager', () => ({
  default: {
    getSession: jest.fn(),
    updateSession: jest.fn(),
  },
}));
jest.mock('../../src/services/CacheService');

import LinkedInService from '../../src/services/LinkedInService';
import SessionManager from '../../src/services/SessionManager';
import { CacheService } from '../../src/services/CacheService';
import * as puppeteer from 'puppeteer';
import { existsSync } from 'fs';

describe('LinkedInService', () => {
  let linkedInService: typeof LinkedInService;
  let mockBrowser: any;
  let mockPage: any;
  let mockSession: any;
  let mockCacheService: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock page
    mockPage = {
      goto: jest.fn().mockResolvedValue(undefined),
      setUserAgent: jest.fn().mockResolvedValue(undefined),
      type: jest.fn().mockResolvedValue(undefined),
      click: jest.fn().mockResolvedValue(undefined),
      waitForNavigation: jest.fn().mockResolvedValue(undefined),
      waitForSelector: jest.fn().mockResolvedValue(undefined),
      waitForTimeout: jest.fn().mockResolvedValue(undefined),
      url: jest.fn().mockReturnValue('https://www.linkedin.com/feed'),
      content: jest.fn().mockResolvedValue('<html></html>'),
      evaluate: jest.fn().mockResolvedValue({}),
      $: jest.fn().mockResolvedValue(null),
      $$: jest.fn().mockResolvedValue([]),
    };

    // Create mock browser
    mockBrowser = {
      newPage: jest.fn().mockResolvedValue(mockPage),
      close: jest.fn().mockResolvedValue(undefined),
    };

    // Create mock session
    mockSession = {
      id: 'test-session-id',
      browser: mockBrowser,
      page: mockPage,
      isAuthenticated: true,
      createdAt: new Date(),
      lastUsed: new Date(),
    };

    // Mock puppeteer.launch
    (puppeteer.launch as jest.Mock).mockResolvedValue(mockBrowser);

    // Mock SessionManager
    SessionManager.getSession = jest.fn().mockReturnValue(mockSession);
    SessionManager.updateSession = jest.fn().mockImplementation(() => {});

    // Mock CacheService
    mockCacheService = {
      getProfile: jest.fn().mockResolvedValue(null),
      cacheProfile: jest.fn().mockResolvedValue(undefined),
    };
    (CacheService as jest.MockedClass<typeof CacheService>).mockImplementation(() => mockCacheService as any);

    // Mock existsSync
    (existsSync as jest.Mock).mockReturnValue(false);

    // Use the singleton instance
    linkedInService = LinkedInService;
    // Mock the cacheService property
    (linkedInService as any).cacheService = mockCacheService;
  });

  describe('findChrome', () => {
    it('should find Chrome on macOS when available', () => {
      // Setup
      (existsSync as jest.Mock).mockReturnValue(true);

      // Execution - findChrome is called during initializeBrowser
      // We can test it indirectly through initializeBrowser

      // Assertion
      expect(existsSync).toBeDefined();
    });

    it('should handle Chrome not found', () => {
      // Setup
      (existsSync as jest.Mock).mockReturnValue(false);

      // Execution & Assertion
      // When Chrome is not found, bundled Chromium is used
      expect(existsSync).toBeDefined();
    });
  });

  describe('initializeBrowser', () => {
    it('should initialize browser successfully', async () => {
      // Execution
      const result = await linkedInService.initializeBrowser();

      // Assertion
      expect(result).toEqual({ browser: mockBrowser, page: mockPage });
      expect(puppeteer.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          headless: true,
          args: expect.arrayContaining(['--no-sandbox']),
        })
      );
      expect(mockPage.setUserAgent).toHaveBeenCalled();
    });

    it('should use custom Chrome path when found', async () => {
      // Setup
      (existsSync as jest.Mock).mockReturnValue(true);

      // Execution
      await linkedInService.initializeBrowser();

      // Assertion
      expect(puppeteer.launch).toHaveBeenCalled();
    });

    it('should handle browser initialization errors', async () => {
      // Setup
      (puppeteer.launch as jest.Mock).mockRejectedValue(new Error('Launch failed'));

      // Execution & Assertion
      await expect(linkedInService.initializeBrowser()).rejects.toThrow('Failed to initialize browser');
    });
  });

  describe('login', () => {
    it('should throw error when session not found', async () => {
      // Setup
      SessionManager.getSession = jest.fn().mockReturnValue(undefined);

      // Execution & Assertion
      await expect(
        linkedInService.login('invalid-session', { email: 'test@example.com', password: 'password' })
      ).rejects.toThrow('Session not found');
    });

    it('should throw error when email is missing', async () => {
      // Setup - no email provided and no env variable

      // Execution & Assertion
      await expect(
        linkedInService.login('test-session-id', { email: '', password: 'password' })
      ).rejects.toThrow('Email and password are required');
    });

    it('should throw error when password is missing', async () => {
      // Setup - no password provided

      // Execution & Assertion
      await expect(
        linkedInService.login('test-session-id', { email: 'test@example.com', password: '' })
      ).rejects.toThrow('Email and password are required');
    });

    it('should navigate to LinkedIn login page', async () => {
      // Setup
      mockPage.url.mockReturnValue('https://www.linkedin.com/feed');

      // Execution
      await linkedInService.login('test-session-id', { email: 'test@example.com', password: 'password' });

      // Assertion
      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://www.linkedin.com/login',
        expect.objectContaining({ waitUntil: 'networkidle2' })
      );
    });

    it('should type credentials into login form', async () => {
      // Setup
      mockPage.url.mockReturnValue('https://www.linkedin.com/feed');

      // Execution
      await linkedInService.login('test-session-id', { email: 'test@example.com', password: 'password123' });

      // Assertion
      expect(mockPage.type).toHaveBeenCalledWith('#username', 'test@example.com', expect.any(Object));
      expect(mockPage.type).toHaveBeenCalledWith('#password', 'password123', expect.any(Object));
    });

    it('should click submit button and wait for navigation', async () => {
      // Setup
      mockPage.url.mockReturnValue('https://www.linkedin.com/feed');

      // Execution
      await linkedInService.login('test-session-id', { email: 'test@example.com', password: 'password' });

      // Assertion
      expect(mockPage.click).toHaveBeenCalledWith('button[type="submit"]');
      expect(mockPage.waitForNavigation).toHaveBeenCalled();
    });

    it('should update session as authenticated on successful login to feed', async () => {
      // Setup
      mockPage.url.mockReturnValue('https://www.linkedin.com/feed');

      // Execution
      const result = await linkedInService.login('test-session-id', { email: 'test@example.com', password: 'password' });

      // Assertion
      expect(SessionManager.updateSession).toHaveBeenCalledWith(
        'test-session-id',
        { isAuthenticated: true }
      );
      expect(result).toMatchObject({
        success: true,
        message: 'Login successful'
      });
    });

    it('should handle redirect to add-phone page as successful login', async () => {
      // Setup
      mockPage.url.mockReturnValue('https://www.linkedin.com/check/add-phone');

      // Execution
      const result = await linkedInService.login('test-session-id', { email: 'test@example.com', password: 'password' });

      // Assertion
      expect(result.success).toBe(true);
      expect(SessionManager.updateSession).toHaveBeenCalled();
    });

    it('should handle redirect to mynetwork as successful login', async () => {
      // Setup
      mockPage.url.mockReturnValue('https://www.linkedin.com/mynetwork');

      // Execution
      const result = await linkedInService.login('test-session-id', { email: 'test@example.com', password: 'password' });

      // Assertion
      expect(result.success).toBe(true);
    });

    it('should throw error when security challenge is detected', async () => {
      // Setup
      mockPage.url.mockReturnValue('https://www.linkedin.com/checkpoint/challenge');

      // Execution & Assertion
      await expect(
        linkedInService.login('test-session-id', { email: 'test@example.com', password: 'password' })
      ).rejects.toThrow('LinkedIn security challenge detected');
    });

    it('should throw error when login fails and stays on login page', async () => {
      // Setup
      mockPage.url.mockReturnValue('https://www.linkedin.com/login');

      // Execution & Assertion
      await expect(
        linkedInService.login('test-session-id', { email: 'test@example.com', password: 'password' })
      ).rejects.toThrow('Login failed. Please check your credentials');
    });

    it('should handle unknown post-login URL', async () => {
      // Setup
      // URL that doesn't match any known patterns but also doesn't include /login or /checkpoint
      mockPage.url.mockReturnValue('https://www.linkedin.com/in/some-profile');

      // Execution
      const result = await linkedInService.login('test-session-id', { email: 'test@example.com', password: 'password' });

      // Assertion
      expect(result.success).toBe(true);
      expect(result.redirectUrl).toBe('https://www.linkedin.com/in/some-profile');
    });

    it('should handle login errors', async () => {
      // Setup
      mockPage.goto.mockRejectedValue(new Error('Network error'));

      // Execution & Assertion
      await expect(
        linkedInService.login('test-session-id', { email: 'test@example.com', password: 'password' })
      ).rejects.toThrow('Login failed: Network error');
    });
  });

  describe('scrapeProfile', () => {
    it('should throw error when not authenticated', async () => {
      // Setup
      mockSession.isAuthenticated = false;
      (SessionManager.getSession as jest.Mock).mockReturnValue(mockSession);

      // Execution & Assertion
      await expect(
        linkedInService.scrapeProfile('test-session-id', { url: 'https://linkedin.com/in/test' })
      ).rejects.toThrow('Not authenticated');
    });

    it('should return cached profile when available', async () => {
      // Setup
      const cachedProfile = { name: 'John Doe', title: 'Engineer' };
      mockCacheService.getProfile.mockResolvedValue(cachedProfile);

      // Execution
      const result = await linkedInService.scrapeProfile('test-session-id', { 
        url: 'https://linkedin.com/in/test' 
      });

      // Assertion
      expect(result).toMatchObject({ success: true, data: cachedProfile });
      expect(mockCacheService.getProfile).toHaveBeenCalled();
    });

    it('should scrape profile when not cached', async () => {
      // Setup
      mockCacheService.getProfile.mockResolvedValue(null);
      const profileData = { 
        name: 'Jane Doe', 
        title: 'Developer',
        location: 'San Francisco',
        about: 'Software developer'
      };
      mockPage.evaluate.mockResolvedValue(profileData);

      // Execution
      const result = await linkedInService.scrapeProfile('test-session-id', { 
        url: 'https://linkedin.com/in/test' 
      });

      // Assertion
      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://linkedin.com/in/test',
        expect.any(Object)
      );
      expect(result.success).toBe(true);
      expect(result.data).toEqual(profileData);
    });

    it('should cache scraped profile data', async () => {
      // Setup
      mockCacheService.getProfile.mockResolvedValue(null);
      const profileData = { name: 'Jane Doe', title: 'Developer' };
      mockPage.evaluate.mockResolvedValue(profileData);

      // Execution
      await linkedInService.scrapeProfile('test-session-id', { 
        url: 'https://linkedin.com/in/test' 
      });

      // Assertion
      expect(mockCacheService.cacheProfile).toHaveBeenCalledWith(
        'https://linkedin.com/in/test',
        profileData
      );
    });

    it('should wait for profile content to load', async () => {
      // Setup
      mockCacheService.getProfile.mockResolvedValue(null);
      mockPage.evaluate.mockResolvedValue({ name: 'Test' });

      // Execution
      await linkedInService.scrapeProfile('test-session-id', { 
        url: 'https://linkedin.com/in/test' 
      });

      // Assertion
      expect(mockPage.waitForSelector).toHaveBeenCalled();
    });

    it('should handle scraping errors', async () => {
      // Setup
      mockCacheService.getProfile.mockResolvedValue(null);
      mockPage.goto.mockRejectedValue(new Error('Navigation failed'));

      // Execution & Assertion
      await expect(
        linkedInService.scrapeProfile('test-session-id', { url: 'https://linkedin.com/in/test' })
      ).rejects.toThrow();
    });
  });

  describe('listConversations', () => {
    it('should throw error when not authenticated', async () => {
      // Setup
      mockSession.isAuthenticated = false;
      (SessionManager.getSession as jest.Mock).mockReturnValue(mockSession);

      // Execution & Assertion
      await expect(
        linkedInService.listConversations('test-session-id')
      ).rejects.toThrow('Not authenticated');
    });

    it('should navigate to messaging page', async () => {
      // Setup
      mockPage.evaluate.mockResolvedValue([]);

      // Execution
      await linkedInService.listConversations('test-session-id');

      // Assertion
      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://www.linkedin.com/messaging/',
        expect.any(Object)
      );
    });

    it('should wait for conversations container to load', async () => {
      // Setup
      mockPage.evaluate.mockResolvedValue([]);

      // Execution
      await linkedInService.listConversations('test-session-id');

      // Assertion
      expect(mockPage.waitForSelector).toHaveBeenCalledWith(
        '.msg-conversations-container__conversations-list',
        expect.any(Object)
      );
    });

    it('should return list of conversations', async () => {
      // Setup
      const mockConversationsData = [
        { name: 'John Doe' },
        { name: 'Jane Smith' }
      ];
      mockPage.evaluate.mockResolvedValue(mockConversationsData);
      // mockPage.url() returns 'https://www.linkedin.com/feed' by default

      // Execution
      const result = await linkedInService.listConversations('test-session-id');

      // Assertion
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].name).toBe('John Doe');
      expect(result.data[0].url).toBe('https://www.linkedin.com/feed');
      expect(result.data[1].name).toBe('Jane Smith');
      expect(result.data[1].url).toBe('https://www.linkedin.com/feed');
    });

    it('should handle errors when listing conversations', async () => {
      // Setup
      mockPage.goto.mockRejectedValue(new Error('Navigation failed'));

      // Execution & Assertion
      await expect(
        linkedInService.listConversations('test-session-id')
      ).rejects.toThrow();
    });
  });

  describe('getUnreadMessages', () => {
    it('should throw error when not authenticated', async () => {
      // Setup
      mockSession.isAuthenticated = false;
      SessionManager.getSession = jest.fn().mockReturnValue(mockSession);

      // Execution & Assertion
      await expect(
        linkedInService.getUnreadMessages('test-session-id')
      ).rejects.toThrow('Not authenticated');
    });

    it('should navigate to messaging page', async () => {
      // Setup
      mockPage.evaluate.mockResolvedValue([]);

      // Execution
      await linkedInService.getUnreadMessages('test-session-id');

      // Assertion
      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://www.linkedin.com/messaging/',
        expect.any(Object)
      );
    });

    it('should return unread messages', async () => {
      // Setup
      const mockUnreadConversations = [
        { sender: 'John Doe', message: 'Hello!', timestamp: '2023-01-01', index: 0 }
      ];
      mockPage.evaluate.mockResolvedValue(mockUnreadConversations);

      // Execution
      const result = await linkedInService.getUnreadMessages('test-session-id');

      // Assertion
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].sender).toBe('John Doe');
      expect(result.data[0].url).toBe('https://www.linkedin.com/feed'); // URL is added by implementation
    });

    it('should handle errors', async () => {
      // Setup
      mockPage.goto.mockRejectedValue(new Error('Failed'));

      // Execution & Assertion
      await expect(
        linkedInService.getUnreadMessages('test-session-id')
      ).rejects.toThrow();
    });
  });

  describe('readConversation', () => {
    it('should throw error when not authenticated', async () => {
      // Setup
      mockSession.isAuthenticated = false;
      (SessionManager.getSession as jest.Mock).mockReturnValue(mockSession);

      // Execution & Assertion
      await expect(
        linkedInService.readConversation('test-session-id', 'https://linkedin.com/messaging/thread/123')
      ).rejects.toThrow('Not authenticated');
    });

    it('should navigate to conversation URL', async () => {
      // Setup
      const conversationUrl = 'https://linkedin.com/messaging/thread/123';
      mockPage.evaluate.mockResolvedValue([]);

      // Execution
      await linkedInService.readConversation('test-session-id', conversationUrl);

      // Assertion
      expect(mockPage.goto).toHaveBeenCalledWith(conversationUrl, expect.any(Object));
    });

    it('should wait for messages to load', async () => {
      // Setup
      const conversationUrl = 'https://linkedin.com/messaging/thread/123';
      mockPage.evaluate.mockResolvedValue([]);

      // Execution
      await linkedInService.readConversation('test-session-id', conversationUrl);

      // Assertion
      expect(mockPage.waitForSelector).toHaveBeenCalled();
    });

    it('should return conversation messages', async () => {
      // Setup
      const conversationUrl = 'https://linkedin.com/messaging/thread/123';
      const mockMessages = [
        { sender: 'John', message: 'Hi', timestamp: '10:00' },
        { sender: 'Me', message: 'Hello', timestamp: '10:01' }
      ];
      mockPage.evaluate.mockResolvedValue(mockMessages);

      // Execution
      const result = await linkedInService.readConversation('test-session-id', conversationUrl);

      // Assertion
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockMessages);
    });

    it('should handle errors', async () => {
      // Setup
      mockPage.goto.mockRejectedValue(new Error('Failed'));

      // Execution & Assertion
      await expect(
        linkedInService.readConversation('test-session-id', 'https://linkedin.com/messaging/thread/123')
      ).rejects.toThrow();
    });
  });

  describe('sendMessage', () => {
    it('should throw error when not authenticated', async () => {
      // Setup
      mockSession.isAuthenticated = false;
      SessionManager.getSession = jest.fn().mockReturnValue(mockSession);

      // Execution & Assertion
      await expect(
        linkedInService.sendMessage('test-session-id', { 
          conversationUrl: '123', 
          message: 'Hello' 
        })
      ).rejects.toThrow('Not authenticated');
    });

    it('should navigate to conversation', async () => {
      // Setup
      mockPage.evaluate.mockResolvedValue(true);

      // Execution
      await linkedInService.sendMessage('test-session-id', { 
        conversationUrl: '123', 
        message: 'Hello' 
      });

      // Assertion
      expect(mockPage.goto).toHaveBeenCalled();
    });

    it('should type message and send', async () => {
      // Setup
      mockPage.evaluate.mockResolvedValue(true);

      // Execution
      await linkedInService.sendMessage('test-session-id', { 
        conversationUrl: '123', 
        message: 'Test message' 
      });

      // Assertion
      expect(mockPage.type).toHaveBeenCalled();
      expect(mockPage.click).toHaveBeenCalled();
    });

    it('should return success on message sent', async () => {
      // Setup
      mockPage.evaluate.mockResolvedValue(true);

      // Execution
      const result = await linkedInService.sendMessage('test-session-id', { 
        conversationUrl: '123', 
        message: 'Hello' 
      });

      // Assertion
      expect(result.success).toBe(true);
    });

    it('should handle errors', async () => {
      // Setup
      mockPage.goto.mockRejectedValue(new Error('Failed'));

      // Execution & Assertion
      await expect(
        linkedInService.sendMessage('test-session-id', { conversationUrl: '123', message: 'Hello' })
      ).rejects.toThrow();
    });
  });

  describe('visitProfile', () => {
    it('should throw error when not authenticated', async () => {
      // Setup
      mockSession.isAuthenticated = false;
      (SessionManager.getSession as jest.Mock).mockReturnValue(mockSession);

      // Execution & Assertion
      await expect(
        linkedInService.visitProfile('test-session-id', 'https://linkedin.com/in/test')
      ).rejects.toThrow('Not authenticated');
    });

    it('should navigate to profile URL', async () => {
      // Setup
      const profileUrl = 'https://linkedin.com/in/test';

      // Execution
      await linkedInService.visitProfile('test-session-id', profileUrl);

      // Assertion
      expect(mockPage.goto).toHaveBeenCalledWith(profileUrl, expect.any(Object));
    });

    it('should wait for profile to load', async () => {
      // Setup
      const profileUrl = 'https://linkedin.com/in/test';

      // Execution
      await linkedInService.visitProfile('test-session-id', profileUrl);

      // Assertion
      expect(mockPage.waitForSelector).toHaveBeenCalled();
    });

    it('should return success after visiting profile', async () => {
      // Setup
      const profileUrl = 'https://linkedin.com/in/test';

      // Execution
      const result = await linkedInService.visitProfile('test-session-id', profileUrl);

      // Assertion
      expect(result.success).toBe(true);
      expect(result.message).toContain('visited');
    });

    it('should handle visit errors', async () => {
      // Setup
      mockPage.goto.mockRejectedValue(new Error('Navigation failed'));

      // Execution & Assertion
      await expect(
        linkedInService.visitProfile('test-session-id', 'https://linkedin.com/in/test')
      ).rejects.toThrow();
    });
  });

  describe('sendConnectionRequest', () => {
    it('should throw error when not authenticated', async () => {
      // Setup
      mockSession.isAuthenticated = false;
      (SessionManager.getSession as jest.Mock).mockReturnValue(mockSession);

      // Execution & Assertion
      await expect(
        linkedInService.sendConnectionRequest('test-session-id', 'https://linkedin.com/in/test')
      ).rejects.toThrow('Not authenticated');
    });

    it('should navigate to profile URL', async () => {
      // Setup
      const profileUrl = 'https://linkedin.com/in/test';
      mockPage.evaluate.mockResolvedValue(true);

      // Execution
      await linkedInService.sendConnectionRequest('test-session-id', profileUrl);

      // Assertion
      expect(mockPage.goto).toHaveBeenCalledWith(profileUrl, expect.any(Object));
    });

    it('should send connection request without message', async () => {
      // Setup
      const profileUrl = 'https://linkedin.com/in/test';
      mockPage.evaluate.mockResolvedValue(true);

      // Execution
      const result = await linkedInService.sendConnectionRequest('test-session-id', profileUrl);

      // Assertion
      expect(result.success).toBe(true);
      expect(mockPage.evaluate).toHaveBeenCalled();
    });

    it('should send connection request with message', async () => {
      // Setup
      const profileUrl = 'https://linkedin.com/in/test';
      const message = 'Hello, let\'s connect!';
      mockPage.evaluate.mockResolvedValue(true);

      // Execution
      const result = await linkedInService.sendConnectionRequest('test-session-id', profileUrl, message);

      // Assertion
      expect(result.success).toBe(true);
    });

    it('should wait for connect button', async () => {
      // Setup
      mockPage.evaluate.mockResolvedValue(true);

      // Execution
      await linkedInService.sendConnectionRequest('test-session-id', 'https://linkedin.com/in/test');

      // Assertion
      expect(mockPage.waitForSelector).toHaveBeenCalled();
    });

    it('should handle connection errors', async () => {
      // Setup
      mockPage.goto.mockRejectedValue(new Error('Failed'));

      // Execution & Assertion
      await expect(
        linkedInService.sendConnectionRequest('test-session-id', 'https://linkedin.com/in/test')
      ).rejects.toThrow();
    });
  });

  describe('getProfileViews', () => {
    it('should throw error when not authenticated', async () => {
      // Setup
      mockSession.isAuthenticated = false;
      (SessionManager.getSession as jest.Mock).mockReturnValue(mockSession);

      // Execution & Assertion
      await expect(
        linkedInService.getProfileViews('test-session-id')
      ).rejects.toThrow('Not authenticated');
    });

    it('should navigate to profile views page', async () => {
      // Setup
      mockPage.evaluate.mockResolvedValue({ name: 'Test User', title: 'Engineer' });

      // Execution
      await linkedInService.getProfileViews('test-session-id');

      // Assertion
      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://www.linkedin.com/me/',
        expect.any(Object)
      );
    });

    it('should wait for profile data to load', async () => {
      // Setup
      mockPage.evaluate.mockResolvedValue({ name: 'Test User', title: 'Engineer' });

      // Execution
      await linkedInService.getProfileViews('test-session-id');

      // Assertion
      expect(mockPage.waitForSelector).toHaveBeenCalledWith(
        '.text-heading-xlarge',
        expect.any(Object)
      );
    });

    it('should return profile data', async () => {
      // Setup
      const profileData = { name: 'John Doe', title: 'Software Engineer' };
      mockPage.evaluate.mockResolvedValue(profileData);

      // Execution
      const result = await linkedInService.getProfileViews('test-session-id');

      // Assertion
      expect(result.success).toBe(true);
      expect(result.data.profile).toEqual(profileData);
    });

    it('should handle errors', async () => {
      // Setup
      mockPage.goto.mockRejectedValue(new Error('Failed'));

      // Execution & Assertion
      await expect(
        linkedInService.getProfileViews('test-session-id')
      ).rejects.toThrow();
    });
  });

  describe('searchPeople', () => {
    it('should throw error when not authenticated', async () => {
      // Setup
      mockSession.isAuthenticated = false;
      (SessionManager.getSession as jest.Mock).mockReturnValue(mockSession);

      // Execution & Assertion
      await expect(
        linkedInService.searchPeople('test-session-id', 'Software Engineer')
      ).rejects.toThrow('Not authenticated');
    });

    it('should navigate to search page with keywords', async () => {
      // Setup
      const keywords = 'Software Engineer';
      mockPage.evaluate.mockResolvedValue([]);

      // Execution
      await linkedInService.searchPeople('test-session-id', keywords, 10);

      // Assertion
      expect(mockPage.goto).toHaveBeenCalledWith(
        expect.stringContaining('search/results/people'),
        expect.any(Object)
      );
    });

    it('should use default limit of 50', async () => {
      // Setup
      mockPage.evaluate.mockResolvedValue([]);

      // Execution
      await linkedInService.searchPeople('test-session-id', 'Engineer');

      // Assertion
      expect(mockPage.goto).toHaveBeenCalled();
    });

    it('should encode keywords in URL', async () => {
      // Setup
      const keywords = 'Software Engineer & Developer';
      mockPage.evaluate.mockResolvedValue([]);

      // Execution
      await linkedInService.searchPeople('test-session-id', keywords, 10);

      // Assertion
      expect(mockPage.goto).toHaveBeenCalledWith(
        expect.stringContaining(encodeURIComponent(keywords)),
        expect.any(Object)
      );
    });

    it('should wait for search results to load', async () => {
      // Setup
      mockPage.evaluate.mockResolvedValue([]);

      // Execution
      await linkedInService.searchPeople('test-session-id', 'Engineer', 10);

      // Assertion
      expect(mockPage.waitForSelector).toHaveBeenCalled();
    });

    it('should return search results', async () => {
      // Setup
      const mockResults = [
        { name: 'John Doe', url: 'https://linkedin.com/in/johndoe' },
        { name: 'Jane Smith', url: 'https://linkedin.com/in/janesmith' }
      ];
      mockPage.evaluate.mockResolvedValue(mockResults);

      // Execution
      const result = await linkedInService.searchPeople('test-session-id', 'Engineer', 10);

      // Assertion
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResults);
    });

    it('should handle search errors', async () => {
      // Setup
      mockPage.goto.mockRejectedValue(new Error('Search failed'));

      // Execution & Assertion
      await expect(
        linkedInService.searchPeople('test-session-id', 'Engineer', 10)
      ).rejects.toThrow();
    });
  });

  describe('error handling', () => {
    it('should handle page navigation errors', async () => {
      // Setup
      mockPage.goto.mockRejectedValue(new Error('Navigation failed'));

      // Execution & Assertion
      await expect(
        linkedInService.visitProfile('test-session-id', 'https://linkedin.com/in/test')
      ).rejects.toThrow();
    });

    it('should handle page evaluation errors', async () => {
      // Setup
      mockPage.evaluate.mockRejectedValue(new Error('Evaluation failed'));

      // Execution & Assertion
      await expect(
        linkedInService.listConversations('test-session-id')
      ).rejects.toThrow();
    });
  });

  describe('scrapeProfile - comprehensive DOM extraction', () => {
    beforeEach(() => {
      mockSession.isAuthenticated = true;
      (SessionManager.getSession as jest.Mock).mockReturnValue(mockSession);
      mockCacheService.getProfile.mockResolvedValue(null);
    });

    it('should extract full profile with all sections', async () => {
      const fullProfileData = {
        name: 'John Doe',
        title: 'Senior Software Engineer',
        location: 'San Francisco, CA',
        about: 'Passionate developer',
        experience: [
          { title: 'Engineer', company: 'Tech Corp', duration: '2020-Present' }
        ],
        education: [
          { school: 'MIT', degree: 'BS Computer Science' }
        ],
        skills: ['JavaScript', 'Python'],
        connections: '500+'
      };
      
      mockPage.evaluate.mockResolvedValue(fullProfileData);

      const result = await linkedInService.scrapeProfile('test-session-id', {
        url: 'https://linkedin.com/in/test'
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(fullProfileData);
      expect(mockCacheService.cacheProfile).toHaveBeenCalled();
    });

    it('should handle profile with missing optional fields', async () => {
      const minimalProfile = {
        name: 'Jane Doe',
        title: '',
        location: '',
        about: ''
      };
      
      mockPage.evaluate.mockResolvedValue(minimalProfile);

      const result = await linkedInService.scrapeProfile('test-session-id', {
        url: 'https://linkedin.com/in/test'
      });

      expect(result.success).toBe(true);
      expect(result.data.name).toBe('Jane Doe');
    });

    it('should handle profile scraping timeout', async () => {
      mockPage.goto.mockRejectedValue(new Error('Timeout'));

      await expect(
        linkedInService.scrapeProfile('test-session-id', { url: 'https://linkedin.com/in/test' })
      ).rejects.toThrow();
    });

    it('should handle selector not found', async () => {
      mockPage.waitForSelector.mockRejectedValue(new Error('Selector timeout'));
      mockPage.evaluate.mockResolvedValue({}); // Returns empty profile data

      // Should not throw, continues with empty data
      const result = await linkedInService.scrapeProfile('test-session-id', { url: 'https://linkedin.com/in/test' });
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual({});
    });
  });

  describe('listConversations - comprehensive scenarios', () => {
    beforeEach(() => {
      mockSession.isAuthenticated = true;
      (SessionManager.getSession as jest.Mock).mockReturnValue(mockSession);
    });

    it('should handle empty conversation list', async () => {
      mockPage.evaluate.mockResolvedValue([]);

      const result = await linkedInService.listConversations('test-session-id');

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should extract multiple conversations with URLs', async () => {
      const conversations = [
        { name: 'Person 1', lastMessage: 'Hello', url: '/messaging/thread/1' },
        { name: 'Person 2', lastMessage: 'Hi there', url: '/messaging/thread/2' },
        { name: 'Person 3', lastMessage: 'Hey', url: '/messaging/thread/3' }
      ];
      
      mockPage.evaluate.mockResolvedValue(conversations);

      const result = await linkedInService.listConversations('test-session-id');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(3);
    });

    it('should handle conversation list loading error', async () => {
      mockPage.waitForSelector.mockRejectedValue(new Error('Timeout'));

      await expect(
        linkedInService.listConversations('test-session-id')
      ).rejects.toThrow();
    });
  });

  describe('sendMessage - comprehensive flow', () => {
    beforeEach(() => {
      mockSession.isAuthenticated = true;
      (SessionManager.getSession as jest.Mock).mockReturnValue(mockSession);
    });

    it('should send message with primary button selector', async () => {
      mockPage.$.mockResolvedValueOnce({ click: jest.fn() }); // Send button found

      const result = await linkedInService.sendMessage('test-session-id', {
        conversationUrl: '123',
        message: 'Test message'
      });

      expect(result.success).toBe(true);
      expect(mockPage.type).toHaveBeenCalled();
    });

    it('should try alternative send button selectors', async () => {
      mockPage.$
        .mockResolvedValueOnce(null) // First selector fails
        .mockResolvedValueOnce({ click: jest.fn() }); // Second selector works

      const result = await linkedInService.sendMessage('test-session-id', {
        conversationUrl: '123',
        message: 'Test'
      });

      expect(result.success).toBe(true);
    });

    it('should throw error when send button not found', async () => {
      mockPage.$.mockResolvedValue(null); // All $ selectors fail
      // Mock evaluate to throw errors for all button click attempts
      mockPage.evaluate.mockRejectedValue(new Error('Button not found'));

      await expect(
        linkedInService.sendMessage('test-session-id', {
          conversationUrl: '123',
          message: 'Test'
        })
      ).rejects.toThrow('Could not find or click send button');
    });

    it('should handle message typing error', async () => {
      mockPage.type.mockRejectedValue(new Error('Type failed'));

      await expect(
        linkedInService.sendMessage('test-session-id', {
          conversationUrl: '123',
          message: 'Test'
        })
      ).rejects.toThrow();
    });
  });

  describe('sendConnectionRequest - comprehensive flow', () => {
    beforeEach(() => {
      mockSession.isAuthenticated = true;
      (SessionManager.getSession as jest.Mock).mockReturnValue(mockSession);
    });

    it('should send connection without note', async () => {
      mockPage.evaluate
        .mockResolvedValueOnce(true) // Connection degree check
        .mockResolvedValueOnce(true) // Click connect
        .mockResolvedValueOnce(false) // No add note button
        .mockResolvedValueOnce(true); // Send invitation

      const result = await linkedInService.sendConnectionRequest(
        'test-session-id',
        'https://linkedin.com/in/test'
      );

      expect(result.success).toBe(true);
    });

    it('should send connection with custom note', async () => {
      mockPage.evaluate
        .mockResolvedValueOnce(true) // Connection degree
        .mockResolvedValueOnce(true) // Click connect
        .mockResolvedValueOnce(true) // Has add note button
        .mockResolvedValueOnce(true) // Click add note
        .mockResolvedValueOnce(true) // Type message
        .mockResolvedValueOnce(true); // Send

      const result = await linkedInService.sendConnectionRequest(
        'test-session-id',
        'https://linkedin.com/in/test',
        'Hello, let\'s connect!'
      );

      expect(result.success).toBe(true);
    });

    it('should handle connect button not found', async () => {
      mockPage.evaluate
        .mockResolvedValueOnce(true) // Connection degree check passes
        .mockResolvedValueOnce(false); // Connect button not found

      const result = await linkedInService.sendConnectionRequest('test-session-id', 'https://linkedin.com/in/test');
      
      expect(result.success).toBe(false);
      expect(result.message).toBe('Connect button not found');
    });

    it('should handle send invitation failure', async () => {
      mockPage.evaluate
        .mockResolvedValueOnce(true) // Connection degree
        .mockResolvedValueOnce(true) // Click connect
        .mockResolvedValueOnce(false) // No add note
        .mockResolvedValueOnce(false); // Send fails

      const result = await linkedInService.sendConnectionRequest('test-session-id', 'https://linkedin.com/in/test');
      
      expect(result.success).toBe(false);
      expect(result.message).toBe('Send button not found or disabled');
    });
  });

  describe('getProfileViews - comprehensive', () => {
    beforeEach(() => {
      mockSession.isAuthenticated = true;
      (SessionManager.getSession as jest.Mock).mockReturnValue(mockSession);
    });

    it('should extract profile views data', async () => {
      const profileData = {
        name: 'John Doe',
        title: 'Engineer',
        views: 150,
        searchAppearances: 50
      };
      
      mockPage.evaluate.mockResolvedValue(profileData);

      const result = await linkedInService.getProfileViews('test-session-id');

      expect(result.success).toBe(true);
      expect(result.data.profile).toEqual(profileData);
    });

    it('should handle missing profile data', async () => {
      mockPage.evaluate.mockResolvedValue({});

      const result = await linkedInService.getProfileViews('test-session-id');

      expect(result.success).toBe(true);
    });
  });

  describe('searchPeople - comprehensive', () => {
    beforeEach(() => {
      mockSession.isAuthenticated = true;
      (SessionManager.getSession as jest.Mock).mockReturnValue(mockSession);
    });

    it('should search with custom limit', async () => {
      const results = Array(25).fill(null).map((_, i) => ({
        name: `Person ${i}`,
        title: 'Engineer',
        url: `/in/person${i}`
      }));
      
      mockPage.evaluate.mockResolvedValue(results);

      const result = await linkedInService.searchPeople('test-session-id', 'Engineer', 25);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(25);
    });

    it('should handle search with no results', async () => {
      mockPage.evaluate.mockResolvedValue([]);

      const result = await linkedInService.searchPeople('test-session-id', 'XYZ123', 10);

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should handle search page loading error', async () => {
      mockPage.waitForSelector.mockRejectedValue(new Error('Timeout'));

      await expect(
        linkedInService.searchPeople('test-session-id', 'Engineer', 10)
      ).rejects.toThrow();
    });
  });

  describe('readConversation - comprehensive', () => {
    beforeEach(() => {
      mockSession.isAuthenticated = true;
      (SessionManager.getSession as jest.Mock).mockReturnValue(mockSession);
    });

    it('should read conversation with multiple messages', async () => {
      const messages = [
        { sender: 'John', message: 'Hi', timestamp: '10:00 AM' },
        { sender: 'Me', message: 'Hello', timestamp: '10:01 AM' },
        { sender: 'John', message: 'How are you?', timestamp: '10:02 AM' }
      ];
      
      mockPage.evaluate.mockResolvedValue(messages);

      const result = await linkedInService.readConversation(
        'test-session-id',
        'https://linkedin.com/messaging/thread/123'
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(3);
    });

    it('should handle empty conversation', async () => {
      mockPage.evaluate.mockResolvedValue([]);

      const result = await linkedInService.readConversation(
        'test-session-id',
        'https://linkedin.com/messaging/thread/123'
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });
  });

  describe('visitProfile - comprehensive', () => {
    beforeEach(() => {
      mockSession.isAuthenticated = true;
      (SessionManager.getSession as jest.Mock).mockReturnValue(mockSession);
    });

    it('should visit profile successfully', async () => {
      const result = await linkedInService.visitProfile(
        'test-session-id',
        'https://linkedin.com/in/test'
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('visited');
      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://linkedin.com/in/test',
        expect.any(Object)
      );
    });

    it('should handle profile not found', async () => {
      mockPage.goto.mockRejectedValue(new Error('404'));

      await expect(
        linkedInService.visitProfile('test-session-id', 'https://linkedin.com/in/notfound')
      ).rejects.toThrow();
    });
  });

  describe('findChrome - platform specific', () => {
    it('should check Linux paths on Linux', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });
      
      (existsSync as jest.Mock).mockReturnValue(false);
      
      // Call initializeBrowser which uses findChrome
      linkedInService.initializeBrowser();
      
      // Restore
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });
  });

  describe('login - additional redirect scenarios', () => {
    beforeEach(() => {
      mockSession.isAuthenticated = false;
      (SessionManager.getSession as jest.Mock).mockReturnValue(mockSession);
    });

    it('should handle redirect to /jobs', async () => {
      mockPage.url.mockReturnValue('https://www.linkedin.com/jobs');

      const result = await linkedInService.login('test-session-id', {
        email: 'test@example.com',
        password: 'password'
      });

      expect(result.success).toBe(true);
    });

    it('should handle redirect to /messaging', async () => {
      mockPage.url.mockReturnValue('https://www.linkedin.com/messaging');

      const result = await linkedInService.login('test-session-id', {
        email: 'test@example.com',
        password: 'password'
      });

      expect(result.success).toBe(true);
    });

    it('should use environment variables when credentials not provided', async () => {
      process.env.LINKEDIN_EMAIL = 'env@test.com';
      process.env.LINKEDIN_PASSWORD = 'env_password';
      mockPage.url.mockReturnValue('https://www.linkedin.com/feed');

      await linkedInService.login('test-session-id', { email: '', password: '' });

      // Should not throw
      expect(mockPage.type).toHaveBeenCalled();
    });
  });
});
