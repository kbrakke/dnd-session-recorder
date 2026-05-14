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
- Logo link ("D&D Chronicles")
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
- Variants: `primary` (blue), `secondary` (gray), `outline` (bordered)
- Sizes: `sm`, `md`, `lg`
- Uses `cn()` for Tailwind class merging
- Supports all native button props

### Top-Level

**`Dashboard.tsx`** — Home page for authenticated users. Shows recent sessions and campaigns with quick action cards. Falls back to `LandingPage` if not authenticated.

**`LandingPage.tsx`** — Marketing landing page with feature descriptions, mock data demos, stats, and CTA buttons. Shown to unauthenticated visitors.

## Conventions

- All interactive components use `'use client'` directive
- Styling uses Tailwind CSS utilities
- `cn()` from `@/lib/utils` for conditional class merging
- Lucide React for icons
