import { test, expect } from '@playwright/test';
import { signInWithCampaign } from './helpers';

/**
 * Capture-API contract for a CLOSED segment: a retry of a part the ledger
 * already holds is still idempotent (2xx), while a part the segment does NOT
 * hold gets 409 segment_closed. The client relies on this split — it must
 * never read segment_closed as an ACK and delete its only local copy.
 */
test('a closed segment answers held parts with 2xx and missing parts with segment_closed', async ({ page, request }) => {
  const { campaignId } = await signInWithCampaign(page, request, 'rec-closed');
  const created = await page.request.post('/api/sessions', {
    data: { campaign_id: campaignId, title: 'Closed segment contract', session_date: new Date().toISOString() },
  });
  expect(created.status()).toBe(201);
  const sessionId = (await created.json()).id as string;

  const start = await page.request.post(`/api/sessions/${sessionId}/recording`, { data: { mimeType: 'audio/webm;codecs=opus' } });
  expect(start.ok()).toBeTruthy();
  const { recording, recorderToken } = await start.json();
  const headers = { 'x-recorder-token': recorderToken };
  const base = `/api/recordings/${recording.id}/segments`;
  const bytes = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4]);
  const put = (part: number) =>
    page.request.put(`${base}/0/parts/${part}`, {
      headers: { ...headers, 'content-type': 'application/octet-stream' },
      data: bytes,
    });

  expect((await page.request.post(base, { headers, data: { index: 0 } })).ok()).toBeTruthy();
  expect((await put(0)).ok()).toBeTruthy();
  expect((await page.request.post(`${base}/0/close`, { headers, data: { partCount: 1 } })).ok()).toBeTruthy();

  const retry = await put(0);
  expect(retry.status()).toBe(200);
  expect((await retry.json()).received).toBe(bytes.length);

  const missing = await put(1);
  expect(missing.status()).toBe(409);
  expect((await missing.json()).code).toBe('segment_closed');

  // Clean up so the test account leaves no live recording behind.
  expect((await page.request.delete(`/api/recordings/${recording.id}`, { headers })).ok()).toBeTruthy();
});
