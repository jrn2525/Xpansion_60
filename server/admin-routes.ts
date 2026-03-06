import { Router } from "express";
import multer from "multer";
import { storage } from "./storage";
import { isAuthenticated } from "./replit_integrations/auth";
import {
  insertAlertRuleSchema,
  insertReportSchema,
} from "@shared/schema";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function ok(data: any) {
  return { ok: true, data };
}

function err(code: string, message: string, details?: any) {
  return { ok: false, error: { code, message, ...(details ? { details } : {}) } };
}

async function requireAdminAccess(req: any, res: any, tenantId: number) {
  const userId = req.user?.claims?.sub;
  if (!userId) { res.status(401).json(err("UNAUTHORIZED", "Unauthorized")); return null; }
  const tu = await storage.getTenantUserByUserId(tenantId, userId);
  if (!tu) { res.status(403).json(err("FORBIDDEN", "No access to this tenant")); return null; }
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
    beforeJson: before ? JSON.stringify(before) : null,
    afterJson: after ? JSON.stringify(after) : null,
  });
}

export const adminRouter = Router();
adminRouter.use(isAuthenticated);

adminRouter.post("/imports", upload.single("file"), async (req: any, res) => {
  try {
    const tenantId = parseInt(req.body.tenantId);
    const locationId = parseInt(req.body.locationId);
    if (!tenantId || !locationId) return res.status(400).json(err("VALIDATION_ERROR", "tenantId and locationId are required"));
    const access = await requireAdminAccess(req, res, tenantId);
    if (!access) return;
    if (!req.file) return res.status(400).json(err("VALIDATION_ERROR", "CSV file is required"));

    const locations = await storage.getLocations(tenantId);
    const locationBelongs = locations.some(l => l.id === locationId);
    if (!locationBelongs) return res.status(400).json(err("VALIDATION_ERROR", "Location does not belong to this tenant"));

    const mappingConfig = req.body.mappingConfig || "{}";
    let mapping: Record<string, string>;
    try { mapping = JSON.parse(mappingConfig); } catch { return res.status(400).json(err("VALIDATION_ERROR", "Invalid mappingConfig JSON")); }

    const job = await storage.createImportJob({
      tenantId,
      locationId,
      fileName: req.file.originalname,
      mappingConfig: JSON.stringify(mapping),
    });

    const csvText = req.file.buffer.toString("utf-8");
    const result = await processCSV(csvText, mapping, tenantId, locationId, job.id);

    const finalStatus = result.failedRows === 0 ? "completed" : result.successRows === 0 ? "failed" : "partial";
    const updated = await storage.updateImportJob(job.id, {
      status: finalStatus,
      totalRows: result.totalRows,
      successRows: result.successRows,
      failedRows: result.failedRows,
    });

    await audit(tenantId, req.user.claims.sub, "import_job", String(job.id), "create", null, updated);
    res.status(201).json(ok(updated));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

adminRouter.get("/imports", async (req: any, res) => {
  try {
    const tenantId = parseInt(req.query.tenantId as string);
    if (!tenantId) return res.status(400).json(err("VALIDATION_ERROR", "tenantId is required"));
    const access = await requireAdminAccess(req, res, tenantId);
    if (!access) return;
    const jobs = await storage.getImportJobs(tenantId);
    res.json(ok(jobs));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

adminRouter.get("/imports/:jobId", async (req: any, res) => {
  try {
    const job = await storage.getImportJob(parseInt(req.params.jobId));
    if (!job) return res.status(404).json(err("NOT_FOUND", "Import job not found"));
    const access = await requireAdminAccess(req, res, job.tenantId);
    if (!access) return;
    res.json(ok(job));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

adminRouter.get("/imports/:jobId/errors", async (req: any, res) => {
  try {
    const job = await storage.getImportJob(parseInt(req.params.jobId));
    if (!job) return res.status(404).json(err("NOT_FOUND", "Import job not found"));
    const access = await requireAdminAccess(req, res, job.tenantId);
    if (!access) return;
    const errors = await storage.getImportRowErrors(job.id);
    res.json(ok(errors));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

adminRouter.post("/imports/:jobId/reprocess", async (req: any, res) => {
  try {
    const job = await storage.getImportJob(parseInt(req.params.jobId));
    if (!job) return res.status(404).json(err("NOT_FOUND", "Import job not found"));
    const access = await requireAdminAccess(req, res, job.tenantId);
    if (!access) return;
    if (job.status !== "partial" && job.status !== "failed") {
      return res.status(400).json(err("INVALID_STATE", "Only partial or failed jobs can be reprocessed"));
    }

    const errors = await storage.getImportRowErrors(job.id);
    let reSuccess = 0;
    let reFailed = 0;
    const mapping: Record<string, string> = JSON.parse(job.mappingConfig);

    for (const rowErr of errors) {
      try {
        const rawData = JSON.parse(rowErr.rawData);
        await processRow(rawData, mapping, job.tenantId, job.locationId, rowErr.rowNumber, job.id, true);
        reSuccess++;
      } catch {
        reFailed++;
      }
    }

    const updated = await storage.updateImportJob(job.id, {
      status: reFailed === 0 ? "completed" : "partial",
      successRows: job.successRows + reSuccess,
      failedRows: reFailed,
    });

    await audit(job.tenantId, req.user.claims.sub, "import_job", String(job.id), "reprocess", job, updated);
    res.json(ok(updated));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

async function processCSV(csvText: string, mapping: Record<string, string>, tenantId: number, locationId: number, jobId: number) {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { totalRows: 0, successRows: 0, failedRows: 0 };

  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  let successRows = 0;
  let failedRows = 0;

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const rowData: Record<string, string> = {};
    headers.forEach((h, idx) => { rowData[h] = values[idx] || ""; });

    try {
      await processRow(rowData, mapping, tenantId, locationId, i, jobId, false);
      successRows++;
    } catch (e: any) {
      failedRows++;
      await storage.createImportRowError({
        importJobId: jobId,
        rowNumber: i,
        rawData: JSON.stringify(rowData),
        errorMessage: e.message,
      });
    }
  }

  return { totalRows: lines.length - 1, successRows, failedRows };
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === "," && !inQuotes) { result.push(current.trim()); current = ""; }
    else { current += ch; }
  }
  result.push(current.trim());
  return result;
}

async function processRow(rowData: Record<string, string>, mapping: Record<string, string>, tenantId: number, locationId: number, rowNumber: number, jobId: number, isReprocess: boolean) {
  const metricKey = mapping.metricKey || "metric";
  const valueKey = mapping.valueKey || "value";
  const periodKey = mapping.periodKey || "period";
  const periodStartKey = mapping.periodStartKey || "period_start";
  const periodEndKey = mapping.periodEndKey || "period_end";

  const metricName = rowData[metricKey];
  const rawValue = rowData[valueKey];
  const period = rowData[periodKey] || "month";
  const periodStartStr = rowData[periodStartKey];
  const periodEndStr = rowData[periodEndKey];

  if (!metricName) throw new Error(`Row ${rowNumber}: missing metric name in column "${metricKey}"`);
  if (!rawValue || isNaN(parseFloat(rawValue))) throw new Error(`Row ${rowNumber}: non-numeric value "${rawValue}"`);
  if (!periodStartStr || !periodEndStr) throw new Error(`Row ${rowNumber}: missing period start/end dates`);

  const periodStart = new Date(periodStartStr);
  const periodEnd = new Date(periodEndStr);
  if (isNaN(periodStart.getTime()) || isNaN(periodEnd.getTime())) {
    throw new Error(`Row ${rowNumber}: invalid date format`);
  }

  const metrics = await storage.getMetricDefinitions(tenantId);
  const metric = metrics.find((m) => m.name.toLowerCase() === metricName.toLowerCase());
  if (!metric) throw new Error(`Row ${rowNumber}: metric "${metricName}" not found for tenant`);

  await storage.createMetricValue({
    metricDefinitionId: metric.id,
    locationId,
    period,
    periodStart,
    periodEnd,
    value: parseFloat(rawValue),
  });
}

adminRouter.get("/alert-rules", async (req: any, res) => {
  try {
    const tenantId = parseInt(req.query.tenantId as string);
    if (!tenantId) return res.status(400).json(err("VALIDATION_ERROR", "tenantId is required"));
    const access = await requireAdminAccess(req, res, tenantId);
    if (!access) return;
    const rules = await storage.getAlertRules(tenantId);
    res.json(ok(rules));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

adminRouter.post("/alert-rules", async (req: any, res) => {
  try {
    const parsed = insertAlertRuleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(err("VALIDATION_ERROR", fromZodError(parsed.error).toString()));
    const access = await requireAdminAccess(req, res, parsed.data.tenantId);
    if (!access) return;
    const rule = await storage.createAlertRule(parsed.data);
    await audit(parsed.data.tenantId, req.user.claims.sub, "alert_rule", String(rule.id), "create", null, rule);
    await evaluateAlertRule(rule);
    res.status(201).json(ok(rule));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

adminRouter.put("/alert-rules/:ruleId", async (req: any, res) => {
  try {
    const ruleId = parseInt(req.params.ruleId);
    const existing = await storage.getAlertRule(ruleId);
    if (!existing) return res.status(404).json(err("NOT_FOUND", "Alert rule not found"));
    const access = await requireAdminAccess(req, res, existing.tenantId);
    if (!access) return;
    const { tenantId, ...updateData } = req.body;
    const updated = await storage.updateAlertRule(ruleId, updateData);
    await audit(existing.tenantId, req.user.claims.sub, "alert_rule", String(ruleId), "update", existing, updated);
    if (updated?.isActive) await evaluateAlertRule(updated);
    res.json(ok(updated));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

adminRouter.get("/alert-events", async (req: any, res) => {
  try {
    const tenantId = parseInt(req.query.tenantId as string);
    if (!tenantId) return res.status(400).json(err("VALIDATION_ERROR", "tenantId is required"));
    const access = await requireAdminAccess(req, res, tenantId);
    if (!access) return;
    const filters: any = {};
    if (req.query.status) filters.status = req.query.status;
    if (req.query.severity) filters.severity = req.query.severity;
    if (req.query.locationId) filters.locationId = parseInt(req.query.locationId);
    const events = await storage.getAlertEvents(tenantId, filters);
    res.json(ok(events));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

adminRouter.post("/alert-events/:eventId/ack", async (req: any, res) => {
  try {
    const eventId = parseInt(req.params.eventId);
    const event = await storage.getAlertEvent(eventId);
    if (!event) return res.status(404).json(err("NOT_FOUND", "Alert event not found"));
    const access = await requireAdminAccess(req, res, event.tenantId);
    if (!access) return;
    if (event.status !== "open") return res.status(400).json(err("INVALID_STATE", "Only open events can be acknowledged"));
    const updated = await storage.updateAlertEvent(eventId, {
      status: "ack",
      acknowledgedBy: req.user.claims.sub,
      acknowledgedAt: new Date(),
    });
    res.json(ok(updated));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

adminRouter.post("/alert-events/:eventId/resolve", async (req: any, res) => {
  try {
    const eventId = parseInt(req.params.eventId);
    const event = await storage.getAlertEvent(eventId);
    if (!event) return res.status(404).json(err("NOT_FOUND", "Alert event not found"));
    const access = await requireAdminAccess(req, res, event.tenantId);
    if (!access) return;
    if (event.status === "resolved") return res.status(400).json(err("INVALID_STATE", "Event already resolved"));
    const updated = await storage.updateAlertEvent(eventId, {
      status: "resolved",
      resolvedBy: req.user.claims.sub,
      resolvedAt: new Date(),
    });
    res.json(ok(updated));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

async function evaluateAlertRule(rule: any) {
  try {
    const condition = JSON.parse(rule.conditionJson);
    const action = JSON.parse(rule.actionJson);

    if (condition.type === "threshold_breach") {
      const locations = await storage.getLocations(rule.tenantId);
      for (const loc of locations) {
        const values = await storage.getMetricValues(condition.metricDefinitionId, loc.id);
        if (values.length === 0) continue;
        const latest = values[values.length - 1];
        let breached = false;
        if (condition.operator === "above" && latest.value > condition.threshold) breached = true;
        if (condition.operator === "below" && latest.value < condition.threshold) breached = true;
        if (breached) {
          await storage.createAlertEvent({
            alertRuleId: rule.id,
            tenantId: rule.tenantId,
            locationId: loc.id,
            metricDefinitionId: condition.metricDefinitionId,
            status: "open",
            severity: rule.severity,
            message: `${rule.name}: Value ${latest.value} ${condition.operator} threshold ${condition.threshold} at ${loc.name}`,
            detailJson: JSON.stringify({ value: latest.value, threshold: condition.threshold, operator: condition.operator }),
          });
          if (action.type === "email") {
            console.log(`[EMAIL STUB] Alert "${rule.name}" triggered for ${loc.name}: ${latest.value} ${condition.operator} ${condition.threshold}`);
          }
        }
      }
    }

    if (condition.type === "trend_deterioration") {
      const locations = await storage.getLocations(rule.tenantId);
      for (const loc of locations) {
        const values = await storage.getMetricValues(condition.metricDefinitionId, loc.id);
        if (values.length < 2) continue;
        const current = values[values.length - 1];
        const previous = values[values.length - 2];
        if (previous.value === 0) continue;
        const dropPct = ((previous.value - current.value) / Math.abs(previous.value)) * 100;
        if (dropPct >= (condition.dropPercent || 10)) {
          await storage.createAlertEvent({
            alertRuleId: rule.id,
            tenantId: rule.tenantId,
            locationId: loc.id,
            metricDefinitionId: condition.metricDefinitionId,
            status: "open",
            severity: rule.severity,
            message: `${rule.name}: Value dropped ${dropPct.toFixed(1)}% at ${loc.name} (${previous.value} → ${current.value})`,
            detailJson: JSON.stringify({ currentValue: current.value, previousValue: previous.value, dropPercent: dropPct }),
          });
          if (action.type === "email") {
            console.log(`[EMAIL STUB] Trend alert "${rule.name}" triggered for ${loc.name}: ${dropPct.toFixed(1)}% drop`);
          }
        }
      }
    }
  } catch (e) {
    console.error("Error evaluating alert rule:", e);
  }
}

adminRouter.get("/reports", async (req: any, res) => {
  try {
    const tenantId = parseInt(req.query.tenantId as string);
    if (!tenantId) return res.status(400).json(err("VALIDATION_ERROR", "tenantId is required"));
    const access = await requireAdminAccess(req, res, tenantId);
    if (!access) return;
    const reportsList = await storage.getReports(tenantId);
    res.json(ok(reportsList));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

adminRouter.post("/reports", async (req: any, res) => {
  try {
    const parsed = insertReportSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(err("VALIDATION_ERROR", fromZodError(parsed.error).toString()));
    const access = await requireAdminAccess(req, res, parsed.data.tenantId);
    if (!access) return;
    const report = await storage.createReport(parsed.data);
    await audit(parsed.data.tenantId, req.user.claims.sub, "report", String(report.id), "create", null, report);
    res.status(201).json(ok(report));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

adminRouter.put("/reports/:reportId", async (req: any, res) => {
  try {
    const reportId = parseInt(req.params.reportId);
    const existing = await storage.getReport(reportId);
    if (!existing) return res.status(404).json(err("NOT_FOUND", "Report not found"));
    const access = await requireAdminAccess(req, res, existing.tenantId);
    if (!access) return;
    const { tenantId, ...updateData } = req.body;
    const updated = await storage.updateReport(reportId, updateData);
    await audit(existing.tenantId, req.user.claims.sub, "report", String(reportId), "update", existing, updated);
    res.json(ok(updated));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

adminRouter.post("/reports/:reportId/run", async (req: any, res) => {
  try {
    const reportId = parseInt(req.params.reportId);
    const report = await storage.getReport(reportId);
    if (!report) return res.status(404).json(err("NOT_FOUND", "Report not found"));
    const access = await requireAdminAccess(req, res, report.tenantId);
    if (!access) return;

    const run = await storage.createReportRun({
      reportId: report.id,
      tenantId: report.tenantId,
      status: "running",
      startedAt: new Date(),
    });

    try {
      const config = JSON.parse(report.configJson);
      const summary = await generateReportSummary(report, config);
      const updated = await storage.updateReportRun(run.id, {
        status: "completed",
        summaryJson: JSON.stringify(summary),
        completedAt: new Date(),
      });
      res.json(ok(updated));
    } catch (e: any) {
      await storage.updateReportRun(run.id, {
        status: "failed",
        summaryJson: JSON.stringify({ error: e.message }),
        completedAt: new Date(),
      });
      res.status(500).json(err("REPORT_FAILED", e.message));
    }
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

adminRouter.get("/report-runs", async (req: any, res) => {
  try {
    const reportId = parseInt(req.query.reportId as string);
    if (!reportId) return res.status(400).json(err("VALIDATION_ERROR", "reportId is required"));
    const report = await storage.getReport(reportId);
    if (!report) return res.status(404).json(err("NOT_FOUND", "Report not found"));
    const access = await requireAdminAccess(req, res, report.tenantId);
    if (!access) return;
    const runs = await storage.getReportRuns(reportId);
    res.json(ok(runs));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

async function generateReportSummary(report: any, config: any) {
  const locations = await storage.getLocations(report.tenantId);
  const metrics = await storage.getMetricDefinitions(report.tenantId);
  const selectedMetrics = config.metricIds
    ? metrics.filter((m: any) => config.metricIds.includes(m.id))
    : metrics.filter((m: any) => m.isActive);

  const locationSummaries = [];
  for (const loc of locations) {
    const metricSummaries = [];
    for (const metric of selectedMetrics) {
      const values = await storage.getMetricValues(metric.id, loc.id);
      const latest = values.length > 0 ? values[values.length - 1] : null;
      const previous = values.length > 1 ? values[values.length - 2] : null;
      metricSummaries.push({
        metricId: metric.id,
        metricName: metric.name,
        unit: metric.unit,
        currentValue: latest?.value ?? null,
        previousValue: previous?.value ?? null,
        change: latest && previous ? latest.value - previous.value : null,
        changePct: latest && previous && previous.value !== 0
          ? ((latest.value - previous.value) / Math.abs(previous.value) * 100)
          : null,
      });
    }
    locationSummaries.push({
      locationId: loc.id,
      locationName: loc.name,
      metrics: metricSummaries,
    });
  }

  return {
    reportName: report.name,
    reportType: report.reportType,
    generatedAt: new Date().toISOString(),
    tenantId: report.tenantId,
    locations: locationSummaries,
  };
}

adminRouter.get("/audit", async (req: any, res) => {
  try {
    const tenantId = parseInt(req.query.tenantId as string);
    if (!tenantId) return res.status(400).json(err("VALIDATION_ERROR", "tenantId is required"));
    const access = await requireAdminAccess(req, res, tenantId);
    if (!access) return;
    const filters: any = {};
    if (req.query.entityType) filters.entityType = req.query.entityType;
    if (req.query.actorUserId) filters.actorUserId = req.query.actorUserId;
    if (req.query.start) filters.start = new Date(req.query.start as string);
    if (req.query.end) filters.end = new Date(req.query.end as string);
    const logs = await storage.getAuditLogs(tenantId, filters);
    res.json(ok(logs));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});
