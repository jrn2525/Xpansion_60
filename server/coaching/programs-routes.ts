import { Router, type RequestHandler } from "express";
import { db } from "../db";
import {
  playbooks,
  playbookSections,
  playbookSteps,
  insertPlaybookSectionSchema,
} from "@shared/schema";
import { eq, and, asc } from "drizzle-orm";
import { isAuthenticated, isSuperAdminGuard } from "../replit_integrations/auth/replitAuth";
import { z } from "zod";

export const programsRouter = Router();

function ok(data: unknown) {
  return { ok: true, data };
}

function err(code: string, message: string) {
  return { ok: false, error: { code, message } };
}

const guard: RequestHandler[] = [isAuthenticated, isSuperAdminGuard];

const FOUR_BASICS_SECTIONS = [
  { order: 1, name: "Greeting", startDay: 1, endDay: 15 },
  { order: 2, name: "Educate", startDay: 16, endDay: 30 },
  { order: 3, name: "Process", startDay: 31, endDay: 45 },
  { order: 4, name: "Close", startDay: 46, endDay: 60 },
];

/**
 * Wipe steps + sections for a program and reseed with The 4 Basics structure:
 *   4 sections (Greeting / Educate / Process / Close) of 15 weekdays each,
 *   60 empty step rows pre-stamped with weekNumber/dayNumber/sectionId so the
 *   admin only has to fill in task + implementation text per cell.
 */
async function seedFourBasics(programId: number): Promise<void> {
  await db.delete(playbookSteps).where(eq(playbookSteps.playbookId, programId));
  await db
    .delete(playbookSections)
    .where(eq(playbookSections.playbookId, programId));

  const sectionRows = await db
    .insert(playbookSections)
    .values(
      FOUR_BASICS_SECTIONS.map((s) => ({
        playbookId: programId,
        order: s.order,
        name: s.name,
        startDay: s.startDay,
        endDay: s.endDay,
      })),
    )
    .returning();

  const sectionByStartDay = new Map<number, number>(
    sectionRows.map((s) => [s.startDay, s.id]),
  );

  const steps: Array<{
    playbookId: number;
    stepOrder: number;
    title: string;
    weekNumber: number;
    dayNumber: number;
    sectionId: number;
    taskText: string;
    implementationText: string;
  }> = [];

  for (let weekdayIndex = 0; weekdayIndex < 60; weekdayIndex++) {
    const weekNumber = Math.floor(weekdayIndex / 5) + 1;
    const dayNumber = (weekdayIndex % 5) + 1;
    const stepOrder = weekdayIndex + 1;
    const dayOfProgram = stepOrder;
    const sectionStartDay =
      dayOfProgram <= 15
        ? 1
        : dayOfProgram <= 30
          ? 16
          : dayOfProgram <= 45
            ? 31
            : 46;
    steps.push({
      playbookId: programId,
      stepOrder,
      title: `Day ${dayOfProgram}`,
      weekNumber,
      dayNumber,
      sectionId: sectionByStartDay.get(sectionStartDay)!,
      taskText: "",
      implementationText: "",
    });
  }

  await db.insert(playbookSteps).values(steps);
}

// GET /api/admin/programs?tenantId=N — list programs for a tenant
programsRouter.get("/", ...guard, async (req, res) => {
  try {
    const tenantId = Number(req.query.tenantId);
    if (!tenantId || Number.isNaN(tenantId)) {
      return res
        .status(400)
        .json(err("VALIDATION_ERROR", "tenantId query parameter is required"));
    }
    const rows = await db
      .select()
      .from(playbooks)
      .where(eq(playbooks.tenantId, tenantId))
      .orderBy(asc(playbooks.name));
    res.json(ok(rows));
  } catch (e: any) {
    res.status(500).json(err("INTERNAL_ERROR", e.message));
  }
});

// POST /api/admin/programs — create a new program
const createProgramSchema = z.object({
  tenantId: z.number().int().positive(),
  name: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  seedFourBasics: z.boolean().optional().default(false),
});

programsRouter.post("/", ...guard, async (req: any, res) => {
  try {
    const parsed = createProgramSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json(err("VALIDATION_ERROR", parsed.error.message));
    }
    const { tenantId, name, description, seedFourBasics: seed } = parsed.data;
    const userId = req.user?.claims?.sub;

    const [row] = await db
      .insert(playbooks)
      .values({
        tenantId,
        name,
        description: description ?? null,
        updatedByUserId: userId,
      })
      .returning();

    if (seed) {
      await seedFourBasics(row.id);
    }

    res.status(201).json(ok(row));
  } catch (e: any) {
    res.status(500).json(err("INTERNAL_ERROR", e.message));
  }
});

