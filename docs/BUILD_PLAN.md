# Plan: Turn Xpansion Console into Xpansion 60 (12-Week Coaching App)

## Context

The current repo (`Xpansion_60`) is a sophisticated multi-tenant **franchise / business-intelligence platform** built on Replit — scorecards, KPIs, alerts, forecasts, anomalies, executive digests, the works. The infrastructure is excellent (React + TypeScript + Express + PostgreSQL + Drizzle ORM + Passport auth + Resend email + a real admin console), but most of the *features* aren't a fit for a coaching app.

The new product is **Xpansion 60** — a 12-week / 60-weekday coaching app (the "60" = 60 weekdays = 12 × 5):

- Admin (you) builds **program templates**. Each template is 60 tasks (12 weeks × 5 weekdays), optionally organized into named **sections**.
- Clients are enrolled in a template with a personal start date.
- Each weekday the client gets one bite-size task — by email and on their dashboard.
- Clients can only see today's task and previously-completed tasks (no skipping ahead).
- After every 5 completed tasks (one week), a **weekly summary report** is generated.
- The app moves off Replit and onto **Railway** (app + Postgres in one place).

**The full year journey:** 4 phases × 12 weeks each + 1-week break between phases = **51 weeks (~1 year)**.
- Phase 1 → 1-week break → Phase 2 → 1-week break → Phase 3 → 1-week break → Phase 4
- Every phase follows the same Xpansion 60 cadence (60 weekdays, optionally split into sections)
- Phase 1 is "The 4 Basics"; phases 2-4 are TBD

**Phase 1 — "The 4 Basics":** 60 weekdays, broken into 4 sections of 15 weekdays each:
1. **Greeting** — weekdays 1-15 (weeks 1-3)
2. **Educate** — weekdays 16-30 (weeks 4-6)
3. **Process** — weekdays 31-45 (weeks 7-9)
4. **Close** — weekdays 46-60 (weeks 10-12)

**Scope of v1:** ship Phase 1 ("The 4 Basics") end-to-end. The data model below supports phases 2-4 without schema changes — admin will simply create 3 more program templates and enroll each client in them in sequence. A lightweight "journey" wrapper that automates the chaining + break weeks is called out as a v2 add-on (see section 10).

We're going to **reuse the bones** — auth, admin UI, email, the playbooks/actions data model — and strip out the BI surface area. This is much faster than starting fresh, and it's the explicit direction you chose.

## Guiding Principle: Admin-Editable Everything

**Nothing that's "content" should live in source code.** Anything you might reasonably want to change without a developer — copy, email templates, prompts, schedule times, durations, toggles, branding — gets stored in the database and edited from the admin console.

Practically, this means:
- Every customer-facing string the client reads (other than the React UI chrome itself — buttons like "Save", form labels) is database-driven with a sensible shipped default.
- Every email (subject + body + from name) is a database row with `enabled`/`subject`/`body` columns, edited via a single admin **Messaging** screen.
- Every duration, number-of-X, and on/off toggle (program length in weeks/weekdays, whether feedback is required to mark complete, whether reflection is required, send times, pause limits) is a database setting.
- Defaults ship in the seed migration so a fresh install works out of the box.

This is an architectural commitment that affects every later section — schema additions, admin pages, and the cron/email logic all assume "values come from the database, not constants in code."

---

## 1. Hosting

