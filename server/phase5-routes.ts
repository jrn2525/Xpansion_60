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
} from "@shared/schema";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";

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
  await storage.createAuditLog({
    tenantId,
    actorUserId,
    entityType,
    entityId: String(entityId),
    action,
    beforeJson: before ? JSON.stringify(before) : undefined,
    afterJson: after ? JSON.stringify(after) : undefined,
  });
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
    const tenantId = parseInt(req.params.tenantId);
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
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.post("/tenants/:tenantId/weekly-command-center/refresh", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
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
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

// ── Actions ──

phase5Router.get("/tenants/:tenantId/actions", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;

    const filters: any = {};
    if (req.query.status) filters.status = req.query.status;
    if (req.query.owner) filters.ownerUserId = req.query.owner;
    if (req.query.locationId) filters.locationId = parseInt(req.query.locationId);
    if (req.query.overdue === "true") filters.overdue = true;

    const data = await storage.getActions(tenantId, filters);
    res.json(ok(data));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.post("/tenants/:tenantId/actions", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
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
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.put("/tenants/:tenantId/actions/:actionId", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const actionId = parseInt(req.params.actionId);
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;

    const existing = await storage.getAction(actionId);
    if (!existing || existing.tenantId !== tenantId) return res.status(404).json(err("NOT_FOUND", "Action not found"));

    const action = await storage.updateAction(actionId, req.body);
    await audit(tenantId, req.user.claims.sub, "action", String(actionId), "update", existing, action);
    res.json(ok(action));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.post("/tenants/:tenantId/actions/:actionId/checkins", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const actionId = parseInt(req.params.actionId);
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
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.get("/tenants/:tenantId/actions/:actionId/checkins", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const actionId = parseInt(req.params.actionId);
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;

    const checkins = await storage.getActionCheckins(actionId);
    res.json(ok(checkins));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.put("/tenants/:tenantId/actions/bulk-status", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;

    const { actionIds, status } = req.body;
    if (!Array.isArray(actionIds) || !actionIds.length || !status) {
      return res.status(400).json(err("VALIDATION_ERROR", "actionIds (array) and status are required"));
    }
    if (!["open", "in_progress", "blocked", "done"].includes(status)) {
      return res.status(400).json(err("VALIDATION_ERROR", "Invalid status"));
    }

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
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

// ── Opportunities ──

phase5Router.get("/tenants/:tenantId/opportunities", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;
    const data = await storage.getOpportunities(tenantId);
    res.json(ok(data));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.post("/tenants/:tenantId/opportunities/:id/create-action", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const oppId = parseInt(req.params.id);
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;

    const opp = await storage.getOpportunity(oppId);
    if (!opp || opp.tenantId !== tenantId) return res.status(404).json(err("NOT_FOUND", "Opportunity not found"));

    const action = await storage.createAction({
      tenantId,
      locationId: opp.locationId,
      metricDefinitionId: opp.metricDefinitionId,
      title: req.body.title || opp.title,
      description: req.body.description || opp.description,
      status: "open",
      priority: opp.impactScore === "high" ? "high" : "medium",
      ownerUserId: req.body.ownerUserId || req.user.claims.sub,
      sourceType: "opportunity",
      sourceId: opp.id,
      dueDate: req.body.dueDate ? new Date(req.body.dueDate) : null,
    });

    await storage.updateOpportunity(oppId, { status: "actioned", actionId: action.id });
    await audit(tenantId, req.user.claims.sub, "opportunity", String(oppId), "create_action", opp, action);
    res.status(201).json(ok(action));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.post("/tenants/:tenantId/opportunities/recompute", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
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
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.get("/tenants/:tenantId/opportunities/:id/rationale", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const oppId = parseInt(req.params.id);
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
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

// ── Goals ──

phase5Router.get("/tenants/:tenantId/goals", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;

    const filters: any = {};
    if (req.query.locationId) filters.locationId = parseInt(req.query.locationId);
    if (req.query.metricDefinitionId) filters.metricDefinitionId = parseInt(req.query.metricDefinitionId);
    if (req.query.status) filters.status = req.query.status;

    const data = await storage.getGoals(tenantId, filters);
    res.json(ok(data));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.post("/tenants/:tenantId/goals", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
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
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.put("/tenants/:tenantId/goals/:goalId", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const goalId = parseInt(req.params.goalId);
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;

    const existing = await storage.getGoal(goalId);
    if (!existing || existing.tenantId !== tenantId) return res.status(404).json(err("NOT_FOUND", "Goal not found"));

    const goal = await storage.updateGoal(goalId, req.body);
    await audit(tenantId, req.user.claims.sub, "goal", String(goalId), "update", existing, goal);
    res.json(ok(goal));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.get("/tenants/:tenantId/goals/variance", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
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
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

// ── Benchmarking ──

phase5Router.get("/tenants/:tenantId/benchmarking/config", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
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
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.put("/tenants/:tenantId/benchmarking/config", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const tu = await requireAdminAccess(req, res, tenantId);
    if (!tu) return;

    const schema = z.object({
      goalAttainmentWeight: z.number().min(0).max(100),
      alertPenaltyWeight: z.number().min(0).max(100),
      trendMomentumWeight: z.number().min(0).max(100),
      scorecardContributionWeight: z.number().min(0).max(100),
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
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.get("/tenants/:tenantId/benchmarking", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
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
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

// ── Playbooks ──

phase5Router.get("/tenants/:tenantId/playbooks", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;

    const pbs = await storage.getPlaybooks(tenantId);
    const result = await Promise.all(pbs.map(async pb => {
      const steps = await storage.getPlaybookSteps(pb.id);
      return { ...pb, steps };
    }));
    res.json(ok(result));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.post("/tenants/:tenantId/playbooks", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const tu = await requireAdminAccess(req, res, tenantId);
    if (!tu) return;

    const parsed = insertPlaybookSchema.safeParse({ ...req.body, tenantId });
    if (!parsed.success) return res.status(400).json(err("VALIDATION_ERROR", fromZodError(parsed.error).toString()));

    const pb = await storage.createPlaybook(parsed.data);

    if (req.body.steps && Array.isArray(req.body.steps)) {
      for (let i = 0; i < req.body.steps.length; i++) {
        await storage.createPlaybookStep({
          playbookId: pb.id,
          stepOrder: i + 1,
          title: req.body.steps[i].title,
          description: req.body.steps[i].description,
          metricDefinitionId: req.body.steps[i].metricDefinitionId || null,
        });
      }
    }

    const steps = await storage.getPlaybookSteps(pb.id);
    await audit(tenantId, req.user.claims.sub, "playbook", String(pb.id), "create", null, pb);
    res.status(201).json(ok({ ...pb, steps }));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.put("/tenants/:tenantId/playbooks/:playbookId", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const playbookId = parseInt(req.params.playbookId);
    const tu = await requireAdminAccess(req, res, tenantId);
    if (!tu) return;

    const existing = await storage.getPlaybook(playbookId);
    if (!existing || existing.tenantId !== tenantId) return res.status(404).json(err("NOT_FOUND", "Playbook not found"));
    if (existing.isArchived) return res.status(400).json(err("ARCHIVED", "Cannot edit archived playbook"));

    const updated = await storage.updatePlaybook(playbookId, {
      name: req.body.name || existing.name,
      description: req.body.description !== undefined ? req.body.description : existing.description,
      category: req.body.category !== undefined ? req.body.category : existing.category,
      version: (existing.version || 1) + 1,
      updatedByUserId: req.user.claims.sub,
      updatedAt: new Date(),
    } as any);

    if (req.body.steps && Array.isArray(req.body.steps)) {
      await storage.deletePlaybookSteps(playbookId);
      for (let i = 0; i < req.body.steps.length; i++) {
        await storage.createPlaybookStep({
          playbookId,
          stepOrder: i + 1,
          title: req.body.steps[i].title,
          description: req.body.steps[i].description || null,
          metricDefinitionId: req.body.steps[i].metricDefinitionId || null,
        });
      }
    }

    const steps = await storage.getPlaybookSteps(playbookId);
    await audit(tenantId, req.user.claims.sub, "playbook", String(playbookId), "update", existing, updated);
    res.json(ok({ ...updated, steps }));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.delete("/tenants/:tenantId/playbooks/:playbookId", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const playbookId = parseInt(req.params.playbookId);
    const tu = await requireAdminAccess(req, res, tenantId);
    if (!tu) return;

    const existing = await storage.getPlaybook(playbookId);
    if (!existing || existing.tenantId !== tenantId) return res.status(404).json(err("NOT_FOUND", "Playbook not found"));

    await storage.updatePlaybook(playbookId, { isArchived: true, isActive: false, updatedByUserId: req.user.claims.sub, updatedAt: new Date() } as any);
    await audit(tenantId, req.user.claims.sub, "playbook", String(playbookId), "archive", existing);
    res.json(ok({ archived: true }));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.post("/tenants/:tenantId/playbooks/:playbookId/unarchive", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const playbookId = parseInt(req.params.playbookId);
    const tu = await requireAdminAccess(req, res, tenantId);
    if (!tu) return;

    const existing = await storage.getPlaybook(playbookId);
    if (!existing || existing.tenantId !== tenantId) return res.status(404).json(err("NOT_FOUND", "Playbook not found"));

    await storage.updatePlaybook(playbookId, { isArchived: false, isActive: true, updatedByUserId: req.user.claims.sub, updatedAt: new Date() } as any);
    await audit(tenantId, req.user.claims.sub, "playbook", String(playbookId), "unarchive", existing);
    res.json(ok({ unarchived: true }));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.get("/tenants/:tenantId/playbooks/:playbookId/applications", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const playbookId = parseInt(req.params.playbookId);
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;

    const pb = await storage.getPlaybook(playbookId);
    if (!pb || pb.tenantId !== tenantId) return res.status(404).json(err("NOT_FOUND", "Playbook not found"));

    const applications = await storage.getPlaybookApplicationsByPlaybook(playbookId);
    res.json(ok(applications));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.post("/tenants/:tenantId/playbooks/:playbookId/apply", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const playbookId = parseInt(req.params.playbookId);
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;

    const pb = await storage.getPlaybook(playbookId);
    if (!pb || pb.tenantId !== tenantId) return res.status(404).json(err("NOT_FOUND", "Playbook not found"));

    const locationIds: number[] = req.body.locationIds || [];
    if (locationIds.length === 0) return res.status(400).json(err("VALIDATION_ERROR", "locationIds required"));

    const overrides = {
      ownerUserId: req.body.ownerUserId || req.user.claims.sub,
      priority: req.body.priority || "medium",
      dueDate: req.body.dueDate ? new Date(req.body.dueDate) : null,
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
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

// ── Tenant Users ──

phase5Router.get("/tenants/:tenantId/users", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;

    const users = await storage.getTenantUsersWithNames(tenantId);
    res.json(ok(users));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

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

  const summaryText = `Weekly Digest: ${wins.length} wins, ${risks.length} risks, ${overdue.length} overdue, ${blocked.length} blocked. ${recommendedMoves.length} recommended moves.`;

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
    const tenantId = parseInt(req.params.tenantId);
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
    if (error.message?.includes("already generated")) return;
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.get("/admin/digests/:tenantId/history", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;
    const data = await storage.getDigests(tenantId);
    res.json(ok(data));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.get("/admin/digests/:tenantId/schedule", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
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
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.put("/admin/digests/:tenantId/schedule", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const tu = await requireAdminAccess(req, res, tenantId);
    if (!tu) return;

    const schema = z.object({
      dayOfWeek: z.number().min(0).max(6),
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
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

phase5Router.get("/admin/digests/:tenantId/scheduler-runs", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;

    const runs = await storage.getDigestSchedulerRuns(tenantId);
    res.json(ok(runs));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});
