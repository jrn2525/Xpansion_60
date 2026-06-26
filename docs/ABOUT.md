# Xpansion 60 — App Overview

## What it is

**Xpansion 60** is a 12-week / 60-weekday coaching app. A coach (the
"admin") builds bite-size daily tasks into a structured curriculum;
clients receive one task per weekday by email and on a personal
dashboard; clients log feedback as they go; the coach watches progress
and intervenes when needed.

The product solves a specific problem: most coaching content is too
much to act on. Coaching books, courses, and group programs throw
hundreds of ideas at clients who never implement any of them.
Xpansion 60 turns a 12-week curriculum into 60 small daily actions and
a simple feedback loop.

**Live URL:** https://www.xpansion60.com

---

## The mental model

| Concept | What it is |
|---|---|
| **Program** | A 60-weekday curriculum template authored by the coach. Reusable across many clients. |
| **Section** | A named segment within a program (e.g., "Greeting," "Educate"). The default program has 4 sections of 15 weekdays each. |
| **Step (Task)** | One day of content. Has a *Task* (what to do), an *Implementation* (how to do it), and an optional media URL. |
| **Enrollment** | A specific client assigned to a program with a personal start date. Two clients can be on the same program at different start dates. |
| **Action / Completion** | A client's record that they did today's task, with their *Feedback* (what happened when they did it). |
| **Pause** | A vacation/sick-day window that freezes the schedule. The client's day-count doesn't advance during a pause. |

### The 60-weekday cadence

- Monday–Friday: one task per day, totaling 60 tasks across 12 weeks.
- Saturday: weekly summary email + a reflection prompt.
- Sunday: encouragement / "ready for week N" email.
- Weekend dashboards show a friendly placeholder, not the next task.
- Day 60 (last Friday): completion celebration + a CTA to the next phase.

### The full-year journey (vision)

Four **phases** chain together to cover one year of coaching:

```
Phase 1 (12 wk)  →  1-wk break  →  Phase 2 (12 wk)  →  1-wk break
   →  Phase 3 (12 wk)  →  1-wk break  →  Phase 4 (12 wk)
   = 51 weeks ≈ one year
```

Phase 1 ships first as **"The 4 Basics."** Phases 2-4 are future content.

---

## The 4 Basics — the launch program

The default 60-day program is built around four foundational sections:

| Section | Days | What it teaches |
|---|---|---|
| **Greeting** | 1-15 | Opening every interaction with intention. |
| **Educate** | 16-30 | Sharing knowledge that builds trust and authority. |
| **Process** | 31-45 | A repeatable workflow that converts attention into action. |
| **Close** | 46-60 | Finishing strong — asking, deciding, committing. |

The coach (you, John, of Xpansion Code) authors the actual task content
inside the admin UI. The structure (4 sections × 15 weekdays = 60
slots) is seeded; the content is yours.

---

## How the coach uses it

### Dashboard

Logs in at `https://www.xpansion60.com`. Lands on the **Clients** view —
a list of every client in the system with status badges.

### Authoring a program

**Programs** page → "+ New Program." Optionally seed "The 4 Basics"
structure (4 sections + 60 empty cells). Open the program; fill in
each cell's *Task* and *Implementation* text (and optional media URL).
Per-cell dirty tracking + a sticky "Save tasks" bar batches changes.

Per-program settings: name, description, total weeks / weekdays
(default 12 / 60 — supports other lengths for future programs),
feedback-required toggle, reflection-required toggle, reflection
prompt, completion message, "next phase" CTA label + URL.

### Enrolling a client

1. **Users** page → "Create User." Enter profile only (no password —
   the client sets their own via an activation link).
2. **Enrollments** page → "New enrollment." Pick the client + program
   + start date.
3. The client receives a welcome email with a one-time activation
   link. They set their password and land on their dashboard already
   enrolled.

### Managing live enrollments

The Enrollments page shows every client with their computed status
(Week 3 · Day 2, Weekend, Paused until 12/10, Complete, etc.). One
click to **pause** (vacation, illness — the schedule freezes), one
click to **resume** (schedule shifts forward by exactly the paused
weekdays). The schedule logic handles weekends, multiple pauses, and
pauses that span weekends without double-counting.

