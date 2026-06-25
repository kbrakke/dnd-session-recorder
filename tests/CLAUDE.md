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

## Stage separation principle

Each test belongs to exactly ONE stage, with minimal overlap:
1. **Local / PR fast gate** — Vitest + lint + typecheck + audit. <60s.
2. **PR integration** — Playwright + testcontainers Postgres + mocked AI (`MOCK_AI_SERVICES=true`). <5min.
3. **Staging post-deploy** — only what can't be tested locally (real Fly env, real OpenAI key on a tiny fixture, real NextAuth JWT, whitelist). <3min.

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

### Running CI Playwright locally with Podman
`scripts/test-server.js` spins up the Postgres testcontainer **only when `CI=true`**. Ryuk (the testcontainers reaper) must be disabled on Podman:

```bash
DOCKER_HOST=unix://$(podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}') \
TESTCONTAINERS_RYUK_DISABLED=true CI=true \
npx playwright test --config=playwright.config.ci.ts
```

A default `playwright.config.ts` also exists at the repo root — not referenced by any workflow, but a bare `npx playwright test` picks it up (runs `npm run dev`, tests everything under `./tests`). Don't delete it without confirming no local tooling depends on it.

## File conventions

- **`.test.ts` is Vitest, `.spec.ts` is Playwright.** `vitest.config.ts` only matches `src/**/__tests__/**/*.test.ts`; a `.spec.ts` under `src/` is invisible to both runners (and Vitest crashes loading `@playwright/test` imports).
- **`tsc --noEmit` includes test files** — a type error in a `.test.ts` fails typecheck even if no runner executes it. Mocks need real types. Run `npm run typecheck` after touching tests.
- **CI unit-test jobs need `npx prisma generate` first** if any imported module transitively touches `@/lib/prisma` — `@prisma/client` types come from generated code.
- **Porting a Playwright pure-logic test to Vitest:** rename `.spec.ts` → `.test.ts`; swap `@playwright/test` imports for `vitest`'s `describe/it/expect`; move under `src/<area>/__tests__/` if it exercises a `src/` module.
- **A test that doesn't import from `src/` is usually testing nothing** — rewrite it against the real exports or delete it; don't preserve out of caution.

## Vitest mocking recipes

- NextAuth: `vi.mock('next-auth/next', () => ({ getServerSession: vi.fn() }))` + `vi.mock('@/lib/auth', () => ({ authOptions: {} }))`. Never import the real `@/lib/auth` (pulls in Prisma, Google OAuth setup).
- Mock `@/lib/logger` with no-op spies whenever an imported module logs at import time (e.g. `whitelist.ts`) — otherwise pino pollutes output.
- Mock `@/lib/rate-limiter` rather than driving real instances — limits change with `NODE_ENV`/`CI` and the singletons retain state across tests.
- Env-dependent code: `vi.stubEnv('KEY', 'value')` + `vi.unstubAllEnvs()` in before/afterEach, not direct `process.env` mutation.

## Playwright selector & assertion conventions

- Select form inputs **by label** (`getByLabel('Email')`) — `TextInput` renders proper `<label htmlFor>`, so label selectors survive copy/placeholder changes. The app title is `StoryScribe`; signin heading "Welcome back", signup "Create your account".
- Staging enables Google OAuth, so the signin page has BOTH a navbar "Sign in" and a "Sign in with Google" button that local CI never renders. Scope to the form with exact names: `page.locator('form').getByRole('button', { name: 'Sign in', exact: true })`.
- `CLIENT_FETCH_ERROR` during rapid back-to-back navigation is benign (aborted next-auth session fetch) — filter it in console-error assertions.
- A GET against a POST-only route returns **405**, not 404 — still proves the route isn't auth-blocked.
