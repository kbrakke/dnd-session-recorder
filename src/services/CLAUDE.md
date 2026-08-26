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

### `billing.ts` — Stripe Billing
Subscription billing via Stripe Checkout with **Managed Payments** (preview: Stripe is merchant of record and handles tax). The Stripe client lives in `src/lib/stripe.ts`; product-create and checkout-session calls send the `2026-02-25.preview` version header per request (`STRIPE_PREVIEW_API_VERSION`).
- `ensureSubscriptionPrice()` — resolves the $10/mo price: `STRIPE_PRICE_ID` env, else finds/creates the product tagged `app=dnd-session-recorder` (short TTL cache; the product definition + find/create helpers live in `src/lib/stripe.ts`, shared with `scripts/stripe-setup.ts`, and product create uses an idempotency key so racing cold machines can't duplicate it)
- `getSubscriptionPriceInfo()` — resolved price as display data (amount/interval/product name) so the billing page never hardcodes what checkout charges
- `getOrCreateStripeCustomer(userId)` — persists `User.stripeCustomerId` on first use; `customers.create` uses idempotency key `customer-create-<userId>` so concurrent first checkouts can't duplicate customers
- `createSubscriptionCheckoutSession(userId, baseUrl)` — subscription-mode Checkout Session, `managed_payments[enabled]=true`, `client_reference_id`/`subscription_data.metadata.userId` carry the user id to webhooks. The checkout route 409s when the user is already active/trialing
- `handleStripeEvent(event)` / `syncSubscription(sub)` — webhook dispatch; upserts the `subscriptions` mirror row by `stripeSubscriptionId` (idempotent on replay). Stripe doesn't guarantee event ordering, so `updated`/`deleted` handlers **re-retrieve the subscription** and never sync the (possibly stale) event payload. `syncSubscription` verifies the resolved userId still exists before upserting — a deleted user's live subscription must log-and-skip, not hit the FK and 500 into an endless Stripe retry loop. Stripe is the source of truth; the DB row is a cache for fast auth-time checks
- `getUserSubscription(userId)` / `isSubscriptionActive(sub)` — status reads (`active`/`trialing` count as active). An active/trialing row is preferred over the newest row, so a stale canceled/incomplete row can't shadow a still-billing subscription
- Billing period is **item-level** (`subscription.items.data[0].current_period_end`) on current API versions, not on the subscription object

### `recording.ts` — Live Recording Lifecycle
State machine for in-browser recording (docs/LIVE_RECORDING_DESIGN.md): `recording | paused | finalizing | finalized | failed`, with **`interrupted` always DERIVED** (`deriveDisplayStatus`: capture status + heartbeat older than `RECORDING_STALE_SECONDS` vs the DB clock) — never stored, no cron. Heartbeat writes use raw SQL `NOW()` (clock rule below). Key invariants:
- Start and takeover are the same operation (`startOrTakeoverRecording`): a fresh `recorderToken` is issued and stale tabs' writes 409.
- `savePart` is idempotent by `(segment, index)` and recomputes segment aggregates from the ledger, so retries can't double-count. Part uploads double as heartbeats.
- `contiguousParts` implements "finalize what we have": assembly uses each segment's gapless part prefix.
- `discardRecording` deletes part objects best-effort, then the row — deleting the row is what frees the session for re-recording.

### `pipeline/steps/finalizeRecording.ts` — Recording Assembly
Runs as pipeline job **`type: 'finalize_recording'`** (the worker dispatches on `job.type`; everything else runs the classic chain). Downloads parts, byte-concatenates per segment, ffmpeg-concats segments (stream copy), probes duration, publishes a normal `Upload`, links the session (`uploaded`, duration mirrored), and deletes part objects/rows. `finalizedUploadId` is set **before** the session link so a crash re-runs into pure bookkeeping, never a second Upload. Terminal failures mark the `Recording` failed (parts retained, retryable) — not the session, which is still `draft`.
- Queue idempotency is per **session**, not per type: `enqueueJob` returns any active job for the session regardless of type. Therefore the step only RETURNS `enqueueProcessing` and the **worker enqueues `process_session` after `completeJob`** (cost-gated like create-with-upload) — enqueueing from inside the still-running finalize job would return that job itself and the process job would never exist (caught by the fake-recorder E2E).

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
