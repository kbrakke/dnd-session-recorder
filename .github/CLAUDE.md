# .github/

GitHub configuration including CI/CD workflows.

## Release model (trunk-based, single long-lived branch)

`main` is the only long-lived branch. There are **no** `staging`/`production` branches —
staging is a deploy target off `main`, production is shipped via a manual git-cliff release.

```
feature ──PR──▶ main      pull-request.yml ("CI Status" gate) + fly-review.yml
   │ squash-merge (PR title = conventional commit, enforced by the pr-title job)
   ▼
push to main ──▶ staging.yml: comprehensive tests ▶ deploy staging ▶ post-deploy suite
   │
   │  ⟵ run production.yml manually (Actions ▸ Run workflow ▸ patch/minor/major), once staging is green
   ▼
   git-cliff notes ▶ tag vX.Y.Z ▶ publish GitHub Release ▶ deploy prod ▶ migrate ▶ smoke
```

The tag is the record of what's in prod. Prod always deploys current `main`, which staging
has been continuously validating — so the contract is "only release when staging is green".

## Workflows (`.github/workflows/`)

### `pull-request.yml` — PR fast gate
Triggered on PRs to `main`. Jobs: change detection, **pr-title** (Conventional Commit check on
the PR title — squash-merge makes it the commit subject on `main`, which feeds git-cliff), lint &
type check, **security audit** (`npm audit --audit-level moderate`, blocking), **secret scan**
(trufflehog), **CodeQL** (JS/TS static analysis, report-only — not in `ci-status`), unit tests
(Vitest), build, integration tests (Playwright + testcontainers). `ci-status` is the single required
check (the `CI Status` context in `protect-main`). The pr-title gate is enforced even on docs-only
PRs. Skips code jobs for docs-only changes.

### `staging.yml` — Continuous staging
Triggered on **push to `main`** (also a nightly `schedule`, and `workflow_dispatch`):
1. `security-audit` — `npm audit --audit-level moderate` (re-checks against advisories disclosed since PR merge); gates `deploy-staging`
2. `workflow-tests` — comprehensive Playwright suite (`test:workflows`, testcontainers + mocked AI, 3 browsers)
3. `deploy-staging` — `flyctl deploy --config fly.staging.toml`, capped health gate (push events only)
4. `staging-tests` — calls `post-deploy-tests.yml` against deployed staging (`environment: staging`)

The nightly schedule runs `workflow-tests` only (no deploy) as a drift check. Docs-only merges skip both.

### `production.yml` — Manual release & deploy
**`workflow_dispatch` only**, with a `patch/minor/major` input. One job (`environment: Production`),
in order: **`npm audit --audit-level high`** (blocks the release before build) → compute next version
from the latest `v*` tag → git-cliff release notes → build+Trivy scan →
Fly blue-green deploy → `prisma migrate deploy` → health/smoke → **then** create the tag + publish the
GitHub Release (so a release never exists for something that didn't ship). Single job by design: a tag
created with `GITHUB_TOKEN` does NOT trigger `on: push: tags`, so tag + deploy must share one run.

### `post-deploy-tests.yml` — Post-Deployment Verification
Reusable workflow (called by `staging.yml`; also `workflow_dispatch` for production). `npm run test:post-deploy`
is an alias of the staging suite (`playwright.config.staging.ts`, target picked via `STAGING_URL` > `DEPLOY_URL` >
staging default) — one suite serves staging pushes, review apps, and production.

### `fly-review.yml` — Review App Deployments
Creates temporary Fly.io review environments per PR (`environment: review`). Lets you test PR changes in an
isolated deployed environment. A `npm audit --audit-level moderate` step gates the deploy — the review app
is a deployed environment, so it gets the same audit bar as PR/staging (this was the gap that let stale
packages reach staging).

### Release notes (`cliff.toml`)
git-cliff config at the repo root maps Conventional Commit prefixes to public release sections
(`feat`→Features, `fix`→Bug Fixes, `perf`, `refactor`, `docs`, `revert`; `chore`/`ci`/`test`/`build`/`style`
are skipped). The public changelog is the GitHub Releases page (repo is public).

## Gate levels & env contract

- **Audit gate contract (consistent across every CI entry point):** `npm audit` runs on **PR, staging, review apps** at `--audit-level moderate` (blocking) and on **production** at `--audit-level high` (blocking). **Low-severity findings never block anywhere** — don't take risky major bumps just to silence lows (see LESSONS.md: `npm audit fix --force` downgrades majors). Rationale for the prod=high split: PR/staging/review catch moderates early and cheaply (no deploy at risk); the manual prod release blocks only on high+ so a freshly-disclosed moderate can't wedge an urgent ship. The audit reads `package-lock.json`, so these steps don't need `npm ci`.
- **Scanners (consistent set):** `npm audit` everywhere (above); **trufflehog** secret scan on PRs (`--only-verified`, blocking); **CodeQL** JS/TS static analysis on PRs (report-only, surfaces in the Security tab, not in `ci-status`); **Trivy** image scan on the production image build (report-only → SARIF → Security tab, `CRITICAL,HIGH`).
- **GitHub Environments are case-sensitive.** The deploy jobs reference `Production` (capital) and `staging` (lowercase) to match the existing environments; a casing typo silently spawns a *new* empty environment. `FLY_API_TOKEN` is a repo-level secret, so deploys don't depend on env-scoped secrets.
- **Staging-suite secrets:** workflows must pass `TEST_CLEANUP_KEY` (GitHub secret) or test-user cleanup silently no-ops, leaving users in the staging DB. The staging Fly app itself needs `TEST_CLEANUP_KEY` + `ALLOW_TEST_CLEANUP=true` (exact string — staging runs `NODE_ENV=production`).
- `NODE_VERSION: '22'` is set per-workflow env (matches the Dockerfile); watch for stray hardcoded `node-version:` values in individual steps.

## Bumping action versions

All actions are on node24-native majors as of 2026-06 (checkout@v6, setup-node@v6, upload-artifact@v6, github-script@v9, codeql upload-sarif@v4, paths-filter@v4, docker login@v4/metadata@v6/buildx@v4/build-push@v7). When bumping again, check:
- **github-script v9+** is ESM-only — `require('@actions/github')` inside `script:` blocks fails at runtime; use the injected `getOctokit` instead.
- **setup-node v5+** auto-enables caching when package.json has a `packageManager` field (we don't have one; we pass `cache: 'npm'` explicitly).
- New majors require runner ≥2.327.1 — irrelevant on GitHub-hosted `ubuntu-latest`, matters if self-hosted runners are ever added.
- Read each major's release notes before bumping (`gh api repos/<owner>/<repo>/releases/tags/<tag> --jq .body`); don't assume "node bump only".

## Deployment Targets

All deployments go to **Fly.io**:
- **Production:** `fly.toml` — Eastern US (ewr), 1 shared CPU, 1GB RAM, `min_machines_running = 1` (in-process pipeline worker needs an always-on machine)
- **Staging:** `fly.staging.toml` — 1 shared CPU, 1GB RAM, `min_machines_running = 0` (scales to zero when idle)
- **Review:** `fly.review.toml` — ephemeral per-PR environments
