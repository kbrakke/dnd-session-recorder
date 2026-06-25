# src/lib/

Utility modules and shared configuration. These are imported throughout the application.

## Modules

### `ai.ts` — AI Service Wrapper
Centralized access to OpenAI-backed services. The only place `@ai-sdk/openai` / `ai` are imported — add new AI calls here, never inline in routes.
- `transcribeAudio(buffer)` — Whisper transcription, returns `{ text }`
- `generateAiText(prompt, kind)` — text generation; `kind` is `'summary' | 'dm-todo'` and selects the model via `TEXT_MODEL`: summary → `gpt-4o`, dm-todo → `gpt-4o-mini` (the todo re-sends the full transcript, so the mini model cuts that call's cost ~90%)
- `isAiMocked()` — true when `MOCK_AI_SERVICES === 'true'` (exact string)
- When mocked, every call returns a deterministic fixture (no OpenAI request, no API key needed). Used by PR-stage integration tests; the test-account cost-protection block in AI routes is bypassed when mocked (see `src/app/api/CLAUDE.md`).

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
IP keying trusts `Fly-Client-IP` (unforgeable behind Fly's proxy), then the **rightmost** `x-forwarded-for` entry — never the leftmost, which is client-supplied and spoofable.

### `whitelist.ts` — Staging Access Control
Controls who can access the staging environment:
- `isWhitelistEnabled()` — true if `STAGING_WHITELIST` env var is set
- `isEmailWhitelisted(email)` — checks against comma-separated whitelist
- `validateWhitelistAccess(email)` — returns `{ allowed, message }`
- `isTestAccount(email)` — identifies `@test.com`, `@example.com`, and test patterns
- Test accounts are blocked from making AI API calls (cost protection)

### `session-status.ts` — Session Status Vocabulary
The single source of truth for UI status handling. The backend writes exactly: `draft, uploaded, transcribing, transcribed, summarizing, completed, error`.
- `IN_FLIGHT_STATUSES` / `isInFlight(status)` — the four queued/working statuses
- `statusLabel(status)` — display labels (e.g. `uploaded` → "Queued")
Never hand-roll status switch statements in components — earlier copies invented statuses (`'processing'`, `'pending'`) the backend never writes.

### `formatting.ts` — Shared Formatters
- `formatDate(s, 'short'|'long')`, `formatDurationSeconds`, `formatDurationMinutes`
- Consolidates formatters that were copy-pasted with subtly different units. Note: `session-header` treats `duration` as minutes (pre-existing behavior, deliberately preserved).

### `utils.ts` — General Utilities
- `cn(...inputs)` — merges Tailwind CSS classes using `clsx` + `tailwind-merge`
- `CI_OPTIMIZED` — boolean flag for CI environment detection
