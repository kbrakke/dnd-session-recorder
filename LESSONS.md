# LESSONS.md

Running log of mistakes, corrections, surprises, and useful patterns discovered while working in this repo.

**Read this file at the start of every session in this repo.** Append to it whenever:
- An action you took caused an unexpected failure.
- The user corrected your approach or asked for something different from your default.
- You discovered a non-obvious fact about the codebase that would have saved you time if known earlier.

Keep entries short. Lead with the lesson, then a brief "Why" so future-you can judge edge cases.

---

## Test conventions

### `.test.ts` is Vitest, `.spec.ts` is Playwright
- `vitest.config.ts` only matches `src/**/__tests__/**/*.test.ts`. A `.spec.ts` file under `src/` won't run.
- Anything `.spec.ts` is assumed to import from `@playwright/test`. Vitest will crash trying to load it.
- **Why:** the repo had a `themes.spec.ts` under `src/` that imported `@playwright/test` but tested pure logic — invisible to both runners. When porting Playwright pure-logic tests to Vitest, also rename the file.

### `tsc --noEmit` includes test files
A broken type in a `.test.ts` fails typecheck even if no runner uses it. Test mocks need real types.
- **Why:** the new `audioProcessing.test.ts` had a TS-only error (`ffmpegFn.ffprobe = ...`) that wasn't caught because Vitest never ran in CI — but `tsc` was running and silently failing or being ignored. Always run `npm run typecheck` after touching test files.

### Wiring a Vitest test that imports `src/`
The CI job needs `npx prisma generate` before `npm run test:unit` if any imported module transitively touches `@/lib/prisma`. `@prisma/client` types come from generated code.

### Porting a Playwright pure-logic test to Vitest
1. Rename `.spec.ts` → `.test.ts`.
2. `import { test, expect } from '@playwright/test'` → `import { describe, it, expect } from 'vitest'`.
3. `test.describe` → `describe`, `test(` → `it(`.
4. Move under `src/<area>/__tests__/` if it exercises a `src/` module.

### Mocking modules in Vitest
- Mock NextAuth's session retrieval with `vi.mock('next-auth/next', () => ({ getServerSession: vi.fn() }))` and `vi.mock('@/lib/auth', () => ({ authOptions: {} }))`. Don't import the real `@/lib/auth`; it pulls in Prisma, Google OAuth setup, etc.
- Mock `@/lib/logger` with no-op spies whenever you import a module that logs at import time (e.g. `whitelist.ts` warns if `STAGING_WHITELIST` is unset). Otherwise the logger pulls in pino and pollutes test output.
- Mock `@/lib/rate-limiter` instead of trying to drive its real instances — limits change with `NODE_ENV`/`CI`, and the singletons retain state across tests.
- For env-var-dependent code, prefer `vi.stubEnv('KEY', 'value')` + `vi.unstubAllEnvs()` in beforeEach/afterEach over mutating `process.env` directly. Vitest 4 supports it cleanly.

### TS narrowing doesn't follow Vitest assertions
`expect(result.error).toBeNull()` does NOT narrow `result.error` to `null` for the type checker. If you then access `result.rateLimit` (only on the success branch of a discriminated union), TS will error.
- **Fix:** narrow with a real type guard (`if (result.error !== null) throw new Error('expected success')`) before accessing branch-specific fields. This is a runtime assertion AND a type narrow.

## Workflow / CI

### `npm` script rebinds need a wide grep
Before changing what an `npm` script does, grep `.github/`, `scripts/`, and `Dockerfile*` for callers. The workflow files use specific subscripts (`test:ci`, `test:local`, `test:workflows`, `test:post-deploy`, `test:staging`); bare `npm test` is unused.

### Don't trust workflow files as documentation
- `post-merge.yml` references `npx playwright test tests/integration/` — that directory doesn't exist.
- `tests/workflows/` has its own config and a 60-min CI timeout for ~60 LOC of duplicated page-load tests.
- Same code path is lint+build+tested 3–4 times between PR → staging push → main push.
- **`npm run test:post-deploy` is referenced by `post-deploy-tests.yml`, `fly-review.yml`, and `post-merge.yml` but does not exist in package.json.** Those workflow steps would fail at runtime. Pre-existing bug; cleanup queued for the consolidation step.

### "Unit" tests under `tests/unit/` were Playwright-shaped tautologies
The original `tests/unit/auth/whitelist.spec.ts` re-implemented every function it "tested" inline as `*Mock` versions and asserted against the duplicates — exercising zero production code. `session.spec.ts` was even worse: it asserted against ad-hoc literal objects defined in the test itself.
- **When you find tests that don't import from `src/`, they are usually testing nothing.** Either rewrite them against the real exports or delete them. Don't preserve out of caution — they were lying about coverage.
- Replacement vitest tests live at `src/lib/__tests__/{whitelist,auth-utils}.test.ts`.

### `playwright.config.ts` (no env qualifier) still exists
There is a default `playwright.config.ts` at the repo root that is NOT referenced by any GitHub workflow but IS picked up by a bare `npx playwright test`. It runs `npm run dev` and tests `./tests` (everything). Don't delete it without confirming no local tooling depends on it.

### Test-stage separation goal
The user wants three clearly separated stages with minimal overlap:
1. **Local / PR fast gate** — Vitest + lint + typecheck + audit. <60s.
2. **PR integration** — Playwright + testcontainers Postgres + mocked OpenAI. <5min.
3. **Staging post-deploy** — only what can't be tested locally (real Fly env, real OpenAI key on a tiny fixture, real NextAuth JWT, whitelist). <3min.

