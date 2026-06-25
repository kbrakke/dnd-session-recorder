# GitHub Actions Deployment Setup

This guide explains how to configure GitHub Actions for automated deployment to Fly.io staging and production environments.

## 🔧 Required GitHub Secrets

You need to set up these secrets in your GitHub repository settings (`Settings > Secrets and variables > Actions`):

### Core Secrets
```bash
FLY_API_TOKEN=fly_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  # From `flyctl auth token`
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  # Your OpenAI API key
```

### Environment-Specific Secrets
```bash
# Staging
NEXTAUTH_SECRET_STAGING=your-staging-secret-32-chars-long  # Generate with `openssl rand -base64 32`

# Production  
NEXTAUTH_SECRET_PRODUCTION=your-production-secret-32-chars-long  # Generate with `openssl rand -base64 32`
```

## 🏗️ Fly.io Setup Commands

Run these commands to set up your Fly.io applications:

### 1. Create Applications
```bash
# Create staging app
flyctl apps create dnd-recorder-staging

# Create production app  
flyctl apps create dnd-recorder-prod
```

### 2. Create Volumes for Data Persistence
```bash
# Staging volume (1GB)
flyctl volumes create dnd_data_staging --region bos --size 1 --app dnd-recorder-staging

# Production volume (5GB)
flyctl volumes create dnd_data_prod --region bos --size 5 --app dnd-recorder-prod
```

### 3. Set Environment Variables
```bash
# Staging environment
flyctl secrets set \
  NEXTAUTH_SECRET="your-staging-secret-here" \
  NEXTAUTH_URL="https://dnd-recorder-staging.fly.dev" \
  OPENAI_API_KEY="your-openai-key" \
  DATABASE_URL="file:/app/data/staging.db" \
  NODE_ENV="production" \
  --app dnd-recorder-staging

# Production environment
flyctl secrets set \
  NEXTAUTH_SECRET="your-production-secret-here" \
  NEXTAUTH_URL="https://dnd-recorder-prod.fly.dev" \
  OPENAI_API_KEY="your-openai-key" \
  DATABASE_URL="file:/app/data/production.db" \
  NODE_ENV="production" \
  --app dnd-recorder-prod
```

## 🔐 GitHub Repository Settings

### 1. Enable GitHub Actions
- Go to `Settings > Actions > General`
- Set "Actions permissions" to "Allow all actions and reusable workflows"

### 2. Configure Environments
Go to `Settings > Environments` and create:

#### Staging Environment
- **Name**: `staging`
- **Deployment branches**: `staging` branch only
- **Environment secrets**: Add staging-specific secrets if needed

#### Production Environment  
- **Name**: `production`
- **Deployment branches**: `main` branch only
- **Protection rules**: 
  - ✅ Required reviewers (1-2 people)
  - ✅ Wait timer: 5 minutes
  - ✅ Prevent self-review
- **Environment secrets**: Add production-specific secrets if needed

### 3. Branch Protection Rules
Go to `Settings > Branches` and add protection for:

#### Staging Branch (`staging`)
- ✅ Require a pull request before merging
- ✅ Require status checks to pass before merging
  - Required checks: `Security & Code Quality`, `Build & Test`
- ✅ Require conversation resolution before merging

#### Main Branch (`main`)  
- ✅ Require a pull request before merging
- ✅ Require status checks to pass before merging
  - Required checks: All staging checks + `Production Security Audit`, `Comprehensive Testing`
- ✅ Require review from code owners
- ✅ Dismiss stale PR approvals when new commits are pushed
- ✅ Require conversation resolution before merging
- ✅ Require signed commits (optional but recommended)

## 🚀 Deployment Workflow

### Staging Deployment
1. **Push to `staging` branch** → Triggers automatic deployment
2. **Workflow steps**:
   - Security & code quality checks
   - Build & Playwright tests  
   - Docker image build & security scan
   - Deploy to Fly.io staging
   - Health checks & smoke tests
   - Success/failure notifications

### Production Deployment  
1. **Create PR to `main`** → Triggers test runs
2. **Merge PR to `main`** → Triggers production deployment (with approval)
3. **Manual approval required** for production deployment
4. **Workflow steps**:
   - Enhanced security audit (secrets scanning, strict linting)
   - Multi-browser testing (Chromium, Firefox, WebKit)
   - Production Docker build (multi-platform)
   - Database backup
   - Blue-green deployment to production
   - Database migrations
   - Comprehensive health checks
   - 5-minute stability monitoring
   - Automatic rollback on failure

## 📊 Monitoring & Notifications

### Health Checks
- **Staging**: `https://dnd-recorder-staging.fly.dev/api/health`
- **Production**: `https://dnd-recorder-prod.fly.dev/api/health`

### Fly.io Dashboards
- **Staging**: https://fly.io/apps/dnd-recorder-staging
- **Production**: https://fly.io/apps/dnd-recorder-prod

### Artifacts & Reports
- Playwright test reports (30-day retention)
- Security scan results (SARIF format)
- Docker vulnerability reports
- Deployment logs

## 🔧 Troubleshooting

### Common Issues

1. **"FLY_API_TOKEN invalid"**
   - Regenerate token: `flyctl auth token`
   - Update GitHub secret

2. **"App not found"**
   - Ensure Fly.io apps are created: `flyctl apps list`
   - Check app names match `fly.toml` files

3. **"Volume not found"**
   - Create volumes: `flyctl volumes list --app your-app-name`
   - Ensure volume names match `fly.toml` configuration

4. **Database migration fails**
   - Check DATABASE_URL is correct in Fly.io secrets
   - Ensure database file has proper permissions

5. **Health checks fail**
   - Check application logs: `flyctl logs --app your-app-name`
   - Verify all environment variables are set
   - Ensure `/api/health` endpoint works

### Manual Rollback
If automatic rollback fails:
```bash
# List recent releases
flyctl releases --app dnd-recorder-prod

# Rollback to specific version
flyctl releases rollback v123 --app dnd-recorder-prod
```

## 🎯 Next Steps

After setup:
1. Test staging deployment by pushing to `staging` branch
2. Create a test PR to `main` to verify production workflow
3. Set up monitoring alerts (optional)
4. Configure Slack/Discord webhooks for notifications (optional)
5. Set up log aggregation (optional)

## 📝 Security Notes

- Never commit secrets to the repository
- Rotate API tokens regularly (quarterly recommended)
- Use environment-specific secrets
- Enable signed commits for additional security
- Review deployment logs for any sensitive data exposure
- Monitor for failed login attempts and unusual activity