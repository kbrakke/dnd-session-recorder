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
| `Upload` | Audio file metadata | filename, path, size, mimetype, duration, chunkPaths |

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

## Other Directories

- `dbml/` — Database markup language files (documentation)
- `prisma/` — Local Prisma data (development)
