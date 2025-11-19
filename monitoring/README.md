# Monitoring Configuration

This directory contains the configuration files for the LinkedIn API monitoring stack (Prometheus + Grafana).

## Structure

```
monitoring/
├── prometheus.yml                          # Prometheus configuration
├── grafana/
│   ├── provisioning/
│   │   ├── datasources/
│   │   │   └── datasources.yml            # Auto-configure Prometheus datasource
│   │   └── dashboards/
│   │       └── dashboard.yml              # Dashboard provider config
│   └── dashboards/
│       └── linkedin-api-dashboard.json    # Pre-built dashboard
```

## Quick Start

1. **Start monitoring stack**:
   ```bash
   docker-compose --profile monitoring up -d
   ```

2. **Access Grafana**:
   - URL: http://localhost:3001
   - Username: `admin`
   - Password: `admin`

3. **View dashboard**:
   - Navigate to Dashboards → Browse
   - Select "LinkedIn API Monitoring"

## Configuration Details

### Prometheus (`prometheus.yml`)
- Scrapes metrics from LinkedIn API every 15 seconds
- Retains data for 15 days
- Scrapes endpoint: `http://api:8080/metrics`

### Grafana Datasource (`grafana/provisioning/datasources/datasources.yml`)
- Automatically configures Prometheus as the default datasource
- No manual configuration needed

### Dashboard (`grafana/dashboards/linkedin-api-dashboard.json`)
Pre-configured panels:
- Request rate and error rate gauges
- Response time percentiles (P50, P95, P99)
- LinkedIn operation success/failure rates
- Active sessions and memory usage
- Slow operation tracking

## Customization

### Modify Scrape Interval
Edit `prometheus.yml`:
```yaml
global:
  scrape_interval: 30s  # Change from 15s to 30s
```

### Change Retention Period
Edit `docker-compose.yml`:
```yaml
prometheus:
  command:
    - '--storage.tsdb.retention.time=30d'  # Change from 15d to 30d
```

### Add New Dashboard Panels
1. Edit existing dashboard in Grafana UI
2. Export JSON (Share → Export → Save to file)
3. Replace `grafana/dashboards/linkedin-api-dashboard.json`
4. Restart Grafana: `docker-compose restart grafana`

## Troubleshooting

**Dashboard not loading?**
- Check that datasource UID matches in dashboard JSON
- Verify Prometheus is running: `docker ps | grep prometheus`
- Check logs: `docker logs linkedin-prometheus`

**No data in panels?**
- Verify API is exposing metrics: `curl http://localhost:8080/metrics`
- Check Prometheus targets: http://localhost:9090/targets
- Ensure API container is on `linkedin-network`

**Grafana admin password?**
Change in `docker-compose.yml`:
```yaml
grafana:
  environment:
    - GF_SECURITY_ADMIN_PASSWORD=your_password_here
```

## More Information

See [MONITORING.md](../MONITORING.md) for comprehensive monitoring guide.
