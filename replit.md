# Xpansion Console — Franchise Command Center

## Overview
Xpansion Console is a multi-tenant franchise management platform designed to empower franchise organizations with advanced tools for performance monitoring, strategic planning, and operational excellence. It offers robust features such as role-based access control, a comprehensive metrics engine with scorecards and trend analysis, CSV data import capabilities, and a sophisticated alert rules engine. The platform automates reporting, notifications, and workflow processes, providing an executive portfolio dashboard for high-level oversight, forecasting, and anomaly detection. Its core vision is to serve as a Growth Operating System, integrating weekly command center functionalities, action management, goal setting, benchmarking, playbooks, and executive digests. Ultimately, Xpansion Console aims to deliver Intelligence + Automation at Scale through predictive risk engines, autonomous weekly planning, playbook effectiveness analytics, and executive narrative reports, enabling franchises to achieve sustainable growth and operational efficiency.

## User Preferences
I want to prioritize a clear and consistent architecture. Avoid introducing new patterns unless absolutely necessary. Focus on delivering high-quality, maintainable code. I prefer detailed explanations for complex logic. Do not make changes to files within the `server/replit_integrations/` folder.

## System Architecture
The platform is built with a modern web stack, featuring a React, TypeScript, Vite, Tailwind, and shadcn frontend, and a Node, Express, TypeScript, Drizzle ORM, and PostgreSQL backend. Authentication supports both Replit Auth (OpenID Connect) for regular users and email/password for superadmins, with robust security measures including session fixation prevention, rate limiting, and brute-force lockout. Data validation is handled via Zod. Notifications leverage Resend for email and Slack webhooks, with built-in retry mechanisms. A `setInterval`-based execution engine manages scheduled tasks with job locking for reliability.

The UI/UX adheres to a strong brand identity, "Xpansion Console," with a primary red color palette, supporting light and dark modes, and using Inter and JetBrains Mono fonts. A semantic color system ensures WCAG AA compliance for accessibility, with all text/background pairs meeting contrast ratios. Accessibility features include global `:focus-visible` rings and mobile-friendly table scrolling.

The database schema is organized across several phases, supporting features from basic user and tenant management to advanced capabilities like predictive risk scoring, automated weekly planning, playbook effectiveness analysis, and a superadmin command tower. Key architectural patterns include tenant scoping enforced at the service layer, a global tenant selector, and consistent API response formats. Core functionalities include a score run calculation system, trend analysis, alert evaluation with cooldowns and escalations, and idempotent notification and scheduler processes. Data quality guardrails, including duplicate detection, outlier detection, and period continuity checks, are integrated into the CSV import pipeline.

## External Dependencies
- **Authentication**: Replit Auth (OpenID Connect)
- **Email Notifications**: Resend
- **Team Notifications**: Slack webhooks
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM
- **Frontend Framework**: React
- **Build Tool**: Vite
- **Styling**: Tailwind CSS, shadcn
- **State Management/Data Fetching**: TanStack Query
- **Routing**: wouter
- **Charting**: Recharts
- **Validation**: Zod (with `zod-validation-error`)
- **Password Hashing**: bcryptjs

## Phase 5.5: Growth Engine
- **Campaigns table** (`campaigns`): id, tenantId, name, type (promo/local_outreach/staffing_initiative/upsell_push), locationId (nullable), metricDefinitionId (nullable), startDate, endDate, status (planned/active/completed/cancelled), description, budget, createdByUserId, createdAt, updatedAt
- **Campaign routes**: GET/POST `/api/tenants/:tenantId/campaigns`, PUT `/api/tenants/:tenantId/campaigns/:id`, GET `/api/tenants/:tenantId/campaigns/:id/impact` (pre/post metric comparison with confidence levels)
- **Campaigns page**: `/campaigns` — list with status/type filters, create/edit dialogs, expandable impact attribution cards
- **Enhanced digest narrative**: Multi-paragraph coach-voice summary with wins celebration, risk callouts, blocked/overdue nudges, and recommended next steps (replaces terse one-liner)
- Files: `shared/schema.ts`, `server/storage.ts`, `server/phase5-routes.ts`, `client/src/pages/campaigns.tsx`

## Phase 5.6: Enterprise Reliability + Intelligence Loop
Six workstreams delivering defense-in-depth security, durable job orchestration, data confidence scoring, recommendation outcome learning, a Command Inbox, and API/ops robustness.

