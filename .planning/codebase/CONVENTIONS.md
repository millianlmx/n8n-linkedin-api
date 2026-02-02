# Coding Conventions

**Analysis Date:** 2026-02-02

## Naming Patterns

**Files:**
- kebab-case for directories: `src/utils/`, `src/services/`, `src/middleware/`
- kebab-case for utility files: `linkedin-dom-functions.ts`
- PascalCase for service classes: `LinkedInService.ts`, `CacheService.ts`
- snake_case for test files: `cache-service.test.ts`

**Functions:**
- camelCase for public functions: `getProfileData()`, `sendMessage()`
- camelCase for private methods: `checkAuth()`, `getPage()`
- PascalCase for class names: `LinkedInService`, `CacheService`
- PascalCase for interfaces: `LoginRequest`, `ProfileScrapeRequest`

**Variables:**
- camelCase for local variables: `lastRequestTime`, `cacheService`
- camelCase for parameters: `sessionId`, `requestUrl`
- UPPER_CASE for constants: `MIN_REQUEST_INTERVAL = 2000`

**Types:**
- PascalCase for interfaces: `LinkedInSession`, `SessionSummary`
- PascalCase for type aliases: `LoginRequest`, `SendMessageRequest`
- camelCase for generic parameters: `TValue`

## Code Style

**Formatting:**
- TypeScript compiler with strict mode
- 2 space indentation
- Semicolons at end of statements
- Trailing commas in multi-line structures

**Linting:**
- No explicit ESLint configuration detected
- TypeScript compiler provides basic linting via `strict` mode
- Manual code review appears to be the primary quality assurance

**Comment Style:**
- JSDoc/TSDoc for classes and public methods
- Inline comments for complex logic
- Clear separation between private and public methods with JSDoc tags

```typescript
/**
 * LinkedIn Service
 * Handles all LinkedIn automation operations including authentication,
 * profile scraping, connections, and messaging.
 */
class LinkedInService {
  /**
   * Get the operation page - uses LinkedInBrowser singleton
   * @param _sessionId - Deprecated, kept for backward compatibility
   * @returns Page instance or throws error
   * @private
   */
  private getPage(_sessionId?: string): Page {
    // Implementation
  }
}
```

## Import Organization

**Order:**
1. Node.js built-in modules (when used)
2. External dependencies (import statements)
3. Internal module imports (relative paths)

**Path Aliases:**
- No path aliases detected
- All imports use relative paths: `import { CacheService } from './CacheService'`

**Import Groups:**
```typescript
// External dependencies
import { Browser, Page } from 'puppeteer';
import winston from 'winston';

// Internal modules
import LinkedInBrowser from './LinkedInBrowser';
import { CacheService } from './CacheService';
import { SendMessageRequest, LoginRequest } from '../types';
import * as DOMFunctions from '../utils/linkedin-dom-functions';
```

## Error Handling

**Patterns:**
- Try-catch blocks for async operations
- Custom error messages with context
- Winston logging for errors with stack traces
- Throwing Error objects with descriptive messages

**Error Logging:**
```typescript
export const createServiceLogger = (serviceName: string) => {
  return {
    error: (message: string, error?: any, meta?: any) => {
      if (error instanceof Error) {
        logger.error(message, { service: serviceName, error: error.message, stack: error.stack, ...meta });
      } else {
        logger.error(message, { service: serviceName, error, ...meta });
      }
    },
  };
};
```

**Validation:**
- Runtime checks for null/undefined
- Type checking through TypeScript
- Input validation at service boundaries

## Logging

**Framework:** Winston

**Patterns:**
- Structured logging with metadata
- Service-specific loggers
- Environment-aware log levels
- Consistent format: `timestamp LEVEL [Service] message {meta}`

```typescript
// Service logger creation
const log = createServiceLogger('LinkedIn');

// Usage
log.debug('Processing profile data', { url: profileUrl });
log.error('Authentication failed', error, { email: maskedEmail });
```

**Log Levels:**
- DEBUG: Detailed operational data
- INFO: General application flow
- WARN: Non-critical issues
- ERROR: Errors and exceptions

## Comments

**When to Comment:**
- Complex business logic
- API limitations or workarounds
- Deprecation notices
- Important implementation decisions

**JSDoc/TSDoc:**
- Required for all public classes and methods
- Include parameter descriptions and return types
- Mark deprecated parameters with `@deprecated`
- Document private methods with `@private` tag

## Function Design

**Size:** Generally medium-sized functions, typically 10-30 lines
- Functions have single responsibility
- Private helper methods for complex operations
- Clear separation of concerns

**Parameters:**
- 0-3 parameters preferred
- Optional parameters with clear defaults
- Object destructuring for complex parameters

**Return Values:**
- Consistent return types
- Promise for async operations
- Void for side-effect-only functions
- Error objects thrown rather than returned

## Module Design

**Exports:**
- Named exports for functions and classes
- Export interfaces from types module
- Barrel files for grouping related exports

**Barrel Files:**
- `src/services/index.ts` - Service exports
- `src/types/index.ts` - Type definitions
- No barrel files for routes or middleware

## Error Handling Patterns

**Service Layer:**
```typescript
try {
  const page = this.getPage(sessionId);
  // Perform operation
} catch (error) {
  log.error('Operation failed', error);
  throw new Error('Failed to complete operation');
}
```

**Middleware Layer:**
```typescript
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session || !req.session.isAuthenticated) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}
```

---

*Convention analysis: 2026-02-02*