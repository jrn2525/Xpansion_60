import { Router, type RequestHandler } from "express";
import { db } from "../db";
import { appSettings, emailTemplates } from "@shared/schema";
import { eq, and, asc } from "drizzle-orm";
import { isAuthenticated, isSuperAdminGuard } from "../auth/session";
import { sendEmail } from "../services/notifications";
import { z } from "zod";

export const settingsRouter = Router();

function ok(data: unknown) {
  return { ok: true, data };
}
function err(code: string, message: string) {
  return { ok: false, error: { code, message } };
}

const guard: RequestHandler[] = [isAuthenticated, isSuperAdminGuard];

// ----------------------------------------------------------------------------
// Defaults — seeded lazily the first time a tenant requests them
// ----------------------------------------------------------------------------

interface SettingDefault {
  key: string;
  value: string;
  label: string;
  description: string;
  group: "branding" | "schedule" | "copy";
  inputType: "text" | "time" | "textarea" | "email";
}

const APP_SETTING_DEFAULTS: SettingDefault[] = [
  {
    key: "app_display_name",
    value: "Xpansion 60",
    label: "App name",
    description: "Shown in browser tabs, email headers, and on the dashboard.",
    group: "branding",
    inputType: "text",
  },
  {
    key: "coach_name",
    value: "Your coach",
    label: "Coach name",
    description: "Used in email signatures as {{coach_name}}.",
    group: "branding",
    inputType: "text",
  },
  {
    key: "email_from_name",
    value: "Xpansion 60",
    label: "Email — From name",
    description: "Name your clients see in their inbox.",
    group: "branding",
    inputType: "text",
  },
  {
    key: "email_from_address",
    value: "coaching@xpansion60.com",
    label: "Email — From address",
    description:
      "Must be a Resend-verified domain. Defaults to coaching@xpansion60.com.",
    group: "branding",
    inputType: "email",
  },
  {
    key: "daily_send_time",
    value: "08:00",
    label: "Daily task email — send time",
    description:
      "Local time when the Mon-Fri task email goes out to active clients.",
    group: "schedule",
    inputType: "time",
  },
  {
    key: "saturday_send_time",
    value: "09:00",
    label: "Saturday summary email — send time",
    description: "Local time when the weekly summary + reflection prompt sends.",
    group: "schedule",
    inputType: "time",
  },
  {
    key: "sunday_send_time",
    value: "18:00",
    label: "Sunday encouragement email — send time",
    description: "Local time for the Sunday-evening week-ahead message.",
    group: "schedule",
    inputType: "time",
  },
  {
    key: "weekend_placeholder_copy",
    value: "Enjoy the weekend. Your next task lands Monday morning.",
    label: "Weekend dashboard message",
    description: "Shown to clients on Saturday and Sunday on the Today screen.",
    group: "copy",
    inputType: "textarea",
  },
  {
    key: "paused_placeholder_copy",
    value: "Your program is paused. Daily tasks will resume on the date your coach set.",
    label: "Paused dashboard message",
    description: "Shown when a client's enrollment is currently paused.",
    group: "copy",
    inputType: "textarea",
  },
];

interface EmailTemplateDefault {
  key: string;
  label: string;
  description: string;
  subject: string;
  body: string;
  placeholders: string[];
}

