# src/types/

TypeScript type augmentations and declarations for third-party modules.

## Files

### `next-auth.d.ts`
Augments NextAuth types to include user ID in the session:
- Extends `Session.user` with `id: string`
- Extends `JWT` with `id: string`
- Extends `User` with `id: string`

This allows `session.user.id` to be available throughout the app after the JWT callback populates it (see `src/lib/auth.ts`).

### `ffprobe-static.d.ts`
Declares the `ffprobe-static` module which provides a static path to the ffprobe binary. Used by the transcription service to probe audio file duration before chunking.
