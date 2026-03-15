import { Router } from "express";
import { storage } from "./storage";
import { isAuthenticated } from "./replit_integrations/auth";
import {
  insertActionSchema,
  insertActionCheckinSchema,
  insertGoalSchema,
  insertPlaybookSchema,
  insertPlaybookStepSchema,
  insertDigestScheduleSchema,
  insertBenchmarkingConfigSchema,
  insertCampaignSchema,
  metricValues,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { parseIntOrThrow, ValidationError } from "./utils";

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

async function requireAdminAccess(req: any, res: any, tenantId: number) {
  const tu = await requireTenantAccess(req, res, tenantId);
  if (!tu) return null;
  if (!["owner", "admin"].includes(tu.role)) {
    res.status(403).json(err("FORBIDDEN", "Admin access required"));
    return null;
  }
  return tu;
}

async function audit(tenantId: number, actorUserId: string, entityType: string, entityId: string, action: string, before?: any, after?: any) {
  const { auditWithHash } = await import("./security-v1-routes");
  await auditWithHash(tenantId, actorUserId, entityType, entityId, action, before, after);
}

export function getWeekKey(date: Date = new Date()): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dayOfWeek = d.getDay();
  const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  d.setDate(diff);
  return `${d.getFullYear()}-W${String(Math.ceil((((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000) + 1) / 7)).padStart(2, "0")}`;
}

export const phase5Router = Router();

// ── Weekly Command Center ──

phase5Router.get("/tenants/:tenantId/weekly-command-center", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;

    const [allActions, allGoals, alertEvents, allOpportunities, locs] = await Promise.all([
      storage.getActions(tenantId),
      storage.getGoals(tenantId),
      storage.getAlertEvents(tenantId, { status: "open" }),
      storage.getOpportunities(tenantId),
      storage.getLocations(tenantId),
    ]);

    const now = new Date();
    const overdueActions = allActions.filter(a => a.dueDate && new Date(a.dueDate) < now && a.status !== "done");
    const blockedActions = allActions.filter(a => a.status === "blocked");
    const recentDone = allActions.filter(a => a.status === "done").slice(0, 3);
    const offTrackGoals = allGoals.filter(g => g.status === "off_track" || g.status === "at_risk");
    const criticalAlerts = alertEvents.filter(e => e.severity === "critical" || e.severity === "high");

    const wins = recentDone.map(a => ({ type: "action_completed", title: a.title, id: a.id }));
    const risks = [
      ...offTrackGoals.map(g => ({ type: "goal_off_track", title: g.title, id: g.id })),
      ...overdueActions.map(a => ({ type: "action_overdue", title: a.title, id: a.id })),
    ].slice(0, 5);

    const locationIdsNeedingIntervention = new Set<number>();
    criticalAlerts.forEach(a => { if (a.locationId) locationIdsNeedingIntervention.add(a.locationId); });
    overdueActions.forEach(a => { if (a.locationId) locationIdsNeedingIntervention.add(a.locationId); });
    const locationsNeedingIntervention = locs.filter(l => locationIdsNeedingIntervention.has(l.id));

    const priorities = [
      ...criticalAlerts.slice(0, 3).map(a => ({ type: "alert", title: a.message, severity: a.severity, sourceId: a.id })),
      ...overdueActions.slice(0, 3).map(a => ({ type: "overdue_action", title: a.title, dueDate: a.dueDate, sourceId: a.id })),
      ...offTrackGoals.slice(0, 3).map(g => ({ type: "off_track_goal", title: g.title, sourceId: g.id })),
      ...allOpportunities.filter(o => o.status === "open" && o.impactScore === "high").slice(0, 3).map(o => ({ type: "opportunity", title: o.title, impactScore: o.impactScore, sourceId: o.id })),
    ];

    res.json(ok({
      wins,
      risks,
      criticalAlerts: criticalAlerts.slice(0, 5),
      locationsNeedingIntervention,
      priorities,
      stats: {
        totalActions: allActions.length,
        openActions: allActions.filter(a => a.status === "open" || a.status === "in_progress").length,
        overdueActions: overdueActions.length,
        blockedActions: blockedActions.length,
        totalGoals: allGoals.length,
        offTrackGoals: offTrackGoals.length,
        openOpportunities: allOpportunities.filter(o => o.status === "open").length,
        openAlerts: alertEvents.length,
      },
    }));
  } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.post("/tenants/:tenantId/weekly-command-center/refresh", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;

    const [metrics, locs] = await Promise.all([
      storage.getMetricDefinitions(tenantId),
      storage.getLocations(tenantId),
    ]);

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const generated: any[] = [];

    for (const metric of metrics.slice(0, 10)) {
      for (const loc of locs.filter(l => l.isActive)) {
        const values = await storage.getMetricTrends(metric.id, loc.id, "weekly", thirtyDaysAgo, now);
        if (values.length >= 3) {
          const recent = values.slice(-3);
          const isDecreasing = metric.direction === "higher_is_better" &&
            recent.every((v, i) => i === 0 || v.value < recent[i - 1].value);
          const isIncreasing = metric.direction === "lower_is_better" &&
            recent.every((v, i) => i === 0 || v.value > recent[i - 1].value);

          if (isDecreasing || isIncreasing) {
            const existing = (await storage.getOpportunities(tenantId)).find(
              o => o.metricDefinitionId === metric.id && o.locationId === loc.id && o.status === "open"
            );
            if (!existing) {
              const vals = recent.map(v => v.value);
              const magnitude = Math.abs(vals[2] - vals[0]) / (Math.abs(vals[0]) || 1);
              const severity = magnitude > 0.2 ? 3 : magnitude > 0.1 ? 2 : 1;
              const duration = 3;
              const impact = severity * duration;
              const impactLabel = impact >= 6 ? "high" : impact >= 3 ? "medium" : "low";
              const priorityLabel = impact >= 8 ? "critical" : impact >= 5 ? "high" : impact >= 3 ? "medium" : "low";
              const confidence = Math.min(0.95, 0.5 + magnitude + (duration * 0.1));
              const rationale = {
                factors: [
                  { label: "Trend direction", value: isDecreasing ? "Declining" : "Increasing (bad)" },
                  { label: "Magnitude", value: `${(magnitude * 100).toFixed(1)}% change` },
                  { label: "Duration", value: `${duration} consecutive periods` },
                  { label: "Business impact", value: impactLabel },
                ],
                summary: `${metric.name} at ${loc.name} has moved ${(magnitude * 100).toFixed(1)}% in an unfavorable direction over ${duration} periods.`,
              };
              const opp = await storage.createOpportunity({
                tenantId,
                locationId: loc.id,
                metricDefinitionId: metric.id,
                title: `${metric.name} declining at ${loc.name}`,
                description: rationale.summary,
                impactScore: impactLabel,
                sourceType: "trend_decline",
                status: "open",
                priority: priorityLabel,
                confidenceScore: parseFloat(confidence.toFixed(2)),
                rationaleJson: JSON.stringify(rationale),
              });
              generated.push(opp);
            }
          }
        }
      }
    }

    const goals = await storage.getGoals(tenantId);
    for (const goal of goals) {
      if (goal.metricDefinitionId && goal.locationId) {
        const values = await storage.getMetricTrends(goal.metricDefinitionId, goal.locationId, goal.period, goal.startDate, goal.endDate);
        const latestValue = values.length > 0 ? values[values.length - 1].value : null;
        const variance = latestValue !== null ? ((latestValue - goal.targetValue) / goal.targetValue) * 100 : null;
        const newStatus = variance === null ? goal.status :
          variance >= -5 ? "on_track" :
          variance >= -15 ? "at_risk" : "off_track";
        const newConsecutiveOffTrack = newStatus === "off_track" ? (goal.consecutiveOffTrack || 0) + 1 : 0;
        await storage.updateGoal(goal.id, {
          currentValue: latestValue,
          status: newStatus,
          consecutiveOffTrack: newConsecutiveOffTrack,
        } as any);
      }
    }

    await audit(tenantId, req.user.claims.sub, "command_center", String(tenantId), "refresh");
    res.json(ok({ opportunitiesGenerated: generated.length, goalsUpdated: goals.length }));
  } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

