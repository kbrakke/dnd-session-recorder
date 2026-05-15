import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getServerSession } from 'next-auth/next';

vi.mock('next-auth/next', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

vi.mock('@/lib/rate-limiter', () => ({
  apiRateLimiter: { isRateLimited: vi.fn() },
  authRateLimiter: { isRateLimited: vi.fn() },
  getRateLimitIdentifier: vi.fn((_req: Request, userId?: string) => `user:${userId ?? 'anon'}`),
}));

import { requireAuth, requireAuthWithRateLimit, requireAuthForSensitiveAction } from '@/lib/auth-utils';
import { apiRateLimiter, authRateLimiter } from '@/lib/rate-limiter';

const mockedGetServerSession = vi.mocked(getServerSession);
const mockedApi = vi.mocked(apiRateLimiter.isRateLimited);
const mockedAuth = vi.mocked(authRateLimiter.isRateLimited);

function newRequest() {
  return new Request('http://localhost:3000/api/test');
}

describe('requireAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when no session exists', async () => {
    mockedGetServerSession.mockResolvedValue(null);

    const { error, user } = await requireAuth();

    expect(user).toBeNull();
    expect(error).not.toBeNull();
    expect(error!.status).toBe(401);
    await expect(error!.json()).resolves.toEqual({ error: 'Authentication required' });
  });

  it('returns 401 when session has no user id', async () => {
    mockedGetServerSession.mockResolvedValue({
      user: { email: 'a@b.com', name: 'A' },
      expires: new Date(Date.now() + 60_000).toISOString(),
    } as never);

    const { error, user } = await requireAuth();

    expect(user).toBeNull();
    expect(error!.status).toBe(401);
  });

  it('returns the user when session is valid', async () => {
    mockedGetServerSession.mockResolvedValue({
      user: { id: 'u1', email: 'a@b.com', name: 'A' },
      expires: new Date(Date.now() + 60_000).toISOString(),
    } as never);

    const { error, user } = await requireAuth();

    expect(error).toBeNull();
    expect(user).toEqual({ id: 'u1', email: 'a@b.com', name: 'A' });
  });
});

describe('requireAuthWithRateLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('propagates the auth error when not authenticated', async () => {
    mockedGetServerSession.mockResolvedValue(null);

    const { error, user } = await requireAuthWithRateLimit(newRequest());

    expect(user).toBeNull();
    expect(error!.status).toBe(401);
    expect(mockedApi).not.toHaveBeenCalled();
  });

  it('returns 429 with rate-limit headers when over limit', async () => {
    mockedGetServerSession.mockResolvedValue({
      user: { id: 'u1', email: 'a@b.com', name: 'A' },
      expires: new Date(Date.now() + 60_000).toISOString(),
    } as never);
    const resetTime = Date.now() + 30_000;
    mockedApi.mockReturnValue({ limited: true, remaining: 0, resetTime, limit: 100 });

    const { error, user } = await requireAuthWithRateLimit(newRequest());

    expect(user).toBeNull();
    expect(error!.status).toBe(429);
    expect(error!.headers.get('X-RateLimit-Limit')).toBe('100');
    expect(error!.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(Number(error!.headers.get('Retry-After'))).toBeGreaterThan(0);

    const body = await error!.json();
    expect(body.error).toBe('Too many requests');
    expect(body.limit).toBe(100);
    expect(body.resetTime).toBe(new Date(resetTime).toISOString());
  });

  it('returns the user and rate-limit info when allowed', async () => {
    mockedGetServerSession.mockResolvedValue({
      user: { id: 'u1', email: 'a@b.com', name: 'A' },
      expires: new Date(Date.now() + 60_000).toISOString(),
    } as never);
    const limitInfo = { limited: false, remaining: 99, resetTime: Date.now() + 60_000, limit: 100 };
    mockedApi.mockReturnValue(limitInfo);

    const result = await requireAuthWithRateLimit(newRequest());

    if (result.error !== null) throw new Error('expected success result');
    expect(result.user).toEqual({ id: 'u1', email: 'a@b.com', name: 'A' });
    expect(result.rateLimit).toEqual(limitInfo);
  });
});

describe('requireAuthForSensitiveAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the stricter authRateLimiter (not apiRateLimiter)', async () => {
    mockedGetServerSession.mockResolvedValue({
      user: { id: 'u1', email: 'a@b.com', name: 'A' },
      expires: new Date(Date.now() + 60_000).toISOString(),
    } as never);
    mockedAuth.mockReturnValue({ limited: false, remaining: 9, resetTime: Date.now() + 60_000, limit: 10 });

    const result = await requireAuthForSensitiveAction(newRequest());

    expect(result.error).toBeNull();
    expect(mockedAuth).toHaveBeenCalledOnce();
    expect(mockedApi).not.toHaveBeenCalled();
  });

  it('returns 429 with the sensitive-action error message when rate limited', async () => {
    mockedGetServerSession.mockResolvedValue({
      user: { id: 'u1', email: 'a@b.com', name: 'A' },
      expires: new Date(Date.now() + 60_000).toISOString(),
    } as never);
    mockedAuth.mockReturnValue({ limited: true, remaining: 0, resetTime: Date.now() + 30_000, limit: 10 });

    const { error } = await requireAuthForSensitiveAction(newRequest());

    expect(error!.status).toBe(429);
    const body = await error!.json();
    expect(body.error).toBe('Too many authentication attempts');
    expect(body.limit).toBe(10);
  });
});
