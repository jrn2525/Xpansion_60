import { storage } from "../storage";
import { db } from "../db";
import { metricValues, metricThresholds, alertEvents, metricForecasts, goals } from "@shared/schema";
import { eq, and, desc, gte } from "drizzle-orm";

interface RiskComponents {
  trendSlope: number;
  varianceInstability: number;
  alertBurden: number;
  unresolvedActions: number;
}

interface EarlyWarning {
  type: "likely_threshold_breach" | "likely_goal_miss" | "score_deterioration";
  detail: string;
}

function linearRegression(values: number[]): { slope: number; intercept: number; stdDev: number } {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] || 0, stdDev: 0 };
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  let sumResiduals2 = 0;
  for (let i = 0; i < n; i++) {
    const predicted = intercept + slope * i;
    sumResiduals2 += (values[i] - predicted) ** 2;
  }
  const stdDev = Math.sqrt(sumResiduals2 / n);
  return { slope, intercept, stdDev };
}

export async function computeLocationMetricRisk(
  tenantId: number,
  locationId: number,
  metricDefinitionId: number
): Promise<{
  riskScore: number;
  components: RiskComponents;
  earlyWarnings: EarlyWarning[];
  forecastValue: number | null;
  confidenceLow: number | null;
  confidenceHigh: number | null;
}> {
  const recentValues = await db.select().from(metricValues)
    .where(and(eq(metricValues.locationId, locationId), eq(metricValues.metricDefinitionId, metricDefinitionId)))
    .orderBy(desc(metricValues.periodStart))
    .limit(12);

  const vals = recentValues.reverse().map(v => parseFloat(v.value));

  const { slope, intercept, stdDev } = linearRegression(vals);
  const n = vals.length;

  const mean = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  const variance = vals.length > 1 ? vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length - 1) : 0;
  const varianceInstability = mean !== 0 ? Math.sqrt(variance) / Math.abs(mean) : 0;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentAlerts = await db.select().from(alertEvents)
    .where(and(
      eq(alertEvents.locationId, locationId),
      eq(alertEvents.metricDefinitionId, metricDefinitionId),
      gte(alertEvents.triggeredAt, thirtyDaysAgo)
    ));
  const alertBurden = recentAlerts.length;

  const allActions = await storage.getActions(tenantId, { locationId, status: "open" });
  const metricActions = allActions.filter(a => a.metricDefinitionId === metricDefinitionId);
  const unresolvedActions = metricActions.length;

  const slopeScore = Math.min(40, Math.abs(slope) * 10);
  const varianceScore = Math.min(25, varianceInstability * 50);
  const alertScore = Math.min(20, alertBurden * 5);
  const actionScore = Math.min(15, unresolvedActions * 5);
  let riskScore = slopeScore + varianceScore + alertScore + actionScore;
  riskScore = Math.min(100, Math.max(0, riskScore));

  let forecastValue: number | null = null;
  let confidenceLow: number | null = null;
  let confidenceHigh: number | null = null;
  if (n >= 2) {
    forecastValue = intercept + slope * n;
    confidenceLow = forecastValue - 1.96 * stdDev;
    confidenceHigh = forecastValue + 1.96 * stdDev;
  }

  const earlyWarnings: EarlyWarning[] = [];

  if (forecastValue !== null) {
    const thresholds = await db.select().from(metricThresholds)
      .where(eq(metricThresholds.metricDefinitionId, metricDefinitionId));
    for (const th of thresholds) {
      const min = th.minValue ? parseFloat(th.minValue) : null;
      const max = th.maxValue ? parseFloat(th.maxValue) : null;
      if (th.band === "poor") {
        if (min !== null && forecastValue <= min) {
          earlyWarnings.push({ type: "likely_threshold_breach", detail: `Forecast ${forecastValue.toFixed(2)} may breach poor threshold (min ${min})` });
        }
        if (max !== null && forecastValue >= max) {
          earlyWarnings.push({ type: "likely_threshold_breach", detail: `Forecast ${forecastValue.toFixed(2)} may breach poor threshold (max ${max})` });
        }
      }
    }

    const tenantGoals = await db.select().from(goals)
      .where(and(eq(goals.tenantId, tenantId), eq(goals.metricDefinitionId, metricDefinitionId), eq(goals.locationId, locationId)));
    for (const goal of tenantGoals) {
      const target = parseFloat(goal.targetValue);
      if (goal.status === "off_track" || (forecastValue < target * 0.9)) {
        earlyWarnings.push({ type: "likely_goal_miss", detail: `Forecast ${forecastValue.toFixed(2)} vs target ${target}` });
      }
    }
  }

  if (slope < 0 && n >= 3) {
    earlyWarnings.push({ type: "score_deterioration", detail: `Declining trend (slope: ${slope.toFixed(4)})` });
  }

  return {
    riskScore,
    components: { trendSlope: slope, varianceInstability, alertBurden, unresolvedActions },
    earlyWarnings,
    forecastValue,
    confidenceLow,
    confidenceHigh,
  };
}

export async function computeTenantRisk(tenantId: number): Promise<number> {
  await storage.deleteRiskSnapshots(tenantId);

  const locations = await storage.getLocations(tenantId);
  const metrics = await storage.getMetricDefinitions(tenantId);

  let snapshotCount = 0;
  for (const loc of locations) {
    for (const metric of metrics) {
      try {
        const result = await computeLocationMetricRisk(tenantId, loc.id, metric.id);
        await storage.createRiskSnapshot({
          tenantId,
          locationId: loc.id,
          metricDefinitionId: metric.id,
          riskScore: result.riskScore,
          trendSlope: result.components.trendSlope,
          varianceInstability: result.components.varianceInstability,
          alertBurden: result.components.alertBurden,
          unresolvedActions: result.components.unresolvedActions,
          earlyWarnings: JSON.stringify(result.earlyWarnings),
          forecastValue: result.forecastValue,
          confidenceLow: result.confidenceLow,
          confidenceHigh: result.confidenceHigh,
        });
        snapshotCount++;
      } catch (e) {
        console.error(`[RISK] Error computing risk for loc=${loc.id} metric=${metric.id}:`, e);
      }
    }
  }

  return snapshotCount;
}
