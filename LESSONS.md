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

- `~/.npm/_cacache` contains 8 root-owned files (old `sudo npm` bug) — `npm install` after a cache-relevant change fails EACCES. Permanent fix (needs the user): `sudo chown -R 501:20 ~/.npm`. Workaround used 2026-08-18: `npm install --cache <scratchpad>/npm-cache`.

- The `dnd_data_staging` Fly volume becomes ORPHANED on the next staging deploy (its `[[mounts]]` was removed 2026-06-11) — `fly volumes destroy` it to stop the charge.
- Staging's `ALLOW_TEST_CLEANUP` secret must be EXACTLY `'true'` since the 2026-06-11 hardening — if staging test cleanup starts 403ing, check that value first.
- `fluent-ffmpeg` is deprecated/unmaintained (npm install warns). Only two call sites in `audioProcessing.ts` still use it; migrating them to direct `execFile('ffmpeg', …)` drops the dependency. Queued, not urgent.
- The promotion model is now trunk-based (2026-06-26): `main` is the only long-lived branch. The `staging`/`production` branches and their `protect-staging`/`protect-production` rulesets were **deleted** — staging deploys continuously off `main` (`staging.yml`), production ships via a manual `workflow_dispatch` git-cliff release (`production.yml`). Only `protect-main` remains (PR + `CI Status` + linear + no force-push, squash-only, repository-admin bypass).
- **Three jobs need a `dependabot[bot]` guard.** Dependabot PRs run with a read-only `GITHUB_TOKEN`
  and NO access to repo secrets, so anything needing write or a secret can only fail. Claude's tokens
  (git push AND the GitHub App) both lack the `workflows` permission, so these have to be applied by
  hand. Note an npm PR sets the `src` filter too (it matches `*.json`), so the code jobs all run —
  which is fine and wanted; only these three are broken:

  | file | job | add | why |
  |---|---|---|---|
  | `fly-review.yml` | `review_app` | `if: github.actor != 'dependabot[bot]'` | `FLY_API_TOKEN` is empty; deploy can only fail (+ wasted Fly provisioning) |
  | `pull-request.yml` | `codeql` | append `&& github.actor != 'dependabot[bot]'` to the existing `if` | needs `security-events: write` for the SARIF upload; also pointless on a lockfile-only diff |
  | `pull-request.yml` | `pr-comment` | `if: always() && github.actor != 'dependabot[bot]'` | needs `pull-requests: write` to post the status comment |

  None of the three is in `ci-status`, so none of them *blocks* a merge — they're just permanent red
  on every dependency PR. Example hunk for `fly-review.yml`:

  ```yaml
  jobs:
    review_app:
      runs-on: ubuntu-latest
      # Dependabot PRs run with a read-only token and NO access to repo secrets, so
      # FLY_API_TOKEN is empty and the deploy can only fail. Skip them — a lockfile
      # bump has nothing to look at in a browser anyway, and `ci-status` (which
      # Dependabot PRs do run in full) is the required check, not this workflow.
      if: github.actor != 'dependabot[bot]'
      outputs:
  ```

- **Dependabot *security* updates are a repo setting, not `dependabot.yml`.** The config file only
  shapes the PRs. Turn the PRs on at Settings ▸ Code security (alerts + security updates + grouped
  security updates), or `gh api -X PUT repos/kbrakke/dnd-session-recorder/vulnerability-alerts` and
  `.../automated-security-fixes`.

- Production has no required-reviewer rule on its GitHub Environment — the `workflow_dispatch` "Run workflow" button is the manual gate. Add required reviewers to the `Production` environment if a second-person approval is ever wanted.

## Tooling gotchas

### `npm audit fix --force` will DOWNGRADE majors to chase audit metadata
It has twice proposed next 15 → **9.3.3** and next-auth 4 → 3 (the first run ballooned 28 vulns to 100). Never use `--force`; plain `npm audit fix` only applies semver-compatible bumps. Most transitive advisories here are fixed with `package.json` `"overrides"`, not upgrades.

