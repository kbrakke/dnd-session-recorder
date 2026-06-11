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

## Cleanup pass (2026-06-10): security, legacy removal, DRY

### Ownership checks must be explicit — middleware only proves identity
`middleware.ts` blocks unauthenticated `/api/*`, so the real risk was one
logged-in user reaching another's data. Several routes authenticated but never
checked ownership: `GET/PATCH/DELETE /api/sessions/[id]`, `GET/POST` on
`summary`/`dm-todo`/`transcription/[sessionId]`. All now go through
`requireSessionOwner` / `requireCampaignOwner` in `@/lib/route-utils`, which
returns a 404 (not 403) for both missing and not-owned.

### Cost-driving AI POSTs were unthrottled
`aiTranscriptionRateLimiter` / `aiSummaryRateLimiter` existed but were unused.
They're now applied via `enforceRateLimit()` on `process`, `transcription`,
`summary`, `dm-todo` POSTs. `campaign.systemPrompt` is capped server-side
(`.max(2000)`) since it's injected verbatim into every GPT call.

### ffprobe was shelled with a string template — command injection
Both upload routes built `` `${bin} ... "${filePath}"` `` and ran it via
`exec`. User-controlled filenames could break out. Replaced with one shared
`probeAudioDurationSeconds()` in `audioProcessing.ts` using `execFile` (arg
array, no shell).

### Legacy null-`storageKey` handling is gone; `path`/`chunk_paths` columns dropped
With nothing deployed and the DB rebuildable, the per-row "legacy local-disk"
fallbacks were deleted: `storageKey` is now NOT NULL, the `Upload.path` and
`Upload.chunk_paths` columns were dropped (migration
`20260610120000_drop_upload_legacy_columns`), and `storage.ts` uses
`storageKey` exclusively. Also deleted: `fileCleanup.ts` (unused),
`promoteLocalFile`, `resolveUploadPath`, `db.saveTranscriptions`,
`db.getTranscriptionCount`, and the stale committed `prisma.d.ts` /
`database.d.ts` (hand-edited build artifacts with wrong `number` id types).
**Re-run `npx prisma generate` after pulling — the Upload type changed.**

### Duplicated formatters consolidated to `@/lib/formatting`
`formatDate`/`formatDuration` were copy-pasted in `Dashboard`, `sessions/page`,
`session-header` with subtly different units (seconds vs minutes) and date
styles. Shared module exposes `formatDate(s, 'short'|'long')`,
`formatDurationSeconds`, `formatDurationMinutes` — call sites kept their
original behavior (note: `session-header` treats `duration` as minutes, which
looks like a pre-existing bug but was preserved, not "fixed", in this pass).

### Test config deletion deferred
`playwright-staging.config.ts` and `playwright.config.post-deploy.ts` are
unreferenced but the test stages are mid-migration (see above) — left in place
rather than risk breaking local tooling.

## CI test repair (2026-06-10): stale assertions after StoryScribe redesign

