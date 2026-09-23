import { test, expect } from '@playwright/test';
import {
  expectSessionCompleted,
  recordingRequests,
  signInWithCampaign,
  startNewRecording,
  waitForFirstSavedPart,
} from './helpers';

test.describe.configure({ mode: 'serial' });

test('records live, keeps recording across navigation, stops, and hands off to processing', async ({ page, request }) => {
  const { campaignId } = await signInWithCampaign(page, request, 'rec-live');
  const reqs = recordingRequests(page);

  const { sessionId, recordingId } = await startNewRecording(page, campaignId);

  // Parts land mid-recording (5s parts via the test knob).
  await waitForFirstSavedPart(page);
  let state = (await (await page.request.get(`/api/recordings/${recordingId}`)).json()).recording;
  expect(state.status).toBe('recording');
  expect(state.segmentCount).toBe(1);
  expect(state.partCount).toBeGreaterThanOrEqual(1);
  expect(state.totalBytes).toBeGreaterThan(0);

  // Pause reaches the server through the heartbeat; resume continues.
  await page.getByTestId('pause').click();
  await expect
    .poll(async () => (await (await page.request.get(`/api/recordings/${recordingId}`)).json()).recording.status)
    .toBe('paused');
  await page.getByTestId('resume').click();
  await expect(page.getByTestId('pause')).toBeVisible();

  // In-app navigation does NOT stop the recorder: the Navbar indicator links back.
  await page.getByRole('link', { name: 'Sessions', exact: true }).click();
  await expect(page.getByTestId('recording-indicator')).toBeVisible();
  const partsBefore = reqs.parts.length;
  await expect.poll(() => reqs.parts.length, { timeout: 30_000 }).toBeGreaterThan(partsBefore);
  await page.getByTestId('recording-indicator').click();
  await page.waitForURL(new RegExp(`/sessions/${sessionId}/record$`));
  await expect(page.getByTestId('stop')).toBeEnabled();

  // One click, no confirm.
  await page.getByTestId('stop').click();
  await page.waitForURL(new RegExp(`/sessions/${sessionId}\\?initialState=processing`), { timeout: 90_000 });

  state = (await (await page.request.get(`/api/recordings/${recordingId}`)).json()).recording;
  expect(state.status).toBe('finalized');
  expect(state.finalizedUploadId).toBeTruthy();

  await expectSessionCompleted(page, sessionId);
  const session = await (await page.request.get(`/api/sessions/${sessionId}`)).json();
  expect(session.upload?.size).toBeGreaterThan(0);
  expect(session.duration).toBeGreaterThan(0); // finalize remuxes, so WebM has a duration

  // Exactly one start POST for one Start click (never from an effect).
  expect(reqs.starts).toHaveLength(1);

  // A finalized session can't be recorded again.
  const again = await page.request.post(`/api/sessions/${sessionId}/recording`, { data: {} });
  expect(again.status()).toBe(409);
  expect((await again.json()).code).toBe('has_audio');
});
