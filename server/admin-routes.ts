import { Router } from "express";
import multer from "multer";
import { storage } from "./storage";
import { isAuthenticated } from "./replit_integrations/auth";
import {
  insertAlertRuleSchema,
  insertReportSchema,
  insertNotificationSettingsSchema,
  insertDataQualityRuleSchema,
  insertImportMappingTemplateSchema,
} from "@shared/schema";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { notifyAlertEvent, notifyReportReady, sendEmail, sendSlackWebhook, sendNotification } from "./services/notifications";
import { manualRunNow, getSchedulerStatus } from "./services/scheduler";

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

    const importStartedAt = new Date();
    const csvText = req.file.buffer.toString("utf-8");
    const result = await processCSV(csvText, mapping, tenantId, locationId, job.id);

    const finalStatus = result.failedRows === 0 ? "completed" : result.successRows === 0 ? "failed" : "partial";
    const updated = await storage.updateImportJob(job.id, {
      status: finalStatus,
      totalRows: result.totalRows,
      successRows: result.successRows,
      failedRows: result.failedRows,
    });

    const qualityResult = await runDataQualityChecks(tenantId, locationId, job.id, importStartedAt);
    await audit(tenantId, req.user.claims.sub, "import_job", String(job.id), "create", null, updated);

    const totalRows = result.totalRows || 1;
    const validPct = Math.round((result.successRows / totalRows) * 100);
    const failedPct = Math.round((result.failedRows / totalRows) * 100);
    const warningPct = Math.round((qualityResult.violations / Math.max(totalRows, 1)) * 100);
    const qualityScore = Math.max(0, 100 - failedPct - Math.floor(warningPct / 2));
    const qualityBadge = qualityScore >= 90 ? "excellent" : qualityScore >= 70 ? "good" : qualityScore >= 50 ? "fair" : "poor";

    res.status(201).json(ok({
      ...updated,
      qualityViolations: qualityResult.violations,
      qualitySummary: {
        totalRows: result.totalRows,
        validRows: result.successRows,
        validPct,
        warningRows: qualityResult.violations,
        warningPct,
        failedRows: result.failedRows,
        failedPct,
        qualityScore,
        qualityBadge,
      },
    }));
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

    const enrichedEvents = await Promise.all(events.map(async (event) => {
      const rule = await storage.getAlertRule(event.alertRuleId);
      let detailParsed: any = {};
      try { detailParsed = JSON.parse(event.detailJson); } catch {}
      return {
        ...event,
        impactLevel: detailParsed.impactLevel || null,
        recommendedActions: rule?.recommendedActions || null,
        ownerUserId: rule?.ownerUserId || null,
      };
    }));

    if (req.query.impactLevel) {
      const filtered = enrichedEvents.filter(e => e.impactLevel === req.query.impactLevel);
      return res.json(ok(filtered));
    }

    res.json(ok(enrichedEvents));
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

