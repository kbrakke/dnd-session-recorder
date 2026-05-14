# src/app/api/

Backend API routes using Next.js App Router conventions. Each `route.ts` file exports HTTP method handlers (`GET`, `POST`, `PUT`, `DELETE`).

## Authentication

All API routes (except `/api/auth` and `/api/health`) are protected by:
1. **Middleware** (`middleware.ts` at project root) - requires valid JWT token
2. **Route-level auth** - most routes call `requireAuth()` or `requireAuthWithRateLimit()` from `@/lib/auth-utils`

## Endpoints

### Auth (`auth/`)
- `[...nextauth]/route.ts` - NextAuth dynamic route handler (login, logout, session, callbacks)
- `register/route.ts` - `POST` user registration (email/password with bcryptjs hashing)

### Campaigns (`campaigns/`)
- `route.ts` - `GET` list user's campaigns, `POST` create campaign
- `[id]/route.ts` - `GET` single campaign, `PUT` update, `DELETE` delete

### Sessions (`sessions/`)
- `route.ts` - `GET` list sessions (filterable by `campaignId`), `POST` create session
- `create-with-upload/route.ts` - `POST` create session and link upload in one call
- `[id]/route.ts` - `GET` session with includes, `PUT` update, `DELETE` delete
- `[id]/process/route.ts` - `POST` **orchestrator** that triggers the transcription->summary pipeline
- `[id]/progress/route.ts` - `GET` processing progress (polled by frontend)
- `[id]/transcriptions/route.ts` - `GET` transcription segments for a session
- `[id]/upload/route.ts` - `POST` link an upload to a session

### Transcription (`transcription/`)
- `[sessionId]/route.ts` - `POST` run Whisper transcription, `GET` retrieve, `DELETE` remove

### Summary (`summary/`)
- `[sessionId]/route.ts` - `POST` generate GPT-4o summary, `GET` retrieve, `PUT` edit

### DM TODO (`dm-todo/`)
- `[sessionId]/route.ts` - `POST` generate DM TODO list, `GET` retrieve, `PUT` edit

### Uploads (`uploads/`)
- `route.ts` - `POST` upload audio file, `GET` list uploads
- `[id]/route.ts` - `GET` upload details, `DELETE` remove upload

### User (`user/`)
- `accounts/route.ts` - `GET` linked OAuth accounts

### Utility
- `health/route.ts` - `GET` health check (public, no auth)
- `test/cleanup-user/route.ts` - `POST` test cleanup utility

## Processing Pipeline

The process endpoint (`sessions/[id]/process`) is the central orchestrator:

```
POST /api/sessions/[id]/process
  |
  ├─ Check auth & ownership
  ├─ Check if already completed (return early)
  ├─ Check if in-progress (allow restart after 30min timeout)
  ├─ Verify upload exists
  |
  ├─ If no transcription:
  |    └─ Fire POST /api/transcription/[sessionId] (async, background)
  |    └─ Return { status: 'transcribing' }
  |
  ├─ If no summary:
  |    └─ Fire POST /api/summary/[sessionId] (async, background)
  |    └─ Return { status: 'summarizing' }
  |
  └─ All done → status: 'completed'
```

Frontend polls `GET /api/sessions/[id]/progress` for real-time updates.

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