// ── Actions ──

phase5Router.get("/tenants/:tenantId/actions", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;

    const filters: any = {};
    if (req.query.status) filters.status = req.query.status;
    if (req.query.owner) filters.ownerUserId = req.query.owner;
    if (req.query.locationId) filters.locationId = parseIntOrThrow(req.query.locationId as string, "locationId");
    if (req.query.overdue === "true") filters.overdue = true;

    const data = await storage.getActions(tenantId, filters);
    res.json(ok(data));
  } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.post("/tenants/:tenantId/actions", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;

    const body = { ...req.body, tenantId };
    if (body.dueDate && typeof body.dueDate === "string") body.dueDate = new Date(body.dueDate);
    const parsed = insertActionSchema.safeParse(body);
    if (!parsed.success) return res.status(400).json(err("VALIDATION_ERROR", fromZodError(parsed.error).toString()));

    const action = await storage.createAction(parsed.data);
    await audit(tenantId, req.user.claims.sub, "action", String(action.id), "create", null, action);
    res.status(201).json(ok(action));
  } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.put("/tenants/:tenantId/actions/bulk-status", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;

    const bulkStatusSchema = z.object({
      actionIds: z.array(z.coerce.number()).min(1, "actionIds must be a non-empty array"),
      status: z.enum(["open", "in_progress", "blocked", "done"]),
    });
    const parsed = bulkStatusSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(err("VALIDATION_ERROR", fromZodError(parsed.error).toString()));
    const { actionIds, status } = parsed.data;

    const updated: any[] = [];
    for (const id of actionIds) {
      const existing = await storage.getAction(id);
      if (existing && existing.tenantId === tenantId) {
        const action = await storage.updateAction(id, { status });
        updated.push(action);
      }
    }

    await audit(tenantId, req.user.claims.sub, "action", actionIds.join(","), "bulk_status_update", null, { status, count: updated.length });
    res.json(ok({ updated: updated.length }));
  } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.put("/tenants/:tenantId/actions/:actionId", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
    const actionId = parseIntOrThrow(req.params.actionId, "actionId");
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;

    const existing = await storage.getAction(actionId);
    if (!existing || existing.tenantId !== tenantId) return res.status(404).json(err("NOT_FOUND", "Action not found"));

    const updateActionSchema = z.object({
      title: z.string().min(1).optional(),
      description: z.string().nullable().optional(),
      status: z.enum(["open", "in_progress", "blocked", "done"]).optional(),
      priority: z.string().optional(),
      ownerUserId: z.string().optional(),
      locationId: z.coerce.number().nullable().optional(),
      metricDefinitionId: z.coerce.number().nullable().optional(),
      dueDate: z.union([z.string(), z.date()]).nullable().optional(),
      sourceType: z.string().nullable().optional(),
      sourceId: z.coerce.number().nullable().optional(),
    }).passthrough();
    const parsed = updateActionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(err("VALIDATION_ERROR", fromZodError(parsed.error).toString()));

    const action = await storage.updateAction(actionId, parsed.data);

    if (parsed.data.status === "done" && existing.status !== "done") {
      try {
        await storage.createRecommendationEvent({
          tenantId,
          entityType: "action",
          entityId: actionId,
          eventType: "completed",
          userId: req.user.claims.sub,
          metadata: { previousStatus: existing.status },
        });

        if (action && action.metricDefinitionId && action.locationId) {
          const windowDays = 30;
          const now = new Date();
          const preStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

          const preValues = await db.select().from(metricValues)
            .where(and(
              eq(metricValues.metricDefinitionId, action.metricDefinitionId),
              eq(metricValues.locationId, action.locationId),
              gte(metricValues.periodStart, preStart),
              lte(metricValues.periodEnd, now),
            ));

          if (preValues.length > 0) {
            const preAvg = preValues.reduce((sum: number, v: any) => sum + v.value, 0) / preValues.length;
            await storage.createRecommendationEffectiveness({
              tenantId,
              entityType: "action",
              entityId: actionId,
              metricDefinitionId: action.metricDefinitionId,
              preValue: preAvg,
              postValue: null,
              upliftPercent: null,
              confidenceScore: 0.1,
              measurementWindowDays: windowDays,
            });
          }
        }
      } catch (_) {}
    }

    await audit(tenantId, req.user.claims.sub, "action", String(actionId), "update", existing, action);
    res.json(ok(action));
  } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.post("/tenants/:tenantId/actions/:actionId/checkins", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
    const actionId = parseIntOrThrow(req.params.actionId, "actionId");
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;

    const existing = await storage.getAction(actionId);
    if (!existing || existing.tenantId !== tenantId) return res.status(404).json(err("NOT_FOUND", "Action not found"));

    const parsed = insertActionCheckinSchema.safeParse({
      actionId,
      userId: req.user.claims.sub,
      note: req.body.note,
    });
    if (!parsed.success) return res.status(400).json(err("VALIDATION_ERROR", fromZodError(parsed.error).toString()));

    const checkin = await storage.createActionCheckin(parsed.data);
    await audit(tenantId, req.user.claims.sub, "action_checkin", String(checkin.id), "create", null, checkin);
    res.status(201).json(ok(checkin));
  } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.get("/tenants/:tenantId/actions/:actionId/checkins", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
    const actionId = parseIntOrThrow(req.params.actionId, "actionId");
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;

    const checkins = await storage.getActionCheckins(actionId);
    res.json(ok(checkins));
  } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});