**Recommendation: Railway for everything.** (You're already on Railway Pro — resource ceilings are vastly more than this app will use.)

- App: Railway service running `npm run build && npm start` (Node 20, single Express server serves the React SPA from `dist/public` and the API)
- Database: Railway PostgreSQL plugin → `DATABASE_URL` injected as an env var
- Email: keep Resend (already integrated). Add `RESEND_API_KEY` as a Railway env var
- Custom domain: **www.xpansion60.com** — point at the Railway service via CNAME, with the apex (`xpansion60.com`) redirecting to www. Railway handles TLS automatically.

### Railway project setup

- **New, separate Railway project** for Xpansion 60 — not a new service inside the existing project. Keeps billing, logs, env vars, and permissions cleanly isolated from your other Railway work.
- **Two environments from day one: `production` and `staging`.** Railway makes this cheap. Lets us test schema migrations, new email crons, and Phase 2 changes against a real Postgres without risking real client data. Each environment gets its own Postgres instance — `DATABASE_URL` is per-environment, never shared.
- `staging` runs on minimal resources; `production` scales as client count grows.
- Auto-deploy on push: `staging` deploys from the working branch, `production` deploys from `main` (or a `release` branch) only after staging is verified.

**Why not Vercel + Neon / Render / Fly?** This app serves the frontend and backend from the same Express process — splitting them adds work for no gain. You already have a Railway account. One platform, one bill, one place to look at logs.

**Other env vars to set on Railway:** `SESSION_SECRET` (generate a new one), `NODE_ENV=production`, `PORT` (Railway sets this automatically), `ADMIN_EMAIL` + `ADMIN_PASSWORD` for the first-run admin seed, and — critically — **`APP_URL=https://www.xpansion60.com`** from day one.

### Domain-First Rule

The domain (`www.xpansion60.com`) gets wired up **at step 1, before any new code is written** — not at the end. Adding a domain late is a small task that turns into a painful sweep through email templates, seed data, cookie configs, and CORS rules to flush out hardcoded preview URLs.

Concrete commitments:
- **`APP_URL` env var** points at `https://www.xpansion60.com` from the first Railway deploy. *All* URL generation in code reads from `APP_URL` — never hardcoded, never inferred from the request host. Email links, password reset URLs, CTAs, anything client-facing.
- **Resend sender** is `coaching@xpansion60.com` (or similar) from day one — verified at the domain, with SPF/DKIM/DMARC in place. Reputation builds on the right domain from the start. (Editable later from admin Settings, but the seeded default is the real address.)
- **Session cookie domain** left undefined (defaults to current host) until cutover, then set to `xpansion60.com` so it works for both `www.` and the apex.
- **CORS / allowed origins** configured against `https://www.xpansion60.com` from day one.
- **Seed data URLs** use `APP_URL` interpolation, never literal strings. Welcome emails, the next-phase CTA, anything else that ships in the seed migration.

**Resend domain setup:** verify `xpansion60.com` in Resend at step 1, add the SPF/DKIM/DMARC DNS records. DNS propagation can take hours — doing it alongside the Railway lift-and-shift means emails are ready when we get to step 8.

---

## 2. Migration Off Replit

Three concrete touchpoints — none are large:

1. **Remove Replit Vite plugins** in `vite.config.ts` (lines ~10-20) and from `package.json` devDependencies:
   - `@replit/vite-plugin-cartographer`
   - `@replit/vite-plugin-dev-banner`
   - `@replit/vite-plugin-runtime-error-modal`
2. **Delete `.replit`** config file and `replit.md`
3. **Remove Replit OIDC auth** — delete `server/replit_integrations/auth/replitAuth.ts` and any imports of it. The email/password login (Passport local strategy with bcrypt + Postgres session store) already exists and is what we'll keep using. The Replit OIDC code is the only auth piece that's Replit-specific; removing it is mostly deletion, not rewriting.

---

## 3. Data Model — Repurpose, Don't Rebuild

The existing schema in `shared/schema.ts` maps cleanly onto coaching concepts. The plan is **rename in UI / add a few columns**, not a new schema.

### Mapping

| Coaching concept | Existing table | Notes |
|---|---|---|
| Program template (12 weeks of tasks) | `playbooks` | Rename in UI as "Programs" |
| Task within a program | `playbookSteps` | Need new columns: `weekNumber` (1-12), `dayNumber` (1-5), `task_text` (the **Task**), `implementation_text` (the **Implementation** — example/suggestion), and optional `mediaUrl` |
| Client enrollment in a program | `playbookApplications` | Need to add an explicit `startDate` column (currently relies on `createdAt`) |
| Per-task completion + client feedback | `actions` | One `action` row created per (enrollment, step) when the task unlocks. Need new column `feedback_text` (the **Feedback** — what happened when the client implemented it). `status='closed'` + `completedAt` marks done. `feedback_text` is **required** to mark complete. |
| Coaching business (you) | `tenants` | Multi-tenant model stays — lets you support more than one coach later for free |
| Coach + clients | `tenantUsers` | `role='admin'` for you, `role='viewer'` (or new `role='client'`) for clients |

### Schema additions (Drizzle migration)

- `playbooks`: add per-program configurable fields — `total_weeks INT NOT NULL DEFAULT 12`, `total_weekdays INT NOT NULL DEFAULT 60`, `feedback_required BOOLEAN NOT NULL DEFAULT true`, `reflection_required BOOLEAN NOT NULL DEFAULT false`, `reflection_prompt TEXT NOT NULL DEFAULT 'Reflecting back on this week, what is your biggest takeaway?'`, `completion_message TEXT NOT NULL` (the "you're done with phase X" celebration copy), `cta_label TEXT NULL`, `cta_url TEXT NULL` (the next-phase CTA button). Lets future programs be different lengths or have different requirements without touching code.
- `playbookSteps`: add `week_number INT NOT NULL`, `day_number INT NOT NULL` (1-5), `task_text TEXT NOT NULL`, `implementation_text TEXT NOT NULL`, `media_url TEXT NULL`, and `section_id INT NULL` (FK → `playbookSections` below)
- **New table** `playbookSections`: `id`, `playbookId` (FK → `playbooks`), `order` (1..N), `name` (e.g., "Greeting", "Educate"), `start_day` (1..60), `end_day` (1..60), `transition_email_enabled BOOLEAN DEFAULT false`, `transition_email_subject TEXT NULL`, `transition_email_body TEXT NULL`. For "The 4 Basics" this seeds as 4 rows: (1, Greeting, 1, 15), (2, Educate, 16, 30), (3, Process, 31, 45), (4, Close, 46, 60). Different programs can have different section structures (or none). The transition email fires the morning after `end_day` for that section is completed by the client (default off; admin enables per section and writes the subject/body).
- **New table** `week_encouragements`: `id`, `playbook_id` (FK → `playbooks`), `week_number` (1-12), `enabled BOOLEAN DEFAULT true`, `subject TEXT NOT NULL`, `body TEXT NOT NULL`. Drives the Sunday encouragement email. Seeded with 12 generic default messages per program; admin can edit or disable any of them per program.
- `playbookApplications`: add `start_date DATE NOT NULL`
- `actions`: add `feedback_text TEXT NULL` (required at completion time but nullable while the task is still open)
- **New table** `weekly_summaries`: `id`, `enrollment_id` (FK → `playbookApplications`), `week_number` (1-12), `generated_at`, `summary_text` (the narrative recap), `reflection_text TEXT NULL` (the client's "biggest takeaway" answer), `created_at`. Unique on (`enrollment_id`, `week_number`).
- **New table** `phase_summaries`: `id`, `enrollment_id`, `generated_at`, `summary_text` (the long-form end-of-60-days report), `created_at`. Unique on `enrollment_id`.
- **New table** `enrollment_pauses`: `id`, `enrollment_id`, `pause_start DATE`, `pause_end DATE` (nullable for open-ended), `reason TEXT NULL`, `created_by_user_id`, `created_at`. Multiple rows per enrollment allowed (audit trail of every pause).
- **New table** `email_templates`: `id`, `tenantId`, `key VARCHAR` (e.g., `'daily_task'`, `'weekly_summary'`, `'phase_completion'`, `'welcome'`, `'password_reset'`, `'pause_notification'`), `enabled BOOLEAN NOT NULL DEFAULT true`, `subject TEXT NOT NULL`, `body TEXT NOT NULL` (supports `{{placeholder}}` substitutions like `{{client_first_name}}`, `{{task_title}}`, `{{dashboard_url}}`), `updated_at`. Unique on (`tenantId`, `key`). Seeded with sensible defaults; every email the app sends pulls from here.
- **New table** `app_settings`: `id`, `tenantId`, `key VARCHAR`, `value TEXT` (JSON-encoded for non-strings), `updated_at`. Unique on (`tenantId`, `key`). Stores config like email send times (`daily_send_time`, `saturday_send_time`, `sunday_send_time`), `email_from_name`, `email_from_address`, `app_display_name`, default pause-duration options, weekend placeholder copy, paused placeholder copy, etc. Seeded with defaults.
- (Optional) `tenantUsers.role` accepts `'client'` as a new value — or we keep `viewer` and just call it client in the UI

### Dead weight to drop or ignore

These tables/columns exist but won't be touched by the coaching surface; we leave the tables in place initially (safer than dropping in one go) and remove the routes/UI that expose them:

- All BI tables: `metricDefinitions`, `metricValues`, `metricThresholds`, `scorecardTemplates`, `scoreRuns`, `metricForecasts`, `metricAnomalies`, `riskSnapshots`, `opportunities`, `campaigns`, `goals`, `digests`, `weeklyPlans`, `weeklyPlanItems`
- `locations` — single-coach product, no concept of locations
- `metric_definition_id` foreign keys on `actions`, `playbookSteps`, `weeklyPlanItems` — leave nullable, ignore
- Alert/notification engine (`alertRules`, `alertEvents`) — keep `notificationSettings` + `notificationDeliveries` for the email reminder pipeline, drop the alert rules engine UI

A follow-up cleanup pass (once we're confident nothing in the new app reads them) can drop the unused tables in a second migration.

---

## 4. Admin Side (you)

Keep and lightly relabel:
- `client/src/pages/admin/users.tsx` → **Clients** (create client, send invite, reset password)
- `client/src/pages/admin/notifications.tsx` → reuse for "daily reminder" email settings
- `client/src/pages/admin/activity.tsx` → audit log (already works)
- `server/admin-routes.ts` — keep the user-management endpoints, remove the BI-admin endpoints

Build new:
- **Programs** page: list program templates, create new, edit. Each template is a name + description + an ordered list of **sections** + a grid of tasks grouped by section. Cell-level fields: **Task** (`task_text`), **Implementation** (`implementation_text`), optional `media_url`. Program-level settings panel exposes everything from the `playbooks` row: total weeks/weekdays, feedback required toggle, reflection required toggle, reflection prompt text, completion message, next-phase CTA label + URL.
  - **Seed:** ship "The 4 Basics" template (sections: Greeting, Educate, Process, Close) so you can start enrolling clients on day 1 without authoring all 60 tasks from scratch. Seed leaves task_text/implementation_text blank for you to fill via UI.
- **Enrollments** page: assign client to program, pick start date, view progress (X of 60 tasks complete, current week, current section, any active pause). Read reflections + feedback inline. Includes a **Pause** action: dialog where admin picks a pause duration (presets from `app_settings`, or custom date range) — writes a row to `enrollment_pauses`. "Today's task" computation subtracts pause days. Un-pausing is automatic at `pause_end` or admin can end it manually.
- **Messaging** page (top-level admin nav, *plus* a tab inside each program for per-program overrides):
  - *Global email templates* — one row per `email_templates.key`. Enabled toggle + Subject + Body, with a placeholder reference panel ("Available variables: `{{client_first_name}}`, `{{task_title}}`...").
  - *Program: Sunday encouragements* — 12 rows (one per week), enabled toggle + Subject + Body. Pre-populated with shipped defaults.
  - *Program: Section transition emails* — N rows (one per section), enabled toggle (default off) + Subject + Body.
- **Settings** page (top-level admin nav): edit anything in `app_settings` — send times for each daily email, from name/address, app display name, weekend/paused/completion placeholder copy, default pause-duration presets. Sensible defaults shipped; every value is editable.
- **Preview / test-send buttons** on the Messaging and Settings pages: render the email with sample data + a "Send to my email" button so you can verify changes before clients see them.
- **Import / Export** for program content (built into the Programs page):
  - **Export full phase (JSON):** lossless export of a whole program template — program-level settings (weeks/weekdays/feedback rules/reflection prompt/completion message/CTA), all sections, all 60 tasks, and all per-program messaging (Sunday encouragements + section transition emails). Use for backups, sharing a phase with someone else, or wholesale rewriting offline.
  - **Export tasks (CSV / XLSX):** the day grid as a spreadsheet — one row per day with columns: `week_number`, `day_number`, `section_name`, `task_text`, `implementation_text`, `media_url`. Designed for editing 60 tasks in Excel/Sheets quickly.
  - **Import full phase (JSON):** upload a JSON file → admin chooses Create New (makes a brand new program) or Replace Existing (overwrites a chosen program in place). Validation: confirms structure, shows a diff preview before commit.
  - **Import tasks (CSV / XLSX):** upload a spreadsheet → matched against the existing program by `(week_number, day_number)`. Admin chooses Update existing rows / Insert missing / Both. Shows a diff preview before commit. This is the "update without manually editing each one" path you asked for.
  - **Per-day import/export (small):** on the individual task editor, a "Copy as JSON" / "Paste JSON to replace" pair for moving a single day's content between programs quickly.
  - Reuses the existing app's CSV/Excel infrastructure (`xlsx` library + multer file upload + the column-mapping UI in `client/src/pages/admin/imports.tsx`). New code is the JSON serializer/parser and the per-program endpoints; the file-handling plumbing already exists.

The rich-text editor — we should check whether the existing app already has one (it likely uses something for `description` fields on actions/playbooks). If yes, reuse. If no, add a lightweight one like Tiptap.

---

## 5. Client Side

A drastically simplified version of the existing client UI:

- **Login** — reuse the existing email/password flow
- **Today** (home/dashboard) — three stacked sections that the client works through top-to-bottom:
  1. **Task** — admin-defined, read-only. The bite-size thing to do today (`playbookSteps.task_text`).
  2. **Implementation** — admin-defined, read-only. A suggestion or example of *how* to do the task (`playbookSteps.implementation_text`). Optional `media_url` renders here if set.
  3. **Feedback** — required textarea the client fills in: what happened when they did it. Saves to `actions.feedback_text`.

  The **"Mark complete"** button is disabled until all three sections are present — specifically, the Feedback textarea must be non-empty (the first two are admin-defined and always present). On submit: `status='closed'`, `completedAt=now()`, `feedback_text=<textarea value>`.

  **Weekend / non-task days:**
  - **Saturday (day 6):** weekly summary report + **reflection prompt** — "Reflecting back on this week, what is your biggest takeaway?" Single textarea. Saves to `weekly_summaries.reflection_text`. Optional but encouraged.
  - **Sunday (day 7):** **encouragement screen** — a short motivational message previewing the upcoming week and (when applicable) the upcoming section. Also goes out as a Sunday-evening email so the client starts Monday in the right headspace.
  - **Before start date / during pause / after day 60:** friendly placeholder ("Your program starts MM/DD" / "Paused until MM/DD" / "You've completed Phase 1 — see your phase summary").
- **History** — list of past completed tasks, grouped first by **section** (e.g., "Greeting (Days 1-15)") and within each section by week. Each entry shows all three pieces (Task, Implementation, the client's Feedback) read-only. When a week has all 5 tasks completed, the **weekly summary report** appears at the top of that week's group. Today's view also displays the current section name as a header ("Section 2 of 4: Educate") so the client always knows where they are in the program.
- **Profile** — change password, log out.

Hide everything else. The existing sidebar (`Home, My Business, Locations, Metrics, Scorecards, Trends, Actions, Goals, Settings`) gets replaced with `Today, History, Profile`.

### Task unlocking logic

When the client opens "Today":
1. Compute `daysSinceStart = today − enrollment.startDate`
2. Skip weekends — only Mon-Fri count toward progress
3. `weekNumber = floor(weekdayIndex / 5) + 1`, `dayNumber = (weekdayIndex % 5) + 1`
4. Fetch the matching `playbookStep` for the client's program
5. If no `action` row exists yet for (enrollment, step), create one with `status='open'`
6. Render it

"History" queries `actions WHERE enrollment_id = X AND status='closed' ORDER BY completedAt DESC`.

---

## 5b. Weekly Summary Reports & Reflection

When the client completes the 5th task of a given week (i.e., the row in `actions` that flips the last unchecked weekday for `week_number = N` to `status='closed'`), the app generates a **weekly summary report** for that enrollment+week combination.

**Trigger:** server-side, inside the "mark task complete" endpoint. After saving the action, count completed actions for this enrollment in this week. If count == 5 and no row in `weekly_summaries` exists for (enrollment, week), generate one.

**What the summary contains** (v1 — deterministic, no LLM):
- Week number + date range + section name (if any)
- A recap section for each of the 5 days: the Task title, a short snippet of the client's Feedback
- An aggregated "what you said" section pulling key feedback text together
- The client's **reflection answer** (added when they fill it in on Saturday)
- A "next week preview" pointing to week N+1 (if N < 12)

**Optional v2 (LLM-generated narrative):** the same data piped through an LLM to produce a coach-tone reflection. Behind a feature flag — easy to add later, not needed for launch. (No new dependency in v1.)

**Where it shows up:**
- Client: appears at the top of that week's group in **History** the moment it's generated, with a "Week N complete" banner on Today the next time they log in. The reflection prompt appears on Saturday's view.
- Admin: visible on the client's enrollment detail page so you can review their week (and read their reflection) before the next coaching touchpoint.
- Optional v2: emailed to both client and admin Monday morning.

The existing `digests` table is conceptually similar but tenant-scoped (executive summaries across the whole BI). Cleaner to add a separate, enrollment-scoped `weekly_summaries` table than to overload it.

---

## 5c. End-of-Phase Summary & Next-Phase CTA

When the client marks the 60th task complete, the app generates a **phase summary report** (`phase_summaries` row) and the Today/History views show a "Phase 1 Complete" celebration screen.

**Phase summary contents** (v1):
- Phase name ("The 4 Basics") + total date range
- Per-section recap: completion stats, the 3-5 most substantive feedback excerpts, the client's reflection takeaways
- Aggregated "themes" pulled from across all 12 weekly summaries
- A **CTA panel advertising the next phase** with a "Start Phase 2" button — when Phase 2 exists. For now (v1) the CTA is a simple "Phase 2 is coming — we'll be in touch" placeholder.
- Also delivered as an email with the same content + CTA.

**Where it shows up:** on Today (replaces the daily task view) and as the top entry in History.

---

## 6. Daily Email Reminders & Sunday Encouragement

Reuse Resend + the existing `notificationDeliveries` table for the audit trail. One scheduler handles four weekly email touchpoints (plus one event-driven email):

- **Mon-Fri morning:** for each active enrollment (not paused, within day 1-60), compute today's task and send an email with the Task title, the Implementation snippet, and a link to the dashboard.
- **Saturday morning:** for each enrollment that completed all 5 tasks of the prior week, send the weekly summary email + a link to fill in the reflection prompt.
- **Sunday evening (day 7 — encouragement):** for each active enrollment, send the matching row from `week_encouragements` (where `week_number` = the upcoming week) if `enabled = true`. Admin-edited content per week per program.
- **Section transition (event-driven, sent next morning after section's last task is completed):** for each enrollment that just finished a section, if that section's `transition_email_enabled = true`, send `transition_email_subject` + `transition_email_body`. Default off — admin toggles on per section and writes content.
- **End-of-Phase (event-driven, after day 60 completion):** the phase-summary email + next-phase CTA (section 5c).

Implementation: a single `node-cron` setup in `server/cron.ts` for the scheduled jobs + inline triggers inside the "mark task complete" endpoint for the event-driven emails. Each handler iterates active enrollments, respects `enrollment_pauses` (skips during a pause), and logs each send to `notificationDeliveries`.

The existing app already has a job-queue system (`jobQueue`, `jobRuns`) — overkill for these crons. We can use the simpler `node-cron` route initially and graduate to the queue if reliability becomes an issue.

---

## 7. Critical Files to Modify

Order roughly matches implementation order:

- `package.json`, `vite.config.ts` — drop Replit plugins
- `.replit`, `replit.md`, `server/replit_integrations/auth/replitAuth.ts` — delete
- `shared/schema.ts` — add the 3 columns above (week_number, day_number, media_url, start_date)
- `migrations/` — new Drizzle migration for the schema additions
- `server/routes/` — new `coaching-routes.ts` for `/api/programs`, `/api/enrollments`, `/api/today`, `/api/complete-task`. Remove or gate off `phase5-routes.ts`, `intelligence-routes.ts` (BI routes)
- `client/src/App.tsx` (routing) and the sidebar component — strip BI routes, add `Today`/`History`
- `client/src/pages/` — new `today.tsx`, `history.tsx`, admin `programs.tsx`, admin `enrollments.tsx`. Delete or hide existing BI pages.
- `server/index.ts` — register the cron job for daily reminders (or a new `server/cron.ts`)

We do **not** need to touch: Drizzle config, the auth stack (apart from removing OIDC), the session store, the admin user CRUD, Resend integration, the build pipeline.

---

## 8. Build Strategy & Phasing

**Guiding principle: subtract before adding. Prove the riskiest step first. Don't refactor along the way.**

The biggest risk in retrofitting someone else's app isn't quality — it's scope. Every touched file tempts a rabbit hole. The order below is designed so each step has one clear goal, is independently deployable, and either succeeds clearly or fails clearly.

### Build steps (in order)

1. **Lift-and-shift to Railway as-is, with the domain wired up from day one.** Get the *current* Xpansion Console running on Railway with Railway Postgres, a fresh `SESSION_SECRET`, an admin user seeded, and confirm login works. Remove `@replit/*` Vite plugins, delete `.replit`, delete `server/replit_integrations/auth/replitAuth.ts`. **In the same step:** add the Railway custom-domain CNAME for `www.xpansion60.com`, set `APP_URL=https://www.xpansion60.com`, kick off Resend domain verification (SPF/DKIM/DMARC) for `xpansion60.com`, and confirm the site loads at the real URL. Don't move past step 1 until login + DNS + email-sender domain are all green at the real domain. This is the highest-risk single step — proving it works first (with the real domain) eliminates a class of "did my new code break it?" / "where did this preview URL come from?" confusion later.

2. **Subtract: hide the BI surface area.** Delete or hide BI routes, pages, and sidebar items (scorecards, metrics, alerts, forecasts, locations, etc.). *Hide* in the UI rather than *drop* from the database — the tables stay until the final cleanup pass. App still boots and logs in; mental surface is much smaller.

3. **Schema migration — all coaching additions in one shot.** New columns on `playbooks` / `playbookSteps` / `playbookApplications` / `actions`, plus the new tables (`playbookSections`, `weekly_summaries`, `phase_summaries`, `enrollment_pauses`, `email_templates`, `app_settings`, `week_encouragements`). Land with idempotent seed defaults so re-running is safe. Schema iteration is the most expensive thing to redo later — get it right once before any new UI.

4. **Schedule logic + tests — *before* any new UI.** A pure function in `server/coaching/schedule.ts`: "given an enrollment and a date, what task should the client see today?" Unit tests against every edge case (Monday start, Friday start, weekends, pauses, pauses spanning a section boundary, day 60, day 61). This is the heart of the app; getting it right once makes the UI fall out cleanly.

5. **Admin UI — Programs builder first.** You need content before the client side is useful. Then the Enrollments page (assign clients, pause, view progress). Import/export endpoints land alongside.

6. **Client UI — Today + History.** Built on top of the proven schedule logic from step 4. Add the Saturday reflection + Sunday encouragement views.

7. **Settings + Messaging admin pages.** All the editable copy and email templates. Test-send buttons here.

8. **Email + cron — last.** Hooked up to live Resend with the verified domain. Daily task email, Saturday summary, Sunday encouragement, section transitions, end-of-phase. Failure mode is silent (no errors, just no emails), so it needs real env config to test — easier to dial in once everything else works.

9. **Cleanup pass.** Drop the unused BI tables, remove dead code, prune dependencies. Only after the new app has been running for at least a week and nothing reads them.

### Conventions to lock down on day 1

- **`APP_URL` env var is the single source of truth for the site's URL.** No hardcoded `https://...` strings anywhere in code, seed data, or email templates. Linting rule or grep check before each commit.
- **Coaching route files:** `server/routes/coaching-routes.ts` (client) and `server/routes/coaching-admin-routes.ts` (admin). Keeps the diff against the existing app obvious.
- **Coaching domain logic:** `server/coaching/` — pure functions for schedule, summary generation, email assembly. Separate from HTTP plumbing.
- **Storage layer:** extend the existing `IStorage` interface in `server/storage.ts`, don't bypass it.
- **Import/export JSON shape:** pin it down before the first export endpoint ships; documented in code as a typed schema.
- **Seed data:** a test admin + a test client + a "The 4 Basics" template, all idempotent, all URLs interpolated from `APP_URL`. Lets you dogfood end-to-end from day 1 by setting different start dates.
- **Auto-deploy on push** to the working branch so breakage surfaces immediately.

### Traps to watch for

- **FK constraints on `playbookSteps` / `actions`** to BI tables (`metricDefinitions`, `locations`) — make them nullable rather than dropping, so existing rows stay valid and new coaching rows ignore them.
- **Auth middleware is woven into every route** — easy to silently break the session check. Smoke-test login/logout on every deploy.
- **The frontend router probably eagerly loads pages we're hiding.** Unmount the routes, don't just hide the sidebar link — a broken BI page can crash the app on load.
- **No "while we're in there" refactors.** Every tidy adds risk and time to a milestone that's about something else.

### What we're explicitly NOT doing in v1

- AI chat for clients (v2 — section 10)
- Pluggable LLM provider layer (v2 — section 10)
- Auto-chained phases / journey wrapper (v2 — section 10)
- Off-week group teaching sessions UI (v2 — section 10)
- Dropping the BI tables (deferred to step 9 / post-launch)
- LLM-generated narrative for summaries (v2)

Each step is independently deployable and reversible. The instinct to combine steps "to move faster" almost always slows the project down.

---

## 9. Verification

- After step 1: log in as admin on the Railway URL, confirm dashboard loads with no Replit auth errors.
- After step 2: `npm run db:push` (or whatever the Drizzle migration command is in this repo) succeeds; `\d playbook_steps` shows the new columns.
- After step 3: create a program in the admin UI with at least 5 tasks, refresh, confirm they persist.
- After step 4: enroll a test client (yourself with a second email), set start date to today, log in as that client, see today's Task + Implementation. Confirm "Mark complete" is disabled until the Feedback textarea has content. Mark complete with feedback text; confirm History shows all three pieces (Task, Implementation, Feedback). Set start date to a date 3 weekdays in the past and confirm the correct task surfaces. Complete all 5 days of week 1 (rapid-fire) and confirm a **weekly summary report** is generated and appears in History.
- After step 5: temporarily set the cron to "every minute" and confirm an email arrives at the test client's address with the right content. Then restore to weekday morning.
- After step 6: full walkthrough — admin creates program → admin enrolls client → client gets email → client completes task → admin sees progress.

---

## 10. Future: Full-Year Journey (Phases 2-4) + Off-Week Teaching Sessions

Out of scope for v1 launch, but the architecture supports it cleanly:

- **v1 approach (manual chaining):** admin creates Phase 2/3/4 program templates as they're authored, then enrolls each client into the next phase 7 days after the previous one ends. The existing `playbookApplications` table already allows multiple enrollments per client.
- **v2 approach (journey wrapper):** add a `tracks` table (`id`, `tenantId`, `name`, `description`) and `track_programs` table (`trackId`, `playbookId`, `order`, `break_days_after` default 7). Enrolling a client in a track auto-creates the chain of `playbookApplications` with correct start dates and break gaps. The break-week UX (a "Phase 1 complete — Phase 2 starts Monday MM/DD" screen, optional reflection prompt) lives here.
- **Off-week group teaching sessions (between phases):** you mentioned running a 2-4 hour live session with all clients during each break week. A small `teaching_sessions` table (`id`, `tenantId`, `title`, `description`, `scheduled_at`, `duration_minutes`, `meeting_url`, `recording_url NULL`, `notes_url NULL`) plus a "Sessions" tab on the client side (upcoming + past with recording links) covers this. Admin schedules from the admin console; clients get an email invitation when scheduled and a reminder 24h before. Out of scope for v1 since there's no Phase 2 yet, but worth designing the schema now so the migration is one-shot.

Doing v1 the manual way first lets you ship faster, see how the first phase plays out with real clients, and then add the journey wrapper without backfill pain (existing enrollments just get retroactively grouped into a track).

### v2 Add-on: AI Chat Assistant for Clients

A chat panel inside the client app that helps clients brainstorm how to tackle today's task, talk through what they tried, and get coaching-style feedback on what they wrote. The assistant is grounded in the client's actual program context — it knows today's task, the implementation suggestion, the client's past feedback, and their reflections — so it stays on-topic instead of being a generic chatbot.

**Where it lives in the client UI:** a side panel or modal on the Today screen ("Need ideas?" / "Talk it through"). Conversations are saved to the client's enrollment so they can revisit them; admin can review them on the Enrollments page.

**Guardrails (admin-configurable, naturally):**
- System prompt edited from the admin Messaging area — sets the coaching voice and what's in/out of bounds
- Per-program toggle to enable/disable AI chat
- Optional daily/weekly message cap per client (cost control)

**New tables:** `ai_conversations` (id, enrollment_id, day_number, started_at, last_message_at), `ai_messages` (id, conversation_id, role, content, tokens_in, tokens_out, model, created_at). Token counts make it easy to track cost per client.

### v2 Add-on: Pluggable LLM Provider Layer

A provider-agnostic abstraction (`server/ai/providers/` with one adapter per provider) so the AI chat (and any future LLM features) can switch between providers via the admin Settings page — no code changes when you want to try a different model. Each provider exposes the same `chat(messages, opts)` interface; the UI just picks "Provider" from a dropdown.

**Subscription vs. API billing — decide at v2 implementation time:**

Consumer subscriptions (ChatGPT Plus, Claude Pro, Gemini Advanced) don't currently expose programmatic access — that's a per-token API today. **Enterprise plans are a different story** (OpenAI Enterprise, Anthropic Team/Enterprise typically include API credits or all-in billing arrangements), so if you're on an enterprise plan by the time we build v2, this likely stops being a question. We'll pick the actual provider + billing model at v2 kickoff based on where you're at then.

The architectural commitment for v1-friendly design is just: **build the provider abstraction** so swapping between OpenAI / Anthropic / Google / OpenRouter / a local model / whatever-comes-next is a one-file change. That part is the right move regardless of billing.

**Schema for provider config:** stored in `app_settings` (or a small `llm_providers` table if we want history) — keys for `active_provider`, `<provider>_api_key`, `<provider>_model`, `monthly_budget_cents`. API keys live in `app_settings` encrypted at rest (existing app likely has nothing for secret-at-rest yet — would need to add envelope encryption with a key from `process.env`).

---

## Decisions (locked in)

- **Admin-editable everything:** all customer-facing copy, every email template, all schedule times, all duration/toggle settings live in the database (`app_settings`, `email_templates`, `playbooks` per-program columns, and section/week messaging tables). Admin can change anything from the console without code changes. Defaults ship in seed migrations.
- **Import / Export:** every program template can be exported (full-phase JSON, lossless; or tasks-only CSV/XLSX) and imported back the same way, with a per-task and per-phase granularity. Includes preview/diff before commit so you can't accidentally clobber content.
- **AI chat assistant for clients (v2):** in-app chat panel on Today, grounded in the client's program context (today's task, past feedback, reflections). Helps clients brainstorm and get coaching-style feedback. Admin-configurable system prompt + per-program enable toggle + per-client message cap. See section 10.
- **Pluggable LLM provider layer (v2):** provider-agnostic adapter so the AI chat can switch between OpenAI / Anthropic / Google / OpenRouter / local models from the Settings page. Provider choice + billing model (API vs. enterprise plan) decided at v2 kickoff based on the user's plan situation at that point. Full reasoning in section 10.
- **Branding:** keep the existing color palette. New logo to be created and dropped in later — the `tenants.logoUrl` field handles it without code changes.
- **Weekend reflection (Saturday):** "Reflecting back on this week, what is your biggest takeaway?" Single textarea, saves to `weekly_summaries.reflection_text`. Optional but encouraged. Shown on dashboard + linked from the weekly summary email.
- **Sunday encouragement (day 7):** short motivational message previewing the upcoming week — shown on dashboard and emailed Sunday evening. Twelve admin-editable templates per program (one per week) seeded with sensible defaults; admin can rewrite or disable each individually.
- **Section transition emails:** admin-toggleable per section (default off), with admin-authored subject and body. Sent the morning after the section's final task is completed. Lives on the `playbookSections` row.
- **End-of-60-days:** detailed `phase_summaries` report + a CTA panel/email promoting the next phase. For v1 the CTA is a placeholder; once Phase 2 exists it becomes a "Start Phase 2" button.
- **Off-week group teaching session:** 2-4 hour live session run between phases. Schema designed in v1, UI built in v2 alongside Phase 2 (no Phase 2 yet means no off-weeks yet).
- **Pause:** supported. Admin sets a duration (1 week / 2 weeks / custom date range) per client. The schedule shifts forward by exactly the pause duration; emails are suppressed during the pause; dashboard shows "Paused until MM/DD". Tracked in `enrollment_pauses` for audit.
