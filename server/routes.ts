import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import {
  insertTenantSchema,
  insertLocationSchema,
  insertMetricDefinitionSchema,
  insertMetricThresholdSchema,
  insertScorecardTemplateSchema,
  insertScorecardMetricSchema,
  insertMetricValueSchema,
} from "@shared/schema";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { seed } from "./seed";
import { adminRouter } from "./admin-routes";
import { phase5Router } from "./phase5-routes";
import { securityRouter } from "./security-routes";
import { intelligenceRouter } from "./intelligence-routes";
import { recommendationRouter } from "./recommendation-routes";
import { confidenceRouter } from "./confidence-routes";
import { securityV1Router } from "./security-v1-routes";
import { jobRouter } from "./job-routes";
import { inboxRouter } from "./inbox-routes";
import { onboardingRouter } from "./onboarding-routes";
import { dailyBriefRouter } from "./daily-brief-routes";
import { generateForecast, detectAnomalies } from "./services/analytics";
import { startScheduler } from "./services/scheduler";
import { startJobProcessor } from "./services/job-queue";
import { tracingMiddleware } from "./middleware/tracing";
import { parseIntOrThrow, ValidationError } from "./utils";

function ok(data: any) {
  return { ok: true, data };
}

function err(code: string, message: string, details?: any) {
  return { ok: false, error: { code, message, ...(details ? { details } : {}) } };
}

function zodError(res: any, error: z.ZodError) {
  const validationError = fromZodError(error);
  return res.status(400).json(err("VALIDATION_ERROR", validationError.toString(), error.errors));
}

