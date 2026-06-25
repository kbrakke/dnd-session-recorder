# Configure Staging Environment with Secure Test Users

## Description
Establish a secure staging environment on Fly.io with well-defined test users, restricted access via whitelist, and appropriate API keys with usage limits. This environment will serve as the final testing ground before production deployments.

## Problem Statement
We need a staging environment that:
- Mirrors production configuration but with test data
- Restricts access to authorized test users only
- Uses separate API keys with appropriate limits
- Can be reset without affecting production
- Provides a safe space for QA and stakeholder testing

## Tasks
- [ ] Set up dedicated staging database on Fly.io
- [ ] Configure staging-specific environment variables
- [ ] Implement secure test user management system
- [ ] Set up staging-specific API key rotation
- [ ] Configure staging domain and SSL certificates
- [ ] Implement staging data reset mechanism
- [ ] Add staging environment monitoring
- [ ] Create staging deployment documentation
- [ ] Set up backup and restore procedures
- [ ] Configure rate limiting for staging

## Implementation Details

### 1. Fly.io Staging Configuration (`fly.staging.toml`)
```toml
app = "dnd-recorder-staging"
primary_region = "bos"

[build]
  dockerfile = "Dockerfile"

[env]
  NODE_ENV = "production"
  NEXT_PUBLIC_ENVIRONMENT = "staging"
  PORT = "3000"
  WHITELIST_ENABLED = "true"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 1  # Keep at least 1 instance running
  processes = ["app"]

[[http_service.checks]]
  grace_period = "10s"
  interval = "30s"
  method = "GET"
  timeout = "5s"
  path = "/api/health"

[mounts]
  source = "dnd_data_staging"
  destination = "/app/data"
  processes = ["app"]

[[metrics]]
  path = "/metrics"
  port = 9090
```

### 2. Staging Secrets Configuration
```bash
# Set up staging secrets in Fly.io
fly secrets set NEXTAUTH_SECRET_STAGING="[32-char-staging-secret]" --app dnd-recorder-staging
fly secrets set OPENAI_API_KEY_STAGING="sk-staging-[limited-key]" --app dnd-recorder-staging
fly secrets set DATABASE_URL_STAGING="file:./data/staging.db" --app dnd-recorder-staging
fly secrets set ADMIN_API_KEY="[admin-key-for-reset-endpoint]" --app dnd-recorder-staging
```

### 3. Test User Configuration (`src/config/staging-users.ts`)
```typescript
export const STAGING_TEST_USERS = [
  {
    email: 'admin@test.com',
    name: 'Test Admin',
    role: 'admin',
    password: process.env.TEST_ADMIN_PASSWORD,
    description: 'Full admin access for testing'
  },
  {
    email: 'user@test.com',
    name: 'Test User',
    role: 'user',
    password: process.env.TEST_USER_PASSWORD,
    description: 'Standard user for feature testing'
  },
  {
    email: 'readonly@test.com',
    name: 'Test Viewer',
    role: 'viewer',
    password: process.env.TEST_VIEWER_PASSWORD,
    description: 'Read-only access for viewing'
  },
  {
    email: 'kbrakke@gmail.com',
    name: 'Kevin Brakke',
    role: 'admin',
    description: 'Product owner access'
  }
];
```

### 4. Staging Reset Endpoint (`src/app/api/staging/reset/route.ts`)
```typescript
export async function POST(req: Request) {
  // Verify admin API key
  const apiKey = req.headers.get('X-Admin-Key');
  if (apiKey !== process.env.ADMIN_API_KEY) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Only allow in staging
  if (process.env.NEXT_PUBLIC_ENVIRONMENT !== 'staging') {
    return new Response('Not available', { status: 404 });
  }

  // Reset database to initial state
  await resetStagingDatabase();
  
  // Recreate test users
  await createTestUsers();
  
  // Seed sample data
  await seedStagingData();

  return new Response('Staging reset complete', { status: 200 });
}
```

