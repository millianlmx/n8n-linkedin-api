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
});

export default app;