// ── Opportunities ──

phase5Router.get("/tenants/:tenantId/opportunities", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;
    const data = await storage.getOpportunities(tenantId);

    const userId = req.user?.claims?.sub;
    for (const opp of data) {
      try {
        await storage.createRecommendationEvent({
          tenantId,
          entityType: "opportunity",
          entityId: opp.id,
          eventType: "viewed",
          userId: userId || null,
          metadata: null,
        });
      } catch (_) {}
    }

    res.json(ok(data));
  } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.post("/tenants/:tenantId/opportunities/:id/create-action", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
    const oppId = parseIntOrThrow(req.params.id, "id");
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;

    const opp = await storage.getOpportunity(oppId);
    if (!opp || opp.tenantId !== tenantId) return res.status(404).json(err("NOT_FOUND", "Opportunity not found"));

    const createFromOppSchema = z.object({
      title: z.string().min(1).optional(),
      description: z.string().nullable().optional(),
      ownerUserId: z.string().optional(),
      dueDate: z.string().nullable().optional(),
    });
    const parsed = createFromOppSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(err("VALIDATION_ERROR", fromZodError(parsed.error).toString()));

    const action = await storage.createAction({
      tenantId,
      locationId: opp.locationId,
      metricDefinitionId: opp.metricDefinitionId,
      title: parsed.data.title || opp.title,
      description: parsed.data.description || opp.description,
      status: "open",
      priority: opp.impactScore === "high" ? "high" : "medium",
      ownerUserId: parsed.data.ownerUserId || req.user.claims.sub,
      sourceType: "opportunity",
      sourceId: opp.id,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
    });

    await storage.updateOpportunity(oppId, { status: "actioned", actionId: action.id });

    try {
      await storage.createRecommendationEvent({
        tenantId,
        entityType: "opportunity",
        entityId: oppId,
        eventType: "converted_to_action",
        userId: req.user.claims.sub,
        metadata: { actionId: action.id },
      });
    } catch (_) {}

    await audit(tenantId, req.user.claims.sub, "opportunity", String(oppId), "create_action", opp, action);
    res.status(201).json(ok(action));
  } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.post("/tenants/:tenantId/opportunities/recompute", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;

    const opps = await storage.getOpportunities(tenantId);
    const openOpps = opps.filter(o => o.status === "open");
    let recomputed = 0;

    const [metrics, locs, allGoals] = await Promise.all([
      storage.getMetricDefinitions(tenantId),
      storage.getLocations(tenantId),
      storage.getGoals(tenantId),
    ]);

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    for (const opp of openOpps) {
      if (opp.metricDefinitionId && opp.locationId) {
        const metric = metrics.find(m => m.id === opp.metricDefinitionId);
        if (!metric) continue;
        const values = await storage.getMetricTrends(opp.metricDefinitionId, opp.locationId, "weekly", thirtyDaysAgo, now);
        if (values.length >= 3) {
          const recent = values.slice(-3);
          const vals = recent.map(v => v.value);
          const magnitude = Math.abs(vals[2] - vals[0]) / (Math.abs(vals[0]) || 1);
          const severity = magnitude > 0.2 ? 3 : magnitude > 0.1 ? 2 : 1;
          const duration = 3;
          const impact = severity * duration;
          const impactLabel = impact >= 6 ? "high" : impact >= 3 ? "medium" : "low";
          const priorityLabel = impact >= 8 ? "critical" : impact >= 5 ? "high" : impact >= 3 ? "medium" : "low";
          const confidence = Math.min(0.95, 0.5 + magnitude + (duration * 0.1));

          const relatedGoals = allGoals.filter(g => g.metricDefinitionId === opp.metricDefinitionId && g.locationId === opp.locationId);
          const offTrackGoals = relatedGoals.filter(g => g.status === "off_track");

          const rationale = {
            factors: [
              { label: "Trend direction", value: `${(magnitude * 100).toFixed(1)}% change` },
              { label: "Duration", value: `${duration} periods` },
              { label: "Business impact", value: impactLabel },
              ...(offTrackGoals.length > 0 ? [{ label: "Related off-track goals", value: String(offTrackGoals.length) }] : []),
            ],
            summary: `${metric.name} at location ID ${opp.locationId} continues to trend unfavorably.`,
          };

          await storage.updateOpportunity(opp.id, {
            impactScore: impactLabel,
            priority: priorityLabel,
            confidenceScore: parseFloat(confidence.toFixed(2)),
            rationaleJson: JSON.stringify(rationale),
            lastRecomputedAt: now,
          });
          recomputed++;
        }
      }
    }

    await audit(tenantId, req.user.claims.sub, "opportunity", "all", "recompute");
    res.json(ok({ recomputed }));
  } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.get("/tenants/:tenantId/opportunities/:id/rationale", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
    const oppId = parseIntOrThrow(req.params.id, "id");
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;

    const opp = await storage.getOpportunity(oppId);
    if (!opp || opp.tenantId !== tenantId) return res.status(404).json(err("NOT_FOUND", "Opportunity not found"));

    const rationale = opp.rationaleJson ? JSON.parse(opp.rationaleJson) : null;
    res.json(ok({
      opportunityId: opp.id,
      title: opp.title,
      priority: opp.priority,
      confidenceScore: opp.confidenceScore,
      rationale,
      detectedAt: opp.detectedAt,
      lastRecomputedAt: opp.lastRecomputedAt,
    }));
  } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

