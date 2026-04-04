# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start development server
npm run build     # Production build
npm run start     # Start production server
npm run lint      # Run ESLint
```

There are no test scripts configured.

## Architecture

**RGB SFA** is a Next.js 14 (App Router) + Supabase + Tailwind CSS sales force automation admin panel.

### Key Architectural Patterns

**Multi-Tenancy**: Every request goes through `src/middleware.ts`, which validates the JWT session cookie, injects `x-tenant-id` into headers, and blocks unauthenticated access. All API routes read `x-tenant-id` from headers and filter all DB queries by `tenant_id`.

**Authentication**: Custom JWT in an httpOnly cookie (no NextAuth). `src/lib/session.ts` handles JWT verification. `src/lib/auth.ts` exports `getCurrentUser()` and `requireUser()` for API routes.

**Two Supabase clients**:
- `src/lib/supabase-server.ts` — uses `SUPABASE_SERVICE_ROLE_KEY`, bypasses RLS (for API routes)
- `src/lib/supabase-browser.ts` — uses `NEXT_PUBLIC_SUPABASE_ANON_KEY`, subject to RLS (for client components)

**RBAC + Data Scoping**: `src/lib/permissions.ts` exports `checkPermission(user, section, action)` and `getDataScope(user, section)`. Scope returns `'own' | 'team' | 'all'`. Sections include: `locations`, `business`, `products`, `organization`, `users`, `orders`, `leads`. Permissions are stored in the `role_permissions` table.

**Route Groups**: All authenticated pages live under `src/app/(protected)/`. Masters (reference data management) live under `src/app/(protected)/masters/`.

**API Routes**: ~99 REST endpoints under `src/app/api/`. Pattern: route reads tenant from header, calls Supabase service client, applies permission checks, returns JSON.

### Reusable Patterns

**`useCrud` hook** (`src/hooks/useCrud.ts`): Generic hook for all master data pages. Handles rows, loading, search (300ms debounce), pagination (15 items/page), and CRUD operations with toast notifications.

**`CrudPage` component** (`src/components/ui/CrudPage.tsx`): Reusable data table with search, pagination, edit/delete actions. Used by almost all master pages.

**Toast notifications**: `src/contexts/ToastContext.tsx` wraps the entire app. Use `useToast()` hook anywhere.

### Database

Supabase PostgreSQL. Schema in `supabase/migrations.sql`. All tables use UUID primary keys and have a `tenant_id` column. RLS is enabled on all tables as an additional security layer.

**Hierarchy of location masters**: states → districts → talukas → villages

**Weekly plan workflow**: plans go through state transitions (submit → approve/reject/suggest). See `/api/weekly-plans/` for the 12+ state-change endpoints.

### Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # Server-only, bypasses RLS
SESSION_SECRET=                    # 32+ chars for JWT signing
DEFAULT_TENANT_ID=                 # UUID for single-tenant dev
```

### SuperAdmin

SuperAdmin routes are separate from the tenant app. Middleware blocks SuperAdmin users from accessing tenant routes and vice versa. SuperAdmin API routes are under `/api/superadmin/`.
