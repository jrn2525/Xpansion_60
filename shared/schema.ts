export * from "./models/auth";

import { sql, relations } from "drizzle-orm";
import {
  pgTable,
  varchar,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  real,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./models/auth";

export const tenants = pgTable("tenants", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  type: varchar("type", { length: 50 }).notNull().default("single_location"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const tenantsRelations = relations(tenants, ({ many }) => ({
  tenantUsers: many(tenantUsers),
  locations: many(locations),
  metricDefinitions: many(metricDefinitions),
  scorecardTemplates: many(scorecardTemplates),
}));

export const tenantUsers = pgTable(
  "tenant_users",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 50 }).notNull().default("viewer"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    uniqueIndex("tenant_user_unique").on(table.tenantId, table.userId),
  ]
);

export const tenantUsersRelations = relations(tenantUsers, ({ one }) => ({
  tenant: one(tenants, {
    fields: [tenantUsers.tenantId],
    references: [tenants.id],
  }),
  user: one(users, {
    fields: [tenantUsers.userId],
    references: [users.id],
  }),
}));

export const locations = pgTable("locations", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  address: text("address"),
  city: varchar("city", { length: 255 }),
  state: varchar("state", { length: 100 }),
  zipCode: varchar("zip_code", { length: 20 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const locationsRelations = relations(locations, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [locations.tenantId],
    references: [tenants.id],
  }),
  metricValues: many(metricValues),
  scoreRuns: many(scoreRuns),
}));

