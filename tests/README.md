# Test Suite

See [CLAUDE.md](CLAUDE.md) for the canonical layout. This file is a quick reference.

## Categories

| Type | Where | Runner | When |
|---|---|---|---|
| **Unit** | `src/**/__tests__/*.test.ts` | Vitest (`npm test`) | Every PR; locally on save |
| **Integration** | `tests/ci/**/*.spec.ts` | Playwright + testcontainers Postgres (`npm run test:ci`) | Every PR |
| **Staging E2E** | `tests/staging/**/*.spec.ts` | Playwright vs deployed staging (`npm run test:staging`) | After staging deploy |
| **Post-deploy smoke** | `tests/post-deploy/**/*.spec.ts` | Playwright vs `DEPLOY_URL` (config: `playwright.config.post-deploy.ts`) | After any deploy |

There are also `tests/workflows/` (legacy, slated for removal) and `tests/unit/` (removed in step 2 of the test-overhaul; ported to vitest under `src/lib/__tests__/`).

## Commands

```bash
npm test               # Vitest unit tests
npm run test:unit      # alias of npm test
npm run test:ci        # Integration tests (testcontainers)
npm run test:ci:ui     # Integration tests in Playwright UI
npm run test:headed    # Integration tests in headed browser
npm run test:staging   # Staging tests (against the deployed staging URL)
npm run test:workflows # Legacy workflow suite
npm run typecheck      # tsc --noEmit
```

`npm run test:post-deploy` is referenced by some workflow files but **does not exist** in `package.json`. Those workflow steps are broken; cleanup is queued for a later step in the test-overhaul plan.

## Environment

- `NEXTAUTH_SECRET` — required for any test that boots the Next.js server.
- `DATABASE_URL` — set by `scripts/test-server.js` (testcontainers) for `test:ci`; otherwise must be a real Postgres.
- `OPENAI_API_KEY` — only used by tests that hit the real AI pipeline (staging). PR-stage tests should mock OpenAI; until the mock layer lands, AI-touching tests live in staging.
- `STAGING_WHITELIST` — comma-separated allow-list. See `src/lib/whitelist.ts` and `src/lib/__tests__/whitelist.test.ts`.

## Test accounts

Use `@test.com` or `@example.com` domains. These are blocked from making real AI API calls (cost protection); see `isTestAccount()` in `src/lib/whitelist.ts`.