### New Tables (9)
- `job_queue` — durable job queue with idempotency keys, priority, retry/backoff, dead-letter support
- `job_runs` — per-execution logs with duration, error snapshots, worker keys
- `job_dead_letters` — failed jobs after max retries exhausted
- `tenant_confidence_snapshots` — data confidence scores per metric/location (freshness, completeness, continuity, outlier rate, sample sufficiency)
- `recommendation_events` — lifecycle event log (generated/viewed/accepted/rejected/converted_to_action/completed)
- `recommendation_effectiveness` — measured uplift (pre/post metric deltas, confidence, measurement window)
- `security_access_events` — security audit trail (MFA, permission denied, break-glass events)
- `break_glass_sessions` — emergency superadmin access with reason, expiry, audit trail
- `audit_logs` extended with `eventHash` (SHA-256) and `prevHash` columns for tamper-evident hash chain

### Backend Services
- **Job Queue Engine** (`server/services/job-queue.ts`): enqueue with idempotency dedup, claim via polling, exponential backoff (min(1000*2^retryCount, 300000ms)), dead-letter after maxRetries, per-tenant concurrency limit (5), stale lock release (5min), handler registry (digest_generation, risk_recompute, campaign_impact, scheduled_report, notification_retry)
- **Confidence Engine** (`server/services/confidence-engine.ts`): freshnessScore, completenessScore, continuityScore, outlierRate, sampleSufficiency → weighted overallConfidence (0-1)
- **Tracing Middleware** (`server/middleware/tracing.ts`): X-Request-Id generation, structured logging with tenantId/userId/traceId on write paths

### API Routes (all /api/v1 prefix)
- **Security**: POST/GET `/api/v1/superadmin/break-glass/start|end|active` — break-glass session management
- **Jobs**: POST `/api/v1/admin/jobs/:type/enqueue`, GET `.../runs`, `.../dead-letters`, `.../stats`
- **Confidence**: GET `/api/v1/tenants/:tenantId/confidence`, `.../snapshots`, `.../metric/:metricId/location/:locationId`
- **Recommendations**: GET `/api/v1/tenants/:tenantId/recommendations/effectiveness`, `.../events`, POST `.../compute-effectiveness`
- **Inbox**: GET `/api/v1/tenants/:tenantId/inbox` — aggregated prioritized view of risks, blocked/overdue actions, off-track goals, critical alerts, high-confidence opportunities

### Frontend
- **Command Inbox** (`/inbox`): urgency-sorted aggregation of top risks, blocked/overdue actions, off-track goals, critical alerts, opportunities; type filters, confidence badges, urgency bars, one-click "Convert to Action", "Why this?" explainability drawer with factors/weights/confidence
- **Ops Health extended**: Job queue metrics section (queue depth, success rate, retries, p95 latency)

### Architecture Notes
- Audit hash chain: SHA-256 of (entityType|entityId|action|actorUserId|createdAt), chain via prevHash column
- Break-glass sessions: require reason, default 1hr expiry, log security_access_event
- Fine-grained permissions: `checkPermission(tenantId, userId, resource, action)` checks tenant_users role against permission map
- Recommendation lifecycle hooks: opportunity fetch → "viewed", create-action → "converted_to_action", action done → "completed" + effectiveness baseline
- Files: `shared/schema.ts`, `server/storage.ts`, `server/security-v1-routes.ts`, `server/services/job-queue.ts`, `server/job-routes.ts`, `server/services/confidence-engine.ts`, `server/confidence-routes.ts`, `server/recommendation-routes.ts`, `server/inbox-routes.ts`, `server/middleware/tracing.ts`, `client/src/pages/inbox.tsx`, `client/src/pages/admin-ops.tsx`

## Phase 6: Activation & Signal Quality
Five workstreams to improve onboarding, daily usage, alert quality, import reliability, and security posture.

### New Tables
- `onboarding_progress` — per-user/tenant wizard state (currentStep, completedSteps, isComplete)
- `import_mapping_templates` — reusable CSV field mapping configs per tenant
- `alert_rules` extended with `impactLevel`, `persistentThresholdDays`, `recommendedActions` (jsonb), `ownerUserId`

