/**
 * Email cron for the Xpansion 60 coaching app.
 *
 * One heartbeat tick every 60 seconds. Each tick, we walk every tenant and
 * dispatch the right send if the current HH:MM matches that tenant's
 * configured send time for the current day-of-week:
 *
 *   Mon-Fri  → daily task email at app_settings.daily_send_time
 *   Saturday → weekly summary email at app_settings.saturday_send_time
 *   Sunday   → encouragement email at app_settings.sunday_send_time
 *
 * Send times are interpreted in the server's local time zone (UTC on Railway
 * by default). The Settings page tells admins to compensate accordingly.
 *
 * Idempotency: every successful send writes a notification_deliveries row
 * with relatedEntityId = `${enrollmentId}:${templateKey}:${YYYY-MM-DD}`.
 * Before sending we check for a matching row and skip if found — so a stuck
 * tick or accidental double-fire never produces a double email.
 *
 * Day-60 / phase-completion is event-driven, not on a schedule: it fires
 * inline from the "mark task complete" endpoint when the 60th task closes.
 */

import { db } from "../db";
import { tenants, appSettings, emailTemplates, playbookApplications, playbooks, playbookSteps, playbookSections, enrollmentPauses, notificationDeliveries, actions } from "@shared/schema";
import { users } from "@shared/models/auth";
import { eq, and, desc, asc, isNotNull, isNull } from "drizzle-orm";
import { sendEmail } from "../services/notifications";
import { computeSchedule, type PauseRange } from "./schedule";
import { renderTemplate } from "./settings-routes";

const TICK_MS = 60_000;
let started = false;

export function startCoachingCron(): void {
  if (started) return;
  started = true;
  console.log("[CRON] Starting coaching email cron (60s heartbeat)");
  setInterval(() => {
    tick().catch((e) => console.error("[CRON] tick error:", e?.message ?? e));
  }, TICK_MS);
  // Run an initial tick so devs don't have to wait up to a minute on boot
  tick().catch((e) => console.error("[CRON] initial tick error:", e?.message ?? e));
}

// ----------------------------------------------------------------------------
// Heartbeat
// ----------------------------------------------------------------------------

async function tick(): Promise<void> {
  const now = new Date();
  const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const day = now.getDay(); // 0=Sun .. 6=Sat
  const today = isoDate(now);

  const allTenants = await db.select().from(tenants);
  for (const tenant of allTenants) {
    try {
      const settings = await getSettingsMap(tenant.id);
      if (day >= 1 && day <= 5 && hhmm === (settings.daily_send_time ?? "08:00")) {
        await sendDailyTaskEmails(tenant.id, settings, today);
      }
      if (day === 6 && hhmm === (settings.saturday_send_time ?? "09:00")) {
        await sendSaturdaySummaryEmails(tenant.id, settings, today);
      }
      if (day === 0 && hhmm === (settings.sunday_send_time ?? "18:00")) {
        await sendSundayEncouragementEmails(tenant.id, settings, today);
      }
    } catch (e: any) {
      console.error(`[CRON] tenant ${tenant.id} error:`, e?.message ?? e);
    }
  }
}

// ----------------------------------------------------------------------------
// Per-template handlers
// ----------------------------------------------------------------------------

async function sendDailyTaskEmails(tenantId: number, settings: SettingsMap, today: string): Promise<void> {
  const template = await getTemplate(tenantId, "daily_task");
  if (!template || !template.enabled) return;
  const enrollments = await getActiveEnrollments(tenantId);
  for (const e of enrollments) {
    try {
      const ctx = await buildEnrollmentContext(e, today);
      if (!ctx) continue;
      if (ctx.schedule.status !== "active" || !ctx.step) continue;
      if (await alreadyDelivered(tenantId, e.id, "daily_task", today)) continue;

      const vars = baseVars(settings, ctx);
      await sendOnce({
        tenantId,
        entityId: `${e.id}:${"daily_task"}:${today}`,
        templateKey: "daily_task",
        to: ctx.clientEmail,
        fromName: settings.email_from_name ?? "Xpansion 60",
        fromAddress: settings.email_from_address ?? null,
        subject: renderTemplate(template.subject, vars),
        body: renderTemplate(template.body, vars),
      });
    } catch (err: any) {
      console.error(`[CRON][daily_task] enrollment ${e.id}:`, err?.message ?? err);
    }
  }
}