async function requireTenantAccess(req: any, res: any, tenantId: number, requiredRoles?: string[]) {
  const userId = req.user?.claims?.sub;
  if (!userId) {
    res.status(401).json(err("UNAUTHORIZED", "Unauthorized"));
    return false;
  }
  const tu = await storage.getTenantUserByUserId(tenantId, userId);
  if (!tu) {
    res.status(403).json(err("FORBIDDEN", "Forbidden: no access to this tenant"));
    return false;
  }
  if (requiredRoles && !requiredRoles.includes(tu.role)) {
    res.status(403).json(err("FORBIDDEN", `Forbidden: requires role ${requiredRoles.join(" or ")}`));
    return false;
  }
  return tu;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);

  app.use(tracingMiddleware);

  app.get("/api/admin/tenants", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userTenants = await storage.getUserTenants(userId);
      const hasOwnerRole = userTenants.some((tu) => tu.role === "owner" || tu.role === "admin");
      if (!hasOwnerRole) {
        return res.status(403).json(err("FORBIDDEN", "Admin access required"));
      }
      const tenants = await storage.getTenants();
      res.json(ok(tenants));
    } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
      res.status(500).json(err("INTERNAL_ERROR", error.message));
    }
  });

  app.get("/api/tenants", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userTenants = await storage.getUserTenants(userId);
      res.json(ok(userTenants.map((ut) => ({ ...ut.tenant, role: ut.role }))));
    } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
      res.status(500).json(err("INTERNAL_ERROR", error.message));
    }
  });

  app.post("/api/tenants", isAuthenticated, async (req: any, res) => {
    try {
      const parsed = insertTenantSchema.safeParse(req.body);
      if (!parsed.success) return zodError(res, parsed.error);
      const tenant = await storage.createTenant(parsed.data);
      const userId = req.user.claims.sub;
      await storage.createTenantUser({ tenantId: tenant.id, userId, role: "owner" });
      res.status(201).json(ok(tenant));
    } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
      if (error.message?.includes("unique")) {
        return res.status(409).json(err("CONFLICT", "Tenant slug already exists"));
      }
      res.status(500).json(err("INTERNAL_ERROR", error.message));
    }
  });

  app.get("/api/tenants/:tenantId", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
      const hasAccess = await requireTenantAccess(req, res, tenantId);
      if (!hasAccess) return;
      const tenant = await storage.getTenant(tenantId);
      if (!tenant) return res.status(404).json(err("NOT_FOUND", "Tenant not found"));
      res.json(ok(tenant));
    } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
      res.status(500).json(err("INTERNAL_ERROR", error.message));
    }
  });

  app.patch("/api/tenants/:tenantId", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
      const hasAccess = await requireTenantAccess(req, res, tenantId, ["owner", "admin"]);
      if (!hasAccess) return;
      const parsed = insertTenantSchema.partial().safeParse(req.body);
      if (!parsed.success) return zodError(res, parsed.error);
      const tenant = await storage.updateTenant(tenantId, parsed.data);
      if (!tenant) return res.status(404).json(err("NOT_FOUND", "Tenant not found"));
      res.json(ok(tenant));
    } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
      res.status(500).json(err("INTERNAL_ERROR", error.message));
    }
  });

  app.delete("/api/tenants/:tenantId", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
      const hasAccess = await requireTenantAccess(req, res, tenantId, ["owner"]);
      if (!hasAccess) return;
      const deleted = await storage.deleteTenant(tenantId);
      if (!deleted) return res.status(404).json(err("NOT_FOUND", "Tenant not found"));
      res.json(ok({ success: true }));
    } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
      res.status(500).json(err("INTERNAL_ERROR", error.message));
    }
  });

  app.get("/api/tenants/:tenantId/users", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
      const hasAccess = await requireTenantAccess(req, res, tenantId);
      if (!hasAccess) return;
      const users = await storage.getTenantUsersWithNames(tenantId);
      res.json(ok(users));
    } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
      res.status(500).json(err("INTERNAL_ERROR", error.message));
    }
  });

  app.get("/api/tenants/:tenantId/locations", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
      const hasAccess = await requireTenantAccess(req, res, tenantId);
      if (!hasAccess) return;
      const locs = await storage.getLocations(tenantId);
      res.json(ok(locs));
    } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
      res.status(500).json(err("INTERNAL_ERROR", error.message));
    }
  });

  app.post("/api/tenants/:tenantId/locations", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
      const hasAccess = await requireTenantAccess(req, res, tenantId, ["owner", "admin"]);
      if (!hasAccess) return;
      const parsed = insertLocationSchema.safeParse({ ...req.body, tenantId });
      if (!parsed.success) return zodError(res, parsed.error);
      const location = await storage.createLocation(parsed.data);
      res.status(201).json(ok(location));
    } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
      res.status(500).json(err("INTERNAL_ERROR", error.message));
    }
  });

  app.patch("/api/tenants/:tenantId/locations/:locationId", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
      const locationId = parseIntOrThrow(req.params.locationId, "locationId");
      const hasAccess = await requireTenantAccess(req, res, tenantId, ["owner", "admin"]);
      if (!hasAccess) return;
      const location = await storage.getLocation(locationId);
      if (!location || location.tenantId !== tenantId) {
        return res.status(404).json(err("NOT_FOUND", "Location not found"));
      }
      const parsed = insertLocationSchema.partial().safeParse(req.body);
      if (!parsed.success) return zodError(res, parsed.error);
      const updated = await storage.updateLocation(locationId, parsed.data);
      res.json(ok(updated));
    } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
      res.status(500).json(err("INTERNAL_ERROR", error.message));
    }
  });

  app.delete("/api/tenants/:tenantId/locations/:locationId", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
      const locationId = parseIntOrThrow(req.params.locationId, "locationId");
      const hasAccess = await requireTenantAccess(req, res, tenantId, ["owner", "admin"]);
      if (!hasAccess) return;
      const location = await storage.getLocation(locationId);
      if (!location || location.tenantId !== tenantId) {
        return res.status(404).json(err("NOT_FOUND", "Location not found"));
      }
      await storage.deleteLocation(locationId);
      res.json(ok({ success: true }));
    } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
      res.status(500).json(err("INTERNAL_ERROR", error.message));
    }
  });

  app.get("/api/tenants/:tenantId/metrics", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
      const hasAccess = await requireTenantAccess(req, res, tenantId);
      if (!hasAccess) return;
      const metrics = await storage.getMetricDefinitions(tenantId);
      res.json(ok(metrics));
    } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
      res.status(500).json(err("INTERNAL_ERROR", error.message));
    }
  });

  app.post("/api/tenants/:tenantId/metrics", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
      const hasAccess = await requireTenantAccess(req, res, tenantId, ["owner", "admin"]);
      if (!hasAccess) return;
      const parsed = insertMetricDefinitionSchema.safeParse({ ...req.body, tenantId });
      if (!parsed.success) return zodError(res, parsed.error);
      const metric = await storage.createMetricDefinition(parsed.data);
      res.status(201).json(ok(metric));
    } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
      res.status(500).json(err("INTERNAL_ERROR", error.message));
    }
  });

  app.patch("/api/tenants/:tenantId/metrics/:metricId", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
      const metricId = parseIntOrThrow(req.params.metricId, "metricId");
      const hasAccess = await requireTenantAccess(req, res, tenantId, ["owner", "admin"]);
      if (!hasAccess) return;
      const metric = await storage.getMetricDefinition(metricId);
      if (!metric || metric.tenantId !== tenantId) {
        return res.status(404).json(err("NOT_FOUND", "Metric not found"));
      }
      const parsed = insertMetricDefinitionSchema.partial().safeParse(req.body);
      if (!parsed.success) return zodError(res, parsed.error);
      const updated = await storage.updateMetricDefinition(metricId, parsed.data);
      res.json(ok(updated));
    } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
      res.status(500).json(err("INTERNAL_ERROR", error.message));
    }
  });

  app.patch("/api/tenants/:tenantId/metrics/:metricId/activate", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
      const metricId = parseIntOrThrow(req.params.metricId, "metricId");
      const hasAccess = await requireTenantAccess(req, res, tenantId, ["owner", "admin"]);
      if (!hasAccess) return;
      const metric = await storage.getMetricDefinition(metricId);
      if (!metric || metric.tenantId !== tenantId) {
        return res.status(404).json(err("NOT_FOUND", "Metric not found"));
      }
      const schema = z.object({ isActive: z.boolean() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return zodError(res, parsed.error);
      const updated = await storage.updateMetricDefinition(metricId, { isActive: parsed.data.isActive });
      res.json(ok(updated));
    } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
      res.status(500).json(err("INTERNAL_ERROR", error.message));
    }
  });

  app.delete("/api/tenants/:tenantId/metrics/:metricId", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
      const metricId = parseIntOrThrow(req.params.metricId, "metricId");
      const hasAccess = await requireTenantAccess(req, res, tenantId, ["owner", "admin"]);
      if (!hasAccess) return;
      const metric = await storage.getMetricDefinition(metricId);
      if (!metric || metric.tenantId !== tenantId) {
        return res.status(404).json(err("NOT_FOUND", "Metric not found"));
      }
      await storage.deleteMetricDefinition(metricId);
      res.json(ok({ success: true }));
    } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
      res.status(500).json(err("INTERNAL_ERROR", error.message));
    }
  });

  app.get("/api/tenants/:tenantId/metrics/:metricId/thresholds", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
      const metricId = parseIntOrThrow(req.params.metricId, "metricId");
      const hasAccess = await requireTenantAccess(req, res, tenantId);
      if (!hasAccess) return;
      const metric = await storage.getMetricDefinition(metricId);
      if (!metric || metric.tenantId !== tenantId) {
        return res.status(404).json(err("NOT_FOUND", "Metric not found"));
      }
      const thresholds = await storage.getMetricThresholds(metricId);
      res.json(ok(thresholds));
    } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
      res.status(500).json(err("INTERNAL_ERROR", error.message));
    }
  });

  app.post("/api/tenants/:tenantId/metrics/:metricId/thresholds", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
      const metricId = parseIntOrThrow(req.params.metricId, "metricId");
      const hasAccess = await requireTenantAccess(req, res, tenantId, ["owner", "admin"]);
      if (!hasAccess) return;
      const metric = await storage.getMetricDefinition(metricId);
      if (!metric || metric.tenantId !== tenantId) {
        return res.status(404).json(err("NOT_FOUND", "Metric not found"));
      }
      const parsed = insertMetricThresholdSchema.safeParse({
        ...req.body,
        metricDefinitionId: metricId,
      });
      if (!parsed.success) return zodError(res, parsed.error);
      const threshold = await storage.createMetricThreshold(parsed.data);
      res.status(201).json(ok(threshold));
    } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
      res.status(500).json(err("INTERNAL_ERROR", error.message));
    }
  });

  app.put("/api/tenants/:tenantId/metrics/:metricId/thresholds", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
      const metricId = parseIntOrThrow(req.params.metricId, "metricId");
      const hasAccess = await requireTenantAccess(req, res, tenantId, ["owner", "admin"]);
      if (!hasAccess) return;
      const metric = await storage.getMetricDefinition(metricId);
      if (!metric || metric.tenantId !== tenantId) {
        return res.status(404).json(err("NOT_FOUND", "Metric not found"));
      }
      const schema = z.array(
        z.object({
          band: z.string(),
          minValue: z.coerce.number(),
          maxValue: z.coerce.number(),
          color: z.string().optional(),
        })
      );
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return zodError(res, parsed.error);
      await storage.deleteMetricThresholdsByMetric(metricId);
      const thresholds = [];
      for (const t of parsed.data) {
        const threshold = await storage.createMetricThreshold({
          metricDefinitionId: metricId,
          ...t,
        });
        thresholds.push(threshold);
      }
      res.json(ok(thresholds));
    } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
      res.status(500).json(err("INTERNAL_ERROR", error.message));
    }
  });

  app.delete("/api/tenants/:tenantId/metrics/:metricId/thresholds/:thresholdId", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
      const metricId = parseIntOrThrow(req.params.metricId, "metricId");
      const hasAccess = await requireTenantAccess(req, res, tenantId, ["owner", "admin"]);
      if (!hasAccess) return;
      const metric = await storage.getMetricDefinition(metricId);
      if (!metric || metric.tenantId !== tenantId) {
        return res.status(404).json(err("NOT_FOUND", "Metric not found"));
      }
      await storage.deleteMetricThreshold(parseIntOrThrow(req.params.thresholdId, "thresholdId"));
      res.json(ok({ success: true }));
    } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
      res.status(500).json(err("INTERNAL_ERROR", error.message));
    }
  });

  app.get("/api/tenants/:tenantId/scorecards", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
      const hasAccess = await requireTenantAccess(req, res, tenantId);
      if (!hasAccess) return;
      const scorecards = await storage.getScorecardTemplates(tenantId);
      res.json(ok(scorecards));
    } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
      res.status(500).json(err("INTERNAL_ERROR", error.message));
    }
  });

  app.get("/api/tenants/:tenantId/scorecards/:scorecardId", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
      const scorecardId = parseIntOrThrow(req.params.scorecardId, "scorecardId");
      const hasAccess = await requireTenantAccess(req, res, tenantId);
      if (!hasAccess) return;
      const scorecard = await storage.getScorecardTemplate(scorecardId);
      if (!scorecard || scorecard.tenantId !== tenantId) {
        return res.status(404).json(err("NOT_FOUND", "Scorecard not found"));
      }
      const metrics = await storage.getScorecardMetrics(scorecardId);
      res.json(ok({ ...scorecard, metrics }));
    } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
      res.status(500).json(err("INTERNAL_ERROR", error.message));
    }
  });

  app.post("/api/tenants/:tenantId/scorecards", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
      const hasAccess = await requireTenantAccess(req, res, tenantId, ["owner", "admin"]);
      if (!hasAccess) return;
      const { metrics, ...templateData } = req.body;
      const parsed = insertScorecardTemplateSchema.safeParse({ ...templateData, tenantId });
      if (!parsed.success) return zodError(res, parsed.error);
      const template = await storage.createScorecardTemplate(parsed.data);
      if (metrics && Array.isArray(metrics)) {
        for (const m of metrics) {
          const metricDef = await storage.getMetricDefinition(m.metricDefinitionId);
          if (!metricDef || metricDef.tenantId !== tenantId) {
            return res.status(400).json(err("NOT_FOUND", `Metric ${m.metricDefinitionId} not found in this tenant`));
          }
          await storage.createScorecardMetric({
            scorecardTemplateId: template.id,
            metricDefinitionId: m.metricDefinitionId,
            weight: m.weight,
          });
        }
      }
      const allMetrics = await storage.getScorecardMetrics(template.id);
      res.status(201).json(ok({ ...template, metrics: allMetrics }));
    } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
      res.status(500).json(err("INTERNAL_ERROR", error.message));
    }
  });

  app.patch("/api/tenants/:tenantId/scorecards/:scorecardId", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
      const scorecardId = parseIntOrThrow(req.params.scorecardId, "scorecardId");
      const hasAccess = await requireTenantAccess(req, res, tenantId, ["owner", "admin"]);
      if (!hasAccess) return;
      const scorecard = await storage.getScorecardTemplate(scorecardId);
      if (!scorecard || scorecard.tenantId !== tenantId) {
        return res.status(404).json(err("NOT_FOUND", "Scorecard not found"));
      }
      const { metrics, ...templateData } = req.body;
      if (Object.keys(templateData).length > 0) {
        const parsed = insertScorecardTemplateSchema.partial().safeParse(templateData);
        if (!parsed.success) return zodError(res, parsed.error);
        await storage.updateScorecardTemplate(scorecardId, parsed.data);
      }
      if (metrics && Array.isArray(metrics)) {
        for (const m of metrics) {
          const metricDef = await storage.getMetricDefinition(m.metricDefinitionId);
          if (!metricDef || metricDef.tenantId !== tenantId) {
            return res.status(400).json(err("NOT_FOUND", `Metric ${m.metricDefinitionId} not found in this tenant`));
          }
        }
        await storage.deleteScorecardMetricsByTemplate(scorecardId);
        for (const m of metrics) {
          await storage.createScorecardMetric({
            scorecardTemplateId: scorecardId,
            metricDefinitionId: m.metricDefinitionId,
            weight: m.weight,
          });
        }
      }
      const updated = await storage.getScorecardTemplate(scorecardId);
      const allMetrics = await storage.getScorecardMetrics(scorecardId);
      res.json(ok({ ...updated, metrics: allMetrics }));
    } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
      res.status(500).json(err("INTERNAL_ERROR", error.message));
    }
  });

  app.delete("/api/tenants/:tenantId/scorecards/:scorecardId", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
      const scorecardId = parseIntOrThrow(req.params.scorecardId, "scorecardId");
      const hasAccess = await requireTenantAccess(req, res, tenantId, ["owner", "admin"]);
      if (!hasAccess) return;
      const scorecard = await storage.getScorecardTemplate(scorecardId);
      if (!scorecard || scorecard.tenantId !== tenantId) {
        return res.status(404).json(err("NOT_FOUND", "Scorecard not found"));
      }
      await storage.deleteScorecardTemplate(scorecardId);
      res.json(ok({ success: true }));
    } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
      res.status(500).json(err("INTERNAL_ERROR", error.message));
    }
  });

  app.post("/api/tenants/:tenantId/scorecards/:scorecardId/run", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
      const scorecardId = parseIntOrThrow(req.params.scorecardId, "scorecardId");
      const hasAccess = await requireTenantAccess(req, res, tenantId);
      if (!hasAccess) return;

      const runSchema = z.object({
        locationId: z.coerce.number(),
        period: z.enum(["month", "quarter", "bi-year", "year"]),
        periodStart: z.string().transform((s) => new Date(s)),
        periodEnd: z.string().transform((s) => new Date(s)),
      });
      const parsed = runSchema.safeParse(req.body);
      if (!parsed.success) return zodError(res, parsed.error);

      const { locationId, period, periodStart, periodEnd } = parsed.data;

      const location = await storage.getLocation(locationId);
      if (!location || location.tenantId !== tenantId) {
        return res.status(404).json(err("NOT_FOUND", "Location not found in this tenant"));
      }

      const scorecard = await storage.getScorecardTemplate(scorecardId);
      if (!scorecard || scorecard.tenantId !== tenantId) {
        return res.status(404).json(err("NOT_FOUND", "Scorecard not found"));
      }

      const scorecardMetricsList = await storage.getScorecardMetrics(scorecardId);
      if (scorecardMetricsList.length === 0) {
        return res.status(400).json(err("VALIDATION_ERROR", "Scorecard has no metrics defined"));
      }

      const run = await storage.createScoreRun({
        scorecardTemplateId: scorecardId,
        locationId,
        period,
        periodStart,
        periodEnd,
      });

      let totalWeightedScore = 0;
      let totalWeight = 0;
      const details = [];

      for (const sm of scorecardMetricsList) {
        const metricValue = await storage.getMetricValueForPeriod(
          sm.metricDefinitionId,
          locationId,
          periodStart,
          periodEnd
        );

        const thresholds = await storage.getMetricThresholds(sm.metricDefinitionId);

        let rawValue: number | null = metricValue ? metricValue.value : null;
        let normalizedScore: number | null = null;
        let band: string | null = null;

        if (rawValue !== null && thresholds.length > 0) {
          for (const t of thresholds) {
            if (rawValue >= t.minValue && rawValue <= t.maxValue) {
              band = t.band;
              break;
            }
          }
          const bandScores: Record<string, number> = {
            excellent: 100,
            good: 75,
            acceptable: 50,
            poor: 25,
          };
          normalizedScore = band ? (bandScores[band] ?? 50) : 0;
        }

        const weightedScore =
          normalizedScore !== null ? normalizedScore * sm.weight : 0;
        totalWeightedScore += weightedScore;
        totalWeight += sm.weight;

        const detail = await storage.createScoreRunDetail({
          scoreRunId: run.id,
          metricDefinitionId: sm.metricDefinitionId,
          rawValue,
          normalizedScore,
          weightedScore,
          band,
        });
        details.push(detail);
      }

      const totalScore = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;
      let overallBand = "poor";
      if (totalScore >= 90) overallBand = "excellent";
      else if (totalScore >= 70) overallBand = "good";
      else if (totalScore >= 50) overallBand = "acceptable";

      await storage.updateScoreRun(run.id, { totalScore, band: overallBand });

      const finalRun = { ...run, totalScore, band: overallBand, details };
      res.status(201).json(ok(finalRun));
    } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
      res.status(500).json(err("INTERNAL_ERROR", error.message));
    }
  });

  app.get("/api/tenants/:tenantId/scorecards/:scorecardId/runs", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
      const scorecardId = parseIntOrThrow(req.params.scorecardId, "scorecardId");
      const hasAccess = await requireTenantAccess(req, res, tenantId);
      if (!hasAccess) return;
      const scorecard = await storage.getScorecardTemplate(scorecardId);
      if (!scorecard || scorecard.tenantId !== tenantId) {
        return res.status(404).json(err("NOT_FOUND", "Scorecard not found"));
      }
      const runs = await storage.getScoreRuns(scorecardId);
      res.json(ok(runs));
    } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
      res.status(500).json(err("INTERNAL_ERROR", error.message));
    }
  });

  app.get("/api/tenants/:tenantId/scorecards/:scorecardId/runs/:runId", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
      const scorecardId = parseIntOrThrow(req.params.scorecardId, "scorecardId");
      const hasAccess = await requireTenantAccess(req, res, tenantId);
      if (!hasAccess) return;
      const scorecard = await storage.getScorecardTemplate(scorecardId);
      if (!scorecard || scorecard.tenantId !== tenantId) {
        return res.status(404).json(err("NOT_FOUND", "Scorecard not found"));
      }
      const runId = parseIntOrThrow(req.params.runId, "runId");
      const run = await storage.getScoreRun(runId);
      if (!run || run.scorecardTemplateId !== scorecardId) {
        return res.status(404).json(err("NOT_FOUND", "Score run not found"));
      }
      const details = await storage.getScoreRunDetails(runId);
      res.json(ok({ ...run, details }));
    } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
      res.status(500).json(err("INTERNAL_ERROR", error.message));
    }
  });

  app.post("/api/tenants/:tenantId/metric-values", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
      const hasAccess = await requireTenantAccess(req, res, tenantId, ["owner", "admin", "manager"]);
      if (!hasAccess) return;
      const parsed = insertMetricValueSchema.safeParse(req.body);
      if (!parsed.success) return zodError(res, parsed.error);
      const metric = await storage.getMetricDefinition(parsed.data.metricDefinitionId);
      if (!metric || metric.tenantId !== tenantId) {
        return res.status(404).json(err("NOT_FOUND", "Metric not found in this tenant"));
      }
      const location = await storage.getLocation(parsed.data.locationId);
      if (!location || location.tenantId !== tenantId) {
        return res.status(404).json(err("NOT_FOUND", "Location not found in this tenant"));
      }
      const value = await storage.createMetricValue(parsed.data);
      res.status(201).json(ok(value));
    } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
      res.status(500).json(err("INTERNAL_ERROR", error.message));
    }
  });

  app.get("/api/tenants/:tenantId/metric-values", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
      const hasAccess = await requireTenantAccess(req, res, tenantId);
      if (!hasAccess) return;

      const querySchema = z.object({
        locationId: z.string().transform(Number),
        periodStart: z.string().optional(),
        periodEnd: z.string().optional(),
      });
      const parsed = querySchema.safeParse(req.query);
      if (!parsed.success) return zodError(res, parsed.error);

      const { locationId, periodStart, periodEnd } = parsed.data;

      const location = await storage.getLocation(locationId);
      if (!location || location.tenantId !== tenantId) {
        return res.status(404).json(err("NOT_FOUND", "Location not found in this tenant"));
      }

      const metrics = await storage.getMetricDefinitions(tenantId);
      const allValues: any[] = [];

      for (const metric of metrics) {
        if (periodStart && periodEnd) {
          const value = await storage.getMetricValueForPeriod(
            metric.id, locationId, new Date(periodStart), new Date(periodEnd)
          );
          if (value) allValues.push(value);
        } else {
          const values = await storage.getMetricValues(metric.id, locationId);
          allValues.push(...values);
        }
      }

      res.json(ok(allValues));
    } catch (error: any) {
      res.status(500).json(err("INTERNAL_ERROR", error.message));
    }
  });

  app.put("/api/tenants/:tenantId/metric-values/bulk", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
      const hasAccess = await requireTenantAccess(req, res, tenantId, ["owner", "admin", "manager"]);
      if (!hasAccess) return;

      const bodySchema = z.object({
        locationId: z.number(),
        period: z.string(),
        periodStart: z.string(),
        periodEnd: z.string(),
        entries: z.array(z.object({
          metricDefinitionId: z.number(),
          value: z.number(),
        })),
      });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) return zodError(res, parsed.error);

      const { locationId, period, periodStart, periodEnd, entries } = parsed.data;

      const location = await storage.getLocation(locationId);
      if (!location || location.tenantId !== tenantId) {
        return res.status(404).json(err("NOT_FOUND", "Location not found in this tenant"));
      }

      const results = [];
      for (const entry of entries) {
        const metric = await storage.getMetricDefinition(entry.metricDefinitionId);
        if (!metric || metric.tenantId !== tenantId) continue;

        const existing = await storage.getMetricValueForPeriod(
          entry.metricDefinitionId, locationId,
          new Date(periodStart), new Date(periodEnd)
        );

        if (existing) {
          const updated = await storage.updateMetricValue(existing.id, { value: entry.value });
          results.push(updated);
        } else {
          const created = await storage.createMetricValue({
            metricDefinitionId: entry.metricDefinitionId,
            locationId,
            period,
            periodStart: new Date(periodStart),
            periodEnd: new Date(periodEnd),
            value: entry.value,
          });
          results.push(created);
        }
      }

      res.json(ok(results));
    } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
      res.status(500).json(err("INTERNAL_ERROR", error.message));
    }
  });

  app.get("/api/tenants/:tenantId/trends", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
      const hasAccess = await requireTenantAccess(req, res, tenantId);
      if (!hasAccess) return;

      const querySchema = z.object({
        metricId: z.string().transform(Number),
        locationId: z.string().transform(Number),
        period: z.enum(["month", "quarter", "bi-year", "year"]),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      });
      const parsed = querySchema.safeParse(req.query);
      if (!parsed.success) return zodError(res, parsed.error);

      const { metricId, locationId, period } = parsed.data;

      const metric = await storage.getMetricDefinition(metricId);
      if (!metric || metric.tenantId !== tenantId) {
        return res.status(404).json(err("NOT_FOUND", "Metric not found"));
      }
      const location = await storage.getLocation(locationId);
      if (!location || location.tenantId !== tenantId) {
        return res.status(404).json(err("NOT_FOUND", "Location not found"));
      }

      const now = new Date();
      let startDate = parsed.data.startDate ? new Date(parsed.data.startDate) : new Date(now.getFullYear() - 2, 0, 1);
      let endDate = parsed.data.endDate ? new Date(parsed.data.endDate) : now;

      const values = await storage.getMetricTrends(metricId, locationId, period, startDate, endDate);

      const periods = generatePeriods(period, startDate, endDate);
      const trendData = periods.map((p) => {
        const match = values.find(
          (v) =>
            v.periodStart.getTime() === p.start.getTime() &&
            v.periodEnd.getTime() === p.end.getTime()
        );
        return {
          label: p.label,
          periodStart: p.start.toISOString(),
          periodEnd: p.end.toISOString(),
          value: match ? match.value : null,
        };
      });

      const thresholds = await storage.getMetricThresholds(metricId);
      res.json(ok({ metric, location, period, thresholds, data: trendData }));
    } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
      res.status(500).json(err("INTERNAL_ERROR", error.message));
    }
  });

  app.get("/api/tenants/:tenantId/portfolio/overview", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
      const access = await requireTenantAccess(req, res, tenantId);
      if (!access) return;

      const locations = await storage.getLocations(tenantId);
      const metrics = await storage.getMetricDefinitions(tenantId);
      const activeMetrics = metrics.filter(m => m.isActive);
      const alertEvents = await storage.getAlertEvents(tenantId, { status: "open" });

      let totalScore = 0;
      let locationCount = 0;
      let improvingCount = 0;
      let decliningCount = 0;
      const locationScores: any[] = [];

      for (const loc of locations) {
        let locScore = 0;
        let locMetricCount = 0;
        let improving = 0;
        let declining = 0;

        for (const metric of activeMetrics) {
          const values = await storage.getMetricValues(metric.id, loc.id);
          if (values.length === 0) continue;
          const thresholds = await storage.getMetricThresholds(metric.id);
          const latest = values[values.length - 1];
          const previous = values.length > 1 ? values[values.length - 2] : null;

          let metricScore = 50;
          if (thresholds.length > 0) {
            const maxThreshold = thresholds.reduce((a, b) => (a.greenMin || 0) > (b.greenMin || 0) ? a : b);
            if (maxThreshold.greenMin != null && latest.value >= maxThreshold.greenMin) {
              metricScore = 100;
            } else if (maxThreshold.yellowMin != null && latest.value >= maxThreshold.yellowMin) {
              metricScore = 70;
            } else {
              metricScore = 30;
            }
          }

          if (previous) {
            if (latest.value > previous.value) improving++;
            else if (latest.value < previous.value) declining++;
          }

          locScore += metricScore;
          locMetricCount++;
        }

        const avgScore = locMetricCount > 0 ? Math.round(locScore / locMetricCount) : 0;
        locationScores.push({ locationId: loc.id, locationName: loc.name, score: avgScore, improving, declining });
        totalScore += avgScore;
        locationCount++;
        if (improving > declining) improvingCount++;
        else if (declining > improving) decliningCount++;
      }

      const portfolioScore = locationCount > 0 ? Math.round(totalScore / locationCount) : 0;
      const highCriticalAlerts = alertEvents.filter(e => ["high", "critical"].includes(e.severity)).length;

      res.json(ok({
          portfolioScore,
          locationCount,
          improvingCount,
          decliningCount,
          openAlerts: alertEvents.length,
          highCriticalAlerts,
          locationScores,
      }));
    } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
      res.status(500).json(err("INTERNAL_ERROR", error.message));
    }
  });

  app.get("/api/tenants/:tenantId/portfolio/rankings", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
      const access = await requireTenantAccess(req, res, tenantId);
      if (!access) return;

      const locations = await storage.getLocations(tenantId);
      const metrics = await storage.getMetricDefinitions(tenantId);
      const activeMetrics = metrics.filter(m => m.isActive);

      const rankings: any[] = [];
      for (const loc of locations) {
        let currentTotal = 0;
        let previousTotal = 0;
        let metricCount = 0;

        for (const metric of activeMetrics) {
          const values = await storage.getMetricValues(metric.id, loc.id);
          if (values.length === 0) continue;
          const latest = values[values.length - 1];
          const previous = values.length > 1 ? values[values.length - 2] : null;
          currentTotal += latest.value;
          if (previous) previousTotal += previous.value;
          metricCount++;
        }

        const currentAvg = metricCount > 0 ? currentTotal / metricCount : 0;
        const previousAvg = metricCount > 0 ? previousTotal / metricCount : 0;
        const delta = currentAvg - previousAvg;
        const deltaPct = previousAvg !== 0 ? (delta / Math.abs(previousAvg)) * 100 : 0;

        rankings.push({
          locationId: loc.id,
          locationName: loc.name,
          currentAvg: Math.round(currentAvg * 100) / 100,
          previousAvg: Math.round(previousAvg * 100) / 100,
          delta: Math.round(delta * 100) / 100,
          deltaPct: Math.round(deltaPct * 10) / 10,
        });
      }

      rankings.sort((a, b) => b.delta - a.delta);
      const top = rankings.slice(0, 5);
      const bottom = [...rankings].sort((a, b) => a.delta - b.delta).slice(0, 5);

      res.json(ok({ rankings, top, bottom }));
    } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
      res.status(500).json(err("INTERNAL_ERROR", error.message));
    }
  });

  app.get("/api/tenants/:tenantId/portfolio/risk", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
      const access = await requireTenantAccess(req, res, tenantId);
      if (!access) return;

      const locations = await storage.getLocations(tenantId);
      const metrics = await storage.getMetricDefinitions(tenantId);
      const activeMetrics = metrics.filter(m => m.isActive);
      const alertEvents = await storage.getAlertEvents(tenantId, { status: "open" });

      const riskLocations: any[] = [];
      for (const loc of locations) {
        const risks: any[] = [];
        const locAlerts = alertEvents.filter(e => e.locationId === loc.id);

        for (const metric of activeMetrics) {
          const values = await storage.getMetricValues(metric.id, loc.id);
          if (values.length === 0) continue;
          const thresholds = await storage.getMetricThresholds(metric.id);
          const latest = values[values.length - 1];

          for (const t of thresholds) {
            if (t.redMax != null && latest.value <= t.redMax) {
              risks.push({ type: "threshold_miss", metricName: metric.name, value: latest.value, threshold: t.redMax });
            }
          }

          if (values.length >= 3) {
            const recent = values.slice(-3);
            const isDecline = recent.every((v, i) => i === 0 || v.value < recent[i - 1].value);
            if (isDecline) {
              risks.push({ type: "trend_decline", metricName: metric.name, periods: 3 });
            }
          }
        }

        if (risks.length > 0 || locAlerts.length > 0) {
          riskLocations.push({
            locationId: loc.id,
            locationName: loc.name,
            riskCount: risks.length,
            openAlerts: locAlerts.length,
            risks,
          });
        }
      }

      riskLocations.sort((a, b) => (b.riskCount + b.openAlerts) - (a.riskCount + a.openAlerts));
      res.json(ok({ riskLocations }));
    } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
      res.status(500).json(err("INTERNAL_ERROR", error.message));
    }
  });

  app.get("/api/tenants/:tenantId/metrics/:metricId/forecast", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
      const metricId = parseIntOrThrow(req.params.metricId, "metricId");
      const locationId = parseIntOrThrow(req.query.locationId as string, "locationId");
      const periods = parseInt(req.query.periods as string) || 3;

      const access = await requireTenantAccess(req, res, tenantId);
      if (!access) return;

      if (!locationId) return res.status(400).json(err("VALIDATION_ERROR", "locationId is required"));

      const existing = await storage.getMetricForecasts(metricId, locationId);
      if (existing.length > 0) {
        return res.json(ok(existing));
      }

      const forecasts = await generateForecast(metricId, locationId, periods);
      res.json(ok(forecasts));
    } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
      res.status(500).json(err("INTERNAL_ERROR", error.message));
    }
  });

  app.post("/api/tenants/:tenantId/metrics/:metricId/forecast", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
      const metricId = parseIntOrThrow(req.params.metricId, "metricId");

      const forecastBodySchema = z.object({
        locationId: z.coerce.number({ required_error: "locationId is required" }),
        periods: z.coerce.number().int().min(1).max(24).optional(),
      });
      const parsed = forecastBodySchema.safeParse(req.body);
      if (!parsed.success) return zodError(res, parsed.error);

      const access = await requireTenantAccess(req, res, tenantId, ["owner", "admin"]);
      if (!access) return;

      const forecasts = await generateForecast(metricId, parsed.data.locationId, parsed.data.periods || 3);
      res.json(ok(forecasts));
    } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
      res.status(500).json(err("INTERNAL_ERROR", error.message));
    }
  });

  app.get("/api/tenants/:tenantId/metrics/:metricId/anomalies", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
      const metricId = parseIntOrThrow(req.params.metricId, "metricId");
      const locationId = parseIntOrThrow(req.query.locationId as string, "locationId");

      const access = await requireTenantAccess(req, res, tenantId);
      if (!access) return;

      if (!locationId) return res.status(400).json(err("VALIDATION_ERROR", "locationId is required"));

      const existing = await storage.getMetricAnomalies(metricId, locationId);
      if (existing.length > 0) {
        return res.json(ok(existing));
      }

      const anomalies = await detectAnomalies(metricId, locationId);
      res.json(ok(anomalies));
    } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
      res.status(500).json(err("INTERNAL_ERROR", error.message));
    }
  });

  app.post("/api/tenants/:tenantId/metrics/:metricId/anomalies/detect", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseIntOrThrow(req.params.tenantId, "tenantId");
      const metricId = parseIntOrThrow(req.params.metricId, "metricId");

      const anomalyBodySchema = z.object({
        locationId: z.coerce.number({ required_error: "locationId is required" }),
      });
      const parsed = anomalyBodySchema.safeParse(req.body);
      if (!parsed.success) return zodError(res, parsed.error);

      const access = await requireTenantAccess(req, res, tenantId, ["owner", "admin"]);
      if (!access) return;

      const anomalies = await detectAnomalies(metricId, parsed.data.locationId);
      res.json(ok(anomalies));
    } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
      res.status(500).json(err("INTERNAL_ERROR", error.message));
    }
  });

  // ── User Preferences ──

  app.get("/api/user/preferences", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const prefs = await storage.getUserPreferences(userId);
      res.json(ok(prefs));
    } catch (error: any) {
      res.status(500).json(err("INTERNAL_ERROR", error.message));
    }
  });

  app.put("/api/user/preferences", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const prefsSchema = z.object({
        pinnedPages: z.array(z.string()).optional(),
        keyboardShortcutsEnabled: z.boolean().optional(),
      });
      const parsed = prefsSchema.safeParse(req.body);
      if (!parsed.success) return zodError(res, parsed.error);
      const prefs = await storage.updateUserPreferences(userId, parsed.data);
      res.json(ok(prefs));
    } catch (error: any) {
      res.status(500).json(err("INTERNAL_ERROR", error.message));
    }
  });

  // ── User Notifications ──

  app.get("/api/notifications", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const tenantId = parseIntOrThrow(req.query.tenantId as string, "tenantId");
      const hasAccess = await requireTenantAccess(req, res, tenantId);
      if (!hasAccess) return;
      const notifications = await storage.getUserNotifications(userId, tenantId);
      const unreadCount = await storage.getUnreadNotificationCount(userId, tenantId);
      res.json(ok({ notifications, unreadCount }));
    } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
      res.status(500).json(err("INTERNAL_ERROR", error.message));
    }
  });

  app.post("/api/notifications/:id/read", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseIntOrThrow(req.params.id, "id");
      await storage.markNotificationRead(id, userId);
      res.json(ok({ success: true }));
    } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
      res.status(500).json(err("INTERNAL_ERROR", error.message));
    }
  });

  app.post("/api/notifications/read-all", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const tenantId = parseIntOrThrow(String(req.body.tenantId), "tenantId");
      const hasAccess = await requireTenantAccess(req, res, tenantId);
      if (!hasAccess) return;
      await storage.markAllNotificationsRead(userId, tenantId);
      res.json(ok({ success: true }));
    } catch (error: any) {
      if (error instanceof ValidationError) return res.status(400).json(err("VALIDATION_ERROR", error.message));
      res.status(500).json(err("INTERNAL_ERROR", error.message));
    }
  });

  app.use("/api/admin", adminRouter);
  app.use("/api/admin", securityRouter);
  app.use("/api/v1", securityV1Router);
  app.use("/api/v1/admin", jobRouter);
  app.use("/api", intelligenceRouter);
  app.use("/api", phase5Router);
  app.use("/api/v1", confidenceRouter);
  app.use("/api/v1", recommendationRouter);
  app.use("/api/v1", inboxRouter);
  app.use("/api/v1", dailyBriefRouter);
  app.use("/api/v1", onboardingRouter);

  seed().catch(console.error);
  startScheduler();
  startJobProcessor();

  return httpServer;
}

