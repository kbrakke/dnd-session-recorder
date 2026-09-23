import { test, expect } from '@playwright/test';
import {
  expectSessionCompleted,
  pendingLocalChunks,
  recordingRequests,
  signInWithCampaign,
  startNewRecording,
  waitForFirstSavedPart,
} from './helpers';

test.describe.configure({ mode: 'serial' });

/**
 * The durability path: parts stop reaching the server, the tab dies, and the
 * same browser reopens the recorder — the IndexedDB tail is drained with the
 * STORED token (no takeover), then the recovery card finalizes everything.
 */
test('drains the local tail after the tab dies, then finalizes', async ({ page, context, request }) => {
  const { campaignId } = await signInWithCampaign(page, request, 'rec-crash');
  const { sessionId, recordingId } = await startNewRecording(page, campaignId);
  await waitForFirstSavedPart(page);

  // Parts can no longer land; chunks keep accumulating locally.
  const partRoute = '**/api/recordings/*/segments/*/parts/*';
  await context.route(partRoute, route => route.abort());
  await page.waitForTimeout(8_000);
  expect(await pendingLocalChunks(page)).toBeGreaterThan(0);

  // The tab dies (no beforeunload), in the SAME browser context.
  await page.close();
  await context.unroute(partRoute);

  const page2 = await context.newPage();
  const reqs = recordingRequests(page2);
  await page2.goto(`/sessions/${sessionId}/record`);

  await expect(page2.getByTestId('recovery-card')).toBeVisible({ timeout: 60_000 });
  await expect(page2.getByTestId('recovery-card')).toHaveAttribute('data-mode', 'tail');
  expect(reqs.parts.length).toBeGreaterThan(0); // the drain uploaded the tail
  expect(reqs.starts).toHaveLength(0); // ...without taking over
  expect(await pendingLocalChunks(page2)).toBe(0);

  await page2.getByTestId('recovery-finalize').click();
  await page2.waitForURL(new RegExp(`/sessions/${sessionId}\\?initialState=processing`), { timeout: 90_000 });
  const state = (await (await page2.request.get(`/api/recordings/${recordingId}`)).json()).recording;
  expect(state.status).toBe('finalized');
  await expectSessionCompleted(page2, sessionId);
});
