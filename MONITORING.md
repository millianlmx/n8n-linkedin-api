# API Monitoring Guide

## Overview

The LinkedIn Scraper API includes a comprehensive monitoring system built with **Prometheus** and **Grafana**. This system tracks performance metrics, errors, LinkedIn operation success rates, and resource usage.

## Quick Start

### Starting the Monitoring Stack

```bash
# Start with monitoring profile
docker-compose --profile monitoring up -d

# Or start all services (including monitoring)
docker-compose --profile production up -d
```

### Accessing the Dashboards

- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001
  - Username: `admin`
  - Password: `admin`
- **Metrics Endpoint**: http://localhost:8080/metrics

## Architecture

```
┌─────────────────┐
│  LinkedIn API   │
│   (Port 8080)   │
└────────┬────────┘
         │ /metrics
         │
         ▼
┌─────────────────┐
│   Prometheus    │
│   (Port 9090)   │ 
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    Grafana      │
│   (Port 3001)   │
└─────────────────┘
```

## Available Metrics

### HTTP Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `linkedin_api_http_request_duration_seconds` | Histogram | HTTP request duration with percentiles (p50, p95, p99) |
| `linkedin_api_http_requests_total` | Counter | Total HTTP requests by method, route, and status code |
| `linkedin_api_http_request_errors_total` | Counter | Total HTTP errors by endpoint and error type |

### LinkedIn Business Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `linkedin_api_operation_duration_seconds` | Histogram | Duration of LinkedIn operations (scraping, messaging, etc.) |
| `linkedin_api_operations_total` | Counter | Total LinkedIn operations by type and status (success/failure) |
| `linkedin_api_slow_operations_total` | Counter | Operations exceeding 2s, 5s, or 10s thresholds |

### Browser/Puppeteer Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `linkedin_api_browser_action_duration_seconds` | Histogram | Duration of browser actions (click, type, navigate) |
| `linkedin_api_browser_lifecycle_total` | Counter | Browser lifecycle events (init,crash, restart, close) |
| `linkedin_api_active_sessions` | Gauge | Number of currently active browser sessions |

### Resource Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `linkedin_api_cache_operations_total` | Counter | Cache hit/miss rates |
| `linkedin_api_captcha_total` | Counter | CAPTCHA encounters (detected, solved, failed) |
| `linkedin_api_rate_limit_total` | Counter | Rate limit encounters by endpoint |
| `linkedin_api_process_resident_memory_bytes` | Gauge | Process memory usage |
| `linkedin_api_process_cpu_user_seconds_total` | Counter | CPU time used |

## Dashboard Panels

The pre-configured Grafana dashboard includes:

### 1. Overview
- **Request Rate**: Requests per second
- **Error Rate**: Percentage of failed requests
- **Response Time Percentiles**: P50, P95, P99 latencies

### 2. Performance
- **Slow Operations**: Operations exceeding time thresholds
- **Operation Duration**: Histogram of operation times

### 3. Business Metrics
- **LinkedIn Operations (Success)**: Successful profile scrapes, messages sent, connections
- **LinkedIn Operations (Failures)**: Failed operations by type

### 4. Resources
- **Active Sessions**: Current browser sessions
- **Memory Usage**: Process memory consumption
- **Cache Performance**: Hit/miss ratios

## Querying Metrics

### Prometheus Queries

**Average response time:**
```promql
rate(linkedin_api_http_request_duration_seconds_sum[5m]) / 
rate(linkedin_api_http_request_duration_seconds_count[5m])
```

**Error rate:**
```promql
(rate(linkedin_api_http_request_errors_total[5m]) / 
rate(linkedin_api_http_requests_total[5m])) * 100
```

**Successful profile scrapes per minute:**
```promql
rate(linkedin_api_operations_total{operation_type="profile_scrape",status="success"}[1m]) * 60
```

**Cache hit rate:**
```promql
rate(linkedin_api_cache_operations_total{result="hit"}[5m]) / 
rate(linkedin_api_cache_operations_total{operation="get"}[5m]) * 100
```

