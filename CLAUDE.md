# D&D Session Recorder

AI-powered transcription and summarization tool for Dungeons & Dragons sessions. Users upload audio recordings of their game sessions, which are transcribed via OpenAI Whisper and summarized via GPT-4o.

> **Always read [LESSONS.md](LESSONS.md) at the start of any work in this repo.** It records gotcha moments (surprising failures worth never repeating), pending action items, and the user's explicit requests/preferences. Append there when something blows up unexpectedly or the user corrects your approach. Durable architecture, conventions, and "how this works here" knowledge belongs in the nearest directory `CLAUDE.md` instead — when a lesson hardens into a convention, promote it.

## Tech Stack

- **Framework:** Next.js 15 (App Router) with React 19 and TypeScript 5
- **Database:** PostgreSQL 16 with Prisma ORM 6
- **Auth:** NextAuth 4 (JWT sessions, Credentials + Google OAuth)
- **AI:** OpenAI Whisper (transcription), GPT-4o via Vercel AI SDK 5 (summaries, DM TODOs)
- **State:** TanStack React Query 5 for client-side data fetching
- **Styling:** Tailwind CSS 3
- **Media:** FFmpeg / fluent-ffmpeg for audio chunking
- **Logging:** Pino (structured JSON)
- **Hosting:** Fly.io (Docker, standalone Next.js output)

## Architecture Overview

```
src/
  app/           Next.js App Router (pages + API routes)
  components/    React components (layout, providers, ui, features)
  lib/           Utility modules (auth, logging, rate limiting, prisma)
  services/      Business logic (DatabaseService, FileCleanupService)
  types/         TypeScript type augmentations
prisma/          Schema, migrations
tests/           Playwright E2E and integration tests
scripts/         Database init, test server
docker/          Postgres init scripts
.github/         CI/CD workflows
```

## Core Data Flow

1. User creates a **Campaign** (container with optional AI system prompt)
2. User creates a **GamingSession** under a campaign
3. User uploads an **audio file** (Tigris object storage, or local `UPLOAD_DIR` in dev; metadata in `Upload` table)
4. User triggers **processing** via `/api/sessions/[id]/process`:
   - Audio is split into 24MB chunks (FFmpeg)
   - Each chunk is transcribed via Whisper API
   - Transcription segments saved to `Transcription` table
   - GPT-4o generates a narrative summary (saved to `Summary` table)
   - Optionally generates a DM TODO list (`DmTodoList` table)
5. Session status progresses: `draft -> uploaded -> transcribing -> transcribed -> summarizing -> completed`

## Key Commands

```bash
npm run dev          # Start dev server (spins up Postgres via docker-compose)
npm run dev:simple   # Start dev server without docker (expects DB running)
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Playwright CI tests
npm run test:staging # Playwright staging tests
npm run db:migrate   # Run Prisma migrations (dev)
npm run db:deploy    # Deploy migrations (production)
npm run db:studio    # Open Prisma Studio
npm run db:reset     # Tear down and rebuild database
```

## Environment Variables

See `.env.example` for all variables. Critical ones:

- `DATABASE_URL` - PostgreSQL connection string
- `NEXTAUTH_URL` - App URL for auth callbacks
- `NEXTAUTH_SECRET` - JWT signing secret (32+ chars)
- `OPENAI_API_KEY` - Required for transcription and summaries
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - Optional OAuth
- `UPLOAD_DIR` - Audio file storage path (local fallback, default: `./uploads`)
- `BUCKET_NAME` / `AWS_ENDPOINT_URL_S3` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` - Tigris object storage for audio (set by `fly storage create`); local disk used when unset
- `STAGING_WHITELIST` - Comma-separated emails for staging access control
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` - Stripe billing (use a restricted `rk_` key; billing endpoints 503 when unset)
- `STRIPE_PRICE_ID` - Optional pinned subscription price (else found/created by product metadata; see `scripts/stripe-setup.ts`)

## Authentication

### Overview
JWT-based sessions via NextAuth 4. Two auth providers: email/password (bcryptjs) and Google OAuth (optional). Staging has email whitelist support. Test accounts (`@test.com`, `@example.com`) are blocked from AI API calls to prevent cost.

### Defense in Depth Strategy
1. **Middleware** ([middleware.ts](middleware.ts)) - Protects all `/api/*` routes except `/api/auth` and `/api/health`. Fast rejection before route execution.
2. **Route-level auth** ([requireAuth()](src/lib/auth-utils.ts)) - Provides user context and enables fine-grained authorization checks.

### Standard Pattern: `requireAuth()`

**ALL protected API routes MUST use the `requireAuth()` utility** from `@/lib/auth-utils`. This ensures consistent auth handling across the application.

