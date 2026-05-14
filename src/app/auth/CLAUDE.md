# src/app/auth/

Authentication UI pages. These are the user-facing auth flows.

## Pages

### `signin/page.tsx`
Sign-in form with email/password fields. Optionally shows Google OAuth button when `NEXT_PUBLIC_GOOGLE_ENABLED` is set. Redirects to home on success. Handles error query params from NextAuth callbacks.

### `signup/page.tsx`
Registration form. Calls `POST /api/auth/register` to create a new user with hashed password. On success, automatically signs in via NextAuth `signIn('credentials')`.

### `error/page.tsx`
Displays auth error messages from NextAuth (e.g., OAuth failures, whitelist rejections). Shows the error query parameter in a user-friendly format.

## Behavior

- All pages are client components (`'use client'`)
- NextAuth custom pages config in `src/lib/auth.ts` points `signIn` to `/auth/signin` and `error` to `/auth/error`
- Staging whitelist is enforced at the provider level (both sign-in and registration)
- Google OAuth linking is supported: existing email/password users can link their Google account
