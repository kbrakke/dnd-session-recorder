import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { apiRateLimiter, authRateLimiter, getRateLimitIdentifier } from '@/lib/rate-limiter';

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