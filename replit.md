# Franchise OS Command Center

## Overview
Multi-tenant franchise management platform with RBAC, metrics engine, scorecards, trend analysis, CSV import pipeline, alert rules engine, scheduled reports, and audit logging.

## Architecture
- **Frontend**: React + TypeScript + Vite + Tailwind + shadcn + TanStack Query + wouter
- **Backend**: Node + Express + TypeScript + Drizzle ORM + PostgreSQL
- **Auth**: Replit Auth (OpenID Connect) via `server/replit_integrations/auth/`
- **Validation**: Zod on all write endpoints with `zod-validation-error` for clean errors

## Database Schema

### Phase 1 Tables
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

### Phase 2 Tables
- `import_jobs` - CSV import job tracking (status, row counts, mapping config)
- `import_row_errors` - Row-level error logging for failed CSV rows
- `alert_rules` - Configurable alert conditions (threshold_breach, trend_deterioration)
- `alert_events` - Triggered alert instances (open/ack/resolved lifecycle)
- `reports` - Report definitions (type, config, schedule)
- `report_runs` - Report execution history with JSON summaries
- `audit_logs` - Entity-level audit trail (before/after snapshots)

## Key Patterns
- Tenant scoping enforced in service layer via `requireTenantAccess()` (Phase 1) and `requireAdminAccess()` (Phase 2)
- Global tenant selector in sidebar using `useTenantStore()` (useSyncExternalStore)
- Phase 1 API routes: `/api/tenants/:tenantId/...` with `{ message }` error format
- Phase 2 API routes: `/api/admin/...` with `{ ok: true, data }` / `{ ok: false, error: { code, message } }` format
- Score run calculation: raw value -> threshold band -> normalized score (100/75/50/25) -> weighted sum
- Trend endpoints generate period slots and fill with data, returning null for missing periods
- Alert evaluation runs on rule create/update — checks all tenant locations for threshold breaches or trend deterioration
- CSV import pipeline: multipart upload -> parse -> map fields -> create metric_values -> log row errors
- `isAuthenticated` middleware returns standardized `{ ok: false, error }` JSON on 401
- `/api/health` returns `{ ok: true, service: "xpansion-console", timestamp }` for uptime checks
- Unmatched `/api/*` routes return JSON 404 (never HTML)
- Centralized error middleware returns structured JSON `{ ok, error: { code, message } }`

## File Structure
- `shared/schema.ts` - All Drizzle models, relations, Zod schemas, types
- `shared/models/auth.ts` - Auth user/session models
- `server/db.ts` - Database connection pool
- `server/storage.ts` - DatabaseStorage implementing IStorage interface
- `server/routes.ts` - Phase 1 API routes with Zod validation
- `server/admin-routes.ts` - Phase 2 admin API routes (imports, alerts, reports, audit)
- `server/seed.ts` - Seed data (Sunrise Burgers demo tenant)
- `client/src/App.tsx` - Main app with auth gating and sidebar layout
- `client/src/components/app-sidebar.tsx` - Navigation + tenant selector + admin nav group
- `client/src/lib/tenant-store.ts` - Global tenant state
- `client/src/pages/` - Dashboard, Tenants, Locations, Metrics, Scorecards, Trends
- `client/src/pages/admin-imports.tsx` - CSV import upload/history/errors
- `client/src/pages/admin-alerts.tsx` - Alert rules CRUD + events table
- `client/src/pages/admin-reports.tsx` - Report definitions + manual run + history
- `client/src/pages/admin-audit.tsx` - Filterable audit log with diff viewer

## Commands
- `npm run dev` - Start dev server
- `npm run db:push` - Push schema changes to database
