import { Request, Response, NextFunction } from 'express';
import MetricsService from '../services/MetricsService';
import { createServiceLogger } from '../utils/logger';

const log = createServiceLogger('MetricsMiddleware');

/**
 * Middleware to track HTTP request metrics
 * This should be registered early in the middleware stack
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
    // Skip metrics collection for the /metrics endpoint itself
    if (req.path === '/metrics') {
        return next();
    }

    const startTime = Date.now();

    // Store original end function
    const originalEnd = res.end.bind(res);

    // Override res.end to capture metrics after response is sent
    (res.end as any) = function (chunk?: any, encodingOrCallback?: any, callback?: any) {
        // Calculate duration in seconds
        const duration = (Date.now() - startTime) / 1000;

        // Get route pattern (normalize dynamic routes)
        const route = normalizeRoute(req.path);
        const method = req.method;
        const statusCode = res.statusCode;

        // Track the request
        MetricsService.trackHttpRequest(method, route, statusCode, duration);

        // Log slow requests
        if (duration > 2) {
            log.warn(`Slow request detected: ${method} ${route} - ${duration.toFixed(2)}s`);
        }

        // Log errors
        if (statusCode >= 400) {
            const errorType = getErrorType(statusCode);
            MetricsService.trackHttpError(method, route, errorType);

            if (statusCode >= 500) {
                log.error(`Server error: ${method} ${route} - Status ${statusCode}`);
            }
        }

        // Call original end function
        return originalEnd(chunk, encodingOrCallback, callback);
    };

    next();
}

/**
 * Normalize route to group similar paths together
 * E.g., /api/profile/scrape/123 -> /api/profile/scrape/:id
 */
function normalizeRoute(path: string): string {
    // Health check
    if (path === '/health') return '/health';

    // Root
    if (path === '/') return '/';

    // API routes - remove trailing slashes
    let normalized = path.replace(/\/$/, '');

    // Replace UUIDs and session IDs with placeholders
    normalized = normalized.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':sessionId');

    // Replace numeric IDs
    normalized = normalized.replace(/\/\d+/g, '/:id');

    // Replace LinkedIn profile URLs
    normalized = normalized.replace(/linkedin\.com\/in\/[^/]+/g, 'linkedin.com/in/:profile');

    return normalized;
}

/**
 * Categorize errors by status code
 */
function getErrorType(statusCode: number): string {
    if (statusCode === 400) return 'bad_request';
    if (statusCode === 401) return 'unauthorized';
    if (statusCode === 403) return 'forbidden';
    if (statusCode === 404) return 'not_found';
    if (statusCode === 429) return 'rate_limit';
    if (statusCode >= 400 && statusCode < 500) return 'client_error';
    if (statusCode === 500) return 'internal_error';
    if (statusCode === 502) return 'bad_gateway';
    if (statusCode === 503) return 'service_unavailable';
    if (statusCode === 504) return 'gateway_timeout';
    if (statusCode >= 500) return 'server_error';
    return 'unknown';
}
