import { Router } from "express";
import { storage } from "./storage";
import { isAuthenticated } from "./replit_integrations/auth";
import {
  insertActionSchema,
  insertActionCheckinSchema,
  insertGoalSchema,
  insertPlaybookSchema,
  insertPlaybookStepSchema,
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
              const opp = await storage.createOpportunity({
                tenantId,
                locationId: loc.id,
                metricDefinitionId: metric.id,
                title: `${metric.name} declining at ${loc.name}`,
                description: `${metric.name} has shown a declining trend over the last 3 periods at ${loc.name}.`,
                impactScore: "medium",
                sourceType: "trend_decline",
                status: "open",
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

phase5Router.get("/tenants/:tenantId/benchmarking", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const tu = await requireTenantAccess(req, res, tenantId);
    if (!tu) return;

    const [locs, allAlerts, allGoals, allActions] = await Promise.all([
      storage.getLocations(tenantId),
      storage.getAlertEvents(tenantId),
      storage.getGoals(tenantId),
      storage.getActions(tenantId),
    ]);

    const rankings = locs.filter(l => l.isActive).map(loc => {
      const locAlerts = allAlerts.filter(a => a.locationId === loc.id && a.status === "open");
      const locGoals = allGoals.filter(g => g.locationId === loc.id);
      const onTrackGoals = locGoals.filter(g => g.status === "on_track").length;
      const totalGoals = locGoals.length;
      const goalAttainment = totalGoals > 0 ? Math.round((onTrackGoals / totalGoals) * 100) : null;
      const locActions = allActions.filter(a => a.locationId === loc.id);
      const completedActions = locActions.filter(a => a.status === "done").length;
      const totalActions = locActions.length;

      return {
        locationId: loc.id,
        locationName: loc.name,
        alertBurden: locAlerts.length,
        goalAttainment,
        goalsOnTrack: onTrackGoals,
        totalGoals,
        completedActions,
        totalActions,
        compositeScore: (goalAttainment || 0) - locAlerts.length * 5,
      };
    }).sort((a, b) => b.compositeScore - a.compositeScore);

    res.json(ok(rankings));
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
          priority: "medium",
          ownerUserId: req.user.claims.sub,
          sourceType: "playbook",
          sourceId: playbookId,
          dueDate: null,
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

// ── Digests ──

phase5Router.post("/admin/digests/:tenantId/run", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const tu = await requireAdminAccess(req, res, tenantId);
    if (!tu) return;

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

    const digest = await storage.createDigest({
      tenantId,
      generatedByUserId: req.user.claims.sub,
      winsJson: JSON.stringify(wins),
      risksJson: JSON.stringify(risks),
      blockedActionsJson: JSON.stringify(blocked),
      overdueActionsJson: JSON.stringify(overdue),
      recommendedMovesJson: JSON.stringify(recommendedMoves),
      summaryText,
    });

    await audit(tenantId, req.user.claims.sub, "digest", String(digest.id), "create", null, digest);
    res.status(201).json(ok(digest));
  } catch (error: any) {
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
