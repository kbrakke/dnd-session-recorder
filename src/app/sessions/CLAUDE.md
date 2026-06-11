# src/app/sessions/

Session management UI pages. Sessions represent individual D&D game recordings.

## Pages

### `page.tsx` — Session List (`/sessions`)
Lists all user sessions with filtering by status (all, completed, processing, error). Displays session metadata: title, campaign name, date, duration, transcription/summary status. Status-specific action buttons link to detail pages.

### `upload/page.tsx` — Upload Audio (`/sessions/upload`)
File upload form for audio recordings. Handles file selection, upload progress, and links the upload to a session. Creates a new session or attaches to an existing one.

### `[id]/page.tsx` — Session Detail (`/sessions/[id]`)
The most complex page in the application, decomposed into `[id]/components/` (pipeline strip, error banner, audio player, summary/transcript/todo sections, sidebar, modals) and `[id]/hooks/`. Provides:
- **Processing pipeline strip** (`components/processing-pipeline.tsx`): Upload → Transcribe → Summarize → Ready steps, plus a **Start processing** button when status is `uploaded` (= no active job; the process route sets an optimistic in-flight status on enqueue) and **Cancel** while transcribing/summarizing
- **Theme variants:** 4 visual themes defined in `themes.ts`
- **Summary display/editing:** view and edit AI-generated summary
- **DM TODO display/editing:** view and edit AI-generated DM notes
- **Session management:** delete session, cancel transcription, re-process
- **Upload linking:** attach audio file to session

### Polling design (`[id]/hooks/use-session-data.ts`)
While the pipeline is queued/working, the ONLY thing polled is the lightweight `/api/sessions/[id]/progress` endpoint (2.5s; 5s in `uploaded`; nothing when completed/error). The heavy queries (session with full transcript, summary, todos, transcriptions) have NO refetch timers — they're invalidated once when the progress fingerprint (`status|currentStep|chunksCompleted`) changes, and the freshest progress fields are overlaid onto the cached session for display. New pipeline UI must drive off the progress feed, not timers on heavy queries — an earlier version polled the full transcript every 1–2s (~1,000 reads/job) and kept idle Fly machines awake. Status display logic comes from `@/lib/session-status` (`isInFlight`, `statusLabel`) — never hand-roll status switches.

### `[id]/transcript/page.tsx` — Transcript View (`/sessions/[id]/transcript`)
Displays raw transcription segments with timestamps. Read-only view of all `Transcription` records for the session.

### `[id]/summary/page.tsx` — Summary View (`/sessions/[id]/summary`)
Displays and allows editing of the AI-generated summary. Tracks whether the user has edited the summary (`isEdited` flag) and preserves the original text.

### `[id]/themes.ts`
Defines 4 UI theme objects used by the session detail page. Each theme specifies colors, gradients, and styling for the session view (backgrounds, borders, text colors, button styles, progress bars).

## Data Fetching Pattern

All pages use TanStack React Query:
- `useQuery` for fetching session data
- `useMutation` for updates (edit summary, delete session, trigger processing)
- Query invalidation after mutations to refresh UI
- Polling interval on progress queries during active processing