### next-auth v4 pins a vulnerable `@auth/core` as an *optional peer* — npm installs it anyway
`next-auth@4.24.15` has `peerDependencies: {"@auth/core": "0.34.3"}` (optional), and npm auto-installs optional peers, so the vulnerable 0.34.3 lands in the tree even on a from-scratch lockfile regen and trips critical audit flags. It's types-only (grep shows zero runtime imports — only `.d.ts` references), so a global override `"@auth/core": "^0.41.3"` is safe. That override then surfaces a peer conflict on nodemailer (next-auth wants `^7.0.7`, @auth/core 0.41 allows `^7 || ^8` and npm picks 8) — resolve with a second global override `"nodemailer": "^7.0.7"`, not `--legacy-peer-deps`.

### npm 10's arborist CRASHES resolving vitest ≥4.1.11 — regen the lockfile with npm 11+
`npm install` / `npm update` / `npm audit fix` all die with `Cannot read properties of null (reading 'edgesOut')`
(stack: `#loadPeerSet` in `build-ideal-tree.js`). Minimal repro: a package.json whose only dep is
`vitest@^4.1.11`. vitest declares ~12 optional peers (`@vitest/browser-playwright`, `@vitest/ui`, …);
npm 10 auto-installs optional peers, resolves `@vitest/browser-playwright` to **5.0.1**, follows its
`vitest@*` peer into the vitest 5 graph, and blows up. An `overrides` pin on the peer does NOT help.
Fix: regenerate with `npx -y npm@11 install …`. `npm ci` on npm 10 is unaffected once the lock is
complete, so CI (setup-node + node 22 ⇒ npm 10.9.x) stays green — **but** an npm-11-generated lock can
be out of sync for npm 10 (see next entry). Anything that regenerates this lockfile (a human, Dependabot)
needs npm ≥ 11.

### npm 11 drops optional-peer packages that npm 10's `npm ci` then demands
After the npm 11 regen above, `npm ci` on npm 10 failed with `Missing: magicast@0.3.5 from lock file`:
`c12@3.1.0` (under `@prisma/config`) declares `magicast ^0.3.5` as an **optional peer**, npm 10 installs
it nested, npm 11 omits it. Same mechanism dropped the top-level `ajv@8.20.0` (optional peer of
`@hookform/resolvers`) — which happily took the `fast-uri` advisory with it, since only `zodResolver`
is used here. Fix: re-add the nested entry by hand, then run `npm install` under npm 10 to let it
re-canonicalize the file. Verify **both** `npm ci` (npm 10, what CI runs) and `npm audit` before pushing.