async function runDataQualityChecks(tenantId: number, locationId: number, importJobId: number, importStartedAt: Date): Promise<{ violations: number }> {
  let violations = 0;
  try {
    const rules = await storage.getDataQualityRules(tenantId);
    const activeRules = rules.filter(r => r.isActive);
    if (activeRules.length === 0) return { violations: 0 };

    const metrics = await storage.getMetricDefinitions(tenantId);
    const activeMetrics = metrics.filter(m => m.isActive);

    for (const rule of activeRules) {
      const config = (() => { try { return JSON.parse(rule.config); } catch { return {}; } })();

      for (const metric of activeMetrics) {
        const allValues = await storage.getMetricValues(metric.id, locationId);
        if (allValues.length === 0) continue;

        const newValues = allValues.filter(v => v.recordedAt && v.recordedAt >= importStartedAt);
        if (newValues.length === 0) continue;

        const existingValues = allValues.filter(v => !v.recordedAt || v.recordedAt < importStartedAt);

        if (rule.ruleType === "duplicate_detection") {
          const existingPeriods = new Set(
            existingValues.map(v => `${v.periodStart?.toISOString()}-${v.periodEnd?.toISOString()}`)
          );
          const newPeriodsSeen = new Set<string>();
          for (const v of newValues) {
            const key = `${v.periodStart?.toISOString()}-${v.periodEnd?.toISOString()}`;
            const isDupOfExisting = existingPeriods.has(key);
            const isDupOfNewBatch = newPeriodsSeen.has(key);
            if (isDupOfExisting || isDupOfNewBatch) {
              violations++;
              await storage.createDataQualityViolation({
                tenantId,
                ruleId: rule.id,
                locationId,
                metricDefinitionId: metric.id,
                importJobId,
                severity: config.policy === "reject" ? "error" : "warning",
                message: `Duplicate period for ${metric.name}: ${v.periodStart?.toISOString().split("T")[0]} to ${v.periodEnd?.toISOString().split("T")[0]}${isDupOfExisting ? " (conflicts with existing data)" : " (duplicate within import)"}`,
                detailJson: JSON.stringify({ value: v.value, periodStart: v.periodStart, periodEnd: v.periodEnd, source: isDupOfExisting ? "existing" : "batch" }),
              });
            }
            newPeriodsSeen.add(key);
          }
        }

        if (rule.ruleType === "outlier_detection") {
          const baselineValues = existingValues.length >= 3 ? existingValues : allValues;
          if (baselineValues.length < 3) continue;
          const nums = baselineValues.map(v => v.value);
          const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
          const stdDev = Math.sqrt(nums.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / nums.length) || 1;
          const threshold = config.stdDevMultiplier || 3;
          for (const v of newValues) {
            const deviation = Math.abs(v.value - mean) / stdDev;
            if (deviation > threshold) {
              violations++;
              await storage.createDataQualityViolation({
                tenantId,
                ruleId: rule.id,
                locationId,
                metricDefinitionId: metric.id,
                importJobId,
                severity: config.policy === "reject" ? "error" : "warning",
                message: `Outlier in imported data for ${metric.name}: value ${v.value} deviates ${deviation.toFixed(1)}σ from baseline mean ${mean.toFixed(2)}`,
                detailJson: JSON.stringify({ value: v.value, mean, stdDev, threshold, deviation: deviation.toFixed(2) }),
              });
            }
          }
        }

        if (rule.ruleType === "period_continuity") {
          const sorted = [...allValues].sort((a, b) => (a.periodStart?.getTime() || 0) - (b.periodStart?.getTime() || 0));
          const newIds = new Set(newValues.map(v => v.id));
          const maxGapDays = config.maxGapDays || 45;
          for (let i = 1; i < sorted.length; i++) {
            if (!newIds.has(sorted[i].id) && !newIds.has(sorted[i - 1].id)) continue;
            const prevEnd = sorted[i - 1].periodEnd?.getTime() || 0;
            const currStart = sorted[i].periodStart?.getTime() || 0;
            const gapDays = Math.round((currStart - prevEnd) / (24 * 60 * 60 * 1000));
            if (gapDays > maxGapDays) {
              violations++;
              await storage.createDataQualityViolation({
                tenantId,
                ruleId: rule.id,
                locationId,
                metricDefinitionId: metric.id,
                importJobId,
                severity: config.policy === "reject" ? "error" : "warning",
                message: `Period gap for ${metric.name}: ${gapDays} days between periods (max allowed: ${maxGapDays})`,
                detailJson: JSON.stringify({ previousEnd: sorted[i - 1].periodEnd, currentStart: sorted[i].periodStart, gapDays, maxGapDays }),
              });
            }
          }
        }
      }
    }
  } catch (e) {
    console.error("[DATA QUALITY] Error running checks:", e);
  }
  return { violations };
}

async function shouldSkipCooldown(rule: any, locationId: number): Promise<boolean> {
  if (!rule.cooldownMinutes || rule.cooldownMinutes <= 0) return false;
  const events = await storage.getAlertEvents(rule.tenantId, {});
  const recent = events.find(e => e.alertRuleId === rule.id && e.locationId === locationId);
  if (!recent) return false;
  return (Date.now() - (recent.createdAt?.getTime() || 0)) / 60000 < rule.cooldownMinutes;
}

async function shouldSkipDedup(rule: any, locationId: number, metricDefinitionId: number): Promise<boolean> {
  if (!rule.dedupWindowMinutes || rule.dedupWindowMinutes <= 0) return false;
  const events = await storage.getAlertEvents(rule.tenantId, { status: "open" });
  const dup = events.find(e => e.alertRuleId === rule.id && e.locationId === locationId && e.metricDefinitionId === metricDefinitionId);
  if (!dup) return false;
  return (Date.now() - (dup.createdAt?.getTime() || 0)) / 60000 < rule.dedupWindowMinutes;
}

