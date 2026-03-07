import { Router } from "express";
import { storage } from "./storage";
import { isAuthenticated, isSuperAdminGuard } from "./replit_integrations/auth/replitAuth";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { createHash } from "crypto";

const ok = (data: any) => ({ ok: true, data });
const err = (code: string, message: string, details?: any) => ({
  ok: false,
  error: { code, message, ...(details ? { details } : {}) },
});

const PERMISSION_MAP: Record<string, Record<string, string[]>> = {
  actions: { read: ["viewer", "editor", "admin", "owner"], write: ["editor", "admin", "owner"], delete: ["admin", "owner"] },
  opportunities: { read: ["viewer", "editor", "admin", "owner"], write: ["editor", "admin", "owner"], delete: ["admin", "owner"] },
  goals: { read: ["viewer", "editor", "admin", "owner"], write: ["editor", "admin", "owner"], delete: ["admin", "owner"] },
  playbooks: { read: ["viewer", "editor", "admin", "owner"], write: ["editor", "admin", "owner"], delete: ["admin", "owner"] },
  locations: { read: ["viewer", "editor", "admin", "owner"], write: ["admin", "owner"], delete: ["admin", "owner"] },
  metrics: { read: ["viewer", "editor", "admin", "owner"], write: ["admin", "owner"], delete: ["admin", "owner"] },
  scorecards: { read: ["viewer", "editor", "admin", "owner"], write: ["admin", "owner"], delete: ["admin", "owner"] },
  alerts: { read: ["viewer", "editor", "admin", "owner"], write: ["admin", "owner"], delete: ["admin", "owner"] },
  reports: { read: ["viewer", "editor", "admin", "owner"], write: ["admin", "owner"], delete: ["admin", "owner"] },
  settings: { read: ["admin", "owner"], write: ["admin", "owner"], delete: ["owner"] },
  users: { read: ["admin", "owner"], write: ["admin", "owner"], delete: ["owner"] },
  campaigns: { read: ["viewer", "editor", "admin", "owner"], write: ["editor", "admin", "owner"], delete: ["admin", "owner"] },
  digests: { read: ["viewer", "editor", "admin", "owner"], write: ["admin", "owner"], delete: ["admin", "owner"] },
  confidence: { read: ["viewer", "editor", "admin", "owner"], write: ["admin", "owner"], delete: ["admin", "owner"] },
  recommendations: { read: ["viewer", "editor", "admin", "owner"], write: ["editor", "admin", "owner"], delete: ["admin", "owner"] },
};

export async function checkPermission(tenantId: number, userId: string, resource: string, action: string): Promise<boolean> {
  const tu = await storage.getTenantUserByUserId(tenantId, userId);
  if (!tu) return false;
  const resourcePerms = PERMISSION_MAP[resource];
  if (!resourcePerms) return false;
  const allowedRoles = resourcePerms[action];
  if (!allowedRoles) return false;
  return allowedRoles.includes(tu.role);
}

export async function computeAuditHash(
  entityType: string,
  entityId: string,
  action: string,
  actorUserId: string,
  createdAt: Date
): Promise<string> {
  const payload = `${entityType}|${entityId}|${action}|${actorUserId}|${createdAt.toISOString()}`;
  return createHash("sha256").update(payload).digest("hex");
}

export async function auditWithHash(
  tenantId: number,
  actorUserId: string,
  entityType: string,
  entityId: string,
  action: string,
  before?: any,
  after?: any
) {
  const auditLog = await storage.createAuditLog({
    tenantId,
    actorUserId,
    entityType,
    entityId: String(entityId),
    action,
    beforeJson: before ? JSON.stringify(before) : undefined,
    afterJson: after ? JSON.stringify(after) : undefined,
  });

  const createdAt = auditLog.createdAt || new Date();
  const eventHash = await computeAuditHash(entityType, String(entityId), action, actorUserId, createdAt);
  const prevHash = await storage.getLatestAuditLogHash(tenantId);

  await storage.updateAuditLogHash(auditLog.id, eventHash, prevHash);

  return auditLog;
}

export const securityV1Router = Router();

securityV1Router.use(isAuthenticated);
securityV1Router.use(isSuperAdminGuard);

securityV1Router.post("/superadmin/break-glass/start", async (req: any, res) => {
  try {
    const schema = z.object({
      reason: z.string().min(1).max(2000),
      expiryMinutes: z.number().int().min(1).max(1440).optional().default(60),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(err("VALIDATION_ERROR", fromZodError(parsed.error).toString()));

    const userId = req.user.claims.sub;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + parsed.data.expiryMinutes * 60 * 1000);

    const session = await storage.createBreakGlassSession({
      userId,
      reason: parsed.data.reason,
      startedAt: now,
      expiresAt,
    });

    await storage.createSecurityAccessEvent({
      userId,
      eventType: "break_glass_start",
      ipAddress: req.ip || req.connection?.remoteAddress || "unknown",
      metadata: { sessionId: session.id, reason: parsed.data.reason, expiryMinutes: parsed.data.expiryMinutes },
    });

    await auditWithHash(1, userId, "break_glass", String(session.id), "start", null, {
      reason: parsed.data.reason,
      expiresAt: expiresAt.toISOString(),
    });

    res.status(201).json(ok(session));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

securityV1Router.post("/superadmin/break-glass/end", async (req: any, res) => {
  try {
    const schema = z.object({
      sessionId: z.number().int(),
      endedReason: z.string().min(1).max(2000).optional().default("Manual end"),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(err("VALIDATION_ERROR", fromZodError(parsed.error).toString()));

    const userId = req.user.claims.sub;

    const existing = await storage.getBreakGlassSession(parsed.data.sessionId);
    if (!existing) return res.status(404).json(err("NOT_FOUND", "Break-glass session not found"));
    if (!existing.isActive) return res.status(400).json(err("INVALID_STATE", "Session is already ended"));

    const session = await storage.endBreakGlassSession(parsed.data.sessionId, parsed.data.endedReason);

    await storage.createSecurityAccessEvent({
      userId,
      eventType: "break_glass_end",
      ipAddress: req.ip || req.connection?.remoteAddress || "unknown",
      metadata: { sessionId: session.id, endedReason: parsed.data.endedReason },
    });

    await auditWithHash(1, userId, "break_glass", String(session.id), "end", { isActive: true }, {
      isActive: false,
      endedReason: parsed.data.endedReason,
    });

    res.json(ok(session));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

securityV1Router.get("/superadmin/break-glass/active", async (req: any, res) => {
  try {
    const sessions = await storage.getActiveBreakGlassSessions();
    res.json(ok(sessions));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});