async function sendSaturdaySummaryEmails(tenantId: number, settings: SettingsMap, today: string): Promise<void> {
  const template = await getTemplate(tenantId, "weekly_summary");
  if (!template || !template.enabled) return;
  const enrollments = await getEnrollmentsForWeeklySummary(tenantId, today);
  for (const e of enrollments) {
    try {
      const ctx = await buildEnrollmentContext(e, today);
      if (!ctx) continue;
      // Find the most recently completed week. If they haven't finished any
      // 5-day window yet, skip.
      const lastCompletedWeek = await findLastCompletedWeek(e.id, ctx.program.totalWeeks);
      if (!lastCompletedWeek) continue;
      if (await alreadyDelivered(tenantId, e.id, `weekly_summary_w${lastCompletedWeek}`, today)) continue;

      const recap = await buildWeekRecap(e.id, e.playbookId, lastCompletedWeek);
      const vars = {
        ...baseVars(settings, ctx),
        week_number: String(lastCompletedWeek),
        week_recap: recap,
      };
      await sendOnce({
        tenantId,
        entityId: `${e.id}:${`weekly_summary_w${lastCompletedWeek}`}:${today}`,
        templateKey: `weekly_summary_w${lastCompletedWeek}`,
        to: ctx.clientEmail,
        fromName: settings.email_from_name ?? "Xpansion 60",
        fromAddress: settings.email_from_address ?? null,
        subject: renderTemplate(template.subject, vars),
        body: renderTemplate(template.body, vars),
      });
    } catch (err: any) {
      console.error(`[CRON][weekly_summary] enrollment ${e.id}:`, err?.message ?? err);
    }
  }
}

async function sendSundayEncouragementEmails(tenantId: number, settings: SettingsMap, today: string): Promise<void> {
  const template = await getTemplate(tenantId, "sunday_encouragement");
  if (!template || !template.enabled) return;
  const enrollments = await getActiveEnrollments(tenantId);
  for (const e of enrollments) {
    try {
      const ctx = await buildEnrollmentContext(e, today);
      if (!ctx) continue;
      if (ctx.schedule.status === "complete") continue;
      if (await alreadyDelivered(tenantId, e.id, "sunday_encouragement", today)) continue;

      const nextWeek = Math.min(ctx.lastCompletedWeek + 1, ctx.program.totalWeeks);
      const vars = {
        ...baseVars(settings, ctx),
        next_week_number: String(nextWeek),
        week_preview: `Week ${nextWeek} of ${ctx.program.name} starts tomorrow.`,
      };
      await sendOnce({
        tenantId,
        entityId: `${e.id}:${"sunday_encouragement"}:${today}`,
        templateKey: "sunday_encouragement",
        to: ctx.clientEmail,
        fromName: settings.email_from_name ?? "Xpansion 60",
        fromAddress: settings.email_from_address ?? null,
        subject: renderTemplate(template.subject, vars),
        body: renderTemplate(template.body, vars),
      });
    } catch (err: any) {
      console.error(`[CRON][sunday] enrollment ${e.id}:`, err?.message ?? err);
    }
  }
}

/**
 * Event-driven: called from /api/client/today/complete when the 60th task
 * is closed. Sends the phase_completion email synchronously.
 */
