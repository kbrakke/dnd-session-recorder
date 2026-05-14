# src/app/sessions/

Session management UI pages. Sessions represent individual D&D game recordings.

## Pages

### `page.tsx` — Session List (`/sessions`)
Lists all user sessions with filtering by status (all, completed, processing, error). Displays session metadata: title, campaign name, date, duration, transcription/summary status. Status-specific action buttons link to detail pages.

### `upload/page.tsx` — Upload Audio (`/sessions/upload`)
File upload form for audio recordings. Handles file selection, upload progress, and links the upload to a session. Creates a new session or attaches to an existing one.

### `[id]/page.tsx` — Session Detail (`/sessions/[id]`)
The most complex page in the application (~1700 lines). Provides:
- **Processing pipeline UI:** chunking -> transcribing -> stitching -> summarizing progress bars
- **Real-time polling** of `/api/sessions/[id]/progress` during processing
- **Theme variants:** 4 visual themes (Ancient Tome, Parchment Scroll, Mystical Grimoire, Illuminated Codex) defined in `themes.ts`
- **Summary display/editing:** view and edit AI-generated summary
- **DM TODO display/editing:** view and edit AI-generated DM notes
- **Session management:** delete session, cancel transcription, re-process
- **Upload linking:** attach audio file to session

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
