# Franchise OS Command Center

## Overview
Multi-tenant franchise management platform with RBAC, metrics engine, scorecards, and trend analysis.

## Architecture
- **Frontend**: React + TypeScript + Vite + Tailwind + shadcn + TanStack Query + wouter
- **Backend**: Node + Express + TypeScript + Drizzle ORM + PostgreSQL
- **Auth**: Replit Auth (OpenID Connect) via `server/replit_integrations/auth/`
- **Validation**: Zod on all write endpoints with `zod-validation-error` for clean errors

## Database Schema (Phase 1)
- `users` / `sessions` - Auth (Replit Auth managed)
- `tenants` - Franchise brands/organizations
- `tenant_users` - RBAC mapping (owner/admin/manager/viewer)
- `locations` - Physical franchise locations
- `metric_definitions` - KPI definitions (data type, unit, direction)
- `metric_thresholds` - Performance bands (excellent/good/acceptable/poor)
- `scorecard_templates` - Named scorecard configurations
- `scorecard_metrics` - Junction: template + metric + weight
- `score_runs` - Executed scoring results
- `score_run_details` - Per-metric breakdown of a score run
- `metric_values` - Recorded data points per metric/location/period

## Key Patterns
- Tenant scoping enforced in service layer via `requireTenantAccess()`
- Global tenant selector in sidebar using `useTenantStore()` (useSyncExternalStore)
- All API routes prefixed with `/api/tenants/:tenantId/`
- Score run calculation: raw value -> threshold band -> normalized score (100/75/50/25) -> weighted sum
- Trend endpoints generate period slots and fill with data, returning null for missing periods
- API routes mounted first; SPA fallback explicitly skips `/api/*` paths
- `/api/health` returns `{ ok: true, service: "xpansion-console", timestamp }` for uptime checks
- Unmatched `/api/*` routes return JSON 404 (never HTML)
- Centralized error middleware returns structured JSON `{ ok, error: { code, message } }`

## File Structure
- `shared/schema.ts` - All Drizzle models, relations, Zod schemas, types
- `shared/models/auth.ts` - Auth user/session models
- `server/db.ts` - Database connection pool
- `server/storage.ts` - DatabaseStorage implementing IStorage interface
- `server/routes.ts` - All API routes with Zod validation
- `server/seed.ts` - Seed data (Sunrise Burgers demo tenant)
- `client/src/App.tsx` - Main app with auth gating and sidebar layout
- `client/src/components/app-sidebar.tsx` - Navigation + tenant selector
- `client/src/lib/tenant-store.ts` - Global tenant state
- `client/src/pages/` - Dashboard, Tenants, Locations, Metrics, Scorecards, Trends

## Commands
- `npm run dev` - Start dev server
- `npm run db:push` - Push schema changes to database