// GET /api/admin/programs/:id — single program with sections + steps
programsRouter.get("/:id", ...guard, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) {
      return res.status(400).json(err("VALIDATION_ERROR", "Invalid id"));
    }
    const [program] = await db
      .select()
      .from(playbooks)
      .where(eq(playbooks.id, id));
    if (!program) {
      return res.status(404).json(err("NOT_FOUND", "Program not found"));
    }
    const sections = await db
      .select()
      .from(playbookSections)
      .where(eq(playbookSections.playbookId, id))
      .orderBy(asc(playbookSections.order));
    const steps = await db
      .select()
      .from(playbookSteps)
      .where(eq(playbookSteps.playbookId, id))
      .orderBy(asc(playbookSteps.stepOrder));
    res.json(ok({ program, sections, steps }));
  } catch (e: any) {
    res.status(500).json(err("INTERNAL_ERROR", e.message));
  }
});

// PUT /api/admin/programs/:id — update program-level settings
const updateProgramSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  totalWeeks: z.number().int().min(1).max(52).optional(),
  totalWeekdays: z.number().int().min(1).max(260).optional(),
  feedbackRequired: z.boolean().optional(),
  reflectionRequired: z.boolean().optional(),
  reflectionPrompt: z.string().optional(),
  completionMessage: z.string().nullable().optional(),
  ctaLabel: z.string().nullable().optional(),
  ctaUrl: z.string().nullable().optional(),
});

programsRouter.put("/:id", ...guard, async (req: any, res) => {
  try {
    const id = Number(req.params.id);
    const parsed = updateProgramSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json(err("VALIDATION_ERROR", parsed.error.message));
    }
    const [row] = await db
      .update(playbooks)
      .set({
        ...parsed.data,
        updatedByUserId: req.user?.claims?.sub,
        updatedAt: new Date(),
      })
      .where(eq(playbooks.id, id))
      .returning();
    if (!row) {
      return res.status(404).json(err("NOT_FOUND", "Program not found"));
    }
    res.json(ok(row));
  } catch (e: any) {
    res.status(500).json(err("INTERNAL_ERROR", e.message));
  }
});

// DELETE /api/admin/programs/:id
programsRouter.delete("/:id", ...guard, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const result = await db.delete(playbooks).where(eq(playbooks.id, id)).returning();
    if (result.length === 0) {
      return res.status(404).json(err("NOT_FOUND", "Program not found"));
    }
    res.json(ok({ deleted: true }));
  } catch (e: any) {
    res.status(500).json(err("INTERNAL_ERROR", e.message));
  }
});

// POST /api/admin/programs/:id/seed-four-basics — wipe + re-seed structure
programsRouter.post("/:id/seed-four-basics", ...guard, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [program] = await db
      .select()
      .from(playbooks)
      .where(eq(playbooks.id, id));
    if (!program) {
      return res.status(404).json(err("NOT_FOUND", "Program not found"));
    }
    await seedFourBasics(id);
    res.json(ok({ seeded: true }));
  } catch (e: any) {
    res.status(500).json(err("INTERNAL_ERROR", e.message));
  }
});

// PUT /api/admin/programs/:id/sections/:sectionId
const updateSectionSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  startDay: z.number().int().min(1).max(260).optional(),
  endDay: z.number().int().min(1).max(260).optional(),
  transitionEmailEnabled: z.boolean().optional(),
  transitionEmailSubject: z.string().nullable().optional(),
  transitionEmailBody: z.string().nullable().optional(),
});

programsRouter.put("/:id/sections/:sectionId", ...guard, async (req, res) => {
  try {
    const sectionId = Number(req.params.sectionId);
    const parsed = updateSectionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json(err("VALIDATION_ERROR", parsed.error.message));
    }
    const [row] = await db
      .update(playbookSections)
      .set(parsed.data)
      .where(eq(playbookSections.id, sectionId))
      .returning();
    if (!row) {
      return res.status(404).json(err("NOT_FOUND", "Section not found"));
    }
    res.json(ok(row));
  } catch (e: any) {
    res.status(500).json(err("INTERNAL_ERROR", e.message));
  }
});

// PUT /api/admin/programs/:id/steps/:stepId
const updateStepSchema = z.object({
  taskText: z.string().optional(),
  implementationText: z.string().optional(),
  mediaUrl: z.string().nullable().optional(),
  title: z.string().min(1).max(500).optional(),
});

programsRouter.put("/:id/steps/:stepId", ...guard, async (req, res) => {
  try {
    const stepId = Number(req.params.stepId);
    const parsed = updateStepSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json(err("VALIDATION_ERROR", parsed.error.message));
    }
    const [row] = await db
      .update(playbookSteps)
      .set(parsed.data)
      .where(eq(playbookSteps.id, stepId))
      .returning();
    if (!row) {
      return res.status(404).json(err("NOT_FOUND", "Step not found"));
    }
    res.json(ok(row));
  } catch (e: any) {
    res.status(500).json(err("INTERNAL_ERROR", e.message));
  }
});
