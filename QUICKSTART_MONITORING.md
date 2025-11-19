# Quick Start: Monitoring System

## 🚀 Get Started in 3 Steps

### 1. Start the Monitoring Stack

```bash
# Start all services with monitoring
docker-compose --profile monitoring up -d

# Or if you want to start everything
docker-compose --profile production up -d
```

### 2. Access the Dashboards

Open in your browser:
- **Grafana Dashboard**: http://localhost:3001 (admin/admin)
- **Prometheus**: http://localhost:9090
- **API Metrics**: http://localhost:8080/metrics

### 3. View Real-Time Metrics

In Grafana:
1. Navigate to **Dashboards** → **Browse**
2. Select **"LinkedIn API Monitoring"**
3. Watch metrics update in real-time!

---

## 📊 What You'll See

### Key Metrics Dashboard Includes:

- ✅ **Request Rate** - Requests per second
- ✅ **Error Rate** - % of failed requests  
- ✅ **Response Times** - P50, P95, P99 latencies
- ✅ **LinkedIn Operations** - Scraping, messaging success/failure
- ✅ **Active Sessions** - Browser sessions count
- ✅ **Memory Usage** - Process memory consumption
- ✅ **Slow Operations** - Operations exceeding thresholds

---

## 🧪 Test It Out

Generate some traffic:

```bash
# Health check
curl http://localhost:8080/health

# View raw metrics
curl http://localhost:8080/metrics

# Check metrics health
curl http://localhost:8080/api/metrics/health
```

Then refresh your Grafana dashboard to see the data!

---

## 📖 Learn More

- **Full Documentation**: [MONITORING.md](./MONITORING.md)
- **Setup Guide**: [monitoring/README.md](./monitoring/README.md)
- **Implementation Details**: See walkthrough.md in artifacts

---

## ⚠️ Troubleshooting

**No data in Grafana?**
```bash
# Check if Prometheus is scraping
curl http://localhost:9090/api/v1/targets

# Verify API is exposing metrics
curl http://localhost:8080/metrics
```

**Dashboard not loading?**
```bash
# Restart Grafana
docker-compose restart grafana
```

---

## 🛑 Stop Monitoring

```bash
# Stop monitoring services only
docker-compose stop prometheus grafana

# Remove all monitoring services
docker-compose --profile monitoring down
```

---

That's it! You now have a full monitoring system tracking your LinkedIn API's performance! 🎉
