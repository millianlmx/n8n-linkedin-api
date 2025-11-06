# Docker Deployment Guide

## Overview

This guide explains how to deploy the LinkedIn API and n8n workflow automation using Docker containers.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Network                        │
│                  (linkedin-network)                      │
│                                                          │
│  ┌──────────────────┐         ┌──────────────────┐     │
│  │   API Service    │         │   n8n Service    │     │
│  │  (Port 8080)     │◄────────│   (Port 5678)    │     │
│  │                  │         │                  │     │
│  │  - Node.js       │         │  - Workflow UI   │     │
│  │  - Chromium      │         │  - Custom Nodes  │     │
│  │  - Xvfb          │         │                  │     │
│  └──────────────────┘         └──────────────────┘     │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## Files Created

### 1. Dockerfile

The Dockerfile for the LinkedIn API service includes:

- **Base Image:** `node:latest`
- **System Dependencies:**
  - `wget`, `gnupg`, `ca-certificates`, `apt-transport-https`
  - `chromium`, `chromium-driver` (for puppeteer-real-browser)
  - `xvfb` (virtual display for headless mode)
  - Additional libraries for Chromium support
- **Environment Variables:**
  - `CHROME_BIN=/usr/bin/chromium`
  - `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true`
  - `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`
- **Build Process:**
  1. Copy `package*.json`
  2. Run `npm install`
  3. Copy source code
  4. Run `npm run build` (TypeScript compilation)
  5. Start with `npm start`

### 2. docker-compose.yml

Defines two services:

#### API Service
- **Build:** From local Dockerfile
- **Port:** 8080:8080
- **Environment:** Loads from `.env` file
- **Chrome Settings:**
  - `shm_size: '2g'` - Shared memory for Chrome
  - `cap_add: ['SYS_ADMIN']` - Required for Chrome sandbox
- **Network:** linkedin-network

#### n8n Service
- **Image:** `n8nio/n8n:latest`
- **Port:** 5678:5678
- **Volumes:**
  - `n8n_data` - Persistent workflow data
  - `./n8n_custom_nodes` - Custom API nodes
- **Depends on:** API service
- **Network:** linkedin-network

### 3. .dockerignore

Excludes unnecessary files from Docker build:
- `node_modules` (reinstalled in container)
- `dist` (rebuilt in container)
- `.env` (loaded separately)
- Development files

## Prerequisites

### 1. Create n8n Custom Nodes Directory

```bash
mkdir -p n8n_custom_nodes
```

### 2. Prepare Custom Nodes

You need to place your **compiled** custom node files in `./n8n_custom_nodes`:

```
n8n_custom_nodes/
├── package.json
├── LinkedInApiCredential.js
├── LinkedInCreateSession.js
├── LinkedInLogin.js
├── LinkedInScrapeProfile.js
├── LinkedInSendConnection.js
├── LinkedInListConversations.js
├── LinkedInGetMessages.js
├── LinkedInSendMessage.js
└── ... (other compiled .js files)
```

**Important:** These must be the **compiled JavaScript files**, not TypeScript source files.

### 3. Configure .env File

Ensure your `.env` file contains all necessary environment variables:

```env
# LinkedIn Credentials (optional - can be provided via API)
LINKEDIN_EMAIL=your-email@example.com
LINKEDIN_PASSWORD=your-password

# API Configuration
PORT=8080
NODE_ENV=production

# Chrome Configuration (set by Dockerfile, but can override)
CHROME_BIN=/usr/bin/chromium
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
```

## Deployment Steps

### 1. Build and Start Services

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f api
docker-compose logs -f n8n
```

### 2. Verify Services

**API Service:**
```bash
# Check if API is running
curl http://localhost:8080

# Create a session
curl -X POST http://localhost:8080/api/auth/session
```

**n8n Service:**
- Open browser: http://localhost:5678
- Default credentials: `admin` / `admin` (change in docker-compose.yml)

### 3. Configure n8n LinkedIn API Credential

When setting up the "LinkedIn API Credential" in n8n:

**⚠️ IMPORTANT: Use Docker Internal Network Address**

```
Base URL: http://api:8080
```

**NOT** `http://localhost:8080` - this won't work because n8n needs to communicate with the API service over Docker's internal network.

## Custom Node Setup in n8n

### Option 1: Manual Installation (Recommended for Development)

1. Create your custom nodes in TypeScript
2. Compile to JavaScript: `tsc`
3. Copy compiled `.js` files to `./n8n_custom_nodes/`
4. Restart n8n: `docker-compose restart n8n`

### Option 2: npm Package (Recommended for Production)

1. Package your nodes as an npm module
2. Install in n8n container:
   ```bash
   docker-compose exec n8n npm install your-linkedin-nodes-package
   ```

### Custom Nodes Structure

Your `n8n_custom_nodes/package.json` should look like:

```json
{
  "name": "n8n-nodes-linkedin-api",
  "version": "1.0.0",
  "description": "LinkedIn API nodes for n8n",
  "main": "index.js",
  "n8n": {
    "nodes": [
      "dist/LinkedInCreateSession.js",
      "dist/LinkedInLogin.js",
      "dist/LinkedInScrapeProfile.js",
      "dist/LinkedInSendConnection.js",
      "dist/LinkedInListConversations.js",
      "dist/LinkedInGetMessages.js",
      "dist/LinkedInSendMessage.js"
    ],
    "credentials": [
      "dist/LinkedInApiCredential.js"
    ]
  }
}
```

