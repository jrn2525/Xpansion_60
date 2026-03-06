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
  importJobs,
  importRowErrors,
  alertRules,
  alertEvents,
  reports,
  reportRuns,
  auditLogs,
  notificationSettings,
  notificationDeliveries,
  schedulerRuns,
  metricForecasts,
  metricAnomalies,
  dataQualityRules,
  dataQualityViolations,
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
  type ImportJob,
  type InsertImportJob,
  type ImportRowError,
  type InsertImportRowError,
  type AlertRule,
  type InsertAlertRule,
  type AlertEvent,
  type InsertAlertEvent,
  type Report,
  type InsertReport,
  type ReportRun,
  type InsertReportRun,
  type AuditLog,
  type InsertAuditLog,
  type NotificationSetting,
  type InsertNotificationSetting,
  type NotificationDelivery,
  type InsertNotificationDelivery,
  type SchedulerRun,
  type InsertSchedulerRun,
  type MetricForecast,
  type InsertMetricForecast,
  type MetricAnomaly,
  type InsertMetricAnomaly,
  type DataQualityRule,
  type InsertDataQualityRule,
  type DataQualityViolation,
  type InsertDataQualityViolation,
  actions,
  actionCheckins,
  opportunities,
  goals,
  playbooks,
  playbookSteps,
  playbookApplications,
  digests,
  type Action,
  type InsertAction,
  type ActionCheckin,
  type InsertActionCheckin,
  type Opportunity,
  type InsertOpportunity,
  type Goal,
  type InsertGoal,
  type Playbook,
  type InsertPlaybook,
  type PlaybookStep,
  type InsertPlaybookStep,
  type PlaybookApplication,
  type InsertPlaybookApplication,
  type Digest,
  type InsertDigest,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc, gte, lte, lt, inArray, isNull, sql } from "drizzle-orm";

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

  createImportJob(data: InsertImportJob): Promise<ImportJob>;
  getImportJob(id: number): Promise<ImportJob | undefined>;
  getImportJobs(tenantId: number): Promise<ImportJob[]>;
  updateImportJob(id: number, data: Partial<ImportJob>): Promise<ImportJob | undefined>;
  createImportRowError(data: InsertImportRowError): Promise<ImportRowError>;
  getImportRowErrors(importJobId: number): Promise<ImportRowError[]>;

  createAlertRule(data: InsertAlertRule): Promise<AlertRule>;
  getAlertRule(id: number): Promise<AlertRule | undefined>;
  getAlertRules(tenantId: number): Promise<AlertRule[]>;
  updateAlertRule(id: number, data: Partial<InsertAlertRule>): Promise<AlertRule | undefined>;
  deleteAlertRule(id: number): Promise<boolean>;
  createAlertEvent(data: InsertAlertEvent): Promise<AlertEvent>;
  getAlertEvent(id: number): Promise<AlertEvent | undefined>;
  getAlertEvents(tenantId: number, filters?: { status?: string; severity?: string; locationId?: number }): Promise<AlertEvent[]>;
  updateAlertEvent(id: number, data: Partial<AlertEvent>): Promise<AlertEvent | undefined>;

  createReport(data: InsertReport): Promise<Report>;
  getReport(id: number): Promise<Report | undefined>;
  getReports(tenantId: number): Promise<Report[]>;
  updateReport(id: number, data: Partial<InsertReport>): Promise<Report | undefined>;
  deleteReport(id: number): Promise<boolean>;
  createReportRun(data: InsertReportRun): Promise<ReportRun>;
  getReportRun(id: number): Promise<ReportRun | undefined>;
  getReportRuns(reportId: number): Promise<ReportRun[]>;
  updateReportRun(id: number, data: Partial<ReportRun>): Promise<ReportRun | undefined>;

  createAuditLog(data: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(tenantId: number, filters?: { entityType?: string; actorUserId?: string; start?: Date; end?: Date }): Promise<AuditLog[]>;

  getNotificationSettings(tenantId: number): Promise<NotificationSetting | undefined>;
  upsertNotificationSettings(tenantId: number, data: Partial<InsertNotificationSetting>): Promise<NotificationSetting>;
  createNotificationDelivery(data: InsertNotificationDelivery): Promise<NotificationDelivery>;
  getNotificationDeliveries(tenantId: number): Promise<NotificationDelivery[]>;
  updateNotificationDelivery(id: number, data: Partial<NotificationDelivery>): Promise<NotificationDelivery | undefined>;

  createSchedulerRun(data: InsertSchedulerRun): Promise<SchedulerRun>;
  getSchedulerRuns(tenantId: number | null): Promise<SchedulerRun[]>;
  getLatestSchedulerRun(jobKey: string): Promise<SchedulerRun | undefined>;
  updateSchedulerRun(id: number, data: Partial<SchedulerRun>): Promise<SchedulerRun | undefined>;

  createMetricForecast(data: InsertMetricForecast): Promise<MetricForecast>;
  getMetricForecasts(metricDefinitionId: number, locationId: number): Promise<MetricForecast[]>;
  deleteMetricForecasts(metricDefinitionId: number, locationId: number): Promise<boolean>;

  createMetricAnomaly(data: InsertMetricAnomaly): Promise<MetricAnomaly>;
  getMetricAnomalies(metricDefinitionId: number, locationId: number): Promise<MetricAnomaly[]>;
  getMetricAnomaliesByTenant(tenantId: number): Promise<MetricAnomaly[]>;

  getDataQualityRules(tenantId: number): Promise<DataQualityRule[]>;
  getDataQualityRule(id: number): Promise<DataQualityRule | undefined>;
  createDataQualityRule(data: InsertDataQualityRule): Promise<DataQualityRule>;
  updateDataQualityRule(id: number, data: Partial<InsertDataQualityRule>): Promise<DataQualityRule | undefined>;
  deleteDataQualityRule(id: number): Promise<boolean>;
  createDataQualityViolation(data: InsertDataQualityViolation): Promise<DataQualityViolation>;
  getDataQualityViolations(tenantId: number, filters?: { ruleId?: number; locationId?: number; importJobId?: number }): Promise<DataQualityViolation[]>;

  getActions(tenantId: number, filters?: { status?: string; ownerUserId?: string; locationId?: number; overdue?: boolean }): Promise<Action[]>;
  getAction(id: number): Promise<Action | undefined>;
  createAction(data: InsertAction): Promise<Action>;
  updateAction(id: number, data: Partial<InsertAction>): Promise<Action | undefined>;
  getActionCheckins(actionId: number): Promise<ActionCheckin[]>;
  createActionCheckin(data: InsertActionCheckin): Promise<ActionCheckin>;

  getOpportunities(tenantId: number): Promise<Opportunity[]>;
  getOpportunity(id: number): Promise<Opportunity | undefined>;
  createOpportunity(data: InsertOpportunity): Promise<Opportunity>;
  updateOpportunity(id: number, data: Partial<InsertOpportunity>): Promise<Opportunity | undefined>;

  getGoals(tenantId: number, filters?: { locationId?: number; metricDefinitionId?: number; status?: string }): Promise<Goal[]>;
  getGoal(id: number): Promise<Goal | undefined>;
  createGoal(data: InsertGoal): Promise<Goal>;
  updateGoal(id: number, data: Partial<Goal>): Promise<Goal | undefined>;

  getPlaybooks(tenantId: number): Promise<Playbook[]>;
  getPlaybook(id: number): Promise<Playbook | undefined>;
  createPlaybook(data: InsertPlaybook): Promise<Playbook>;
  updatePlaybook(id: number, data: Partial<InsertPlaybook>): Promise<Playbook | undefined>;
  deletePlaybook(id: number): Promise<boolean>;
  getPlaybookSteps(playbookId: number): Promise<PlaybookStep[]>;
  createPlaybookStep(data: InsertPlaybookStep): Promise<PlaybookStep>;
  deletePlaybookSteps(playbookId: number): Promise<boolean>;
  getPlaybookApplications(tenantId: number): Promise<PlaybookApplication[]>;
  createPlaybookApplication(data: InsertPlaybookApplication): Promise<PlaybookApplication>;

  getDigests(tenantId: number): Promise<Digest[]>;
  createDigest(data: InsertDigest): Promise<Digest>;
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

  async createImportJob(data: InsertImportJob): Promise<ImportJob> {
    const [job] = await db.insert(importJobs).values(data).returning();
    return job;
  }

  async getImportJob(id: number): Promise<ImportJob | undefined> {
    const [job] = await db.select().from(importJobs).where(eq(importJobs.id, id));
    return job;
  }

  async getImportJobs(tenantId: number): Promise<ImportJob[]> {
    return db.select().from(importJobs).where(eq(importJobs.tenantId, tenantId)).orderBy(desc(importJobs.createdAt));
  }

  async updateImportJob(id: number, data: Partial<ImportJob>): Promise<ImportJob | undefined> {
    const [job] = await db.update(importJobs).set({ ...data, updatedAt: new Date() }).where(eq(importJobs.id, id)).returning();
    return job;
  }

  async createImportRowError(data: InsertImportRowError): Promise<ImportRowError> {
    const [err] = await db.insert(importRowErrors).values(data).returning();
    return err;
  }

  async getImportRowErrors(importJobId: number): Promise<ImportRowError[]> {
    return db.select().from(importRowErrors).where(eq(importRowErrors.importJobId, importJobId)).orderBy(asc(importRowErrors.rowNumber));
  }

  async createAlertRule(data: InsertAlertRule): Promise<AlertRule> {
    const [rule] = await db.insert(alertRules).values(data).returning();
    return rule;
  }

  async getAlertRule(id: number): Promise<AlertRule | undefined> {
    const [rule] = await db.select().from(alertRules).where(eq(alertRules.id, id));
    return rule;
  }

  async getAlertRules(tenantId: number): Promise<AlertRule[]> {
    return db.select().from(alertRules).where(eq(alertRules.tenantId, tenantId)).orderBy(desc(alertRules.createdAt));
  }

  async updateAlertRule(id: number, data: Partial<InsertAlertRule>): Promise<AlertRule | undefined> {
    const [rule] = await db.update(alertRules).set({ ...data, updatedAt: new Date() }).where(eq(alertRules.id, id)).returning();
    return rule;
  }

  async deleteAlertRule(id: number): Promise<boolean> {
    const result = await db.delete(alertRules).where(eq(alertRules.id, id)).returning();
    return result.length > 0;
  }

  async createAlertEvent(data: InsertAlertEvent): Promise<AlertEvent> {
    const [event] = await db.insert(alertEvents).values(data).returning();
    return event;
  }

  async getAlertEvent(id: number): Promise<AlertEvent | undefined> {
    const [event] = await db.select().from(alertEvents).where(eq(alertEvents.id, id));
    return event;
  }

  async getAlertEvents(tenantId: number, filters?: { status?: string; severity?: string; locationId?: number }): Promise<AlertEvent[]> {
    const conditions = [eq(alertEvents.tenantId, tenantId)];
    if (filters?.status) conditions.push(eq(alertEvents.status, filters.status));
    if (filters?.severity) conditions.push(eq(alertEvents.severity, filters.severity));
    if (filters?.locationId) conditions.push(eq(alertEvents.locationId, filters.locationId));
    return db.select().from(alertEvents).where(and(...conditions)).orderBy(desc(alertEvents.createdAt));
  }

  async updateAlertEvent(id: number, data: Partial<AlertEvent>): Promise<AlertEvent | undefined> {
    const [event] = await db.update(alertEvents).set(data).where(eq(alertEvents.id, id)).returning();
    return event;
  }

  async createReport(data: InsertReport): Promise<Report> {
    const [report] = await db.insert(reports).values(data).returning();
    return report;
  }

  async getReport(id: number): Promise<Report | undefined> {
    const [report] = await db.select().from(reports).where(eq(reports.id, id));
    return report;
  }

  async getReports(tenantId: number): Promise<Report[]> {
    return db.select().from(reports).where(eq(reports.tenantId, tenantId)).orderBy(desc(reports.createdAt));
  }

  async updateReport(id: number, data: Partial<InsertReport>): Promise<Report | undefined> {
    const [report] = await db.update(reports).set({ ...data, updatedAt: new Date() }).where(eq(reports.id, id)).returning();
    return report;
  }

  async deleteReport(id: number): Promise<boolean> {
    const result = await db.delete(reports).where(eq(reports.id, id)).returning();
    return result.length > 0;
  }

  async createReportRun(data: InsertReportRun): Promise<ReportRun> {
    const [run] = await db.insert(reportRuns).values(data).returning();
    return run;
  }

  async getReportRun(id: number): Promise<ReportRun | undefined> {
    const [run] = await db.select().from(reportRuns).where(eq(reportRuns.id, id));
    return run;
  }

  async getReportRuns(reportId: number): Promise<ReportRun[]> {
    return db.select().from(reportRuns).where(eq(reportRuns.reportId, reportId)).orderBy(desc(reportRuns.createdAt));
  }

  async updateReportRun(id: number, data: Partial<ReportRun>): Promise<ReportRun | undefined> {
    const [run] = await db.update(reportRuns).set(data).where(eq(reportRuns.id, id)).returning();
    return run;
  }

  async createAuditLog(data: InsertAuditLog): Promise<AuditLog> {
    const [log] = await db.insert(auditLogs).values(data).returning();
    return log;
  }

  async getAuditLogs(tenantId: number, filters?: { entityType?: string; actorUserId?: string; start?: Date; end?: Date }): Promise<AuditLog[]> {
    const conditions = [eq(auditLogs.tenantId, tenantId)];
    if (filters?.entityType) conditions.push(eq(auditLogs.entityType, filters.entityType));
    if (filters?.actorUserId) conditions.push(eq(auditLogs.actorUserId, filters.actorUserId));
    if (filters?.start) conditions.push(gte(auditLogs.createdAt, filters.start));
    if (filters?.end) conditions.push(lte(auditLogs.createdAt, filters.end));
    return db.select().from(auditLogs).where(and(...conditions)).orderBy(desc(auditLogs.createdAt));
  }

  async getNotificationSettings(tenantId: number): Promise<NotificationSetting | undefined> {
    const [settings] = await db.select().from(notificationSettings).where(eq(notificationSettings.tenantId, tenantId));
    return settings;
  }

  async upsertNotificationSettings(tenantId: number, data: Partial<InsertNotificationSetting>): Promise<NotificationSetting> {
    const existing = await this.getNotificationSettings(tenantId);
    if (existing) {
      const [updated] = await db.update(notificationSettings).set({ ...data, updatedAt: new Date() }).where(eq(notificationSettings.id, existing.id)).returning();
      return updated;
    }
    const [created] = await db.insert(notificationSettings).values({ ...data, tenantId } as InsertNotificationSetting).returning();
    return created;
  }

  async createNotificationDelivery(data: InsertNotificationDelivery): Promise<NotificationDelivery> {
    const [delivery] = await db.insert(notificationDeliveries).values(data).returning();
    return delivery;
  }

  async getNotificationDeliveries(tenantId: number): Promise<NotificationDelivery[]> {
    return db.select().from(notificationDeliveries).where(eq(notificationDeliveries.tenantId, tenantId)).orderBy(desc(notificationDeliveries.createdAt)).limit(100);
  }

  async updateNotificationDelivery(id: number, data: Partial<NotificationDelivery>): Promise<NotificationDelivery | undefined> {
    const [delivery] = await db.update(notificationDeliveries).set(data).where(eq(notificationDeliveries.id, id)).returning();
    return delivery;
  }

  async createSchedulerRun(data: InsertSchedulerRun): Promise<SchedulerRun> {
    const [run] = await db.insert(schedulerRuns).values(data).returning();
    return run;
  }

  async getSchedulerRuns(tenantId: number | null): Promise<SchedulerRun[]> {
    if (tenantId) {
      return db.select().from(schedulerRuns).where(eq(schedulerRuns.tenantId, tenantId)).orderBy(desc(schedulerRuns.createdAt)).limit(50);
    }
    return db.select().from(schedulerRuns).orderBy(desc(schedulerRuns.createdAt)).limit(50);
  }

  async getLatestSchedulerRun(jobKey: string): Promise<SchedulerRun | undefined> {
    const [run] = await db.select().from(schedulerRuns).where(eq(schedulerRuns.jobKey, jobKey)).orderBy(desc(schedulerRuns.createdAt)).limit(1);
    return run;
  }

  async updateSchedulerRun(id: number, data: Partial<SchedulerRun>): Promise<SchedulerRun | undefined> {
    const [run] = await db.update(schedulerRuns).set(data).where(eq(schedulerRuns.id, id)).returning();
    return run;
  }

  async createMetricForecast(data: InsertMetricForecast): Promise<MetricForecast> {
    const [forecast] = await db.insert(metricForecasts).values(data).returning();
    return forecast;
  }

  async getMetricForecasts(metricDefinitionId: number, locationId: number): Promise<MetricForecast[]> {
    return db.select().from(metricForecasts).where(and(eq(metricForecasts.metricDefinitionId, metricDefinitionId), eq(metricForecasts.locationId, locationId))).orderBy(asc(metricForecasts.periodStart));
  }

  async deleteMetricForecasts(metricDefinitionId: number, locationId: number): Promise<boolean> {
    const result = await db.delete(metricForecasts).where(and(eq(metricForecasts.metricDefinitionId, metricDefinitionId), eq(metricForecasts.locationId, locationId))).returning();
    return result.length >= 0;
  }

  async createMetricAnomaly(data: InsertMetricAnomaly): Promise<MetricAnomaly> {
    const [anomaly] = await db.insert(metricAnomalies).values(data).returning();
    return anomaly;
  }

  async getMetricAnomalies(metricDefinitionId: number, locationId: number): Promise<MetricAnomaly[]> {
    return db.select().from(metricAnomalies).where(and(eq(metricAnomalies.metricDefinitionId, metricDefinitionId), eq(metricAnomalies.locationId, locationId))).orderBy(desc(metricAnomalies.createdAt));
  }

  async getMetricAnomaliesByTenant(tenantId: number): Promise<MetricAnomaly[]> {
    const metrics = await this.getMetricDefinitions(tenantId);
    if (metrics.length === 0) return [];
    const metricIds = metrics.map(m => m.id);
    const results: MetricAnomaly[] = [];
    for (const mId of metricIds) {
      const anomalies = await db.select().from(metricAnomalies).where(eq(metricAnomalies.metricDefinitionId, mId)).orderBy(desc(metricAnomalies.createdAt)).limit(20);
      results.push(...anomalies);
    }
    return results.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  }

  async getDataQualityRules(tenantId: number): Promise<DataQualityRule[]> {
    return db.select().from(dataQualityRules).where(eq(dataQualityRules.tenantId, tenantId)).orderBy(asc(dataQualityRules.ruleName));
  }

  async getDataQualityRule(id: number): Promise<DataQualityRule | undefined> {
    const [rule] = await db.select().from(dataQualityRules).where(eq(dataQualityRules.id, id));
    return rule;
  }

  async createDataQualityRule(data: InsertDataQualityRule): Promise<DataQualityRule> {
    const [rule] = await db.insert(dataQualityRules).values(data).returning();
    return rule;
  }

  async updateDataQualityRule(id: number, data: Partial<InsertDataQualityRule>): Promise<DataQualityRule | undefined> {
    const [rule] = await db.update(dataQualityRules).set({ ...data, updatedAt: new Date() }).where(eq(dataQualityRules.id, id)).returning();
    return rule;
  }

  async deleteDataQualityRule(id: number): Promise<boolean> {
    const result = await db.delete(dataQualityRules).where(eq(dataQualityRules.id, id)).returning();
    return result.length > 0;
  }

  async createDataQualityViolation(data: InsertDataQualityViolation): Promise<DataQualityViolation> {
    const [violation] = await db.insert(dataQualityViolations).values(data).returning();
    return violation;
  }

  async getDataQualityViolations(tenantId: number, filters?: { ruleId?: number; locationId?: number; importJobId?: number }): Promise<DataQualityViolation[]> {
    const conditions = [eq(dataQualityViolations.tenantId, tenantId)];
    if (filters?.ruleId) conditions.push(eq(dataQualityViolations.ruleId, filters.ruleId));
    if (filters?.locationId) conditions.push(eq(dataQualityViolations.locationId, filters.locationId));
    if (filters?.importJobId) conditions.push(eq(dataQualityViolations.importJobId, filters.importJobId));
    return db.select().from(dataQualityViolations).where(and(...conditions)).orderBy(desc(dataQualityViolations.createdAt)).limit(200);
  }

  // ── Phase 5: Growth Operating System ──

  async getActions(tenantId: number, filters?: { status?: string; ownerUserId?: string; locationId?: number; overdue?: boolean }): Promise<Action[]> {
    const conditions: any[] = [eq(actions.tenantId, tenantId)];
    if (filters?.status) conditions.push(eq(actions.status, filters.status));
    if (filters?.ownerUserId) conditions.push(eq(actions.ownerUserId, filters.ownerUserId));
    if (filters?.locationId) conditions.push(eq(actions.locationId, filters.locationId));
    if (filters?.overdue) conditions.push(lt(actions.dueDate, new Date()), sql`${actions.status} NOT IN ('done')`);
    return db.select().from(actions).where(and(...conditions)).orderBy(desc(actions.createdAt));
  }

  async getAction(id: number): Promise<Action | undefined> {
    const [action] = await db.select().from(actions).where(eq(actions.id, id));
    return action;
  }

  async createAction(data: InsertAction): Promise<Action> {
    const [action] = await db.insert(actions).values(data).returning();
    return action;
  }

  async updateAction(id: number, data: Partial<InsertAction>): Promise<Action | undefined> {
    const [action] = await db.update(actions).set({ ...data, updatedAt: new Date() }).where(eq(actions.id, id)).returning();
    return action;
  }

  async getActionCheckins(actionId: number): Promise<ActionCheckin[]> {
    return db.select().from(actionCheckins).where(eq(actionCheckins.actionId, actionId)).orderBy(desc(actionCheckins.createdAt));
  }

  async createActionCheckin(data: InsertActionCheckin): Promise<ActionCheckin> {
    const [checkin] = await db.insert(actionCheckins).values(data).returning();
    return checkin;
  }

  async getOpportunities(tenantId: number): Promise<Opportunity[]> {
    return db.select().from(opportunities).where(eq(opportunities.tenantId, tenantId)).orderBy(desc(opportunities.createdAt));
  }

  async getOpportunity(id: number): Promise<Opportunity | undefined> {
    const [opp] = await db.select().from(opportunities).where(eq(opportunities.id, id));
    return opp;
  }

  async createOpportunity(data: InsertOpportunity): Promise<Opportunity> {
    const [opp] = await db.insert(opportunities).values(data).returning();
    return opp;
  }

  async updateOpportunity(id: number, data: Partial<InsertOpportunity>): Promise<Opportunity | undefined> {
    const [opp] = await db.update(opportunities).set(data).where(eq(opportunities.id, id)).returning();
    return opp;
  }

  async getGoals(tenantId: number, filters?: { locationId?: number; metricDefinitionId?: number; status?: string }): Promise<Goal[]> {
    const conditions: any[] = [eq(goals.tenantId, tenantId)];
    if (filters?.locationId) conditions.push(eq(goals.locationId, filters.locationId));
    if (filters?.metricDefinitionId) conditions.push(eq(goals.metricDefinitionId, filters.metricDefinitionId));
    if (filters?.status) conditions.push(eq(goals.status, filters.status));
    return db.select().from(goals).where(and(...conditions)).orderBy(desc(goals.createdAt));
  }

  async getGoal(id: number): Promise<Goal | undefined> {
    const [goal] = await db.select().from(goals).where(eq(goals.id, id));
    return goal;
  }

  async createGoal(data: InsertGoal): Promise<Goal> {
    const [goal] = await db.insert(goals).values(data).returning();
    return goal;
  }

  async updateGoal(id: number, data: Partial<Goal>): Promise<Goal | undefined> {
    const [goal] = await db.update(goals).set({ ...data, updatedAt: new Date() }).where(eq(goals.id, id)).returning();
    return goal;
  }

  async getPlaybooks(tenantId: number): Promise<Playbook[]> {
    return db.select().from(playbooks).where(eq(playbooks.tenantId, tenantId)).orderBy(asc(playbooks.name));
  }

  async getPlaybook(id: number): Promise<Playbook | undefined> {
    const [pb] = await db.select().from(playbooks).where(eq(playbooks.id, id));
    return pb;
  }

  async createPlaybook(data: InsertPlaybook): Promise<Playbook> {
    const [pb] = await db.insert(playbooks).values(data).returning();
    return pb;
  }

  async updatePlaybook(id: number, data: Partial<InsertPlaybook>): Promise<Playbook | undefined> {
    const [pb] = await db.update(playbooks).set({ ...data, updatedAt: new Date() }).where(eq(playbooks.id, id)).returning();
    return pb;
  }

  async deletePlaybook(id: number): Promise<boolean> {
    const result = await db.delete(playbooks).where(eq(playbooks.id, id)).returning();
    return result.length > 0;
  }

  async getPlaybookSteps(playbookId: number): Promise<PlaybookStep[]> {
    return db.select().from(playbookSteps).where(eq(playbookSteps.playbookId, playbookId)).orderBy(asc(playbookSteps.stepOrder));
  }

  async createPlaybookStep(data: InsertPlaybookStep): Promise<PlaybookStep> {
    const [step] = await db.insert(playbookSteps).values(data).returning();
    return step;
  }

  async deletePlaybookSteps(playbookId: number): Promise<boolean> {
    await db.delete(playbookSteps).where(eq(playbookSteps.playbookId, playbookId));
    return true;
  }

  async getPlaybookApplications(tenantId: number): Promise<PlaybookApplication[]> {
    return db.select().from(playbookApplications).where(eq(playbookApplications.tenantId, tenantId)).orderBy(desc(playbookApplications.createdAt));
  }

  async createPlaybookApplication(data: InsertPlaybookApplication): Promise<PlaybookApplication> {
    const [app] = await db.insert(playbookApplications).values(data).returning();
    return app;
  }

  async getDigests(tenantId: number): Promise<Digest[]> {
    return db.select().from(digests).where(eq(digests.tenantId, tenantId)).orderBy(desc(digests.createdAt)).limit(50);
  }

  async createDigest(data: InsertDigest): Promise<Digest> {
    const [digest] = await db.insert(digests).values(data).returning();
    return digest;
  }
}

export const storage = new DatabaseStorage();
