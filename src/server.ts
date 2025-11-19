import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes';
import profileRoutes from './routes/profile.routes';
import connectionRoutes from './routes/connection.routes';
import messageRoutes from './routes/message.routes';
import searchRoutes from './routes/search.routes';
import metricsRoutes from './routes/metrics.routes';
import { metricsMiddleware } from './middleware/metrics.middleware';
import SessionManager from './services/SessionManager';
import LinkedInService from './services/LinkedInService';
import { createServiceLogger } from './utils/logger';

// Load environment variables
dotenv.config();

const log = createServiceLogger('Server');

// Global session ID for auto-initialized session
let globalSessionId: string | null = null;

const app: Application = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Metrics middleware - must be registered early to track all requests
app.use(metricsMiddleware);

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  log.info(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Get global session endpoint
app.get('/api/session', (req: Request, res: Response) => {
  if (!globalSessionId) {
    return res.status(404).json({
      success: false,
      message: 'No active session. Auto-initialization may have failed.',
    });
  }

  const session = SessionManager.getSession(globalSessionId);
  if (!session) {
    return res.status(404).json({
      success: false,
      message: 'Session not found',
    });
  }

  res.json({
    success: true,
    sessionId: globalSessionId,
    isAuthenticated: session.isAuthenticated,
    hasMonitoring: !!session.monitoringPage,
    currentUrl: session.page.url(),
  });
});

// Metrics routes (must be registered before other routes to avoid being caught by middleware)
app.use(metricsRoutes);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/connection', connectionRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/search', searchRoutes);

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'LinkedIn Scraper API',
    version: '1.0.0',
    description: 'REST API for LinkedIn automation and scraping',
    endpoints: {
      auth: {
        'POST /api/auth/init': 'Initialize a new browser session',
        'POST /api/auth/login': 'Login to LinkedIn',
        'DELETE /api/auth/logout': 'Logout and close session',
        'GET /api/auth/sessions': 'Get all active sessions',
      },
      profile: {
        'POST /api/profile/scrape': 'Scrape a LinkedIn profile',
        'POST /api/profile/visit': 'Visit a LinkedIn profile',
        'GET /api/profile/views': 'Get profile views',
      },
      connection: {
        'POST /api/connection/connect': 'Send connection request',
      },
      messages: {
        'GET /api/messages/conversations': 'List all conversations',
        'GET /api/messages/conversation': 'Read specific conversation',
        'POST /api/messages/send': 'Send a message',
      },
    },
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
  });
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  log.error('Error:', err);
  res.status(500).json({
    success: false,
    message: err.message || 'Internal server error',
  });
});

// Cleanup expired sessions every 10 minutes
setInterval(() => {
  SessionManager.cleanupExpiredSessions();
}, 10 * 60 * 1000);

// Graceful shutdown
process.on('SIGTERM', async () => {
  log.info('SIGTERM received, closing server...');
  const sessions = SessionManager.getAllSessions();
  for (const session of sessions) {
    await SessionManager.deleteSession(session.id);
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  log.info('SIGINT received, closing server...');
  const sessions = SessionManager.getAllSessions();
  for (const session of sessions) {
    await SessionManager.deleteSession(session.id);
  }
  process.exit(0);
});

// Auto-initialize browser and login on startup
async function autoInitialize() {
  try {
    log.info('\n🚀 Auto-initializing LinkedIn session...\n');

    // Initialize browser
    log.info('📥 Initializing browser...');
    const result = await LinkedInService.initializeBrowser(process.env.LINKEDIN_EMAIL);
    const { browser, page, sessionRestored, isAuthenticated } = result as {
      browser: any;
      page: any;
      sessionRestored?: boolean;
      isAuthenticated?: boolean;
    };
    globalSessionId = SessionManager.createSession(browser, page);
    log.info(`✅ Browser initialized with session ID: ${globalSessionId}`);

    // If session was restored and is valid, skip login
    if (sessionRestored && isAuthenticated) {
      log.info('✅ Using restored session - skipping login');

      // Mark session as authenticated
      SessionManager.updateSession(globalSessionId, { isAuthenticated: true });

      // Start message monitoring automatically
      try {
        await LinkedInService.startMessageMonitoring(globalSessionId);
        log.info('✅ Message monitoring started automatically');
        log.info('\n🎉 System ready! All features active.\n');
      } catch (monitorError: any) {
        log.warn('⚠️  Could not start message monitoring:', monitorError.message);
        log.warn('   You can start it manually using POST /api/messages/monitor/start\n');
      }
      return;
    }

    // Check if credentials are available
    const email = process.env.LINKEDIN_EMAIL;
    const password = process.env.LINKEDIN_PASSWORD;

    if (!email || !password) {
      log.warn('⚠️  LinkedIn credentials not found in .env file');
      log.warn('   Please set LINKEDIN_EMAIL and LINKEDIN_PASSWORD');
      log.warn('   You can login manually using POST /api/auth/login\n');
      return;
    }

    // Auto-login
    log.info('🔐 Attempting auto-login...');
    try {
      await LinkedInService.login(globalSessionId, { email, password });
      log.info('✅ Auto-login successful!');
      log.info('✅ Message monitoring started automatically');
      log.info('\n🎉 System ready! All features active.\n');
    } catch (loginError: any) {
      if (loginError.message.includes('security challenge')) {
        log.warn('⚠️  LinkedIn security challenge detected');
        log.warn('   Please complete the challenge in the browser');
        log.warn('   Then use POST /api/auth/force-authenticate\n');
      } else {
        log.error('❌ Auto-login failed:', loginError.message);
        log.warn('   You can login manually using POST /api/auth/login\n');
      }
    }
  } catch (error: any) {
    log.error('❌ Auto-initialization failed:', error.message);
    log.warn('   You can initialize manually using POST /api/auth/init\n');
  }
}

// Start server
app.listen(PORT, async () => {
  log.info(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║        LinkedIn Scraper API Server                        ║
║                                                           ║
║        Server running on: http://localhost:${PORT}           ║
║        Environment: ${process.env.NODE_ENV || 'development'}                           ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
  log.info('API Documentation available at: http://localhost:' + PORT);
  log.info('\nReady to accept requests!\n');

  // Auto-initialize after server starts
  await autoInitialize();
});

export default app;