const EMAIL_TEMPLATE_DEFAULTS: EmailTemplateDefault[] = [
  {
    key: "welcome",
    label: "Welcome email",
    description:
      "Sent when you create a new client account. Includes their temporary password.",
    subject: "Welcome to {{app_name}} — your account is ready",
    body: `Welcome, {{client_first_name}}!

Your account is set up at {{dashboard_url}}.

  Email: {{client_email}}
  Temporary password: {{password}}

You'll be asked to set a new password on first sign-in.

— {{coach_name}}`,
    placeholders: [
      "{{client_first_name}}",
      "{{client_email}}",
      "{{password}}",
      "{{dashboard_url}}",
      "{{app_name}}",
      "{{coach_name}}",
    ],
  },
  {
    key: "daily_task",
    label: "Daily task email",
    description:
      "Sent Mon-Fri at the time configured under Settings → daily_send_time.",
    subject: "Today's task — {{program_name}} Day {{day_number}}",
    body: `Good morning {{client_first_name}},

Today's task is part of {{section_name}}.

TASK
{{task_text}}

HOW TO DO IT
{{implementation_text}}

When you've done it, log your feedback at {{dashboard_url}}.

— {{coach_name}}`,
    placeholders: [
      "{{client_first_name}}",
      "{{program_name}}",
      "{{section_name}}",
      "{{week_number}}",
      "{{day_number}}",
      "{{task_text}}",
      "{{implementation_text}}",
      "{{dashboard_url}}",
      "{{coach_name}}",
    ],
  },
  {
    key: "weekly_summary",
    label: "Weekly summary email",
    description:
      "Sent Saturday morning when a client has completed all 5 weekday tasks of the previous week.",
    subject: "Week {{week_number}} complete — your recap",
    body: `Hey {{client_first_name}},

Great job finishing week {{week_number}}. Here's what you covered:

{{week_recap}}

Take a moment to reflect at {{dashboard_url}} — there's a "biggest takeaway" prompt waiting for you.

— {{coach_name}}`,
    placeholders: [
      "{{client_first_name}}",
      "{{program_name}}",
      "{{week_number}}",
      "{{week_recap}}",
      "{{dashboard_url}}",
      "{{coach_name}}",
    ],
  },
  {
    key: "sunday_encouragement",
    label: "Sunday encouragement email",
    description:
      "Sent Sunday evening to active clients with a preview of the upcoming week.",
    subject: "Ready for week {{next_week_number}}?",
    body: `Hi {{client_first_name}},

Tomorrow you start week {{next_week_number}} of {{program_name}}.

{{week_preview}}

See you in the morning at {{dashboard_url}}.

— {{coach_name}}`,
    placeholders: [
      "{{client_first_name}}",
      "{{program_name}}",
      "{{next_week_number}}",
      "{{week_preview}}",
      "{{dashboard_url}}",
      "{{coach_name}}",
    ],
  },
  {
    key: "phase_completion",
    label: "Phase completion email",
    description:
      "Sent when a client completes day 60 of a phase. Includes the next-phase CTA configured on the program.",
    subject: "You finished {{program_name}}!",
    body: `{{client_first_name}},

You did it. Sixty weekdays of work, and here you are.

{{completion_message}}

— {{coach_name}}`,
    placeholders: [
      "{{client_first_name}}",
      "{{program_name}}",
      "{{completion_message}}",
      "{{cta_label}}",
      "{{cta_url}}",
      "{{dashboard_url}}",
      "{{coach_name}}",
    ],
  },
  {
    key: "pause_notification",
    label: "Pause notification email",
    description:
      "Sent to the client when an admin pauses their schedule.",
    subject: "Your {{program_name}} schedule is paused",
    body: `{{client_first_name}},

Your coach has paused {{program_name}} until {{pause_until}}.

Daily tasks will resume automatically — no action needed from you.

— {{coach_name}}`,
    placeholders: [
      "{{client_first_name}}",
      "{{program_name}}",
      "{{pause_until}}",
      "{{coach_name}}",
    ],
  },
];

async function ensureAppSettings(tenantId: number) {
  const existing = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.tenantId, tenantId));
  const existingKeys = new Set(existing.map((r) => r.key));
  const missing = APP_SETTING_DEFAULTS.filter((d) => !existingKeys.has(d.key));
  if (missing.length > 0) {
    await db.insert(appSettings).values(
      missing.map((d) => ({ tenantId, key: d.key, value: d.value })),
    );
  }
}