// ── Goals ──

phase5Router.get("/tenants/:tenantId/goals", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;

    const filters: any = {};
    if (req.query.locationId) filters.locationId = parseIntOrThrow(req.query.locationId as string, "locationId");
    if (req.query.metricDefinitionId) filters.metricDefinitionId = parseIntOrThrow(req.query.metricDefinitionId as string, "metricDefinitionId");
    if (req.query.status) filters.status = req.query.status;

    const data = await storage.getGoals(tenantId, filters);
    res.json(ok(data));
  } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.post("/tenants/:tenantId/goals", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;

    const body = { ...req.body, tenantId };
    if (body.startDate && typeof body.startDate === "string") body.startDate = new Date(body.startDate);
    if (body.endDate && typeof body.endDate === "string") body.endDate = new Date(body.endDate);
    const parsed = insertGoalSchema.safeParse(body);
    if (!parsed.success) return res.status(400).json(err("VALIDATION_ERROR", fromZodError(parsed.error).toString()));

    const goal = await storage.createGoal(parsed.data);
    await audit(tenantId, req.user.claims.sub, "goal", String(goal.id), "create", null, goal);
    res.status(201).json(ok(goal));
  } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.put("/tenants/:tenantId/goals/:goalId", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
    const goalId = parseIntOrThrow(req.params.goalId, "goalId");
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;

    const existing = await storage.getGoal(goalId);
    if (!existing || existing.tenantId !== tenantId) return res.status(404).json(err("NOT_FOUND", "Goal not found"));

    const updateGoalSchema = z.object({
      title: z.string().min(1).optional(),
      description: z.string().nullable().optional(),
      targetValue: z.coerce.number().optional(),
      currentValue: z.coerce.number().nullable().optional(),
      status: z.enum(["on_track", "at_risk", "off_track", "achieved"]).optional(),
      metricDefinitionId: z.coerce.number().nullable().optional(),
      locationId: z.coerce.number().nullable().optional(),
      period: z.string().optional(),
      startDate: z.union([z.string(), z.date()]).optional(),
      endDate: z.union([z.string(), z.date()]).optional(),
      consecutiveOffTrack: z.coerce.number().optional(),
      ownerUserId: z.string().nullable().optional(),
    }).passthrough();
    const parsed = updateGoalSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(err("VALIDATION_ERROR", fromZodError(parsed.error).toString()));

    const goal = await storage.updateGoal(goalId, parsed.data);
    await audit(tenantId, req.user.claims.sub, "goal", String(goalId), "update", existing, goal);
    res.json(ok(goal));
  } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.get("/tenants/:tenantId/goals/variance", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;

    const allGoals = await storage.getGoals(tenantId);
    const variance = allGoals.map(g => {
      const variancePercent = g.currentValue !== null && g.targetValue !== 0
        ? ((g.currentValue! - g.targetValue) / g.targetValue) * 100
        : null;
      return {
        goalId: g.id,
        title: g.title,
        targetValue: g.targetValue,
        currentValue: g.currentValue,
        variancePercent,
        status: g.status,
        consecutiveOffTrack: g.consecutiveOffTrack,
        flagged: (g.consecutiveOffTrack || 0) >= 2,
      };
    });

    res.json(ok(variance));
  } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

// ── Benchmarking ──

