# Post-Deploy Testing

This directory contains tests that verify the application is working correctly in deployed environments (staging and production).

## Staging Environment

**URL**: https://dnd-recorder-staging.fly.dev/

## Quick Start

```bash
# Run staging verification tests (read-only, no DB writes)
npm run test:staging

# Run verification tests only (basic + comprehensive)
npx playwright test --config=playwright-staging.config.ts

# Run full post-deploy suite (includes integration tests that need DB access)
npm run test:post-deploy
```

## ⚠️ Important: Test Organization

Tests in this directory are organized by their requirements:

### Staging-Safe Tests (Read-Only)
- `basic-staging-check.spec.ts` - Quick health verification
- `staging-verification.spec.ts` - Comprehensive read-only checks

These run via `npm run test:staging` and **do not** create users or modify data.

### Integration Tests (Require DB Access)
- `auth/` - Authentication flow tests with test user creation
- `complete-workflow.spec.ts` - Full E2E workflow with data creation
- `login.spec.ts` - Login flow with test users

These run via `npm run test:post-deploy` in **controlled environments only** (not public staging).

## Test Types

### Complete Workflow Test (`complete-workflow.spec.ts`) ⭐ NEW

Full end-to-end user journey testing:

1. **Sign Up** - Create new test user account
2. **Sign In** - Log in with credentials
3. **Create Campaign** - Create new D&D campaign
4. **Create Session** - Create session without audio upload
5. **Delete Session** - Remove session from campaign
6. **Delete Campaign** - Clean up test campaign
7. **Verify** - Ensure all resources cleaned up

Features:
- ✅ Unique test data per run (timestamp-based)
- ✅ Google OAuth availability check
- ✅ Automatic resource cleanup
- ✅ Individual feature tests (campaigns, sessions)

### Basic Staging Health Check (`basic-staging-check.spec.ts`)

Quick verification that the staging deployment is healthy and functional:

- ✅ **System Health**: API health endpoint returns OK status
- ✅ **Database Connection**: PostgreSQL database is connected and schema is initialized
- ✅ **Authentication**: Protected endpoints properly secured (401 responses)
- ✅ **New Features**: Recent updates like progress tracking API are available
- ✅ **Performance**: Responds to requests within acceptable timeouts
- ✅ **Concurrency**: Handles multiple concurrent requests properly

### Comprehensive Staging Verification (`staging-verification.spec.ts`)

Full end-to-end verification including browser-based tests:

- System health and database connectivity
- Authentication system functionality
- API endpoint security
- Environment configuration verification
- Application features and navigation
- Performance and availability checks
- Recent updates and features verification

### Authentication Tests (`auth/`)

Comprehensive authentication testing against the deployed environment:

- API authentication with real JWT tokens
- Login/logout flows
- Session management
- Rate limiting verification
- Cross-user data access protection

## Running Tests

### Quick Staging Health Check
```bash
npm run test:staging
```

### Full Post-Deploy Test Suite
```bash
npm run test:post-deploy
```

### Specific Test File
```bash
npm run test:post-deploy -- tests/post-deploy/basic-staging-check.spec.ts
```

### With Environment Variable
```bash
DEPLOY_URL=https://dnd-recorder-staging.fly.dev npm run test:post-deploy
```

## Test Configuration

Tests are configured in `playwright.config.post-deploy.ts`:

- **Base URL**: https://dnd-recorder-staging.fly.dev (configurable via `DEPLOY_URL`)
- **Workers**: Single worker to avoid overwhelming deployed environment
- **Retries**: 1 retry for flaky network issues
- **Timeouts**: Extended timeouts for deployed environments (30s actions, 60s tests)
- **Reporting**: HTML report in `test-results-post-deploy/`

## Expected Results

### Passing Health Check
```json
{
  "status": "OK",
  "timestamp": "2025-08-26T13:37:47.713Z",
  "environment": "production",
  "database": "connected",
  "schema": "initialized",
  "databaseUrl": "postgresql:***@pgbouncer.vmkq60981nvr35ln.flympg.net/***"
}
```

### Key Verification Points

1. **Health Endpoint**: Returns 200 with status "OK"
2. **Database**: Connected with initialized schema
3. **Security**: Protected endpoints return 401 (not 404)
4. **Performance**: Responds within 10 seconds
5. **Features**: New progress tracking API available
6. **Environment**: Running in production mode

## Troubleshooting

### Common Issues

**Connection Timeouts**
- Check if staging URL is accessible
- Verify Fly.io deployment status
- Check for network/firewall issues

**Authentication Failures**
- Verify environment variables are set
- Check NextAuth configuration
- Ensure database has proper user records

**Database Connection Issues**
- Check PostgreSQL instance on Fly.io
- Verify database migrations have run
- Check connection string configuration

### Debug Commands

```bash
# Check Fly.io status
flyctl status --app dnd-recorder-staging

# View logs
flyctl logs --app dnd-recorder-staging

# Check health endpoint manually
curl https://dnd-recorder-staging.fly.dev/api/health
```

## CI/CD Integration

These tests are designed to run in CI/CD pipelines after deployment:

```yaml
- name: Verify Staging Deployment
  run: npm run test:staging
  env:
    DEPLOY_URL: https://dnd-recorder-staging.fly.dev
```

## Adding New Tests

When adding new features to the application:

1. Add basic API endpoint verification to `basic-staging-check.spec.ts`
2. Add comprehensive feature testing to `staging-verification.spec.ts`
3. Update this README with new verification points
4. Test locally against staging before committing

## Success Criteria

A successful staging deployment should:

- ✅ Pass all staging verification tests (23/23 tests)
  - 6 basic health checks
  - 17 comprehensive verification checks
- ✅ Return healthy status from API
- ✅ Have database properly connected and migrated
- ✅ Secure all protected endpoints (return 401, not 404)
- ✅ Respond to requests within performance thresholds
- ✅ Support new features and API endpoints
- ✅ All static assets loading correctly
- ✅ Authentication pages accessible

## Test Count Summary

- **Staging-Safe Tests**: 23 tests (2 files)
  - `basic-staging-check.spec.ts`: 6 tests
  - `staging-verification.spec.ts`: 17 tests

- **Integration Tests**: ~75 tests (excluded from staging runs)
  - `auth/api-auth.spec.ts`: ~25 tests
  - `auth/error-scenarios.spec.ts`: ~25 tests
  - `auth/login-flow.spec.ts`: ~10 tests
  - `auth/registration.spec.ts`: ~10 tests
  - `complete-workflow.spec.ts`: 4 tests
  - `login.spec.ts`: ~6 tests