# Enhance CI/CD Pipeline with Security Scanning

## Description
Improve the CI/CD pipeline with additional security checks, performance testing, automated dependency updates, and comprehensive quality gates before deployment.

## Problem Statement
Current CI/CD pipeline has basic testing but lacks:
- Static Application Security Testing (SAST)
- Dependency vulnerability scanning beyond basic npm audit
- Performance budget enforcement
- Automated dependency updates
- Database migration validation
- Rollback mechanisms
- Comprehensive deployment notifications

## Tasks
- [ ] Add CodeQL for Static Application Security Testing
- [ ] Implement Snyk or Dependabot for dependency scanning
- [ ] Add Lighthouse CI for performance budgets
- [ ] Configure automated dependency updates
- [ ] Add database migration validation
- [ ] Implement automated rollback mechanisms
- [ ] Add deployment notifications (Slack/Discord)
- [ ] Set up security scorecard tracking
- [ ] Add container image scanning
- [ ] Implement secrets scanning

## Implementation Details

### 1. CodeQL Security Analysis (`.github/workflows/codeql.yml`)
```yaml
name: CodeQL Analysis
on:
  push:
    branches: [main, staging]
  pull_request:
    branches: [main, staging]
  schedule:
    - cron: '0 8 * * 1'  # Weekly on Monday

jobs:
  analyze:
    name: Analyze
    runs-on: ubuntu-latest
    permissions:
      actions: read
      contents: read
      security-events: write

    strategy:
      matrix:
        language: ['javascript', 'typescript']

    steps:
    - name: Checkout repository
      uses: actions/checkout@v4

    - name: Initialize CodeQL
      uses: github/codeql-action/init@v3
      with:
        languages: ${{ matrix.language }}
        queries: security-and-quality

    - name: Autobuild
      uses: github/codeql-action/autobuild@v3

    - name: Perform CodeQL Analysis
      uses: github/codeql-action/analyze@v3
      with:
        category: "/language:${{matrix.language}}"
```

### 2. Dependency Scanning (`.github/workflows/dependencies.yml`)
```yaml
name: Dependency Security
on:
  push:
    branches: [main, staging]
  pull_request:
  schedule:
    - cron: '0 0 * * *'  # Daily

jobs:
  snyk:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - name: Run Snyk to check for vulnerabilities
      uses: snyk/actions/node@master
      with:
        args: --severity-threshold=high
      env:
        SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}

  audit:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - name: npm audit
      run: |
        npm ci
        npm audit --production --audit-level=moderate
        
    - name: Check for outdated packages
      run: |
        npx npm-check-updates --errorLevel 2
```

### 3. Performance Budget (`.github/workflows/performance.yml`)
```yaml
name: Performance Check
on:
  pull_request:
    branches: [main, staging]

jobs:
  lighthouse:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    
    - name: Setup Node
      uses: actions/setup-node@v4
      with:
        node-version: '22'
        
    - name: Install and build
      run: |
        npm ci
        npm run build
        
    - name: Run Lighthouse CI
      uses: treosh/lighthouse-ci-action@v11
      with:
        urls: |
          http://localhost:3000
          http://localhost:3000/auth/signin
          http://localhost:3000/sessions
        budgetPath: ./lighthouse-budget.json
        uploadArtifacts: true
        temporaryPublicStorage: true
```

### 4. Lighthouse Budget Config (`lighthouse-budget.json`)
```json
{
  "path": "/*",
  "timings": [
    {
      "metric": "first-contentful-paint",
      "budget": 2000
    },
    {
      "metric": "largest-contentful-paint", 
      "budget": 3000
    },
    {
      "metric": "cumulative-layout-shift",
      "budget": 0.1
    }
  ],
  "resourceSizes": [
    {
      "resourceType": "script",
      "budget": 500
    },
    {
      "resourceType": "total",
      "budget": 2000
    }
  ],
  "resourceCounts": [
    {
      "resourceType": "third-party",
      "budget": 10
    }
  ]
}
```

### 5. Automated Dependency Updates (`.github/dependabot.yml`)
```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "03:00"
    open-pull-requests-limit: 5
    reviewers:
      - "kbrakke"
    labels:
      - "dependencies"
      - "automated"
    groups:
      dev-dependencies:
        patterns:
          - "@types/*"
          - "eslint*"
          - "prettier"
      production:
        patterns:
          - "*"
        exclude-patterns:
          - "@types/*"
          - "eslint*"
          - "prettier"
          - "playwright"

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
    labels:
      - "ci/cd"
      - "automated"
```

