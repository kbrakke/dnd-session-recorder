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

### Unit Tests (`npm test` / `npm run test:unit`)
Config: `vitest.config.ts`
- Pure-logic tests, no server needed. Live under `src/**/__tests__/*.test.ts`.
- Fast (<1s); covers `src/lib/{whitelist,auth-utils}`, `src/services/audioProcessing`, `src/app/sessions/[id]/themes`, etc.

## Test Infrastructure

- **Test server:** `scripts/test-server.js` handles spinning up testcontainers and dev server
- **User fixtures:** `tests/staging/helpers/users.ts` manages test user creation/cleanup
- **Test cleanup:** `POST /api/test/cleanup-user` API endpoint for removing test data
- **Test accounts:** Use `@test.com` / `@example.com` domains (blocked from AI API calls)

## Running Tests

```bash
npm test               # Vitest unit tests (default)
npm run test:unit      # Vitest unit tests (alias)
npm run test:ci        # Playwright integration tests with testcontainers
npm run test:staging   # Staging environment tests
npm run test:headed    # Integration tests in headed browser
npm run test:ci:ui     # Integration tests with Playwright UI
npm run test:workflows # Workflow-specific tests
```
