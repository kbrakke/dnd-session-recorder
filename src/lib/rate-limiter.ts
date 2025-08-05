interface RateLimitData {
  count: number;
  resetTime: number;
}

class RateLimiter {
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
export const apiRateLimiter = new RateLimiter(60000, 100); // 100 requests per minute
export const authRateLimiter = new RateLimiter(900000, 5); // 5 auth attempts per 15 minutes
export const uploadRateLimiter = new RateLimiter(3600000, 10); // 10 uploads per hour

export function getRateLimitIdentifier(request: Request, userId?: string): string {
  // Use user ID if available, otherwise fall back to IP
  if (userId) {
    return `user:${userId}`;
  }

  // Extract IP from headers (works with most reverse proxies)
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const ip = forwarded?.split(',')[0] || realIp || 'unknown';
  
  return `ip:${ip}`;
}