### 1. Onboarding Wizard (Time-to-value < 5 min)
- 6-step guided wizard: Create Tenant → Add Location → Create 3 Starter KPIs → Create Scorecard → Run Scorecard → Enable Alert Rule
- Template-driven KPIs (Revenue, Customer Satisfaction, Labor Cost %) with pre-configured thresholds
- Auto-redirect for new users without tenants
- Completion routes to Owner Daily Brief
- Backend: `server/onboarding-routes.ts` (6 endpoints under /api/v1/onboarding/*)
- Frontend: `client/src/pages/onboarding.tsx`

### 2. Owner Daily Brief (New Home Experience)
- Replaces dashboard as default authenticated home (/)
- Hero card: overall score + band badge + trend vs prior period
- Top 3 Risks with severity badges and risk scores
- Top 3 Opportunities with impact scores + "Convert to Action"
- "Do This Next" actions with "Mark Done" buttons
- Empty states with clear CTAs
- Backend: `server/daily-brief-routes.ts` (GET /api/v1/tenants/:tenantId/daily-brief)
- Frontend: `client/src/pages/daily-brief.tsx`

### 3. Alert Noise Reduction + Actionability
- Persistent issue detection: same metric below threshold for X consecutive days → escalated severity alert
- Impact scoring: computed from severity weight + metric importance (low/medium/high)
- Recommended actions checklist on each alert (toggleable, from alert rule config)
- Owner assignment on alert rules and events
- Filter by impact level
- Backend: enhanced `server/admin-routes.ts` evaluation logic
- Frontend: enhanced `client/src/pages/admin-alerts.tsx`

### 4. Import Reliability + Data Confidence
- Pre-import CSV validation preview (dry-run): total/valid/warning/failed rows + quality score badge
- Reusable field mapping templates per tenant (save/load/delete)
- Post-import quality summary with % valid/warnings/failed + quality badge
- Backend: POST /api/admin/imports/validate, CRUD /api/admin/import-templates
- Frontend: enhanced `client/src/pages/admin-imports.tsx`

### 5. Security & Platform Hardening
- Security headers middleware: CSP, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy, HSTS
- Session expiration graceful UX: 401 detection → toast + redirect
- Backend: `server/middleware/security-headers.ts`
- Frontend: session-expired event listener in App.tsx

## Post-Phase 6: UX & Stability Polish

### Error Boundary
- React ErrorBoundary component wraps the authenticated router and landing page
- Page-level crashes are contained — other pages remain accessible via sidebar
- Fallback UI with error message, "Try Again" (resets boundary), and "Go Home" button
- File: `client/src/components/error-boundary.tsx`

### Page Consolidation (sidebar reduced from 27 → 25 items)
- **Activity Center** (`/admin/activity`): Merged former "Audit Log" and "Activity Log" into a single page with two tabs — "Tenant Activity" (scoped to selected tenant, entity type filter) and "System Activity" (global view with advanced filters, pagination)
- **Reporting Center** (`/admin/reports`): Merged former "Reports" and "Executive Reports" into a single page with two tabs — "Executive Summaries" (weekly intelligence reports with generate/view) and "Configurations" (report definitions CRUD, scheduler status)
- Deleted files: `admin-audit.tsx`, `admin-executive-reports.tsx`

### Theme-Aware Logo
- Reusable `Logo` component (`client/src/components/logo.tsx`) selects dark or light variant based on active theme
- Used in sidebar header, landing page nav/footer, onboarding header, and loading splash
- Assets: `XConsole_transparent.png` (white text, for dark mode), `XConsole_light_transparent.png` (black text, for light mode)

### API Hardening
- **Standardized response envelope**: All API routes use `ok(data)` and `err(code, message)` helpers. `routes.ts`, `phase5-routes.ts`, `admin-routes.ts`, `onboarding-routes.ts` all follow `{ok: true, data}` / `{ok: false, error: {code, message}}` format.
- **parseInt NaN guards**: `server/utils.ts` exports `parseIntOrThrow(value, paramName)` — throws `ValidationError` (400) on NaN. Applied across all route files (~100 occurrences).
- **Zod body validation**: All routes accepting `req.body` now validate with inline Zod schemas before processing. 19 routes across 4 files validated.

### Route-based Code Splitting
- All 30 page components in `App.tsx` use `React.lazy(() => import(...))` for on-demand loading
- `<Suspense fallback={<LoadingSkeleton />}>` wraps the router inside `<ErrorBoundary>`
- Pages load as separate chunks on first navigation, reducing initial bundle size

### Entity Lookup Hook
- `client/src/hooks/use-entity-lookup.ts` provides `resolveUser()`, `resolveTenant()`, `resolveLocation()`, `resolveMetric()` name resolvers
- Used across 6 admin pages to show human-readable names instead of raw IDs: data-quality, activity, tower, ops, security, alerts
- Also provides `users`, `tenants`, `locations`, `metrics` arrays for building dropdowns
- All admin ID text inputs replaced with searchable `<Select>` dropdowns (tower assign, alerts owner, activity actor filter, security force-logout/unlock)

### Bug Fixes
- **`getTenantUsersWithNames()` crash**: The `users` table has no `username` column — the query was referencing a non-existent column. Fixed to select `firstName`, `lastName`, `email` and derive a display name (e.g. "Admin User").
- **Bulk action status route shadowed**: `PUT /tenants/:tenantId/actions/bulk-status` was registered after `PUT /tenants/:tenantId/actions/:actionId` in `phase5-routes.ts`, causing Express to match "bulk-status" as the `:actionId` parameter. Moved `bulk-status` route before the parameterized route to fix.