## Docker Commands

### Start Services
```bash
docker-compose up -d
```

### Stop Services
```bash
docker-compose down
```

### Rebuild API Service
```bash
docker-compose build api
docker-compose up -d api
```

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f n8n
```

### Access Container Shell
```bash
# API container
docker-compose exec api /bin/bash

# n8n container
docker-compose exec n8n /bin/sh
```

### Remove All Data (Reset)
```bash
# Stop and remove containers, networks, volumes
docker-compose down -v

# Remove images
docker-compose down --rmi all
```

## Troubleshooting

### Chrome/Chromium Issues

If you see Chrome-related errors:

1. **Check Chrome is installed:**
   ```bash
   docker-compose exec api which chromium
   ```

2. **Verify environment variables:**
   ```bash
   docker-compose exec api env | grep CHROME
   ```

3. **Increase shared memory:**
   - Already set to `2g` in docker-compose.yml
   - If still issues, increase to `4g`

### n8n Can't Connect to API

**Problem:** n8n shows connection errors to LinkedIn API

**Solution:**
- Use `http://api:8080` (not `localhost:8080`)
- Verify both services are on same network:
  ```bash
  docker network inspect windsurf-project-3_linkedin-network
  ```

### Custom Nodes Not Loading

**Problem:** Custom nodes don't appear in n8n

**Solutions:**

1. **Check files are mounted:**
   ```bash
   docker-compose exec n8n ls -la /home/node/.n8n/nodes
   ```

2. **Verify files are compiled JavaScript:**
   - Must be `.js` files, not `.ts`
   - Check `package.json` has correct `n8n` section

3. **Restart n8n:**
   ```bash
   docker-compose restart n8n
   ```

4. **Check n8n logs:**
   ```bash
   docker-compose logs n8n | grep -i "custom\|node"
   ```

### Permission Issues

If you see permission errors:

```bash
# Fix ownership of n8n_custom_nodes
sudo chown -R 1000:1000 n8n_custom_nodes

# Or make world-readable
chmod -R 755 n8n_custom_nodes
```

## Production Considerations

### 1. Security

**Change n8n credentials:**
```yaml
environment:
  - N8N_BASIC_AUTH_USER=your-username
  - N8N_BASIC_AUTH_PASSWORD=your-strong-password
```

**Use HTTPS:**
- Add nginx reverse proxy
- Configure SSL certificates
- Update `N8N_PROTOCOL=https`

### 2. Resource Limits

Add resource limits to prevent container from consuming all resources:

```yaml
services:
  api:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '1'
          memory: 2G
```

### 3. Monitoring

Add health checks:

```yaml
services:
  api:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

### 4. Backup

Backup n8n data regularly:

```bash
# Backup n8n volume
docker run --rm -v windsurf-project-3_n8n_data:/data -v $(pwd):/backup \
  alpine tar czf /backup/n8n-backup-$(date +%Y%m%d).tar.gz /data

# Restore n8n volume
docker run --rm -v windsurf-project-3_n8n_data:/data -v $(pwd):/backup \
  alpine tar xzf /backup/n8n-backup-YYYYMMDD.tar.gz -C /
```

## Environment Variables Reference

### API Service

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | API server port | `8080` |
| `NODE_ENV` | Environment | `production` |
| `CHROME_BIN` | Chrome executable path | `/usr/bin/chromium` |
| `PUPPETEER_EXECUTABLE_PATH` | Puppeteer Chrome path | `/usr/bin/chromium` |
| `LINKEDIN_EMAIL` | LinkedIn email (optional) | - |
| `LINKEDIN_PASSWORD` | LinkedIn password (optional) | - |

### n8n Service

| Variable | Description | Default |
|----------|-------------|---------|
| `N8N_BASIC_AUTH_ACTIVE` | Enable basic auth | `true` |
| `N8N_BASIC_AUTH_USER` | Admin username | `admin` |
| `N8N_BASIC_AUTH_PASSWORD` | Admin password | `admin` |
| `N8N_HOST` | Listen address | `0.0.0.0` |
| `N8N_PORT` | n8n port | `5678` |
| `N8N_PROTOCOL` | Protocol | `http` |

## Quick Start Checklist

- [ ] Create `n8n_custom_nodes` directory
- [ ] Compile and copy custom node `.js` files to `n8n_custom_nodes/`
- [ ] Create `package.json` in `n8n_custom_nodes/`
- [ ] Configure `.env` file with credentials
- [ ] Run `docker-compose up -d`
- [ ] Access n8n at http://localhost:5678
- [ ] Configure LinkedIn API credential with `http://api:8080`
- [ ] Test API connection from n8n
- [ ] Create your first workflow!

## Summary

✅ **Dockerfile** - Optimized for puppeteer-real-browser with Chromium  
✅ **docker-compose.yml** - Two-service setup (API + n8n)  
✅ **Network isolation** - Services communicate via internal network  
✅ **Persistent storage** - n8n data preserved in volume  
✅ **Custom nodes** - Mounted from local directory  
✅ **Production-ready** - Includes restart policies and resource management  

**Your LinkedIn API and n8n are now ready to deploy with Docker!** 🐳🚀
