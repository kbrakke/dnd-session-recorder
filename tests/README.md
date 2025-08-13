# Test Suite Documentation

## Overview

The test suite is divided into two categories:

1. **Local Tests** - Tests that can run in a local development environment
2. **Post-Deploy Tests** - Tests that require a deployed environment with full infrastructure

## Test Categories

### Local Tests (`npm run test:local`)
Tests that can run without external dependencies:
- Unit tests
- Component tests
- Basic integration tests with mocked authentication
- UI tests that don't require real authentication

Configuration: `playwright.config.local.ts`

### Post-Deploy Tests (`npm run test:post-deploy`)
Tests that require a deployed environment:
- Authentication flow tests (login, registration, session management)
- API authentication and authorization tests
- Rate limiting verification
- Cross-user data access protection
- Session persistence tests
- Real JWT token validation

Configuration: `playwright.config.post-deploy.ts`

## Running Tests

### Local Development
```bash
# Run all local tests
npm run test:local

# Run with UI
npm run test:local -- --ui

# Run in headed mode
npm run test:local -- --headed
```

### Post-Deploy Testing
```bash
# Set the deployment URL
export DEPLOY_URL=https://staging.example.com

# Run post-deploy tests
npm run test:post-deploy

# Run specific test file
npm run test:post-deploy -- tests/post-deploy/auth/login-flow.spec.ts
```

### CI/CD Pipeline

#### Local Tests (Pre-Deployment)
Run on every PR and commit:
```bash
npm run test:local
```

#### Post-Deploy Tests (Post-Deployment)
Run after deployment to staging/production:
```bash
DEPLOY_URL=$STAGING_URL npm run test:post-deploy
```

## Test Structure

```
tests/
├── README.md                     # This file
├── unit/                        # Unit tests (local)
├── integration/                 # Integration tests (mixed)
│   ├── auth/                   # Auth tests (post-deploy)
│   └── ...                     # Other integration tests
├── post-deploy/                # All post-deploy tests
│   ├── auth/                   # Authentication tests
│   └── login.spec.ts          # Login flow test
├── fixtures/                   # Test fixtures and helpers
└── setup/                      # Test setup utilities
```

## Environment Variables

### Local Tests
- `NEXTAUTH_SECRET`: Test secret for authentication
- `DATABASE_URL`: Local test database
- `MOCK_AUTH`: Set to `true` to use mock authentication

### Post-Deploy Tests
- `DEPLOY_URL`: URL of the deployed environment (required)
- Test user credentials should be configured in the deployed environment

## Troubleshooting

### Authentication Tests Failing Locally
Authentication tests require real NextAuth.js infrastructure and should only run in post-deploy suite.

### Database Connection Issues
Ensure the test database is properly initialized:
```bash
npx prisma migrate dev
```

### Rate Limiting Tests
Rate limiting tests may fail if the deployed environment doesn't have rate limiting configured.