import { Router } from "express";
import { storage } from "./storage";
import { isAuthenticated } from "./replit_integrations/auth";

function ok(data: any) { return { ok: true, data }; }
function err(code: string, message: string) { return { ok: false, error: { code, message } }; }

async function requireTenantAccess(req: any, res: any, tenantId: number) {
  const userId = req.user?.claims?.sub;
  if (!userId) { res.status(401).json(err("UNAUTHORIZED", "Unauthorized")); return null; }
  const authStorage = await import("./storage").then(m => m.storage);
  const users = await import("@shared/schema").then(m => m.users);
  const dbModule = await import("./db").then(m => m.db);
  const { eq } = await import("drizzle-orm");
  const [user] = await dbModule.select().from(users).where(eq(users.id, userId));
  if (user?.isSuperAdmin) return { role: "superadmin" };
  const tu = await authStorage.getTenantUserByUserId(tenantId, userId);
  if (!tu) { res.status(403).json(err("FORBIDDEN", "No access to this tenant")); return null; }
  return tu;
}

export const inboxRouter = Router();

inboxRouter.get("/tenants/:tenantId/inbox", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;

    const [
      actions,
      goals,
      opportunities,
      alertEvents,
      riskSnapshots,
    ] = await Promise.all([
      storage.getActions(tenantId),
      storage.getGoals(tenantId),
      storage.getOpportunities(tenantId),
      storage.getAlertEvents(tenantId),
      storage.getRiskSnapshots(tenantId, 20),
    ]);

    const blockedActions = actions.filter((a: any) => a.status === "blocked");
    const overdueActions = actions.filter((a: any) => a.status !== "done" && a.dueDate && new Date(a.dueDate) < new Date());
    const offTrackGoals = goals.filter((g: any) => g.status === "off_track" || g.status === "at_risk");
    const criticalAlerts = alertEvents.filter((e: any) => e.status === "open" && (e.severity === "critical" || e.severity === "high"));
    const highConfidenceOpps = opportunities
      .filter((o: any) => o.status === "open" && o.confidenceScore >= 0.6)
      .sort((a: any, b: any) => (b.confidenceScore || 0) - (a.confidenceScore || 0))
      .slice(0, 10);
    const topRisks = riskSnapshots
      .sort((a: any, b: any) => b.riskScore - a.riskScore)
      .slice(0, 10);

    const items: any[] = [];

    topRisks.forEach((r: any) => {
      items.push({
        type: "risk",
        urgency: Math.min(r.riskScore / 100, 1),
        id: r.id,
        title: `High risk: Location #${r.locationId} (score: ${r.riskScore})`,
        description: `Trend slope: ${r.trendSlope?.toFixed(2)}, Variance instability: ${r.varianceInstability?.toFixed(2)}`,
        entityId: r.locationId,
        factors: {
          riskScore: r.riskScore,
          trendSlope: r.trendSlope,
          varianceInstability: r.varianceInstability,
          alertBurden: r.alertBurden,
        },
        confidence: r.riskScore >= 80 ? 0.9 : r.riskScore >= 60 ? 0.7 : 0.5,
        lastRefresh: r.snapshotAt,
      });
    });

    blockedActions.forEach((a: any) => {
      items.push({
        type: "blocked_action",
        urgency: 0.85,
        id: a.id,
        title: `Blocked: ${a.title}`,
        description: a.description,
        entityId: a.id,
        factors: { status: a.status, priority: a.priority, dueDate: a.dueDate },
        confidence: 1.0,
        lastRefresh: a.updatedAt || a.createdAt,
      });
    });

    overdueActions.forEach((a: any) => {
      items.push({
        type: "overdue_action",
        urgency: 0.8,
        id: a.id,
        title: `Overdue: ${a.title}`,
        description: a.description,
        entityId: a.id,
        factors: { status: a.status, priority: a.priority, dueDate: a.dueDate, daysOverdue: Math.floor((Date.now() - new Date(a.dueDate).getTime()) / 86400000) },
        confidence: 1.0,
        lastRefresh: a.updatedAt || a.createdAt,
      });
    });

    offTrackGoals.forEach((g: any) => {
      items.push({
        type: "off_track_goal",
        urgency: 0.75,
        id: g.id,
        title: `Off-track goal: ${g.title}`,
        description: `Target: ${g.targetValue}, Current status: ${g.status}`,
        entityId: g.id,
        factors: { targetValue: g.targetValue, status: g.status, deadline: g.deadline },
        confidence: 0.9,
        lastRefresh: g.updatedAt || g.createdAt,
      });
    });

    criticalAlerts.forEach((e: any) => {
      items.push({
        type: "critical_alert",
        urgency: e.severity === "critical" ? 0.95 : 0.7,
        id: e.id,
        title: `Alert: ${e.message || "Critical alert triggered"}`,
        description: `Severity: ${e.severity}, Location: ${e.locationId || "N/A"}`,
        entityId: e.id,
        factors: { severity: e.severity, ruleId: e.ruleId, locationId: e.locationId, triggeredValue: e.triggeredValue },
        confidence: 1.0,
        lastRefresh: e.createdAt,
      });
    });

    highConfidenceOpps.forEach((o: any) => {
      items.push({
        type: "opportunity",
        urgency: (o.confidenceScore || 0.5) * 0.7,
        id: o.id,
        title: o.title,
        description: o.description,
        entityId: o.id,
        factors: {
          impactScore: o.impactScore,
          confidenceScore: o.confidenceScore,
          sourceType: o.sourceType,
          rationale: o.rationaleJson ? JSON.parse(o.rationaleJson) : null,
        },
        confidence: o.confidenceScore || 0.5,
        lastRefresh: o.updatedAt || o.createdAt,
        convertible: o.status === "open",
      });
    });

    items.sort((a, b) => b.urgency - a.urgency);

    res.json(ok({
      items,
      summary: {
        totalItems: items.length,
        topRisks: topRisks.length,
        blockedActions: blockedActions.length,
        overdueActions: overdueActions.length,
        offTrackGoals: offTrackGoals.length,
        criticalAlerts: criticalAlerts.length,
        opportunities: highConfidenceOpps.length,
      },
      generatedAt: new Date().toISOString(),
    }));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});
