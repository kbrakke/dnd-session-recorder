interface RateLimitData {
  count: number;
  resetTime: number;
}

export class RateLimiter {
  private store: Map<string, RateLimitData> = new Map();
  private windowMs: number;
  private maxRequests: number;

  constructor(windowMs = 60000, maxRequests = 100) { // 100 requests per minute by default
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    
    // Clean up expired entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  isRateLimited(identifier: string): { 
    limited: boolean; 
    remaining: number; 
    resetTime: number; 
    limit: number;
  } {
    const now = Date.now();
    const key = identifier;
    
    let data = this.store.get(key);
    
    if (!data || now >= data.resetTime) {
      // Create new window
      data = {
        count: 1,
        resetTime: now + this.windowMs
      };
      this.store.set(key, data);
      
      return {
        limited: false,
        remaining: this.maxRequests - 1,
        resetTime: data.resetTime,
        limit: this.maxRequests
      };
    }
    
    data.count++;
    
    if (data.count > this.maxRequests) {
      return {
        limited: true,
        remaining: 0,
        resetTime: data.resetTime,
        limit: this.maxRequests
      };
    }
    
    return {
      limited: false,
      remaining: this.maxRequests - data.count,
      resetTime: data.resetTime,
      limit: this.maxRequests
    };
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, data] of this.store.entries()) {
      if (now >= data.resetTime) {
        this.store.delete(key);
      }
    }
  }
}

// Different rate limiters for different types of requests
// In development/test, use much more lenient limits
const isDevelopment = process.env.NODE_ENV === 'development' || process.env.CI === 'true';

export const apiRateLimiter = new RateLimiter(60000, isDevelopment ? 1000 : 100); // 1000 requests per minute in dev, 100 in prod
export const authRateLimiter = new RateLimiter(60000, isDevelopment ? 100 : 10); // 100 auth attempts per minute in dev, 10 per minute in prod  
export const uploadRateLimiter = new RateLimiter(3600000, isDevelopment ? 100 : 10); // 100 uploads per hour in dev, 10 in prod

// AI-specific rate limiters (more restrictive due to cost)
export const aiTranscriptionRateLimiter = new RateLimiter(3600000, isDevelopment ? 50 : 10); // 50 transcriptions per hour in dev, 10 in prod
export const aiSummaryRateLimiter = new RateLimiter(3600000, isDevelopment ? 50 : 20); // 50 summaries per hour in dev, 20 in prod

export function getRateLimitIdentifier(request: Request, userId?: string): string {
  // Use user ID if available, otherwise fall back to IP
  if (userId) {
    return `user:${userId}`;
  }

  // Fly's proxy sets Fly-Client-IP and clients cannot forge it. X-Forwarded-For
  // is client-influenced: only the RIGHTMOST entry was appended by the trusted
  // proxy; anything left of it is attacker-supplied and must not key the limit.
  const flyClientIp = request.headers.get('fly-client-ip');
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const ip =
    flyClientIp ||
    forwarded?.split(',').at(-1)?.trim() ||
    realIp ||
    'unknown';

  return `ip:${ip}`;
}