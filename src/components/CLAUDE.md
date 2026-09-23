# src/components/

Reusable React components organized by category.

## Structure

```
components/
  layout/        Shell/chrome components
  providers/     React context providers
  ui/            Generic reusable UI primitives
  features/      Feature-specific components (currently empty)
  Dashboard.tsx  Dashboard for authenticated users
  LandingPage.tsx  Marketing page for unauthenticated users
```

## Components

### Layout

**`Navbar.tsx`** — Main navigation bar. Client component with:
- Logo link ("RPG Session Recorder")
- Nav links: Home, New Session, Campaigns
- User profile dropdown with sign-out button
- OAuth account indicators (shows linked providers)
- Click-outside detection to close dropdown
- Image loading fallback for user avatars

### Providers

**`SessionProvider.tsx`** — Wraps NextAuth `SessionProvider`. Enables `useSession()` hook throughout the app. Client component.

**`ReactQueryProvider.tsx`** — Configures TanStack React Query with:
- 5-minute `staleTime` for queries
- Single retry on failure
- Singleton `QueryClient`

### UI

**`Button.tsx`** — Reusable button with:
- Variants: `primary`, `secondary`, `outline`, `ghost`, `danger` (design-system ink/slate classes, not theme-aware — don't use inside `sessions/[id]/components`, which style with `--sp-*` tokens)
- Sizes: `sm`, `md`, `lg`
- Uses `cn()` for Tailwind class merging
- Supports all native button props

### Recording (`recording/`)
Client pieces for live recording (engine lives in `src/lib/recording/`):
- `use-recorder-engine.ts` — attach to the session's engine via `useSyncExternalStore` (SSR idle snapshot; never creates engines server-side; evicts a stale terminal engine on mount). Unmount only unsubscribes.
- `use-preflight.ts` — capability gate, mic permission/picker (saved in localStorage as a hint), level meter; owns the stream until `detachStream()` hands it to the engine. StrictMode-safe.
- `use-before-unload.ts` — native leave-site dialog while closing would lose audio. In-app navigation is deliberately NOT intercepted.
- `preflight-panel.tsx`, `level-meter.tsx`, `unsupported-browser.tsx`, `recording-badge.tsx` (list/header badge from `session.recording`), `recording-indicator.tsx` (Navbar pill linking back to a recording running in the background).

### Top-Level

**`Dashboard.tsx`** — Home page for authenticated users. Shows recent sessions and campaigns with quick action cards. Falls back to `LandingPage` if not authenticated.

**`LandingPage.tsx`** — Marketing landing page with feature descriptions, mock data demos, stats, and CTA buttons. Shown to unauthenticated visitors.

## Conventions

- All interactive components use `'use client'` directive
- Styling uses Tailwind CSS utilities
- `cn()` from `@/lib/utils` for conditional class merging
- Lucide React for icons