async function ensureEmailTemplates(tenantId: number) {
  const existing = await db
    .select()
    .from(emailTemplates)
    .where(eq(emailTemplates.tenantId, tenantId));
  const existingKeys = new Set(existing.map((r) => r.key));
  const missing = EMAIL_TEMPLATE_DEFAULTS.filter((d) => !existingKeys.has(d.key));
  if (missing.length > 0) {
    await db.insert(emailTemplates).values(
      missing.map((d) => ({
        tenantId,
        key: d.key,
        enabled: true,
        subject: d.subject,
        body: d.body,
      })),
    );
  }
}

// ----------------------------------------------------------------------------
// Placeholder rendering (for preview + test-send)
// ----------------------------------------------------------------------------

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match,
  );
}

function sampleVars(): Record<string, string> {
  return {
    app_name: "Xpansion 60",
    coach_name: "Coach John",
    client_first_name: "Sample",
    client_email: "sample@example.com",
    client_business_name: "Sample Business",
    password: "Sample123",
    program_name: "The 4 Basics",
    section_name: "Greeting",
    week_number: "1",
    next_week_number: "2",
    day_number: "1",
    task_text: "Reach out to 3 dormant contacts and ask how they've been.",
    implementation_text: "Pick three names from your CRM. Short, no-ask message — just check in.",
    week_recap: "Day 1: ...\nDay 2: ...\nDay 3: ...\nDay 4: ...\nDay 5: ...",
    week_preview: "This week we move into section 2 — Educate.",
    completion_message: "You showed up sixty times. That's the win.",
    cta_label: "Start Phase 2",
    cta_url: "https://www.xpansion60.com/admin/programs",
    pause_until: "MM/DD/YYYY",
    dashboard_url: process.env.APP_URL ?? "https://www.xpansion60.com",
  };
}

// ----------------------------------------------------------------------------
// App settings endpoints
// ----------------------------------------------------------------------------

settingsRouter.get("/app-settings", ...guard, async (req, res) => {
  try {
    const tenantId = Number(req.query.tenantId);
    if (!tenantId) {
      return res.status(400).json(err("VALIDATION_ERROR", "tenantId required"));
    }
    await ensureAppSettings(tenantId);
    const rows = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.tenantId, tenantId));
    const byKey = new Map(rows.map((r) => [r.key, r]));
    res.json(
      ok({
        groups: ["branding", "schedule", "copy"],
        settings: APP_SETTING_DEFAULTS.map((d) => ({
          ...d,
          value: byKey.get(d.key)?.value ?? d.value,
        })),
      }),
    );
  } catch (e: any) {
    res.status(500).json(err("INTERNAL_ERROR", e.message));
  }
});

const updateSettingsSchema = z.object({
  tenantId: z.number().int().positive(),
  updates: z.array(z.object({ key: z.string(), value: z.string() })),
}).strict();

settingsRouter.put("/app-settings", ...guard, async (req, res) => {
  try {
    const parsed = updateSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(err("VALIDATION_ERROR", parsed.error.message));
    }
    const { tenantId, updates } = parsed.data;
    const allowedKeys = new Set(APP_SETTING_DEFAULTS.map((d) => d.key));
    for (const u of updates) {
      if (!allowedKeys.has(u.key)) {
        return res.status(400).json(err("VALIDATION_ERROR", `Unknown setting key: ${u.key}`));
      }
    }
    await ensureAppSettings(tenantId);
    for (const u of updates) {
      await db
        .update(appSettings)
        .set({ value: u.value, updatedAt: new Date() })
        .where(and(eq(appSettings.tenantId, tenantId), eq(appSettings.key, u.key)));
    }
    res.json(ok({ saved: updates.length }));
  } catch (e: any) {
    res.status(500).json(err("INTERNAL_ERROR", e.message));
  }
});

// ----------------------------------------------------------------------------
// Email template endpoints
// ----------------------------------------------------------------------------