## Performance Thresholds

### Response Times
- **Good**: < 1s (P95)
- **Acceptable**: 1-2s (P95)
- **Slow**: 2-5s (P95)
- **Critical**: > 5s (P95)

### Error Rates
- **Healthy**: < 1%
- **Warning**: 1-5%
- **Critical**: > 5%

### LinkedIn Operations
- **Profile Scraping**: < 5s average
- **Sending Messages**: < 3s average
- **Connection Requests**: < 4s average

## Troubleshooting

### No Data in Grafana

1. **Check Prometheus is scraping**:
   ```bash
   curl http://localhost:9090/api/v1/targets
   ```
   Look for the `linkedin-api` target with status "UP"

2. **Verify metrics endpoint**:
   ```bash
   curl http://localhost:8080/metrics
   ```

3. **Check Docker network**:
   ```bash
   docker network inspect windsurf-project-3_linkedin-network
   ```

### High Error Rates

1. Check error breakdown:
   ```promql
   sum by(error_type) (rate(linkedin_api_http_request_errors_total[5m]))
   ```

2. Review logs:
   ```bash
   docker logs linkedin-api
   ```

### Slow Operations

1. Identify slow operation types:
   ```promql
   topk(5, sum by(operation_type) (rate(linkedin_api_slow_operations_total[5m])))
   ```

2. Check for rate limiting:
   ```promql
   rate(linkedin_api_rate_limit_total[5m])
   ```

## Configuration Files

### Prometheus Configuration
Location: `monitoring/prometheus.yml`

```yaml
scrape_interval: 15s  # How often to scrape metrics
retention: 15d        # How long to keep data
```

### Grafana Configuration
- Datasources: `monitoring/grafana/provisioning/datasources/`
- Dashboards: `monitoring/grafana/dashboards/`

## Data Retention

- **Prometheus**: 15 days (configurable in `prometheus.yml`)
- **Grafana**: Unlimited (stored in `grafana_data` volume)

## Backup and Restore

### Backup
```bash
# Backup Prometheus data
docker run --rm -v windsurf-project-3_prometheus_data:/data -v $(pwd):/backup \
  alpine tar czf /backup/prometheus-backup.tar.gz /data

# Backup Grafana data
docker run --rm -v windsurf-project-3_grafana_data:/data -v $(pwd):/backup \
  alpine tar czf /backup/grafana-backup.tar.gz /data
```

### Restore
```bash
# Restore Prometheus data
docker run --rm -v windsurf-project-3_prometheus_data:/data -v $(pwd):/backup \
  alpine tar xzf /backup/prometheus-backup.tar.gz -C /

# Restore Grafana data
docker run --rm -v windsurf-project-3_grafana_data:/data -v $(pwd):/backup \
  alpine tar xzf /backup/grafana-backup.tar.gz -C /
```

## Custom Metrics

Want to add your own metrics? Use the MetricsService:

```typescript
import MetricsService from './services/MetricsService';

// Track a custom operation
const startTime = Date.now();
try {
  // Your operation
  const duration = (Date.now() - startTime) / 1000;
  MetricsService.trackLinkedInOperation('custom_operation', duration, true);
} catch (error) {
  const duration = (Date.now() - startTime) / 1000;
  MetricsService.trackLinkedInOperation('custom_operation', duration, false);
}
```

## Stopping the Monitoring Stack

```bash
# Stop monitoring services only
docker-compose stop prometheus grafana

# Remove monitoring services
docker-compose --profile monitoring down
```

## Best Practices

1. **Regular Monitoring**: Check dashboards daily
2. **Set Baselines**: Understand normal performance patterns
3. **Alert on Anomalies**: Set up alerts for critical thresholds
4. **Review Trends**: Weekly review of slow operations and error rates
5. **Clean Up**: Periodically export and archive old metrics

## Support

For issues or questions:
1. Check the [main documentation](FULL_DOCUMENTATION.md)
2. Review Prometheus/Grafana logs
3. Verify network connectivity between services