### 5. Whitelist Enhancement (`src/lib/whitelist.ts`)
```typescript
import { STAGING_TEST_USERS } from '@/config/staging-users';

export const WHITELIST_CONFIG = {
  enabled: process.env.WHITELIST_ENABLED === 'true',
  
  // Dynamic whitelist based on environment
  allowedEmails: process.env.NEXT_PUBLIC_ENVIRONMENT === 'staging' 
    ? STAGING_TEST_USERS.map(u => u.email)
    : [],
  
  // Allow adding temporary access
  temporaryAccess: new Map<string, Date>(),
  
  messages: {
    accessDenied: 'Access restricted to authorized test users only.',
    signupBlocked: 'New account creation is disabled in staging.',
    loginBlocked: 'Your email is not authorized for staging access.'
  }
};

export function grantTemporaryAccess(email: string, hours: number = 24) {
  const expiry = new Date();
  expiry.setHours(expiry.getHours() + hours);
  WHITELIST_CONFIG.temporaryAccess.set(email, expiry);
}
```

### 6. API Rate Limiting for Staging
```typescript
// src/lib/rate-limit.ts
export const STAGING_LIMITS = {
  openai: {
    requests_per_minute: 10,
    tokens_per_day: 10000
  },
  uploads: {
    files_per_hour: 5,
    max_file_size_mb: 50
  },
  api: {
    requests_per_minute: 100
  }
};
```

### 7. Monitoring Setup
```yaml
# .github/workflows/staging-monitor.yml
name: Staging Health Check
on:
  schedule:
    - cron: '*/15 * * * *'  # Every 15 minutes
jobs:
  health-check:
    runs-on: ubuntu-latest
    steps:
      - name: Check staging health
        run: |
          response=$(curl -s -o /dev/null -w "%{http_code}" https://dnd-recorder-staging.fly.dev/api/health)
          if [ $response != "200" ]; then
            echo "Staging is unhealthy: HTTP $response"
            exit 1
          fi
```

## Acceptance Criteria
- [ ] Staging environment accessible at https://dnd-recorder-staging.fly.dev
- [ ] Only whitelisted users can access staging
- [ ] Staging database completely isolated from production
- [ ] API keys have appropriate rate limits enforced
- [ ] Staging can be reset via authenticated API call
- [ ] SSL certificates properly configured
- [ ] Health monitoring active with alerts
- [ ] Staging data persists between deployments
- [ ] Clear documentation for accessing staging

## Security Requirements
- All staging secrets stored in Fly.io secrets (never in code)
- HTTPS enforced for all connections
- Rate limiting prevents abuse
- Admin endpoints require API key authentication
- Test user passwords are strong and rotated regularly
- No production data in staging environment
- Audit logging for all admin actions

## Documentation Requirements
Create `docs/staging-environment.md` with:
- How to access staging
- Test user credentials (reference to secure storage)
- How to request temporary access
- How to reset staging data
- Troubleshooting guide
- API limits and restrictions

## Definition of Done
- [ ] Staging environment deployed on Fly.io
- [ ] All test users can log in successfully
- [ ] Whitelist blocking non-authorized users
- [ ] Reset endpoint working and secured
- [ ] Monitoring and alerts configured
- [ ] Documentation complete
- [ ] Team trained on staging usage
- [ ] Backup/restore tested

## Notes
- Consider implementing staging-specific feature flags
- Add capability for A/B testing in staging
- Consider blue-green deployment for staging
- Plan for staging data migration strategy
- Set up staging-specific error tracking (Sentry)

## Related Issues
- Depends on: Current whitelist implementation
- Blocks: #5 (Staging E2E tests)
- Related to: #4 (CI/CD pipeline)

## Estimated Effort
- **Size:** Large (8 story points)
- **Time:** 3-4 days
- **Priority:** High (blocking staging tests)

## Labels
`infrastructure`, `security`, `staging`, `priority-high`, `deployment`