# GitHub Test Dashboard Setup

This document explains how test results are displayed in GitHub Actions and how to access them.

## What Was Configured

### 1. Playwright GitHub Reporter
All Playwright configs now use the GitHub reporter in CI mode:
- `playwright.config.ts` - Default config
- `playwright.config.local.ts` - PR tests
- `playwright.config.workflows.ts` - Workflow tests
- `playwright.config.post-deploy.ts` - Post-deploy tests

**What this gives you:**
- ✅ Test annotations directly in GitHub Actions logs
- ✅ Failed tests appear as annotations in the workflow summary
- ✅ Quick overview of test failures without downloading artifacts
- ✅ Line-by-line test execution in the Actions logs

### 2. Enhanced HTML Report Artifacts
Updated workflows to upload HTML reports separately:
- **PR CI**: `playwright-report-pr-{PR_NUMBER}` (7 day retention)
- **Workflow Tests**: `playwright-html-report-workflows-{RUN_ID}` (30 day retention)
- **Staging Tests**: `playwright-html-report-staging-{RUN_ID}` (30 day retention)

### 3. GitHub Actions Summary
Added summary output to test jobs:
- Test results appear in the workflow summary
- Direct links to artifact downloads
- Status indicators for each test suite

## How to View Test Results

### In Pull Requests

1. **GitHub Checks Tab**
   - Go to your PR
   - Click "Checks" tab
   - See test status inline with your PR
   - Failed tests show as annotations

2. **GitHub Actions Summary**
   - Click on the workflow run
   - Scroll to the bottom to see "Summary"
   - Shows test results and artifact links

3. **Download HTML Report**
   - Go to the workflow run
   - Scroll to "Artifacts" section
   - Download `playwright-report-pr-{PR_NUMBER}`
   - Extract and open `index.html` in browser
   - Get full interactive report with:
     - Screenshots of failures
     - Video recordings
     - Test traces
     - Detailed error messages

### For Post-Merge Runs

1. **Workflow Summary**
   ```
   Post-Merge Test Results
   | Test Suite                   | Status   |
   |------------------------------|----------|
   | Workflow Tests               | ✅       |
   | Staging Deployment           | ✅       |
   | Staging Integration Tests    | ✅       |
   ```

2. **HTML Reports**
   - `playwright-html-report-workflows-{RUN_ID}` - Comprehensive E2E tests
   - `playwright-html-report-staging-{RUN_ID}` - Live staging tests

## GitHub Reporter Features

### Annotations
When tests fail, you'll see:
```
Error: expect(received).toBe(expected)
  at tests/integration/auth/login-flow.spec.ts:45:23
```

These appear as annotations in:
- Files changed view
- Workflow summary
- PR conversation (as checks)

### Test Grouping
Tests are grouped by file and suite:
```
✅ tests/unit/auth/whitelist.spec.ts
  ✅ isEmailWhitelisted
    ✅ should whitelist production emails
    ✅ should block non-whitelisted emails
```

### Performance Tracking
Each test shows duration:
```
✅ should complete signup flow (5.2s)
⚠️  Slow test: 5.2s (expected < 3s)
```

## Advanced: GitHub Pages (Optional)

To set up a permanent test dashboard:

1. **Enable GitHub Pages**
   - Go to repository Settings → Pages
   - Source: GitHub Actions
   - Enable

2. **Add Pages Deployment Job**
   ```yaml
   deploy-reports:
     name: Deploy Test Reports
     runs-on: ubuntu-latest
     needs: [workflow-tests, staging-tests]
     if: always()
     permissions:
       pages: write
       id-token: write
     steps:
       - uses: actions/configure-pages@v4
       - uses: actions/upload-pages-artifact@v3
         with:
           path: playwright-report-workflows/
       - uses: actions/deploy-pages@v4
   ```

3. **Access Reports**
   - `https://{your-username}.github.io/{repo-name}/`
   - Permanent links to test results
   - Historical data available

## Troubleshooting

### Reports Not Showing Up

**Check 1: Verify reporter is enabled**
```typescript
// playwright.config.ts
reporter: process.env.CI
  ? [['html'], ['github'], ['list']]
  : 'html',
```

**Check 2: Verify artifacts are uploaded**
```yaml
- name: Upload test results
  uses: actions/upload-artifact@v4
  if: always()  # ← This is important!
```

**Check 3: Check workflow permissions**
```yaml
permissions:
  contents: read
  checks: write  # ← Needed for annotations
```

### Annotations Not Appearing

1. Check if CI environment variable is set
2. Verify GitHub token has `checks: write` permission
3. Ensure `forbidOnly: !!process.env.CI` is set (tests won't run with `.only()` in CI)

### HTML Report Missing

1. Check the artifact exists in workflow run
2. Verify the upload path matches the output folder:
   ```yaml
   path: playwright-report-workflows/  # Must match reporter config
   ```

## Best Practices

### For Development
- Run tests locally: `npm run test:local`
- View HTML report: `npx playwright show-report`
- Debug specific test: `npx playwright test --debug path/to/test`

### For CI/CD
- Always use `if: always()` for artifact uploads
- Set appropriate retention days:
  - PR tests: 7 days (short-lived)
  - Post-merge: 30 days (historical reference)
- Include `github` reporter for inline annotations
- Include `list` reporter for console output
- Include `html` reporter for detailed analysis

### For PRs
- Keep test suite fast (< 5 minutes)
- Focus on unit tests and critical paths
- Save comprehensive tests for post-merge

### For Post-Merge
- Run full test suite
- Test against real infrastructure
- Include performance and load tests
- Generate comprehensive reports

## Metrics to Track

View these in the GitHub Actions summary:

1. **Test Duration**
   - Unit tests: < 1 minute
   - Integration tests: < 10 minutes
   - Workflow tests: < 30 minutes

2. **Test Stability**
   - Flaky test rate: < 1%
   - Retry success rate: > 90%

3. **Coverage Trends**
   - Failed tests per run
   - Average test duration
   - Most frequently failing tests

## Related Documentation

- [Testing Strategy](./TESTING_STRATEGY.md)
- [Playwright Documentation](https://playwright.dev/docs/test-reporters)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
