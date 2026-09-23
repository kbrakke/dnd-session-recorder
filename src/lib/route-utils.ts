import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Campaign, Recording } from '@prisma/client';
import { requireAuth } from '@/lib/auth-utils';
import { db } from '@/services/database';
import { SessionWithIncludes } from '@/services/database';
import { CaptureRejectedError, getOwnedRecording } from '@/services/recording';
import { RateLimiter, getRateLimitIdentifier } from '@/lib/rate-limiter';

type AuthedUser = { id: string; email?: string | null; name?: string | null };

/**
 * Authenticate and confirm the user owns the session. Returns the loaded
 * session on success, or a ready-to-return 404 (used for both "missing" and
 * "not yours" so resource existence never leaks across accounts).
 */
export async function requireSessionOwner(
  sessionId: string
): Promise<
  | { error: NextResponse; user: null; session: null }
  | { error: null; user: AuthedUser; session: SessionWithIncludes }
> {
  const { error, user } = await requireAuth();
  if (error) return { error, user: null, session: null };

  const session = await db.getSessionById(sessionId);
  if (!session || session.userId !== user.id) {
    return { error: notFound('Session not found'), user: null, session: null };
  }
  return { error: null, user, session };
}

/** Authenticate and confirm the user owns the campaign. */
export async function requireCampaignOwner(
  campaignId: string
): Promise<
  | { error: NextResponse; user: null; campaign: null }
  | { error: null; user: AuthedUser; campaign: Campaign }
> {
  const { error, user } = await requireAuth();
  if (error) return { error, user: null, campaign: null };

  const campaign = await db.getCampaignById(campaignId);
  if (!campaign || campaign.userId !== user.id) {
    return { error: notFound('Campaign not found'), user: null, campaign: null };
  }
  return { error: null, user, campaign };
}

/** Authenticate and confirm the user owns the live recording (404-masked). */
export async function requireRecordingOwner(
  recordingId: string
): Promise<
  | { error: NextResponse; user: null; recording: null }
  | { error: null; user: AuthedUser; recording: Recording }
> {
  const { error, user } = await requireAuth();
  if (error) return { error, user: null, recording: null };

  const recording = await getOwnedRecording(recordingId, user.id);
  if (!recording) {
    return { error: notFound('Recording not found'), user: null, recording: null };
  }
  return { error: null, user, recording };
}

/**
 * Stable machine-readable codes on every live-recording 4xx. The client
 * branches on `code`, never on the human `error` string (several distinct
 * failures share status 409).
 */
export type RecordingErrorCode =
  | 'stale_token'
  | 'not_capturing'
  | 'still_capturing'
  | 'segment_gap'
  | 'segment_not_found'
  | 'segment_closed'
  | 'parts_missing'
  | 'empty_part'
  | 'invalid_request'
  | 'part_too_large'
  | 'recording_too_large'
  | 'already_finalizing'
  | 'nothing_captured'
  | 'cannot_discard'
  | 'has_audio'
  | 'past_capture';

/** `{ error, code, ...extra }` with the given status. */
export function recordingError(
  status: number,
  code: RecordingErrorCode,
  message: string,
  extra: Record<string, unknown> = {}
): NextResponse {
  return NextResponse.json({ error: message, code, ...extra }, { status });
}

/** The caller's `x-recorder-token` header, or null. */
export function recorderTokenFrom(request: Request): string | null {
  return request.headers.get('x-recorder-token');
}

/**
 * Verify the caller holds the recording's current recorder token
 * (`x-recorder-token`). Start/takeover rotates the token, so a stale tab's
 * uploads and heartbeats fail here with 409 instead of corrupting the
 * ledger. Returns null when the token matches. This is only the fast path —
 * the service layer re-verifies inside each write's transaction.
 */
export function requireRecorderToken(
  request: Request,
  recording: Recording
): NextResponse | null {
  const token = recorderTokenFrom(request);
  if (!token || token !== recording.recorderToken) {
    return recordingError(409, 'stale_token', 'Recording was taken over in another tab');
  }
  return null;
}

/** 409 for a recording that has left the capture phase. */
export function notCapturing(): NextResponse {
  return recordingError(409, 'not_capturing', 'Recording is not capturing');
}

/** Map a service-layer CaptureRejectedError to its 409. */
export function captureRejected(error: CaptureRejectedError): NextResponse {
  return error.reason === 'stale_token'
    ? recordingError(409, 'stale_token', 'Recording was taken over in another tab')
    : notCapturing();
}

/**
 * Enforce a per-user rate limit. Returns a 429 response when the caller is
 * over the limit, otherwise null. Used to cap the cost-driving AI endpoints.
 */
export function enforceRateLimit(
  request: Request,
  userId: string,
  limiter: RateLimiter
): NextResponse | null {
  const result = limiter.isRateLimited(getRateLimitIdentifier(request, userId));
  if (!result.limited) return null;

  return NextResponse.json(
    { error: 'Too many requests', limit: result.limit },
    {
      status: 429,
      headers: {
        'X-RateLimit-Limit': result.limit.toString(),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': result.resetTime.toString(),
        'Retry-After': Math.ceil((result.resetTime - Date.now()) / 1000).toString(),
      },
    }
  );
}

/** Standard 404 used to mask both missing and unauthorized resources. */
export function notFound(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 404 });
}

/** Map a thrown Zod validation error to a 400; rethrow anything else. */
export function zodErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: 'Validation error', details: error.issues }, { status: 400 });
  }
  return null;
}

/** Recording-route variant of zodErrorResponse: adds code 'invalid_request'. */
export function recordingValidationError(error: unknown): NextResponse | null {
  if (error instanceof z.ZodError) {
    return recordingError(400, 'invalid_request', 'Validation error', { details: error.issues });
  }
  return null;
}