export async function sendPhaseCompletionEmail(enrollmentId: number): Promise<void> {
  try {
    const [enrollment] = await db
      .select()
      .from(playbookApplications)
      .where(eq(playbookApplications.id, enrollmentId));
    if (!enrollment) return;
    const tenantId = enrollment.tenantId;
    const template = await getTemplate(tenantId, "phase_completion");
    if (!template || !template.enabled) return;

    const today = isoDate(new Date());
    if (await alreadyDelivered(tenantId, enrollmentId, "phase_completion", today)) return;

    const settings = await getSettingsMap(tenantId);
    const ctx = await buildEnrollmentContext(enrollment, today);
    if (!ctx) return;

    const vars = {
      ...baseVars(settings, ctx),
      completion_message: ctx.program.completionMessage ?? "You showed up. That's the win.",
      cta_label: ctx.program.ctaLabel ?? "",
      cta_url: ctx.program.ctaUrl ?? "",
    };

    await sendOnce({
      tenantId,
      entityId: `${enrollmentId}:phase_completion:${today}`,
      templateKey: "phase_completion",
      to: ctx.clientEmail,
      fromName: settings.email_from_name ?? "Xpansion 60",
      fromAddress: settings.email_from_address ?? null,
      subject: renderTemplate(template.subject, vars),
      body: renderTemplate(template.body, vars),
    });
  } catch (e: any) {
    console.error("[CRON][phase_completion] error:", e?.message ?? e);
  }
}

/**
 * Event-driven: called from /api/admin/enrollments/:id/pauses when admin
 * pauses a client. Sends the pause_notification email synchronously.
 */
export async function sendPauseNotificationEmail(enrollmentId: number, pauseEnd: string | null): Promise<void> {
  try {
    const [enrollment] = await db
      .select()
      .from(playbookApplications)
      .where(eq(playbookApplications.id, enrollmentId));
    if (!enrollment) return;
    const tenantId = enrollment.tenantId;
    const template = await getTemplate(tenantId, "pause_notification");
    if (!template || !template.enabled) return;

    const settings = await getSettingsMap(tenantId);
    const ctx = await buildEnrollmentContext(enrollment, isoDate(new Date()));
    if (!ctx) return;

    const vars = {
      ...baseVars(settings, ctx),
      pause_until: pauseEnd ?? "further notice",
    };

    // Each pause is its own event (timestamped). Keying by pauseEnd
    // (or "open") gives us per-event idempotency without colliding with
    // resumes/re-pauses on the same enrollment.
    const today = isoDate(new Date());
    await sendOnce({
      tenantId,
      entityId: `${enrollmentId}:pause_notification:${pauseEnd ?? "open"}:${today}`,
      templateKey: "pause_notification",
      to: ctx.clientEmail,
      fromName: settings.email_from_name ?? "Xpansion 60",
      fromAddress: settings.email_from_address ?? null,
      subject: renderTemplate(template.subject, vars),
      body: renderTemplate(template.body, vars),
    });
  } catch (e: any) {
    console.error("[CRON][pause_notification] error:", e?.message ?? e);
  }
}

/**
 * One-off templated send. Used for emails outside the daily/weekly/Sunday
 * cron cycle — currently only the welcome email when a new user is
 * created. The caller supplies vars; we render the configured template,
 * send via Resend, and record an idempotent delivery row.
 */
export async function sendCoachingEmail(opts: {
  tenantId: number;
  templateKey: string;
  /** Stable per-event id, e.g. `welcome:${userId}`. */
  entityId: string;
  to: string;
  vars: Record<string, string>;
}): Promise<void> {
  try {
    const template = await getTemplate(opts.tenantId, opts.templateKey);
    if (!template || !template.enabled) {
      console.log(`[MAIL][${opts.templateKey}] template missing or disabled; skipping`);
      return;
    }
    const settings = await getSettingsMap(opts.tenantId);
    const allVars: Record<string, string> = {
      app_name: settings.app_display_name ?? "Xpansion 60",
      coach_name: settings.coach_name ?? "Your coach",
      dashboard_url: process.env.APP_URL ?? "https://www.xpansion60.com",
      ...opts.vars,
    };
    await sendOnce({
      tenantId: opts.tenantId,
      entityId: opts.entityId,
      templateKey: opts.templateKey,
      to: opts.to,
      fromName: settings.email_from_name ?? "Xpansion 60",
      fromAddress: settings.email_from_address ?? null,
      subject: renderTemplate(template.subject, allVars),
      body: renderTemplate(template.body, allVars),
    });
  } catch (e: any) {
    console.error(`[MAIL][${opts.templateKey}] error:`, e?.message ?? e);
  }
}

