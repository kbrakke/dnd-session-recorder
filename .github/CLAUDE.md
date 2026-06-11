# .github/

GitHub configuration including CI/CD workflows.

## Workflows (`.github/workflows/`)

### `pull-request.yml` — PR Checks
Triggered on pull requests. Runs:
1. **Change detection** — determines which file types changed (skip unnecessary jobs)
2. **Lint & type check** — ESLint, TypeScript compiler, Prettier
3. **Security audit** — `npm audit` on dependency changes
4. **Playwright tests** — CI tests with testcontainers (PostgreSQL in Docker)
5. **Build check** — verifies `npm run build` succeeds
6. **PR comment** — posts status summary on the PR

Skips jobs for docs-only changes.

### `staging.yml` — Staging Deployment
Triggered on push to `staging` branch:
1. Security checks
2. Build and test
3. Docker build with Trivy vulnerability scan
4. Deploy to Fly.io staging (`fly.staging.toml`)
5. Smoke tests against deployed staging URL
6. Deployment notification

### `production.yml` — Production Deployment
Triggered on push to `main`/`master` (or manual dispatch):
1. Build and test
2. Deploy to Fly.io production (`fly.toml`)
3. Release command runs `prisma migrate deploy`
4. Post-deploy verification tests

### `post-deploy-tests.yml` — Post-Deployment Verification
Runs after production deployment to verify the live environment works correctly. Tests auth flows and basic functionality. `npm run test:post-deploy` is an alias of the staging suite (`playwright.config.staging.ts`, target picked via `STAGING_URL` > `DEPLOY_URL` > staging default) — one suite serves staging pushes, review apps, and production.

### `post-merge.yml` — Pre-Production Check
Push to `main` only. A push to `staging` is deployed solely by `staging.yml` — post-merge must NOT also deploy staging (it used to, causing racing concurrent deploys).

### `fly-review.yml` — Review App Deployments
Creates temporary Fly.io review environments for pull requests. Allows testing PR changes in an isolated deployed environment.

## Gate levels & env contract

- **npm audit:** `pull-request.yml` + `staging.yml` fail on `--audit-level moderate`; `production.yml` on `high`. Low-severity findings never block — don't take risky major bumps just to silence lows.
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
