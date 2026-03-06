import {
  tenants,
  tenantUsers,
  locations,
  metricDefinitions,
  metricThresholds,
  scorecardTemplates,
  scorecardMetrics,
  scoreRuns,
  scoreRunDetails,
  metricValues,
  type Tenant,
  type InsertTenant,
  type TenantUser,
  type InsertTenantUser,
  type Location,
  type InsertLocation,
  type MetricDefinition,
  type InsertMetricDefinition,
  type MetricThreshold,
  type InsertMetricThreshold,
  type ScorecardTemplate,
  type InsertScorecardTemplate,
  type ScorecardMetric,
  type InsertScorecardMetric,
  type ScoreRun,
  type InsertScoreRun,
  type ScoreRunDetail,
  type MetricValue,
  type InsertMetricValue,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc, gte, lte } from "drizzle-orm";

export interface IStorage {
  getTenants(): Promise<Tenant[]>;
  getTenant(id: number): Promise<Tenant | undefined>;
  getTenantBySlug(slug: string): Promise<Tenant | undefined>;
  createTenant(data: InsertTenant): Promise<Tenant>;
  updateTenant(id: number, data: Partial<InsertTenant>): Promise<Tenant | undefined>;
  deleteTenant(id: number): Promise<boolean>;

  getTenantUsers(tenantId: number): Promise<TenantUser[]>;
  getTenantUserByUserId(tenantId: number, userId: string): Promise<TenantUser | undefined>;
  getUserTenants(userId: string): Promise<(TenantUser & { tenant?: Tenant })[]>;
  createTenantUser(data: InsertTenantUser): Promise<TenantUser>;
  updateTenantUserRole(id: number, role: string): Promise<TenantUser | undefined>;
  deleteTenantUser(id: number): Promise<boolean>;

  getLocations(tenantId: number): Promise<Location[]>;
  getLocation(id: number): Promise<Location | undefined>;
  createLocation(data: InsertLocation): Promise<Location>;
  updateLocation(id: number, data: Partial<InsertLocation>): Promise<Location | undefined>;
  deleteLocation(id: number): Promise<boolean>;

  getMetricDefinitions(tenantId: number): Promise<MetricDefinition[]>;
  getMetricDefinition(id: number): Promise<MetricDefinition | undefined>;
  createMetricDefinition(data: InsertMetricDefinition): Promise<MetricDefinition>;
  updateMetricDefinition(id: number, data: Partial<InsertMetricDefinition>): Promise<MetricDefinition | undefined>;
  deleteMetricDefinition(id: number): Promise<boolean>;

  getMetricThresholds(metricDefinitionId: number): Promise<MetricThreshold[]>;
  createMetricThreshold(data: InsertMetricThreshold): Promise<MetricThreshold>;
  updateMetricThreshold(id: number, data: Partial<InsertMetricThreshold>): Promise<MetricThreshold | undefined>;
  deleteMetricThreshold(id: number): Promise<boolean>;
  deleteMetricThresholdsByMetric(metricDefinitionId: number): Promise<boolean>;

  getScorecardTemplates(tenantId: number): Promise<ScorecardTemplate[]>;
  getScorecardTemplate(id: number): Promise<ScorecardTemplate | undefined>;
  createScorecardTemplate(data: InsertScorecardTemplate): Promise<ScorecardTemplate>;
  updateScorecardTemplate(id: number, data: Partial<InsertScorecardTemplate>): Promise<ScorecardTemplate | undefined>;
  deleteScorecardTemplate(id: number): Promise<boolean>;

  getScorecardMetrics(scorecardTemplateId: number): Promise<ScorecardMetric[]>;
  createScorecardMetric(data: InsertScorecardMetric): Promise<ScorecardMetric>;
  updateScorecardMetric(id: number, data: Partial<InsertScorecardMetric>): Promise<ScorecardMetric | undefined>;
  deleteScorecardMetric(id: number): Promise<boolean>;
  deleteScorecardMetricsByTemplate(scorecardTemplateId: number): Promise<boolean>;

