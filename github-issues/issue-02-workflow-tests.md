# Implement Core Application Workflow Tests

## Description
Create comprehensive E2E tests for core application workflows including navigation, file uploads, campaign management, and session recording. These tests will ensure all primary user journeys work correctly.

## Problem Statement
Currently, we only have basic auth tests. We lack coverage for the main features of the application:
- No tests for audio file upload functionality
- No tests for campaign creation and management
- No tests for session recording workflows
- No tests for AI-powered transcription and summary generation
- No tests for navigation between different sections

## Tasks
- [ ] Create page navigation tests (all main routes)
- [ ] Implement audio file upload workflow test
- [ ] Add campaign CRUD operations tests
- [ ] Create session creation and management tests
- [ ] Add transcription generation tests
- [ ] Implement summary generation tests
- [ ] Add user profile management tests
- [ ] Create search and filter functionality tests
- [ ] Add data export/import tests
- [ ] Implement error recovery scenario tests

## Implementation Details

### 1. Test Directory Structure
```
tests/
  workflows/
    navigation.spec.ts          # App navigation tests
    audio-upload.spec.ts        # File upload workflow
    campaign-management.spec.ts # Campaign CRUD
    session-recording.spec.ts   # Session workflows
    transcription.spec.ts       # Transcription generation
    summary.spec.ts            # AI summary generation
    user-profile.spec.ts       # Profile management
  fixtures/
    test-audio.mp3            # Sample audio file
    test-audio-long.mp3       # Large file for edge cases
    invalid-file.txt          # For error testing
    campaigns.ts              # Campaign test data
    sessions.ts               # Session test data
  helpers/
    upload.ts                 # Upload utility functions
    wait.ts                   # Async wait helpers
```

### 2. Navigation Tests (`tests/workflows/navigation.spec.ts`)
```typescript
test.describe('Application Navigation', () => {
  test('should navigate between all main sections', async ({ page }) => {
    // Test home -> campaigns -> sessions -> profile flow
    // Verify breadcrumbs work correctly
    // Test browser back/forward functionality
    // Verify protected routes redirect to login
  });

  test('should handle deep linking', async ({ page }) => {
    // Test direct navigation to nested routes
    // Verify route parameters work correctly
  });
});
```

### 3. Audio Upload Tests (`tests/workflows/audio-upload.spec.ts`)
```typescript
test.describe('Audio File Upload', () => {
  test('should upload a valid audio file', async ({ page }) => {
    // Navigate to upload page
    // Select audio file
    // Verify upload progress
    // Check file appears in uploads list
    // Verify file metadata is correct
  });

  test('should handle large file uploads', async ({ page }) => {
    // Test with 100MB+ file
    // Verify chunked upload if implemented
    // Check timeout handling
  });

  test('should reject invalid file types', async ({ page }) => {
    // Try uploading non-audio files
    // Verify appropriate error messages
  });

  test('should handle upload interruption', async ({ page }) => {
    // Start upload
    // Simulate network interruption
    // Verify resume capability or error handling
  });
});
```

### 4. Campaign Management Tests (`tests/workflows/campaign-management.spec.ts`)
```typescript
test.describe('Campaign Management', () => {
  test('should create a new campaign', async ({ page }) => {
    // Fill campaign form
    // Add campaign details (name, description, players)
    // Save and verify creation
    // Check campaign appears in list
  });

  test('should edit existing campaign', async ({ page }) => {
    // Navigate to campaign
    // Edit details
    // Save changes
    // Verify updates persisted
  });

  test('should delete campaign with confirmation', async ({ page }) => {
    // Navigate to campaign
    // Click delete
    // Confirm deletion
    // Verify campaign removed
    // Check associated sessions handling
  });

  test('should handle campaign with active sessions', async ({ page }) => {
    // Try to delete campaign with sessions
    // Verify warning message
    // Test cascade delete if applicable
  });
});
```

### 5. Session Recording Tests (`tests/workflows/session-recording.spec.ts`)
```typescript
test.describe('Session Recording', () => {
  test('should create new session with audio', async ({ page }) => {
    // Select campaign
    // Start new session
    // Upload audio file
    // Add session notes
    // Save session
    // Verify session created
  });

  test('should generate transcription', async ({ page }) => {
    // Navigate to session
    // Trigger transcription
    // Wait for processing
    // Verify transcription appears
    // Check transcription accuracy markers
  });

  test('should generate AI summary', async ({ page }) => {
    // Navigate to session with transcription
    // Request summary generation
    // Wait for AI processing
    // Verify summary appears
    // Check summary sections (NPCs, locations, etc.)
  });

  test('should handle concurrent session updates', async ({ page, context }) => {
    // Open session in two tabs
    // Make changes in both
    // Verify conflict resolution
  });
});
```

### 6. Test Helpers (`tests/helpers/upload.ts`)
```typescript
export async function uploadFile(page: Page, filePath: string) {
  const fileInput = await page.locator('input[type="file"]');
  await fileInput.setInputFiles(filePath);
}

export async function waitForUploadComplete(page: Page) {
  await page.waitForSelector('[data-testid="upload-complete"]', {
    timeout: 60000
  });
}

export async function getUploadProgress(page: Page): Promise<number> {
  const progress = await page.locator('[data-testid="upload-progress"]');
  return parseInt(await progress.getAttribute('value') || '0');
}
```

## Acceptance Criteria
- [ ] All core user journeys have E2E test coverage
- [ ] Tests run in under 5 minutes locally
- [ ] Tests are parallelizable (no interdependencies)
- [ ] Clear test reports with screenshots on failure
- [ ] Tests work in both headed and headless modes
- [ ] Visual regression tests for key UI components
- [ ] Performance metrics captured during tests
- [ ] Tests handle both success and error scenarios

## Technical Requirements
- Use Playwright's built-in screenshot and video recording
- Implement custom test reporters for better visibility
- Add test data generators for realistic scenarios
- Use page object model for maintainability
- Add retry logic for flaky operations
- Implement proper test timeouts

## Test Data Requirements
- Sample audio files (various formats: mp3, wav, m4a)
- Test campaigns with different configurations
- Mock API responses for AI services (when needed)
- Test user accounts with different permission levels

## Definition of Done
- [ ] All workflow tests implemented
- [ ] Tests passing locally and in CI
- [ ] Code review completed
- [ ] Test documentation written
- [ ] Performance benchmarks established
- [ ] Test coverage report > 70% for UI components
- [ ] Video recordings of test runs available

## Notes
- Consider adding accessibility tests within workflows
- Ensure tests work across different browsers
- Add mobile viewport tests for responsive design
- Consider adding load testing for file uploads
- Monitor test execution time trends

## Related Issues
- Depends on: #1 (Auth test refactoring)
- Blocks: #5 (Staging E2E tests)
- Related to: #6 (Test data management)

## Estimated Effort
- **Size:** X-Large (8-13 story points)
- **Time:** 1 week
- **Priority:** High (core functionality validation)

## Labels
`testing`, `e2e`, `features`, `priority-high`, `workflows`