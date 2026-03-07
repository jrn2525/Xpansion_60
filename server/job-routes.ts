import { Router } from "express";
import { storage } from "./storage";
import { isAuthenticated } from "./replit_integrations/auth";
import { enqueueJob } from "./services/job-queue";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";

function ok(data: any) {
  return { ok: true, data };
}

function err(code: string, message: string) {
  return { ok: false, error: { code, message } };
}

async function requireSuperadminOrAdmin(req: any, res: any): Promise<boolean> {
  const userId = req.user?.claims?.sub;
  if (!userId) {
    res.status(401).json(err("UNAUTHORIZED", "Unauthorized"));
    return false;
  }
  const userTenants = await storage.getUserTenants(userId);
  const hasAdmin = userTenants.some((tu) => tu.role === "owner" || tu.role === "admin");
  if (!hasAdmin) {
    res.status(403).json(err("FORBIDDEN", "Admin access required"));
    return false;
  }
  return true;
}

export const jobRouter = Router();
jobRouter.use(isAuthenticated);

const enqueueSchema = z.object({
  key: z.string().min(1),
  payload: z.any().default({}),
  tenantId: z.number().optional(),
  priority: z.number().optional(),
  maxRetries: z.number().optional(),
  idempotencyKey: z.string().optional(),
});

jobRouter.post("/jobs/:type/enqueue", async (req: any, res) => {
  try {
    if (!(await requireSuperadminOrAdmin(req, res))) return;

    const jobType = req.params.type;
    const validTypes = ["digest_generation", "risk_recompute", "campaign_impact", "scheduled_report", "notification_retry"];
    if (!validTypes.includes(jobType)) {
      return res.status(400).json(err("VALIDATION_ERROR", `Invalid job type. Must be one of: ${validTypes.join(", ")}`));
    }

    const parsed = enqueueSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(err("VALIDATION_ERROR", fromZodError(parsed.error).toString()));
    }

    const { key, payload, tenantId, priority, maxRetries, idempotencyKey } = parsed.data;
    const job = await enqueueJob(jobType, key, payload, { tenantId, priority, maxRetries, idempotencyKey });
    res.status(201).json(ok(job));
  } catch (error: any) {
    if (error.message?.includes("unique") || error.message?.includes("duplicate")) {
      return res.status(409).json(err("DUPLICATE", "Job with this idempotency key already exists"));
    }
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

jobRouter.get("/jobs/runs", async (req: any, res) => {
  try {
    if (!(await requireSuperadminOrAdmin(req, res))) return;

    const filters: { jobType?: string; status?: string; limit?: number } = {};
    if (req.query.jobType) filters.jobType = req.query.jobType as string;
    if (req.query.status) filters.status = req.query.status as string;
    if (req.query.limit) filters.limit = parseInt(req.query.limit as string);

    const runs = await storage.getJobRuns(filters);
    res.json(ok(runs));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

jobRouter.get("/jobs/dead-letters", async (req: any, res) => {
  try {
    if (!(await requireSuperadminOrAdmin(req, res))) return;

    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const deadLetters = await storage.getDeadLetters(limit);
    res.json(ok(deadLetters));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

jobRouter.get("/jobs/stats", async (req: any, res) => {
  try {
    if (!(await requireSuperadminOrAdmin(req, res))) return;

    const stats = await storage.getJobQueueStats();
    const runs = await storage.getJobRuns({ limit: 1000 });
    const completed = runs.filter(r => r.status === "completed");
    const total = runs.length;
    const successRate = total > 0 ? (completed.length / total * 100).toFixed(1) : "0.0";
    const totalRetries = runs.filter(r => r.status === "failed").length;
    const durations = completed.filter(r => r.durationMs).map(r => r.durationMs!).sort((a, b) => a - b);
    const p95Index = Math.floor(durations.length * 0.95);
    const p95Latency = durations.length > 0 ? durations[Math.min(p95Index, durations.length - 1)] : 0;

    res.json(ok({
      queueDepth: stats.pending,
      running: stats.running,
      completed: stats.completed,
      failed: stats.failed,
      deadLettered: stats.deadLettered,
      successRate: parseFloat(successRate),
      totalRetries,
      p95LatencyMs: p95Latency,
    }));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});