// ----------------------------------------------------------------------------
// Shared helpers
// ----------------------------------------------------------------------------

type SettingsMap = Record<string, string>;

async function getSettingsMap(tenantId: number): Promise<SettingsMap> {
  const rows = await db.select().from(appSettings).where(eq(appSettings.tenantId, tenantId));
  const out: SettingsMap = {};
  for (const r of rows) out[r.key] = r.value ?? "";
  return out;
}

async function getTemplate(tenantId: number, key: string) {
  const [row] = await db
    .select()
    .from(emailTemplates)
    .where(and(eq(emailTemplates.tenantId, tenantId), eq(emailTemplates.key, key)));
  return row ?? null;
}

async function getActiveEnrollments(tenantId: number) {
  return db
    .select()
    .from(playbookApplications)
    .where(
      and(
        eq(playbookApplications.tenantId, tenantId),
        isNotNull(playbookApplications.startDate),
        isNotNull(playbookApplications.enrolledUserId),
        isNull(playbookApplications.completedAt),
      ),
    );
}

/**
 * Like getActiveEnrollments, but also includes enrollments that completed
 * earlier on `today`. Used by the Saturday weekly-summary cron so a client
 * who finished day 60 on Saturday morning still gets their final week's
 * recap (in addition to the phase_completion email).
 */
async function getEnrollmentsForWeeklySummary(tenantId: number, today: string) {
  const rows = await db
    .select()
    .from(playbookApplications)
    .where(
      and(
        eq(playbookApplications.tenantId, tenantId),
        isNotNull(playbookApplications.startDate),
        isNotNull(playbookApplications.enrolledUserId),
      ),
    );
  return rows.filter((r) => !r.completedAt || isoDate(r.completedAt) === today);
}

interface EnrollmentContext {
  enrollment: typeof playbookApplications.$inferSelect;
  program: typeof playbooks.$inferSelect;
  step: (typeof playbookSteps.$inferSelect) | null;
  section: (typeof playbookSections.$inferSelect) | null;
  schedule: ReturnType<typeof computeSchedule>;
  clientEmail: string;
  clientFirstName: string;
  clientBusinessName: string;
  lastCompletedWeek: number;
}

async function buildEnrollmentContext(
  enrollment: typeof playbookApplications.$inferSelect,
  today: string,
): Promise<EnrollmentContext | null> {
  if (!enrollment.startDate || !enrollment.enrolledUserId) return null;
  const [program] = await db.select().from(playbooks).where(eq(playbooks.id, enrollment.playbookId));
  if (!program) return null;
  const [user] = await db.select().from(users).where(eq(users.id, enrollment.enrolledUserId));
  if (!user?.email) return null;

  const pauseRows = await db
    .select()
    .from(enrollmentPauses)
    .where(eq(enrollmentPauses.enrollmentId, enrollment.id));
  const pauses: PauseRange[] = pauseRows.map((p) => ({
    pauseStart: p.pauseStart,
    pauseEnd: p.pauseEnd,
  }));

  const schedule = computeSchedule({
    startDate: enrollment.startDate,
    today,
    totalWeekdays: program.totalWeekdays,
    pauses,
  });

  let step: (typeof playbookSteps.$inferSelect) | null = null;
  let section: (typeof playbookSections.$inferSelect) | null = null;
  if (schedule.status === "active") {
    const [s] = await db
      .select()
      .from(playbookSteps)
      .where(
        and(
          eq(playbookSteps.playbookId, program.id),
          eq(playbookSteps.weekNumber, schedule.weekNumber),
          eq(playbookSteps.dayNumber, schedule.dayNumber),
        ),
      )
      .limit(1);
    step = s ?? null;
    if (step?.sectionId) {
      const [sec] = await db
        .select()
        .from(playbookSections)
        .where(eq(playbookSections.id, step.sectionId));
      section = sec ?? null;
    }
  }

  const lastCompletedWeek = await findLastCompletedWeek(enrollment.id, program.totalWeeks);

  return {
    enrollment,
    program,
    step,
    section,
    schedule,
    clientEmail: user.email,
    clientFirstName: user.firstName ?? "there",
    clientBusinessName: (user as any).businessName ?? "",
    lastCompletedWeek,
  };
}

