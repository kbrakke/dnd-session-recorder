# tests/

Playwright-based test suites organized by environment and purpose.

## Structure

```
tests/
  ci/              Tests run in CI (with testcontainers)
    middleware/     Route protection tests
  staging/         Tests run against staging environment
    workflows/     End-to-end user journey tests
    integration/   API integration tests
    helpers/       Test utilities and fixtures
  post-deploy/     Tests run after production deployment
    auth/          Authentication flow verification
  unit/            Unit tests
    auth/          Whitelist, session validation
  fixtures/        Shared test data
  helpers/         Shared test utilities
  setup/           Test environment setup
  workflows/       Workflow-specific tests
```

## Test Environments

### CI Tests (`npm run test:ci`)
Config: `playwright.config.ci.ts`
- Runs with testcontainers (spins up PostgreSQL in Docker)
- Chromium only, 4 workers
- 2 retries in CI mode
- Tests: route protection, middleware behavior

### Staging Tests (`npm run test:staging`)
Config: `playwright.config.staging.ts`
- Runs against the staging deployment URL
- Tests:
  - **Workflows:** Full user journeys (auth, campaign lifecycle, session lifecycle, complete end-to-end)
  - **Integration:** API auth, session persistence, data isolation between users

### Post-Deploy Tests
Config: `playwright.config.staging.ts` (reused)
- Verifies production deployment is healthy
- Tests: auth flows, login scenarios, error handling

### Unit Tests
- Whitelist logic testing
- Session validation

### Local Tests (`npm run test:local`)
Config: `playwright.config.local.ts`
- Reuses running dev server
- Runs CI test suite against local environment

## Test Infrastructure

- **Test server:** `scripts/test-server.js` handles spinning up testcontainers and dev server
- **User fixtures:** `tests/staging/helpers/users.ts` manages test user creation/cleanup
- **Test cleanup:** `POST /api/test/cleanup-user` API endpoint for removing test data
- **Test accounts:** Use `@test.com` / `@example.com` domains (blocked from AI API calls)

## Running Tests

```bash
npm run test          # CI tests (default)
npm run test:ci       # CI tests explicitly
npm run test:staging  # Staging environment tests
npm run test:local    # Against local dev server
npm run test:headed   # CI tests in headed browser
npm run test:ci:ui    # CI tests with Playwright UI
npm run test:workflows # Workflow-specific tests
```