### `npm audit`'s "breaking change" fixes can be DOWNGRADES — check what's actually vulnerable first
2026-08: audit proposed prisma 6.19.3 → **6.12.0** (to shed `@prisma/config`'s deepmerge-ts) and next 15 → 16 (to shed sharp 0.34). Both were fixed instead with one-level global overrides (`deepmerge-ts ^8.0.1`, `sharp ^0.35.3`) — even prisma 7's `@prisma/config` still shipped the vulnerable deepmerge-ts 7.1.5, so the "upgrade" wouldn't have fixed it. Before accepting any audit-proposed major change, `npm view` the target's deps: the advisory is usually one transitive pin away, and an override is the fix.

### Testcontainers log-wait failure `/.*Started.*/` under podman is RYUK, not your container
`Log stream ended and message "/.*Started.*/" was not received` looks like the app container failing, but that regex is the **Ryuk reaper's** readiness log — Ryuk doesn't start under podman here. Local workaround: `TESTCONTAINERS_RYUK_DISABLED=true CI=true npm run test:ci` — but then nothing reaps the postgres container; `podman rm -f` it after. GitHub Actions (real Docker) is unaffected.

### `prisma migrate dev` cannot run non-interactively — not even with a fake TTY
It hard-fails in non-interactive shells, and `script -q /dev/null` gets past that only to hit the y/N confirmation, which ignores piped stdin (answers "no"). Working path: generate the SQL with `prisma migrate diff --from-url $DATABASE_URL --to-schema-datamodel prisma/schema.prisma --script`, save it as a hand-written migration (guards + default constraint names per `prisma/CLAUDE.md`), apply with `migrate deploy`, verify with `migrate diff --exit-code`.

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

### GitHub Environment branch policies survived the trunk-based migration
The 2026-06-26 migration deleted the `staging` branch and its rulesets, but the `staging` **Environment** kept a deployment-branch policy allowing only the branch named `staging` — so every push-to-`main` deploy was rejected with "Branch main is not allowed to deploy to staging due to environment protection rules" (the nightly scheduled run masked it: schedule runs skip the deploy job, so the workflow showed green). Fixed 2026-08-19 by swapping the policy to `main` via `gh api .../environments/staging/deployment-branch-policies`. When retiring a branch, check Environments (Settings → Environments), not just rulesets/branch protection.

### A workflow-created tag won't trigger `on: push: tags`
GitHub suppresses workflow events from actions authenticated with the default `GITHUB_TOKEN` (recursion guard). So a release job that creates a tag with `GITHUB_TOKEN` will NOT fire a separate `on: push: tags` deploy workflow. `production.yml` therefore does tag creation + GitHub Release + prod deploy in **one** job/run. If you ever split them, the tagger needs a PAT or GitHub App token, not `GITHUB_TOKEN`.

## Code & test gotchas

### `ffprobe-static`'s path is bogus under the Turbopack dev server — probes fail silently
Under `next dev --turbopack` (which CI also uses) `require('ffprobe-static').path` resolves to `/ROOT/node_modules/ffprobe-static/…`, so every `execFile(ffprobe)` fails with ENOENT. `probeAudioDurationSeconds` swallows the error and returns null, so it looks like "this file has no duration", not like a broken binary. Found 2026-09-22 when a finalize segment probe returned all-null params. Use `ffprobeBinary()` (`src/services/audioProcessing.ts`), which checks the path exists and falls back to system `ffprobe`. Also: the pipeline worker starts once at boot and keeps its code across HMR — restart the dev server after editing worker/step code before trusting a test run.

### npm 11 lockfile regen dropped `magicast` AGAIN when adding a devDependency (2026-09-22)
`npx -y npm@11 install --save-dev fake-indexeddb` re-removed the nested `@prisma/config/node_modules/magicast` entry that npm 10's `npm ci` needs (see the tooling entry above). For a single new leaf devDependency with no deps, hand-inserting its `packages` entry (and the root `devDependencies` key) into the ORIGINAL lockfile, in place and without re-sorting, gave an 11-line diff that `npx -y npm@10 ci` accepts.

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

### CodeQL "default setup" and the advanced workflow are mutually exclusive
Enabling CodeQL **default setup** (repo Settings → Code security → Code scanning) while the repo also runs the **advanced** `github/codeql-action/analyze` workflow (ours lives in `pull-request.yml`, documented in `.github/CLAUDE.md`) makes the advanced job's SARIF upload fail: `CodeQL analyses from advanced configurations cannot be processed when the default setup is enabled`. The analysis itself succeeds — only the upload 422s. Fix: disable default setup (`gh api -X PATCH repos/<owner>/<repo>/code-scanning/default-setup -f state=not-configured`), then re-run the failed job (`gh run rerun <id> --failed`). The repo's design is the advanced workflow; don't toggle on default setup.

### CodeQL `js/clear-text-logging` flags logging an env-sourced password
The seed logged the demo password for reviewer convenience; because it was env-overridable (`process.env.DEMO_PASSWORD`), CodeQL (high) flagged it as logging a secret and failed the PR. Don't log password values even in seeds — log a non-sensitive literal hint only.
