# src/app/

Next.js App Router directory. Contains all pages (UI) and API routes (backend).

## Architecture

Next.js App Router uses file-system routing:
- `page.tsx` files define page components (UI routes)
- `route.ts` files define API endpoints (server-side HTTP handlers)
- `layout.tsx` files define shared layouts wrapping child pages
- `[param]` directories are dynamic route segments
- `[...param]` directories are catch-all route segments

## Layout

`layout.tsx` is the root layout wrapping all pages. It provides:
- Inter font
- `SessionProvider` (NextAuth session context)
- `ReactQueryProvider` (TanStack Query client)
- `Navbar` component
- Centered max-width content area

## Page Routes

| Route | File | Description |
|---|---|---|
| `/` | `page.tsx` | Home page (Dashboard if authed, LandingPage if not) |
| `/auth/signin` | `auth/signin/page.tsx` | Sign-in form |
| `/auth/signup` | `auth/signup/page.tsx` | Registration form |
| `/auth/error` | `auth/error/page.tsx` | Auth error display |
| `/sessions` | `sessions/page.tsx` | List all sessions with status filters |
| `/sessions/upload` | `sessions/upload/page.tsx` | Upload audio file |
| `/sessions/[id]` | `sessions/[id]/page.tsx` | Session detail with processing pipeline |
| `/sessions/[id]/transcript` | `sessions/[id]/transcript/page.tsx` | Raw transcription view |
| `/sessions/[id]/summary` | `sessions/[id]/summary/page.tsx` | Summary view/edit |
| `/campaigns` | `campaigns/page.tsx` | Campaign list with CRUD |
| `/campaigns/[id]` | `campaigns/[id]/page.tsx` | Campaign detail with session timeline |
| `/uploads` | `uploads/page.tsx` | Upload management |
| `/settings` | `settings/page.tsx` | User settings |
| `/about` | `about/page.tsx` | About page |

## API Routes

All API routes are under `api/`. See `src/app/api/CLAUDE.md` for details.

## Behavior

- Pages are client components (`'use client'`) since they need interactivity
- Pages use `useSession()` from NextAuth for auth state
- Pages use `useQuery()` / `useMutation()` from TanStack React Query for data
- API routes are server-side only and use `requireAuth()` for authentication

## Protected pages guard themselves

Middleware only covers `/api/*` — every protected PAGE must carry the standard client-side guard: `useSession()` + `useEffect` redirecting unauthenticated users to `/auth/signin`, plus `enabled: status === 'authenticated'` on its queries. `tests/ci/middleware/route-protection.spec.ts` enforces this for `/campaigns`, `/sessions`, `/settings`, `/sessions/upload` — new protected pages need the same guard (a redesign once silently dropped it from three pages).
