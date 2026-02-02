# Technology Stack

**Analysis Date:** 2026-02-02

## Languages

**Primary:**
- TypeScript 5.2.2 - Main application code for LinkedIn automation API
- JavaScript - Runtime for Node.js and n8n workflows

**Secondary:**
- HTML - LinkedIn web page interaction
- CSS - LinkedIn web page styling

## Runtime

**Environment:**
- Node.js latest - Runtime for the API server
- Chromium - Headless browser for automation (via Puppeteer)

**Package Manager:**
- npm 10.x - Package manager for dependencies
- Lockfile: package-lock.json (present)

## Frameworks

**Core:**
- Express 4.18.2 - Web framework for API server
- Puppeteer 24.27.0 - Browser automation
- Puppeteer Extra 3.3.6 - Enhanced browser automation with plugins
- Puppeteer Extra Stealth 2.11.2 - Stealth mode to evade detection
- Puppeteer Extra Recaptcha 3.6.8 - CAPTCHA solving

**Testing:**
- Jest 29.7.0 - Unit and integration testing framework
- Jest Puppeteer 11.0.0 - Browser testing with Puppeteer
- Happy DOM 20.0.10 - DOM implementation for testing

**Build/Dev:**
- TypeScript 5.2.2 - Type checking and transpilation
- ts-node 10.9.1 - TypeScript execution
- ts-node-dev 2.0.0 - TypeScript development server with watch
- ts-jest 29.1.1 - Jest TypeScript support

## Key Dependencies

**Critical:**
- Express 4.18.2 - Web server and routing
- Puppeteer 24.27.0 - Headless browser automation
- Puppeteer Extra 3.3.6 - Browser automation extensions
- @types/puppeteer 7.0.4 - Puppeteer type definitions
- pg 8.16.3 - PostgreSQL client
- @types/pg 8.15.6 - PostgreSQL type definitions

**Infrastructure:**
- winston 3.18.3 - Logging framework
- prom-client 15.1.3 - Prometheus metrics
- cors 2.8.5 - CORS middleware
- dotenv 16.3.1 - Environment variable management
- uuid 9.0.1 - UUID generation
- @types/uuid 9.0.7 - UUID type definitions

**Captcha Solving:**
- 2captcha 3.0.5-2 - CAPTCHA solving service
- @2captcha/captcha-solver 1.3.0 - 2Captcha SDK

## Configuration

**Environment:**
- Environment variables loaded from .env file
- Docker environment variables for containerization
- Configuration for LinkedIn credentials, database, and services

**Build:**
- TypeScript configuration in tsconfig.json
- Jest configurations for unit and integration testing
- Docker support via Dockerfile and docker-compose.yml

## Platform Requirements

**Development:**
- Node.js latest
- Docker for containerization
- Chromium browser (included in Docker image)
- PostgreSQL database

**Production:**
- Docker containers with Node.js
- PostgreSQL database (Docker service)
- n8n workflow automation (Docker service)
- Prometheus and Grafana for monitoring (Docker services)

---

*Stack analysis: 2026-02-02*