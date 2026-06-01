import { storage } from "../storage";
import type { JobQueueEntry } from "@shared/schema";

const WORKER_KEY = `worker-${process.pid}-${Date.now()}`;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 300000;
const STALE_LOCK_TIMEOUT_MINUTES = 5;
const MAX_CONCURRENT_PER_TENANT = 5;
const POLL_INTERVAL_MS = 5000;

let processorInterval: ReturnType<typeof setInterval> | null = null;

type JobHandler = (payload: any, job: JobQueueEntry) => Promise<void>;

const jobHandlers: Record<string, JobHandler> = {
  digest_generation: async () => {
    throw new Error("digest_generation handler removed during BI cleanup");
  },
  risk_recompute: async (payload) => {
    const { computeTenantRisk } = await import("./risk-engine");
    await computeTenantRisk(payload.tenantId);
  },
  campaign_impact: async (payload) => {
    console.log(`[JOB] campaign_impact for tenant ${payload.tenantId}, campaign ${payload.campaignId}`);
  },
  scheduled_report: async (payload) => {
    const report = await storage.getReport(payload.reportId);
    if (!report) throw new Error(`Report ${payload.reportId} not found`);
    const reportRun = await storage.createReportRun({
      reportId: report.id,
      tenantId: report.tenantId,
      status: "running",
      startedAt: new Date(),
    });
    await storage.updateReportRun(reportRun.id, {
      status: "completed",
      completedAt: new Date(),
    });
  },
  notification_retry: async (payload) => {
    const delivery = await storage.getNotificationDeliveries(payload.tenantId);
    const pending = delivery.find(d => d.id === payload.deliveryId && d.status === "pending");
    if (pending) {
      const { sendNotification } = await import("./notifications");
      await sendNotification(pending.tenantId, pending.channel as any, pending.recipientAddress, pending.subjectOrTitle, pending.bodyPreview || "");
      await storage.updateNotificationDelivery(pending.id, { status: "delivered", lastAttemptAt: new Date() });
    }
  },
};

export function registerJobHandler(type: string, handler: JobHandler): void {
  jobHandlers[type] = handler;
}

export async function enqueueJob(
  type: string,
  key: string,
  payload: any,
  opts?: { tenantId?: number; priority?: number; maxRetries?: number; idempotencyKey?: string }
): Promise<JobQueueEntry> {
  const idempotencyKey = opts?.idempotencyKey || `${type}:${key}`;
  return storage.enqueueJob({
    jobType: type,
    jobKey: key,
    tenantId: opts?.tenantId || null,
    payload,
    status: "pending",
    idempotencyKey,
    priority: opts?.priority || 0,
    maxRetries: opts?.maxRetries || 3,
    retryCount: 0,
    nextRunAt: new Date(),
    lockedAt: null,
    lockedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

async function checkTenantConcurrency(tenantId: number | null): Promise<boolean> {
  if (!tenantId) return true;
  const { db } = await import("../db");
  const { jobQueue } = await import("@shared/schema");
  const { eq, and, sql } = await import("drizzle-orm");
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(jobQueue)
    .where(and(eq(jobQueue.tenantId, tenantId), eq(jobQueue.status, "running")));
  return (result?.count || 0) < MAX_CONCURRENT_PER_TENANT;
}

export async function processJobs(): Promise<number> {
  let processed = 0;

  await storage.releaseStaleJobs(STALE_LOCK_TIMEOUT_MINUTES);

  const maxBatch = 5;
  for (let i = 0; i < maxBatch; i++) {
    const job = await storage.claimJob(WORKER_KEY);
    if (!job) break;

    if (!(await checkTenantConcurrency(job.tenantId))) {
      await storage.failJob(job.id, "Tenant concurrency limit reached", 0);
      continue;
    }

    const handler = jobHandlers[job.jobType];
    if (!handler) {
      await storage.failJob(job.id, `No handler registered for job type: ${job.jobType}`, 0);
      processed++;
      continue;
    }

    const startTime = Date.now();
    try {
      await handler(job.payload, job);
      const durationMs = Date.now() - startTime;
      await storage.completeJob(job.id, durationMs);
      console.log(`[JOB] Completed ${job.jobType}:${job.jobKey} in ${durationMs}ms`);
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      await storage.failJob(job.id, error.message || "Unknown error", durationMs);
      console.error(`[JOB] Failed ${job.jobType}:${job.jobKey}: ${error.message}`);
    }
    processed++;
  }

  return processed;
}

export function startJobProcessor(): void {
  if (processorInterval) return;
  console.log(`[JOB-QUEUE] Starting job processor (${POLL_INTERVAL_MS}ms interval)`);
  processorInterval = setInterval(async () => {
    try {
      await processJobs();
    } catch (e) {
      console.error("[JOB-QUEUE] Error in job processor:", e);
    }
  }, POLL_INTERVAL_MS);

  setTimeout(() => processJobs().catch(console.error), 2000);
}

export function stopJobProcessor(): void {
  if (processorInterval) {
    clearInterval(processorInterval);
    processorInterval = null;
    console.log("[JOB-QUEUE] Stopped job processor");
  }
}