### 6. Migration Validation (`.github/workflows/migration-check.yml`)
```yaml
name: Database Migration Check
on:
  pull_request:
    paths:
      - 'prisma/**'
      - 'src/db/**'

jobs:
  migration-test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    
    - name: Setup test database
      run: |
        touch test.db
        echo "DATABASE_URL=file:./test.db" > .env
        
    - name: Run migrations
      run: |
        npx prisma migrate deploy
        npx prisma migrate status
        
    - name: Test rollback
      run: |
        # Create snapshot before migration
        cp test.db test.db.backup
        
        # Apply new migrations
        npx prisma migrate deploy
        
        # Verify rollback capability
        npx prisma migrate resolve --rolled-back
```

### 7. Deployment Notifications (`src/lib/notifications.ts`)
```typescript
interface DeploymentNotification {
  environment: 'staging' | 'production';
  status: 'started' | 'success' | 'failed' | 'rolled-back';
  version: string;
  deployedBy: string;
  duration?: number;
  error?: string;
}

export async function sendDeploymentNotification(notification: DeploymentNotification) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  
  const embed = {
    title: `Deployment ${notification.status}`,
    color: getStatusColor(notification.status),
    fields: [
      { name: 'Environment', value: notification.environment, inline: true },
      { name: 'Version', value: notification.version, inline: true },
      { name: 'Deployed By', value: notification.deployedBy, inline: true },
      ...(notification.duration ? [{ name: 'Duration', value: `${notification.duration}s` }] : []),
      ...(notification.error ? [{ name: 'Error', value: notification.error }] : [])
    ],
    timestamp: new Date().toISOString()
  };

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] })
  });
}
```

### 8. Enhanced Staging Workflow Updates
```yaml
# Add to .github/workflows/staging.yml

  secrets-scan:
    name: Scan for Secrets
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - name: TruffleHog OSS
      uses: trufflesecurity/trufflehog@main
      with:
        path: ./
        base: ${{ github.event.repository.default_branch }}
        
  quality-gate:
    name: Quality Gate Check
    needs: [security, test, secrets-scan]
    runs-on: ubuntu-latest
    steps:
    - name: Check quality metrics
      run: |
        # Check test coverage
        if [ $(cat coverage/coverage-summary.json | jq '.total.lines.pct') -lt 70 ]; then
          echo "Coverage below 70%"
          exit 1
        fi
        
        # Check bundle size
        if [ $(stat -f%z .next/static/chunks/*.js | awk '{sum+=$1} END {print sum}') -gt 2000000 ]; then
          echo "Bundle size exceeds 2MB"
          exit 1
        fi

  rollback:
    name: Automated Rollback
    if: failure() && github.event_name == 'push'
    needs: [deploy-staging]
    runs-on: ubuntu-latest
    steps:
    - name: Rollback deployment
      run: |
        flyctl deploy --image ${{ env.PREVIOUS_IMAGE }} --app dnd-recorder-staging
      env:
        FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
        
    - name: Notify rollback
      uses: actions/github-script@v7
      with:
        script: |
          github.rest.issues.createComment({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: context.issue.number,
            body: '⚠️ Deployment failed and was automatically rolled back'
          })
```

## Acceptance Criteria
- [ ] CodeQL scanning active on all branches
- [ ] No high/critical vulnerabilities in dependencies
- [ ] Performance budgets enforced in PRs
- [ ] Automated dependency updates working
- [ ] Migration validation prevents breaking changes
- [ ] Automated rollback triggers on failure
- [ ] Team receives deployment notifications
- [ ] Security scorecard visible in repo
- [ ] All scans integrated with GitHub Security tab

## Security Requirements
- Secrets never exposed in logs
- Vulnerability reports private by default
- Security fixes prioritized in automation
- SARIF reports uploaded to GitHub Security
- Container images scanned before deployment

## Monitoring & Reporting
- Weekly security summary email
- Real-time alerts for critical vulnerabilities
- Performance regression alerts
- Deployment success rate tracking
- Mean time to recovery (MTTR) metrics

## Definition of Done
- [ ] All security scanning workflows active
- [ ] Dependabot configured and creating PRs
- [ ] Performance budgets defined and enforced
- [ ] Notification webhooks configured
- [ ] Rollback tested and working
- [ ] Documentation updated
- [ ] Team trained on new tools
- [ ] Dashboards created for metrics

## Notes
- Consider adding DAST (Dynamic Application Security Testing) later
- Plan for security training based on findings
- Consider adding compliance scanning (GDPR, etc.)
- Set up security champions program
- Create runbook for security incidents

## Related Issues
- Depends on: Basic CI/CD setup
- Blocks: Production deployment
- Related to: #3 (Staging environment)

## Estimated Effort
- **Size:** Medium (5 story points)
- **Time:** 2-3 days
- **Priority:** Medium (improves quality gates)

## Labels
`ci/cd`, `security`, `automation`, `priority-medium`, `quality`