# src/

Root source directory for the Next.js application. All application code lives here.

## Structure

```
src/
  app/           Next.js App Router (pages, layouts, API routes)
  components/    Reusable React components
  lib/           Utility modules and configuration
  services/      Business logic layer
  types/         TypeScript type augmentations
```

## Conventions

- **Path alias:** `@/*` maps to `src/*` (configured in `tsconfig.json`)
- **Client components** use `'use client'` directive at the top of the file
- **Server components** are the default (no directive needed)
- **API routes** use Next.js route handlers (`route.ts` files with exported HTTP method functions)
- **Validation** uses Zod schemas for API request bodies
- **Data fetching** on the client uses TanStack React Query (`useQuery`, `useMutation`)
- **Styling** uses Tailwind CSS utility classes with `cn()` helper for conditional merging
