import { Request, Response, NextFunction } from 'express';
import LinkedInBrowser from '../services/LinkedInBrowser';
import { createServiceLogger } from '../utils/logger';

const log = createServiceLogger('SessionMiddleware');

/**
 * Extended Request type with browser state
 */
export interface AuthenticatedRequest extends Request {
  browserReady: boolean;
  isAuthenticated: boolean;
}

/**
 * Middleware that requires browser to be initialized
 * Use this for routes that need browser access but not authentication
 */
export function requireBrowser(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthenticatedRequest;
  
  if (!LinkedInBrowser.isReady()) {
    log.warn('Browser not ready - request rejected');
    res.status(503).json({
      error: 'Browser not initialized',
      message: 'The browser service is not ready. Please wait for initialization or call POST /api/auth/initialize',
      code: 'BROWSER_NOT_READY'
    });
    return;
  }

  authReq.browserReady = true;
  authReq.isAuthenticated = LinkedInBrowser.isAuthenticated();
  
  next();
}

/**
 * Middleware that requires browser to be authenticated with LinkedIn
 * Use this for routes that require a logged-in session
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthenticatedRequest;

  if (!LinkedInBrowser.isReady()) {
    log.warn('Browser not ready - auth request rejected');
    res.status(503).json({
      error: 'Browser not initialized',
      message: 'The browser service is not ready. Please call POST /api/auth/initialize first',
      code: 'BROWSER_NOT_READY'
    });
    return;
  }

  if (!LinkedInBrowser.isAuthenticated()) {
    log.warn('Not authenticated - request rejected');
    res.status(401).json({
      error: 'Not authenticated',
      message: 'Please log in first by calling POST /api/auth/login',
      code: 'NOT_AUTHENTICATED'
    });
    return;
  }

  authReq.browserReady = true;
  authReq.isAuthenticated = true;
  
  next();
}

/**
 * Middleware that attaches browser status to request without blocking
 * Use this for routes that can handle both authenticated and unauthenticated states
 */
export function attachBrowserStatus(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthenticatedRequest;
  
  authReq.browserReady = LinkedInBrowser.isReady();
  authReq.isAuthenticated = LinkedInBrowser.isAuthenticated();
  
  next();
}
