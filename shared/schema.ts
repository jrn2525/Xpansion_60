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
  jsonb,
  date,
  unique,
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
  logoUrl: varchar("logo_url", { length: 1024 }),
  accentColor: varchar("accent_color", { length: 7 }),
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
  impactLevel: varchar("impact_level", { length: 20 }),
  persistentThresholdDays: integer("persistent_threshold_days"),
  recommendedActions: jsonb("recommended_actions"),
  ownerUserId: varchar("owner_user_id"),
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
  eventHash: varchar("event_hash", { length: 128 }),
  prevHash: varchar("prev_hash", { length: 128 }),
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
  // Coaching: client's reflection on what happened when they did the task
  feedbackText: text("feedback_text"),
  // Coaching: links this action to the enrollment + step that produced it
  enrollmentId: integer("enrollment_id"),
  stepId: integer("step_id"),
  completedAt: timestamp("completed_at"),
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
  // Coaching: per-program configurable shape and behavior
  totalWeeks: integer("total_weeks").notNull().default(12),
  totalWeekdays: integer("total_weekdays").notNull().default(60),
  feedbackRequired: boolean("feedback_required").notNull().default(true),
  reflectionRequired: boolean("reflection_required").notNull().default(false),
  reflectionPrompt: text("reflection_prompt")
    .notNull()
    .default("Reflecting back on this week, what is your biggest takeaway?"),
  completionMessage: text("completion_message"),
  ctaLabel: varchar("cta_label", { length: 255 }),
  ctaUrl: varchar("cta_url", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Coaching: named sections within a program (e.g., Greeting/Educate/Process/Close)
export const playbookSections = pgTable("playbook_sections", {
  id: serial("id").primaryKey(),
  playbookId: integer("playbook_id")
    .notNull()
    .references(() => playbooks.id, { onDelete: "cascade" }),
  order: integer("order").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  startDay: integer("start_day").notNull(),
  endDay: integer("end_day").notNull(),
  transitionEmailEnabled: boolean("transition_email_enabled").notNull().default(false),
  transitionEmailSubject: text("transition_email_subject"),
  transitionEmailBody: text("transition_email_body"),
  createdAt: timestamp("created_at").defaultNow(),
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
  // Coaching: where this step sits in the 12-week / 5-weekday grid
  weekNumber: integer("week_number"),
  dayNumber: integer("day_number"),
  taskText: text("task_text"),
  implementationText: text("implementation_text"),
  mediaUrl: varchar("media_url", { length: 1000 }),
  sectionId: integer("section_id").references(() => playbookSections.id, { onDelete: "set null" }),
});

export const playbookApplications = pgTable("playbook_applications", {
  id: serial("id").primaryKey(),
  playbookId: integer("playbook_id")
    .notNull()
    .references(() => playbooks.id, { onDelete: "cascade" }),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  // Coaching enrollments have no location; nullable for the new use case while
  // staying valid for any pre-existing rows
  locationId: integer("location_id").references(() => locations.id, { onDelete: "cascade" }),
  appliedByUserId: varchar("applied_by_user_id").notNull(),
  // Coaching: the client this enrollment is for (nullable for legacy rows,
  // required in app logic for new enrollments)
  enrolledUserId: varchar("enrolled_user_id"),
  status: varchar("status", { length: 50 }).notNull().default("applied"),
  completedSteps: integer("completed_steps").array().notNull().default([]),
  completedAt: timestamp("completed_at"),
  // Coaching: per-client enrollment start date (drives "today's task" lookup)
  startDate: date("start_date"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Coaching: end-of-week recap, generated after the 5th task of a week is completed
export const weeklySummaries = pgTable("weekly_summaries", {
  id: serial("id").primaryKey(),
  enrollmentId: integer("enrollment_id")
    .notNull()
    .references(() => playbookApplications.id, { onDelete: "cascade" }),
  weekNumber: integer("week_number").notNull(),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  summaryText: text("summary_text").notNull(),
  reflectionText: text("reflection_text"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  uniqueEnrollmentWeek: unique().on(t.enrollmentId, t.weekNumber),
}));

// Coaching: end-of-phase (60-day) summary report
export const phaseSummaries = pgTable("phase_summaries", {
  id: serial("id").primaryKey(),
  enrollmentId: integer("enrollment_id")
    .notNull()
    .unique()
    .references(() => playbookApplications.id, { onDelete: "cascade" }),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  summaryText: text("summary_text").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Coaching: per-enrollment pauses (vacation / sick) that shift the schedule forward
export const enrollmentPauses = pgTable("enrollment_pauses", {
  id: serial("id").primaryKey(),
  enrollmentId: integer("enrollment_id")
    .notNull()
    .references(() => playbookApplications.id, { onDelete: "cascade" }),
  pauseStart: date("pause_start").notNull(),
  pauseEnd: date("pause_end"),
  reason: text("reason"),
  createdByUserId: varchar("created_by_user_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Coaching: admin-editable Sunday encouragement messages per week of the program
export const weekEncouragements = pgTable("week_encouragements", {
  id: serial("id").primaryKey(),
  playbookId: integer("playbook_id")
    .notNull()
    .references(() => playbooks.id, { onDelete: "cascade" }),
  weekNumber: integer("week_number").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  uniquePlaybookWeek: unique().on(t.playbookId, t.weekNumber),
}));

// Coaching: admin-editable email templates (daily task, weekly summary, etc.)
export const emailTemplates = pgTable("email_templates", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  key: varchar("key", { length: 100 }).notNull(),
  enabled: boolean("enabled").notNull().default(true),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  uniqueTenantKey: unique().on(t.tenantId, t.key),
}));

// Coaching: per-tenant app config (send times, app display name, copy, etc.)
export const appSettings = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  key: varchar("key", { length: 100 }).notNull(),
  value: text("value"),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  uniqueTenantKey: unique().on(t.tenantId, t.key),
}));

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

// Phase 5.3: Security + Incident Ops tables

export const securityIpBlocks = pgTable("security_ip_blocks", {
  id: serial("id").primaryKey(),
  ipAddress: varchar("ip_address", { length: 45 }).notNull(),
  reason: text("reason"),
  blockedBy: varchar("blocked_by"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSecurityIpBlockSchema = createInsertSchema(securityIpBlocks).omit({ id: true });

export const incidents = pgTable("incidents", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 50 }).notNull(),
  severity: varchar("severity", { length: 20 }).notNull().default("medium"),
  status: varchar("status", { length: 20 }).notNull().default("open"),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  evidenceJson: text("evidence_json"),
  detectedAt: timestamp("detected_at").defaultNow(),
  acknowledgedBy: varchar("acknowledged_by"),
  acknowledgedAt: timestamp("acknowledged_at"),
  resolvedBy: varchar("resolved_by"),
  resolvedAt: timestamp("resolved_at"),
  notificationSent: varchar("notification_sent").default("false"),
});

export const insertIncidentSchema = createInsertSchema(incidents).omit({ id: true });

export const incidentNotes = pgTable("incident_notes", {
  id: serial("id").primaryKey(),
  incidentId: integer("incident_id").notNull().references(() => incidents.id, { onDelete: "cascade" }),
  authorUserId: varchar("author_user_id").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertIncidentNoteSchema = createInsertSchema(incidentNotes).omit({ id: true });

export const incidentsRelations = relations(incidents, ({ many }) => ({
  notes: many(incidentNotes),
}));

export const incidentNotesRelations = relations(incidentNotes, ({ one }) => ({
  incident: one(incidents, {
    fields: [incidentNotes.incidentId],
    references: [incidents.id],
  }),
}));

// Phase 5.4: Intelligence + Automation at Scale

export const riskSnapshots = pgTable("risk_snapshots", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  locationId: integer("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  metricDefinitionId: integer("metric_definition_id").notNull().references(() => metricDefinitions.id, { onDelete: "cascade" }),
  riskScore: real("risk_score").notNull(),
  trendSlope: real("trend_slope").notNull().default(0),
  varianceInstability: real("variance_instability").notNull().default(0),
  alertBurden: real("alert_burden").notNull().default(0),
  unresolvedActions: integer("unresolved_actions").notNull().default(0),
  earlyWarnings: text("early_warnings"),
  forecastValue: real("forecast_value"),
  confidenceLow: real("confidence_low"),
  confidenceHigh: real("confidence_high"),
  computedAt: timestamp("computed_at").defaultNow(),
});

export const weeklyPlans = pgTable("weekly_plans", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  weekKey: varchar("week_key", { length: 20 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("draft"),
  generatedAt: timestamp("generated_at").defaultNow(),
  approvedByUserId: varchar("approved_by_user_id"),
  approvedAt: timestamp("approved_at"),
  rejectedByUserId: varchar("rejected_by_user_id"),
  rejectedAt: timestamp("rejected_at"),
});

export const weeklyPlanItems = pgTable("weekly_plan_items", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id").notNull().references(() => weeklyPlans.id, { onDelete: "cascade" }),
  locationId: integer("location_id").references(() => locations.id),
  metricDefinitionId: integer("metric_definition_id").references(() => metricDefinitions.id),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  priority: varchar("priority", { length: 50 }).notNull().default("medium"),
  priorityScore: real("priority_score").notNull().default(0),
  suggestedOwnerUserId: varchar("suggested_owner_user_id"),
  suggestedDueDate: timestamp("suggested_due_date"),
  actionId: integer("action_id"),
});

export const playbookEffectivenessSnapshots = pgTable("playbook_effectiveness_snapshots", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  playbookId: integer("playbook_id").notNull().references(() => playbooks.id, { onDelete: "cascade" }),
  locationId: integer("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  applicationId: integer("application_id").notNull().references(() => playbookApplications.id, { onDelete: "cascade" }),
  preAvgValue: real("pre_avg_value").notNull(),
  postAvgValue: real("post_avg_value").notNull(),
  upliftPercent: real("uplift_percent").notNull(),
  prePeriods: integer("pre_periods").notNull(),
  postPeriods: integer("post_periods").notNull(),
  computedAt: timestamp("computed_at").defaultNow(),
});

export const executiveReports = pgTable("executive_reports", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  generatedByUserId: varchar("generated_by_user_id").notNull(),
  weekKey: varchar("week_key", { length: 20 }).notNull(),
  improvedJson: text("improved_json"),
  worsenedJson: text("worsened_json"),
  risksJson: text("risks_json"),
  recommendedMovesJson: text("recommended_moves_json"),
  summaryMarkdown: text("summary_markdown"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const interventionQueue = pgTable("intervention_queue", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  locationId: integer("location_id").references(() => locations.id),
  metricDefinitionId: integer("metric_definition_id").references(() => metricDefinitions.id),
  type: varchar("type", { length: 100 }).notNull(),
  severity: varchar("severity", { length: 50 }).notNull().default("medium"),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  riskScore: real("risk_score"),
  status: varchar("status", { length: 50 }).notNull().default("open"),
  assignedToUserId: varchar("assigned_to_user_id"),
  assignedAt: timestamp("assigned_at"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const automationSettings = pgTable("automation_settings", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }).unique(),
  maxActionsPerWeek: integer("max_actions_per_week").notNull().default(20),
  blockedCategories: text("blocked_categories"),
  confidenceThreshold: real("confidence_threshold").notNull().default(0.7),
  requireApproval: varchar("require_approval", { length: 10 }).notNull().default("true"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const automationDecisionLogs = pgTable("automation_decision_logs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  decisionType: varchar("decision_type", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 100 }).notNull(),
  entityId: varchar("entity_id", { length: 255 }).notNull(),
  actorUserId: varchar("actor_user_id").notNull(),
  reason: text("reason"),
  detailsJson: text("details_json"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertRiskSnapshotSchema = createInsertSchema(riskSnapshots).omit({ id: true });
export const insertWeeklyPlanSchema = createInsertSchema(weeklyPlans).omit({ id: true });
export const insertWeeklyPlanItemSchema = createInsertSchema(weeklyPlanItems).omit({ id: true });
export const insertPlaybookEffectivenessSnapshotSchema = createInsertSchema(playbookEffectivenessSnapshots).omit({ id: true });
export const insertExecutiveReportSchema = createInsertSchema(executiveReports).omit({ id: true });
export const insertInterventionSchema = createInsertSchema(interventionQueue).omit({ id: true });
export const insertAutomationSettingsSchema = createInsertSchema(automationSettings).omit({ id: true });
export const insertAutomationDecisionLogSchema = createInsertSchema(automationDecisionLogs).omit({ id: true });

export const campaigns = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 500 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  locationId: integer("location_id").references(() => locations.id),
  metricDefinitionId: integer("metric_definition_id").references(() => metricDefinitions.id),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"),
  status: varchar("status", { length: 30 }).notNull().default("planned"),
  description: text("description"),
  budget: real("budget"),
  createdByUserId: varchar("created_by_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCampaignSchema = createInsertSchema(campaigns).omit({ id: true });
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = typeof campaigns.$inferSelect;

export const campaignsRelations = relations(campaigns, ({ one }) => ({
  tenant: one(tenants, { fields: [campaigns.tenantId], references: [tenants.id] }),
  location: one(locations, { fields: [campaigns.locationId], references: [locations.id] }),
  metricDefinition: one(metricDefinitions, { fields: [campaigns.metricDefinitionId], references: [metricDefinitions.id] }),
}));

// ── Phase 5.6: Enterprise Reliability + Intelligence Loop ──

export const jobQueue = pgTable("job_queue", {
  id: serial("id").primaryKey(),
  jobType: varchar("job_type", { length: 100 }).notNull(),
  jobKey: varchar("job_key", { length: 255 }).notNull(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  payload: jsonb("payload"),
  status: varchar("status", { length: 30 }).notNull().default("pending"),
  idempotencyKey: varchar("idempotency_key", { length: 255 }).unique(),
  priority: integer("priority").notNull().default(0),
  maxRetries: integer("max_retries").notNull().default(3),
  retryCount: integer("retry_count").notNull().default(0),
  nextRunAt: timestamp("next_run_at").defaultNow(),
  lockedAt: timestamp("locked_at"),
  lockedBy: varchar("locked_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const jobRuns = pgTable("job_runs", {
  id: serial("id").primaryKey(),
  jobQueueId: integer("job_queue_id").notNull().references(() => jobQueue.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 30 }).notNull(),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  durationMs: integer("duration_ms"),
  errorSnapshot: text("error_snapshot"),
  workerKey: varchar("worker_key", { length: 255 }),
});

export const jobDeadLetters = pgTable("job_dead_letters", {
  id: serial("id").primaryKey(),
  jobQueueId: integer("job_queue_id").notNull().references(() => jobQueue.id),
  tenantId: integer("tenant_id").references(() => tenants.id),
  jobType: varchar("job_type", { length: 100 }).notNull(),
  originalPayload: jsonb("original_payload"),
  failureReason: text("failure_reason"),
  failedAt: timestamp("failed_at").defaultNow(),
});

export const tenantConfidenceSnapshots = pgTable("tenant_confidence_snapshots", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  locationId: integer("location_id").references(() => locations.id),
  metricDefinitionId: integer("metric_definition_id").references(() => metricDefinitions.id),
  period: varchar("period", { length: 50 }),
  freshnessScore: real("freshness_score").notNull(),
  completenessScore: real("completeness_score").notNull(),
  continuityScore: real("continuity_score").notNull(),
  outlierRate: real("outlier_rate").notNull(),
  sampleSufficiency: real("sample_sufficiency").notNull(),
  overallConfidence: real("overall_confidence").notNull(),
  snapshotAt: timestamp("snapshot_at").defaultNow(),
});

export const recommendationEvents = pgTable("recommendation_events", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: integer("entity_id").notNull(),
  eventType: varchar("event_type", { length: 50 }).notNull(),
  userId: varchar("user_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const recommendationEffectiveness = pgTable("recommendation_effectiveness", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: integer("entity_id").notNull(),
  metricDefinitionId: integer("metric_definition_id").references(() => metricDefinitions.id),
  preValue: real("pre_value"),
  postValue: real("post_value"),
  upliftPercent: real("uplift_percent"),
  confidenceScore: real("confidence_score"),
  measurementWindowDays: integer("measurement_window_days").notNull().default(30),
  measuredAt: timestamp("measured_at").defaultNow(),
});

export const securityAccessEvents = pgTable("security_access_events", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  eventType: varchar("event_type", { length: 50 }).notNull(),
  ipAddress: varchar("ip_address", { length: 45 }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const breakGlassSessions = pgTable("break_glass_sessions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  reason: text("reason").notNull(),
  startedAt: timestamp("started_at").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  endedAt: timestamp("ended_at"),
  endedReason: text("ended_reason"),
  isActive: boolean("is_active").notNull().default(true),
});

export const insertJobQueueSchema = createInsertSchema(jobQueue).omit({ id: true });
export const insertJobRunSchema = createInsertSchema(jobRuns).omit({ id: true });
export const insertJobDeadLetterSchema = createInsertSchema(jobDeadLetters).omit({ id: true });
export const insertConfidenceSnapshotSchema = createInsertSchema(tenantConfidenceSnapshots).omit({ id: true });
export const insertRecommendationEventSchema = createInsertSchema(recommendationEvents).omit({ id: true });
export const insertRecommendationEffectivenessSchema = createInsertSchema(recommendationEffectiveness).omit({ id: true });
export const insertSecurityAccessEventSchema = createInsertSchema(securityAccessEvents).omit({ id: true });
export const insertBreakGlassSessionSchema = createInsertSchema(breakGlassSessions).omit({ id: true });

export type JobQueueEntry = typeof jobQueue.$inferSelect;
export type InsertJobQueueEntry = z.infer<typeof insertJobQueueSchema>;
export type JobRun = typeof jobRuns.$inferSelect;
export type InsertJobRun = z.infer<typeof insertJobRunSchema>;
export type JobDeadLetter = typeof jobDeadLetters.$inferSelect;
export type InsertJobDeadLetter = z.infer<typeof insertJobDeadLetterSchema>;
export type TenantConfidenceSnapshot = typeof tenantConfidenceSnapshots.$inferSelect;
export type InsertConfidenceSnapshot = z.infer<typeof insertConfidenceSnapshotSchema>;
export type RecommendationEvent = typeof recommendationEvents.$inferSelect;
export type InsertRecommendationEvent = z.infer<typeof insertRecommendationEventSchema>;
export type RecommendationEffectivenessRecord = typeof recommendationEffectiveness.$inferSelect;
export type InsertRecommendationEffectiveness = z.infer<typeof insertRecommendationEffectivenessSchema>;
export type SecurityAccessEvent = typeof securityAccessEvents.$inferSelect;
export type InsertSecurityAccessEvent = z.infer<typeof insertSecurityAccessEventSchema>;
export type BreakGlassSession = typeof breakGlassSessions.$inferSelect;
export type InsertBreakGlassSession = z.infer<typeof insertBreakGlassSessionSchema>;

// ── Phase 6: Activation & Signal Quality ──

export const onboardingProgress = pgTable("onboarding_progress", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull(),
  currentStep: integer("current_step").notNull().default(0),
  completedSteps: jsonb("completed_steps").notNull().default([]),
  savedData: jsonb("saved_data").notNull().default({}),
  isComplete: boolean("is_complete").notNull().default(false),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const importMappingTemplates = pgTable("import_mapping_templates", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  mappingConfig: jsonb("mapping_config").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertOnboardingProgressSchema = createInsertSchema(onboardingProgress).omit({ id: true });
export const insertImportMappingTemplateSchema = createInsertSchema(importMappingTemplates).omit({ id: true });

export type OnboardingProgress = typeof onboardingProgress.$inferSelect;
export type InsertOnboardingProgress = z.infer<typeof insertOnboardingProgressSchema>;
export type ImportMappingTemplate = typeof importMappingTemplates.$inferSelect;
export type InsertImportMappingTemplate = z.infer<typeof insertImportMappingTemplateSchema>;

export const jobQueueRelations = relations(jobQueue, ({ one, many }) => ({
  tenant: one(tenants, { fields: [jobQueue.tenantId], references: [tenants.id] }),
  runs: many(jobRuns),
}));

export const jobRunsRelations = relations(jobRuns, ({ one }) => ({
  job: one(jobQueue, { fields: [jobRuns.jobQueueId], references: [jobQueue.id] }),
}));

export const weeklyPlansRelations = relations(weeklyPlans, ({ many }) => ({
  items: many(weeklyPlanItems),
}));

export const weeklyPlanItemsRelations = relations(weeklyPlanItems, ({ one }) => ({
  plan: one(weeklyPlans, { fields: [weeklyPlanItems.planId], references: [weeklyPlans.id] }),
}));

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
export type SecurityIpBlock = typeof securityIpBlocks.$inferSelect;
export type InsertSecurityIpBlock = z.infer<typeof insertSecurityIpBlockSchema>;
export type Incident = typeof incidents.$inferSelect;
export type InsertIncident = z.infer<typeof insertIncidentSchema>;
export type IncidentNote = typeof incidentNotes.$inferSelect;
export type InsertIncidentNote = z.infer<typeof insertIncidentNoteSchema>;
export type RiskSnapshot = typeof riskSnapshots.$inferSelect;
export type InsertRiskSnapshot = z.infer<typeof insertRiskSnapshotSchema>;
export type WeeklyPlan = typeof weeklyPlans.$inferSelect;
export type InsertWeeklyPlan = z.infer<typeof insertWeeklyPlanSchema>;
export type WeeklyPlanItem = typeof weeklyPlanItems.$inferSelect;
export type InsertWeeklyPlanItem = z.infer<typeof insertWeeklyPlanItemSchema>;
export type PlaybookEffectivenessSnapshot = typeof playbookEffectivenessSnapshots.$inferSelect;
export type InsertPlaybookEffectivenessSnapshot = z.infer<typeof insertPlaybookEffectivenessSnapshotSchema>;
export type ExecutiveReport = typeof executiveReports.$inferSelect;
export type InsertExecutiveReport = z.infer<typeof insertExecutiveReportSchema>;
export type Intervention = typeof interventionQueue.$inferSelect;
export type InsertIntervention = z.infer<typeof insertInterventionSchema>;
export type AutomationSetting = typeof automationSettings.$inferSelect;
export type InsertAutomationSetting = z.infer<typeof insertAutomationSettingsSchema>;
export type AutomationDecisionLog = typeof automationDecisionLogs.$inferSelect;
export type InsertAutomationDecisionLog = z.infer<typeof insertAutomationDecisionLogSchema>;

export const userPreferences = pgTable("user_preferences", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  pinnedPages: text("pinned_pages").array().notNull().default(sql`'{}'::text[]`),
  keyboardShortcutsEnabled: boolean("keyboard_shortcuts_enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserPreferencesSchema = createInsertSchema(userPreferences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type UserPreference = typeof userPreferences.$inferSelect;
export type InsertUserPreference = z.infer<typeof insertUserPreferencesSchema>;

export const userNotifications = pgTable("user_notifications", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 50 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message"),
  link: varchar("link", { length: 500 }),
  isRead: boolean("is_read").notNull().default(false),
  relatedEntityType: varchar("related_entity_type", { length: 50 }),
  relatedEntityId: integer("related_entity_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserNotificationSchema = createInsertSchema(userNotifications).omit({
  id: true,
  createdAt: true,
});

export type UserNotification = typeof userNotifications.$inferSelect;
export type InsertUserNotification = z.infer<typeof insertUserNotificationSchema>;

export const tenantIntegrations = pgTable("tenant_integrations", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  config: jsonb("config").notNull().default({}),
  credentials: jsonb("credentials").notNull().default({}),
  fieldMapping: jsonb("field_mapping").notNull().default({}),
  syncSchedule: varchar("sync_schedule", { length: 50 }).default("manual"),
  locationId: integer("location_id").references(() => locations.id),
  status: varchar("status", { length: 30 }).notNull().default("draft"),
  lastSyncAt: timestamp("last_sync_at"),
  nextSyncAt: timestamp("next_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTenantIntegrationSchema = createInsertSchema(tenantIntegrations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type TenantIntegration = typeof tenantIntegrations.$inferSelect;
export type InsertTenantIntegration = z.infer<typeof insertTenantIntegrationSchema>;

export const integrationSyncLogs = pgTable("integration_sync_logs", {
  id: serial("id").primaryKey(),
  integrationId: integer("integration_id")
    .notNull()
    .references(() => tenantIntegrations.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 30 }).notNull(),
  recordsProcessed: integer("records_processed").default(0),
  recordsSuccess: integer("records_success").default(0),
  recordsFailed: integer("records_failed").default(0),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertIntegrationSyncLogSchema = createInsertSchema(integrationSyncLogs).omit({
  id: true,
});

export type IntegrationSyncLog = typeof integrationSyncLogs.$inferSelect;
export type InsertIntegrationSyncLog = z.infer<typeof insertIntegrationSyncLogSchema>;

// ============================================================================
// Coaching app (Xpansion 60) — insert schemas and types
// ============================================================================

export const insertPlaybookSectionSchema = createInsertSchema(playbookSections).omit({
  id: true,
  createdAt: true,
});
export type PlaybookSection = typeof playbookSections.$inferSelect;
export type InsertPlaybookSection = z.infer<typeof insertPlaybookSectionSchema>;

export const insertWeeklySummarySchema = createInsertSchema(weeklySummaries).omit({
  id: true,
  generatedAt: true,
  createdAt: true,
});
export type WeeklySummary = typeof weeklySummaries.$inferSelect;
export type InsertWeeklySummary = z.infer<typeof insertWeeklySummarySchema>;

export const insertPhaseSummarySchema = createInsertSchema(phaseSummaries).omit({
  id: true,
  generatedAt: true,
  createdAt: true,
});
export type PhaseSummary = typeof phaseSummaries.$inferSelect;
export type InsertPhaseSummary = z.infer<typeof insertPhaseSummarySchema>;

export const insertEnrollmentPauseSchema = createInsertSchema(enrollmentPauses).omit({
  id: true,
  createdAt: true,
});
export type EnrollmentPause = typeof enrollmentPauses.$inferSelect;
export type InsertEnrollmentPause = z.infer<typeof insertEnrollmentPauseSchema>;

export const insertWeekEncouragementSchema = createInsertSchema(weekEncouragements).omit({
  id: true,
  updatedAt: true,
});
export type WeekEncouragement = typeof weekEncouragements.$inferSelect;
export type InsertWeekEncouragement = z.infer<typeof insertWeekEncouragementSchema>;

export const insertEmailTemplateSchema = createInsertSchema(emailTemplates).omit({
  id: true,
  updatedAt: true,
});
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type InsertEmailTemplate = z.infer<typeof insertEmailTemplateSchema>;

export const insertAppSettingSchema = createInsertSchema(appSettings).omit({
  id: true,
  updatedAt: true,
});
export type AppSetting = typeof appSettings.$inferSelect;
export type InsertAppSetting = z.infer<typeof insertAppSettingSchema>;
