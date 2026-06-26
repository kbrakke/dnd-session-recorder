# prisma/

Database schema, migrations, and Prisma ORM configuration.

## Files

### `schema.prisma`
Defines the data model for PostgreSQL. Uses `cuid()` for primary keys on most models, `autoincrement()` for Transcription/Summary/DmTodoList.

**Models:**

| Model | Purpose | Key Fields |
|---|---|---|
| `User` | Authentication & profile | email (unique), password (nullable for OAuth), name |
| `Account` | OAuth provider links (NextAuth) | provider, providerAccountId, tokens |
| `Session` | NextAuth JWT sessions | sessionToken, expires |
| `VerificationToken` | Email verification (NextAuth) | identifier, token, expires |
| `Campaign` | D&D campaign container | name, description, systemPrompt (AI context) |
| `GamingSession` | Individual game recording | title, sessionDate, status, progress tracking fields |
| `Transcription` | Audio text segments | startTime, endTime, text, confidence |
| `Summary` | AI-generated session summary | summaryText, keyEvents, isEdited, originalText |
| `DmTodoList` | AI-generated DM notes | content (markdown), isEdited, originalText |
| `Upload` | Audio file metadata | filename, storageKey, size, mimetype, duration |
| `Subscription` | Mirror of the user's Stripe subscription (webhook-maintained; Stripe is source of truth) | stripeSubscriptionId (unique), status, currentPeriodEnd, cancelAtPeriodEnd |
| `PipelineJob` | Durable work queue for processing pipeline | status, currentStep, attempts, runAfter (backoff), lockedBy/heartbeatAt (lease) |
| `TranscriptChunk` | Per-chunk Whisper checkpoint (deleted after stitch) | chunkIndex, totalChunks, status, text |

**Key relationships:**
- User -> Campaign -> GamingSession -> Transcription/Summary/DmTodoList
- User -> Upload -> GamingSession (upload can be linked to a session)
- All relations use `onDelete: Cascade`

**GamingSession status flow:**
`draft -> uploaded -> transcribing -> transcribed -> summarizing -> completed | error`

**GamingSession progress fields:**
- `transcriptionProgress` (0-100%), `totalChunks`, `chunksCompleted`, `currentStep`
- `processingStartedAt`, `lastProgressAt` (timeout detection)
- `errorStep`, `errorMessage`, `lastError` (error tracking)

**Naming conventions:**
- Prisma models use PascalCase
- Database tables use snake_case (via `@@map`)
- Database columns use snake_case (via `@map`)

## Migrations

`migrations/` contains sequential Prisma migration files. Each migration is a SQL file with a corresponding migration metadata directory.

Run migrations:
- Development: `npm run db:migrate` (`prisma migrate dev`)
- Production: `npm run db:deploy` (`prisma migrate deploy`)
- Reset: `npm run db:reset` (tears down and rebuilds)

### Migration practices (hard-won)

- **Any migration that tightens a constraint must assume real data exists**, even though local/CI DBs are always fresh. `SET NOT NULL` on a column with legacy NULLs failed on staging (`23502`) — backfill first (`UPDATE … WHERE col IS NULL`), then tighten. Use `IF EXISTS`/`IF NOT EXISTS` guards so partial/manual recovery states don't wedge the migration.
- **A failed `migrate deploy` wedges ALL future deploys** until `migrate resolve`d — editing the migration file alone does not retry it (and changes the checksum). `scripts/init-database.ts` only auto-resolves one hardcoded migration name. On a disposable DB the clean recovery is `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` then redeploy.
- **Never edit a migration that's cleanly applied in a durable environment** — the recorded checksum will mismatch.
- **Hand-written migrations:** use Prisma's default index/constraint names (e.g. `<table>_<column>_idx`) so the schema and DB don't drift, and verify with a throwaway Postgres: apply the full chain via `migrate deploy`, then `prisma migrate diff --from-url <db> --to-schema-datamodel prisma/schema.prisma --exit-code` must report no difference.
- **`$queryRaw` binds JS numbers as bigint** — `make_interval(mins => ${n})` fails with `42883`. Use `(${n}::int * INTERVAL '1 minute')`. Only a real Postgres catches this; typecheck and unit tests can't.
- **Postgres does not auto-index FK columns.** The hot per-user/per-session FK indexes were added in `20260611120000_add_fk_indexes`; new FK columns on hot query paths need their own `@@index`.

## Other Directories

- `dbml/` — Database markup language files (documentation)
- `prisma/` — Local Prisma data (development)