function generatePeriods(
  period: string,
  startDate: Date,
  endDate: Date
): { label: string; start: Date; end: Date }[] {
  const periods: { label: string; start: Date; end: Date }[] = [];
  const current = new Date(startDate);

  while (current <= endDate) {
    let start: Date;
    let end: Date;
    let label: string;

    switch (period) {
      case "month": {
        start = new Date(current.getFullYear(), current.getMonth(), 1);
        end = new Date(current.getFullYear(), current.getMonth() + 1, 0, 23, 59, 59);
        label = start.toLocaleDateString("en-US", { month: "short", year: "numeric" });
        current.setMonth(current.getMonth() + 1);
        break;
      }
      case "quarter": {
        const q = Math.floor(current.getMonth() / 3);
        start = new Date(current.getFullYear(), q * 3, 1);
        end = new Date(current.getFullYear(), q * 3 + 3, 0, 23, 59, 59);
        label = `Q${q + 1} ${current.getFullYear()}`;
        current.setMonth(current.getMonth() + 3);
        break;
      }
      case "bi-year": {
        const h = current.getMonth() < 6 ? 0 : 1;
        start = new Date(current.getFullYear(), h * 6, 1);
        end = new Date(current.getFullYear(), h * 6 + 6, 0, 23, 59, 59);
        label = `H${h + 1} ${current.getFullYear()}`;
        current.setMonth(current.getMonth() + 6);
        break;
      }
      case "year": {
        start = new Date(current.getFullYear(), 0, 1);
        end = new Date(current.getFullYear(), 11, 31, 23, 59, 59);
        label = `${current.getFullYear()}`;
        current.setFullYear(current.getFullYear() + 1);
        break;
      }
      default:
        return periods;
    }

    if (start <= endDate) {
      periods.push({ label, start, end });
    }
  }

  return periods;
}
