# Xpansion Console — Franchise Command Center

## Overview
Multi-tenant franchise management platform with RBAC, metrics engine, scorecards, trend analysis, CSV import pipeline, alert rules engine, scheduled reports, audit logging, real notifications (email/Slack), scheduled execution engine, alert workflow automation, executive portfolio dashboard, forecasting, anomaly detection, and data quality guardrails.

## Architecture
- **Frontend**: React + TypeScript + Vite + Tailwind + shadcn + TanStack Query + wouter + Recharts
- **Backend**: Node + Express + TypeScript + Drizzle ORM + PostgreSQL
- **Auth**: Replit Auth (OpenID Connect) via `server/replit_integrations/auth/`
- **Validation**: Zod on all write endpoints with `zod-validation-error` for clean errors
- **Notifications**: Resend (email) + Slack webhooks with retry/backoff
- **Scheduler**: setInterval-based execution engine (60s tick) with job locking

## Brand System (Phase 4)
- **Identity**: Xpansion Console (product name), brand icon "X" in primary red
- **Core Palette**: Primary Red #EA1C24, Secondary Red #C7372C, Deep Crimson #710D0B, Near Black #191211, Charcoal #4A4743, Neutral Gray #94938F, Light Neutral #D6D7D2
- **Theming**: Light + Dark mode via ThemeProvider (localStorage-persisted, default dark), all colors via CSS custom properties in HSL format
- **Fonts**: Inter (sans), JetBrains Mono (mono)
- **Color tokens**: Defined in `client/src/index.css` (:root for light, .dark for dark), consumed via Tailwind theme extension in `tailwind.config.ts`
- **Theme toggle**: In sidebar footer (data-testid="button-theme-toggle"), inline script in index.html prevents flash
- **SEO**: Route-level document.title updates ("PageName | Xpansion Console"), OG/Twitter meta tags, SVG favicon
- **Off-brand colors**: Blues removed (replaced with token-based or neutral classes), green/yellow/red kept for semantic status indicators only
- **Semantic color system**: `client/src/lib/semantic-colors.ts` — shared `statusColors` (success/warning/error/info/neutral), `severityColors` (low/medium/high/critical), `bandColors` (chart hex), `bandBadgeStyles` (badge classes), `scoreColor()`, `deltaTrendColor()` — all pages import from here
- **Accessibility**: Global `:focus-visible` ring via CSS, dialog max-width capped at `calc(100vw - 2rem)`, all tables wrapped in `overflow-x-auto` for mobile scroll

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
- `alert_rules` - Configurable alert conditions (threshold_breach, trend_deterioration) + cooldownMinutes, escalationMinutes, dedupWindowMinutes
- `alert_events` - Triggered alert instances (open/ack/resolved lifecycle)
- `reports` - Report definitions (type, config, schedule)
- `report_runs` - Report execution history with JSON summaries
- `audit_logs` - Entity-level audit trail (before/after snapshots)

### Phase 3 Tables
- `notification_settings` - Per-tenant notification config (email/slack toggles, recipients, severity filters)
- `notification_deliveries` - Delivery log with status tracking (pending/sent/failed)
- `scheduler_runs` - Execution history for scheduled jobs (report generation, alert evaluation, escalation)
- `metric_forecasts` - Linear trend forecasts with 95% confidence intervals
- `metric_anomalies` - Z-score based anomaly detections
- `data_quality_rules` - Configurable quality rules (period_continuity, outlier_detection, duplicate_detection)
- `data_quality_violations` - Quality check violations with severity/details

## Key Patterns
- Tenant scoping enforced in service layer via `requireTenantAccess()` (Phase 1) and `requireAdminAccess()` (Phase 2+)
- Global tenant selector in sidebar using `useTenantStore()` (useSyncExternalStore)
- Phase 1 API routes: `/api/tenants/:tenantId/...` with `{ message }` error format
- Phase 2+ API routes: `/api/admin/...` with `{ ok: true, data }` / `{ ok: false, error: { code, message } }` format
- Score run calculation: raw value -> threshold band -> normalized score (100/75/50/25) -> weighted sum
- Trend endpoints generate period slots and fill with data, returning null for missing periods
- Alert evaluation: cooldown (skip repeat), dedup (skip open duplicates), escalation (auto-bump severity)
- Notifications: alert events + report completions -> email (Resend) + Slack webhook with retry/backoff
- Scheduler: 60s interval, job locking via scheduler_runs, report generation + alert evaluation + escalation checks
- Forecasting: linear regression on historical values, 1.96σ confidence bands
- Anomaly detection: rolling 6-period window, flags >2σ deviations
- Idempotency: X-Idempotency-Key header support on mutation endpoints
- CSV import pipeline: multipart upload -> parse -> map fields -> create metric_values -> log row errors -> run data quality checks (scoped to newly imported rows vs existing baseline)
- Data quality checks: duplicate_detection (new vs existing + intra-batch), outlier_detection (new values vs baseline mean/σ), period_continuity (gap detection with configurable maxGapDays); severity driven by rule config policy (warn/reject)
- `/api/health` returns `{ ok: true, service: "xpansion-console", timestamp }` for uptime checks

## File Structure
- `shared/schema.ts` - All Drizzle models, relations, Zod schemas, types (26 tables)
- `shared/models/auth.ts` - Auth user/session models
- `server/db.ts` - Database connection pool
- `server/storage.ts` - DatabaseStorage implementing IStorage interface (~100 methods)
- `server/routes.ts` - Phase 1 + portfolio + forecasting/anomaly API routes
- `server/admin-routes.ts` - Phase 2+3 admin API routes (imports, alerts, reports, notifications, data quality, scheduler, audit)
- `server/services/notifications.ts` - Email (Resend) + Slack webhook notification service
- `server/services/analytics.ts` - Forecast generation + anomaly detection
- `server/services/scheduler.ts` - Scheduled execution engine (reports, alerts, escalation)
- `server/seed.ts` - Seed data (Sunrise Burgers demo tenant)
- `client/src/App.tsx` - Main app with ThemeProvider, auth gating, route titles, sidebar layout
- `client/src/components/app-sidebar.tsx` - Navigation + tenant selector + admin nav + theme toggle
- `client/src/components/theme-provider.tsx` - Light/dark theme provider with localStorage persistence
- `client/src/lib/tenant-store.ts` - Global tenant state
- `client/src/pages/dashboard.tsx` - Main dashboard
- `client/src/pages/portfolio.tsx` - Executive portfolio dashboard (scores, rankings, risk matrix)
- `client/src/pages/tenants.tsx` - Tenant management
- `client/src/pages/locations.tsx` - Location management
- `client/src/pages/metrics.tsx` - Metric definitions
- `client/src/pages/scorecards.tsx` - Scorecard templates and runs
- `client/src/pages/trends.tsx` - Trend analysis with forecast overlay + anomaly markers
- `client/src/pages/admin-imports.tsx` - CSV import upload/history/errors
- `client/src/pages/admin-alerts.tsx` - Alert rules (with workflow automation) + events + scheduler widget
- `client/src/pages/admin-reports.tsx` - Report definitions + manual run + history + scheduler widget
- `client/src/pages/admin-notifications.tsx` - Notification settings (email/slack) + test + delivery history
- `client/src/pages/admin-data-quality.tsx` - Data quality rules + violations + quality scores
- `client/src/pages/admin-audit.tsx` - Filterable audit log with diff viewer

## Commands
- `npm run dev` - Start dev server
- `npm run db:push` - Push schema changes to database
