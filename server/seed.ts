import { db } from "./db";
import {
  tenants,
  locations,
  metricDefinitions,
  metricThresholds,
  scorecardTemplates,
  scorecardMetrics,
  metricValues,
} from "@shared/schema";
import { sql } from "drizzle-orm";

export async function seed() {
  const existing = await db.select().from(tenants).limit(1);
  if (existing.length > 0) return;

  console.log("Seeding database...");

  const [demoTenant] = await db
    .insert(tenants)
    .values([
      {
        name: "Sunrise Burgers",
        slug: "sunrise-burgers",
        type: "multi_location",
        isActive: true,
      },
      {
        name: "Peak Coffee Co",
        slug: "peak-coffee",
        type: "single_location",
        isActive: true,
      },
    ])
    .returning();

  const [loc1, loc2, loc3] = await db
    .insert(locations)
    .values([
      {
        tenantId: demoTenant.id,
        name: "Downtown Flagship",
        address: "100 Main Street",
        city: "Austin",
        state: "TX",
        zipCode: "78701",
        isActive: true,
      },
      {
        tenantId: demoTenant.id,
        name: "Westside Mall",
        address: "2500 West Loop Blvd",
        city: "Austin",
        state: "TX",
        zipCode: "78745",
        isActive: true,
      },
      {
        tenantId: demoTenant.id,
        name: "Airport Terminal B",
        address: "3600 Presidential Blvd",
        city: "Austin",
        state: "TX",
        zipCode: "78719",
        isActive: true,
      },
    ])
    .returning();

  const [revMetric, csatMetric, foodCostMetric, speedMetric, cleanMetric] =
    await db
      .insert(metricDefinitions)
      .values([
        {
          tenantId: demoTenant.id,
          name: "Revenue",
          description: "Total monthly revenue in dollars",
          dataType: "currency",
          unit: "USD",
          direction: "higher_is_better",
          isActive: true,
        },
        {
          tenantId: demoTenant.id,
          name: "Customer Satisfaction",
          description: "Average CSAT score from surveys (1-5 scale)",
          dataType: "number",
          unit: "score",
          direction: "higher_is_better",
          isActive: true,
        },
        {
          tenantId: demoTenant.id,
          name: "Food Cost %",
          description: "Food cost as percentage of revenue",
          dataType: "percentage",
          unit: "%",
          direction: "lower_is_better",
          isActive: true,
        },
        {
          tenantId: demoTenant.id,
          name: "Speed of Service",
          description: "Average order-to-delivery time in minutes",
          dataType: "number",
          unit: "min",
          direction: "lower_is_better",
          isActive: true,
        },
        {
          tenantId: demoTenant.id,
          name: "Cleanliness Score",
          description: "Weekly inspection cleanliness score (0-100)",
          dataType: "number",
          unit: "pts",
          direction: "higher_is_better",
          isActive: false,
        },
      ])
      .returning();

  await db.insert(metricThresholds).values([
    { metricDefinitionId: revMetric.id, band: "excellent", minValue: 80000, maxValue: 999999, color: "#22c55e" },
    { metricDefinitionId: revMetric.id, band: "good", minValue: 60000, maxValue: 79999, color: "#3b82f6" },
    { metricDefinitionId: revMetric.id, band: "acceptable", minValue: 40000, maxValue: 59999, color: "#f59e0b" },
    { metricDefinitionId: revMetric.id, band: "poor", minValue: 0, maxValue: 39999, color: "#ef4444" },

    { metricDefinitionId: csatMetric.id, band: "excellent", minValue: 4.5, maxValue: 5, color: "#22c55e" },
    { metricDefinitionId: csatMetric.id, band: "good", minValue: 4.0, maxValue: 4.49, color: "#3b82f6" },
    { metricDefinitionId: csatMetric.id, band: "acceptable", minValue: 3.5, maxValue: 3.99, color: "#f59e0b" },
    { metricDefinitionId: csatMetric.id, band: "poor", minValue: 0, maxValue: 3.49, color: "#ef4444" },

    { metricDefinitionId: foodCostMetric.id, band: "excellent", minValue: 0, maxValue: 25, color: "#22c55e" },
    { metricDefinitionId: foodCostMetric.id, band: "good", minValue: 25.01, maxValue: 30, color: "#3b82f6" },
    { metricDefinitionId: foodCostMetric.id, band: "acceptable", minValue: 30.01, maxValue: 35, color: "#f59e0b" },
    { metricDefinitionId: foodCostMetric.id, band: "poor", minValue: 35.01, maxValue: 100, color: "#ef4444" },

    { metricDefinitionId: speedMetric.id, band: "excellent", minValue: 0, maxValue: 5, color: "#22c55e" },
    { metricDefinitionId: speedMetric.id, band: "good", minValue: 5.01, maxValue: 8, color: "#3b82f6" },
    { metricDefinitionId: speedMetric.id, band: "acceptable", minValue: 8.01, maxValue: 12, color: "#f59e0b" },
    { metricDefinitionId: speedMetric.id, band: "poor", minValue: 12.01, maxValue: 60, color: "#ef4444" },
  ]);

  const [template1] = await db
    .insert(scorecardTemplates)
    .values([
      {
        tenantId: demoTenant.id,
        name: "Monthly Performance Review",
        description: "Standard monthly review covering revenue, satisfaction, costs, and speed",
        isActive: true,
      },
      {
        tenantId: demoTenant.id,
        name: "Quarterly Operations Audit",
        description: "In-depth quarterly operational assessment",
        isActive: true,
      },
    ])
    .returning();

  await db.insert(scorecardMetrics).values([
    { scorecardTemplateId: template1.id, metricDefinitionId: revMetric.id, weight: 0.35 },
    { scorecardTemplateId: template1.id, metricDefinitionId: csatMetric.id, weight: 0.25 },
    { scorecardTemplateId: template1.id, metricDefinitionId: foodCostMetric.id, weight: 0.25 },
    { scorecardTemplateId: template1.id, metricDefinitionId: speedMetric.id, weight: 0.15 },
  ]);

  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
    months.push({ start, end });
  }

  const metricValueEntries: any[] = [];
  for (const loc of [loc1, loc2, loc3]) {
    for (let mi = 0; mi < months.length; mi++) {
      const m = months[mi];
      const trend = mi / 12;
      metricValueEntries.push({
        metricDefinitionId: revMetric.id,
        locationId: loc.id,
        period: "month",
        periodStart: m.start,
        periodEnd: m.end,
        value: Math.round(50000 + trend * 20000 + (Math.random() - 0.5) * 15000),
      });
      metricValueEntries.push({
        metricDefinitionId: csatMetric.id,
        locationId: loc.id,
        period: "month",
        periodStart: m.start,
        periodEnd: m.end,
        value: parseFloat((3.5 + trend * 1.0 + (Math.random() - 0.5) * 0.8).toFixed(2)),
      });
      metricValueEntries.push({
        metricDefinitionId: foodCostMetric.id,
        locationId: loc.id,
        period: "month",
        periodStart: m.start,
        periodEnd: m.end,
        value: parseFloat((32 - trend * 5 + (Math.random() - 0.5) * 6).toFixed(1)),
      });
      metricValueEntries.push({
        metricDefinitionId: speedMetric.id,
        locationId: loc.id,
        period: "month",
        periodStart: m.start,
        periodEnd: m.end,
        value: parseFloat((10 - trend * 3 + (Math.random() - 0.5) * 4).toFixed(1)),
      });
    }
  }

  for (let i = 0; i < metricValueEntries.length; i += 50) {
    const batch = metricValueEntries.slice(i, i + 50);
    await db.insert(metricValues).values(batch);
  }

  console.log("Seed complete.");
}
