import { storage } from "../storage";
import type { InsertMetricForecast, InsertMetricAnomaly, MetricValue } from "@shared/schema";

export async function generateForecast(
  metricDefinitionId: number,
  locationId: number,
  periods: number = 3
): Promise<any[]> {
  const values = await storage.getMetricValues(metricDefinitionId, locationId);
  if (values.length < 2) return [];

  await storage.deleteMetricForecasts(metricDefinitionId, locationId);

  const sorted = [...values].sort((a, b) =>
    (a.periodStart?.getTime() || 0) - (b.periodStart?.getTime() || 0)
  );

  const n = sorted.length;
  const yValues = sorted.map(v => v.value);
  const xValues = Array.from({ length: n }, (_, i) => i);

  const sumX = xValues.reduce((a, b) => a + b, 0);
  const sumY = yValues.reduce((a, b) => a + b, 0);
  const sumXY = xValues.reduce((acc, x, i) => acc + x * yValues[i], 0);
  const sumX2 = xValues.reduce((acc, x) => acc + x * x, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX) || 0;
  const intercept = (sumY - slope * sumX) / n;

  const residuals = yValues.map((y, i) => y - (intercept + slope * i));
  const stdDev = Math.sqrt(residuals.reduce((acc, r) => acc + r * r, 0) / n) || 1;

  const lastValue = sorted[n - 1];
  const lastStart = lastValue.periodStart;
  const lastEnd = lastValue.periodEnd;
  const periodMs = (lastEnd?.getTime() || 0) - (lastStart?.getTime() || 0);
  const period = lastValue.period;

  const forecasts: any[] = [];
  for (let i = 1; i <= periods; i++) {
    const forecastValue = intercept + slope * (n - 1 + i);
    const periodStart = new Date((lastStart?.getTime() || 0) + periodMs * i);
    const periodEnd = new Date((lastEnd?.getTime() || 0) + periodMs * i);
    const confidenceLow = forecastValue - 1.96 * stdDev;
    const confidenceHigh = forecastValue + 1.96 * stdDev;

    const forecast = await storage.createMetricForecast({
      metricDefinitionId,
      locationId,
      period,
      periodStart,
      periodEnd,
      forecastValue: Math.round(forecastValue * 100) / 100,
      confidenceLow: Math.round(confidenceLow * 100) / 100,
      confidenceHigh: Math.round(confidenceHigh * 100) / 100,
      model: "linear_trend",
    });
    forecasts.push(forecast);
  }

  return forecasts;
}

export async function detectAnomalies(
  metricDefinitionId: number,
  locationId: number
): Promise<any[]> {
  const values = await storage.getMetricValues(metricDefinitionId, locationId);
  if (values.length < 4) return [];

  const sorted = [...values].sort((a, b) =>
    (a.periodStart?.getTime() || 0) - (b.periodStart?.getTime() || 0)
  );

  const windowSize = Math.min(6, sorted.length - 1);
  const anomalies: any[] = [];

  for (let i = windowSize; i < sorted.length; i++) {
    const window = sorted.slice(i - windowSize, i);
    const mean = window.reduce((acc, v) => acc + v.value, 0) / window.length;
    const stdDev = Math.sqrt(window.reduce((acc, v) => acc + Math.pow(v.value - mean, 2), 0) / window.length) || 1;

    const actual = sorted[i].value;
    const deviation = Math.abs(actual - mean);
    const deviationPercent = (deviation / Math.abs(mean || 1)) * 100;

    if (deviation > 2 * stdDev) {
      const severity = deviation > 3 * stdDev ? "high" : "medium";
      const anomaly = await storage.createMetricAnomaly({
        metricDefinitionId,
        locationId,
        metricValueId: sorted[i].id,
        deviationPercent: Math.round(deviationPercent * 10) / 10,
        baselineValue: Math.round(mean * 100) / 100,
        actualValue: actual,
        severity,
        message: `Value ${actual} deviates ${deviationPercent.toFixed(1)}% from baseline ${mean.toFixed(2)} (±${stdDev.toFixed(2)})`,
      });
      anomalies.push(anomaly);
    }
  }

  return anomalies;
}
