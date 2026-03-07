import { Router } from "express";
import { isAuthenticated, isSuperAdminGuard } from "./replit_integrations/auth/replitAuth";
import { storage } from "./storage";
import { computeTenantRisk, computeLocationMetricRisk } from "./services/risk-engine";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { db } from "./db";
import { metricValues, playbookApplications, playbooks, locations, metricDefinitions, goals, alertEvents, opportunities, actions } from "@shared/schema";
import { eq, and, desc, gte, lte, asc } from "drizzle-orm";

const ok = (data: any) => ({ ok: true, data });
const err = (code: string, message: string) => ({ ok: false, error: { code, message } });

async function audit(tenantId: number, actorUserId: string, entityType: string, entityId: string, action: string, details?: { before?: any; after?: any }) {
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

function getWeekKey(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now.getTime() - start.getTime();
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  const weekNum = Math.ceil((diff / oneWeek) + 1);
  return `${now.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

const RECOMPUTE_COOLDOWN_MS = 60_000;
const riskRecomputeCooldown = new Map<number, number>();
const effectivenessRecomputeCooldown = new Map<number, number>();

export const intelligenceRouter = Router();

intelligenceRouter.get("/tenants/:tenantId/risk/overview", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const hasAccess = await requireTenantAccess(req, res, tenantId); if (!hasAccess) return;
    const snapshots = await storage.getRiskSnapshots(tenantId);

    const locationRisk: Record<number, { locationId: number; avgRisk: number; maxRisk: number; count: number; totalRisk: number; warnings: number }> = {};
    for (const s of snapshots) {
      if (!locationRisk[s.locationId]) {
        locationRisk[s.locationId] = { locationId: s.locationId, avgRisk: 0, maxRisk: 0, count: 0, totalRisk: 0, warnings: 0 };
      }
      const lr = locationRisk[s.locationId];
      lr.count++;
      lr.totalRisk += s.riskScore;
      lr.maxRisk = Math.max(lr.maxRisk, s.riskScore);
      const warnings = s.earlyWarnings ? JSON.parse(s.earlyWarnings) : [];
      lr.warnings += warnings.length;
    }
    const locationSummaries = Object.values(locationRisk).map(lr => ({
      ...lr,
      avgRisk: lr.count > 0 ? Math.round(lr.totalRisk / lr.count) : 0,
    })).sort((a, b) => b.avgRisk - a.avgRisk);

    const overallAvgRisk = snapshots.length > 0
      ? Math.round(snapshots.reduce((a, s) => a + s.riskScore, 0) / snapshots.length)
      : 0;
    const highRiskCount = snapshots.filter(s => s.riskScore >= 60).length;
    const criticalWarnings = snapshots.filter(s => {
      const w = s.earlyWarnings ? JSON.parse(s.earlyWarnings) : [];
      return w.length > 0;
    }).length;

    res.json(ok({
      overallAvgRisk,
      totalSnapshots: snapshots.length,
      highRiskCount,
      criticalWarnings,
      topAtRiskLocations: locationSummaries.slice(0, 10),
      riskDistribution: {
        low: snapshots.filter(s => s.riskScore < 30).length,
        medium: snapshots.filter(s => s.riskScore >= 30 && s.riskScore < 60).length,
        high: snapshots.filter(s => s.riskScore >= 60 && s.riskScore < 80).length,
        critical: snapshots.filter(s => s.riskScore >= 80).length,
      },
    }));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

intelligenceRouter.get("/tenants/:tenantId/risk/location/:locationId", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const hasAccess = await requireTenantAccess(req, res, tenantId); if (!hasAccess) return;
    const locationId = parseInt(req.params.locationId);
    const snapshots = await storage.getRiskSnapshots(tenantId, { locationId });
    res.json(ok(snapshots));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

intelligenceRouter.get("/tenants/:tenantId/risk/metric/:metricId", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const hasAccess = await requireTenantAccess(req, res, tenantId); if (!hasAccess) return;
    const metricDefinitionId = parseInt(req.params.metricId);
    const snapshots = await storage.getRiskSnapshots(tenantId, { metricDefinitionId });
    res.json(ok(snapshots));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

intelligenceRouter.post("/tenants/:tenantId/risk/recompute", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const hasAccess = await requireTenantAccess(req, res, tenantId); if (!hasAccess) return;
    const lastRun = riskRecomputeCooldown.get(tenantId);
    if (lastRun && Date.now() - lastRun < RECOMPUTE_COOLDOWN_MS) {
      const waitSec = Math.ceil((RECOMPUTE_COOLDOWN_MS - (Date.now() - lastRun)) / 1000);
      return res.status(429).json(err("RATE_LIMITED", `Please wait ${waitSec}s before recomputing risk`));
    }
    riskRecomputeCooldown.set(tenantId, Date.now());
    const count = await computeTenantRisk(tenantId);
    await audit(tenantId, req.user.claims.sub, "risk", tenantId.toString(), "risk_recomputed", { after: { snapshotsCreated: count } });
    res.json(ok({ snapshotsCreated: count }));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

intelligenceRouter.get("/tenants/:tenantId/weekly-plans", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const hasAccess = await requireTenantAccess(req, res, tenantId); if (!hasAccess) return;
    const status = req.query.status as string | undefined;
    const plans = await storage.getWeeklyPlans(tenantId, status);
    res.json(ok(plans));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

intelligenceRouter.post("/tenants/:tenantId/weekly-plans/generate", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const hasAccess = await requireTenantAccess(req, res, tenantId); if (!hasAccess) return;
    const weekKey = getWeekKey();
    const userId = req.user.claims.sub;

    const settings = await storage.getAutomationSettings(tenantId);
    const confidenceThreshold = settings?.confidenceThreshold || 0.7;
    const maxItems = settings?.maxActionsPerWeek || 20;

    const riskSnapshots = await storage.getRiskSnapshots(tenantId);
    const tenantGoals = await db.select().from(goals).where(eq(goals.tenantId, tenantId));
    const openOpps = await storage.getOpportunities(tenantId);
    const openActions = await storage.getActions(tenantId, { status: "open" });
    const overdueActions = openActions.filter(a => a.dueDate && a.dueDate < new Date());

    interface PlanCandidate {
      title: string;
      description: string;
      priority: string;
      priorityScore: number;
      locationId: number | null;
      metricDefinitionId: number | null;
      suggestedOwnerUserId: string | null;
    }

    const candidates: PlanCandidate[] = [];

    for (const rs of riskSnapshots.filter(s => s.riskScore >= 40)) {
      const impact = rs.riskScore / 100;
      const urgency = rs.riskScore >= 80 ? 1.0 : rs.riskScore >= 60 ? 0.8 : 0.6;
      const confidence = Math.min(0.95, 0.5 + rs.varianceInstability);
      if (confidence < confidenceThreshold) continue;
      const score = impact * urgency * confidence * 100;
      candidates.push({
        title: `Address risk score ${rs.riskScore.toFixed(0)} at location ${rs.locationId}`,
        description: `Metric ${rs.metricDefinitionId}: trend slope ${rs.trendSlope.toFixed(4)}, ${rs.unresolvedActions} unresolved actions, ${rs.alertBurden.toFixed(0)} recent alerts`,
        priority: score >= 60 ? "critical" : score >= 40 ? "high" : score >= 20 ? "medium" : "low",
        priorityScore: score,
        locationId: rs.locationId,
        metricDefinitionId: rs.metricDefinitionId,
        suggestedOwnerUserId: null,
      });
    }

    for (const goal of tenantGoals.filter(g => g.status === "off_track" || g.status === "at_risk")) {
      const urgency = goal.status === "off_track" ? 1.0 : 0.7;
      const impact = goal.consecutiveOffTrack ? Math.min(1, goal.consecutiveOffTrack * 0.3) : 0.5;
      const score = impact * urgency * 0.85 * 100;
      candidates.push({
        title: `Goal "${goal.name}" is ${goal.status.replace("_", " ")}`,
        description: `Target: ${goal.targetValue}, Current: ${goal.currentValue || "N/A"}. ${goal.consecutiveOffTrack || 0} consecutive off-track periods.`,
        priority: score >= 60 ? "critical" : score >= 40 ? "high" : "medium",
        priorityScore: score,
        locationId: goal.locationId,
        metricDefinitionId: goal.metricDefinitionId,
        suggestedOwnerUserId: null,
      });
    }

    for (const opp of openOpps.filter(o => o.status === "open")) {
      const score = (opp.confidenceScore || 0.5) * (opp.impactScore === "high" ? 80 : opp.impactScore === "medium" ? 50 : 30);
      if ((opp.confidenceScore || 0) < confidenceThreshold) continue;
      candidates.push({
        title: opp.title,
        description: opp.description || "",
        priority: opp.priority || "medium",
        priorityScore: score,
        locationId: opp.locationId,
        metricDefinitionId: opp.metricDefinitionId,
        suggestedOwnerUserId: null,
      });
    }

    for (const action of overdueActions) {
      candidates.push({
        title: `Overdue: ${action.title}`,
        description: `Due ${action.dueDate?.toISOString().split("T")[0]}. Status: ${action.status}`,
        priority: "high",
        priorityScore: 65,
        locationId: action.locationId,
        metricDefinitionId: action.metricDefinitionId,
        suggestedOwnerUserId: action.ownerUserId,
      });
    }

    candidates.sort((a, b) => b.priorityScore - a.priorityScore);
    const topItems = candidates.slice(0, maxItems);

    const plan = await storage.createWeeklyPlan({ tenantId, weekKey, status: "draft" });
    for (const item of topItems) {
      await storage.createWeeklyPlanItem({
        planId: plan.id,
        locationId: item.locationId,
        metricDefinitionId: item.metricDefinitionId,
        title: item.title,
        description: item.description,
        priority: item.priority,
        priorityScore: item.priorityScore,
        suggestedOwnerUserId: item.suggestedOwnerUserId,
        suggestedDueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
    }

    await storage.createAutomationDecisionLog({
      tenantId,
      decisionType: "plan_generated",
      entityType: "weekly_plan",
      entityId: plan.id.toString(),
      actorUserId: userId,
      reason: `Generated ${topItems.length} items from ${candidates.length} candidates`,
      detailsJson: JSON.stringify({ weekKey, totalCandidates: candidates.length, itemsCreated: topItems.length }),
    });

    await audit(tenantId, userId, "weekly_plan", plan.id.toString(), "plan_generated", { after: { weekKey, items: topItems.length } });
    const items = await storage.getWeeklyPlanItems(plan.id);
    res.json(ok({ plan, items }));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

intelligenceRouter.post("/tenants/:tenantId/weekly-plans/:planId/approve", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const hasAccess = await requireTenantAccess(req, res, tenantId); if (!hasAccess) return;
    const planId = parseInt(req.params.planId);
    const plan = await storage.getWeeklyPlan(planId);
    if (!plan) return res.status(404).json(err("NOT_FOUND", "Plan not found"));
    if (plan.tenantId !== tenantId) return res.status(403).json(err("FORBIDDEN", "Plan does not belong to this tenant"));
    if (plan.status !== "draft") return res.status(400).json(err("INVALID_STATE", "Plan is not in draft state"));

    const updated = await storage.updateWeeklyPlan(planId, {
      status: "approved",
      approvedByUserId: req.user.claims.sub,
      approvedAt: new Date(),
    });

    await storage.createAutomationDecisionLog({
      tenantId: plan.tenantId,
      decisionType: "plan_approved",
      entityType: "weekly_plan",
      entityId: planId.toString(),
      actorUserId: req.user.claims.sub,
    });
    await audit(tenantId, req.user.claims.sub, "weekly_plan", planId.toString(), "plan_approved");
    res.json(ok(updated));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

intelligenceRouter.post("/tenants/:tenantId/weekly-plans/:planId/reject", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const hasAccess = await requireTenantAccess(req, res, tenantId); if (!hasAccess) return;
    const planId = parseInt(req.params.planId);
    const plan = await storage.getWeeklyPlan(planId);
    if (!plan) return res.status(404).json(err("NOT_FOUND", "Plan not found"));
    if (plan.tenantId !== tenantId) return res.status(403).json(err("FORBIDDEN", "Plan does not belong to this tenant"));
    if (plan.status !== "draft") return res.status(400).json(err("INVALID_STATE", "Plan is not in draft state"));

    const updated = await storage.updateWeeklyPlan(planId, {
      status: "rejected",
      rejectedByUserId: req.user.claims.sub,
      rejectedAt: new Date(),
    });

    await storage.createAutomationDecisionLog({
      tenantId: plan.tenantId,
      decisionType: "plan_rejected",
      entityType: "weekly_plan",
      entityId: planId.toString(),
      actorUserId: req.user.claims.sub,
      reason: req.body?.reason,
    });
    await audit(tenantId, req.user.claims.sub, "weekly_plan", planId.toString(), "plan_rejected");
    res.json(ok(updated));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

intelligenceRouter.get("/tenants/:tenantId/weekly-plans/:planId/items", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const hasAccess = await requireTenantAccess(req, res, tenantId); if (!hasAccess) return;
    const planId = parseInt(req.params.planId);
    const plan = await storage.getWeeklyPlan(planId);
    if (!plan) return res.status(404).json(err("NOT_FOUND", "Plan not found"));
    if (plan.tenantId !== tenantId) return res.status(403).json(err("FORBIDDEN", "Plan does not belong to this tenant"));
    const items = await storage.getWeeklyPlanItems(planId);
    res.json(ok(items));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

intelligenceRouter.post("/tenants/:tenantId/weekly-plans/:planId/push-actions", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const hasAccess = await requireTenantAccess(req, res, tenantId); if (!hasAccess) return;
    const planId = parseInt(req.params.planId);
    const plan = await storage.getWeeklyPlan(planId);
    if (!plan) return res.status(404).json(err("NOT_FOUND", "Plan not found"));
    if (plan.tenantId !== tenantId) return res.status(403).json(err("FORBIDDEN", "Plan does not belong to this tenant"));
    if (plan.status !== "approved") return res.status(400).json(err("INVALID_STATE", "Plan must be approved before pushing actions"));

    const items = await storage.getWeeklyPlanItems(planId);
    const createdActions = [];
    for (const item of items) {
      if (item.actionId) continue;
      const action = await storage.createAction({
        tenantId,
        title: item.title,
        description: item.description,
        priority: item.priority,
        status: "open",
        ownerUserId: item.suggestedOwnerUserId,
        locationId: item.locationId,
        metricDefinitionId: item.metricDefinitionId,
        dueDate: item.suggestedDueDate,
        sourceType: "weekly_plan",
        sourceId: plan.id,
      });
      await storage.updateWeeklyPlanItem(item.id, { actionId: action.id });
      createdActions.push(action);
    }

    await storage.updateWeeklyPlan(planId, { status: "pushed" });

    await storage.createAutomationDecisionLog({
      tenantId,
      decisionType: "action_created",
      entityType: "weekly_plan",
      entityId: planId.toString(),
      actorUserId: req.user.claims.sub,
      reason: `Pushed ${createdActions.length} actions from plan`,
      detailsJson: JSON.stringify({ actionIds: createdActions.map(a => a.id) }),
    });
    await audit(tenantId, req.user.claims.sub, "weekly_plan", planId.toString(), "plan_pushed_actions", { after: { actionsCreated: createdActions.length } });

    res.json(ok({ plan: { ...plan, status: "pushed" }, actionsCreated: createdActions.length }));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

intelligenceRouter.get("/tenants/:tenantId/playbooks/effectiveness", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const hasAccess = await requireTenantAccess(req, res, tenantId); if (!hasAccess) return;
    const snapshots = await storage.getPlaybookEffectiveness(tenantId);

    const byPlaybook: Record<number, { playbookId: number; applications: number; avgUplift: number; totalUplift: number }> = {};
    for (const s of snapshots) {
      if (!byPlaybook[s.playbookId]) byPlaybook[s.playbookId] = { playbookId: s.playbookId, applications: 0, avgUplift: 0, totalUplift: 0 };
      byPlaybook[s.playbookId].applications++;
      byPlaybook[s.playbookId].totalUplift += s.upliftPercent;
    }
    const rankings = Object.values(byPlaybook).map(p => ({
      ...p,
      avgUplift: p.applications > 0 ? Math.round((p.totalUplift / p.applications) * 100) / 100 : 0,
    })).sort((a, b) => b.avgUplift - a.avgUplift);

    res.json(ok({ rankings, snapshots }));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

intelligenceRouter.get("/tenants/:tenantId/playbooks/:playbookId/effectiveness", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const hasAccess = await requireTenantAccess(req, res, tenantId); if (!hasAccess) return;
    const playbookId = parseInt(req.params.playbookId);
    const snapshots = await storage.getPlaybookEffectiveness(tenantId, playbookId);
    res.json(ok(snapshots));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

intelligenceRouter.get("/tenants/:tenantId/playbooks/recommendations", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const hasAccess = await requireTenantAccess(req, res, tenantId); if (!hasAccess) return;
    const locationId = req.query.locationId ? parseInt(req.query.locationId as string) : undefined;
    const metricId = req.query.metricId ? parseInt(req.query.metricId as string) : undefined;

    const allEffectiveness = await storage.getPlaybookEffectiveness(tenantId);
    const playbookScores: Record<number, { playbookId: number; avgUplift: number; count: number; total: number; relevance: number }> = {};

    for (const s of allEffectiveness) {
      const matchesLocation = !locationId || s.locationId === locationId;
      const relevance = matchesLocation ? 1.5 : 1.0;

      if (!playbookScores[s.playbookId]) playbookScores[s.playbookId] = { playbookId: s.playbookId, avgUplift: 0, count: 0, total: 0, relevance: 0 };
      playbookScores[s.playbookId].count++;
      playbookScores[s.playbookId].total += s.upliftPercent;
      playbookScores[s.playbookId].relevance = Math.max(playbookScores[s.playbookId].relevance, relevance);
    }

    const recommendations = Object.values(playbookScores)
      .map(p => ({
        playbookId: p.playbookId,
        avgUplift: p.count > 0 ? p.total / p.count : 0,
        applications: p.count,
        relevanceScore: (p.count > 0 ? p.total / p.count : 0) * p.relevance,
      }))
      .filter(r => r.avgUplift > 0)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 5);

    res.json(ok(recommendations));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

intelligenceRouter.post("/tenants/:tenantId/playbooks/compute-effectiveness", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const hasAccess = await requireTenantAccess(req, res, tenantId); if (!hasAccess) return;
    const lastRun = effectivenessRecomputeCooldown.get(tenantId);
    if (lastRun && Date.now() - lastRun < RECOMPUTE_COOLDOWN_MS) {
      const waitSec = Math.ceil((RECOMPUTE_COOLDOWN_MS - (Date.now() - lastRun)) / 1000);
      return res.status(429).json(err("RATE_LIMITED", `Please wait ${waitSec}s before recomputing effectiveness`));
    }
    effectivenessRecomputeCooldown.set(tenantId, Date.now());
    const applications = await storage.getPlaybookApplications(tenantId);
    let computed = 0;

    for (const app of applications) {
      const playbook = await storage.getPlaybook(app.playbookId);
      if (!playbook) continue;

      const steps = await storage.getPlaybookSteps(app.playbookId);
      const metricIds = steps.filter(s => s.metricDefinitionId).map(s => s.metricDefinitionId!);
      if (metricIds.length === 0) continue;

      const appDate = app.createdAt || new Date();
      const prePeriodEnd = appDate;
      const prePeriodStart = new Date(appDate.getTime() - 90 * 24 * 60 * 60 * 1000);
      const postPeriodStart = appDate;
      const postPeriodEnd = new Date(appDate.getTime() + 90 * 24 * 60 * 60 * 1000);

      for (const metricId of metricIds) {
        const preValues = await db.select().from(metricValues)
          .where(and(
            eq(metricValues.locationId, app.locationId),
            eq(metricValues.metricDefinitionId, metricId),
            gte(metricValues.periodStart, prePeriodStart),
            lte(metricValues.periodStart, prePeriodEnd)
          ));

        const postValues = await db.select().from(metricValues)
          .where(and(
            eq(metricValues.locationId, app.locationId),
            eq(metricValues.metricDefinitionId, metricId),
            gte(metricValues.periodStart, postPeriodStart),
            lte(metricValues.periodStart, postPeriodEnd)
          ));

        if (preValues.length === 0 || postValues.length === 0) continue;

        const preAvg = preValues.reduce((a, v) => a + parseFloat(v.value), 0) / preValues.length;
        const postAvg = postValues.reduce((a, v) => a + parseFloat(v.value), 0) / postValues.length;
        const uplift = preAvg !== 0 ? ((postAvg - preAvg) / Math.abs(preAvg)) * 100 : 0;

        await storage.createPlaybookEffectivenessSnapshot({
          tenantId,
          playbookId: app.playbookId,
          locationId: app.locationId,
          applicationId: app.id,
          preAvgValue: preAvg,
          postAvgValue: postAvg,
          upliftPercent: uplift,
          prePeriods: preValues.length,
          postPeriods: postValues.length,
        });
        computed++;
      }
    }

    await audit(tenantId, req.user.claims.sub, "playbook", tenantId.toString(), "effectiveness_computed", { after: { snapshotsCreated: computed } });
    res.json(ok({ snapshotsCreated: computed }));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

intelligenceRouter.post("/admin/executive-reports/:tenantId/run", isAuthenticated, isSuperAdminGuard, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const userId = req.user.claims.sub;
    const weekKey = getWeekKey();

    const riskSnaps = await storage.getRiskSnapshots(tenantId);
    const tenantGoals = await db.select().from(goals).where(eq(goals.tenantId, tenantId));
    const tenantActions = await storage.getActions(tenantId, {});
    const openOpps = await storage.getOpportunities(tenantId);

    const locs = await storage.getLocations(tenantId);
    const metrics = await storage.getMetricDefinitions(tenantId);

    const improved: any[] = [];
    const worsened: any[] = [];
    for (const rs of riskSnaps) {
      if (rs.trendSlope > 0.05) {
        const loc = locs.find(l => l.id === rs.locationId);
        const met = metrics.find(m => m.id === rs.metricDefinitionId);
        improved.push({ location: loc?.name, metric: met?.name, slope: rs.trendSlope, riskScore: rs.riskScore });
      } else if (rs.trendSlope < -0.05) {
        const loc = locs.find(l => l.id === rs.locationId);
        const met = metrics.find(m => m.id === rs.metricDefinitionId);
        worsened.push({ location: loc?.name, metric: met?.name, slope: rs.trendSlope, riskScore: rs.riskScore });
      }
    }

    const risksData = riskSnaps
      .filter(s => s.riskScore >= 60)
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 10)
      .map(s => {
        const loc = locs.find(l => l.id === s.locationId);
        const met = metrics.find(m => m.id === s.metricDefinitionId);
        return { location: loc?.name, metric: met?.name, riskScore: s.riskScore, earlyWarnings: s.earlyWarnings ? JSON.parse(s.earlyWarnings) : [] };
      });

    const recommendedMoves: any[] = [];
    const offTrackGoals = tenantGoals.filter(g => g.status === "off_track");
    for (const g of offTrackGoals.slice(0, 3)) {
      recommendedMoves.push({ type: "goal", action: `Prioritize "${g.name}" — off track for ${g.consecutiveOffTrack || 0} periods`, priority: "high" });
    }
    const overdueActions = tenantActions.filter(a => a.status !== "done" && a.dueDate && a.dueDate < new Date());
    for (const a of overdueActions.slice(0, 2)) {
      recommendedMoves.push({ type: "action", action: `Complete overdue: "${a.title}"`, priority: "medium" });
    }

    const summaryLines = [
      `# Executive Report — ${weekKey}`,
      ``,
      `## What Improved`,
      improved.length > 0 ? improved.map(i => `- **${i.location}** / ${i.metric}: positive trend (slope ${i.slope.toFixed(4)})`).join("\n") : "- No significant improvements detected",
      ``,
      `## What Worsened`,
      worsened.length > 0 ? worsened.map(w => `- **${w.location}** / ${w.metric}: declining trend (slope ${w.slope.toFixed(4)}, risk ${w.riskScore.toFixed(0)})`).join("\n") : "- No significant deterioration detected",
      ``,
      `## Biggest Risks`,
      risksData.length > 0 ? risksData.map(r => `- **${r.location}** / ${r.metric}: risk score ${r.riskScore.toFixed(0)}`).join("\n") : "- No high-risk items",
      ``,
      `## Recommended Next Moves`,
      recommendedMoves.length > 0 ? recommendedMoves.map((m, i) => `${i + 1}. [${m.priority.toUpperCase()}] ${m.action}`).join("\n") : "- No urgent recommendations",
    ];

    const report = await storage.createExecutiveReport({
      tenantId,
      generatedByUserId: userId,
      weekKey,
      improvedJson: JSON.stringify(improved),
      worsenedJson: JSON.stringify(worsened),
      risksJson: JSON.stringify(risksData),
      recommendedMovesJson: JSON.stringify(recommendedMoves),
      summaryMarkdown: summaryLines.join("\n"),
    });

    await storage.createAutomationDecisionLog({
      tenantId,
      decisionType: "report_generated",
      entityType: "executive_report",
      entityId: report.id.toString(),
      actorUserId: userId,
      reason: `Executive report generated for week ${weekKey}`,
      detailsJson: JSON.stringify({ weekKey, improved: improved.length, worsened: worsened.length, risks: risksData.length, moves: recommendedMoves.length }),
    });
    await audit(tenantId, userId, "executive_report", report.id.toString(), "report_generated", { after: { weekKey } });
    res.json(ok(report));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

intelligenceRouter.get("/admin/executive-reports/:tenantId/history", isAuthenticated, isSuperAdminGuard, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const reports = await storage.getExecutiveReports(tenantId);
    res.json(ok(reports));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

intelligenceRouter.get("/admin/executive-reports/:tenantId/:reportId", isAuthenticated, isSuperAdminGuard, async (req: any, res) => {
  try {
    const reportId = parseInt(req.params.reportId);
    const report = await storage.getExecutiveReport(reportId);
    if (!report) return res.status(404).json(err("NOT_FOUND", "Report not found"));
    res.json(ok(report));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

intelligenceRouter.get("/superadmin/tower/overview", isAuthenticated, isSuperAdminGuard, async (req: any, res) => {
  try {
    const allTenants = await storage.getTenants();
    const tenantSummaries = [];

    let totalLocations = 0;
    let totalRiskSum = 0;
    let totalRiskCount = 0;
    let totalIncidents = 0;
    let totalOpenActions = 0;

    for (const tenant of allTenants) {
      const locs = await storage.getLocations(tenant.id);
      const riskSnaps = await storage.getRiskSnapshots(tenant.id);
      const incidents = await storage.getIncidents({ tenantId: tenant.id, status: "open" });
      const openActions = await storage.getActions(tenant.id, { status: "open" });

      const avgRisk = riskSnaps.length > 0
        ? Math.round(riskSnaps.reduce((a, s) => a + s.riskScore, 0) / riskSnaps.length)
        : 0;
      const highRisk = riskSnaps.filter(s => s.riskScore >= 60).length;

      totalLocations += locs.length;
      totalRiskSum += riskSnaps.reduce((a, s) => a + s.riskScore, 0);
      totalRiskCount += riskSnaps.length;
      totalIncidents += incidents.length;
      totalOpenActions += openActions.length;

      tenantSummaries.push({
        tenantId: tenant.id,
        tenantName: tenant.name,
        locations: locs.length,
        avgRisk,
        highRiskCount: highRisk,
        openIncidents: incidents.length,
        openActions: openActions.length,
        riskLevel: avgRisk >= 60 ? "critical" : avgRisk >= 40 ? "high" : avgRisk >= 20 ? "medium" : "low",
      });
    }

    res.json(ok({
      totalTenants: allTenants.length,
      totalLocations,
      overallAvgRisk: totalRiskCount > 0 ? Math.round(totalRiskSum / totalRiskCount) : 0,
      totalOpenIncidents: totalIncidents,
      totalOpenActions,
      tenants: tenantSummaries.sort((a, b) => b.avgRisk - a.avgRisk),
    }));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

intelligenceRouter.get("/superadmin/tower/tenants", isAuthenticated, isSuperAdminGuard, async (req: any, res) => {
  try {
    const allTenants = await storage.getTenants();
    const sort = (req.query.sort as string) || "risk";
    const riskLevel = req.query.riskLevel as string | undefined;

    const tenantData = [];
    for (const tenant of allTenants) {
      const locs = await storage.getLocations(tenant.id);
      const riskSnaps = await storage.getRiskSnapshots(tenant.id);
      const avgRisk = riskSnaps.length > 0
        ? Math.round(riskSnaps.reduce((a, s) => a + s.riskScore, 0) / riskSnaps.length)
        : 0;
      const level = avgRisk >= 60 ? "critical" : avgRisk >= 40 ? "high" : avgRisk >= 20 ? "medium" : "low";

      if (riskLevel && level !== riskLevel) continue;

      tenantData.push({
        tenantId: tenant.id,
        tenantName: tenant.name,
        slug: tenant.slug,
        locations: locs.length,
        avgRisk,
        riskLevel: level,
        highRiskSnapshots: riskSnaps.filter(s => s.riskScore >= 60).length,
        totalSnapshots: riskSnaps.length,
      });
    }

    if (sort === "risk") tenantData.sort((a, b) => b.avgRisk - a.avgRisk);
    else if (sort === "name") tenantData.sort((a, b) => a.tenantName.localeCompare(b.tenantName));
    else if (sort === "locations") tenantData.sort((a, b) => b.locations - a.locations);

    res.json(ok(tenantData));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

intelligenceRouter.get("/superadmin/tower/interventions", isAuthenticated, isSuperAdminGuard, async (req: any, res) => {
  try {
    const status = req.query.status as string | undefined;
    const severity = req.query.severity as string | undefined;
    const interventions = await storage.getInterventions({ status, severity });
    res.json(ok(interventions));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

intelligenceRouter.post("/superadmin/tower/interventions/:id/assign", isAuthenticated, isSuperAdminGuard, async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const { assignedToUserId } = req.body;
    if (!assignedToUserId) return res.status(400).json(err("VALIDATION_ERROR", "assignedToUserId required"));

    const intervention = await storage.getIntervention(id);
    if (!intervention) return res.status(404).json(err("NOT_FOUND", "Intervention not found"));

    const updated = await storage.updateIntervention(id, {
      assignedToUserId,
      assignedAt: new Date(),
      status: "assigned",
    });

    await audit(intervention.tenantId, req.user.claims.sub, "intervention", id.toString(), "intervention_assigned", { after: { assignedToUserId } });
    res.json(ok(updated));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

intelligenceRouter.get("/tenants/:tenantId/automation-settings", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const hasAccess = await requireTenantAccess(req, res, tenantId); if (!hasAccess) return;
    const settings = await storage.getAutomationSettings(tenantId);
    res.json(ok(settings || {
      tenantId,
      maxActionsPerWeek: 20,
      blockedCategories: null,
      confidenceThreshold: 0.7,
      requireApproval: "true",
    }));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

intelligenceRouter.put("/tenants/:tenantId/automation-settings", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const hasAccess = await requireTenantAccess(req, res, tenantId); if (!hasAccess) return;
    const schema = z.object({
      maxActionsPerWeek: z.number().min(1).max(100).optional(),
      blockedCategories: z.string().nullable().optional(),
      confidenceThreshold: z.number().min(0).max(1).optional(),
      requireApproval: z.enum(["true", "false"]).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(err("VALIDATION_ERROR", fromZodError(parsed.error).toString()));

    const updated = await storage.upsertAutomationSettings(tenantId, parsed.data);
    await audit(tenantId, req.user.claims.sub, "automation_settings", tenantId.toString(), "settings_updated", { after: parsed.data });
    res.json(ok(updated));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

intelligenceRouter.get("/tenants/:tenantId/automation-logs", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const hasAccess = await requireTenantAccess(req, res, tenantId); if (!hasAccess) return;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
    const logs = await storage.getAutomationDecisionLogs(tenantId, limit);
    res.json(ok(logs));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});
