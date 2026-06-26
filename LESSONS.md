# LESSONS.md

Gotcha moments and the user's explicit requests/preferences. **Read this at the start of every session.**

Scope (per the user): surprising failure modes worth never repeating, and things the user asked for. Durable architecture, conventions, and "how this repo works" belong in the nearest `CLAUDE.md` (root, `tests/`, `prisma/`, `.github/`, `src/lib/`, `src/services/`, `src/app/api/`, `src/app/sessions/`, …) — when a lesson hardens into a convention, move it there and keep at most a pointer here.

Append an entry whenever an action causes an unexpected failure or the user corrects your approach. Lead with the lesson, then a brief "why". Prune entries that become stale or get promoted to a CLAUDE.md.

---

## User's working preferences

- Goes step-by-step on multi-step plans rather than bundling. Wait for the green light before proceeding.
- Wants this LESSONS.md maintained — but for gotchas and requests, not architecture notes (those go to CLAUDE.md files; refactored 2026-06-11 at their request).
- Wants test stages clearly separated with little overlap (the three-stage contract is documented in `tests/CLAUDE.md`).
- Prefers testcontainers + mocked AI for PR-level tests; prefers containers (Podman) over native services.
- Planning to charge customers soon: data isolation is the top security priority; runs infra out of pocket, so cost-efficiency matters. Stripe integration is planned (separate request).

## Pending action items

- The `dnd_data_staging` Fly volume becomes ORPHANED on the next staging deploy (its `[[mounts]]` was removed 2026-06-11) — `fly volumes destroy` it to stop the charge.
- Staging's `ALLOW_TEST_CLEANUP` secret must be EXACTLY `'true'` since the 2026-06-11 hardening — if staging test cleanup starts 403ing, check that value first.
- `fluent-ffmpeg` is deprecated/unmaintained (npm install warns). Only two call sites in `audioProcessing.ts` still use it; migrating them to direct `execFile('ffmpeg', …)` drops the dependency. Queued, not urgent.
- Branch rulesets are live (`protect-main`/`protect-staging`/`protect-production`) with **repository-admin** bypass, and the repo is squash-only. `main` = PR + `CI Status` + linear + no force-push; `staging`/`production` = `update`-restricted (only bypass actors push) + no force-push/deletion. When the #19/#21 promotion workflows are built, add their pusher (github-actions[bot] or a GitHub App) as a bypass actor on staging/production — admin bypass only covers admin-authenticated pushes, so a default `GITHUB_TOKEN` push would be blocked by the `update` rule.

## Tooling gotchas

### `npm audit fix --force` will DOWNGRADE majors to chase audit metadata
It has twice proposed next 15 → **9.3.3** and next-auth 4 → 3 (the first run ballooned 28 vulns to 100). Never use `--force`; plain `npm audit fix` only applies semver-compatible bumps. Most transitive advisories here are fixed with `package.json` `"overrides"`, not upgrades.

### Doubly-nested npm overrides FLAP — keep overrides at most one level deep
`"next-auth": {"@auth/core": {"cookie": …}}` applied at lockfile-regen time, then a later plain `npm install` silently re-resolved the deep entry back to the vulnerable version. Use a global or one-level override instead. If an override-protected vuln "comes back", suspect this before suspecting new advisories.

### Changing `overrides` does NOT update an existing package-lock
npm marks the tree `invalid … overridden` in `npm ls` but keeps installing the old nested versions. Surgically deleting nested dirs doesn't help — the lockfile wins. Reliable fix: `rm -rf node_modules package-lock.json && npm install`, then re-verify everything (all transitives move within their ranges).

### Reverting package.json/lockfile does NOT revert node_modules
After reverting a bad dependency change, `node_modules` still holds the bad tree until `npm ci`. Detection: `npm outdated`'s Current column reads node_modules; `npm audit` reads the lockfile — if Current shows versions outside package.json's ranges, the tree is out of sync.

### A lockfile regen that bumps @playwright/test needs `npx playwright install`
Every BROWSER-based test fails in 0ms with "Executable doesn't exist" while pure-request API tests keep passing. Recognize that split-failure pattern as "browsers missing", not a code regression.

### Background `npx next dev` inherits the shell's persisted cwd
A prior `cd /tmp` in an earlier Bash call made a background dev server run in /tmp — npx then *installed a different Next version* and failed with "Couldn't find pages or app directory". Always `cd <project> && …` in background commands.

### Don't pipe long Playwright runs through `tail`
`npm run test:staging | tail -50` buffers ALL output until EOF — a hung test looks identical to a silent healthy run, for hours. Use `--reporter=line` and read the raw output file/stream.

### `docs/` is gitignored (line 88) but some docs are tracked
Files added before the ignore rule are tracked; newer ones aren't. `git mv` fails on untracked docs — check `git ls-files docs/` first. New docs need `git add -f`.

