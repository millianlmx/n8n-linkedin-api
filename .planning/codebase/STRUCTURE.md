# Codebase Structure

**Analysis Date:** 2026-02-02

## Directory Layout

```
windsurf-project-3/
├── src/                     # Source code
│   ├── server.ts           # Express server entry point
│   ├── routes/             # HTTP route handlers
│   │   ├── auth.routes.ts    # Authentication endpoints
│   │   ├── profile.routes.ts # Profile scraping endpoints
│   │   ├── connection.routes.ts # Connection management
│   │   ├── message.routes.ts # Messaging endpoints
│   │   ├── search.routes.ts # Search functionality
│   │   └── metrics.routes.ts # Metrics endpoints
│   ├── services/           # Business logic services
│   │   ├── LinkedInBrowser.ts # Browser instance manager
│   │   ├── LinkedInService.ts # LinkedIn automation
│   │   ├── BrowserStateService.ts # State persistence
│   │   ├── CacheService.ts # Data caching
│   │   ├── CaptchaService.ts # CAPTCHA solving
│   │   ├── SessionManager.ts # Session management
│   │   ├── MetricsService.ts # Metrics collection
│   │   └── index.d.ts      # Service type definitions
│   ├── middleware/         # Express middleware
│   │   ├── metrics.middleware.ts # Metrics collection
│   │   └── session.middleware.ts # Session validation
│   ├── utils/              # Shared utilities
│   │   ├── logger.ts       # Winston logger setup
│   │   ├── linkedin-dom-functions.ts # DOM helpers
│   │   └── messaging-dom-functions.ts # Message DOM helpers
│   └── types/              # TypeScript type definitions
│       └── index.ts        # Shared interfaces
├── tests/                  # Test files
│   ├── routes/            # Route tests
│   ├── services/          # Service tests
│   ├── utils/             # Utility tests
│   └── mocks/             # Test mocks
├── dist/                  # Compiled TypeScript output
├── n8n_custom_nodes/     # n8n custom nodes
├── bruno/                 # Bruno API collection
├── monitoring/            # Monitoring setup
└── docker-compose.yml    # Docker configuration
```

## Directory Purposes

**src/routes/**:
- Purpose: HTTP request handling and response formatting
- Contains: Express route handlers for each API module
- Key files:
  - `auth.routes.ts` - Authentication endpoints
  - `profile.routes.ts` - Profile scraping
  - `connection.routes.ts` - Connection requests
  - `message.routes.ts` - Messaging and monitoring
  - `search.routes.ts` - People search
  - `metrics.routes.ts` - Metrics collection

**src/services/**:
- Purpose: Business logic and LinkedIn automation
- Contains: Core services for browser management, scraping, caching
- Key files:
  - `LinkedInBrowser.ts` - Singleton browser manager
  - `LinkedInService.ts` - Main LinkedIn automation
  - `BrowserStateService.ts` - State persistence
  - `CacheService.ts` - Data caching
  - `CaptchaService.ts` - CAPTCHA solving

**src/middleware/**:
- Purpose: Cross-cutting concerns
- Contains: Express middleware for logging, metrics, validation
- Key files:
  - `metrics.middleware.ts` - Prometheus metrics
  - `session.middleware.ts` - Session validation

**src/utils/**:
- Purpose: Shared utilities and helpers
- Contains: DOM functions, logging setup, error handling
- Key files:
  - `logger.ts` - Winston logger configuration
  - `linkedin-dom-functions.ts` - LinkedIn DOM helpers
  - `messaging-dom-functions.ts` - Message DOM helpers

**src/types/**:
- Purpose: TypeScript type definitions
- Contains: Shared interfaces and type aliases
- Key files:
  - `index.ts` - All type definitions

**tests/**:
- Purpose: Unit and integration tests
- Contains: Test files organized by module
- Key files: Route tests, service tests, integration tests

**dist/**:
- Purpose: Compiled TypeScript output
- Contains: JavaScript files ready for production

**n8n_custom_nodes/**:
- Purpose: n8n workflow automation nodes
- Contains: Custom nodes for LinkedIn automation

**bruno/**:
- Purpose: Bruno API collection
- Contains: API endpoint collections for testing

**monitoring/**:
- Purpose: Monitoring setup
- Contains: Grafana dashboards and datasources

## Key File Locations

**Entry Points:**
- `src/server.ts`: Express server and middleware setup
- `package.json`: Application entry point (dist/server.js)

**Configuration:**
- `tsconfig.json`: TypeScript configuration
- `jest.config.js`: Testing configuration
- `docker-compose.yml`: Docker containerization

**Core Logic:**
- `src/services/`: Business logic and automation
- `src/routes/`: HTTP handlers and validation

**Testing:**
- `tests/`: Unit and integration tests
- `jest.config.js`: Test runner configuration

## Naming Conventions

**Files:**
- Routes: `{feature}.routes.ts`
- Services: `{Feature}.ts` (PascalCase for class names)
- Middleware: `{feature}.middleware.ts`
- Utils: `{name}-utils.ts` or `{name}-functions.ts`
- Types: `index.ts` in types directory

**Functions:**
- Route handlers: `async handler(req, res)`
- Service methods: `async methodName()`
- Public methods: camelCase
- Private methods: `_privateMethod()`

**Variables:**
- Constants: UPPER_SNAKE_CASE
- Instance variables: camelCase
- Parameters: camelCase

**Classes:**
- Service classes: PascalCase
- Interface names: PascalCase, ends with Interface if not obvious

## Where to Add New Code

**New Feature:**
- Primary code: `src/routes/{feature}.routes.ts`
- Business logic: `src/services/{Feature}.ts`
- Tests: `tests/routes/` and `tests/services/`
- Types: Update `src/types/index.ts`

**New API Endpoint:**
- Route handler: Add to appropriate routes file
- Validation: In route handler
- Business logic: In corresponding service

**New Browser Automation:**
- Implementation: `src/services/LinkedInService.ts`
- DOM helpers: `src/utils/linkedin-dom-functions.ts`
- Error handling: In service with appropriate error codes

**New Service:**
- Location: `src/services/`
- Dependencies: Add to constructor
- Tests: `tests/services/{ServiceName}.test.ts`

**Utilities:**
- Shared helpers: `src/utils/`
- Domain-specific: Feature-specific file in utils
- Tests: `tests/utils/`

## Special Directories

**dist/**:
- Purpose: Compiled TypeScript output
- Generated: Yes
- Committed: Yes

**node_modules/**:
- Purpose: Dependencies
- Generated: Yes
- Committed: No (in .gitignore)

**tests/**:
- Purpose: Test files
- Generated: No
- Committed: Yes

**n8n_custom_nodes/**:
- Purpose: Custom workflow automation nodes
- Generated: Partially
- Committed: Yes

---

*Structure analysis: 2026-02-02*