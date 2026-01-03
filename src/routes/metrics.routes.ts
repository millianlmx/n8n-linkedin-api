import { Router, Request, Response } from 'express';
import MetricsService from '../services/MetricsService';
import LinkedInBrowser from '../services/LinkedInBrowser';

const router = Router();

/**
 * GET /metrics
 * Expose metrics in Prometheus format
 * This endpoint is scraped by Prometheus
 */
router.get('/metrics', async (_req: Request, res: Response) => {
    try {
        // Update active sessions count before exporting metrics
        // With singleton browser, we have 0 or 1 active session
        const sessionCount = LinkedInBrowser.isReady() ? 1 : 0;
        MetricsService.updateActiveSessions(sessionCount);

        // Get metrics in Prometheus text format
        const metrics = await MetricsService.getMetrics();

        res.set('Content-Type', 'text/plain; version=0.0.4');
        res.send(metrics);
    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: 'Failed to generate metrics',
            error: error.message,
        });
    }
});

/**
 * GET /api/metrics/health
 * Health check for monitoring system
 */
router.get('/api/metrics/health', (_req: Request, res: Response) => {
    const status = LinkedInBrowser.getStatus();
    res.json({
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        activeSessions: status.ready ? 1 : 0,
        isAuthenticated: status.authenticated,
    });
});

/**
 * GET /api/metrics/json
 * Get metrics in JSON format (for debugging)
 */
router.get('/api/metrics/json', async (_req: Request, res: Response) => {
    try {
        // Update active sessions count
        const sessionCount = LinkedInBrowser.isReady() ? 1 : 0;
        MetricsService.updateActiveSessions(sessionCount);

        const metrics = await MetricsService.getMetricsJSON();
        res.json({
            success: true,
            metrics,
            timestamp: new Date().toISOString(),
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: 'Failed to generate metrics',
            error: error.message,
        });
    }
});

export default router;