### The app was rebranded "D&D Session Recorder" → "StoryScribe"
`layout.tsx` title is `StoryScribe`; signin heading is "Welcome back", signup
is "Create your account"; auth inputs no longer use `email`/`password`
*placeholders* (they're `dm@yourtable.com` / `••••••••`). Tests asserting the
old title/heading/placeholder failed. Fixes: assert `/StoryScribe/`, match the
real headings, and select inputs by **label** (`getByLabel('Email')`) — the
`TextInput` component renders proper `<label htmlFor>`, so label selectors are
stable across copy changes. Files: `tests/ci/pages/*`, `tests/workflows/*`.

### The redesign dropped client-side auth guards from some protected pages
`tests/ci/middleware/route-protection.spec.ts` requires `/campaigns`,
`/sessions`, `/settings`, `/sessions/upload` to redirect unauthenticated users
to `/auth/signin`. Only `/settings` still did it. Restored the standard guard
(`useSession()` + `useEffect` → `router.push('/auth/signin')`, plus
`enabled: status === 'authenticated'` on the queries) to the other three. The
guard is the intended behavior — middleware only covers `/api/*`, pages guard
themselves.

### `CLIENT_FETCH_ERROR` during rapid navigation is benign
The "route transitions do not cause errors" test does back-to-back `page.goto`
with no wait; that aborts next-auth's in-flight `/api/auth/session` fetch and
logs a `CLIENT_FETCH_ERROR`. Filtered it out alongside favicon/analytics.

### GET on a POST-only route is 405, not 404
`contract.spec` asserted GET `/api/auth/register` ∈ `[200,201,400]`; it's
POST-only so a GET returns **405** (reachable, wrong method — proves it's not
auth-blocked, which was the test's intent). Widened the expectation.

### Running CI Playwright locally with Podman
`test:ci` / `test:workflows` use `scripts/test-server.js`, which spins up a
Postgres testcontainer **only when `CI=true`**. To run locally against Podman:
`DOCKER_HOST=unix://$(podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}')`
`TESTCONTAINERS_RYUK_DISABLED=true CI=true npx playwright test --config=playwright.config.ci.ts`.
Ryuk (the testcontainers reaper) must be disabled on Podman.

## Migrations (2026-06-10): `SET NOT NULL` fails on existing legacy rows

### A column can't go NOT NULL while old rows hold NULLs
`20260610120000_drop_upload_legacy_columns` did a bare
`ALTER COLUMN storage_key SET NOT NULL`. That works on a fresh DB (CI
testcontainers) but **failed on staging** (`23502: column "storage_key" …
contains null values`) because pre-object-storage uploads had NULL keys.
Fix: backfill first — `UPDATE uploads SET storage_key = 'legacy/' || id WHERE
storage_key IS NULL;` — then `SET NOT NULL`. Also use `DROP COLUMN IF EXISTS`
so partial/manual recovery states don't wedge it. Verified both on a fresh
chain and on a table seeded with a NULL row (podman throwaway Postgres).
**Lesson: any migration that tightens a constraint must assume real data
exists, even if local/CI DBs are always fresh.**

### A failed migration wedges all future deploys until resolved
Once `migrate deploy` records a migration as failed in `_prisma_migrations`,
Prisma refuses to apply anything new until it's `migrate resolve`d — editing
the migration file alone does NOT make it retry (and changes the checksum).
`scripts/init-database.ts` only auto-resolves ONE hardcoded migration name
(`20250826132223_…`), so any other failed migration needs manual recovery. On
a disposable DB the clean fix is `DROP SCHEMA public CASCADE; CREATE SCHEMA
public;` then redeploy — wipes the corrupted history AND the legacy rows.

### Editing an already-attempted migration is only safe pre-reset
The staging failure recorded a checksum for the old migration body. Editing it
is fine **only because staging's `_prisma_migrations` is being wiped** by the
schema reset. Never edit a migration that's cleanly applied in a durable env.

## CI workflow consolidation (2026-06-11)

### `test:post-deploy` now exists and aliases the staging suite
The missing-script failure (`npm error Missing script: "test:post-deploy"`) is
fixed by adding the script as an alias of `playwright.config.staging.ts` —
that config already targets `STAGING_URL` > `DEPLOY_URL` > staging default, so
one suite serves staging pushes, review apps, and (later) production. The old
`tests/post-deploy/` directory (2,606 lines, pre-redesign assertions, hardcoded
URLs) and `playwright.config.post-deploy.ts` + `playwright-staging.config.ts`
were deleted — they were superseded by the maintained `tests/staging/` suite.

### A push to `staging` used to trigger TWO deploys
`staging.yml` (push: staging) and `post-merge.yml` (push: main+staging) BOTH
ran `flyctl deploy fly.staging.toml` concurrently — racing deploys plus a
broken test step. `post-merge.yml`'s staging-deployment is now main-only
(pre-production check); pushes to the staging branch are deployed solely by
`staging.yml`. Post-merge also no longer runs `npx playwright test
tests/integration/` (directory never existed).

### The staging suite's env contract
Workflows must pass `TEST_CLEANUP_KEY` (GitHub secret) — the suite's user
cleanup no-ops with a warning without it, leaving test users in the staging DB.
The previously-passed `TEST_USER_EMAIL`/`TEST_USER_PASSWORD`/`NEXTAUTH_SECRET`/
`OPENAI_API_KEY` env vars were never read by these tests (users are generated
per-run). The staging Fly app needs `TEST_CLEANUP_KEY` + `ALLOW_TEST_CLEANUP`
set for the cleanup endpoint to work (staging runs NODE_ENV=production).

### Strict-mode locators on staging differ from local CI
Staging enables Google OAuth (`NEXT_PUBLIC_GOOGLE_ENABLED=true`), so the
signin page has BOTH a navbar "Sign in" button and a "Sign in with Google"
button that local CI (no Google) never renders. Any bare
`getByRole('button', {name:/sign in/i})` strict-mode-fails there. Scope to the
form AND use exact names: `page.locator('form').getByRole('button', {name:
'Sign in', exact: true})`. A selector passing in CI proves nothing about
staging if env flags change the DOM.

### Don't reset react-hook-form in a modal-open effect
`campaigns/page.tsx` reset the form in `useEffect([modalOpen, ...])` — the
reset runs AFTER the modal renders, so input typed in that gap (Playwright
`fill`, fast typists) gets wiped, and submit then fails "name is required"
with confusingly empty fields. Reset synchronously in the open handler
(`openCreateModal`/`handleEdit`) before `setModalOpen(true)` instead. Symptom
to recognize: failure screenshot shows the modal open, fields empty, required
error on a field the test definitely filled.

### Don't pipe long Playwright runs through `tail`
`npm run test:staging | tail -50` buffers ALL output until EOF — a hung test
looks identical to a silent healthy run, for hours. Use `--reporter=line` and
read the raw output file/stream instead.

## Pre-production audit (2026-06-11) — findings FIXED same day, kept for context

### The frontend did NOT poll `/api/sessions/[id]/progress` — despite both CLAUDE.md files saying it did
The product UI polled `GET /api/sessions/[id]` every 1–2s, which (via `db.getSessionById`) includes the **full transcript** on every poll. **Fixed:** `use-session-data.ts` now polls only `/progress` (light `db.getSessionProgress` select) while in-flight, and invalidates the heavy queries when the progress fingerprint (status|step|chunksCompleted) changes. If you add new pipeline UI, drive it off the progress feed, not timers on heavy queries.

### The sessions list/dashboard used a status vocabulary the backend never writes
`sessions/page.tsx`, `Dashboard.tsx`, `StatusPill.tsx` checked `'processing'`/`'pending'` — not real statuses. **Fixed:** shared vocabulary now lives in `src/lib/session-status.ts` (`isInFlight()`, `statusLabel()`, `IN_FLIGHT_STATUSES`). Use it for any new status-aware UI; don't hand-roll status switch statements.

### `ProcessingPipeline` silently dropped its action props
`onStartProcessing`/`onCancelTranscription` were passed in but never rendered. **Fixed:** the strip now shows "Start processing" when status is `uploaded` (the process route sets an optimistic in-flight status on enqueue, so `uploaded` reliably means "no active job") and "Cancel" while transcribing/summarizing.

### Other same-day fixes worth knowing about
- `POST /api/summary/[sessionId]` no longer strands fresh generations in `summarizing` on permanent errors — it calls `setSessionError`, so the error banner + retry appear.
- Dead `PATCH /api/sessions/[id]` (wrong status enum, zero callers) and `db.updateSessionStatus` were deleted.
- `/api/auth/register` now ALWAYS returns 201 + `{ message }` (no `{ user }`, no "User already exists") and hashes even for existing emails — account-enumeration + timing fix. Test helpers were already tolerant (they accept 200/201).
- `getRateLimitIdentifier` now prefers `Fly-Client-IP`, then the RIGHTMOST `x-forwarded-for` entry — never the client-controlled leftmost.
- `/api/test/cleanup-user` requires `ALLOW_TEST_CLEANUP` to be EXACTLY `'true'` in production-mode envs (staging!) and compares the key with `timingSafeEqual`. If staging cleanup starts 403ing, check that secret's exact value.
- Audio chunking is now ffmpeg stream-copy (`-c copy`) with concurrency capped at 4 — if a future format produces oversized chunks (VBR drift), the 18MB worker target vs Whisper's 25MB limit is the headroom to check.
- FK indexes added via hand-written migration `20260611120000_add_fk_indexes` (verified on throwaway Postgres + `migrate diff` clean).
- `fly.staging.toml`: shared-cpu-4x→1x, `min_machines_running=0`, debug logging and the `[[mounts]]` volume removed. The `dnd_data_staging` volume becomes ORPHANED on next staging deploy — destroy it (`fly volumes destroy`) to stop the charge. Both tomls: legacy `[[services]]` blocks folded into `[http_service.concurrency]`.
- `dm-todo` generation uses `gpt-4o-mini` (summary stays on `gpt-4o`) — see `TEXT_MODEL` in `src/lib/ai.ts`.

### Vitest ffmpeg mocks are defined per-test, not just at module level
`audioProcessing.test.ts` has a module-level fluent-ffmpeg mock AND local `mockImplementation` instances inside individual tests. Adding a method to the chain (e.g. `outputOptions`) requires updating ALL of them, or the per-test mocks fail with "x is not a function".

## Dependency hygiene (2026-06-11)

### `npm audit fix --force` will DOWNGRADE majors to chase audit metadata
It "fixed" the uuid advisory by downgrading next-auth 4 → 3 and next 15 → **9.3.3**, ballooning 28 vulns to 100. Never use `--force`; plain `npm audit fix` only applies semver-compatible bumps and is safe.

### Reverting package.json/lockfile does NOT revert node_modules
After `git revert`/checkout of a bad dependency change, `node_modules` still holds the bad tree until `npm ci`. Detection: `npm outdated`'s **Current** column reads node_modules, while `npm audit` reads the lockfile — if Current shows versions outside the ranges in package.json, the tree is out of sync.

## User's working preferences

- Wants this LESSONS.md maintained: every issue, deviation from plan, or useful discovery → log it here. Reference it at session start.
- Wants test stages clearly separated with little overlap.
- Prefers testcontainers + mocked AI for PR-level tests.
- Goes step-by-step on multi-step plans rather than bundling. Wait for the green light before proceeding.
