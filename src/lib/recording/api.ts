import { retryAfterMs } from './backoff';
import type {
  RecordingState,
  RecordingSummary,
  StartRecordingResponse,
} from './types';

/**
 * Typed fetch wrappers for the live-recording API plus error
 * classification. Branches on the server's stable `code` (see
 * src/app/api/CLAUDE.md), falling back to the legacy `error` string.
 *
 * Never use `keepalive` or sendBeacon here: both cap bodies at 64 KiB, and a
 * part "sent" that way is silently dropped.
 */

export type RecorderErrorKind =
  | 'network'
  | 'retryable'
  | 'rate-limited'
  | 'auth'
  | 'stale-token'
  | 'not-capturing'
  | 'still-capturing'
  | 'not-found'
  | 'segment-not-found'
  | 'segment-closed'
  | 'segment-gap'
  | 'parts-missing'
  | 'recording-too-large'
  | 'already-finalizing'
  | 'nothing-captured'
  | 'cannot-discard'
  | 'has-audio'
  | 'past-capture'
  | 'client-bug';

export class RecorderApiError extends Error {
  constructor(
    public readonly kind: RecorderErrorKind,
    message: string,
    public readonly status: number | null,
    public readonly extra: {
      retryAfterMs?: number | null;
      missing?: number[];
      lastHeartbeatAt?: string;
      code?: string;
    } = {}
  ) {
    super(message);
    this.name = 'RecorderApiError';
  }

  get retryAfterMs(): number | null {
    return this.extra.retryAfterMs ?? null;
  }

  get missing(): number[] {
    return this.extra.missing ?? [];
  }
}

export function isRecorderApiError(error: unknown): error is RecorderApiError {
  return error instanceof RecorderApiError;
}

const CODE_KINDS: Record<string, RecorderErrorKind> = {
  stale_token: 'stale-token',
  not_capturing: 'not-capturing',
  still_capturing: 'still-capturing',
  segment_gap: 'segment-gap',
  segment_not_found: 'segment-not-found',
  segment_closed: 'segment-closed',
  parts_missing: 'parts-missing',
  empty_part: 'client-bug',
  invalid_request: 'client-bug',
  part_too_large: 'client-bug',
  recording_too_large: 'recording-too-large',
  already_finalizing: 'already-finalizing',
  nothing_captured: 'nothing-captured',
  cannot_discard: 'cannot-discard',
  has_audio: 'has-audio',
  past_capture: 'past-capture',
};

/** Legacy message → kind, for any response that predates `code`. */
const MESSAGE_KINDS: Record<string, RecorderErrorKind> = {
  'Recording was taken over in another tab': 'stale-token',
  'Recording is not capturing': 'not-capturing',
  'Segment index out of order': 'segment-gap',
  'Segment not found': 'segment-not-found',
  'Segment is closed': 'segment-closed',
  'Parts missing from segment': 'parts-missing',
};

type ErrorBody = {
  error?: string;
  code?: string;
  missing?: number[];
  lastHeartbeatAt?: string;
} | null;

export function classifyRecorderError(
  status: number | null,
  body: ErrorBody,
  retryAfter: string | null,
  now: number = Date.now()
): RecorderApiError {
  if (status === null) {
    return new RecorderApiError('network', 'Network error', null);
  }
  const message = body?.error || `Request failed (${status})`;
  const extra = {
    retryAfterMs: retryAfterMs(retryAfter, now),
    missing: Array.isArray(body?.missing) ? body!.missing : undefined,
    lastHeartbeatAt: body?.lastHeartbeatAt,
    code: body?.code,
  };

  if (status === 401) return new RecorderApiError('auth', message, status, extra);
  if (status === 429) return new RecorderApiError('rate-limited', message, status, extra);
  if (status >= 500) return new RecorderApiError('retryable', message, status, extra);

  const byCode = body?.code ? CODE_KINDS[body.code] : undefined;
  if (byCode) return new RecorderApiError(byCode, message, status, extra);
  const byMessage = body?.error ? MESSAGE_KINDS[body.error] : undefined;
  if (byMessage) return new RecorderApiError(byMessage, message, status, extra);
  if (status === 404) return new RecorderApiError('not-found', message, status, extra);
  if (status === 413) return new RecorderApiError('client-bug', message, status, extra);
  return new RecorderApiError('client-bug', message, status, extra);
}

