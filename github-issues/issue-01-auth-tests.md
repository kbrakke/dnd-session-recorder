# Refactor and Enhance Authentication Test Suite

## Description
Refactor existing authentication tests to improve reliability, coverage, and maintainability. Current tests mix unit and integration concerns and have some flaky behaviors that need to be addressed.

## Problem Statement
The current authentication tests (`tests/api-auth.spec.ts` and `tests/login.spec.ts`) are testing actual authentication flows, which is good, but they:
- Have occasional flaky behavior in CI
- Mix different testing concerns (unit vs integration)
- Don't cover all authentication scenarios
- Lack proper test isolation and cleanup
- Don't test the staging whitelist functionality

## Tasks
- [ ] Separate auth library tests from application auth flow tests
- [ ] Add test fixtures for consistent test user management
- [ ] Implement proper test database seeding/cleanup
- [ ] Add tests for whitelist functionality in staging
- [ ] Test password reset flows
- [ ] Test session expiration and refresh
- [ ] Add tests for OAuth providers (if applicable)
- [ ] Test role-based access control
- [ ] Add tests for concurrent session handling
- [ ] Test auth error scenarios comprehensively

## Implementation Details

### 1. Test Structure Reorganization
```
tests/
  unit/
    auth/
      whitelist.spec.ts      # Unit tests for whitelist logic
      session.spec.ts        # Session management unit tests
  integration/
    auth/
      login-flow.spec.ts    # Full login flow integration
      registration.spec.ts  # User registration flow
      api-auth.spec.ts      # API authentication
  fixtures/
    users.ts                # Test user factory
    auth-helpers.ts         # Auth test utilities
```

### 2. Test User Factory (`tests/fixtures/users.ts`)
```typescript
export const createTestUser = (overrides = {}) => ({
  name: 'Test User',
  email: `test-${Date.now()}@example.com`,
  password: 'TestPass123!',
  ...overrides
});

export const TEST_USERS = {
  admin: { email: 'admin@test.com', password: 'AdminPass123!', role: 'admin' },
  user: { email: 'user@test.com', password: 'UserPass123!', role: 'user' },
  blocked: { email: 'blocked@test.com', password: 'BlockedPass123!', role: 'user' }
};
```

### 3. Database Test Utilities (`tests/setup/auth.ts`)
```typescript
import { PrismaClient } from '@prisma/client';

export async function cleanupTestUsers(prisma: PrismaClient) {
  await prisma.user.deleteMany({
    where: { email: { contains: '@test.com' } }
  });
}

export async function seedTestUsers(prisma: PrismaClient) {
  // Seed consistent test users
}
```

### 4. Whitelist Testing
- Test whitelist is properly enforced in staging
- Test non-whitelisted users are blocked
- Test whitelist can be dynamically updated
- Test whitelist error messages are appropriate

## Acceptance Criteria
- [ ] All auth tests pass consistently in CI (0% flake rate over 10 runs)
- [ ] Test coverage for auth routes exceeds 80%
- [ ] Clear separation between unit and integration tests
- [ ] No test interdependencies (tests can run in any order)
- [ ] Test execution time under 30 seconds for auth suite
- [ ] All auth error scenarios have test coverage
- [ ] Whitelist functionality fully tested for staging environment
- [ ] Test report clearly shows what was tested

## Technical Requirements
- Use Playwright's test fixtures for better test isolation
- Implement database transactions for test cleanup
- Mock external services (OAuth providers) for unit tests
- Use real services for integration tests with proper cleanup
- Add retry logic for potentially flaky network operations

## Definition of Done
- [ ] All existing auth tests refactored
- [ ] New test cases implemented
- [ ] Tests passing in CI/CD pipeline
- [ ] Code review completed
- [ ] Documentation updated
- [ ] Test coverage report generated
- [ ] No console errors or warnings in test runs

## Notes
- Consider using `@playwright/test` fixtures for better test organization
- Ensure test users don't conflict with real user emails
- Add comments explaining why certain tests exist (business requirements)
- Consider adding performance benchmarks for auth operations

## Related Issues
- Depends on: Database setup and migration strategy
- Blocks: Staging deployment with secure test users
- Related to: #3 (Staging Environment Configuration)

## Estimated Effort
- **Size:** Large (5-8 story points)
- **Time:** 3-4 days
- **Priority:** High (blocking staging deployment)

## Labels
`testing`, `auth`, `refactor`, `priority-high`, `security`