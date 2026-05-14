import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { apiRateLimiter, authRateLimiter, getRateLimitIdentifier } from '@/lib/rate-limiter';

/**
 * Require authentication for an API route.
 *
 * This is the standard authentication pattern used across all protected API routes.
 * Returns either an error response (401 Unauthorized) or the authenticated user.
 *
 * @returns Object with either `error` (NextResponse) or `user` (authenticated user details)
 *
 * @example Basic usage in a GET handler
 * ```typescript
 * export async function GET(req: Request) {
 *   const { error: authError, user } = await requireAuth();
 *   if (authError) return authError;
 *
 *   // user.id, user.email, user.name available
 *   const data = await db.getUserData(user.id);
 *   return NextResponse.json(data);
 * }
 * ```
 *
 * @example Usage with resource ownership check
 * ```typescript
 * export async function DELETE(req: Request, { params }: { params: { id: string } }) {
 *   const { error: authError, user } = await requireAuth();
 *   if (authError) return authError;
 *
 *   const resource = await db.getResource(params.id);
 *   if (resource.userId !== user.id) {
 *     return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
 *   }
 *
 *   await db.deleteResource(params.id);
 *   return NextResponse.json({ message: 'Deleted' });
 * }
 * ```
 *
 * @example Multiple handlers in one file
 * ```typescript
 * export async function GET(req: Request) {
 *   const { error, user } = await requireAuth();
 *   if (error) return error;
 *   // ... GET logic
 * }
 *
 * export async function POST(req: Request) {
 *   const { error, user } = await requireAuth();
 *   if (error) return error;
 *   // ... POST logic
 * }
 * ```
 *
 * @remarks
 * - **Always use this at the top of protected route handlers**
 * - **Do NOT use direct `getServerSession()` calls** - use this wrapper instead
 * - Error response is consistent: `{ error: 'Authentication required' }` with status 401
 * - Middleware also protects `/api/*` routes, but routes should still call this for user context
 *
 * @see requireAuthWithRateLimit - Use for rate-limited endpoints
 * @see requireAuthForSensitiveAction - Use for auth/sensitive operations
 */
export async function requireAuth() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.id) {
    return {
      error: NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      ),
      user: null,
    };
  }

  return {
    error: null,
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    },
  };
}

/**
 * Require authentication with API rate limiting.
 *
 * Combines authentication with rate limiting for general API endpoints.
 * Use this for endpoints that need protection from API abuse.
 *
 * @param request - The Next.js Request object (used for rate limit identifier)
 * @returns Object with `error`, `user`, and `rateLimit` information
 *
 * @example
 * ```typescript
 * export async function POST(request: Request) {
 *   const { error, user, rateLimit } = await requireAuthWithRateLimit(request);
 *   if (error) return error;
 *
 *   // Process request with rate limit info available
 *   const data = await processData(user.id);
 *   return NextResponse.json(data);
 * }
 * ```
 *
 * @remarks
 * - Rate limit: 100 requests per 15 minutes (default)
 * - Returns 429 Too Many Requests when limit exceeded
 * - Includes `X-RateLimit-*` headers in response
 */
export async function requireAuthWithRateLimit(request: Request) {
  const authResult = await requireAuth();
  if (authResult.error) {
    return authResult;
  }

  // Apply rate limiting
  const identifier = getRateLimitIdentifier(request, authResult.user.id);
  const rateLimitResult = apiRateLimiter.isRateLimited(identifier);

  if (rateLimitResult.limited) {
    const resetTime = new Date(rateLimitResult.resetTime).toISOString();
    return {
      error: NextResponse.json(
        { 
          error: 'Too many requests',
          resetTime,
          limit: rateLimitResult.limit 
        },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': rateLimitResult.limit.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': rateLimitResult.resetTime.toString(),
            'Retry-After': Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000).toString()
          }
        }
      ),
      user: null,
    };
  }

  return {
    error: null,
    user: authResult.user,
    rateLimit: rateLimitResult
  };
}

/**
 * Require authentication with stricter rate limiting for sensitive actions.
 *
 * Use this for authentication endpoints, password changes, uploads, or other
 * sensitive operations that need stronger rate limiting protection.
 *
 * @param request - The Next.js Request object (used for rate limit identifier)
 * @returns Object with `error`, `user`, and `rateLimit` information
 *
 * @example Password change endpoint
 * ```typescript
 * export async function POST(request: Request) {
 *   const { error, user } = await requireAuthForSensitiveAction(request);
 *   if (error) return error;
 *
 *   const body = await request.json();
 *   await updatePassword(user.id, body.newPassword);
 *   return NextResponse.json({ message: 'Password updated' });
 * }
 * ```
 *
 * @remarks
 * - Rate limit: 10 requests per 15 minutes (stricter than general API)
 * - Returns 429 Too Many Authentication Attempts when limit exceeded
 * - Includes `X-RateLimit-*` headers in response
 */
export async function requireAuthForSensitiveAction(request: Request) {
  const authResult = await requireAuth();
  if (authResult.error) {
    return authResult;
  }

  // Apply stricter rate limiting for sensitive actions (auth, uploads, etc.)
  const identifier = getRateLimitIdentifier(request, authResult.user.id);
  const rateLimitResult = authRateLimiter.isRateLimited(identifier);

  if (rateLimitResult.limited) {
    const resetTime = new Date(rateLimitResult.resetTime).toISOString();
    return {
      error: NextResponse.json(
        { 
          error: 'Too many authentication attempts',
          resetTime,
          limit: rateLimitResult.limit 
        },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': rateLimitResult.limit.toString(),
            'X-RateLimit-Remaining': '0', 
            'X-RateLimit-Reset': rateLimitResult.resetTime.toString(),
            'Retry-After': Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000).toString()
          }
        }
      ),
      user: null,
    };
  }

  return {
    error: null,
    user: authResult.user,
    rateLimit: rateLimitResult
  };
}