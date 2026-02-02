# External Integrations

**Analysis Date:** 2026-02-02

## APIs & External Services

**LinkedIn:**
- LinkedIn.com - Primary platform for automation
  - Automation: Custom Puppeteer-based browser automation
  - Authentication: Email/password via Puppeteer forms
  - CAPTCHA solving: 2Captcha API integration

**n8n Workflow Automation:**
- n8n - Workflow automation platform
  - Connection: Local service on port 5678
  - SDK/Client: Custom node package (`n8n-nodes-linkedin-api`)
  - Endpoints:
    - POST /n8n/webhook/name/LinkedInMessageMonitor - Webhook for message monitoring
    - GET /api/auth/sessions - Session status endpoint

**Monitoring APIs:**
- Prometheus - Metrics collection
  - SDK/Client: prom-client (Node.js)
  - Endpoint: /metrics (exposed on port 9090)
  - Configuration: ./monitoring/prometheus.yml

- Grafana - Visualization and monitoring
  - SDK/Client: Grafana Dashboard API
  - Endpoint: http://localhost:3001 (port 3000 internally)
  - Configuration: ./monitoring/grafana/provisioning

## Data Storage

**Databases:**
- PostgreSQL 15 - Primary data storage
  - Connection: linkedin-db:5432 (Docker service)
  - Client: pg (Node.js)
  - Environment variables:
    - DB_HOST=linkedin-db
    - DB_PORT=5432
    - DB_USER=postgres
    - DB_PASSWORD=postgres
    - DB_NAME=linkedin

**File Storage:**
- Local filesystem - Browser data persistence
  - Path: /usr/src/app/.browser-data (Docker container)
  - Volume: browser_data (Docker volume)

**Caching:**
- In-memory caching - Custom CacheService implementation
  - Implementation: CacheService in src/services/CacheService.ts

## Authentication & Identity

**Auth Provider:**
- Custom authentication - Direct LinkedIn login automation
  - Implementation: Puppeteer form automation in LinkedInService.ts
  - Environment: LINKEDIN_EMAIL, LINKEDIN_PASSWORD

**Session Management:**
- Cookie-based - Maintained via Puppeteer browser
  - Persistence: Session storage saved to disk
  - Auto-restore: Session restoration on startup

## Monitoring & Observability

**Error Tracking:**
- Built-in Winston logging - Error tracking via structured logs
  - Levels: info, warn, error
  - Files: src/utils/logger.ts
  - Configuration: createServiceLogger factory

**Metrics:**
- Prometheus metrics - Performance and operation tracking
  - SDK: prom-client
  - Metrics Service: MetricsService in src/services/MetricsService.ts
  - Endpoint: /api/metrics

**Logs:**
- Winston structured logging - Centralized logging
  - Format: JSON with timestamps
  - Locations: src/utils/logger.ts, src/services/*.ts

## CI/CD & Deployment

**Hosting:**
- Docker containers - Containerized deployment
  - Dockerfile: Custom Node.js image with Chromium
  - Docker Compose: Multi-service orchestration

**CI Pipeline:**
- GitHub Actions - Basic workflow management
  - Configuration: .github/ directory
  - Features: Automated testing and deployment

**Custom Nodes:**
- n8n Custom Nodes - LinkedIn integration nodes
  - Location: ./n8n_custom_nodes/
  - Package: n8n-nodes-linkedin-api
  - Nodes: Login, Profile, Connection, Messaging, Search

## Environment Configuration

**Required env vars:**
- LINKEDIN_EMAIL - LinkedIn account email
- LINKEDIN_PASSWORD - LinkedIn account password
- CAPTCHA_API_KEY - 2Captcha service API key
- DB_HOST - Database host (default: linkedin-db)
- DB_PORT - Database port (default: 5432)
- DB_USER - Database username (default: postgres)
- DB_PASSWORD - Database password (default: postgres)
- DB_NAME - Database name (default: linkedin)
- PORT - API server port (default: 8080)

**Secrets location:**
- .env file - Local development
- Docker secrets - Production deployment
- Environment variables - Container runtime

## Webhooks & Callbacks

**Incoming:**
- n8n Webhooks - Message monitoring callbacks
  - Endpoint: POST /n8n/webhook/name/LinkedInMessageMonitor
  - Service: LinkedInMessageMonitor n8n custom node

**Outgoing:**
- LinkedIn API requests - Automated LinkedIn operations
  - Service: LinkedInService.ts
  - Operations: Login, profile scraping, connection requests, messaging

---

*Integration audit: 2026-02-02*