### Fly review apps each need their own DB — and `postgres attach` has two traps
Review apps (`fly.review.toml`) shipped no `DATABASE_URL` (the "shared Postgres" comment was aspirational), so the app crashlooped on `entrypoint exit 1`. `fly-review.yml` now provisions a throwaway `pr-<N>-dnd-rec-db` per PR. Traps: (1) `flyctl postgres attach` injects a `postgres://` URL, NOT `postgresql://` — the entrypoint scheme check must accept both (Prisma accepts both). (2) attach is NOT idempotent: re-running errors `already contains a secret named DATABASE_URL` (doesn't match "already attached") — instead check `flyctl secrets list --app X | grep -qw DATABASE_URL` and skip. Also: `flyctl postgres create` (unmanaged PG) is deprecated toward `fly mpg` and region-picky (failed on `bos`, worked on `ord`) — fine for throwaway review DBs, not for anything durable.

### `superfly/fly-pr-review-apps` updates machines IN PLACE → a wedged machine 408s the deploy
The action runs `flyctl secrets import` (immediate in-place machine update) BEFORE deploying the new image. A machine left crashlooping/stopped by an earlier deploy makes that update time out (HTTP 408), and the action aborts before building the fixed image — so a bad deploy can't self-heal. Destroy existing machines before the deploy step (`flyctl machine list --json | jq -r '.[].id' | while read id; do flyctl machine destroy "$id" --app X --force; done`); app-level secrets (incl. DATABASE_URL) survive.

### Never share `NEXTAUTH_SECRET` across environments
Review apps reused `NEXTAUTH_SECRET_STAGING`. With JWT sessions, a token minted in one env is a VALID signature in any env sharing the secret — a review app could authenticate against staging/prod. Generate a unique per-env secret (`openssl rand -hex 32` per PR for review).

### `fly-review.yml` needs `permissions: pull-requests: write`, and the readiness gate must fail
The default workflow token is read-only, so the github-script PR-comment step 403s ("Resource not accessible by integration"). Separately, the "wait for app ready" loop had no `curl --max-time` and ran tests even when health never passed — a down app hung the job ~22 min until timeout, surfacing as confusing `register`/TLS errors. Cap the curl, exit on health, and `exit 1` if it never comes up.

## Code & test gotchas

### TS narrowing doesn't follow Vitest assertions
`expect(result.error).toBeNull()` does NOT narrow the type. Use a real type guard (`if (result.error !== null) throw …`) before accessing branch-specific fields of a discriminated union — it's a runtime assertion AND a narrow.

### Vitest ffmpeg mocks are defined per-test, not just at module level
`audioProcessing.test.ts` has a module-level fluent-ffmpeg mock AND local `mockImplementation` instances inside individual tests. Adding a method to the chain (e.g. `outputOptions`) requires updating ALL of them, or the per-test mocks fail with "x is not a function".

### Don't reset react-hook-form in a modal-open effect
Resetting in `useEffect([modalOpen])` runs AFTER the modal renders, wiping input typed in that gap (Playwright `fill`, fast typists) — submit then fails "required" with confusingly empty fields. Reset synchronously in the open handler before `setModalOpen(true)`. Symptom: failure screenshot shows modal open, fields empty, required error on a field the test definitely filled.

### Stale tests against renamed APIs
When wiring a test runner to CI for the first time, expect dead tests written against earlier versions of the modules they import — and tests that don't import from `src/` at all are usually testing nothing (rewrite against real exports or delete; don't preserve out of caution).

### Don't trust workflow files (or docs) as documentation — verify referenced paths exist
Workflows have referenced npm scripts and test directories that didn't exist, and CLAUDE.md once claimed the frontend polled `/progress` when nothing did. Before relying on a referenced script/path/endpoint, grep that it exists and is actually called.

### `npm` script rebinds need a wide grep
Before changing what an npm script does, grep `.github/`, `scripts/`, and `Dockerfile*` for callers — workflows use specific subscripts; bare `npm test` is unused.

### A signal that pattern-matches a known failure may have a different cause
Jobs stuck `pending` looked like a queue bug but were a drifted podman VM clock (13 min behind) interacting with mixed clock sources. Check `SELECT NOW()` vs app time before debugging queue logic. (The "always use raw SQL NOW() in queue writes" rule now lives in `src/services/CLAUDE.md`.)

### Next.js standalone doesn't bundle deps for out-of-band scripts
`prisma/seed.ts` run via `npx tsx` in the standalone runner threw `Cannot find module 'bcryptjs'`: standalone only traces deps imported by the BUILT server code, not by side scripts. `@prisma/client` resolved (copied + traced) but `bcryptjs` didn't. Keep seed/boot scripts to `@prisma/client` only and embed precomputed values (e.g. a bcrypt hash) instead of importing crypto libs. Make boot-time seeding non-fatal so a seed hiccup degrades to "app up, empty" rather than crashlooping the machine.

### CodeQL `js/clear-text-logging` flags logging an env-sourced password
The seed logged the demo password for reviewer convenience; because it was env-overridable (`process.env.DEMO_PASSWORD`), CodeQL (high) flagged it as logging a secret and failed the PR. Don't log password values even in seeds — log a non-sensitive literal hint only.
