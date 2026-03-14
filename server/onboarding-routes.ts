import { Router } from "express";
import { storage } from "./storage";
import { isAuthenticated } from "./replit_integrations/auth";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { parseIntOrThrow, ValidationError } from "./utils";

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
    const { onboardingProgress } = await import("@shared/schema");
    const { tenantUsers: tuTable } = await import("@shared/schema");
    const { eq: eqOp } = await import("drizzle-orm");

    const [progress] = await dbInstance.select().from(onboardingProgress).where(eqOp(onboardingProgress.userId, userId));

    const userMemberships = await dbInstance.select({ tenantId: tuTable.tenantId }).from(tuTable).where(eqOp(tuTable.userId, userId));
    const userTenants: any[] = [];
    for (const m of userMemberships) {
      const t = await storage.getTenant(m.tenantId);
      if (t) userTenants.push(t);
    }

    res.json(ok({
      progress: progress || null,
      hasTenants: userTenants.length > 0,
      tenantId: progress?.tenantId || (userTenants.length > 0 ? userTenants[0].id : null),
      currentStep: progress?.currentStep || 0,
      completedSteps: progress?.completedSteps || [],
      savedData: progress?.savedData || {},
      isComplete: progress?.isComplete || false,
    }));
  } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

onboardingRouter.put("/onboarding/progress", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json(err("UNAUTHORIZED", "Unauthorized"));

    const progressSchema = z.object({
      tenantId: z.coerce.number().optional(),
      currentStep: z.coerce.number().int().min(0).optional(),
      completedSteps: z.array(z.string()).optional(),
      savedData: z.record(z.any()).optional(),
      isComplete: z.boolean().optional(),
    });
    const parsed = progressSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(err("VALIDATION_ERROR", fromZodError(parsed.error).toString()));
    const { tenantId, currentStep, completedSteps, savedData, isComplete } = parsed.data;

    const { db: dbInstance } = await import("./db");
    const { onboardingProgress } = await import("@shared/schema");
    const { eq: eqOp } = await import("drizzle-orm");

    const [existing] = await dbInstance.select().from(onboardingProgress).where(eqOp(onboardingProgress.userId, userId));

    if (existing) {
      const updates: any = { updatedAt: new Date() };
      if (tenantId !== undefined) updates.tenantId = tenantId;
      if (currentStep !== undefined) updates.currentStep = currentStep;
      if (completedSteps !== undefined) updates.completedSteps = completedSteps;
      if (savedData !== undefined) {
        const merged = { ...(existing.savedData as any || {}), ...savedData };
        updates.savedData = merged;
      }
      if (isComplete !== undefined) {
        updates.isComplete = isComplete;
        if (isComplete) updates.completedAt = new Date();
      }
      const [updated] = await dbInstance.update(onboardingProgress).set(updates).where(eqOp(onboardingProgress.id, existing.id)).returning();
      return res.json(ok(updated));
    }

    const [created] = await dbInstance.insert(onboardingProgress).values({
      userId,
      tenantId: tenantId || null,
      currentStep: currentStep || 0,
      completedSteps: completedSteps || [],
      savedData: savedData || {},
      isComplete: isComplete || false,
    }).returning();

    res.json(ok(created));
  } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

onboardingRouter.post("/onboarding/complete", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json(err("UNAUTHORIZED", "Unauthorized"));

    const completeSchema = z.object({
      tenantId: z.coerce.number({ required_error: "tenantId required" }),
    });
    const parsed = completeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(err("VALIDATION_ERROR", fromZodError(parsed.error).toString()));
    const { tenantId } = parsed.data;

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
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

onboardingRouter.post("/onboarding/starter-kpis", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json(err("UNAUTHORIZED", "Unauthorized"));

    const starterKpisSchema = z.object({
      tenantId: z.coerce.number({ required_error: "tenantId required" }),
    });
    const parsed = starterKpisSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(err("VALIDATION_ERROR", fromZodError(parsed.error).toString()));
    const { tenantId } = parsed.data;

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
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

onboardingRouter.post("/onboarding/starter-scorecard", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json(err("UNAUTHORIZED", "Unauthorized"));

    const starterScorecardSchema = z.object({
      tenantId: z.coerce.number({ required_error: "tenantId required" }),
    });
    const parsed = starterScorecardSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(err("VALIDATION_ERROR", fromZodError(parsed.error).toString()));
    const { tenantId } = parsed.data;

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
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

onboardingRouter.post("/onboarding/starter-alert", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json(err("UNAUTHORIZED", "Unauthorized"));

    const starterAlertSchema = z.object({
      tenantId: z.coerce.number({ required_error: "tenantId required" }),
    });
    const parsed = starterAlertSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(err("VALIDATION_ERROR", fromZodError(parsed.error).toString()));
    const { tenantId } = parsed.data;

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
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});
