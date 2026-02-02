# Testing Patterns

**Analysis Date:** 2026-02-02

## Test Framework

**Runner:**
- Jest 29.7.0
- ts-jest for TypeScript transformation
- jsdom environment for browser-like testing

**Assertion Library:**
- Jest built-in assertions

**Run Commands:**
```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
npm run test:all      # Unit + Integration tests
```

## Test File Organization

**Location:**
- Co-located with source files: `tests/` directory mirroring `src/`
- Test files named after source: `service-name.test.ts`

**Naming:**
- `.test.ts` suffix for unit tests
- `.spec.ts` pattern also supported (though not used)
- Test files mirror source file structure

**Structure:**
```
tests/
├── services/
│   ├── CacheService.test.ts
│   ├── LinkedInService.test.ts
│   └── SessionManager.test.ts
├── utils/
│   └── linkedin-dom-functions.test.ts
└── test-utils.ts
```

## Test Structure

**Suite Organization:**
```typescript
describe('LinkedInService', () => {
  let linkedInService: LinkedInService;
  let mockCacheService: jest.Mocked<CacheService>;

  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    // Cleanup
  });

  describe('getProfileData', () => {
    it('should extract profile data successfully', () => {
      // Test
    });

    it('should throw error when not authenticated', () => {
      // Test
    });
  });
});
```

**Patterns:**
- AAA (Arrange-Act-Assert) pattern
- Clear test separation with describe blocks
- Mock setup in beforeEach/afterEach
- Descriptive test names with behavior specification

## Mocking

**Framework:** Jest built-in mocks

**Patterns:**
```typescript
// Mock dependencies BEFORE imports
jest.mock('puppeteer', () => ({
  launch: jest.fn(),
}));

jest.mock('./LinkedInBrowser', () => ({
  getOperationPage: jest.fn(),
  isAuthenticated: jest.fn(),
}));

// Mock service modules with factory functions
const mockCaptchaService = {
  solveCaptcha: jest.fn(),
  detectRecaptcha: jest.fn().mockResolvedValue(false),
  isAvailable: jest.fn().mockReturnValue(false),
};

// Import mocks
jest.mock('./CaptchaService', () => ({
  default: jest.fn(() => mockCaptchaService),
}));
```

**What to Mock:**
- External dependencies (puppeteer, winston)
- Service layer interactions
- Time-sensitive operations (setTimeout, setInterval)
- File system operations

**What NOT to Mock:**
- Business logic within the test file
- TypeScript type checking
- Built-in JavaScript methods

## Fixtures and Factories

**Test Data:**
```typescript
// Sample test data
const mockLinkedInSession = {
  id: 'test-session-id',
  browser: {} as Browser,
  page: {} as Page,
  isAuthenticated: true,
  createdAt: new Date(),
  lastUsed: new Date(),
};

const mockProfileData = {
  name: 'John Doe',
  title: 'Software Engineer',
  company: 'Tech Corp',
  location: 'San Francisco',
};
```

**Location:**
- Test-specific data defined in test files
- No centralized test fixtures detected
- Mock utility functions in `test-utils.ts`

## Coverage

**Requirements:**
- 50% threshold for all coverage metrics
- Coverage collection disabled by default
- Excluded files: server.ts, index.ts, .d.ts files

**View Coverage:**
```bash
npm run test:coverage
npm run test:coverage:open # Opens HTML report
```

**Coverage Configuration:**
```javascript
// jest.config.js
collectCoverageFrom: [
  'src/**/*.ts',
  '!src/**/*.d.ts',
  '!src/server.ts',
  '!src/index.ts',
],
coverageDirectory: 'coverage',
coverageReporters: ['text', 'text-summary', 'html', 'lcov', 'json'],
coverageThreshold: {
  global: {
    branches: 50,
    functions: 50,
    lines: 50,
    statements: 50,
  },
},
```

## Test Types

**Unit Tests:**
- Focus on individual service methods
- Mock all external dependencies
- Fast execution (< 100ms per test)
- Located in `tests/` directory

**Integration Tests:**
- Separate config file: `jest.integration.config.js`
- End-to-end testing with Puppeteer
- Real browser interactions
- Slower execution (timeout: 60s)

**E2E Tests:**
- Puppeteer-based testing
- Real LinkedIn interactions (limited)
- Network simulation

## Common Patterns

**Async Testing:**
```typescript
it('should handle async operation', async () => {
  await expect(service.asyncMethod()).resolves.toBe(true);
});

it('should handle errors', async () => {
  await expect(service.errorMethod()).rejects.toThrow();
});
```

**Error Testing:**
```typescript
it('should throw error when browser not initialized', () => {
  expect(() => service.getPage()).toThrow('Browser not initialized');
});
```

**Mock Reset:**
```typescript
afterEach(() => {
  jest.clearAllMocks();
});

afterAll(() => {
  jest.restoreAllMocks();
});
```

**Timer Mocking:**
```typescript
jest.useFakeTimers();
beforeEach(() => {
  jest.clearAllTimers();
});
```

## Test Utilities

**Custom Test Helpers:**
```typescript
// tests/test-utils.ts
export function mockClass<T extends new (...args: any[]) => any>(
  cls: T,
): jest.Mocked<InstanceType<T>> {
  const mocked = jest.fn(() => {
    const instance = new (cls as any)();
    for (const key of Object.getOwnPropertyNames(cls.prototype)) {
      if (key !== 'constructor' && typeof instance[key] === 'function') {
        instance[key] = jest.fn();
      }
    }
    return instance;
  });

  return new mocked() as jest.Mocked<InstanceType<T>>;
}
```

## Testing Best Practices Observed

1. **Mock External Dependencies**: All Puppeteer calls are mocked
2. **Service Layer Testing**: Focus on business logic, not implementation
3. **Error Scenarios**: Tests include both success and failure cases
4. **Timeout Management**: 60s timeout for Puppeteer tests
5. **Environment Setup**: jsdom environment for DOM-related tests
6. **Clear Separation**: Unit vs integration test separation
7. **Coverage Reporting**: Automated coverage with thresholds

---

*Testing analysis: 2026-02-02*