# src/app/api/

Backend API routes using Next.js App Router conventions. Each `route.ts` file exports HTTP method handlers (`GET`, `POST`, `PUT`, `DELETE`).

## Authentication

All API routes (except `/api/auth` and `/api/health`) are protected by:
1. **Middleware** (`middleware.ts` at project root) - requires valid JWT token
2. **Route-level auth** - most routes call `requireAuth()` or `requireAuthWithRateLimit()` from `@/lib/auth-utils`

### Ownership helpers (`@/lib/route-utils`)
Any route addressing a session or campaign by id MUST confirm the caller owns
it — middleware proves *who* you are, not *what* you may touch. Use:
- `requireSessionOwner(sessionId)` → `{ error, user, session }` (auth + 404-on-not-owned)
- `requireCampaignOwner(campaignId)` → `{ error, user, campaign }`
- `enforceRateLimit(request, userId, limiter)` → 429 response or null; gate the
  cost-driving AI endpoints (`aiTranscriptionRateLimiter`, `aiSummaryRateLimiter`)
- `zodErrorResponse(error)` → 400 for `ZodError`, else null

Non-ownership is masked as **404** (never 403) so resource existence doesn't leak.

## Endpoints

### Auth (`auth/`)
- `[...nextauth]/route.ts` - NextAuth dynamic route handler (login, logout, session, callbacks)
- `register/route.ts` - `POST` user registration (email/password with bcryptjs hashing). **Anti-enumeration contract:** always returns 201 + `{ message }` whether or not the email exists (no `{ user }`, no "already exists"), and hashes the password even on the existing-email path so timing doesn't leak. The signup page auto-signs-in afterward, which surfaces wrong-password naturally.

### Campaigns (`campaigns/`)
- `route.ts` - `GET` list user's campaigns, `POST` create campaign
- `[id]/route.ts` - `GET` single campaign, `PUT` update, `DELETE` delete

### Sessions (`sessions/`)
- `route.ts` - `GET` list sessions (filterable by `campaignId`), `POST` create session
- `create-with-upload/route.ts` - `POST` create session and link upload in one call
- `[id]/route.ts` - `GET` session with includes, `DELETE` delete
- `[id]/process/route.ts` - `POST` **orchestrator** that triggers the transcription->summary pipeline
- `[id]/progress/route.ts` - `GET` processing progress (polled by frontend). Hot path: uses a lightweight ownership check (`db.getSessionProgress` — no transcript include), NOT `requireSessionOwner`. Keep heavy includes out of this route.
- `[id]/transcriptions/route.ts` - `GET` transcription segments for a session
- `[id]/upload/route.ts` - `POST` link an upload to a session

### Transcription (`transcription/`)
- `[sessionId]/route.ts` - `POST` run Whisper transcription, `GET` retrieve, `DELETE` remove

### Summary (`summary/`)
- `[sessionId]/route.ts` - `POST` generate GPT-4o summary, `GET` retrieve, `PUT` edit

### DM TODO (`dm-todo/`)
- `[sessionId]/route.ts` - `POST` generate DM TODO list, `GET` retrieve, `PUT` edit

### Uploads (`uploads/`)
- `route.ts` - `POST` upload audio file (persists via `src/services/storage.ts` — Tigris or local), `GET` list uploads
- `[id]/route.ts` - `GET` upload details, `DELETE` remove upload (+ stored object)
- `[id]/audio/route.ts` - `GET` playback: 307 to presigned Tigris URL, or Range-aware local streaming

### User (`user/`)
- `accounts/route.ts` - `GET` linked OAuth accounts

### Billing (`billing/`)
- `checkout/route.ts` - `POST` create a Stripe Checkout Session (subscription mode, Managed Payments); returns `{ url }` to redirect to. Sensitive-action rate limited.
- `subscription/route.ts` - `GET` the user's subscription status from the `subscriptions` mirror table
- `webhook/route.ts` - `POST` Stripe webhook (PUBLIC in middleware — authenticated by signature verification against `STRIPE_WEBHOOK_SECRET`, never by session). Handles `checkout.session.completed` + `customer.subscription.updated/deleted`; returns 500 on handler failure so Stripe retries (handlers are idempotent upserts). All Stripe logic lives in `src/services/billing.ts`. Endpoints 503 when `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` are unset.

### Utility
- `health/route.ts` - `GET` health check (public, no auth). Never echo raw DB/driver error messages in its response — log them instead.
- `test/cleanup-user/route.ts` - `DELETE` test cleanup utility. Fails closed: in production-mode envs it requires `ALLOW_TEST_CLEANUP` to be EXACTLY `'true'` (staging runs `NODE_ENV=production`, so staging must set it; production never should). Key compared with `crypto.timingSafeEqual`.

## Processing Pipeline

The process endpoint (`sessions/[id]/process`) enqueues a durable job; the
work itself runs in the pipeline worker, never inside an HTTP request:

```
POST /api/sessions/[id]/process
  |
  ├─ Check auth & ownership + test-account cost protection
  ├─ Already fully completed → return early
  ├─ Verify upload exists (unless transcription already done)
  └─ enqueueProcessSession() → pipeline_jobs row (idempotent), return jobId

Pipeline worker (src/services/pipeline/worker.ts, all machines):
  claim job (SKIP LOCKED) → transcribe (per-chunk checkpoints)
                          → summarize → dm_todo → session 'completed'
  Crash recovery: heartbeat lease + reaper requeue; retries w/ backoff.
```

`create-with-upload` also enqueues after a successful upload. The summary and
dm-todo POST endpoints run synchronously via the shared step services and
accept `{ "force": true }` to regenerate existing content.

Frontend polls `GET /api/sessions/[id]/progress` for real-time updates
(response includes the active job's status/attempts/lastError).

## Response Conventions

- Success: `200` with JSON body
- Created: `200` (not 201) with created object
- Validation error: `400` with `{ error: string }` or Zod error details
- Unauthorized: `401` with `{ error: 'Unauthorized' }`
- Not found: `404` with `{ error: '... not found' }`
- Rate limited: `429` with `Retry-After` header
- Server error: `500` with `{ error: string }`

## AI API Call Protection

Test accounts (`@test.com`, `@example.com`) are blocked from making real AI API calls (transcription, summary, DM TODO). This prevents cost from test automation.

All AI calls route through `src/lib/ai.ts` (`transcribeAudio`, `generateAiText`). When `MOCK_AI_SERVICES=true`, those calls return deterministic fixtures and the test-account block is bypassed (no spend to protect against) — this lets PR-stage integration tests exercise the full pipeline. **If you add a new AI route, replicate the `if (isTestAccount(email) && !isAiMocked())` guard.**

Cost-driving AI POSTs (`process`, `transcription`, `summary`, `dm-todo`) are rate-limited via `enforceRateLimit()` with the AI-specific limiters. `campaign.systemPrompt` is capped server-side (`.max(2000)`) because it's injected verbatim into every GPT call.