### Editing the messaging

**Messaging** page → six admin-editable email templates: welcome,
daily task, weekly summary, Sunday encouragement, phase completion,
pause notification. Each supports `{{placeholder}}` substitution
(e.g., `{{client_first_name}}`, `{{task_text}}`, `{{week_recap}}`),
has a Preview button that renders with sample data, and a Test Send
button that emails the rendered template to any address. Templates
can be toggled off entirely.

### Editing the app settings

**Settings** page → app display name, coach name, email From name +
address, daily/Saturday/Sunday send times (UTC), and dashboard copy
shown on weekends / during pauses / at completion.

### Watching activity

**Activity** page → audit log of every meaningful event (user
created, suspended, deleted; enrollments created; logins; failed
logins; templates updated; etc.).

---

## How the client uses it

### Activation

Receives a welcome email with a link. Clicks → sets their own
password → lands on the dashboard automatically signed-in.

### Today

The Today screen (home page for clients) shows one of five states
depending on the day:

| State | What appears |
|---|---|
| **Active** | Three stacked sections: **1 · Task** (admin's instructions), **2 · Implementation** (how-to/example), **3 · Feedback** (client's required text). "Mark complete" disabled until feedback is filled. |
| **Weekend** | Friendly placeholder + a reflection prompt on Saturday. |
| **Paused** | "Your program is paused until 12/10." Daily emails are suppressed. |
| **Before start** | "Your program starts on 1/15." |
| **Complete** | Day-60 celebration with the program's completion message and the next-phase CTA button. |

If the client revisits a day they already completed, their saved
feedback is pre-loaded with an "Update" button — they can refine
their notes after the fact.

### History

The History page shows every completed task, grouped by **section**
and **week**, newest first. Each entry preserves the Task, the
Implementation, and the client's own Feedback. It's their journey
journal.

### Profile / Settings

Standard: change password, edit profile, log out (or log out of every
device, separately).

---

## Email automation

A 60-second heartbeat cron on the server checks every tenant's
configured send times and fires the right template for the right day:

| Day | Template | Trigger |
|---|---|---|
| Mon-Fri | `daily_task` | At `daily_send_time` per tenant, for every active enrollment that day |
| Saturday | `weekly_summary` | After 5 closed weekday actions — includes a real `{{week_recap}}` built from the client's actual feedback |
| Sunday | `sunday_encouragement` | All active enrollments, with `{{week_preview}}` for the upcoming week |
| Event-driven | `phase_completion` | The moment a client marks day 60 complete |
| Event-driven | `pause_notification` | The moment an admin pauses a client |
| Event-driven | `welcome` | The moment an admin creates a new user (includes the activation link) |

Every send is **idempotent** — a unique constraint on
`notificationDeliveries(tenant, type, entity)` makes double-firing
physically impossible at the database level. Failed sends are
recorded with the error message.

Send-time URLs are auto-linkified so admin-editable templates can use
`{{dashboard_url}}` and it renders as a real `<a href>` link.

---

## Security model

- **Email/password auth** via Passport (local) + bcrypt + Postgres
  session store.
- **Account activation flow** — the welcome email never contains the
  client's password. Instead a one-time 96-character token (7-day TTL)
  links to a public `/activate` page where they set their own
  password. After activation, the token is marked `usedAt`.
- **User types**: admin (full access), coach (placeholder for future
  delegated access; behaves as client today), client (enrolled only).
  Admin cannot demote themselves.
- **Suspend** — sets `suspendedAt`, kills every active session for
  the target user, blocks login with a 403.
- **CSRF protection** — origin-check middleware on every mutating
  `/api` endpoint. Plus `sameSite: "lax"` session cookie.
- **Tenant isolation** — every admin endpoint verifies the caller has
  access to the resource's tenant, not just that they're an admin.
- **Strict zod validation** on every write endpoint — unknown body
  keys are rejected.

---