/** What the upload queue and heartbeat depend on (fake in tests). */
export interface RecorderTransport {
  openSegment(recordingId: string, token: string, index: number): Promise<void>;
  putPart(
    recordingId: string,
    token: string,
    segmentIndex: number,
    partIndex: number,
    body: Blob
  ): Promise<number>;
  closeSegment(
    recordingId: string,
    token: string,
    segmentIndex: number,
    partCount: number
  ): Promise<void>;
  heartbeat(recordingId: string, token: string, state: 'recording' | 'paused'): Promise<void>;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

async function readJson(res: Response): Promise<ErrorBody> {
  try {
    return (await res.json()) as ErrorBody;
  } catch {
    return null;
  }
}

export interface RecorderApi {
  transport: RecorderTransport;
  createDraftSession(input: {
    title: string;
    campaignId: string;
    sessionDate: string;
  }): Promise<{ id: string }>;
  startOrTakeover(
    sessionId: string,
    mimeType: string,
    opts?: { force?: boolean }
  ): Promise<StartRecordingResponse>;
  getRecording(recordingId: string): Promise<RecordingState>;
  finalizeRecording(
    recordingId: string,
    opts?: { token?: string | null; force?: boolean }
  ): Promise<{ status: 'finalizing'; jobId: string }>;
  discardRecording(recordingId: string, opts?: { token?: string | null; force?: boolean }): Promise<void>;
  getSessionRecording(sessionId: string): Promise<{
    uploadId: string | null;
    recording: RecordingSummary | null;
    title: string;
    campaignId: string;
  }>;
  getSessionProgress(sessionId: string): Promise<{
    status: string;
    job: { type?: string; status: string; attempts: number; maxAttempts: number } | null;
  }>;
}

/**
 * Build the API client. `fetchImpl` defaults to a lazy wrapper around the
 * global fetch (never touched at import time — pages are SSR-prerendered).
 */
export function createRecorderApi(
  fetchImpl: FetchLike = (input, init) => fetch(input, init)
): RecorderApi {
  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    let res: Response;
    try {
      res = await fetchImpl(path, { credentials: 'same-origin', ...init });
    } catch {
      throw classifyRecorderError(null, null, null);
    }
    if (!res.ok) {
      throw classifyRecorderError(res.status, await readJson(res), res.headers.get('retry-after'));
    }
    return (await readJson(res)) as T;
  }

  function json(method: string, body: unknown, headers: Record<string, string> = {}): RequestInit {
    return {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    };
  }

  const tokenHeader = (token: string | null | undefined): Record<string, string> =>
    token ? { 'x-recorder-token': token } : {};

  const transport: RecorderTransport = {
    async openSegment(recordingId, token, index) {
      await call(`/api/recordings/${recordingId}/segments`, json('POST', { index }, tokenHeader(token)));
    },
    async putPart(recordingId, token, segmentIndex, partIndex, body) {
      const res = await call<{ received: number }>(
        `/api/recordings/${recordingId}/segments/${segmentIndex}/parts/${partIndex}`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/octet-stream', ...tokenHeader(token) },
          body,
        }
      );
      return res.received;
    },
    async closeSegment(recordingId, token, segmentIndex, partCount) {
      await call(
        `/api/recordings/${recordingId}/segments/${segmentIndex}/close`,
        json('POST', { partCount }, tokenHeader(token))
      );
    },
    async heartbeat(recordingId, token, state) {
      await call(`/api/recordings/${recordingId}/heartbeat`, json('PUT', { state }, tokenHeader(token)));
    },
  };

  return {
    transport,

    async createDraftSession({ title, campaignId, sessionDate }) {
      const session = await call<{ id: string }>(
        '/api/sessions',
        json('POST', { title, campaign_id: campaignId, session_date: sessionDate })
      );
      return { id: session.id };
    },

    startOrTakeover(sessionId, mimeType, opts = {}) {
      return call<StartRecordingResponse>(
        `/api/sessions/${sessionId}/recording`,
        json('POST', { mimeType, ...(opts.force ? { force: true } : {}) })
      );
    },

    async getRecording(recordingId) {
      const res = await call<{ recording: RecordingState }>(`/api/recordings/${recordingId}`);
      return res.recording;
    },

    finalizeRecording(recordingId, opts = {}) {
      return call<{ status: 'finalizing'; jobId: string }>(
        `/api/recordings/${recordingId}/finalize`,
        json('POST', opts.force ? { force: true } : {}, tokenHeader(opts.token))
      );
    },

    async discardRecording(recordingId, opts = {}) {
      await call(`/api/recordings/${recordingId}${opts.force ? '?force=1' : ''}`, {
        method: 'DELETE',
        headers: tokenHeader(opts.token),
      });
    },

    async getSessionRecording(sessionId) {
      const s = await call<{
        uploadId: string | null;
        recording: RecordingSummary | null;
        title: string;
        campaignId: string;
      }>(`/api/sessions/${sessionId}`);
      return {
        uploadId: s.uploadId,
        recording: s.recording ?? null,
        title: s.title,
        campaignId: s.campaignId,
      };
    },

    getSessionProgress(sessionId) {
      return call(`/api/sessions/${sessionId}/progress`);
    },
  };
}