settingsRouter.get("/email-templates", ...guard, async (req, res) => {
  try {
    const tenantId = Number(req.query.tenantId);
    if (!tenantId) {
      return res.status(400).json(err("VALIDATION_ERROR", "tenantId required"));
    }
    await ensureEmailTemplates(tenantId);
    const rows = await db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.tenantId, tenantId))
      .orderBy(asc(emailTemplates.key));
    const byKey = new Map(rows.map((r) => [r.key, r]));
    res.json(
      ok({
        templates: EMAIL_TEMPLATE_DEFAULTS.map((d) => {
          const stored = byKey.get(d.key);
          return {
            key: d.key,
            label: d.label,
            description: d.description,
            placeholders: d.placeholders,
            enabled: stored?.enabled ?? true,
            subject: stored?.subject ?? d.subject,
            body: stored?.body ?? d.body,
            defaultSubject: d.subject,
            defaultBody: d.body,
          };
        }),
      }),
    );
  } catch (e: any) {
    res.status(500).json(err("INTERNAL_ERROR", e.message));
  }
});

const updateTemplateSchema = z.object({
  tenantId: z.number().int().positive(),
  enabled: z.boolean().optional(),
  subject: z.string().min(1).max(500).optional(),
  body: z.string().min(1).optional(),
}).strict();

settingsRouter.put("/email-templates/:key", ...guard, async (req, res) => {
  try {
    const key = String(req.params.key);
    const known = EMAIL_TEMPLATE_DEFAULTS.find((d) => d.key === key);
    if (!known) {
      return res.status(404).json(err("NOT_FOUND", `Unknown template key: ${key}`));
    }
    const parsed = updateTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(err("VALIDATION_ERROR", parsed.error.message));
    }
    const { tenantId, enabled, subject, body } = parsed.data;
    await ensureEmailTemplates(tenantId);
    const patch: any = { updatedAt: new Date() };
    if (enabled !== undefined) patch.enabled = enabled;
    if (subject !== undefined) patch.subject = subject;
    if (body !== undefined) patch.body = body;
    await db
      .update(emailTemplates)
      .set(patch)
      .where(and(eq(emailTemplates.tenantId, tenantId), eq(emailTemplates.key, key)));
    res.json(ok({ saved: true }));
  } catch (e: any) {
    res.status(500).json(err("INTERNAL_ERROR", e.message));
  }
});

settingsRouter.post("/email-templates/:key/preview", ...guard, async (req, res) => {
  try {
    const key = req.params.key;
    const known = EMAIL_TEMPLATE_DEFAULTS.find((d) => d.key === key);
    if (!known) {
      return res.status(404).json(err("NOT_FOUND", `Unknown template key: ${key}`));
    }
    const { subject, body } = req.body ?? {};
    const vars = sampleVars();
    res.json(
      ok({
        subject: renderTemplate(subject ?? known.subject, vars),
        body: renderTemplate(body ?? known.body, vars),
        sampleVars: vars,
      }),
    );
  } catch (e: any) {
    res.status(500).json(err("INTERNAL_ERROR", e.message));
  }
});

const testSendSchema = z.object({
  to: z.string().email(),
  subject: z.string().optional(),
  body: z.string().optional(),
}).strict();

settingsRouter.post("/email-templates/:key/test-send", ...guard, async (req: any, res) => {
  try {
    const key = req.params.key;
    const known = EMAIL_TEMPLATE_DEFAULTS.find((d) => d.key === key);
    if (!known) {
      return res.status(404).json(err("NOT_FOUND", `Unknown template key: ${key}`));
    }
    const parsed = testSendSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(err("VALIDATION_ERROR", parsed.error.message));
    }
    const { to, subject, body } = parsed.data;
    const vars = sampleVars();
    const rendered = {
      subject: renderTemplate(subject ?? known.subject, vars),
      body: renderTemplate(body ?? known.body, vars),
    };
    const html = `<pre style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;white-space:pre-wrap;font-size:14px;">${escapeHtml(
      rendered.body,
    )}</pre>`;
    try {
      await sendEmail(to, `[TEST] ${rendered.subject}`, html);
    } catch (sendErr: any) {
      return res.status(500).json(err("SEND_FAILED", sendErr.message));
    }
    res.json(ok({ sent: true, to }));
  } catch (e: any) {
    res.status(500).json(err("INTERNAL_ERROR", e.message));
  }
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