export const metricDefinitions = pgTable("metric_definitions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  dataType: varchar("data_type", { length: 50 }).notNull().default("number"),
  unit: varchar("unit", { length: 50 }),
  direction: varchar("direction", { length: 50 })
    .notNull()
    .default("higher_is_better"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const metricDefinitionsRelations = relations(
  metricDefinitions,
  ({ one, many }) => ({
    tenant: one(tenants, {
      fields: [metricDefinitions.tenantId],
      references: [tenants.id],
    }),
    thresholds: many(metricThresholds),
    scorecardMetrics: many(scorecardMetrics),
    metricValues: many(metricValues),
  })
);

export const metricThresholds = pgTable("metric_thresholds", {
  id: serial("id").primaryKey(),
  metricDefinitionId: integer("metric_definition_id")
    .notNull()
    .references(() => metricDefinitions.id, { onDelete: "cascade" }),
  band: varchar("band", { length: 50 }).notNull(),
  minValue: real("min_value").notNull(),
  maxValue: real("max_value").notNull(),
  color: varchar("color", { length: 20 }).default("#6b7280"),
});

export const metricThresholdsRelations = relations(
  metricThresholds,
  ({ one }) => ({
    metricDefinition: one(metricDefinitions, {
      fields: [metricThresholds.metricDefinitionId],
      references: [metricDefinitions.id],
    }),
  })
);

export const scorecardTemplates = pgTable("scorecard_templates", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const scorecardTemplatesRelations = relations(
  scorecardTemplates,
  ({ one, many }) => ({
    tenant: one(tenants, {
      fields: [scorecardTemplates.tenantId],
      references: [tenants.id],
    }),
    metrics: many(scorecardMetrics),
    scoreRuns: many(scoreRuns),
  })
);

export const scorecardMetrics = pgTable("scorecard_metrics", {
  id: serial("id").primaryKey(),
  scorecardTemplateId: integer("scorecard_template_id")
    .notNull()
    .references(() => scorecardTemplates.id, { onDelete: "cascade" }),
  metricDefinitionId: integer("metric_definition_id")
    .notNull()
    .references(() => metricDefinitions.id, { onDelete: "cascade" }),
  weight: real("weight").notNull(),
});

export const scorecardMetricsRelations = relations(
  scorecardMetrics,
  ({ one }) => ({
    scorecardTemplate: one(scorecardTemplates, {
      fields: [scorecardMetrics.scorecardTemplateId],
      references: [scorecardTemplates.id],
    }),
    metricDefinition: one(metricDefinitions, {
      fields: [scorecardMetrics.metricDefinitionId],
      references: [metricDefinitions.id],
    }),
  })
);

export const scoreRuns = pgTable("score_runs", {
  id: serial("id").primaryKey(),
  scorecardTemplateId: integer("scorecard_template_id")
    .notNull()
    .references(() => scorecardTemplates.id, { onDelete: "cascade" }),
  locationId: integer("location_id")
    .notNull()
    .references(() => locations.id, { onDelete: "cascade" }),
  period: varchar("period", { length: 50 }).notNull(),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  totalScore: real("total_score"),
  band: varchar("band", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const scoreRunsRelations = relations(scoreRuns, ({ one, many }) => ({
  scorecardTemplate: one(scorecardTemplates, {
    fields: [scoreRuns.scorecardTemplateId],
    references: [scorecardTemplates.id],
  }),
  location: one(locations, {
    fields: [scoreRuns.locationId],
    references: [locations.id],
  }),
  details: many(scoreRunDetails),
}));

export const scoreRunDetails = pgTable("score_run_details", {
  id: serial("id").primaryKey(),
  scoreRunId: integer("score_run_id")
    .notNull()
    .references(() => scoreRuns.id, { onDelete: "cascade" }),
  metricDefinitionId: integer("metric_definition_id")
    .notNull()
    .references(() => metricDefinitions.id, { onDelete: "cascade" }),
  rawValue: real("raw_value"),
  normalizedScore: real("normalized_score"),
  weightedScore: real("weighted_score"),
  band: varchar("band", { length: 50 }),
});

export const scoreRunDetailsRelations = relations(
  scoreRunDetails,
  ({ one }) => ({
    scoreRun: one(scoreRuns, {
      fields: [scoreRunDetails.scoreRunId],
      references: [scoreRuns.id],
    }),
    metricDefinition: one(metricDefinitions, {
      fields: [scoreRunDetails.metricDefinitionId],
      references: [metricDefinitions.id],
    }),
  })
);

export const metricValues = pgTable("metric_values", {
  id: serial("id").primaryKey(),
  metricDefinitionId: integer("metric_definition_id")
    .notNull()
    .references(() => metricDefinitions.id, { onDelete: "cascade" }),
  locationId: integer("location_id")
    .notNull()
    .references(() => locations.id, { onDelete: "cascade" }),
  period: varchar("period", { length: 50 }).notNull(),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  value: real("value").notNull(),
  recordedAt: timestamp("recorded_at").defaultNow(),
});

export const metricValuesRelations = relations(metricValues, ({ one }) => ({
  metricDefinition: one(metricDefinitions, {
    fields: [metricValues.metricDefinitionId],
    references: [metricDefinitions.id],
  }),
  location: one(locations, {
    fields: [metricValues.locationId],
    references: [locations.id],
  }),
}));

export const importJobs = pgTable("import_jobs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  locationId: integer("location_id")
    .notNull()
    .references(() => locations.id, { onDelete: "cascade" }),
  fileName: varchar("file_name", { length: 500 }).notNull(),
  mappingConfig: text("mapping_config").notNull().default("{}"),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  totalRows: integer("total_rows").notNull().default(0),
  successRows: integer("success_rows").notNull().default(0),
  failedRows: integer("failed_rows").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const importRowErrors = pgTable("import_row_errors", {
  id: serial("id").primaryKey(),
  importJobId: integer("import_job_id")
    .notNull()
    .references(() => importJobs.id, { onDelete: "cascade" }),
  rowNumber: integer("row_number").notNull(),
  rawData: text("raw_data").notNull().default("{}"),
  errorMessage: text("error_message").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const alertRules = pgTable("alert_rules", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  severity: varchar("severity", { length: 50 }).notNull().default("medium"),
  conditionJson: text("condition_json").notNull().default("{}"),
  actionJson: text("action_json").notNull().default("{}"),
  isActive: boolean("is_active").notNull().default(true),
  cooldownMinutes: integer("cooldown_minutes").notNull().default(0),
  escalationMinutes: integer("escalation_minutes").notNull().default(0),
  dedupWindowMinutes: integer("dedup_window_minutes").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const alertEvents = pgTable("alert_events", {
  id: serial("id").primaryKey(),
  alertRuleId: integer("alert_rule_id")
    .notNull()
    .references(() => alertRules.id, { onDelete: "cascade" }),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  locationId: integer("location_id").references(() => locations.id),
  metricDefinitionId: integer("metric_definition_id").references(
    () => metricDefinitions.id
  ),
  status: varchar("status", { length: 50 }).notNull().default("open"),
  severity: varchar("severity", { length: 50 }).notNull().default("medium"),
  message: text("message").notNull(),
  detailJson: text("detail_json").notNull().default("{}"),
  acknowledgedBy: varchar("acknowledged_by"),
  acknowledgedAt: timestamp("acknowledged_at"),
  resolvedBy: varchar("resolved_by"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const reports = pgTable("reports", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  reportType: varchar("report_type", { length: 100 }).notNull(),
  configJson: text("config_json").notNull().default("{}"),
  scheduleJson: text("schedule_json").notNull().default("{}"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const reportRuns = pgTable("report_runs", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id")
    .notNull()
    .references(() => reports.id, { onDelete: "cascade" }),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  summaryJson: text("summary_json"),
  outputUrl: varchar("output_url", { length: 500 }),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  actorUserId: varchar("actor_user_id").notNull(),
  entityType: varchar("entity_type", { length: 100 }).notNull(),
  entityId: varchar("entity_id", { length: 100 }).notNull(),
  action: varchar("action", { length: 50 }).notNull(),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const notificationSettings = pgTable("notification_settings", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  emailEnabled: boolean("email_enabled").notNull().default(false),
  slackEnabled: boolean("slack_enabled").notNull().default(false),
  slackWebhookUrl: varchar("slack_webhook_url", { length: 500 }),
  senderEmail: varchar("sender_email", { length: 255 }),
  recipientsJson: text("recipients_json").notNull().default("[]"),
  severityFilterJson: text("severity_filter_json").notNull().default('["critical","high"]'),
  notifyOnAck: boolean("notify_on_ack").notNull().default(false),
  notifyOnResolved: boolean("notify_on_resolved").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const notificationDeliveries = pgTable("notification_deliveries", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  channel: varchar("channel", { length: 50 }).notNull(),
  recipientAddress: varchar("recipient_address", { length: 500 }).notNull(),
  subjectOrTitle: varchar("subject_or_title", { length: 500 }).notNull(),
  bodyPreview: text("body_preview"),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  lastAttemptAt: timestamp("last_attempt_at"),
  errorMessage: text("error_message"),
  relatedEntityType: varchar("related_entity_type", { length: 100 }),
  relatedEntityId: varchar("related_entity_id", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const schedulerRuns = pgTable("scheduler_runs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  jobType: varchar("job_type", { length: 100 }).notNull(),
  jobKey: varchar("job_key", { length: 255 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("running"),
  durationMs: integer("duration_ms"),
  errorSnapshot: text("error_snapshot"),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const metricForecasts = pgTable("metric_forecasts", {
  id: serial("id").primaryKey(),
  metricDefinitionId: integer("metric_definition_id")
    .notNull()
    .references(() => metricDefinitions.id, { onDelete: "cascade" }),
  locationId: integer("location_id")
    .notNull()
    .references(() => locations.id, { onDelete: "cascade" }),
  period: varchar("period", { length: 50 }).notNull(),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  forecastValue: real("forecast_value").notNull(),
  confidenceLow: real("confidence_low").notNull(),
  confidenceHigh: real("confidence_high").notNull(),
  model: varchar("model", { length: 50 }).notNull().default("linear_trend"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const metricAnomalies = pgTable("metric_anomalies", {
  id: serial("id").primaryKey(),
  metricDefinitionId: integer("metric_definition_id")
    .notNull()
    .references(() => metricDefinitions.id, { onDelete: "cascade" }),
  locationId: integer("location_id")
    .notNull()
    .references(() => locations.id, { onDelete: "cascade" }),
  metricValueId: integer("metric_value_id").references(() => metricValues.id, { onDelete: "cascade" }),
  deviationPercent: real("deviation_percent").notNull(),
  baselineValue: real("baseline_value").notNull(),
  actualValue: real("actual_value").notNull(),
  severity: varchar("severity", { length: 50 }).notNull().default("medium"),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const dataQualityRules = pgTable("data_quality_rules", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  ruleName: varchar("rule_name", { length: 255 }).notNull(),
  ruleType: varchar("rule_type", { length: 100 }).notNull(),
  config: text("config").notNull().default("{}"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const dataQualityViolations = pgTable("data_quality_violations", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  ruleId: integer("rule_id")
    .notNull()
    .references(() => dataQualityRules.id, { onDelete: "cascade" }),
  locationId: integer("location_id").references(() => locations.id, { onDelete: "cascade" }),
  metricDefinitionId: integer("metric_definition_id").references(() => metricDefinitions.id, { onDelete: "cascade" }),
  importJobId: integer("import_job_id").references(() => importJobs.id, { onDelete: "set null" }),
  severity: varchar("severity", { length: 50 }).notNull().default("warning"),
  message: text("message").notNull(),
  detailJson: text("detail_json").notNull().default("{}"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTenantSchema = createInsertSchema(tenants).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertTenantUserSchema = createInsertSchema(tenantUsers).omit({
  id: true,
  createdAt: true,
});
export const insertLocationSchema = createInsertSchema(locations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertMetricDefinitionSchema = createInsertSchema(
  metricDefinitions
).omit({ id: true, createdAt: true, updatedAt: true });
export const insertMetricThresholdSchema = createInsertSchema(
  metricThresholds
).omit({ id: true });
export const insertScorecardTemplateSchema = createInsertSchema(
  scorecardTemplates
).omit({ id: true, createdAt: true, updatedAt: true });
export const insertScorecardMetricSchema = createInsertSchema(
  scorecardMetrics
).omit({ id: true });
export const insertScoreRunSchema = createInsertSchema(scoreRuns).omit({
  id: true,
  createdAt: true,
  totalScore: true,
  band: true,
});
export const insertMetricValueSchema = createInsertSchema(metricValues).omit({
  id: true,
  recordedAt: true,
});

export type Tenant = typeof tenants.$inferSelect;
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type TenantUser = typeof tenantUsers.$inferSelect;
export type InsertTenantUser = z.infer<typeof insertTenantUserSchema>;
export type Location = typeof locations.$inferSelect;
export type InsertLocation = z.infer<typeof insertLocationSchema>;
export type MetricDefinition = typeof metricDefinitions.$inferSelect;
export type InsertMetricDefinition = z.infer<
  typeof insertMetricDefinitionSchema
>;
export type MetricThreshold = typeof metricThresholds.$inferSelect;
export type InsertMetricThreshold = z.infer<typeof insertMetricThresholdSchema>;
export type ScorecardTemplate = typeof scorecardTemplates.$inferSelect;
export type InsertScorecardTemplate = z.infer<
  typeof insertScorecardTemplateSchema
>;
export type ScorecardMetric = typeof scorecardMetrics.$inferSelect;
export type InsertScorecardMetric = z.infer<typeof insertScorecardMetricSchema>;
export const insertImportJobSchema = createInsertSchema(importJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  totalRows: true,
  successRows: true,
  failedRows: true,
  status: true,
});
export const insertImportRowErrorSchema = createInsertSchema(
  importRowErrors
).omit({ id: true, createdAt: true });
export const insertAlertRuleSchema = createInsertSchema(alertRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertAlertEventSchema = createInsertSchema(alertEvents).omit({
  id: true,
  createdAt: true,
  acknowledgedAt: true,
  resolvedAt: true,
  acknowledgedBy: true,
  resolvedBy: true,
});
export const insertReportSchema = createInsertSchema(reports).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertReportRunSchema = createInsertSchema(reportRuns).omit({
  id: true,
  createdAt: true,
  completedAt: true,
  summaryJson: true,
  outputUrl: true,
});
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  createdAt: true,
});

export const insertNotificationSettingsSchema = createInsertSchema(notificationSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertNotificationDeliverySchema = createInsertSchema(notificationDeliveries).omit({
  id: true,
  createdAt: true,
});
export const insertSchedulerRunSchema = createInsertSchema(schedulerRuns).omit({
  id: true,
  createdAt: true,
  completedAt: true,
  durationMs: true,
  errorSnapshot: true,
});
export const insertMetricForecastSchema = createInsertSchema(metricForecasts).omit({
  id: true,
  createdAt: true,
});
export const insertMetricAnomalySchema = createInsertSchema(metricAnomalies).omit({
  id: true,
  createdAt: true,
});
export const insertDataQualityRuleSchema = createInsertSchema(dataQualityRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertDataQualityViolationSchema = createInsertSchema(dataQualityViolations).omit({
  id: true,
  createdAt: true,
});

// ── Phase 5: Growth Operating System ──

export const actions = pgTable("actions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  locationId: integer("location_id").references(() => locations.id, { onDelete: "set null" }),
  metricDefinitionId: integer("metric_definition_id").references(() => metricDefinitions.id, { onDelete: "set null" }),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 50 }).notNull().default("open"),
  priority: varchar("priority", { length: 50 }).notNull().default("medium"),
  ownerUserId: varchar("owner_user_id"),
  sourceType: varchar("source_type", { length: 50 }),
  sourceId: integer("source_id"),
  dueDate: timestamp("due_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const actionCheckins = pgTable("action_checkins", {
  id: serial("id").primaryKey(),
  actionId: integer("action_id")
    .notNull()
    .references(() => actions.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull(),
  note: text("note").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const opportunities = pgTable("opportunities", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  locationId: integer("location_id").references(() => locations.id, { onDelete: "set null" }),
  metricDefinitionId: integer("metric_definition_id").references(() => metricDefinitions.id, { onDelete: "set null" }),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  impactScore: varchar("impact_score", { length: 50 }).notNull().default("medium"),
  sourceType: varchar("source_type", { length: 100 }),
  status: varchar("status", { length: 50 }).notNull().default("open"),
  actionId: integer("action_id").references(() => actions.id, { onDelete: "set null" }),
  priority: varchar("priority", { length: 50 }).notNull().default("medium"),
  confidenceScore: real("confidence_score"),
  rationaleJson: text("rationale_json"),
  detectedAt: timestamp("detected_at").defaultNow(),
  lastRecomputedAt: timestamp("last_recomputed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const goals = pgTable("goals", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  locationId: integer("location_id").references(() => locations.id, { onDelete: "set null" }),
  metricDefinitionId: integer("metric_definition_id").references(() => metricDefinitions.id, { onDelete: "set null" }),
  title: varchar("title", { length: 500 }).notNull(),
  targetValue: real("target_value").notNull(),
  currentValue: real("current_value"),
  period: varchar("period", { length: 50 }).notNull().default("weekly"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  status: varchar("status", { length: 50 }).notNull().default("on_track"),
  consecutiveOffTrack: integer("consecutive_off_track").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const playbooks = pgTable("playbooks", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }),
  isActive: boolean("is_active").notNull().default(true),
  isArchived: boolean("is_archived").notNull().default(false),
  version: integer("version").notNull().default(1),
  updatedByUserId: varchar("updated_by_user_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const playbookSteps = pgTable("playbook_steps", {
  id: serial("id").primaryKey(),
  playbookId: integer("playbook_id")
    .notNull()
    .references(() => playbooks.id, { onDelete: "cascade" }),
  stepOrder: integer("step_order").notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  metricDefinitionId: integer("metric_definition_id").references(() => metricDefinitions.id, { onDelete: "set null" }),
});

export const playbookApplications = pgTable("playbook_applications", {
  id: serial("id").primaryKey(),
  playbookId: integer("playbook_id")
    .notNull()
    .references(() => playbooks.id, { onDelete: "cascade" }),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  locationId: integer("location_id")
    .notNull()
    .references(() => locations.id, { onDelete: "cascade" }),
  appliedByUserId: varchar("applied_by_user_id").notNull(),
  status: varchar("status", { length: 50 }).notNull().default("applied"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const digests = pgTable("digests", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  generatedByUserId: varchar("generated_by_user_id").notNull(),
  winsJson: text("wins_json").notNull().default("[]"),
  risksJson: text("risks_json").notNull().default("[]"),
  blockedActionsJson: text("blocked_actions_json").notNull().default("[]"),
  overdueActionsJson: text("overdue_actions_json").notNull().default("[]"),
  recommendedMovesJson: text("recommended_moves_json").notNull().default("[]"),
  summaryText: text("summary_text"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const digestSchedules = pgTable("digest_schedules", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  dayOfWeek: integer("day_of_week").notNull().default(1),
  sendTime: varchar("send_time", { length: 10 }).notNull().default("09:00"),
  timezone: varchar("timezone", { length: 100 }).notNull().default("America/New_York"),
  recipientsJson: text("recipients_json").notNull().default("[]"),
  isEnabled: boolean("is_enabled").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const digestSchedulerRuns = pgTable("digest_scheduler_runs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  weekKey: varchar("week_key", { length: 20 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("success"),
  digestId: integer("digest_id").references(() => digests.id, { onDelete: "set null" }),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const benchmarkingConfigs = pgTable("benchmarking_configs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  goalAttainmentWeight: real("goal_attainment_weight").notNull().default(40),
  alertPenaltyWeight: real("alert_penalty_weight").notNull().default(25),
  trendMomentumWeight: real("trend_momentum_weight").notNull().default(20),
  scorecardContributionWeight: real("scorecard_contribution_weight").notNull().default(15),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertActionSchema = createInsertSchema(actions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertActionCheckinSchema = createInsertSchema(actionCheckins).omit({
  id: true,
  createdAt: true,
});
export const insertOpportunitySchema = createInsertSchema(opportunities).omit({
  id: true,
  createdAt: true,
});
export const insertGoalSchema = createInsertSchema(goals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  consecutiveOffTrack: true,
  currentValue: true,
});
export const insertPlaybookSchema = createInsertSchema(playbooks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertPlaybookStepSchema = createInsertSchema(playbookSteps).omit({
  id: true,
});
export const insertPlaybookApplicationSchema = createInsertSchema(playbookApplications).omit({
  id: true,
  createdAt: true,
});
export const insertDigestSchema = createInsertSchema(digests).omit({
  id: true,
  createdAt: true,
});
export const insertDigestScheduleSchema = createInsertSchema(digestSchedules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertDigestSchedulerRunSchema = createInsertSchema(digestSchedulerRuns).omit({
  id: true,
  startedAt: true,
});
export const insertBenchmarkingConfigSchema = createInsertSchema(benchmarkingConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Action = typeof actions.$inferSelect;
export type InsertAction = z.infer<typeof insertActionSchema>;
export type ActionCheckin = typeof actionCheckins.$inferSelect;
export type InsertActionCheckin = z.infer<typeof insertActionCheckinSchema>;
export type Opportunity = typeof opportunities.$inferSelect;
export type InsertOpportunity = z.infer<typeof insertOpportunitySchema>;
export type Goal = typeof goals.$inferSelect;
export type InsertGoal = z.infer<typeof insertGoalSchema>;
export type Playbook = typeof playbooks.$inferSelect;
export type InsertPlaybook = z.infer<typeof insertPlaybookSchema>;
export type PlaybookStep = typeof playbookSteps.$inferSelect;
export type InsertPlaybookStep = z.infer<typeof insertPlaybookStepSchema>;
export type PlaybookApplication = typeof playbookApplications.$inferSelect;
export type InsertPlaybookApplication = z.infer<typeof insertPlaybookApplicationSchema>;
export type Digest = typeof digests.$inferSelect;
export type InsertDigest = z.infer<typeof insertDigestSchema>;
export type DigestSchedule = typeof digestSchedules.$inferSelect;
export type InsertDigestSchedule = z.infer<typeof insertDigestScheduleSchema>;
export type DigestSchedulerRun = typeof digestSchedulerRuns.$inferSelect;
export type InsertDigestSchedulerRun = z.infer<typeof insertDigestSchedulerRunSchema>;
export type BenchmarkingConfig = typeof benchmarkingConfigs.$inferSelect;
export type InsertBenchmarkingConfig = z.infer<typeof insertBenchmarkingConfigSchema>;

export type ScoreRun = typeof scoreRuns.$inferSelect;
export type InsertScoreRun = z.infer<typeof insertScoreRunSchema>;
export type ScoreRunDetail = typeof scoreRunDetails.$inferSelect;
export type MetricValue = typeof metricValues.$inferSelect;
export type InsertMetricValue = z.infer<typeof insertMetricValueSchema>;
export type ImportJob = typeof importJobs.$inferSelect;
export type InsertImportJob = z.infer<typeof insertImportJobSchema>;
export type ImportRowError = typeof importRowErrors.$inferSelect;
export type InsertImportRowError = z.infer<typeof insertImportRowErrorSchema>;
export type AlertRule = typeof alertRules.$inferSelect;
export type InsertAlertRule = z.infer<typeof insertAlertRuleSchema>;
export type AlertEvent = typeof alertEvents.$inferSelect;
export type InsertAlertEvent = z.infer<typeof insertAlertEventSchema>;
export type Report = typeof reports.$inferSelect;
export type InsertReport = z.infer<typeof insertReportSchema>;
export type ReportRun = typeof reportRuns.$inferSelect;
export type InsertReportRun = z.infer<typeof insertReportRunSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type NotificationSetting = typeof notificationSettings.$inferSelect;
export type InsertNotificationSetting = z.infer<typeof insertNotificationSettingsSchema>;
export type NotificationDelivery = typeof notificationDeliveries.$inferSelect;
export type InsertNotificationDelivery = z.infer<typeof insertNotificationDeliverySchema>;
export type SchedulerRun = typeof schedulerRuns.$inferSelect;
export type InsertSchedulerRun = z.infer<typeof insertSchedulerRunSchema>;
export type MetricForecast = typeof metricForecasts.$inferSelect;
export type InsertMetricForecast = z.infer<typeof insertMetricForecastSchema>;
export type MetricAnomaly = typeof metricAnomalies.$inferSelect;
export type InsertMetricAnomaly = z.infer<typeof insertMetricAnomalySchema>;
export type DataQualityRule = typeof dataQualityRules.$inferSelect;
export type InsertDataQualityRule = z.infer<typeof insertDataQualityRuleSchema>;
export type DataQualityViolation = typeof dataQualityViolations.$inferSelect;
export type InsertDataQualityViolation = z.infer<typeof insertDataQualityViolationSchema>;
