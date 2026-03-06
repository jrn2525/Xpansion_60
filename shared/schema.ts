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
export type ScoreRun = typeof scoreRuns.$inferSelect;
export type InsertScoreRun = z.infer<typeof insertScoreRunSchema>;
export type ScoreRunDetail = typeof scoreRunDetails.$inferSelect;
export type MetricValue = typeof metricValues.$inferSelect;
export type InsertMetricValue = z.infer<typeof insertMetricValueSchema>;
