import { Router } from "express";
import { storage } from "./storage";
import { isAuthenticated } from "./replit_integrations/auth";

function ok(data: any) { return { ok: true, data }; }
function err(code: string, message: string) { return { ok: false, error: { code, message } }; }

export const onboardingRouter = Router();

const STARTER_KPIS = [
  {
    name: "Revenue",
    dataType: "currency",
    unit: "USD",
    direction: "higher_is_better",
    thresholds: [
      { band: "excellent", minValue: 50000, maxValue: 999999, color: "#22c55e" },
      { band: "good", minValue: 30000, maxValue: 49999, color: "#3b82f6" },
      { band: "acceptable", minValue: 15000, maxValue: 29999, color: "#eab308" },
      { band: "poor", minValue: 0, maxValue: 14999, color: "#ef4444" },
    ],
  },
  {
    name: "Customer Satisfaction",
    dataType: "percentage",
    unit: "%",
    direction: "higher_is_better",
    thresholds: [
      { band: "excellent", minValue: 90, maxValue: 100, color: "#22c55e" },
      { band: "good", minValue: 75, maxValue: 89, color: "#3b82f6" },
      { band: "acceptable", minValue: 60, maxValue: 74, color: "#eab308" },
      { band: "poor", minValue: 0, maxValue: 59, color: "#ef4444" },
    ],
  },
  {
    name: "Labor Cost %",
    dataType: "percentage",
    unit: "%",
    direction: "lower_is_better",
    thresholds: [
      { band: "excellent", minValue: 0, maxValue: 25, color: "#22c55e" },
      { band: "good", minValue: 26, maxValue: 32, color: "#3b82f6" },
      { band: "acceptable", minValue: 33, maxValue: 40, color: "#eab308" },
      { band: "poor", minValue: 41, maxValue: 100, color: "#ef4444" },
    ],
  },
];

