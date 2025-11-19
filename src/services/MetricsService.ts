import { register, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';

/**
 * Metrics Service
 * Centralized service for managing all Prometheus metrics
 */
class MetricsService {
    // Enable default metrics collection (CPU, memory, event loop, etc.)
    constructor() {
        collectDefaultMetrics({ prefix: 'linkedin_api_' });
    }

    // ============================================
    // HTTP Request Metrics
    // ============================================

    /**
     * HTTP request duration histogram
     * Tracks response time distribution with percentiles (p50, p95, p99)
     */
    httpRequestDuration = new Histogram({
        name: 'linkedin_api_http_request_duration_seconds',
        help: 'Duration of HTTP requests in seconds',
        labelNames: ['method', 'route', 'status_code'],
        buckets: [0.1, 0.5, 1, 2, 5, 10, 30], // Buckets in seconds
    });

    /**
     * HTTP request total counter
     * Tracks total number of requests
     */
    httpRequestTotal = new Counter({
        name: 'linkedin_api_http_requests_total',
        help: 'Total number of HTTP requests',
        labelNames: ['method', 'route', 'status_code'],
    });

    /**
     * HTTP request errors counter
     * Tracks errors by endpoint and error type
     */
    httpRequestErrors = new Counter({
        name: 'linkedin_api_http_request_errors_total',
        help: 'Total number of HTTP request errors',
        labelNames: ['method', 'route', 'error_type'],
    });

    // ============================================
    // LinkedIn Business Metrics
    // ============================================

    /**
     * LinkedIn operation duration histogram
     * Tracks how long specific LinkedIn operations take
     */
    linkedinOperationDuration = new Histogram({
        name: 'linkedin_api_operation_duration_seconds',
        help: 'Duration of LinkedIn operations in seconds',
        labelNames: ['operation_type'],
        buckets: [0.5, 1, 2, 5, 10, 30, 60, 120], // Longer buckets for scraping operations
    });

    /**
     * LinkedIn operation total counter
     * Tracks success/failure of LinkedIn operations
     */
    linkedinOperationTotal = new Counter({
        name: 'linkedin_api_operations_total',
        help: 'Total number of LinkedIn operations',
        labelNames: ['operation_type', 'status'], // status: success, failure
    });

    /**
     * Slow operation counter
     * Tracks operations that exceed specific thresholds
     */
    slowOperationTotal = new Counter({
        name: 'linkedin_api_slow_operations_total',
        help: 'Total number of slow operations',
        labelNames: ['operation_type', 'threshold'], // threshold: 2s, 5s, 10s
    });

    // ============================================
    // Browser/Puppeteer Metrics
    // ============================================

    /**
     * Browser action duration histogram
     * Tracks Puppeteer browser actions timing
     */
    browserActionDuration = new Histogram({
        name: 'linkedin_api_browser_action_duration_seconds',
        help: 'Duration of browser actions in seconds',
        labelNames: ['action_type'], // e.g., click, type, navigate, wait
        buckets: [0.1, 0.5, 1, 2, 5, 10],
    });

    /**
     * Browser lifecycle counter
     * Tracks browser initialization, crashes, restarts
     */
    browserLifecycleTotal = new Counter({
        name: 'linkedin_api_browser_lifecycle_total',
        help: 'Total browser lifecycle events',
        labelNames: ['event_type'], // init, crash, restart, close
    });

    /**
     * Active sessions gauge
     * Tracks number of currently active browser sessions
     */
    activeSessionsGauge = new Gauge({
        name: 'linkedin_api_active_sessions',
        help: 'Number of active browser sessions',
    });

    // ============================================
    // Resource Metrics
    // ============================================

    /**
     * Cache hit/miss counter
     * Tracks cache effectiveness
     */
    cacheOperationsTotal = new Counter({
        name: 'linkedin_api_cache_operations_total',
        help: 'Total cache operations',
        labelNames: ['operation', 'result'], // operation: get, set; result: hit, miss
    });

    /**
     * CAPTCHA encounters counter
     * Tracks how often CAPTCHAs are encountered
     */
    captchaTotal = new Counter({
        name: 'linkedin_api_captcha_total',
        help: 'Total CAPTCHA encounters',
        labelNames: ['status'], // detected, solved, failed
    });

    /**
     * Rate limit encounters counter
     * Tracks when rate limits are hit
     */
    rateLimitTotal = new Counter({
        name: 'linkedin_api_rate_limit_total',
        help: 'Total rate limit encounters',
        labelNames: ['endpoint'],
    });

    // ============================================
    // Helper Methods
    // ============================================

    /**
     * Track an HTTP request
     */
    trackHttpRequest(method: string, route: string, statusCode: number, duration: number) {
        const labels = { method, route, status_code: statusCode.toString() };
        this.httpRequestDuration.observe(labels, duration);
        this.httpRequestTotal.inc(labels);
    }

    /**
     * Track an HTTP error
     */
    trackHttpError(method: string, route: string, errorType: string) {
        this.httpRequestErrors.inc({ method, route, error_type: errorType });
    }

    /**
     * Track a LinkedIn operation with automatic slow operation detection
     */
    trackLinkedInOperation(operationType: string, duration: number, success: boolean) {
        // Track duration
        this.linkedinOperationDuration.observe({ operation_type: operationType }, duration);

        // Track success/failure
        this.linkedinOperationTotal.inc({
            operation_type: operationType,
            status: success ? 'success' : 'failure',
        });

        // Track slow operations
        if (duration > 2) {
            this.slowOperationTotal.inc({ operation_type: operationType, threshold: '2s' });
        }
        if (duration > 5) {
            this.slowOperationTotal.inc({ operation_type: operationType, threshold: '5s' });
        }
        if (duration > 10) {
            this.slowOperationTotal.inc({ operation_type: operationType, threshold: '10s' });
        }
    }

    /**
     * Track a browser action
     */
    trackBrowserAction(actionType: string, duration: number) {
        this.browserActionDuration.observe({ action_type: actionType }, duration);
    }

    /**
     * Track browser lifecycle event
     */
    trackBrowserLifecycle(eventType: 'init' | 'crash' | 'restart' | 'close') {
        this.browserLifecycleTotal.inc({ event_type: eventType });
    }

    /**
     * Update active sessions count
     */
    updateActiveSessions(count: number) {
        this.activeSessionsGauge.set(count);
    }

    /**
     * Track cache operation
     */
    trackCacheOperation(operation: 'get' | 'set', result: 'hit' | 'miss' | 'success') {
        this.cacheOperationsTotal.inc({ operation, result });
    }

    /**
     * Track CAPTCHA encounter
     */
    trackCaptcha(status: 'detected' | 'solved' | 'failed') {
        this.captchaTotal.inc({ status });
    }

    /**
     * Track rate limit encounter
     */
    trackRateLimit(endpoint: string) {
        this.rateLimitTotal.inc({ endpoint });
    }

    /**
     * Get metrics in Prometheus format
     */
    async getMetrics(): Promise<string> {
        return register.metrics();
    }

    /**
     * Get metrics as JSON (for debugging)
     */
    async getMetricsJSON() {
        return register.getMetricsAsJSON();
    }

    /**
     * Reset all metrics (useful for testing)
     */
    reset() {
        register.clear();
    }
}

// Export singleton instance
export default new MetricsService();
