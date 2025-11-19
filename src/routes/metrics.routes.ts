import { Router, Request, Response } from 'express';
import MetricsService from '../services/MetricsService';
import SessionManager from '../services/SessionManager';

const router = Router();

/**
 * GET /metrics
 * Expose metrics in Prometheus format
 * This endpoint is scraped by Prometheus
 */
router.get('/metrics', async (req: Request, res: Response) => {
    try {
        // Update active sessions count before exporting metrics
        const sessions = SessionManager.getAllSessions();
        MetricsService.updateActiveSessions(sessions.length);

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
router.get('/api/metrics/health', (req: Request, res: Response) => {
    res.json({
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        activeSessions: SessionManager.getAllSessions().length,
    });
});

/**
 * GET /api/metrics/json
 * Get metrics in JSON format (for debugging)
 */
router.get('/api/metrics/json', async (req: Request, res: Response) => {
    try {
        // Update active sessions count
        const sessions = SessionManager.getAllSessions();
        MetricsService.updateActiveSessions(sessions.length);

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
