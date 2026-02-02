# Architecture

**Analysis Date:** 2026-02-02

## Pattern Overview

**Overall:** Service-oriented architecture with singleton browser instance

**Key Characteristics:**
- REST API built on Express.js framework
- Singleton browser instance using Puppeteer for LinkedIn automation
- Centralized service layer with business logic separation
- Database persistence for browser state and session management
- Monitoring and metrics collection via Prometheus

## Layers

**Presentation Layer (Routes):**
- Purpose: HTTP request handling and response formatting
- Location: `src/routes/`
- Contains: Express route handlers for each API endpoint
- Depends on: Service layer for business logic
- Used by: Express.js server

**Service Layer:**
- Purpose: Business logic and LinkedIn automation
- Location: `src/services/`
- Contains: LinkedInBrowser, LinkedInService, CacheService, etc.
- Depends on: Browser instance, database layer
- Used by: Route handlers

**Browser Management Layer:**
- Purpose: Puppeteer browser instance lifecycle management
- Location: `src/services/LinkedInBrowser.ts`
- Contains: Singleton browser service with state management
- Depends on: Puppeteer, BrowserStateService
- Used by: LinkedInService, route handlers

**Data Access Layer:**
- Purpose: Database operations and state persistence
- Location: `src/services/BrowserStateService.ts`, `src/services/CacheService.ts`
- Contains: PostgreSQL operations, caching logic
- Depends on: pg client, external cache
- Used by: LinkedInBrowser, LinkedInService

**Utility Layer:**
- Purpose: Shared utilities and helpers
- Location: `src/utils/`
- Contains: DOM functions, logging, error handling
- Depends on: External libraries
- Used by: All layers

**Middleware Layer:**
- Purpose: Cross-cutting concerns (auth, metrics, logging)
- Location: `src/middleware/`
- Contains: Session validation, metrics collection, request logging
- Depends on: Service layer
- Used by: Express.js request pipeline

## Data Flow

**Request Flow:**

1. HTTP Request → Express Middleware (logging/metrics)
2. Route Handler → Service Layer validation
3. Service Layer → Browser Manager for page access
4. Browser Manager → Puppeteer for browser operations
5. Results flow back through the same layers

**Authentication Flow:**

1. Initialize browser via `POST /api/auth/initialize`
2. Login via `POST /api/auth/login`
3. Browser state persisted in database
4. Session checked on each protected request
5. Logout via `DELETE /api/auth/logout`

**State Management:**

- Browser state saved to PostgreSQL after login
- Session cookies stored and restored
- Cache service stores scraped data in PostgreSQL
- Metrics collected for monitoring

## Key Abstractions

**LinkedInBrowser:**
- Purpose: Singleton browser instance management
- Examples: `src/services/LinkedInBrowser.ts`
- Pattern: Singleton service with state management

**LinkedInService:**
- Purpose: Business logic for LinkedIn operations
- Examples: `src/services/LinkedInService.ts`
- Pattern: Service with dependency injection

**CacheService:**
- Purpose: Data caching and retrieval
- Examples: `src/services/CacheService.ts`
- Pattern: Repository pattern

## Entry Points

**Server Entry:**
- Location: `src/server.ts`
- Triggers: Express.js server startup
- Responsibilities: Middleware setup, route registration, graceful shutdown

**API Endpoints:**
- Location: `src/routes/*.ts`
- Triggers: HTTP requests from clients
- Responsibilities: Request validation, response formatting

**Authentication Endpoints:**
- `POST /api/auth/initialize` - Initialize browser
- `POST /api/auth/login` - Login to LinkedIn
- `GET /api/auth/status` - Check authentication status

**Profile Endpoints:**
- `POST /api/profile/scrape` - Scrape profile data
- `POST /api/profile/visit` - Visit profile
- `GET /api/profile/views` - Get profile views

**Connection Endpoints:**
- `POST /api/connection/send-request` - Send connection request

**Message Endpoints:**
- `GET /api/messages/conversations` - List conversations
- `POST /api/messages/send` - Send message
- `POST /api/messages/monitoring/*` - Message monitoring

**Search Endpoints:**
- `POST /api/search/people` - Search for people

## Error Handling

**Strategy:** Centralized error handling with status codes

**Patterns:**
- Route handlers catch and format errors
- Service layer throws descriptive errors
- Global error handler middleware in server.ts
- Error logging with Winston logger

## Cross-Cutting Concerns

**Logging:**
- Winston logger with service-specific loggers
- Request/response logging middleware
- Console logging from browser instances

**Validation:**
- Input validation in route handlers
- URL format validation for LinkedIn profiles
- Authentication checks before operations

**Monitoring:**
- Prometheus metrics collection
- Performance tracking per request
- Browser state monitoring
- Health check endpoint

---

*Architecture analysis: 2026-02-02*