function baseVars(settings: SettingsMap, ctx: EnrollmentContext): Record<string, string> {
  const sched = ctx.schedule;
  const weekNumber =
    sched.status === "active" ? String(sched.weekNumber) : String(ctx.lastCompletedWeek || 1);
  const dayNumber = sched.status === "active" ? String(sched.dayNumber) : "1";
  return {
    app_name: settings.app_display_name ?? "Xpansion 60",
    coach_name: settings.coach_name ?? "Your coach",
    client_first_name: ctx.clientFirstName,
    client_email: ctx.clientEmail,
    client_business_name: ctx.clientBusinessName,
    program_name: ctx.program.name,
    section_name: ctx.section?.name ?? "",
    week_number: weekNumber,
    day_number: dayNumber,
    task_text: ctx.step?.taskText ?? "",
    implementation_text: ctx.step?.implementationText ?? "",
    dashboard_url: process.env.APP_URL ?? "https://www.xpansion60.com",
  };
}

async function findLastCompletedWeek(enrollmentId: number, totalWeeks: number): Promise<number> {
  // A week is "completed" when there's a closed action for day 5 of that week.
  const rows = await db
    .select({ weekNumber: playbookSteps.weekNumber })
    .from(actions)
    .innerJoin(playbookSteps, eq(actions.stepId, playbookSteps.id))
    .where(
      and(
        eq(actions.enrollmentId, enrollmentId),
        eq(actions.status, "closed"),
        eq(playbookSteps.dayNumber, 5),
      ),
    )
    .orderBy(desc(playbookSteps.weekNumber))
    .limit(1);
  const week = rows[0]?.weekNumber ?? null;
  if (week === null) return 0;
  return Math.min(week, totalWeeks);
}

async function buildWeekRecap(enrollmentId: number, programId: number, weekNumber: number): Promise<string> {
  const rows = await db
    .select({
      dayNumber: playbookSteps.dayNumber,
      title: playbookSteps.title,
      taskText: playbookSteps.taskText,
      feedback: actions.feedbackText,
    })
    .from(playbookSteps)
    .leftJoin(actions, and(eq(actions.stepId, playbookSteps.id), eq(actions.enrollmentId, enrollmentId)))
    .where(and(eq(playbookSteps.playbookId, programId), eq(playbookSteps.weekNumber, weekNumber)))
    .orderBy(asc(playbookSteps.dayNumber));
  return rows
    .map((r) => {
      const taskLine = r.taskText ? r.taskText.split("\n")[0] : r.title;
      const feedbackLine = r.feedback ? `   You said: ${r.feedback.slice(0, 200)}` : "";
      return `Day ${r.dayNumber}: ${taskLine}${feedbackLine ? "\n" + feedbackLine : ""}`;
    })
    .join("\n");
}