function computeImpactLevel(severity: string, metricImportance?: string): string {
  const severityWeight: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
  const importanceWeight: Record<string, number> = { low: 1, medium: 2, high: 3 };
  const sWeight = severityWeight[severity] || 2;
  const iWeight = importanceWeight[metricImportance || "medium"] || 2;
  const score = (sWeight + iWeight) / 2;
  if (score >= 3) return "high";
  if (score >= 2) return "medium";
  return "low";
}

async function checkPersistentIssue(rule: any, condition: any, locationId: number, values: any[]): Promise<{ isPersistent: boolean; consecutiveDays: number }> {
  if (!rule.persistentThresholdDays || rule.persistentThresholdDays <= 0) {
    return { isPersistent: false, consecutiveDays: 0 };
  }

  const thresholdDays = rule.persistentThresholdDays;
  const cutoffDate = new Date(Date.now() - thresholdDays * 24 * 60 * 60 * 1000);

  const recentValues = values.filter((v: any) => {
    const recordedAt = v.recordedAt || v.periodEnd;
    return recordedAt && new Date(recordedAt) >= cutoffDate;
  });

  if (recentValues.length === 0) return { isPersistent: false, consecutiveDays: 0 };

  let allBreached = true;
  for (const v of recentValues) {
    let breached = false;
    if (condition.operator === "above" && v.value > condition.threshold) breached = true;
    if (condition.operator === "below" && v.value < condition.threshold) breached = true;
    if (!breached) { allBreached = false; break; }
  }

  if (allBreached && recentValues.length >= 2) {
    const earliest = recentValues[0].recordedAt || recentValues[0].periodStart;
    const latest = recentValues[recentValues.length - 1].recordedAt || recentValues[recentValues.length - 1].periodEnd;
    const daySpan = Math.ceil((new Date(latest).getTime() - new Date(earliest).getTime()) / (24 * 60 * 60 * 1000));
    return { isPersistent: true, consecutiveDays: Math.max(daySpan, recentValues.length) };
  }

  return { isPersistent: false, consecutiveDays: 0 };
}

function escalateSeverity(severity: string): string {
  const order = ["low", "medium", "high", "critical"];
  const idx = order.indexOf(severity);
  return idx < order.length - 1 ? order[idx + 1] : severity;
}