Stage migration plan lives in conversation history; key principle: each test belongs to exactly one stage.

## AI services

### All AI calls go through `src/lib/ai.ts`
OpenAI is used in exactly three API routes: `transcription/[sessionId]`, `summary/[sessionId]`, `dm-todo/[sessionId]`. As of step 3 they no longer import `@ai-sdk/openai`/`ai` directly — they call `transcribeAudio()` / `generateAiText()` from `src/lib/ai.ts`. Add new AI calls there, not inline.

### `MOCK_AI_SERVICES=true` returns deterministic fixtures
`src/lib/ai.ts` checks `process.env.MOCK_AI_SERVICES === 'true'` (exact string). When on, no OpenAI call happens and no `OPENAI_API_KEY` is needed. Wired into `playwright.config.ci.ts` so PR integration tests get it automatically.

### The cost-protection block must be bypassed when AI is mocked
Each AI route has a `isTestAccount(email)` check that returns **403** — it blocks `@test.com`/`@example.com` accounts from the AI pipeline entirely (real-spend protection). PR integration tests use exactly those test-domain accounts, so without a bypass they could never reach the pipeline. The fix: the block is now `if (isTestAccount(email) && !isAiMocked())`. Mocked = no spend = no reason to block. If you add a new AI route, replicate this guard.

## Codebase surprises

### Pre-existing type errors in `page.tsx`
`src/app/sessions/[id]/page.tsx` has pre-existing type errors (underscore-prefixed unused vars). Don't claim ownership of these when they appear in your typecheck output; check `git blame`.

### Stale tests against renamed APIs
When you wire a test runner to CI for the first time, expect to find dead tests written against earlier versions of the modules they import. (Found this with `themes.spec.ts` — testing properties `colors`/`fonts`/`effects` and themes `scroll`/`grimoire`/`codex` that no longer exist.)

### Hardcoded staging URLs in supposedly-portable tests
`tests/post-deploy/staging-verification.spec.ts` hardcodes `https://dnd-recorder-staging.fly.dev` instead of using `DEPLOY_URL`. Don't assume `tests/post-deploy/*` honors the env override.

## Processing pipeline (post-2026-06 rework)

### The pipeline is a DB-backed job queue, not HTTP self-fetches
`/api/sessions/[id]/process` enqueues a `pipeline_jobs` row; an in-process worker (started from `src/instrumentation.ts`) claims it with `FOR UPDATE SKIP LOCKED` and runs transcribe → summarize → dm_todo by calling the step services in `src/services/pipeline/steps/` directly. **Never reintroduce cookie-forwarding `fetch()` calls to our own API for background work** — that was the old pattern and it broke on deploys, cookie expiry, and multi-machine routing. Full analysis: `docs/PIPELINE_DURABILITY.md`.

### Prisma `$queryRaw` binds JS numbers as bigint
`make_interval(mins => ${n})` fails with `42883` because the parameter arrives as bigint. Use `(${n}::int * INTERVAL '1 minute')` instead. Caught only by running against a real Postgres — typecheck and unit tests can't see it.

### Production fly.toml has NO [[mounts]] but staging does
Uploaded audio on prod lives on the ephemeral container filesystem until transcription finishes. A restart in that window loses the file. Staging has a volume; prod doesn't. (Also: audio is *deliberately* deleted after transcription by `fileCleanup` — the DB transcript is the durable record.)

### `docs/` is gitignored (line 88) but some docs are tracked
Files added before the ignore rule (DATABASE_ANALYSIS.md, fly-postgres-setup.md, …) are tracked; newer ones aren't. `git mv` fails on untracked docs — check `git ls-files docs/` first. New docs need `git add -f` to be tracked.

### Prisma evaluates `@default(now())` and `new Date()` on the APP clock, not the DB clock
The queue's claim query compares `run_after <= NOW()` (Postgres time), but Prisma-written timestamps use the Node process clock. A drifted podman VM clock (13 min behind the host) made jobs unclaimable. **All time-sensitive queue writes must use raw SQL `NOW()`** — never mix clock sources in scheduling logic. Symptom to watch for: jobs stuck `pending` with `run_after` "in the future" relative to `SELECT NOW()`.

### Audio storage is abstracted in `src/services/storage.ts`
Tigris/S3 when `BUCKET_NAME`+`AWS_ENDPOINT_URL_S3` are set, local `UPLOAD_DIR` otherwise. Upload rows have `storageKey` (null = legacy local-disk row). **Never `fs.existsSync(upload.path)` to decide an upload is gone** — that deletes S3-backed records; use `audioExists()`/`ensureLocalAudio()`. Original audio is retained after transcription (playback feature) — don't reintroduce the post-transcription delete. MinIO (tests) needs `S3_FORCE_PATH_STYLE=true`; Tigris doesn't.

### Background `npx next dev` inherits the shell's persisted cwd
A prior `cd /tmp` in an earlier Bash call made a background `npx next dev` run in /tmp — npx then *installed a different Next version* and failed with "Couldn't find pages or app directory". Always `cd <project> && ...` in background commands.

### Multiple routes triggered processing, not just `/process`
`create-with-upload` also auto-triggered the pipeline (old: self-fetch; now: direct enqueue). When changing pipeline trigger semantics, grep for `enqueueProcessSession` AND any leftover `fetch(`/api/` patterns.

## User's working preferences

- Wants this LESSONS.md maintained: every issue, deviation from plan, or useful discovery → log it here. Reference it at session start.
- Wants test stages clearly separated with little overlap.
- Prefers testcontainers + mocked AI for PR-level tests.
- Goes step-by-step on multi-step plans rather than bundling. Wait for the green light before proceeding.
