# tests/

Playwright-based test suites organized by environment and purpose.

## Structure

```
tests/
  ci/              Tests run in CI (with testcontainers)
    middleware/     Route protection tests
  staging/         Tests run against a deployed environment (staging/review/prod)
    workflows/     End-to-end user journey tests
    integration/   API integration tests
    helpers/       Test utilities and fixtures
  fixtures/        Shared test data
  helpers/         Shared test utilities
  setup/           Test environment setup
  workflows/       Workflow-specific tests (post-merge CI)
```

Unit tests live under `src/**/__tests__/*.test.ts` (Vitest), not in this directory.

## Test Environments

### CI Tests (`npm run test:ci`)
Config: `playwright.config.ci.ts`
- Runs with testcontainers (spins up PostgreSQL in Docker)
- Chromium only, 4 workers
- 2 retries in CI mode
- Tests: route protection, middleware behavior

### Staging / Post-Deploy Tests (`npm run test:staging` / `npm run test:post-deploy`)
Both scripts run the same suite with `playwright.config.staging.ts` — the target
is selected by env: `STAGING_URL` > `DEPLOY_URL` > the staging default. CI
workflows set `DEPLOY_URL` (staging, review apps, production).
- **Workflows:** Full user journeys (auth, campaign lifecycle, session lifecycle, complete end-to-end)
- **Integration:** API auth, session persistence, data isolation between users
- Needs `TEST_CLEANUP_KEY` to delete test users afterward (no-ops with a warning if unset; the deployment also needs `TEST_CLEANUP_KEY` + `ALLOW_TEST_CLEANUP` set)

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
