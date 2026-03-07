import { storage } from "../storage";
import { db } from "../db";
import { metricValues, metricAnomalies } from "@shared/schema";
import { eq, and, desc, gte } from "drizzle-orm";

export interface ConfidenceFactors {
  freshnessScore: number;
  completenessScore: number;
  continuityScore: number;
  outlierRate: number;
  sampleSufficiency: number;
  overallConfidence: number;
}

const WEIGHTS = {
  freshness: 0.25,
  completeness: 0.25,
  continuity: 0.20,
  outlier: 0.15,
  sample: 0.15,
};

const EXPECTED_PERIODS_PER_QUARTER = 12;
const MIN_SAMPLE_SIZE = 6;
const FRESHNESS_DECAY_DAYS = 30;

function computeFreshnessScore(latestDate: Date | null, expectedPeriodDays: number): number {
  if (!latestDate) return 0;
  const ageDays = (Date.now() - latestDate.getTime()) / (1000 * 60 * 60 * 24);
  const maxAcceptable = Math.max(expectedPeriodDays * 2, FRESHNESS_DECAY_DAYS);
  if (ageDays <= expectedPeriodDays) return 1.0;
  if (ageDays >= maxAcceptable) return 0;
  return Math.max(0, 1 - (ageDays - expectedPeriodDays) / (maxAcceptable - expectedPeriodDays));
}

function computeCompletenessScore(actualCount: number, expectedCount: number): number {
  if (expectedCount <= 0) return 1.0;
  return Math.min(1.0, actualCount / expectedCount);
}

function computeContinuityScore(periods: Date[]): number {
  if (periods.length < 2) return periods.length > 0 ? 0.5 : 0;
  const sorted = [...periods].sort((a, b) => a.getTime() - b.getTime());
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push(sorted[i].getTime() - sorted[i - 1].getTime());
  }
  const medianGap = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
  if (medianGap === 0) return 1.0;
  let gapCount = 0;
  for (const gap of gaps) {
    if (gap > medianGap * 2) gapCount++;
  }
  return Math.max(0, 1 - gapCount / gaps.length);
}

function computeOutlierRate(anomalyCount: number, totalCount: number): number {
  if (totalCount === 0) return 0;
  const rate = anomalyCount / totalCount;
  return Math.max(0, 1 - rate * 2);
}

function computeSampleSufficiency(count: number, minimum: number): number {
  if (count >= minimum) return 1.0;
  if (count === 0) return 0;
  return count / minimum;
}

export async function computeMetricConfidence(
  tenantId: number,
  locationId: number,
  metricDefinitionId: number,
  period: string = "weekly"
): Promise<ConfidenceFactors> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const values = await db
    .select()
    .from(metricValues)
    .where(
      and(
        eq(metricValues.locationId, locationId),
        eq(metricValues.metricDefinitionId, metricDefinitionId),
        gte(metricValues.periodStart, ninetyDaysAgo)
      )
    )
    .orderBy(desc(metricValues.periodStart));

  const anomalies = await db
    .select()
    .from(metricAnomalies)
    .where(
      and(
        eq(metricAnomalies.locationId, locationId),
        eq(metricAnomalies.metricDefinitionId, metricDefinitionId),
        gte(metricAnomalies.createdAt, ninetyDaysAgo)
      )
    );

  const expectedPeriodDays = period === "monthly" ? 30 : period === "quarterly" ? 90 : 7;

  const latestDate = values.length > 0 ? values[0].periodStart : null;
  const freshnessScore = computeFreshnessScore(latestDate, expectedPeriodDays);

  const completenessScore = computeCompletenessScore(values.length, EXPECTED_PERIODS_PER_QUARTER);

  const periodDates = values.map((v) => v.periodStart);
  const continuityScore = computeContinuityScore(periodDates);

  const outlierRate = computeOutlierRate(anomalies.length, values.length);

  const sampleSufficiency = computeSampleSufficiency(values.length, MIN_SAMPLE_SIZE);

  const overallConfidence = Math.min(
    1.0,
    Math.max(
      0,
      freshnessScore * WEIGHTS.freshness +
        completenessScore * WEIGHTS.completeness +
        continuityScore * WEIGHTS.continuity +
        outlierRate * WEIGHTS.outlier +
        sampleSufficiency * WEIGHTS.sample
    )
  );

  return {
    freshnessScore: parseFloat(freshnessScore.toFixed(4)),
    completenessScore: parseFloat(completenessScore.toFixed(4)),
    continuityScore: parseFloat(continuityScore.toFixed(4)),
    outlierRate: parseFloat(outlierRate.toFixed(4)),
    sampleSufficiency: parseFloat(sampleSufficiency.toFixed(4)),
    overallConfidence: parseFloat(overallConfidence.toFixed(4)),
  };
}

export async function computeTenantConfidence(
  tenantId: number,
  persist: boolean = false
): Promise<{
  metrics: Array<{
    locationId: number;
    metricDefinitionId: number;
    confidence: ConfidenceFactors;
  }>;
  overallConfidence: number;
}> {
  const locations = await storage.getLocations(tenantId);
  const metricDefs = await storage.getMetricDefinitions(tenantId);

  const results: Array<{
    locationId: number;
    metricDefinitionId: number;
    confidence: ConfidenceFactors;
  }> = [];

  for (const loc of locations.filter((l) => l.isActive)) {
    for (const metric of metricDefs.filter((m) => m.isActive)) {
      try {
        const confidence = await computeMetricConfidence(
          tenantId,
          loc.id,
          metric.id
        );
        results.push({
          locationId: loc.id,
          metricDefinitionId: metric.id,
          confidence,
        });

        if (persist) {
          await storage.createConfidenceSnapshot({
            tenantId,
            locationId: loc.id,
            metricDefinitionId: metric.id,
            period: "weekly",
            freshnessScore: confidence.freshnessScore,
            completenessScore: confidence.completenessScore,
            continuityScore: confidence.continuityScore,
            outlierRate: confidence.outlierRate,
            sampleSufficiency: confidence.sampleSufficiency,
            overallConfidence: confidence.overallConfidence,
            snapshotAt: new Date(),
          });
        }
      } catch (e) {
        console.error(
          `[CONFIDENCE] Error computing confidence for loc=${loc.id} metric=${metric.id}:`,
          e
        );
      }
    }
  }

  const overallConfidence =
    results.length > 0
      ? parseFloat(
          (
            results.reduce((sum, r) => sum + r.confidence.overallConfidence, 0) /
            results.length
          ).toFixed(4)
        )
      : 0;

  return { metrics: results, overallConfidence };
}

export function applyConfidenceWeight(
  rawScore: number,
  confidence: number,
  minConfidence: number = 0.3
): number {
  if (confidence < minConfidence) {
    return rawScore * minConfidence;
  }
  return rawScore * confidence;
}
