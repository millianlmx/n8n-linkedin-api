import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes';
import profileRoutes from './routes/profile.routes';
import connectionRoutes from './routes/connection.routes';
import messageRoutes from './routes/message.routes';
import searchRoutes from './routes/search.routes';
import SessionManager from './services/SessionManager';
import LinkedInService from './services/LinkedInService';

// Load environment variables
dotenv.config();

// Global session ID for auto-initialized session
let globalSessionId: string | null = null;

const app: Application = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
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
  console.error('Error:', err);
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
  console.log('SIGTERM received, closing server...');
  const sessions = SessionManager.getAllSessions();
  for (const sessionId of sessions) {
    await SessionManager.deleteSession(sessionId);
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing server...');
  const sessions = SessionManager.getAllSessions();
  for (const sessionId of sessions) {
    await SessionManager.deleteSession(sessionId);
  }
  process.exit(0);
});

// Auto-initialize browser and login on startup
async function autoInitialize() {
  try {
    console.log('\n🚀 Auto-initializing LinkedIn session...\n');
    
    // Initialize browser
    console.log('📥 Initializing browser...');
    const result = await LinkedInService.initializeBrowser(process.env.LINKEDIN_EMAIL);
    const { browser, page, sessionRestored, isAuthenticated } = result as { 
      browser: any; 
      page: any; 
      sessionRestored?: boolean;
      isAuthenticated?: boolean;
    };
    globalSessionId = SessionManager.createSession(browser, page);
    console.log(`✅ Browser initialized with session ID: ${globalSessionId}`);
    
    // If session was restored and is valid, skip login
    if (sessionRestored && isAuthenticated) {
      console.log('✅ Using restored session - skipping login');
      
      // Mark session as authenticated
      SessionManager.updateSession(globalSessionId, { isAuthenticated: true });
      
      // Start message monitoring automatically
      try {
        await LinkedInService.startMessageMonitoring(globalSessionId);
        console.log('✅ Message monitoring started automatically');
        console.log('\n🎉 System ready! All features active.\n');
      } catch (monitorError: any) {
        console.warn('⚠️  Could not start message monitoring:', monitorError.message);
        console.warn('   You can start it manually using POST /api/messages/monitor/start\n');
      }
      return;
    }
    
    // Check if credentials are available
    const email = process.env.LINKEDIN_EMAIL;
    const password = process.env.LINKEDIN_PASSWORD;
    
    if (!email || !password) {
      console.warn('⚠️  LinkedIn credentials not found in .env file');
      console.warn('   Please set LINKEDIN_EMAIL and LINKEDIN_PASSWORD');
      console.warn('   You can login manually using POST /api/auth/login\n');
      return;
    }
    
    // Auto-login
    console.log('🔐 Attempting auto-login...');
    try {
      await LinkedInService.login(globalSessionId, { email, password });
      console.log('✅ Auto-login successful!');
      console.log('✅ Message monitoring started automatically');
      console.log('\n🎉 System ready! All features active.\n');
    } catch (loginError: any) {
      if (loginError.message.includes('security challenge')) {
        console.warn('⚠️  LinkedIn security challenge detected');
        console.warn('   Please complete the challenge in the browser');
        console.warn('   Then use POST /api/auth/force-authenticate\n');
      } else {
        console.error('❌ Auto-login failed:', loginError.message);
        console.warn('   You can login manually using POST /api/auth/login\n');
      }
    }
  } catch (error: any) {
    console.error('❌ Auto-initialization failed:', error.message);
    console.warn('   You can initialize manually using POST /api/auth/init\n');
  }
}

// Start server
app.listen(PORT, async () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║        LinkedIn Scraper API Server                        ║
║                                                           ║
║        Server running on: http://localhost:${PORT}           ║
║        Environment: ${process.env.NODE_ENV || 'development'}                           ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
  console.log('API Documentation available at: http://localhost:' + PORT);
  console.log('\nReady to accept requests!\n');
  
  // Auto-initialize after server starts
  await autoInitialize();
});

export default app;
