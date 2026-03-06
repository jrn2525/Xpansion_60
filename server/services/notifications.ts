import { storage } from "../storage";
import type { InsertNotificationDelivery } from "@shared/schema";

async function retryWithBackoff<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      lastError = e;
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500));
      }
    }
  }
  throw lastError;
}

export async function sendEmail(to: string, subject: string, htmlBody: string, senderEmail?: string): Promise<boolean> {
  try {
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      console.log(`[EMAIL STUB] To: ${to}, Subject: ${subject}, From: ${senderEmail || "default"}`);
      console.log(`[EMAIL STUB] No RESEND_API_KEY configured — email not sent`);
      return true;
    }

    const from = senderEmail ? `Xpansion Console <${senderEmail}>` : "Xpansion Console <notifications@resend.dev>";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html: htmlBody,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Resend API error: ${res.status} ${err}`);
    }
    return true;
  } catch (e: any) {
    console.error("[EMAIL ERROR]", e.message);
    throw e;
  }
}

export async function sendSlackWebhook(webhookUrl: string, payload: { text: string; blocks?: any[] }): Promise<boolean> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Slack webhook error: ${res.status} ${err}`);
    }
    return true;
  } catch (e: any) {
    console.error("[SLACK ERROR]", e.message);
    throw e;
  }
}

export async function sendNotification(
  tenantId: number,
  channel: "email" | "slack",
  recipient: string,
  subject: string,
  body: string,
  relatedEntityType?: string,
  relatedEntityId?: string,
  senderEmail?: string
): Promise<void> {
  const delivery = await storage.createNotificationDelivery({
    tenantId,
    channel,
    recipientAddress: recipient,
    subjectOrTitle: subject,
    bodyPreview: body.slice(0, 500),
    status: "pending",
    attempts: 0,
    relatedEntityType: relatedEntityType || null,
    relatedEntityId: relatedEntityId || null,
    lastAttemptAt: null,
    errorMessage: null,
  });

  try {
    await retryWithBackoff(async () => {
      if (channel === "email") {
        await sendEmail(recipient, subject, body, senderEmail);
      } else if (channel === "slack") {
        await sendSlackWebhook(recipient, { text: `*${subject}*\n${body}` });
      }
    }, 3);

    await storage.updateNotificationDelivery(delivery.id, {
      status: "sent",
      attempts: 3,
      lastAttemptAt: new Date(),
    });
  } catch (e: any) {
    await storage.updateNotificationDelivery(delivery.id, {
      status: "failed",
      attempts: 3,
      lastAttemptAt: new Date(),
      errorMessage: e.message,
    });
  }
}

export async function notifyAlertEvent(tenantId: number, eventMessage: string, severity: string, eventId: number, eventType: "triggered" | "ack" | "resolved" = "triggered"): Promise<void> {
  const settings = await storage.getNotificationSettings(tenantId);
  if (!settings) return;

  if (eventType === "ack" && !settings.notifyOnAck) return;
  if (eventType === "resolved" && !settings.notifyOnResolved) return;

  const severityFilter: string[] = (() => {
    try { return JSON.parse(settings.severityFilterJson); } catch { return ["critical", "high"]; }
  })();
  if (eventType === "triggered" && !severityFilter.includes(severity)) return;

  const recipients: string[] = (() => {
    try { return JSON.parse(settings.recipientsJson); } catch { return []; }
  })();
  if (recipients.length === 0) return;

  const prefix = eventType === "ack" ? "ACK" : eventType === "resolved" ? "RESOLVED" : severity.toUpperCase();
  const subject = `[${prefix}] Alert: ${eventMessage.slice(0, 100)}`;
  const htmlBody = `<h2>Alert Event (${eventType})</h2><p><strong>Severity:</strong> ${severity}</p><p>${eventMessage}</p><p><em>Sent by Xpansion Console</em></p>`;
  const senderEmail = settings.senderEmail || undefined;

  for (const recipient of recipients) {
    if (settings.emailEnabled) {
      await sendNotification(tenantId, "email", recipient, subject, htmlBody, "alert_event", String(eventId), senderEmail);
    }
  }

  if (settings.slackEnabled && settings.slackWebhookUrl) {
    await sendNotification(tenantId, "slack", settings.slackWebhookUrl, subject, eventMessage, "alert_event", String(eventId));
  }
}

export async function notifyReportReady(tenantId: number, reportName: string, runId: number): Promise<void> {
  const settings = await storage.getNotificationSettings(tenantId);
  if (!settings) return;

  const recipients: string[] = (() => {
    try { return JSON.parse(settings.recipientsJson); } catch { return []; }
  })();
  if (recipients.length === 0) return;

  const subject = `Report Ready: ${reportName}`;
  const htmlBody = `<h2>Report Completed</h2><p>The report <strong>${reportName}</strong> has finished running.</p><p><em>Sent by Xpansion Console</em></p>`;
  const senderEmail = settings.senderEmail || undefined;

  for (const recipient of recipients) {
    if (settings.emailEnabled) {
      await sendNotification(tenantId, "email", recipient, subject, htmlBody, "report_run", String(runId), senderEmail);
    }
  }

  if (settings.slackEnabled && settings.slackWebhookUrl) {
    await sendNotification(tenantId, "slack", settings.slackWebhookUrl, subject, `Report "${reportName}" completed`, "report_run", String(runId));
  }
}