onboardingRouter.get("/onboarding/progress", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json(err("UNAUTHORIZED", "Unauthorized"));

    const { db: dbInstance } = await import("./db");
    const { tenantUsers: tuTable, tenants: tenantsTable } = await import("@shared/schema");
    const { eq: eqOp } = await import("drizzle-orm");
    const userMemberships = await dbInstance.select({ tenantId: tuTable.tenantId }).from(tuTable).where(eqOp(tuTable.userId, userId));
    const userTenants: any[] = [];
    for (const m of userMemberships) {
      const t = await storage.getTenant(m.tenantId);
      if (t) userTenants.push(t);
    }

    if (userTenants.length === 0) {
      return res.json(ok({
        progress: null,
        hasTenants: false,
        currentStep: 0,
        completedSteps: [],
        isComplete: false,
      }));
    }

    const tenantId = userTenants[0].id;
    const progress = await storage.getOnboardingProgress(tenantId, userId);

    res.json(ok({
      progress,
      hasTenants: true,
      tenantId,
      currentStep: progress?.currentStep || 0,
      completedSteps: progress?.completedSteps || [],
      isComplete: progress?.isComplete || false,
    }));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

onboardingRouter.put("/onboarding/progress", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json(err("UNAUTHORIZED", "Unauthorized"));

    const { tenantId, currentStep, completedSteps } = req.body;
    if (!tenantId) return res.status(400).json(err("BAD_REQUEST", "tenantId required"));

    const progress = await storage.upsertOnboardingProgress({
      tenantId,
      userId,
      currentStep: currentStep || 0,
      completedSteps: completedSteps || [],
      isComplete: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    res.json(ok(progress));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

onboardingRouter.post("/onboarding/complete", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json(err("UNAUTHORIZED", "Unauthorized"));

    const { tenantId } = req.body;
    if (!tenantId) return res.status(400).json(err("BAD_REQUEST", "tenantId required"));

    const progress = await storage.upsertOnboardingProgress({
      tenantId,
      userId,
      currentStep: 6,
      completedSteps: ["tenant", "location", "kpis", "scorecard", "score_run", "alert"],
      isComplete: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    res.json(ok(progress));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

onboardingRouter.post("/onboarding/starter-kpis", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json(err("UNAUTHORIZED", "Unauthorized"));

    const { tenantId } = req.body;
    if (!tenantId) return res.status(400).json(err("BAD_REQUEST", "tenantId required"));

    const existingMetrics = await storage.getMetricDefinitions(tenantId);
    const createdMetrics = [];

    for (const kpi of STARTER_KPIS) {
      const exists = existingMetrics.find((m: any) => m.name === kpi.name);
      if (exists) {
        createdMetrics.push(exists);
        continue;
      }

      const metric = await storage.createMetricDefinition({
        tenantId,
        name: kpi.name,
        dataType: kpi.dataType,
        unit: kpi.unit,
        direction: kpi.direction,
        isActive: true,
      });

      for (const t of kpi.thresholds) {
        await storage.createMetricThreshold({
          metricDefinitionId: metric.id,
          band: t.band,
          minValue: t.minValue,
          maxValue: t.maxValue,
          color: t.color,
        });
      }

      createdMetrics.push(metric);
    }

    res.json(ok({ metrics: createdMetrics }));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

onboardingRouter.post("/onboarding/starter-scorecard", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json(err("UNAUTHORIZED", "Unauthorized"));

    const { tenantId } = req.body;
    if (!tenantId) return res.status(400).json(err("BAD_REQUEST", "tenantId required"));

    const metrics = await storage.getMetricDefinitions(tenantId);
    if (metrics.length === 0) {
      return res.status(400).json(err("BAD_REQUEST", "Create KPIs first"));
    }

    const existingScorecards = await storage.getScorecardTemplates(tenantId);
    const existing = existingScorecards.find((s: any) => s.name === "Starter Performance Scorecard");
    if (existing) {
      return res.json(ok({ scorecard: existing }));
    }

    const weightPerMetric = Math.floor(100 / metrics.length);
    const remainder = 100 - weightPerMetric * metrics.length;

    const scorecard = await storage.createScorecardTemplate({
      tenantId,
      name: "Starter Performance Scorecard",
      isActive: true,
    });

    for (let i = 0; i < metrics.length; i++) {
      await storage.createScorecardMetric({
        scorecardTemplateId: scorecard.id,
        metricDefinitionId: metrics[i].id,
        weight: weightPerMetric + (i === 0 ? remainder : 0),
      });
    }

    res.json(ok({ scorecard }));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

onboardingRouter.post("/onboarding/starter-alert", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json(err("UNAUTHORIZED", "Unauthorized"));

    const { tenantId } = req.body;
    if (!tenantId) return res.status(400).json(err("BAD_REQUEST", "tenantId required"));

    const metrics = await storage.getMetricDefinitions(tenantId);
    const revenueMetric = metrics.find((m: any) => m.name === "Revenue");
    if (!revenueMetric) {
      return res.status(400).json(err("BAD_REQUEST", "Create KPIs first (Revenue metric needed)"));
    }

    const existingRules = await storage.getAlertRules(tenantId);
    const existing = existingRules.find((r: any) => r.name === "Revenue Below Target");
    if (existing) {
      return res.json(ok({ alertRule: existing }));
    }

    const alertRule = await storage.createAlertRule({
      tenantId,
      name: "Revenue Below Target",
      severity: "high",
      conditionJson: JSON.stringify({
        type: "threshold_breach",
        metricId: revenueMetric.id,
        operator: "less_than",
        value: 15000,
      }),
      actionJson: JSON.stringify({
        notify: true,
        channels: ["email"],
      }),
      isActive: true,
      cooldownMinutes: 1440,
      escalationMinutes: 4320,
      dedupWindowMinutes: 1440,
      impactLevel: "high",
      persistentThresholdDays: 7,
      recommendedActions: [
        "Review recent marketing spend and ROI",
        "Check staffing levels against traffic patterns",
        "Analyze top-selling vs underperforming products",
        "Compare to nearby competitor pricing",
      ],
    });

    res.json(ok({ alertRule }));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});
