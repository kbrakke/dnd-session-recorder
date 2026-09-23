import { test, expect } from '@playwright/test';
import {
  expectSessionCompleted,
  recordingRequests,
  signInWithCampaign,
  startNewRecording,
  waitForFirstSavedPart,
} from './helpers';

test.describe.configure({ mode: 'serial' });

/**
 * A second tab in the same browser must never drain or take over by merely
 * opening the recorder (the live tab holds a Web Lock); taking over is an
 * explicit, confirmed click, after which the first tab stops.
 */
test('a second tab sees the live recording and only takes over on an explicit confirm', async ({ page, context, request }) => {
  const { campaignId } = await signInWithCampaign(page, request, 'rec-tabs');
  const { sessionId } = await startNewRecording(page, campaignId);
  await waitForFirstSavedPart(page);

  const page2 = await context.newPage();
  const reqs2 = recordingRequests(page2);
  await page2.goto(`/sessions/${sessionId}/record`);
  await expect(page2.getByTestId('recovery-card')).toHaveAttribute('data-mode', 'live-elsewhere', { timeout: 60_000 });
  expect(reqs2.starts).toHaveLength(0);
  expect(reqs2.parts).toHaveLength(0);

  await page2.getByTestId('recovery-takeover').click();
  await page2.getByTestId('confirm-takeover').click();
  await expect(page2.getByTestId('mic-picker')).toBeVisible({ timeout: 30_000 });
  await page2.getByTestId('preflight-primary').click();
  await expect(page2.getByTestId('stop')).toBeEnabled({ timeout: 30_000 });
  expect(reqs2.starts).toHaveLength(1);

  // The first tab's next write gets 409 stale_token: it stops, and says why.
  await expect(page.getByTestId('taken-over')).toBeVisible({ timeout: 45_000 });

  await expect(page2.getByTestId('safety-indicator')).toContainText(/saved through/, { timeout: 30_000 });
  await page2.getByTestId('stop').click();
  await page2.waitForURL(new RegExp(`/sessions/${sessionId}\\?initialState=processing`), { timeout: 90_000 });
  await expectSessionCompleted(page2, sessionId);
});
