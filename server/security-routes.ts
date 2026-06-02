import { Router } from "express";
import { isAuthenticated, isSuperAdminGuard } from "./auth/session";
import { clearAccountLockout, getLoginStats } from "./auth/routes";
import { storage } from "./storage";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { insertSecurityIpBlockSchema, insertIncidentNoteSchema } from "@shared/schema";
import { db } from "./db";
import { users } from "@shared/models/auth";
import { eq } from "drizzle-orm";

const ok = (data: any) => ({ ok: true, data });
const err = (code: string, message: string, details?: any) => ({
  ok: false,
  error: { code, message, ...(details ? { details } : {}) },
});

async function audit(actorUserId: string, entityType: string, entityId: string, action: string, details?: { before?: any; after?: any }) {
  const tenants = await storage.getTenants();
  const tenantId = tenants[0]?.id || 1;
  await storage.createAuditLog({
    tenantId,
    actorUserId,
    entityType,
    entityId,
    action,
    beforeJson: details?.before ? JSON.stringify(details.before) : null,
    afterJson: details?.after ? JSON.stringify(details.after) : null,
  });
}

export const securityRouter = Router();

securityRouter.use(isAuthenticated);
securityRouter.use(isSuperAdminGuard);

securityRouter.get("/security/dashboard", async (req: any, res) => {
  try {
    const loginStats = getLoginStats();
    const ipBlocks = await storage.getIpBlocks();
    const activeIpBlocks = ipBlocks.filter((b) => !b.expiresAt || b.expiresAt > new Date());
    const openIncidents = await storage.getIncidents({ status: "open" });
    const recentAuthLogs = await storage.getAuditLogsGlobal({ entityType: "auth", limit: 50 });

    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const failedLogins24h = recentAuthLogs.filter(
      (l) => l.action === "login_failed" && l.createdAt && l.createdAt > last24h
    ).length;
    const successLogins24h = recentAuthLogs.filter(
      (l) => l.action === "login_success" && l.createdAt && l.createdAt > last24h
    ).length;

    res.json(ok({
      metrics: {
        failedLogins24h,
        successLogins24h,
        activeIpBlocks: activeIpBlocks.length,
        openIncidents: openIncidents.length,
        lockedAccounts: loginStats.lockedAccounts,
        trackedIPs: loginStats.totalTrackedIPs,
      },
      recentAuthLogs: recentAuthLogs.slice(0, 20),
    }));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

securityRouter.get("/security/ip-blocks", async (_req, res) => {
  try {
    const blocks = await storage.getIpBlocks();
    res.json(ok(blocks));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

securityRouter.post("/security/ip-block", async (req: any, res) => {
  try {
    const schema = z.object({
      ipAddress: z.string().min(1),
      reason: z.string().optional(),
      expiresAt: z.string().datetime().optional().transform((v) => v ? new Date(v) : undefined),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(err("VALIDATION_ERROR", fromZodError(parsed.error).toString()));

    const existing = await storage.getIpBlockByAddress(parsed.data.ipAddress);
    if (existing) return res.status(409).json(err("CONFLICT", "IP already blocked"));

    const block = await storage.createIpBlock({
      ipAddress: parsed.data.ipAddress,
      reason: parsed.data.reason || null,
      blockedBy: req.user.claims.sub,
      expiresAt: parsed.data.expiresAt || null,
    });

    await audit(req.user.claims.sub, "security", block.id.toString(), "ip_block_created", { after: { ipAddress: parsed.data.ipAddress, reason: parsed.data.reason } });
    res.status(201).json(ok(block));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

securityRouter.delete("/security/ip-block/:blockId", async (req: any, res) => {
  try {
    const blockId = parseInt(req.params.blockId);
    if (isNaN(blockId)) return res.status(400).json(err("VALIDATION_ERROR", "Invalid block ID"));

    const deleted = await storage.deleteIpBlock(blockId);
    if (!deleted) return res.status(404).json(err("NOT_FOUND", "IP block not found"));

    await audit(req.user.claims.sub, "security", blockId.toString(), "ip_block_deleted");
    res.json(ok({ deleted: true }));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

securityRouter.post("/security/users/:userId/force-logout", async (req: any, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body || {};

    const [targetUser] = await db.select().from(users).where(eq(users.id, userId));
    if (!targetUser) return res.status(404).json(err("NOT_FOUND", "User not found"));

    const count = await storage.deleteSessionsByUserId(userId);

    await audit(req.user.claims.sub, "security", userId, "force_logout", { after: { reason, sessionsDestroyed: count } });
    res.json(ok({ userId, sessionsDestroyed: count }));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

securityRouter.post("/security/users/:userId/unlock", async (req: any, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body || {};

    const [targetUser] = await db.select().from(users).where(eq(users.id, userId));
    if (!targetUser) return res.status(404).json(err("NOT_FOUND", "User not found"));

    const email = targetUser.email;
    const wasLocked = email ? clearAccountLockout(email) : false;

    await audit(req.user.claims.sub, "security", userId, "account_unlocked", { after: { reason, email, wasLocked } });
    res.json(ok({ userId, email, wasLocked }));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

securityRouter.get("/incidents", async (req: any, res) => {
  try {
    const filters: any = {};
    if (req.query.status) filters.status = req.query.status;
    if (req.query.severity) filters.severity = req.query.severity;
    if (req.query.type) filters.type = req.query.type;
    if (req.query.tenantId) filters.tenantId = parseInt(req.query.tenantId);

    const incidents = await storage.getIncidents(filters);
    res.json(ok(incidents));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

securityRouter.get("/incidents/:incidentId", async (req: any, res) => {
  try {
    const id = parseInt(req.params.incidentId);
    if (isNaN(id)) return res.status(400).json(err("VALIDATION_ERROR", "Invalid incident ID"));

    const incident = await storage.getIncident(id);
    if (!incident) return res.status(404).json(err("NOT_FOUND", "Incident not found"));

    const notes = await storage.getIncidentNotes(id);
    res.json(ok({ ...incident, notes }));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

securityRouter.post("/incidents/:incidentId/acknowledge", async (req: any, res) => {
  try {
    const id = parseInt(req.params.incidentId);
    if (isNaN(id)) return res.status(400).json(err("VALIDATION_ERROR", "Invalid incident ID"));

    const incident = await storage.getIncident(id);
    if (!incident) return res.status(404).json(err("NOT_FOUND", "Incident not found"));
    if (incident.status !== "open") return res.status(400).json(err("INVALID_STATE", "Incident is not open"));

    const updated = await storage.updateIncident(id, {
      status: "acknowledged",
      acknowledgedBy: req.user.claims.sub,
      acknowledgedAt: new Date(),
    });

    await audit(req.user.claims.sub, "incident", id.toString(), "incident_acknowledged", { before: { status: "open" }, after: { status: "acknowledged" } });
    res.json(ok(updated));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

securityRouter.post("/incidents/:incidentId/resolve", async (req: any, res) => {
  try {
    const id = parseInt(req.params.incidentId);
    if (isNaN(id)) return res.status(400).json(err("VALIDATION_ERROR", "Invalid incident ID"));

    const incident = await storage.getIncident(id);
    if (!incident) return res.status(404).json(err("NOT_FOUND", "Incident not found"));
    if (incident.status === "resolved") return res.status(400).json(err("INVALID_STATE", "Incident already resolved"));

    const updated = await storage.updateIncident(id, {
      status: "resolved",
      resolvedBy: req.user.claims.sub,
      resolvedAt: new Date(),
    });

    await audit(req.user.claims.sub, "incident", id.toString(), "incident_resolved", { before: { status: incident.status }, after: { status: "resolved" } });
    res.json(ok(updated));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

securityRouter.post("/incidents/:incidentId/notes", async (req: any, res) => {
  try {
    const incidentId = parseInt(req.params.incidentId);
    if (isNaN(incidentId)) return res.status(400).json(err("VALIDATION_ERROR", "Invalid incident ID"));

    const incident = await storage.getIncident(incidentId);
    if (!incident) return res.status(404).json(err("NOT_FOUND", "Incident not found"));

    const schema = z.object({ content: z.string().min(1).max(5000) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(err("VALIDATION_ERROR", fromZodError(parsed.error).toString()));

    const note = await storage.createIncidentNote({
      incidentId,
      authorUserId: req.user.claims.sub,
      content: parsed.data.content,
    });

    await audit(req.user.claims.sub, "incident", incidentId.toString(), "incident_note_added", { after: { noteId: note.id } });
    res.status(201).json(ok(note));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

securityRouter.get("/activity", async (req: any, res) => {
  try {
    const filters: any = {};
    if (req.query.entityType) filters.entityType = req.query.entityType;
    if (req.query.action) filters.action = req.query.action;
    if (req.query.actorUserId) filters.actorUserId = req.query.actorUserId;
    if (req.query.start) filters.start = new Date(req.query.start);
    if (req.query.end) filters.end = new Date(req.query.end);
    if (req.query.limit) filters.limit = parseInt(req.query.limit);
    if (req.query.offset) filters.offset = parseInt(req.query.offset);

    const logs = await storage.getAuditLogsGlobal(filters);
    res.json(ok(logs));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

securityRouter.get("/ops/health", async (req: any, res) => {
  try {
    const uptime = process.uptime();
    const memUsage = process.memoryUsage();

    let dbStatus = "unknown";
    const schedulerRuns = await storage.getSchedulerRuns(null);
    dbStatus = "connected";
    const recentRuns = schedulerRuns.slice(0, 20);

    const failedRuns = recentRuns.filter((r) => r.status === "failed").length;
    const completedRuns = recentRuns.filter((r) => r.status === "completed").length;

    let jobQueueMetrics = null;
    try {
      const stats = await storage.getJobQueueStats();
      const runs = await storage.getJobRuns({ limit: 1000 });
      const completedJobs = runs.filter(r => r.status === "completed");
      const totalJobs = runs.length;
      const successRate = totalJobs > 0 ? parseFloat((completedJobs.length / totalJobs * 100).toFixed(1)) : 0;
      const totalRetries = runs.filter(r => r.status === "failed").length;
      const durations = completedJobs.filter(r => r.durationMs).map(r => r.durationMs!).sort((a, b) => a - b);
      const p95Index = Math.floor(durations.length * 0.95);
      const p95LatencyMs = durations.length > 0 ? durations[Math.min(p95Index, durations.length - 1)] : 0;

      const tenantErrors: Record<string, number> = {};
      const failedJobRuns = runs.filter(r => r.status === "failed");
      for (const run of failedJobRuns) {
        const key = String((run as any).workerKey || "unknown");
        tenantErrors[key] = (tenantErrors[key] || 0) + 1;
      }

      jobQueueMetrics = {
        queueDepth: stats.pending,
        running: stats.running,
        completed: stats.completed,
        failed: stats.failed,
        deadLettered: stats.deadLettered,
        successRate,
        totalRetries,
        p95LatencyMs,
        tenantErrors,
      };
    } catch (e) {
      console.error("[OPS] Error fetching job queue metrics:", e);
    }

    res.json(ok({
      uptime: Math.floor(uptime),
      uptimeFormatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
      dbStatus,
      memory: {
        rss: Math.round(memUsage.rss / 1024 / 1024),
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      },
      scheduler: {
        recentRuns,
        summary: { total: recentRuns.length, completed: completedRuns, failed: failedRuns },
      },
      jobQueue: jobQueueMetrics,
    }));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});
