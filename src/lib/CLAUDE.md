# src/lib/

Utility modules and shared configuration. These are imported throughout the application.

## Modules

### `auth.ts` — NextAuth Configuration
Exports `authOptions: NextAuthOptions`, the central auth config:
- **Providers:** Credentials (email/password with bcryptjs) and Google OAuth (optional, enabled via env vars)
- **Session strategy:** JWT (not database sessions)
- **Adapter:** PrismaAdapter for user/account persistence
- **Custom pages:** `/auth/signin`, `/auth/error`
- **Callbacks:**
  - `signIn` — whitelist enforcement, Google account linking logic
  - `jwt` — populates `token.id` with user ID
  - `session` — copies `token.id` to `session.user.id`
- **Events:** logs sign-in, sign-out, user creation, account linking
- Google OAuth supports `allowDangerousEmailAccountLinking` so existing email/password users can link Google

### `auth-utils.ts` — Auth Middleware Helpers
Provides route-level auth functions that return `{ user, error }`:
- `requireAuth()` — validates NextAuth session, returns user or 401 response
- `requireAuthWithRateLimit()` — auth + API rate limiting
- `requireAuthForSensitiveAction()` — auth + stricter rate limits
All return `NextResponse` errors directly for early-return patterns in API routes.

### `prisma.ts` — Prisma Client Singleton
Exports a singleton `prisma` client. Uses `globalThis` to prevent multiple instances during HMR in development. Only disconnects gracefully in production.

### `logger.ts` — Structured Logging
Pino-based structured JSON logger. Exports `logger` singleton and `Logger` class.
- Log levels: trace, debug, info, warn, error
- Context object with optional: `userId`, `sessionId`, `uploadId`, `campaignId`, `traceId`
- API-specific helpers: `apiRequest()`, `apiError()`, `apiSuccess()`
- `getUserContext()` helper extracts auth session for logging
- Log level defaults based on `NODE_ENV` (debug in dev, info in production)

### `rate-limiter.ts` — Request Rate Limiting
In-memory sliding window rate limiter. Exports multiple limiter instances:
- `apiRateLimiter` — general API (100 req/min prod, 1000 dev)
- `authRateLimiter` — auth endpoints (10 req/min prod, 100 dev)
- `uploadRateLimiter` — file uploads
- `aiTranscriptionRateLimiter` — transcription API calls
- `aiSummaryRateLimiter` — summary API calls
- `getRateLimitIdentifier()` — extracts user ID or IP for rate key
Auto-cleans expired entries every 5 minutes. Returns remaining count and reset time.

### `whitelist.ts` — Staging Access Control
Controls who can access the staging environment:
- `isWhitelistEnabled()` — true if `STAGING_WHITELIST` env var is set
- `isEmailWhitelisted(email)` — checks against comma-separated whitelist
- `validateWhitelistAccess(email)` — returns `{ allowed, message }`
- `isTestAccount(email)` — identifies `@test.com`, `@example.com`, and test patterns
- Test accounts are blocked from making AI API calls (cost protection)

### `utils.ts` — General Utilities
- `cn(...inputs)` — merges Tailwind CSS classes using `clsx` + `tailwind-merge`
- `CI_OPTIMIZED` — boolean flag for CI environment detection
