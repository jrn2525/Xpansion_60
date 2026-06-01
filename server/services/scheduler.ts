import { storage } from "../storage";
import { notifyReportReady, notifyAlertEvent } from "./notifications";

let schedulerInterval: ReturnType<typeof setInterval> | null = null;

export function startScheduler(): void {
  if (schedulerInterval) return;
  console.log("[SCHEDULER] Starting scheduler (60s interval)");
  schedulerInterval = setInterval(async () => {
    try {
      await runScheduledTasks();
    } catch (e) {
      console.error("[SCHEDULER] Error in scheduled run:", e);
    }
  }, 60 * 1000);

  setTimeout(() => runScheduledTasks().catch(console.error), 5000);
}

export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("[SCHEDULER] Stopped");
  }
}

async function runScheduledTasks(): Promise<void> {
  await runScheduledReports();
  await runScheduledAlertEvaluation();
  await runEscalationChecks();
  await runScheduledDigests();
}

async function acquireLock(jobKey: string): Promise<number | null> {
  const latest = await storage.getLatestSchedulerRun(jobKey);
  if (latest && latest.status === "running") {
    const startedAt = latest.startedAt?.getTime() || 0;
    if (Date.now() - startedAt < 5 * 60 * 1000) return null;
  }
  const run = await storage.createSchedulerRun({
    tenantId: null,
    jobType: jobKey.split(":")[0] || "unknown",
    jobKey,
    status: "running",
    startedAt: new Date(),
  });
  return run.id;
}

async function releaseLock(runId: number, status: "completed" | "failed", startTime: number, error?: string): Promise<void> {
  await storage.updateSchedulerRun(runId, {
    status,
    durationMs: Date.now() - startTime,
    completedAt: new Date(),
    errorSnapshot: error || null,
  });
}

async function runScheduledReports(): Promise<void> {
  const tenants = await storage.getTenants();
  for (const tenant of tenants) {
    const reports = await storage.getReports(tenant.id);
    for (const report of reports) {
      if (!report.isActive) continue;

      let schedule: any;
      try { schedule = JSON.parse(report.scheduleJson); } catch { continue; }

      if (!schedule.intervalMinutes) continue;

      const runs = await storage.getReportRuns(report.id);
      const lastRun = runs[0];
      const lastRunTime = lastRun?.startedAt?.getTime() || 0;
      const intervalMs = schedule.intervalMinutes * 60 * 1000;

      if (Date.now() - lastRunTime < intervalMs) continue;

      const jobKey = `report:${report.id}`;
      const runId = await acquireLock(jobKey);
      if (!runId) continue;

      const startTime = Date.now();
      try {
        const reportRun = await storage.createReportRun({
          reportId: report.id,
          tenantId: report.tenantId,
          status: "running",
          startedAt: new Date(),
        });

        const summary = await generateReportSummary(report);
        await storage.updateReportRun(reportRun.id, {
          status: "completed",
          summaryJson: JSON.stringify(summary),
          completedAt: new Date(),
        });

        await notifyReportReady(report.tenantId, report.name, reportRun.id);
        await releaseLock(runId, "completed", startTime);
      } catch (e: any) {
        await releaseLock(runId, "failed", startTime, e.message);
      }
    }
  }
}

async function runScheduledAlertEvaluation(): Promise<void> {
  const jobKey = "alert_evaluation:global";
  const runId = await acquireLock(jobKey);
  if (!runId) return;

  const startTime = Date.now();
  try {
    const tenants = await storage.getTenants();
    for (const tenant of tenants) {
      const rules = await storage.getAlertRules(tenant.id);
      for (const rule of rules) {
        if (!rule.isActive) continue;
        await evaluateAlertRuleScheduled(rule);
      }
    }
    await releaseLock(runId, "completed", startTime);
  } catch (e: any) {
    await releaseLock(runId, "failed", startTime, e.message);
  }
}

async function runEscalationChecks(): Promise<void> {
  const tenants = await storage.getTenants();
  for (const tenant of tenants) {
    const rules = await storage.getAlertRules(tenant.id);
    for (const rule of rules) {
      if (!rule.isActive || !rule.escalationMinutes || rule.escalationMinutes <= 0) continue;

      const events = await storage.getAlertEvents(tenant.id, { status: "open" });
      for (const event of events) {
        if (event.alertRuleId !== rule.id) continue;
        const eventAge = (Date.now() - (event.createdAt?.getTime() || 0)) / 60000;
        if (eventAge >= rule.escalationMinutes) {
          const severityOrder = ["low", "medium", "high", "critical"];
          const currentIdx = severityOrder.indexOf(event.severity);
          if (currentIdx < severityOrder.length - 1) {
            const newSeverity = severityOrder[currentIdx + 1];
            await storage.updateAlertEvent(event.id, {
              severity: newSeverity,
              message: `${event.message} [ESCALATED: ${event.severity} → ${newSeverity} after ${rule.escalationMinutes}min]`,
            });
            await notifyAlertEvent(tenant.id, `ESCALATED: ${event.message}`, newSeverity, event.id);
          }
        }
      }
    }
  }
}

