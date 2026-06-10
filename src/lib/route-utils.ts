import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Campaign } from '@prisma/client';
import { requireAuth } from '@/lib/auth-utils';
import { db } from '@/services/database';
import { SessionWithIncludes } from '@/services/database';
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