async function alreadyDelivered(
  tenantId: number,
  enrollmentId: number,
  templateKey: string,
  date: string,
): Promise<boolean> {
  // Fast-path skip used by handlers to avoid building template vars when a row
  // already exists. The DB unique constraint in sendOnce() is the actual
  // safety net against double-sends; this check is purely a perf optimization.
  // Match ANY status (pending/sent/failed) because the unique key makes those
  // mutually exclusive.
  const entityId = `${enrollmentId}:${templateKey}:${date}`;
  const [row] = await db
    .select({ id: notificationDeliveries.id })
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.tenantId, tenantId),
        eq(notificationDeliveries.relatedEntityType, "coaching_email"),
        eq(notificationDeliveries.relatedEntityId, entityId),
      ),
    )
    .limit(1);
  return !!row;
}

interface SendOnceArgs {
  tenantId: number;
  /** Deterministic key for idempotency — typically
   *  `${enrollmentId}:${templateKey}:${date}` for cron sends, or
   *  `${templateKey}:${userId}` for one-off sends like welcome. */
  entityId: string;
  templateKey: string;
  to: string;
  fromName: string;
  fromAddress: string | null;
  subject: string;
  body: string;
}

async function sendOnce(args: SendOnceArgs): Promise<void> {
  const html = wrapHtml(args.subject, args.body);
  const senderForSendEmail = args.fromAddress ? args.fromAddress : undefined;
  const entityId = args.entityId;

  // Reserve the delivery row BEFORE calling Resend. The unique index on
  // (tenantId, relatedEntityType, relatedEntityId) makes this an atomic
  // dedupe: concurrent ticks racing on the same email collide here and
  // exactly one survives to actually call sendEmail().
  let reserved: { id: number } | null = null;
  try {
    const [row] = await db
      .insert(notificationDeliveries)
      .values({
        tenantId: args.tenantId,
        channel: "email",
        recipientAddress: args.to,
        subjectOrTitle: args.subject,
        bodyPreview: args.body.slice(0, 500),
        status: "pending",
        attempts: 0,
        relatedEntityType: "coaching_email",
        relatedEntityId: entityId,
      })
      .returning({ id: notificationDeliveries.id });
    reserved = row;
  } catch (e: any) {
    // Postgres unique-violation code is 23505. Anything else is unexpected.
    if (e?.code === "23505") {
      // Another tick already reserved (or already sent) this delivery; skip.
      return;
    }
    console.error(`[CRON][${args.templateKey}] reserve failed: ${e?.message ?? e}`);
    throw e;
  }

  let status: "sent" | "failed" = "sent";
  let errorMessage: string | null = null;
  try {
    await sendEmail(args.to, args.subject, html, senderForSendEmail);
  } catch (e: any) {
    status = "failed";
    errorMessage = e?.message ?? String(e);
  }

  await db
    .update(notificationDeliveries)
    .set({
      status,
      attempts: 1,
      lastAttemptAt: new Date(),
      errorMessage,
    })
    .where(eq(notificationDeliveries.id, reserved.id));

  if (status === "failed") {
    console.error(`[CRON][${args.templateKey}] send to ${args.to} failed: ${errorMessage}`);
  } else {
    console.log(`[CRON][${args.templateKey}] sent to ${args.to}`);
  }
}

// Matches http(s) URLs in plain text. Avoids trailing punctuation that's
// usually part of the surrounding sentence (period, comma, paren, etc.).
const URL_RE = /\bhttps?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]]/g;

function wrapHtml(_subject: string, body: string): string {
  // Escape the body first so admin-edited template text can never inject HTML.
  const escaped = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  // Then replace escaped URLs with safe <a> tags. The href is the original URL
  // (also escaped to be safe in an attribute context), the visible text is
  // the already-escaped string.
  const linked = escaped.replace(URL_RE, (url) => {
    const safeHref = url.replace(/"/g, "&quot;");
    return `<a href="${safeHref}" style="color:#dc2626;text-decoration:underline;">${url}</a>`;
  });
  return `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;line-height:1.6;color:#111;max-width:560px;margin:24px auto;padding:0 16px;">
<pre style="white-space:pre-wrap;font-family:inherit;font-size:15px;margin:0;">${linked}</pre>
</body></html>`;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