## Technical stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Wouter (router) + TanStack Query (data) + Tailwind + shadcn/ui |
| Backend | Express 5 on Node 20 |
| Database | PostgreSQL via Drizzle ORM |
| Auth | Passport (local) + express-session + connect-pg-simple |
| Email | Resend (verified domain: `xpansion60.com`) |
| Hosting | Railway (single project, `production` + `staging` environments, both with their own Postgres) |
| Domain | GoDaddy DNS → Railway custom domain; apex 301-redirects to `www.xpansion60.com` |

The whole app is a single Express process that serves both the React
SPA and the API. One repo, one deploy pipeline, one Railway service +
one Postgres per environment.

### Repository layout

```
client/src/        React app
  pages/           Top-level routes (Today, History, admin pages)
  components/      Sidebar, command palette, UI primitives
  hooks/           useAuth, useTenantStore, etc.
server/
  auth/            Local auth + activation token flow
  coaching/        The product surface — programs, enrollments,
                   client routes, schedule logic, cron, settings,
                   email templates
  services/        Resend wrapper, file parser
  middleware/      CSRF, security headers, tracing
shared/
  schema.ts        Drizzle schema (single source of truth)
  models/auth.ts   Users + sessions tables
docs/
  RAILWAY_SETUP.md Operations runbook
  ABOUT.md         This file
```

### Database highlights (coaching-specific)

- `playbooks` — program templates (60-day curriculum)
- `playbook_sections` — named segments within a program
- `playbook_steps` — one row per (week, day) cell
- `playbook_applications` — enrollments (client ↔ program ↔ start date)
- `actions` — per-day completions with the client's feedback
- `enrollment_pauses` — vacation windows
- `weekly_summaries` / `phase_summaries` — generated recap content
- `email_templates` — admin-editable per-tenant email content
- `app_settings` — admin-editable per-tenant config
- `account_activation_tokens` — one-time password-set tokens
- `notification_deliveries` — full email send log with idempotency

---

## Current state — what's shipped

**v1 (complete and live):**
- Full coach-side authoring (Programs page with grid editor + sections + settings)
- Full client experience (Today + History + Profile)
- Email cron — daily/weekly/Sunday + event-driven phase + pause emails
- Admin Settings + Messaging (admin-editable everything)
- User Management (create / edit / suspend / delete / user types)
- Activation token flow (no plaintext passwords)
- Health check audit fixed every critical and high finding (idempotency,
  CSRF, tenant isolation, strict zod, race conditions, pause overlaps,
  email linkification)
- 24-test schedule logic suite

**Phase 2 (planned):**
1. **Program import / export** — CSV/XLSX/JSON. Two-step preview-then-apply
   for safety. Author the 60 tasks in Excel, upload, done.
2. **Self-service enrollment via ClickFunnels** — client buys through
   the funnel; ClickFunnels webhooks the app; app mints an enrollment
   invitation and emails the buyer; they set a password and land
   enrolled.
3. **Bulk enrollment CSV** — paste a list of (email, startDate), the
   system auto-invites each row.
4. **Resend bounce webhook** — catch silent email delivery failures,
   flag bad addresses in admin.
5. **One-tap "I did it" link in daily emails** — clients log their
   feedback without ever opening the app. Biggest engagement lever
   identified in the audit.

**Phase 3 (deferred):**
- SMS reminders via Twilio (paired with the one-tap link)
- White-label tenant theming (logo + accent color)
- Streak counters + "soft restart" engagement emails
- At-risk client widget
- View-as-client (read-only impersonation)
- Cron + audit log viewers
- Multi-program-per-client UI
- AI-assisted task drafting

---

## How to think about Xpansion 60 in one paragraph

It's a **drip coaching system** — daily, structured, with feedback
loops baked in. The coach designs once and reuses across many
clients. The client gets a tiny, doable task each weekday with space
to reflect on what happened. The platform handles enrollment,
scheduling around weekends and vacations, automated reminders,
weekly recaps, and end-of-program celebration. Everything visible to
clients is admin-editable from the dashboard, so the coach is never
blocked on a developer.
