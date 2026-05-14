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
Runs after production deployment to verify the live environment works correctly. Tests auth flows and basic functionality.

### `fly-review.yml` — Review App Deployments
Creates temporary Fly.io review environments for pull requests. Allows testing PR changes in an isolated deployed environment.

## Deployment Targets

All deployments go to **Fly.io**:
- **Production:** `fly.toml` — Eastern US (ewr), 1 shared CPU, 1GB RAM
- **Staging:** `fly.staging.toml` — same spec, different app name
- **Review:** `fly.review.toml` — ephemeral per-PR environments
