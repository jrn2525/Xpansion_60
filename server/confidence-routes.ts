import { Router } from "express";
import { isAuthenticated } from "./replit_integrations/auth";
import { storage } from "./storage";
import { computeTenantConfidence, computeMetricConfidence, applyConfidenceWeight } from "./services/confidence-engine";

const ok = (data: any) => ({ ok: true, data });
const err = (code: string, message: string) => ({ ok: false, error: { code, message } });

async function requireTenantAccess(req: any, res: any, tenantId: number) {
  const userId = req.user?.claims?.sub;
  if (!userId) {
    res.status(401).json(err("UNAUTHORIZED", "Unauthorized"));
    return false;
  }
  const { authStorage: aStore } = await import("./replit_integrations/auth/storage");
  const dbUser = await aStore.getUser(userId);
  if (dbUser && (dbUser as any).isSuperAdmin === "true") return true;
  const tu = await storage.getTenantUserByUserId(tenantId, userId);
  if (!tu) {
    res.status(403).json(err("FORBIDDEN", "No access to this tenant"));
    return false;
  }
  return true;
}

export const confidenceRouter = Router();

confidenceRouter.get("/tenants/:tenantId/confidence", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const hasAccess = await requireTenantAccess(req, res, tenantId);
    if (!hasAccess) return;

    const persist = req.query.persist === "true";
    const result = await computeTenantConfidence(tenantId, persist);

    const locationSummary: Record<number, { locationId: number; avgConfidence: number; count: number; total: number }> = {};
    for (const m of result.metrics) {
      if (!locationSummary[m.locationId]) {
        locationSummary[m.locationId] = { locationId: m.locationId, avgConfidence: 0, count: 0, total: 0 };
      }
      locationSummary[m.locationId].count++;
      locationSummary[m.locationId].total += m.confidence.overallConfidence;
    }
    const locationConfidence = Object.values(locationSummary)
      .map((l) => ({
        ...l,
        avgConfidence: l.count > 0 ? parseFloat((l.total / l.count).toFixed(4)) : 0,
      }))
      .sort((a, b) => a.avgConfidence - b.avgConfidence);

    const distribution = {
      high: result.metrics.filter((m) => m.confidence.overallConfidence >= 0.8).length,
      medium: result.metrics.filter((m) => m.confidence.overallConfidence >= 0.5 && m.confidence.overallConfidence < 0.8).length,
      low: result.metrics.filter((m) => m.confidence.overallConfidence < 0.5).length,
    };

    res.json(
      ok({
        overallConfidence: result.overallConfidence,
        totalMetrics: result.metrics.length,
        distribution,
        locationConfidence,
        metrics: result.metrics,
        persisted: persist,
        computedAt: new Date().toISOString(),
      })
    );
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

confidenceRouter.get("/tenants/:tenantId/confidence/snapshots", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const hasAccess = await requireTenantAccess(req, res, tenantId);
    if (!hasAccess) return;

    const filters: { locationId?: number; metricDefinitionId?: number } = {};
    if (req.query.locationId) filters.locationId = parseInt(req.query.locationId as string);
    if (req.query.metricDefinitionId) filters.metricDefinitionId = parseInt(req.query.metricDefinitionId as string);

    const snapshots = await storage.getConfidenceSnapshots(tenantId, filters);
    res.json(ok(snapshots));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

confidenceRouter.get("/tenants/:tenantId/confidence/metric/:metricId/location/:locationId", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const hasAccess = await requireTenantAccess(req, res, tenantId);
    if (!hasAccess) return;

    const metricId = parseInt(req.params.metricId);
    const locationId = parseInt(req.params.locationId);

    const confidence = await computeMetricConfidence(tenantId, locationId, metricId);
    res.json(ok(confidence));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});
