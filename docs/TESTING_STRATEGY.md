# Testing Strategy

## Overview

This document outlines the testing strategy for the DnD Session Recorder application. Tests are organized into different categories based on when they run and what they test.

## Test Categories

### 1. Unit Tests (`tests/unit/`)
**When**: PR CI (fast feedback)
**Purpose**: Test isolated functions and utilities
**Current Tests**:
- `auth/session.spec.ts` - Session management logic
- `auth/whitelist.spec.ts` - Email whitelist logic

**Duration**: < 1 minute
**Coverage**: Pure functions, utilities, business logic

### 2. Integration Tests (`tests/integration/`)
**When**: Post-merge (staging deployment)
**Purpose**: Test features against a real deployed environment
**Current Tests**:
- `auth/api-auth.spec.ts` - API authentication flows
- `auth/error-scenarios.spec.ts` - Error handling and edge cases
- `auth/login-flow.spec.ts` - Complete login workflows
- `auth/registration.spec.ts` - User registration flows

**Duration**: 5-10 minutes
**Coverage**: Full feature workflows with database, real auth

### 3. Workflow Tests (`tests/workflows/`)
**When**: Post-merge (before deployment)
**Purpose**: End-to-end critical user journeys
**Current Tests**:
- `core.spec.ts` - Complete user workflow (signup → session → transcription → summary)
- `simple.spec.ts` - Basic workflow validation

**Duration**: 15-30 minutes
**Coverage**: Complete user journeys with all services (database, AI, file uploads)

### 4. Post-Deploy Tests (`tests/post-deploy/`)
**When**: After deployment to staging/production
**Purpose**: Verify deployment health and critical paths
**Current Tests**:
- `basic-staging-check.spec.ts` - Basic health checks
- `staging-verification.spec.ts` - Deployment verification
- Mirror of integration tests for deployed environment

**Duration**: 5-10 minutes
**Coverage**: Smoke tests, critical paths on live environment

## Test Execution Strategy

### Pull Request (PR) CI
**Goal**: Fast feedback (< 5 minutes)
**Runs**:
- ✅ Linting & Type Check
- ✅ Security Audit
- ✅ Build Test
- ✅ Unit Tests (`test:local`)

**Why**: Quick validation before merge. Comprehensive tests run after merge.

### Post-Merge (Main/Staging Branch)
**Goal**: Comprehensive validation before deployment
**Runs**:
1. ✅ Lint, Type Check & Build
2. ✅ Workflow Tests (comprehensive E2E)
3. ✅ Deploy to Staging
4. ✅ Staging Integration Tests
5. ✅ Staging Smoke Tests

**Why**: Ensures quality before production deployment.

### Nightly/Scheduled
**Goal**: Continuous health monitoring
**Runs**:
- All post-merge tests
- Performance tests (planned)
- Extended edge case testing

## Test Configuration Files

### `playwright.config.ts`
- Default configuration
- Used by most test suites

### `playwright.config.local.ts`
- Local development testing
- Runs against `http://localhost:3000`
- Uses minimal browsers (chromium only)

### `playwright.config.workflows.ts`
- Comprehensive workflow tests
- Uses testcontainers for database
- All browsers (chromium, firefox, webkit)
- Custom global setup/teardown

### `playwright.config.post-deploy.ts`
- Tests against deployed environment
- Uses `DEPLOY_URL` environment variable
- Staging/production validation

## Current Issues & Cleanup Needed

### Duplicate Tests
The following tests appear in multiple locations and should be consolidated:
- `tests/login.spec.ts` vs `tests/integration/auth/login-flow.spec.ts`
- `tests/api-auth.spec.ts` vs `tests/integration/auth/api-auth.spec.ts`
- `tests/post-deploy/login.spec.ts` duplicates integration tests

**Recommendation**: Keep integration tests, remove root-level duplicates.

### Overly Complex Error Scenarios
`error-scenarios.spec.ts` contains many edge cases that may not provide value:
- SQL injection attempts (handled by ORM)
- XSS attempts (handled by React)
- Session corruption (unlikely in production)

**Recommendation**: Focus on realistic error scenarios that users might encounter.

## GitHub Actions Integration

### Current Reporting
- Test results uploaded as artifacts
- 7-14 day retention
- Manual download required

### Planned Improvements
1. **Playwright HTML Reporter in GitHub Actions**
   - Use `@playwright/test` built-in GitHub reporter
   - Automatic test result annotations
   - Failed test screenshots in PR

2. **GitHub Checks API Integration**
   - Test results visible in PR checks
   - Direct links to failure screenshots
   - Trend analysis over time

3. **Test Result Dashboard**
   - Upload HTML reports to GitHub Pages
   - Historical test results
   - Performance trending

## Best Practices

### Test Organization
```
tests/
├── unit/              # Fast, isolated tests (PR CI)
├── integration/       # Feature tests with DB (Post-merge)
├── workflows/         # E2E critical paths (Post-merge)
├── post-deploy/       # Smoke tests (After deploy)
└── fixtures/          # Shared test data
```

### Test Naming
- Use descriptive test names: `should allow whitelisted user to register`
- Group related tests with `test.describe()`
- Use `.skip()` for tests that are temporarily disabled

### Test Data
- Use factories (`fixtures/`) for test data generation
- Clean up test data after each test
- Use unique identifiers to avoid conflicts

### Debugging
- Run single test: `npx playwright test path/to/test.spec.ts`
- Debug mode: `npx playwright test --debug`
- UI mode: `npx playwright test --ui`
- Headed mode: `npx playwright test --headed`

## Next Steps

1. ✅ Add Playwright GitHub Actions reporter
2. ⏳ Remove duplicate tests
3. ⏳ Simplify error-scenarios tests
4. ⏳ Add performance tests
5. ⏳ Create visual regression tests for UI components
6. ⏳ Add API contract tests

## Metrics

### Target Test Performance
- Unit Tests: < 1 minute
- Integration Tests: < 10 minutes
- Workflow Tests: < 30 minutes
- Total PR CI: < 5 minutes
- Total Post-Merge: < 45 minutes

### Current Status
- ✅ Unit Tests: ~30 seconds
- ⚠️ Integration Tests: ~8 minutes (needs optimization)
- ✅ Workflow Tests: ~20 minutes
- ✅ PR CI: ~4 minutes
- ✅ Post-Merge: ~40 minutes