```typescript
import { requireAuth } from '@/lib/auth-utils';

export async function GET(req: Request) {
  const { error: authError, user } = await requireAuth();
  if (authError) return authError;

  // user.id, user.email, user.name are available
  const data = await db.getUserData(user.id);
  return NextResponse.json(data);
}
```

**Why this pattern:**
- ✅ Consistent error responses (always 401 with `{ error: 'Authentication required' }`)
- ✅ Easy to extend with permissions, rate limiting, audit logging
- ✅ Testable (mock once, works everywhere)
- ✅ Type-safe (TypeScript knows user shape)

**DO NOT use direct NextAuth imports:**
```typescript
// ❌ DON'T DO THIS:
const session = await getServerSession(authOptions);
if (!session?.user?.id) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

### Public Endpoints (No Auth Required)

These endpoints explicitly skip authentication:
- `/api/auth/*` - NextAuth session management (signin, signup, etc.)
- `/api/health` - Health check for monitoring
- `/api/billing/webhook` - Stripe webhook; authenticated by signature verification (`STRIPE_WEBHOOK_SECRET`), not by session
- Any future public APIs must be documented here and excluded in middleware

### Resource Ownership Pattern

After authentication, verify the user owns the requested resource:

```typescript
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const { error: authError, user } = await requireAuth();
  if (authError) return authError;

  const campaign = await db.getCampaignById(params.id);
  if (!campaign || campaign.userId !== user.id) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  }

  await db.deleteCampaign(params.id);
  return NextResponse.json({ message: 'Deleted' });
}
```

**Note:** Return 404 (not 403) when resource doesn't exist OR user doesn't own it. This prevents leaking information about resource existence.

### Rate Limiting

For endpoints needing rate limiting, use specialized auth functions:

```typescript
// General API rate limiting (100 req/15min)
import { requireAuthWithRateLimit } from '@/lib/auth-utils';

export async function POST(request: Request) {
  const { error, user } = await requireAuthWithRateLimit(request);
  if (error) return error;
  // ...
}

// Stricter rate limiting for sensitive actions (10 req/15min)
import { requireAuthForSensitiveAction } from '@/lib/auth-utils';

export async function POST(request: Request) {
  const { error, user } = await requireAuthForSensitiveAction(request);
  if (error) return error;
  // ...
}
```

See [src/lib/auth-utils.ts](src/lib/auth-utils.ts) for full JSDoc documentation.

## Processing Pipeline

Durable, queue-based (see `docs/PIPELINE_DURABILITY.md` for the full design):
- `/api/sessions/[id]/process` **enqueues** a `pipeline_jobs` row (idempotent: one active job per session) and returns immediately
- An in-process worker (`src/services/pipeline/worker.ts`, started via `src/instrumentation.ts`) claims jobs with `FOR UPDATE SKIP LOCKED` and runs transcribe → summarize → dm-todo end-to-end
- **Checkpointed:** each Whisper chunk result is persisted (`transcript_chunks`); resumed jobs never re-pay for completed chunks; each step skips if its output exists
- **Crash-safe:** running jobs hold a heartbeat lease; a reaper requeues jobs whose worker died; transient failures retry with exponential backoff (5 attempts), permanent ones fail fast with a user-visible error
- Frontend polls `/api/sessions/[id]/progress` (includes job status/attempts/lastError)

## Deployment

Multi-stage Dockerfile produces a standalone Next.js image on Node 22 Alpine with FFmpeg. Deployed to Fly.io with `fly.toml` (production), `fly.staging.toml` (staging), `fly.review.toml` (PR reviews). Release command runs `prisma migrate deploy`.

**Promotion is trunk-based** — `main` is the only long-lived branch (no `staging`/`production` branches):
- **PR → `main`:** `pull-request.yml` fast gate (`CI Status`) + ephemeral review app. PR titles must be Conventional Commits (squash-merge makes the title the commit on `main`).
- **Push to `main` → staging:** `staging.yml` runs the comprehensive suite, deploys staging, runs the post-deploy suite. Staging is always current `main`.
- **Production → manual release:** run `production.yml` (`workflow_dispatch`, `patch/minor/major`). It generates release notes with git-cliff (`cliff.toml`), tags `vX.Y.Z`, publishes a GitHub Release (the public changelog), and blue-green deploys prod. See `.github/CLAUDE.md` for the full flow.

## Testing

Playwright E2E tests organized by environment:
- `tests/ci/` - Route protection, middleware, page smoke tests (runs with testcontainers)
- `tests/staging/` - Workflows and integration tests against a deployed environment (`test:staging` / `test:post-deploy` both run this suite; target picked via `DEPLOY_URL`)
- `src/**/__tests__/` - Vitest unit tests (whitelist, auth-utils, audio processing)
