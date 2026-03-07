import { Router } from "express";
import { storage } from "./storage";
import { isAuthenticated } from "./replit_integrations/auth";
import { metricValues } from "@shared/schema";
import { db } from "./db";
import { eq, and, gte, lte, desc } from "drizzle-orm";

function ok(data: any) {
  return { ok: true, data };
}

function err(code: string, message: string, details?: any) {
  return { ok: false, error: { code, message, ...(details ? { details } : {}) } };
}

async function requireTenantAccess(req: any, res: any, tenantId: number) {
  const userId = req.user?.claims?.sub;
  if (!userId) { res.status(401).json(err("UNAUTHORIZED", "Unauthorized")); return null; }
  const tu = await storage.getTenantUserByUserId(tenantId, userId);
  if (!tu) { res.status(403).json(err("FORBIDDEN", "No access to this tenant")); return null; }
  return tu;
}

export const recommendationRouter = Router();

recommendationRouter.get("/tenants/:tenantId/recommendations/effectiveness", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;

    const entityType = req.query.entityType as string | undefined;
    const records = await storage.getRecommendationEffectiveness(tenantId, { entityType });

    const ranked = records
      .filter(r => r.upliftPercent !== null)
      .sort((a, b) => (b.upliftPercent || 0) - (a.upliftPercent || 0));

    res.json(ok({
      rankings: ranked,
      summary: {
        total: records.length,
        positiveUplift: records.filter(r => (r.upliftPercent || 0) > 0).length,
        negativeUplift: records.filter(r => (r.upliftPercent || 0) < 0).length,
        avgUplift: records.length > 0
          ? records.reduce((sum, r) => sum + (r.upliftPercent || 0), 0) / records.length
          : 0,
      },
    }));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

recommendationRouter.get("/tenants/:tenantId/recommendations/events", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;

    const entityType = req.query.entityType as string | undefined;
    const entityId = req.query.entityId ? parseInt(req.query.entityId as string) : undefined;
    const events = await storage.getRecommendationEvents(tenantId, { entityType, entityId });
    res.json(ok(events));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

recommendationRouter.post("/tenants/:tenantId/recommendations/compute-effectiveness", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;

    const windowDays = parseInt(req.query.windowDays as string) || 30;

    const completedEvents = await storage.getRecommendationEvents(tenantId, { entityType: "action" });
    const completionEvents = completedEvents.filter(e => e.eventType === "completed");

    let computed = 0;

    for (const event of completionEvents) {
      const action = await storage.getAction(event.entityId);
      if (!action || !action.metricDefinitionId || !action.locationId) continue;

      const existingEffectiveness = await storage.getRecommendationEffectiveness(tenantId, { entityType: "action" });
      const alreadyComputed = existingEffectiveness.find(e => e.entityId === event.entityId);
      if (alreadyComputed) continue;

      const completedAt = event.createdAt ? new Date(event.createdAt) : new Date();
      const preStart = new Date(completedAt.getTime() - windowDays * 24 * 60 * 60 * 1000);
      const postEnd = new Date(completedAt.getTime() + windowDays * 24 * 60 * 60 * 1000);

      const preValues = await db.select().from(metricValues)
        .where(and(
          eq(metricValues.metricDefinitionId, action.metricDefinitionId),
          eq(metricValues.locationId, action.locationId),
          gte(metricValues.periodStart, preStart),
          lte(metricValues.periodEnd, completedAt),
        ))
        .orderBy(desc(metricValues.periodStart));

      const postValues = await db.select().from(metricValues)
        .where(and(
          eq(metricValues.metricDefinitionId, action.metricDefinitionId),
          eq(metricValues.locationId, action.locationId),
          gte(metricValues.periodStart, completedAt),
          lte(metricValues.periodEnd, postEnd),
        ))
        .orderBy(desc(metricValues.periodStart));

      if (preValues.length === 0 || postValues.length === 0) continue;

      const preAvg = preValues.reduce((sum, v) => sum + v.value, 0) / preValues.length;
      const postAvg = postValues.reduce((sum, v) => sum + v.value, 0) / postValues.length;
      const upliftPercent = preAvg !== 0 ? ((postAvg - preAvg) / Math.abs(preAvg)) * 100 : 0;

      const confidenceScore = Math.min(1, (preValues.length + postValues.length) / 10);

      await storage.createRecommendationEffectiveness({
        tenantId,
        entityType: "action",
        entityId: event.entityId,
        metricDefinitionId: action.metricDefinitionId,
        preValue: preAvg,
        postValue: postAvg,
        upliftPercent: parseFloat(upliftPercent.toFixed(2)),
        confidenceScore: parseFloat(confidenceScore.toFixed(2)),
        measurementWindowDays: windowDays,
      });
      computed++;
    }

    res.json(ok({ computed }));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});
