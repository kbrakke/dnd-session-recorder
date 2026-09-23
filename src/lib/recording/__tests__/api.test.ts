import { describe, expect, it, vi } from 'vitest';
import { classifyRecorderError, createRecorderApi } from '../api';

describe('classifyRecorderError', () => {
  const kind = (status: number | null, body: Record<string, unknown> | null) =>
    classifyRecorderError(status, body as never, null).kind;

  it('maps every server code', () => {
    expect(kind(409, { code: 'stale_token' })).toBe('stale-token');
    expect(kind(409, { code: 'not_capturing' })).toBe('not-capturing');
    expect(kind(409, { code: 'still_capturing' })).toBe('still-capturing');
    expect(kind(409, { code: 'segment_gap' })).toBe('segment-gap');
    expect(kind(404, { code: 'segment_not_found' })).toBe('segment-not-found');
    expect(kind(409, { code: 'segment_closed' })).toBe('segment-closed');
    expect(kind(409, { code: 'parts_missing' })).toBe('parts-missing');
    expect(kind(400, { code: 'empty_part' })).toBe('client-bug');
    expect(kind(400, { code: 'invalid_request' })).toBe('client-bug');
    expect(kind(413, { code: 'part_too_large' })).toBe('client-bug');
    expect(kind(413, { code: 'recording_too_large' })).toBe('recording-too-large');
    expect(kind(409, { code: 'already_finalizing' })).toBe('already-finalizing');
    expect(kind(400, { code: 'nothing_captured' })).toBe('nothing-captured');
    expect(kind(409, { code: 'cannot_discard' })).toBe('cannot-discard');
    expect(kind(409, { code: 'has_audio' })).toBe('has-audio');
    expect(kind(409, { code: 'past_capture' })).toBe('past-capture');
  });

  it('falls back to the legacy error string', () => {
    expect(kind(409, { error: 'Recording was taken over in another tab' })).toBe('stale-token');
    expect(kind(409, { error: 'Segment is closed' })).toBe('segment-closed');
  });

  it('classifies transport-level outcomes', () => {
    expect(kind(null, null)).toBe('network');
    expect(kind(401, { error: 'Authentication required' })).toBe('auth');
    expect(kind(429, { error: 'Too many' })).toBe('rate-limited');
    expect(kind(503, null)).toBe('retryable');
    expect(kind(404, { error: 'Recording not found' })).toBe('not-found');
    expect(kind(418, null)).toBe('client-bug');
  });

  it('carries missing[], lastHeartbeatAt and Retry-After', () => {
    const e = classifyRecorderError(409, { code: 'parts_missing', missing: [1, 3] }, null);
    expect(e.missing).toEqual([1, 3]);
    const s = classifyRecorderError(409, { code: 'still_capturing', lastHeartbeatAt: 'x' }, null);
    expect(s.extra.lastHeartbeatAt).toBe('x');
    expect(classifyRecorderError(429, null, '12').retryAfterMs).toBe(12_000);
  });
});

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

describe('createRecorderApi', () => {
  it('sends parts as octet-stream with the recorder token', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { received: 3 }));
    const api = createRecorderApi(fetchImpl);
    const n = await api.transport.putPart('r1', 'tok', 2, 5, new Blob([new Uint8Array([1, 2, 3])]));
    expect(n).toBe(3);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/recordings/r1/segments/2/parts/5');
    expect(init.method).toBe('PUT');
    expect((init.headers as Record<string, string>)['x-recorder-token']).toBe('tok');
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/octet-stream');
    expect(init).not.toHaveProperty('keepalive');
  });

  it('throws a classified error on failure and a network error on reject', async () => {
    const api = createRecorderApi(async () => jsonResponse(409, { error: 'x', code: 'stale_token' }));
    await expect(api.transport.heartbeat('r', 't', 'paused')).rejects.toMatchObject({ kind: 'stale-token', status: 409 });
    const offline = createRecorderApi(async () => { throw new TypeError('Failed to fetch'); });
    await expect(offline.transport.openSegment('r', 't', 0)).rejects.toMatchObject({ kind: 'network' });
  });

  it('maps draft-session creation to the snake_case body', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(201, { id: 's1', status: 'draft' }));
    const api = createRecorderApi(fetchImpl);
    expect(await api.createDraftSession({ title: 'T', campaignId: 'c', sessionDate: 'd' })).toEqual({ id: 's1' });
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(init.body as string)).toEqual({ title: 'T', campaign_id: 'c', session_date: 'd' });
  });

  it('passes force and the token on finalize/discard', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { status: 'finalizing', jobId: 'j' }));
    const api = createRecorderApi(fetchImpl);
    await api.finalizeRecording('r', { token: 't', force: true });
    const [, finalizeInit] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(finalizeInit.body as string)).toEqual({ force: true });
    expect((finalizeInit.headers as Record<string, string>)['x-recorder-token']).toBe('t');
    await api.discardRecording('r', { force: true });
    const [url, discardInit] = fetchImpl.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe('/api/recordings/r?force=1');
    expect(discardInit.method).toBe('DELETE');
  });

  it('startOrTakeover only sends force when asked', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { recorderToken: 't', nextSegmentIndex: 0, recording: {} }));
    const api = createRecorderApi(fetchImpl);
    await api.startOrTakeover('s', 'audio/webm;codecs=opus');
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(init.body as string)).toEqual({ mimeType: 'audio/webm;codecs=opus' });
  });
});
