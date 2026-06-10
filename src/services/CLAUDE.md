# src/services/

Business logic layer. Contains service classes that encapsulate database operations and file management.

## Files

### `database.ts` — DatabaseService
Singleton class (`db` export) that wraps Prisma Client with typed methods for all CRUD operations. This is the primary data access layer used by all API routes.

**Campaign operations:**
- `createCampaign(data)`, `getCampaigns(userId)`, `getCampaignById(id)`
- `updateCampaign(id, data)`, `deleteCampaign(id)`

**Session operations:**
- `createSession(data)`, `getSessions(userId, campaignId?)`, `getSessionById(id)`
- `updateSession(id, data)`, `updateSessionStatus(id, status)`
- `updateTranscriptionProgress(id, progress, step, chunks)` — granular progress tracking
- `setSessionError(id, step, message)`, `clearSessionError(id)`
- `startProcessing(id)` — sets `processingStartedAt` timestamp
- `checkProcessingTimeout(id, minutes)` — checks if processing exceeded timeout
- `cancelTranscription(id)` — resets session to uploaded state
- `deleteSession(id)` — cascade deletes session and related data

**Transcription operations:**
- `saveTranscriptions(sessionId, segments[])` — bulk insert
- `saveTranscription(sessionId, segment)` — single insert
- `getTranscriptions(sessionId)` — ordered by startTime
- `getTranscriptionCount(sessionId)`

**Summary operations:**
- `saveSummary(sessionId, text, keyEvents?, characters?)`, `updateSummary(id, text)`, `getSummary(sessionId)`

**DM TODO operations:**
- `saveDmTodoList(sessionId, content)`, `updateDmTodoList(id, content)`, `getDmTodoList(sessionId)`

**Upload operations:**
- `createUpload(data)`, `getUploads(userId)`, `getUploadById(id)`
- `updateUploadStatus(id, status, chunkPaths?)`, `deleteUpload(id)`
- `getUploadUsage(userId)` — storage usage stats
- `linkSessionToUpload(sessionId, uploadId)`, `unlinkSessionFromUpload(sessionId)`

**Utility:**
- `getTotalSpeechTime(userId)`, `getSessionStats(userId)`
- `getUserByEmail(email)`, `deleteUser(userId)`

### `database.d.ts` — Type Definitions
TypeScript declaration file for the DatabaseService. Provides interface types without implementation.

### `pipeline/` — Durable Processing Pipeline
Postgres-backed job queue + worker for the transcribe → summarize → dm-todo
loop. See `docs/PIPELINE_DURABILITY.md` for design and failure-mode analysis.
- `queue.ts` — enqueue (idempotent per session), claim (`FOR UPDATE SKIP LOCKED`), heartbeat lease, stale-job reaper, backoff/fail logic
- `worker.ts` — polling loop started once per server boot from `src/instrumentation.ts`; runs steps in order, handles retry/cancel/error classification
- `steps/transcribe.ts` — chunked Whisper transcription with per-chunk durable checkpoints in `transcript_chunks`
- `steps/summarize.ts` / `steps/dmTodo.ts` — GPT generation; `force` option regenerates (used by POST endpoints)
- `backoff.ts` — pure retry-policy functions (unit tested)
- `errors.ts` — `PermanentJobError` (no retry) vs transient; `JobCancelledError`
- `prompts.ts` — shared prompt builders
- Worker config: `PIPELINE_WORKER_ENABLED=false` disables; `PIPELINE_POLL_INTERVAL_MS` tunes polling

### `storage.ts` — Audio Storage Abstraction
Two backends selected by env: Tigris/S3 object storage (`BUCKET_NAME` + `AWS_ENDPOINT_URL_S3`, set by `fly storage create`) or local `UPLOAD_DIR` (dev default). Upload rows carry `storageKey`; legacy rows (null) are absolute local paths.
- `saveAudio(key, buffer, contentType)` / `deleteAudio(upload)` / `audioExists(upload)`
- `ensureLocalAudio(upload)` — downloads object to a stable temp path for FFmpeg (worker); `cleanupWorkFile()` removes temp copies
- `getPlaybackUrl(upload)` — presigned GET (S3) or null (local → route streams)
- `buildAudioKey(userId, filename)` — `audio/<userId>/<filename>`
- Original audio is RETAINED after transcription (browser playback); never disk-check `upload.path` to decide existence — use `audioExists()`

### `fileCleanup.ts` — FileCleanupService (legacy)
Manages cleanup of uploaded audio files and their chunks after processing:
- `cleanupUploadFiles(uploadId)` — removes original file and all chunk files
- Checks upload status before cleanup
- Parses JSON-stored chunk paths
- Uses `Promise.allSettled` for batch cleanup (doesn't fail on individual file errors)
- No-op if file already deleted

## Architecture

API routes import `db` from this module and call typed methods rather than using Prisma directly. This provides:
- Consistent include/select patterns
- Centralized business logic
- Type-safe interfaces (`CreateCampaignData`, `CreateSessionData`, `SessionWithIncludes`, etc.)
- Single place to add cross-cutting concerns (logging, validation)
