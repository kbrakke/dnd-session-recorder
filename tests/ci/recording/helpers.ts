import { expect } from '@playwright/test';
import type { APIRequestContext, BrowserContext, Page, Request } from '@playwright/test';
import { createTestUserViaAPI, generateTestUser, loginViaUI } from '../../staging/helpers/users';

/**
 * Shared setup for the live-recording specs (project `chromium-recording`:
 * fake mic, MOCK_AI_SERVICES, 1s timeslices / ~5s parts via webServer.env).
 * After login, use page.request — it shares the page's cookie jar.
 */
export async function signInWithCampaign(page: Page, request: APIRequestContext, prefix: string) {
  const user = await createTestUserViaAPI(request, generateTestUser(prefix));
  await loginViaUI(page, user.email, user.password);
  const res = await page.request.post('/api/campaigns', { data: { name: `Rec ${Date.now()}` } });
  expect(res.ok()).toBeTruthy();
  const campaign = await res.json();
  return { user, campaignId: campaign.id as string };
}

/** From /sessions/record: fill details, start, land on the recorder HUD. */
export async function startNewRecording(page: Page, campaignId: string, title = 'Live E2E session') {
  await page.goto(`/sessions/record?campaignId=${campaignId}`);
  await page.getByLabel('Session Title').fill(title);
  await expect(page.getByTestId('mic-picker')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('preflight-primary').click();
  await page.waitForURL(/\/sessions\/[^/]+\/record$/, { timeout: 30_000 });
  const sessionId = page.url().match(/\/sessions\/([^/]+)\/record/)![1];
  await expect(page.getByTestId('elapsed')).toBeVisible();
  const session = await (await page.request.get(`/api/sessions/${sessionId}`)).json();
  return { sessionId, recordingId: session.recording.id as string };
}

/** Wait until at least one part has been ACKed (the safety line says so). */
export async function waitForFirstSavedPart(page: Page) {
  await expect(page.getByTestId('safety-indicator')).toContainText(
    /(All audio saved|saved) through 0:00:(0[3-9]|[1-5]\d)/,
    { timeout: 45_000 }
  );
}

export function recordingRequests(target: Page | BrowserContext) {
  const starts: Request[] = [];
  const parts: Request[] = [];
  target.on('request', r => {
    if (r.method() === 'POST' && /\/api\/sessions\/[^/]+\/recording$/.test(r.url())) starts.push(r);
    if (r.method() === 'PUT' && /\/api\/recordings\/[^/]+\/segments\/\d+\/parts\/\d+$/.test(r.url())) parts.push(r);
  });
  return { starts, parts };
}

/** Poll the pipeline until the session completes (mocked AI), failing fast on errors. */
export async function expectSessionCompleted(page: Page, sessionId: string) {
  await expect
    .poll(
      async () => {
        const p = await (await page.request.get(`/api/sessions/${sessionId}/progress`)).json();
        if (p.status === 'error' || p.job?.status === 'failed') {
          throw new Error(`pipeline failed: ${p.errorMessage ?? p.job?.lastError}`);
        }
        return p.status;
      },
      { timeout: 120_000, intervals: [1000] }
    )
    .toBe('completed');
}

/** Rows left in this origin's recorder buffer. */
export async function pendingLocalChunks(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const req = indexedDB.open('rpg-session-recorder');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('chunks')) return resolve(0);
          const count = db.transaction('chunks', 'readonly').objectStore('chunks').count();
          count.onsuccess = () => {
            db.close();
            resolve(count.result);
          };
          count.onerror = () => reject(count.error);
        };
      })
  );
}
