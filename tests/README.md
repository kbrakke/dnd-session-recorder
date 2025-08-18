# Test Suite Documentation

## Overview

The test suite is divided into three categories:

1. **Local Tests** - Unit tests that can run in a local development environment
2. **Workflow Tests** - Comprehensive integration tests that require full staging environment with AI services
3. **Post-Deploy Tests** - Tests that require a deployed environment with full infrastructure

## Test Categories

### Local Tests (`npm run test:local`)
Unit tests that can run without external dependencies:
- Authentication logic unit tests
- Rate limiting unit tests  
- Whitelist functionality tests
- Pure logic and utility function tests

Configuration: `playwright.config.local.ts`

### Workflow Tests (`npm run test:workflows`)
Comprehensive integration tests that require staging environment:
- AI features (transcription, summarization)
- Audio file upload and processing
- Campaign management workflows
- Session recording workflows
- User profile management
- End-to-end navigation flows

**Requirements:**
- Full staging environment with database
- AI service integration (OpenAI API)
- Audio processing capabilities
- Complete authentication infrastructure

Configuration: `playwright.config.workflows.ts`

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
# Run all local unit tests
npm run test:local

# Run with UI
npm run test:local -- --ui

# Run in headed mode
npm run test:local -- --headed
```

### Workflow Testing (Staging Environment)
```bash
# Run comprehensive workflow tests
npm run test:workflows

# Run specific workflow test
npm run test:workflows -- tests/workflows/ai-features.spec.ts

# Run with specific browser
npm run test:workflows -- --project=chromium
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

#### Workflow Tests (Staging Environment)
Run on staging environment with full AI services:
```bash
npm run test:workflows
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
├── unit/                        # Unit tests (local only)
│   └── auth/                   # Authentication logic unit tests
├── workflows/                   # Comprehensive workflow tests (staging only)
│   ├── ai-features.spec.ts     # AI transcription/summarization tests
│   ├── audio-upload.spec.ts    # Audio file upload tests
│   ├── campaign-management.spec.ts # Campaign CRUD tests
│   ├── navigation.spec.ts      # End-to-end navigation tests
│   ├── session-recording.spec.ts # Session management tests
│   ├── user-profile.spec.ts    # User profile tests
│   ├── global-setup.ts         # Workflow test setup
│   └── global-teardown.ts      # Workflow test cleanup
├── integration/                 # Integration tests (mixed)
│   ├── auth/                   # Auth tests (post-deploy)
│   └── ...                     # Other integration tests
├── post-deploy/                # All post-deploy tests
│   ├── auth/                   # Authentication tests
│   └── login.spec.ts          # Login flow test
├── fixtures/                   # Test fixtures and helpers
├── helpers/                    # Test helper utilities
└── setup/                      # Test setup utilities
```

## Environment Variables

### Local Tests
- `NEXTAUTH_SECRET`: Test secret for authentication
- `DATABASE_URL`: Local test database (usually `file:./prisma/data/test.db`)
- `MOCK_AUTH`: Set to `true` to use mock authentication

### Workflow Tests  
- `NEXTAUTH_SECRET`: Test secret for authentication
- `DATABASE_URL`: Workflow test database (usually `file:./prisma/data/workflow-test.db`)
- `OPENAI_API_KEY`: Required for AI features testing
- `NODE_ENV`: Should be `development`
- `MOCK_AI_SERVICES`: Set to `true` in CI to mock AI services

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