async function evaluateAlertRuleScheduled(rule: any): Promise<void> {
  try {
    const condition = JSON.parse(rule.conditionJson);
    const locations = await storage.getLocations(rule.tenantId);

    for (const loc of locations) {
      if (await shouldSkipDueToDedup(rule, loc.id, condition.metricDefinitionId)) continue;
      if (await shouldSkipDueToCooldown(rule, loc.id)) continue;

      if (condition.type === "threshold_breach") {
        const values = await storage.getMetricValues(condition.metricDefinitionId, loc.id);
        if (values.length === 0) continue;
        const latest = values[values.length - 1];
        let breached = false;
        if (condition.operator === "above" && latest.value > condition.threshold) breached = true;
        if (condition.operator === "below" && latest.value < condition.threshold) breached = true;
        if (breached) {
          const event = await storage.createAlertEvent({
            alertRuleId: rule.id,
            tenantId: rule.tenantId,
            locationId: loc.id,
            metricDefinitionId: condition.metricDefinitionId,
            status: "open",
            severity: rule.severity,
            message: `${rule.name}: Value ${latest.value} ${condition.operator} threshold ${condition.threshold} at ${loc.name}`,
            detailJson: JSON.stringify({ value: latest.value, threshold: condition.threshold, operator: condition.operator }),
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
          const event = await storage.createAlertEvent({
            alertRuleId: rule.id,
            tenantId: rule.tenantId,
            locationId: loc.id,
            metricDefinitionId: condition.metricDefinitionId,
            status: "open",
            severity: rule.severity,
            message: `${rule.name}: Value dropped ${dropPct.toFixed(1)}% at ${loc.name}`,
            detailJson: JSON.stringify({ currentValue: current.value, previousValue: previous.value, dropPercent: dropPct }),
          });
          await notifyAlertEvent(rule.tenantId, event.message, event.severity, event.id);
        }
      }
    }
  } catch (e) {
    console.error("[SCHEDULER] Error evaluating rule:", rule.id, e);
  }
}

async function shouldSkipDueToCooldown(rule: any, locationId: number): Promise<boolean> {
  if (!rule.cooldownMinutes || rule.cooldownMinutes <= 0) return false;
  const events = await storage.getAlertEvents(rule.tenantId, {});
  const recentEvent = events.find(
    e => e.alertRuleId === rule.id && e.locationId === locationId
  );
  if (!recentEvent) return false;
  const eventAge = (Date.now() - (recentEvent.createdAt?.getTime() || 0)) / 60000;
  return eventAge < rule.cooldownMinutes;
}

async function shouldSkipDueToDedup(rule: any, locationId: number, metricDefinitionId: number): Promise<boolean> {
  if (!rule.dedupWindowMinutes || rule.dedupWindowMinutes <= 0) return false;
  const events = await storage.getAlertEvents(rule.tenantId, { status: "open" });
  const duplicateEvent = events.find(
    e => e.alertRuleId === rule.id && e.locationId === locationId && e.metricDefinitionId === metricDefinitionId
  );
  if (!duplicateEvent) return false;
  const eventAge = (Date.now() - (duplicateEvent.createdAt?.getTime() || 0)) / 60000;
  return eventAge < rule.dedupWindowMinutes;
}

async function generateReportSummary(report: any): Promise<any> {
  const config = (() => { try { return JSON.parse(report.configJson); } catch { return {}; } })();
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
          ? ((latest.value - previous.value) / Math.abs(previous.value) * 100) : null,
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

export async function manualRunNow(): Promise<{ reports: number; alerts: number }> {
  let reportCount = 0;
  let alertCount = 0;
  const tenants = await storage.getTenants();
  for (const tenant of tenants) {
    const reports = await storage.getReports(tenant.id);
    for (const report of reports) {
      if (!report.isActive) continue;
      try {
        const reportRun = await storage.createReportRun({
          reportId: report.id,
          tenantId: report.tenantId,
          status: "running",
          startedAt: new Date(),
        });
        const summary = await generateReportSummary(report);
        await storage.updateReportRun(reportRun.id, {
          status: "completed",
          summaryJson: JSON.stringify(summary),
          completedAt: new Date(),
        });
        await notifyReportReady(report.tenantId, report.name, reportRun.id);
        reportCount++;
      } catch (e: any) {
        console.error("[MANUAL RUN] Report error:", e.message);
      }
    }

    const rules = await storage.getAlertRules(tenant.id);
    for (const rule of rules) {
      if (!rule.isActive) continue;
      await evaluateAlertRuleScheduled(rule);
      alertCount++;
    }
  }
  return { reports: reportCount, alerts: alertCount };
}

async function runScheduledDigests(): Promise<void> {
  // Digest generation was removed in the BI cleanup; this is a no-op
  // retained only so any existing call sites do not throw.
}

export async function getSchedulerStatus(tenantId?: number): Promise<any> {
  const runs = await storage.getSchedulerRuns(tenantId || null);
  const byJobType: Record<string, any> = {};
  for (const run of runs) {
    if (!byJobType[run.jobType]) {
      byJobType[run.jobType] = {
        jobType: run.jobType,
        lastRun: run,
        totalRuns: 0,
        successCount: 0,
        failCount: 0,
      };
    }
    byJobType[run.jobType].totalRuns++;
    if (run.status === "completed") byJobType[run.jobType].successCount++;
    if (run.status === "failed") byJobType[run.jobType].failCount++;
  }
  return {
    schedulerActive: !!schedulerInterval,
    jobs: Object.values(byJobType),
  };
}