async function evaluateAlertRule(rule: any) {
  try {
    const condition = JSON.parse(rule.conditionJson);
    const locations = await storage.getLocations(rule.tenantId);
    const impactLevel = rule.impactLevel || computeImpactLevel(rule.severity);

    for (const loc of locations) {
      if (await shouldSkipCooldown(rule, loc.id)) continue;
      if (await shouldSkipDedup(rule, loc.id, condition.metricDefinitionId)) continue;

      if (condition.type === "threshold_breach") {
        const values = await storage.getMetricValues(condition.metricDefinitionId, loc.id);
        if (values.length === 0) continue;
        const latest = values[values.length - 1];
        let breached = false;
        if (condition.operator === "above" && latest.value > condition.threshold) breached = true;
        if (condition.operator === "below" && latest.value < condition.threshold) breached = true;
        if (breached) {
          const persistent = await checkPersistentIssue(rule, condition, loc.id, values);
          const effectiveSeverity = persistent.isPersistent ? escalateSeverity(rule.severity) : rule.severity;
          const effectiveImpact = persistent.isPersistent ? "high" : impactLevel;

          const detailData: any = {
            value: latest.value,
            threshold: condition.threshold,
            operator: condition.operator,
            impactLevel: effectiveImpact,
          };

          if (persistent.isPersistent) {
            detailData.persistentIssue = true;
            detailData.consecutiveDays = persistent.consecutiveDays;
          }
          if (rule.recommendedActions) {
            detailData.recommendedActions = rule.recommendedActions;
          }
          if (rule.ownerUserId) {
            detailData.ownerUserId = rule.ownerUserId;
          }

          const persistentLabel = persistent.isPersistent
            ? ` [PERSISTENT: ${persistent.consecutiveDays} days]`
            : "";

          const event = await storage.createAlertEvent({
            alertRuleId: rule.id,
            tenantId: rule.tenantId,
            locationId: loc.id,
            metricDefinitionId: condition.metricDefinitionId,
            status: "open",
            severity: effectiveSeverity,
            message: `${rule.name}: Value ${latest.value} ${condition.operator} threshold ${condition.threshold} at ${loc.name}${persistentLabel}`,
            detailJson: JSON.stringify(detailData),
          });
          await notifyAlertEvent(rule.tenantId, event.message, event.severity, event.id);
        }
      }

      if (condition.type === "trend_deterioration") {
        const values = await storage.getMetricValues(condition.metricDefinitionId, loc.id);
        if (values.length < 2) continue;
        const current = values[values.length - 1];
        const previous = values[values.length - 2];
        if (previous.value === 0) continue;
        const dropPct = ((previous.value - current.value) / Math.abs(previous.value)) * 100;
        if (dropPct >= (condition.dropPercent || 10)) {
          const detailData: any = {
            currentValue: current.value,
            previousValue: previous.value,
            dropPercent: dropPct,
            impactLevel,
          };
          if (rule.recommendedActions) {
            detailData.recommendedActions = rule.recommendedActions;
          }
          if (rule.ownerUserId) {
            detailData.ownerUserId = rule.ownerUserId;
          }

          const event = await storage.createAlertEvent({
            alertRuleId: rule.id,
            tenantId: rule.tenantId,
            locationId: loc.id,
            metricDefinitionId: condition.metricDefinitionId,
            status: "open",
            severity: rule.severity,
            message: `${rule.name}: Value dropped ${dropPct.toFixed(1)}% at ${loc.name} (${previous.value} → ${current.value})`,
            detailJson: JSON.stringify(detailData),
          });
          await notifyAlertEvent(rule.tenantId, event.message, event.severity, event.id);
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

adminRouter.get("/notification-settings", async (req: any, res) => {
  try {
    const tenantId = parseInt(req.query.tenantId as string);
    if (!tenantId) return res.status(400).json(err("VALIDATION_ERROR", "tenantId is required"));
    const access = await requireAdminAccess(req, res, tenantId);
    if (!access) return;
    const settings = await storage.getNotificationSettings(tenantId);
    res.json(ok(settings || null));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

adminRouter.put("/notification-settings/:tenantId", async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const access = await requireAdminAccess(req, res, tenantId);
    if (!access) return;
    const { tenantId: _, ...data } = req.body;
    const before = await storage.getNotificationSettings(tenantId);
    const settings = await storage.upsertNotificationSettings(tenantId, data);
    await audit(tenantId, req.user.claims.sub, "notification_settings", String(settings.id), before ? "update" : "create", before, settings);
    res.json(ok(settings));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

adminRouter.post("/notification-test", async (req: any, res) => {
  try {
    const { tenantId } = req.body;
    if (!tenantId) return res.status(400).json(err("VALIDATION_ERROR", "tenantId is required"));
    const access = await requireAdminAccess(req, res, tenantId);
    if (!access) return;
    const settings = await storage.getNotificationSettings(tenantId);
    if (!settings) return res.status(400).json(err("NOT_CONFIGURED", "Notification settings not configured"));

    const results: any[] = [];
    if (settings.emailEnabled) {
      const recipients: string[] = (() => { try { return JSON.parse(settings.recipientsJson); } catch { return []; } })();
      for (const recipient of recipients) {
        try {
          await sendNotification(tenantId, "email", recipient, "Test Notification", "<p>This is a test notification from Xpansion Console.</p>", "test", "0");
          results.push({ channel: "email", recipient, status: "sent" });
        } catch (e: any) {
          results.push({ channel: "email", recipient, status: "failed", error: e.message });
        }
      }
    }
    if (settings.slackEnabled && settings.slackWebhookUrl) {
      try {
        await sendNotification(tenantId, "slack", settings.slackWebhookUrl, "Test Notification", "This is a test from Xpansion Console", "test", "0");
        results.push({ channel: "slack", status: "sent" });
      } catch (e: any) {
        results.push({ channel: "slack", status: "failed", error: e.message });
      }
    }
    res.json(ok({ results }));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

adminRouter.get("/notification-deliveries", async (req: any, res) => {
  try {
    const tenantId = parseInt(req.query.tenantId as string);
    if (!tenantId) return res.status(400).json(err("VALIDATION_ERROR", "tenantId is required"));
    const access = await requireAdminAccess(req, res, tenantId);
    if (!access) return;
    const deliveries = await storage.getNotificationDeliveries(tenantId);
    res.json(ok(deliveries));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

adminRouter.post("/scheduler/run-now", async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json(err("UNAUTHORIZED", "Unauthorized"));
    const tenants = await storage.getTenants();
    let hasAdminAccess = false;
    for (const t of tenants) {
      const tu = await storage.getTenantUserByUserId(t.id, userId);
      if (tu && ["owner", "admin"].includes(tu.role)) { hasAdminAccess = true; break; }
    }
    if (!hasAdminAccess) return res.status(403).json(err("FORBIDDEN", "Admin access required"));
    const result = await manualRunNow();
    res.json(ok(result));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

adminRouter.get("/scheduler/status", async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json(err("UNAUTHORIZED", "Unauthorized"));
    const tenants = await storage.getTenants();
    let hasAdminAccess = false;
    for (const t of tenants) {
      const tu = await storage.getTenantUserByUserId(t.id, userId);
      if (tu && ["owner", "admin"].includes(tu.role)) { hasAdminAccess = true; break; }
    }
    if (!hasAdminAccess) return res.status(403).json(err("FORBIDDEN", "Admin access required"));
    const tenantId = req.query.tenantId ? parseInt(req.query.tenantId as string) : undefined;
    const status = await getSchedulerStatus(tenantId);
    res.json(ok(status));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

adminRouter.get("/data-quality", async (req: any, res) => {
  try {
    const tenantId = parseInt(req.query.tenantId as string);
    if (!tenantId) return res.status(400).json(err("VALIDATION_ERROR", "tenantId is required"));
    const access = await requireAdminAccess(req, res, tenantId);
    if (!access) return;
    const rules = await storage.getDataQualityRules(tenantId);
    const violations = await storage.getDataQualityViolations(tenantId);
    const locations = await storage.getLocations(tenantId);
    const metrics = await storage.getMetricDefinitions(tenantId);

    const qualityScores: any[] = [];
    for (const loc of locations) {
      const locViolations = violations.filter(v => v.locationId === loc.id);
      const metricScores: any[] = [];
      for (const metric of metrics) {
        const metricViolations = locViolations.filter(v => v.metricDefinitionId === metric.id);
        const score = Math.max(0, 100 - metricViolations.length * 10);
        metricScores.push({ metricId: metric.id, metricName: metric.name, score, violationCount: metricViolations.length });
      }
      const avgScore = metricScores.length > 0 ? metricScores.reduce((a, b) => a + b.score, 0) / metricScores.length : 100;
      qualityScores.push({ locationId: loc.id, locationName: loc.name, score: Math.round(avgScore), metrics: metricScores });
    }

    res.json(ok({ rules, violations: violations.slice(0, 100), qualityScores }));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

adminRouter.post("/imports/validate", upload.single("file"), async (req: any, res) => {
  try {
    const tenantId = parseInt(req.body.tenantId);
    if (!tenantId) return res.status(400).json(err("VALIDATION_ERROR", "tenantId is required"));
    const access = await requireAdminAccess(req, res, tenantId);
    if (!access) return;
    if (!req.file) return res.status(400).json(err("VALIDATION_ERROR", "CSV file is required"));

    const mappingConfig = req.body.mappingConfig || "{}";
    let mapping: Record<string, string>;
    try { mapping = JSON.parse(mappingConfig); } catch { return res.status(400).json(err("VALIDATION_ERROR", "Invalid mappingConfig JSON")); }

    const csvText = req.file.buffer.toString("utf-8");
    const lines = csvText.split(/\r?\n/).filter((l: string) => l.trim());
    if (lines.length < 2) return res.json(ok({ totalRows: 0, validRows: 0, warningRows: 0, failedRows: 0, qualityScore: 100, qualityBadge: "excellent", errors: [] }));

    const headers = lines[0].split(",").map((h: string) => h.trim().replace(/^"|"$/g, ""));
    const metrics = await storage.getMetricDefinitions(tenantId);

    const metricKey = mapping.metricKey || "metric";
    const valueKey = mapping.valueKey || "value";
    const periodStartKey = mapping.periodStartKey || "period_start";
    const periodEndKey = mapping.periodEndKey || "period_end";

    let validRows = 0;
    let failedRows = 0;
    const rowErrors: Array<{ line: number; reason: string }> = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      const rowData: Record<string, string> = {};
      headers.forEach((h: string, idx: number) => { rowData[h] = values[idx] || ""; });

      const errors: string[] = [];
      const metricName = rowData[metricKey];
      const rawValue = rowData[valueKey];
      const periodStartStr = rowData[periodStartKey];
      const periodEndStr = rowData[periodEndKey];

      if (!metricName) errors.push(`missing metric name in column "${metricKey}"`);
      if (!rawValue || isNaN(parseFloat(rawValue))) errors.push(`non-numeric value "${rawValue}"`);
      if (!periodStartStr || !periodEndStr) errors.push("missing period start/end dates");
      else {
        const ps = new Date(periodStartStr);
        const pe = new Date(periodEndStr);
        if (isNaN(ps.getTime()) || isNaN(pe.getTime())) errors.push("invalid date format");
      }
      if (metricName && metrics.length > 0) {
        const found = metrics.find((m) => m.name.toLowerCase() === metricName.toLowerCase());
        if (!found) errors.push(`metric "${metricName}" not found for tenant`);
      }

      if (errors.length > 0) {
        failedRows++;
        if (rowErrors.length < 10) {
          rowErrors.push({ line: i + 1, reason: errors.join("; ") });
        }
      } else {
        validRows++;
      }
    }

    const totalRows = lines.length - 1;
    const qualityScore = totalRows > 0 ? Math.round((validRows / totalRows) * 100) : 100;
    const qualityBadge = qualityScore >= 90 ? "excellent" : qualityScore >= 70 ? "good" : qualityScore >= 50 ? "fair" : "poor";

    res.json(ok({
      totalRows,
      validRows,
      warningRows: 0,
      failedRows,
      qualityScore,
      qualityBadge,
      errors: rowErrors,
    }));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

adminRouter.get("/import-templates", async (req: any, res) => {
  try {
    const tenantId = parseInt(req.query.tenantId as string);
    if (!tenantId) return res.status(400).json(err("VALIDATION_ERROR", "tenantId is required"));
    const access = await requireAdminAccess(req, res, tenantId);
    if (!access) return;
    const templates = await storage.getMappingTemplates(tenantId);
    res.json(ok(templates));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

adminRouter.post("/import-templates", async (req: any, res) => {
  try {
    const parsed = insertImportMappingTemplateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(err("VALIDATION_ERROR", fromZodError(parsed.error).toString()));
    const access = await requireAdminAccess(req, res, parsed.data.tenantId);
    if (!access) return;
    const template = await storage.createMappingTemplate(parsed.data);
    await audit(parsed.data.tenantId, req.user.claims.sub, "import_mapping_template", String(template.id), "create", null, template);
    res.status(201).json(ok(template));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

adminRouter.delete("/import-templates/:id", async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json(err("UNAUTHORIZED", "Unauthorized"));

    const tenantId = parseInt(req.query.tenantId as string);
    if (!tenantId) return res.status(400).json(err("VALIDATION_ERROR", "tenantId is required"));
    const access = await requireAdminAccess(req, res, tenantId);
    if (!access) return;

    await storage.deleteMappingTemplate(id, tenantId);
    await audit(tenantId, userId, "import_mapping_template", String(id), "delete", null, null);
    res.json(ok({ deleted: true }));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});

adminRouter.put("/data-quality/rules/:tenantId", async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const access = await requireAdminAccess(req, res, tenantId);
    if (!access) return;
    const { rules } = req.body;
    if (!Array.isArray(rules)) return res.status(400).json(err("VALIDATION_ERROR", "rules must be an array"));

    const results: any[] = [];
    for (const rule of rules) {
      if (rule.id) {
        const updated = await storage.updateDataQualityRule(rule.id, {
          ruleName: rule.ruleName,
          ruleType: rule.ruleType,
          config: rule.config || "{}",
          isActive: rule.isActive ?? true,
        });
        if (updated) results.push(updated);
      } else {
        const created = await storage.createDataQualityRule({
          tenantId,
          ruleName: rule.ruleName,
          ruleType: rule.ruleType,
          config: rule.config || "{}",
          isActive: rule.isActive ?? true,
        });
        results.push(created);
      }
    }
    await audit(tenantId, req.user.claims.sub, "data_quality_rules", String(tenantId), "update", null, results);
    res.json(ok(results));
  } catch (error: any) {
    res.status(500).json(err("INTERNAL_ERROR", error.message));
  }
});
