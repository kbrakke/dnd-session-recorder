# D&D Session Recorder

AI-powered transcription and summarization tool for Dungeons & Dragons sessions. Users upload audio recordings of their game sessions, which are transcribed via OpenAI Whisper and summarized via GPT-4o.

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
3. User uploads an **audio file** (stored on disk, metadata in `Upload` table)
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
- `UPLOAD_DIR` - Audio file storage path (default: `./uploads`)
- `STAGING_WHITELIST` - Comma-separated emails for staging access control

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

The `/api/sessions/[id]/process` endpoint is the orchestrator. It is:
- **Idempotent:** checks current state before acting, safe to call multiple times
- **Resumable:** picks up from the last completed step
- **Timeout-aware:** 30-minute timeout, allows restart after timeout
- **Async:** fires off transcription/summary as background requests, frontend polls `/api/sessions/[id]/progress`

## Deployment

Multi-stage Dockerfile produces a standalone Next.js image on Node 22 Alpine with FFmpeg. Deployed to Fly.io with `fly.toml` (production), `fly.staging.toml` (staging), `fly.review.toml` (PR reviews). Release command runs `prisma migrate deploy`.

## Testing

Playwright E2E tests organized by environment:
- `tests/ci/` - Route protection, middleware (runs with testcontainers)
- `tests/staging/` - Workflows and integration tests against staging
- `tests/post-deploy/` - Post-deployment verification
- `tests/unit/` - Unit tests (whitelist, auth)