  getScoreRuns(scorecardTemplateId: number): Promise<ScoreRun[]>;
  getScoreRun(id: number): Promise<ScoreRun | undefined>;
  createScoreRun(data: any): Promise<ScoreRun>;
  updateScoreRun(id: number, data: { totalScore: number; band: string }): Promise<ScoreRun | undefined>;
  getScoreRunDetails(scoreRunId: number): Promise<ScoreRunDetail[]>;
  createScoreRunDetail(data: any): Promise<ScoreRunDetail>;

  getMetricValues(metricDefinitionId: number, locationId: number): Promise<MetricValue[]>;
  getMetricValueForPeriod(
    metricDefinitionId: number,
    locationId: number,
    periodStart: Date,
    periodEnd: Date
  ): Promise<MetricValue | undefined>;
  createMetricValue(data: InsertMetricValue): Promise<MetricValue>;
  getMetricTrends(
    metricDefinitionId: number,
    locationId: number,
    period: string,
    startDate: Date,
    endDate: Date
  ): Promise<MetricValue[]>;
}

export class DatabaseStorage implements IStorage {
  async getTenants(): Promise<Tenant[]> {
    return db.select().from(tenants).orderBy(asc(tenants.name));
  }

  async getTenant(id: number): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id));
    return tenant;
  }

  async getTenantBySlug(slug: string): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug));
    return tenant;
  }

  async createTenant(data: InsertTenant): Promise<Tenant> {
    const [tenant] = await db.insert(tenants).values(data).returning();
    return tenant;
  }

  async updateTenant(id: number, data: Partial<InsertTenant>): Promise<Tenant | undefined> {
    const [tenant] = await db
      .update(tenants)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tenants.id, id))
      .returning();
    return tenant;
  }

  async deleteTenant(id: number): Promise<boolean> {
    const result = await db.delete(tenants).where(eq(tenants.id, id)).returning();
    return result.length > 0;
  }

  async getTenantUsers(tenantId: number): Promise<TenantUser[]> {
    return db.select().from(tenantUsers).where(eq(tenantUsers.tenantId, tenantId));
  }

  async getTenantUserByUserId(tenantId: number, userId: string): Promise<TenantUser | undefined> {
    const [tu] = await db
      .select()
      .from(tenantUsers)
      .where(and(eq(tenantUsers.tenantId, tenantId), eq(tenantUsers.userId, userId)));
    return tu;
  }

  async getUserTenants(userId: string): Promise<(TenantUser & { tenant?: Tenant })[]> {
    const results = await db
      .select({
        tenantUser: tenantUsers,
        tenant: tenants,
      })
      .from(tenantUsers)
      .innerJoin(tenants, eq(tenantUsers.tenantId, tenants.id))
      .where(eq(tenantUsers.userId, userId));
    return results.map((r) => ({ ...r.tenantUser, tenant: r.tenant }));
  }

  async createTenantUser(data: InsertTenantUser): Promise<TenantUser> {
    const [tu] = await db.insert(tenantUsers).values(data).returning();
    return tu;
  }

  async updateTenantUserRole(id: number, role: string): Promise<TenantUser | undefined> {
    const [tu] = await db
      .update(tenantUsers)
      .set({ role })
      .where(eq(tenantUsers.id, id))
      .returning();
    return tu;
  }

  async deleteTenantUser(id: number): Promise<boolean> {
    const result = await db.delete(tenantUsers).where(eq(tenantUsers.id, id)).returning();
    return result.length > 0;
  }

  async getLocations(tenantId: number): Promise<Location[]> {
    return db.select().from(locations).where(eq(locations.tenantId, tenantId)).orderBy(asc(locations.name));
  }

  async getLocation(id: number): Promise<Location | undefined> {
    const [location] = await db.select().from(locations).where(eq(locations.id, id));
    return location;
  }

  async createLocation(data: InsertLocation): Promise<Location> {
    const [location] = await db.insert(locations).values(data).returning();
    return location;
  }

  async updateLocation(id: number, data: Partial<InsertLocation>): Promise<Location | undefined> {
    const [location] = await db
      .update(locations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(locations.id, id))
      .returning();
    return location;
  }

  async deleteLocation(id: number): Promise<boolean> {
    const result = await db.delete(locations).where(eq(locations.id, id)).returning();
    return result.length > 0;
  }

  async getMetricDefinitions(tenantId: number): Promise<MetricDefinition[]> {
    return db
      .select()
      .from(metricDefinitions)
      .where(eq(metricDefinitions.tenantId, tenantId))
      .orderBy(asc(metricDefinitions.name));
  }

  async getMetricDefinition(id: number): Promise<MetricDefinition | undefined> {
    const [metric] = await db.select().from(metricDefinitions).where(eq(metricDefinitions.id, id));
    return metric;
  }

  async createMetricDefinition(data: InsertMetricDefinition): Promise<MetricDefinition> {
    const [metric] = await db.insert(metricDefinitions).values(data).returning();
    return metric;
  }

  async updateMetricDefinition(
    id: number,
    data: Partial<InsertMetricDefinition>
  ): Promise<MetricDefinition | undefined> {
    const [metric] = await db
      .update(metricDefinitions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(metricDefinitions.id, id))
      .returning();
    return metric;
  }

  async deleteMetricDefinition(id: number): Promise<boolean> {
    const result = await db
      .delete(metricDefinitions)
      .where(eq(metricDefinitions.id, id))
      .returning();
    return result.length > 0;
  }

  async getMetricThresholds(metricDefinitionId: number): Promise<MetricThreshold[]> {
    return db
      .select()
      .from(metricThresholds)
      .where(eq(metricThresholds.metricDefinitionId, metricDefinitionId))
      .orderBy(asc(metricThresholds.minValue));
  }

  async createMetricThreshold(data: InsertMetricThreshold): Promise<MetricThreshold> {
    const [threshold] = await db.insert(metricThresholds).values(data).returning();
    return threshold;
  }

  async updateMetricThreshold(
    id: number,
    data: Partial<InsertMetricThreshold>
  ): Promise<MetricThreshold | undefined> {
    const [threshold] = await db
      .update(metricThresholds)
      .set(data)
      .where(eq(metricThresholds.id, id))
      .returning();
    return threshold;
  }

  async deleteMetricThreshold(id: number): Promise<boolean> {
    const result = await db.delete(metricThresholds).where(eq(metricThresholds.id, id)).returning();
    return result.length > 0;
  }

  async deleteMetricThresholdsByMetric(metricDefinitionId: number): Promise<boolean> {
    await db
      .delete(metricThresholds)
      .where(eq(metricThresholds.metricDefinitionId, metricDefinitionId));
    return true;
  }

  async getScorecardTemplates(tenantId: number): Promise<ScorecardTemplate[]> {
    return db
      .select()
      .from(scorecardTemplates)
      .where(eq(scorecardTemplates.tenantId, tenantId))
      .orderBy(asc(scorecardTemplates.name));
  }

  async getScorecardTemplate(id: number): Promise<ScorecardTemplate | undefined> {
    const [template] = await db
      .select()
      .from(scorecardTemplates)
      .where(eq(scorecardTemplates.id, id));
    return template;
  }

  async createScorecardTemplate(data: InsertScorecardTemplate): Promise<ScorecardTemplate> {
    const [template] = await db.insert(scorecardTemplates).values(data).returning();
    return template;
  }

  async updateScorecardTemplate(
    id: number,
    data: Partial<InsertScorecardTemplate>
  ): Promise<ScorecardTemplate | undefined> {
    const [template] = await db
      .update(scorecardTemplates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(scorecardTemplates.id, id))
      .returning();
    return template;
  }

  async deleteScorecardTemplate(id: number): Promise<boolean> {
    const result = await db
      .delete(scorecardTemplates)
      .where(eq(scorecardTemplates.id, id))
      .returning();
    return result.length > 0;
  }

  async getScorecardMetrics(scorecardTemplateId: number): Promise<ScorecardMetric[]> {
    return db
      .select()
      .from(scorecardMetrics)
      .where(eq(scorecardMetrics.scorecardTemplateId, scorecardTemplateId));
  }

  async createScorecardMetric(data: InsertScorecardMetric): Promise<ScorecardMetric> {
    const [sm] = await db.insert(scorecardMetrics).values(data).returning();
    return sm;
  }

  async updateScorecardMetric(
    id: number,
    data: Partial<InsertScorecardMetric>
  ): Promise<ScorecardMetric | undefined> {
    const [sm] = await db
      .update(scorecardMetrics)
      .set(data)
      .where(eq(scorecardMetrics.id, id))
      .returning();
    return sm;
  }

  async deleteScorecardMetric(id: number): Promise<boolean> {
    const result = await db.delete(scorecardMetrics).where(eq(scorecardMetrics.id, id)).returning();
    return result.length > 0;
  }

  async deleteScorecardMetricsByTemplate(scorecardTemplateId: number): Promise<boolean> {
    await db
      .delete(scorecardMetrics)
      .where(eq(scorecardMetrics.scorecardTemplateId, scorecardTemplateId));
    return true;
  }

  async getScoreRuns(scorecardTemplateId: number): Promise<ScoreRun[]> {
    return db
      .select()
      .from(scoreRuns)
      .where(eq(scoreRuns.scorecardTemplateId, scorecardTemplateId))
      .orderBy(desc(scoreRuns.createdAt));
  }

  async getScoreRun(id: number): Promise<ScoreRun | undefined> {
    const [run] = await db.select().from(scoreRuns).where(eq(scoreRuns.id, id));
    return run;
  }

  async createScoreRun(data: any): Promise<ScoreRun> {
    const [run] = await db.insert(scoreRuns).values(data).returning();
    return run;
  }

  async getScoreRunDetails(scoreRunId: number): Promise<ScoreRunDetail[]> {
    return db
      .select()
      .from(scoreRunDetails)
      .where(eq(scoreRunDetails.scoreRunId, scoreRunId));
  }

  async updateScoreRun(id: number, data: { totalScore: number; band: string }): Promise<ScoreRun | undefined> {
    const [run] = await db
      .update(scoreRuns)
      .set(data)
      .where(eq(scoreRuns.id, id))
      .returning();
    return run;
  }

  async createScoreRunDetail(data: any): Promise<ScoreRunDetail> {
    const [detail] = await db.insert(scoreRunDetails).values(data).returning();
    return detail;
  }

  async getMetricValues(metricDefinitionId: number, locationId: number): Promise<MetricValue[]> {
    return db
      .select()
      .from(metricValues)
      .where(
        and(
          eq(metricValues.metricDefinitionId, metricDefinitionId),
          eq(metricValues.locationId, locationId)
        )
      )
      .orderBy(asc(metricValues.periodStart));
  }

  async getMetricValueForPeriod(
    metricDefinitionId: number,
    locationId: number,
    periodStart: Date,
    periodEnd: Date
  ): Promise<MetricValue | undefined> {
    const [value] = await db
      .select()
      .from(metricValues)
      .where(
        and(
          eq(metricValues.metricDefinitionId, metricDefinitionId),
          eq(metricValues.locationId, locationId),
          gte(metricValues.periodStart, periodStart),
          lte(metricValues.periodEnd, periodEnd)
        )
      );
    return value;
  }

  async createMetricValue(data: InsertMetricValue): Promise<MetricValue> {
    const [value] = await db.insert(metricValues).values(data).returning();
    return value;
  }

  async getMetricTrends(
    metricDefinitionId: number,
    locationId: number,
    period: string,
    startDate: Date,
    endDate: Date
  ): Promise<MetricValue[]> {
    return db
      .select()
      .from(metricValues)
      .where(
        and(
          eq(metricValues.metricDefinitionId, metricDefinitionId),
          eq(metricValues.locationId, locationId),
          eq(metricValues.period, period),
          gte(metricValues.periodStart, startDate),
          lte(metricValues.periodEnd, endDate)
        )
      )
      .orderBy(asc(metricValues.periodStart));
  }
}

export const storage = new DatabaseStorage();
