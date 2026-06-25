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
- `getSessionProgress(id)` — progress-relevant fields only (no transcript/summary/upload payload); used by the hot `/progress` polling path
- `updateSession(id, data)`
- `updateTranscriptionProgress(id, progress, step, chunks)` — granular progress tracking
- `setSessionError(id, step, message)`, `clearSessionError(id)`
- `startProcessing(id)` — sets `processingStartedAt` timestamp
- `checkProcessingTimeout(id, minutes)` — checks if processing exceeded timeout
- `cancelTranscription(id)` — resets session to uploaded state
- `deleteSession(id)` — cascade deletes session and related data

**Transcription operations:**
- `saveTranscription(sessionId, segment)` — single insert
- `getTranscriptions(sessionId)` — ordered by startTime

**Summary operations:**
- `saveSummary(sessionId, text, keyEvents?, characters?)`, `updateSummary(id, text)`, `getSummary(sessionId)`

**DM TODO operations:**
- `saveDmTodoList(sessionId, content)`, `updateDmTodoList(id, content)`, `getDmTodoList(sessionId)`

**Upload operations:**
- `createUpload(data)`, `getUploads(userId)`, `getUploadById(id)`
- `updateUploadStatus(id, status)`, `deleteUpload(id)`
- `getUploadUsage(userId)` — storage usage stats
- `linkSessionToUpload(sessionId, uploadId)`, `unlinkSessionFromUpload(sessionId)`

**Utility:**
- `getTotalSpeechTime(userId)`, `getSessionStats(userId)`
- `getUserByEmail(email)`, `deleteUser(userId)`

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

**Hard rules:**
- **Never reintroduce cookie-forwarding `fetch()` calls to our own API for background work** — that was the old pattern and it broke on deploys, cookie expiry, and multi-machine routing. Background work goes through the queue; full analysis in `docs/PIPELINE_DURABILITY.md`.
- **All time-sensitive queue writes must use raw SQL `NOW()`**, never Prisma's `@default(now())`/`new Date()` (app clock). The claim query compares `run_after <= NOW()` (DB clock); mixing clock sources made jobs unclaimable when a podman VM clock drifted 13 min. Symptom: jobs stuck `pending` with `run_after` "in the future" relative to `SELECT NOW()`.
- The process route sets an **optimistic status** (`transcribing`/`summarizing`) on successful enqueue — so a session sitting in `uploaded` reliably means "no active job", which the UI uses to show a Start button.

### `storage.ts` — Audio Storage Abstraction
Two backends selected by env: Tigris/S3 object storage (`BUCKET_NAME` + `AWS_ENDPOINT_URL_S3`, set by `fly storage create`) or local `UPLOAD_DIR` (dev default). Every upload row carries a non-null `storageKey` (backend-relative); `localPathForKey` resolves it for the local backend.
- `saveAudio(key, buffer, contentType)` / `deleteAudio(upload)` / `audioExists(upload)`
- `ensureLocalAudio(upload)` — downloads object to a stable temp path for FFmpeg (worker); `cleanupWorkFile()` removes temp copies
- `getPlaybackUrl(upload)` — presigned GET (S3) or null (local → route streams)
- `getLocalAudioPath(upload)` — local file path for playback streaming
- `buildAudioKey(userId, filename)` — `audio/<userId>/<filename>`
- Original audio is RETAINED after transcription (browser playback); never disk-check to decide existence — use `audioExists()`
- MinIO (tests) needs `S3_FORCE_PATH_STYLE=true`; Tigris doesn't

### `audioProcessing.ts` — FFmpeg helpers
- `splitAudioBySize()` — chunk audio under Whisper's size limit (pipeline). Uses **stream copy** (`-c copy`, no re-encode; cuts land on packet boundaries, irrelevant for transcription) with concurrency capped at 4 ffmpeg processes. The worker targets 18MB chunks vs Whisper's 25MB limit — that gap is the VBR-drift headroom.
- `getAudioDuration()` / `validateAudioFile()` — fluent-ffmpeg probing
- `probeAudioDurationSeconds()` — duration via `execFile` (array args, NEVER a shell string — user-controlled filenames must not reach a shell) for upload routes
- `cleanupChunkFiles()` — remove temp chunk files

## Architecture

API routes import `db` from this module and call typed methods rather than using Prisma directly. This provides:
- Consistent include/select patterns
- Centralized business logic
- Type-safe interfaces (`CreateCampaignData`, `CreateSessionData`, `SessionWithIncludes`, etc.)
- Single place to add cross-cutting concerns (logging, validation)
