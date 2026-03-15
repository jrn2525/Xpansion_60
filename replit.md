# Xpansion Console — Franchise Command Center

## Overview
Xpansion Console is a multi-tenant franchise management platform designed to empower franchise organizations with advanced tools for performance monitoring, strategic planning, and operational excellence. It offers robust features such as role-based access control, a comprehensive metrics engine with scorecards and trend analysis, CSV data import capabilities, and a sophisticated alert rules engine. The platform automates reporting, notifications, and workflow processes, providing an executive portfolio dashboard for high-level oversight, forecasting, and anomaly detection. Its core vision is to serve as a Growth Operating System, integrating weekly command center functionalities, action management, goal setting, benchmarking, playbooks, and executive digests. Ultimately, Xpansion Console aims to deliver Intelligence + Automation at Scale through predictive risk engines, autonomous weekly planning, playbook effectiveness analytics, and executive narrative reports, enabling franchises to achieve sustainable growth and operational efficiency.

## Project Roadmap
- **Phase A — Onboarding Wizard**: COMPLETE. 6-step client onboarding (profile, business, corporate structure, first location, KPIs, targets). Welcome email via Resend. mustChangePassword flow. Persistent progress.
- **Phase B — Role-Based Experience**: COMPLETE. Client vs consultant sidebar + home pages. Client Home dashboard, Consultant Clients overview, My Business page, Client Settings page. Route guards. lastLoginAt tracking. Corporate structure step (umbrella/holding company + subsidiaries, or multiple locations for standalone businesses).
- **Phase C — Data Entry & Metrics**: COMPLETE. Enter Data page (`/enter-data`) with period navigation, bulk upsert, target comparison (threshold-based band feedback per metric), and data completeness tracking. My Scorecard page (`/my-scorecard`) with frequency-aware period navigation (matches client's tracking frequency), period-filtered score display, auto-scorecard creation, score calculation, score trend chart (Recharts area chart with band-colored dots), and score history. Client Home updated with Latest Score stat (with band badge), This Period completeness stat (X/Y KPIs filled), data freshness indicator, "Enter your first numbers" checklist item, and data-aware CTAs. Shared period utility extracted to `client/src/lib/period-utils.ts`.
- **Phase D — Operational Tools**: COMPLETE. All five operational tools wired into client sidebar: Daily Brief (`/brief`), Actions (`/actions`), Goals (`/goals`), Playbooks (`/playbooks`), Weekly Plans (`/weekly-plans`). Client-centric playbook experience: consultant creates/applies playbooks → client sees assigned playbooks with step-by-step completion, progress tracking, auto-complete when all steps done. Schema extended with `completedSteps` integer[] and `completedAt` on `playbook_applications`. New routes: `GET /playbook-assignments` (enriched with playbook+steps), `PATCH /playbook-assignments/:id/steps` (toggle completion). Client Home enhanced with operational widgets: quick actions (overdue count + upcoming 3), goals summary with status badges, playbook progress bars.
- **Phase E — Integrations**: IN PROGRESS. Integrations Hub (`/integrations`) serves as landing page with Import Wizard and API Integration Wizard entry points, plus active integrations list with pause/resume/delete. **Import Wizard** (`/integrations/import`): 5-step flow (Upload → Map Columns → Destination → Review → Results) with smart column auto-detection, row-based and column-per-metric mapping modes, saved mapping templates, and overwrite warnings. **API Integration Wizard** (`/integrations/api`): 6-step flow (Choose Type → Name & Configure → Credentials → Map Fields → Schedule & Location → Test & Activate) supporting REST API, Webhook, External Database, and CSV/JSON Feed types. Schema: `tenant_integrations` (config, credentials, field mapping, sync schedule, status) + `integration_sync_logs` (per-sync audit trail). Security: credentials never returned in GET responses; locationId validated against tenant on create/update. File import engine (CSV + Excel .xlsx/.xls) via `server/services/file-parser.ts` using `xlsx` package. Endpoints: `POST /import-preview` (file analysis + suggested mappings), `POST /import-execute` (validated import with column mapping), CRUD for integrations, test connection, sync logs.
- **Phase F — Intelligence & Automation**: Predictive risk scoring, automated weekly planning, coaching summaries, anomaly detection, executive narrative reports.

## User Preferences
I want to prioritize a clear and consistent architecture. Avoid introducing new patterns unless absolutely necessary. Focus on delivering high-quality, maintainable code. I prefer detailed explanations for complex logic. Do not make changes to files within the `server/replit_integrations/` folder.

## System Architecture
The platform is built with a modern web stack, featuring a React, TypeScript, Vite, Tailwind, and shadcn frontend, and a Node, Express, TypeScript, Drizzle ORM, and PostgreSQL backend. Authentication uses email/password login for all users (POST /api/auth/login), with Replit Auth (OIDC) backend routes preserved but not exposed in the UI. The sign-in page (`client/src/pages/landing.tsx`) is a clean centered card with email/password form.

The app follows a **client-centric** design where the sidebar and home page adapt based on user role. **Clients** (non-superadmin) see a simplified nav: Home, My Business, Locations, Metrics, Scorecards, Trends, Actions, Goals, Settings. **Consultants/admins** (superadmin) see the full nav with Clients overview, Dashboard, Command Center, Portfolio, Tenants, plus Operations and Admin groups. The tenant selector is hidden for clients. Route guarding: `/clients` redirects non-superadmins to `/`.

Key pages: Client Home (`client/src/pages/client-home.tsx`) shows welcome greeting, quick stats, getting started checklist, locations and KPIs overview. Consultant Clients (`client/src/pages/consultant-clients.tsx`) shows all clients with status (invited/onboarding/active), onboarding progress bars, attention flags, search, and quick-create. My Business (`client/src/pages/my-business.tsx`) lets clients edit business name/industry, view locations and KPIs. Client Settings (`client/src/pages/client-settings.tsx`) has profile editing and password change.

Superadmins can create client accounts via the Clients page or User Management page (`/admin/users`). New users receive a branded welcome email via Resend. Users table includes `mustChangePassword` (boolean), `phone`, `jobTitle`, `lastLoginAt` fields. Login updates `lastLoginAt`. New users are flagged with `mustChangePassword: true` and routed to the onboarding wizard on first login. The onboarding wizard (`client/src/pages/onboarding.tsx`) is a 6-step client-centric flow: (1) Complete Profile + change password, (2) Set Up Business (name + industry), (3) Company Structure (umbrella/holding company, subsidiaries), (4) Add First Location, (5) Choose KPIs, (6) Set Targets & Frequency. The Company Structure step asks if the client has an umbrella or holding company; if yes, they specify the type, parent company name, and enter details for each subsidiary/location. Progress is persisted in the `onboarding_progress` table with `savedData` (JSONB).

Backend routes: PUT /api/auth/change-password, PUT /api/auth/profile, GET/PUT /api/v1/onboarding/progress, GET /api/admin/clients. Security measures include session fixation prevention, rate limiting, brute-force lockout, and audit logging. Data validation is handled via Zod. Notifications leverage Resend for email and Slack webhooks, with built-in retry mechanisms. A `setInterval`-based execution engine manages scheduled tasks with job locking for reliability.

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
- **API envelope unwrapping**: Default `queryFn` in `queryClient.ts` now auto-unwraps `{ok: true, data: ...}` envelopes, returning `data` directly to components. This fixes silent data access failures across all `useQuery` calls after the API hardening standardized response formats.

## Phase 7: Client Experience Enhancements

### New Tables
- `user_preferences` — per-user settings (pinned pages, keyboard shortcuts enabled)
- `user_notifications` — in-app notification feed per user/tenant with type, title, message, link, read state

### 1. Global Command Palette (Cmd+K)
- Opens with `Cmd+K` (Mac) / `Ctrl+K` (Windows)
- Search across: all 28 pages, tenants (switch directly), locations, quick actions
- Search button with `⌘K` hint in the header bar
- File: `client/src/components/command-palette.tsx`

### 2. In-App Notification Bell
- Bell icon in header with unread count badge (red dot, caps at 99+)
- Popover dropdown with recent notifications (type icon, title, message, time ago)
- Click navigates to link and marks as read; "Mark all read" button
- Polls every 30 seconds; auto-creates notifications when alerts fire or reports complete
- Files: `client/src/components/notification-bell.tsx`, `server/services/notifications.ts`

### 3. PDF/CSV Export
- `exportToCSV(data, columns, filename)` — generates CSV with proper escaping
- `exportToPDF(elementId, filename)` — captures DOM element as multi-page PDF using html2canvas + jsPDF
- Export buttons on: Daily Brief (PDF), Scorecards (CSV), Actions (CSV), Reports (PDF), Metrics (CSV)
- File: `client/src/lib/export-utils.ts`, 5 page files

### 4. Favorites / Pinned Pages
- "Favorites" group at top of sidebar showing pinned pages with their original icons
- Star icon on hover for every sidebar item to pin/unpin
- Persists to `user_preferences.pinnedPages` via API with optimistic updates
- Files: `client/src/hooks/use-preferences.ts`, `client/src/components/app-sidebar.tsx`

### 5. Keyboard Shortcuts
- Two-key sequences: `g→d` Dashboard, `g→b` Brief, `g→a` Actions, `g→i` Inbox, `g→s` Scorecards, `n→a` New Action
- `?` toggles shortcuts help dialog with enable/disable toggle
- Respects `keyboardShortcutsEnabled` from user preferences
- Files: `client/src/hooks/use-keyboard-shortcuts.ts`, `client/src/components/shortcuts-dialog.tsx`

### 6. Progressive Web App (PWA)
- Web app manifest with brand name, colors, and SVG icons (192x192, 512x512)
- Service worker: cache-first for static assets, network-first for API, offline fallback page
- Apple mobile web app meta tags for iOS install
- Files: `client/public/manifest.json`, `client/public/sw.js`, `client/public/offline.html`, `client/index.html`, `client/src/main.tsx`

### API Routes Added
- `GET /api/user/preferences` — get current user's preferences (auto-creates default row)
- `PUT /api/user/preferences` — update pinned pages and shortcuts setting
- `GET /api/notifications?tenantId=X` — list notifications with unread count
- `POST /api/notifications/:id/read` — mark single notification as read
- `POST /api/notifications/read-all` — mark all notifications as read for tenant

## Phase 8: Client-Focused Platform Enhancements

### Schema Changes
- `tenants` table: added `logoUrl` (varchar, nullable) and `accentColor` (varchar(7), nullable) for per-tenant branding
- `GET /api/tenants` now includes the user's `role` per tenant (joined from `tenant_users`)

### 1. White-Label / Client Branding
- Per-tenant `logoUrl` and `accentColor` stored in the tenants table
- Sidebar header dynamically shows tenant logo (if set) instead of Xpansion logo
- `accentColor` overrides `--primary` CSS variable at runtime for per-tenant theming
- Branding settings page (`/admin/branding`) with logo URL input, color picker, preview, and reset
- Files: `client/src/hooks/use-tenant-branding.ts`, `client/src/pages/tenant-branding.tsx`

### 2. Role-Based View Simplification
- Each sidebar nav item has a `visibleTo` property (viewer, manager, admin, owner)
- Client-facing pages (Dashboard, Locations, Metrics, Scorecards, etc.) visible to all roles
- Admin pages (Imports, Alerts, Reports, Security, etc.) visible only to admin/owner
- Command Tower visible only to superadmins
- `filterItemsByRole()` function filters sidebar items + favorites based on user's tenant role
- Viewers/managers see a clean, focused sidebar; admins/owners see everything

### 3. Scheduled Email Digests via Resend
- `RESEND_API_KEY` environment secret configured
- `sendEmail()` in `server/services/notifications.ts` uses Resend API for real delivery
- Scheduler runs `runScheduledDigests` every 60s checking tenant digest schedules
- Weekly coaching summaries with wins, risks, and next steps auto-generated per tenant

### 4. Superadmin Client Health Dashboard
- New `GET /api/superadmin/tower/health` endpoint with per-tenant engagement metrics
- Health cards showing: active users (7d), actions created this week, last activity, data freshness
- Status indicators: Active (green), Going Quiet (yellow), Inactive (red)
- Quick-switch buttons to jump directly into any tenant's dashboard
- Files: `server/intelligence-routes.ts`, `client/src/pages/superadmin-tower.tsx`

### 5. Mobile-First Daily Brief
- 44px minimum touch targets for all interactive elements
- Swipe-friendly horizontal card scroll for risks/opportunities/actions on mobile
- Simplified card content on mobile (secondary details hidden)
- Full-width action buttons on mobile
- Responsive padding and typography scaling
- Files: `client/src/pages/daily-brief.tsx`