phase5Router.get("/tenants/:tenantId/benchmarking/config", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;

    const config = await storage.getBenchmarkingConfig(tenantId);
    res.json(ok(config || {
      tenantId,
      goalAttainmentWeight: 40,
      alertPenaltyWeight: 25,
      trendMomentumWeight: 20,
      scorecardContributionWeight: 15,
    }));
  } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.put("/tenants/:tenantId/benchmarking/config", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
    const tu = await requireAdminAccess(req, res, tenantId);
    if (!tu) return;

    const schema = z.object({
      goalAttainmentWeight: z.coerce.number().min(0).max(100),
      alertPenaltyWeight: z.coerce.number().min(0).max(100),
      trendMomentumWeight: z.coerce.number().min(0).max(100),
      scorecardContributionWeight: z.coerce.number().min(0).max(100),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(err("VALIDATION_ERROR", fromZodError(parsed.error).toString()));

    const total = parsed.data.goalAttainmentWeight + parsed.data.alertPenaltyWeight + parsed.data.trendMomentumWeight + parsed.data.scorecardContributionWeight;
    if (total !== 100) return res.status(400).json(err("VALIDATION_ERROR", `Weights must sum to 100, got ${total}`));

    const before = await storage.getBenchmarkingConfig(tenantId);
    const config = await storage.upsertBenchmarkingConfig(tenantId, parsed.data);
    await audit(tenantId, req.user.claims.sub, "benchmarking_config", String(tenantId), "update", before, config);
    res.json(ok(config));
  } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.get("/tenants/:tenantId/benchmarking", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;

    const [locs, allAlerts, allGoals, allActions, configRow] = await Promise.all([
      storage.getLocations(tenantId),
      storage.getAlertEvents(tenantId),
      storage.getGoals(tenantId),
      storage.getActions(tenantId),
      storage.getBenchmarkingConfig(tenantId),
    ]);

    const config = configRow || { goalAttainmentWeight: 40, alertPenaltyWeight: 25, trendMomentumWeight: 20, scorecardContributionWeight: 15 };
    const totalWeight = config.goalAttainmentWeight + config.alertPenaltyWeight + config.trendMomentumWeight + config.scorecardContributionWeight;

    const rankings = locs.filter(l => l.isActive).map(loc => {
      const locAlerts = allAlerts.filter(a => a.locationId === loc.id && a.status === "open");
      const locGoals = allGoals.filter(g => g.locationId === loc.id);
      const onTrackGoals = locGoals.filter(g => g.status === "on_track").length;
      const totalGoals = locGoals.length;
      const goalAttainment = totalGoals > 0 ? Math.round((onTrackGoals / totalGoals) * 100) : 0;
      const locActions = allActions.filter(a => a.locationId === loc.id);
      const completedActions = locActions.filter(a => a.status === "done").length;
      const totalActions = locActions.length;
      const actionCompletion = totalActions > 0 ? Math.round((completedActions / totalActions) * 100) : 0;

      const alertPenalty = Math.max(0, 100 - locAlerts.length * 20);
      const trendMomentum = actionCompletion;
      const scorecardContribution = goalAttainment;

      const compositeScore = totalWeight > 0 ? Math.round(
        (goalAttainment * config.goalAttainmentWeight +
         alertPenalty * config.alertPenaltyWeight +
         trendMomentum * config.trendMomentumWeight +
         scorecardContribution * config.scorecardContributionWeight) / totalWeight
      ) : 0;

      return {
        locationId: loc.id,
        locationName: loc.name,
        alertBurden: locAlerts.length,
        goalAttainment,
        goalsOnTrack: onTrackGoals,
        totalGoals,
        completedActions,
        totalActions,
        actionCompletion,
        alertPenalty,
        trendMomentum,
        scorecardContribution,
        compositeScore,
      };
    }).sort((a, b) => b.compositeScore - a.compositeScore);

    res.json(ok({ rankings, weights: config }));
  } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

// ── Playbooks ──

phase5Router.get("/tenants/:tenantId/playbooks", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;

    const pbs = await storage.getPlaybooks(tenantId);
    const result = await Promise.all(pbs.map(async pb => {
      const steps = await storage.getPlaybookSteps(pb.id);
      return { ...pb, steps };
    }));
    res.json(ok(result));
  } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.post("/tenants/:tenantId/playbooks", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
    const tu = await requireAdminAccess(req, res, tenantId);
    if (!tu) return;

    const parsed = insertPlaybookSchema.safeParse({ ...req.body, tenantId });
    if (!parsed.success) return res.status(400).json(err("VALIDATION_ERROR", fromZodError(parsed.error).toString()));

    const pb = await storage.createPlaybook(parsed.data);

    const stepsSchema = z.array(z.object({
      title: z.string().min(1),
      description: z.string().nullable().optional(),
      metricDefinitionId: z.coerce.number().nullable().optional(),
    })).optional();
    const stepsParsed = stepsSchema.safeParse(req.body.steps);
    if (req.body.steps && !stepsParsed.success) return res.status(400).json(err("VALIDATION_ERROR", fromZodError(stepsParsed.error!).toString()));

    if (stepsParsed.success && stepsParsed.data) {
      for (let i = 0; i < stepsParsed.data.length; i++) {
        await storage.createPlaybookStep({
          playbookId: pb.id,
          stepOrder: i + 1,
          title: stepsParsed.data[i].title,
          description: stepsParsed.data[i].description || null,
          metricDefinitionId: stepsParsed.data[i].metricDefinitionId || null,
        });
      }
    }

    const steps = await storage.getPlaybookSteps(pb.id);
    await audit(tenantId, req.user.claims.sub, "playbook", String(pb.id), "create", null, pb);
    res.status(201).json(ok({ ...pb, steps }));
  } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.put("/tenants/:tenantId/playbooks/:playbookId", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
    const playbookId = parseIntOrThrow(req.params.playbookId, "playbookId");
    const tu = await requireAdminAccess(req, res, tenantId);
    if (!tu) return;

    const existing = await storage.getPlaybook(playbookId);
    if (!existing || existing.tenantId !== tenantId) return res.status(404).json(err("NOT_FOUND", "Playbook not found"));
    if (existing.isArchived) return res.status(400).json(err("ARCHIVED", "Cannot edit archived playbook"));

    const updatePlaybookSchema = z.object({
      name: z.string().min(1).optional(),
      description: z.string().nullable().optional(),
      category: z.string().nullable().optional(),
      steps: z.array(z.object({
        title: z.string().min(1),
        description: z.string().nullable().optional(),
        metricDefinitionId: z.coerce.number().nullable().optional(),
      })).optional(),
    });
    const parsed = updatePlaybookSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(err("VALIDATION_ERROR", fromZodError(parsed.error).toString()));

    const updated = await storage.updatePlaybook(playbookId, {
      name: parsed.data.name || existing.name,
      description: parsed.data.description !== undefined ? parsed.data.description : existing.description,
      category: parsed.data.category !== undefined ? parsed.data.category : existing.category,
      version: (existing.version || 1) + 1,
      updatedByUserId: req.user.claims.sub,
      updatedAt: new Date(),
    } as any);

    if (parsed.data.steps && Array.isArray(parsed.data.steps)) {
      await storage.deletePlaybookSteps(playbookId);
      for (let i = 0; i < parsed.data.steps.length; i++) {
        await storage.createPlaybookStep({
          playbookId,
          stepOrder: i + 1,
          title: parsed.data.steps[i].title,
          description: parsed.data.steps[i].description || null,
          metricDefinitionId: parsed.data.steps[i].metricDefinitionId || null,
        });
      }
    }

    const steps = await storage.getPlaybookSteps(playbookId);
    await audit(tenantId, req.user.claims.sub, "playbook", String(playbookId), "update", existing, updated);
    res.json(ok({ ...updated, steps }));
  } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.delete("/tenants/:tenantId/playbooks/:playbookId", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
    const playbookId = parseIntOrThrow(req.params.playbookId, "playbookId");
    const tu = await requireAdminAccess(req, res, tenantId);
    if (!tu) return;

    const existing = await storage.getPlaybook(playbookId);
    if (!existing || existing.tenantId !== tenantId) return res.status(404).json(err("NOT_FOUND", "Playbook not found"));

    await storage.updatePlaybook(playbookId, { isArchived: true, isActive: false, updatedByUserId: req.user.claims.sub, updatedAt: new Date() } as any);
    await audit(tenantId, req.user.claims.sub, "playbook", String(playbookId), "archive", existing);
    res.json(ok({ archived: true }));
  } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.post("/tenants/:tenantId/playbooks/:playbookId/unarchive", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
    const playbookId = parseIntOrThrow(req.params.playbookId, "playbookId");
    const tu = await requireAdminAccess(req, res, tenantId);
    if (!tu) return;

    const existing = await storage.getPlaybook(playbookId);
    if (!existing || existing.tenantId !== tenantId) return res.status(404).json(err("NOT_FOUND", "Playbook not found"));

    await storage.updatePlaybook(playbookId, { isArchived: false, isActive: true, updatedByUserId: req.user.claims.sub, updatedAt: new Date() } as any);
    await audit(tenantId, req.user.claims.sub, "playbook", String(playbookId), "unarchive", existing);
    res.json(ok({ unarchived: true }));
  } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.get("/tenants/:tenantId/playbooks/:playbookId/applications", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
    const playbookId = parseIntOrThrow(req.params.playbookId, "playbookId");
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;

    const pb = await storage.getPlaybook(playbookId);
    if (!pb || pb.tenantId !== tenantId) return res.status(404).json(err("NOT_FOUND", "Playbook not found"));

    const applications = await storage.getPlaybookApplicationsByPlaybook(playbookId);
    res.json(ok(applications));
  } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.post("/tenants/:tenantId/playbooks/:playbookId/apply", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
    const playbookId = parseIntOrThrow(req.params.playbookId, "playbookId");
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;

    const pb = await storage.getPlaybook(playbookId);
    if (!pb || pb.tenantId !== tenantId) return res.status(404).json(err("NOT_FOUND", "Playbook not found"));

    const applyPlaybookSchema = z.object({
      locationIds: z.array(z.coerce.number()).min(1, "locationIds must be a non-empty array"),
      ownerUserId: z.string().optional(),
      priority: z.string().optional(),
      dueDate: z.string().nullable().optional(),
    });
    const parsed = applyPlaybookSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(err("VALIDATION_ERROR", fromZodError(parsed.error).toString()));

    const locationIds = parsed.data.locationIds;

    const overrides = {
      ownerUserId: parsed.data.ownerUserId || req.user.claims.sub,
      priority: parsed.data.priority || "medium",
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
    };

    const steps = await storage.getPlaybookSteps(playbookId);
    const results: any[] = [];

    for (const locationId of locationIds) {
      const application = await storage.createPlaybookApplication({
        playbookId,
        tenantId,
        locationId,
        appliedByUserId: req.user.claims.sub,
        status: "applied",
      });

      for (const step of steps) {
        await storage.createAction({
          tenantId,
          locationId,
          metricDefinitionId: step.metricDefinitionId,
          title: `[Playbook] ${step.title}`,
          description: step.description,
          status: "open",
          priority: overrides.priority,
          ownerUserId: overrides.ownerUserId,
          sourceType: "playbook",
          sourceId: playbookId,
          dueDate: overrides.dueDate,
        });
      }

      results.push(application);
    }

    await audit(tenantId, req.user.claims.sub, "playbook", String(playbookId), "apply", null, { locationIds });
    res.status(201).json(ok({ applications: results, actionsCreated: steps.length * locationIds.length }));
  } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.get("/tenants/:tenantId/playbook-assignments", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
    const applications = await storage.getPlaybookApplications(tenantId);
    const playbookIds = [...new Set(applications.map(a => a.playbookId))];
    const playbooksWithSteps = await Promise.all(
      playbookIds.map(async (pbId) => {
        const pb = await storage.getPlaybook(pbId);
        if (!pb) return null;
        const steps = await storage.getPlaybookSteps(pbId);
        return { ...pb, steps: steps.sort((a, b) => a.stepOrder - b.stepOrder) };
      })
    );
    const pbMap = new Map(playbooksWithSteps.filter(Boolean).map(pb => [pb!.id, pb]));
    const enriched = applications.map(app => ({
      ...app,
      playbook: pbMap.get(app.playbookId) || null,
    }));
    res.json(ok(enriched));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.patch("/tenants/:tenantId/playbook-assignments/:applicationId/steps", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
    const applicationId = parseIntOrThrow(req.params.applicationId, "applicationId");
    const { stepOrder, completed } = req.body;
    if (typeof stepOrder !== "number" || typeof completed !== "boolean") {
      return res.status(400).json(err("VALIDATION_ERROR", "stepOrder (number) and completed (boolean) required"));
    }
    const app = await storage.getPlaybookApplication(applicationId);
    if (!app || app.tenantId !== tenantId) return res.status(404).json(err("NOT_FOUND", "Application not found"));

    let completedSteps = app.completedSteps || [];
    if (completed && !completedSteps.includes(stepOrder)) {
      completedSteps = [...completedSteps, stepOrder];
    } else if (!completed) {
      completedSteps = completedSteps.filter(s => s !== stepOrder);
    }

    const pb = await storage.getPlaybook(app.playbookId);
    const totalSteps = pb ? (await storage.getPlaybookSteps(pb.id)).length : 0;
    const allDone = totalSteps > 0 && completedSteps.length >= totalSteps;

    const updated = await storage.updatePlaybookApplication(applicationId, {
      completedSteps,
      status: allDone ? "completed" : "applied",
      completedAt: allDone ? new Date() : null,
    });
    res.json(ok(updated));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

// ── Tenant Users ──

// ── Digests ──

export async function generateDigest(tenantId: number, userId: string) {
  const [allActions, allGoals, allOpportunities, allAlerts] = await Promise.all([
    storage.getActions(tenantId),
    storage.getGoals(tenantId),
    storage.getOpportunities(tenantId),
    storage.getAlertEvents(tenantId, { status: "open" }),
  ]);

  const now = new Date();
  const overdueActions = allActions.filter(a => a.dueDate && new Date(a.dueDate) < now && a.status !== "done");
  const blockedActions = allActions.filter(a => a.status === "blocked");
  const completedActions = allActions.filter(a => a.status === "done").slice(0, 5);
  const offTrackGoals = allGoals.filter(g => g.status === "off_track" || g.status === "at_risk");
  const highImpactOpps = allOpportunities.filter(o => o.status === "open" && o.impactScore === "high");

  const wins = completedActions.map(a => a.title);
  const risks = [
    ...offTrackGoals.map(g => `Goal off-track: ${g.title}`),
    ...allAlerts.filter(a => a.severity === "critical").slice(0, 3).map(a => `Critical alert: ${a.message}`),
  ].slice(0, 5);
  const blocked = blockedActions.map(a => `${a.title} (blocked)`);
  const overdue = overdueActions.map(a => `${a.title} (due ${a.dueDate ? new Date(a.dueDate).toLocaleDateString() : "N/A"})`);
  const recommendedMoves = [
    ...overdueActions.slice(0, 2).map(a => `Resolve overdue action: ${a.title}`),
    ...offTrackGoals.slice(0, 2).map(g => `Address off-track goal: ${g.title}`),
    ...highImpactOpps.slice(0, 1).map(o => `Act on opportunity: ${o.title}`),
  ].slice(0, 5);

  const summaryParts: string[] = [];
  summaryParts.push(`# Weekly Coaching Summary\n`);
  if (wins.length > 0) {
    summaryParts.push(`Great work this week — your team closed out ${wins.length} action${wins.length !== 1 ? "s" : ""}. Wins like these build momentum, so make sure to recognize the people behind them.`);
    summaryParts.push(`**Wins:** ${wins.join("; ")}\n`);
  } else {
    summaryParts.push(`No completed actions this week. Consider reviewing your open actions and identifying any quick wins your team can close out to build momentum.\n`);
  }
  if (risks.length > 0) {
    summaryParts.push(`**Heads up — ${risks.length} item${risks.length !== 1 ? "s" : ""} need${risks.length === 1 ? "s" : ""} attention.** These are the areas where performance is slipping or alerts are firing. Addressing them early prevents compounding problems.`);
    summaryParts.push(`${risks.map((r, i) => `${i + 1}. ${r}`).join("\n")}\n`);
  }
  if (blocked.length > 0) {
    summaryParts.push(`**${blocked.length} action${blocked.length !== 1 ? "s are" : " is"} currently blocked.** Blocked work stalls progress across your team — check in with owners and clear the path forward.`);
    summaryParts.push(`${blocked.join("; ")}\n`);
  }
  if (overdue.length > 0) {
    summaryParts.push(`**${overdue.length} overdue action${overdue.length !== 1 ? "s" : ""}.** Every overdue item is a missed commitment. Reassign, rescope, or close these out this week.`);
    summaryParts.push(`${overdue.join("; ")}\n`);
  }
  if (recommendedMoves.length > 0) {
    summaryParts.push(`## Top Recommended Next Steps`);
    summaryParts.push(recommendedMoves.map((m, i) => `${i + 1}. ${m}`).join("\n"));
    summaryParts.push(``);
  }
  summaryParts.push(`Stay focused, stay accountable — small consistent actions compound into big results.`);
  const summaryText = summaryParts.join("\n");

  return storage.createDigest({
    tenantId,
    generatedByUserId: userId,
    winsJson: JSON.stringify(wins),
    risksJson: JSON.stringify(risks),
    blockedActionsJson: JSON.stringify(blocked),
    overdueActionsJson: JSON.stringify(overdue),
    recommendedMovesJson: JSON.stringify(recommendedMoves),
    summaryText,
  });
}

phase5Router.post("/admin/digests/:tenantId/run", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
    const tu = await requireAdminAccess(req, res, tenantId);
    if (!tu) return;

    const weekKey = getWeekKey();
    const existingRun = await storage.getDigestSchedulerRunByWeek(tenantId, weekKey);
    if (existingRun && existingRun.status === "success" && !req.body.force) {
      return res.status(409).json(err("DUPLICATE", `Digest already generated for ${weekKey}. Pass force: true to regenerate.`));
    }

    const run = await storage.createDigestSchedulerRun({
      tenantId,
      weekKey,
      status: "running",
    });

    try {
      const digest = await generateDigest(tenantId, req.user.claims.sub);
      await storage.updateDigestSchedulerRun(run.id, { status: "success", digestId: digest.id, completedAt: new Date() } as any);
      await audit(tenantId, req.user.claims.sub, "digest", String(digest.id), "create", null, digest);
      res.status(201).json(ok(digest));
    } catch (genError: any) {
      await storage.updateDigestSchedulerRun(run.id, { status: "failed", errorMessage: genError.message, completedAt: new Date() } as any);
      throw genError;
    }
  } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
    if (error.message?.includes("already generated")) return;
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.get("/admin/digests/:tenantId/history", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;
    const data = await storage.getDigests(tenantId);
    res.json(ok(data));
  } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.get("/admin/digests/:tenantId/schedule", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;

    const schedule = await storage.getDigestSchedule(tenantId);
    res.json(ok(schedule || {
      tenantId,
      dayOfWeek: 1,
      sendTime: "09:00",
      timezone: "America/New_York",
      recipientsJson: "[]",
      isEnabled: false,
    }));
  } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.put("/admin/digests/:tenantId/schedule", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
    const tu = await requireAdminAccess(req, res, tenantId);
    if (!tu) return;

    const schema = z.object({
      dayOfWeek: z.coerce.number().min(0).max(6),
      sendTime: z.string().regex(/^\d{2}:\d{2}$/),
      timezone: z.string().min(1),
      recipientsJson: z.string().optional(),
      isEnabled: z.boolean(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(err("VALIDATION_ERROR", fromZodError(parsed.error).toString()));

    const before = await storage.getDigestSchedule(tenantId);
    const schedule = await storage.upsertDigestSchedule(tenantId, parsed.data);
    await audit(tenantId, req.user.claims.sub, "digest_schedule", String(tenantId), "update", before, schedule);
    res.json(ok(schedule));
  } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.get("/admin/digests/:tenantId/scheduler-runs", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;

    const runs = await storage.getDigestSchedulerRuns(tenantId);
    res.json(ok(runs));
  } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

// ── Campaigns ──

phase5Router.get("/tenants/:tenantId/campaigns", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;

    const filters: { status?: string; locationId?: number; type?: string } = {};
    if (req.query.status) filters.status = req.query.status as string;
    if (req.query.locationId) filters.locationId = parseIntOrThrow(req.query.locationId as string, "locationId");
    if (req.query.type) filters.type = req.query.type as string;

    const list = await storage.getCampaigns(tenantId, filters);
    res.json(ok(list));
  } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.post("/tenants/:tenantId/campaigns", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;

    const schema = z.object({
      name: z.string().min(1).max(500),
      type: z.string().min(1),
      locationId: z.coerce.number().nullable().optional(),
      metricDefinitionId: z.coerce.number().nullable().optional(),
      startDate: z.string().min(1),
      endDate: z.string().nullable().optional(),
      status: z.string().optional(),
      description: z.string().nullable().optional(),
      budget: z.coerce.number().nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(err("VALIDATION_ERROR", fromZodError(parsed.error).toString()));

    if (parsed.data.locationId) {
      const loc = await storage.getLocation(parsed.data.locationId);
      if (!loc || loc.tenantId !== tenantId) return res.status(400).json(err("VALIDATION_ERROR", "Location does not belong to this tenant"));
    }
    if (parsed.data.metricDefinitionId) {
      const md = await storage.getMetricDefinition(parsed.data.metricDefinitionId);
      if (!md || md.tenantId !== tenantId) return res.status(400).json(err("VALIDATION_ERROR", "Metric does not belong to this tenant"));
    }

    const campaign = await storage.createCampaign({
      ...parsed.data,
      startDate: new Date(parsed.data.startDate),
      endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
      tenantId,
      createdByUserId: req.user.claims.sub,
    } as any);

    await audit(tenantId, req.user.claims.sub, "campaign", String(campaign.id), "create", undefined, campaign);
    res.status(201).json(ok(campaign));
  } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.put("/tenants/:tenantId/campaigns/:id", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;
    const id = parseIntOrThrow(req.params.id, "id");

    const existing = await storage.getCampaign(id);
    if (!existing) return res.status(404).json(err("NOT_FOUND", "Campaign not found"));
    if (existing.tenantId !== tenantId) return res.status(403).json(err("FORBIDDEN", "Campaign does not belong to this tenant"));

    const schema = z.object({
      name: z.string().min(1).max(500).optional(),
      type: z.string().optional(),
      locationId: z.coerce.number().nullable().optional(),
      metricDefinitionId: z.coerce.number().nullable().optional(),
      startDate: z.string().or(z.date()).optional(),
      endDate: z.string().or(z.date()).nullable().optional(),
      status: z.string().optional(),
      description: z.string().nullable().optional(),
      budget: z.coerce.number().nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(err("VALIDATION_ERROR", fromZodError(parsed.error).toString()));

    if (parsed.data.locationId) {
      const loc = await storage.getLocation(parsed.data.locationId);
      if (!loc || loc.tenantId !== tenantId) return res.status(400).json(err("VALIDATION_ERROR", "Location does not belong to this tenant"));
    }
    if (parsed.data.metricDefinitionId) {
      const md = await storage.getMetricDefinition(parsed.data.metricDefinitionId);
      if (!md || md.tenantId !== tenantId) return res.status(400).json(err("VALIDATION_ERROR", "Metric does not belong to this tenant"));
    }

    const updateData: any = { ...parsed.data };
    if (updateData.startDate && typeof updateData.startDate === "string") updateData.startDate = new Date(updateData.startDate);
    if (updateData.endDate && typeof updateData.endDate === "string") updateData.endDate = new Date(updateData.endDate);

    const updated = await storage.updateCampaign(id, updateData);
    await audit(tenantId, req.user.claims.sub, "campaign", String(id), "update", existing, updated);
    res.json(ok(updated));
  } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.get("/tenants/:tenantId/campaigns/:id/impact", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;
    const id = parseIntOrThrow(req.params.id, "id");

    const campaign = await storage.getCampaign(id);
    if (!campaign) return res.status(404).json(err("NOT_FOUND", "Campaign not found"));
    if (campaign.tenantId !== tenantId) return res.status(403).json(err("FORBIDDEN", "Campaign does not belong to this tenant"));

    if (!campaign.metricDefinitionId) {
      return res.json(ok({
        campaignId: id,
        campaignName: campaign.name,
        preAvg: 0, postAvg: 0, absoluteChange: 0, percentChange: 0,
        confidence: "low", preDataPoints: 0, postDataPoints: 0,
        prePeriod: { start: "", end: "" }, postPeriod: { start: "", end: "" },
        noMetric: true,
      }));
    }

    const endDate = campaign.endDate || new Date();
    const startDate = campaign.startDate;
    const durationMs = endDate.getTime() - startDate.getTime();
    const preStart = new Date(startDate.getTime() - durationMs);

    const baseConditions = [
      eq(metricValues.tenantId, tenantId),
      eq(metricValues.metricDefinitionId, campaign.metricDefinitionId),
    ];
    if (campaign.locationId) baseConditions.push(eq(metricValues.locationId, campaign.locationId));

    const preValues = await db.select().from(metricValues)
      .where(and(...baseConditions, gte(metricValues.periodStart, preStart), lte(metricValues.periodStart, startDate)));
    const postValues = await db.select().from(metricValues)
      .where(and(...baseConditions, gte(metricValues.periodStart, startDate), lte(metricValues.periodStart, endDate)));

    const preNumeric = preValues.map(v => parseFloat(v.value)).filter(v => !isNaN(v));
    const postNumeric = postValues.map(v => parseFloat(v.value)).filter(v => !isNaN(v));

    const preAvg = preNumeric.length > 0 ? preNumeric.reduce((a, b) => a + b, 0) / preNumeric.length : 0;
    const postAvg = postNumeric.length > 0 ? postNumeric.reduce((a, b) => a + b, 0) / postNumeric.length : 0;
    const absoluteChange = postAvg - preAvg;
    const percentChange = preAvg !== 0 ? (absoluteChange / Math.abs(preAvg)) * 100 : 0;

    const totalDataPoints = preNumeric.length + postNumeric.length;
    const confidence = totalDataPoints >= 8 ? "high" : totalDataPoints >= 4 ? "medium" : "low";

    res.json(ok({
      campaignId: id,
      campaignName: campaign.name,
      preAvg: Math.round(preAvg * 100) / 100,
      postAvg: Math.round(postAvg * 100) / 100,
      absoluteChange: Math.round(absoluteChange * 100) / 100,
      percentChange: Math.round(percentChange * 100) / 100,
      confidence,
      preDataPoints: preNumeric.length,
      postDataPoints: postNumeric.length,
      prePeriod: { start: preStart.toISOString(), end: startDate.toISOString() },
      postPeriod: { start: startDate.toISOString(), end: endDate.toISOString() },
    }));
  } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});
