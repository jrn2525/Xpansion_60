import { Router } from "express";
import { db } from "../db";
import {
  playbooks,
  playbookApplications,
  playbookSections,
  playbookSteps,
  actions,
  enrollmentPauses,
} from "@shared/schema";
import { eq, and, desc, asc, isNotNull, inArray } from "drizzle-orm";
import { isAuthenticated } from "../auth/session";
import { z } from "zod";
import { computeSchedule, type PauseRange, type ScheduleResult } from "./schedule";
import { sendPhaseCompletionEmail } from "./cron";

export const clientRouter = Router();

function ok(data: unknown) {
  return { ok: true, data };
}
function err(code: string, message: string) {
  return { ok: false, error: { code, message } };
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

async function loadPauses(enrollmentId: number): Promise<PauseRange[]> {
  const rows = await db
    .select()
    .from(enrollmentPauses)
    .where(eq(enrollmentPauses.enrollmentId, enrollmentId));
  return rows.map((r) => ({ pauseStart: r.pauseStart, pauseEnd: r.pauseEnd }));
}

// Pick the "current" enrollment for a user — newest active one with a start date.
async function findActiveEnrollment(userId: string) {
  const rows = await db
    .select()
    .from(playbookApplications)
    .where(
      and(
        eq(playbookApplications.enrolledUserId, userId),
        isNotNull(playbookApplications.startDate),
      ),
    )
    .orderBy(desc(playbookApplications.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

// GET /api/client/today — what the logged-in client should see right now
clientRouter.get("/today", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(err("UNAUTHORIZED", "Not authenticated"));
    }

    const enrollment = await findActiveEnrollment(userId);
    if (!enrollment || !enrollment.startDate) {
      return res.json(ok({ enrollment: null, schedule: null, step: null, action: null, program: null, section: null }));
    }

    const [program] = await db
      .select()
      .from(playbooks)
      .where(eq(playbooks.id, enrollment.playbookId));
    if (!program) {
      return res.status(404).json(err("NOT_FOUND", "Program not found"));
    }

    const pauses = await loadPauses(enrollment.id);
    const schedule: ScheduleResult = computeSchedule({
      startDate: enrollment.startDate,
      today: todayISO(),
      totalWeekdays: program.totalWeekdays,
      pauses,
    });

    let step = null;
    let section = null;
    let action = null;
    if (schedule.status === "active") {
      const [foundStep] = await db
        .select()
        .from(playbookSteps)
        .where(
          and(
            eq(playbookSteps.playbookId, program.id),
            eq(playbookSteps.weekNumber, schedule.weekNumber),
            eq(playbookSteps.dayNumber, schedule.dayNumber),
          ),
        )
        .limit(1);
      step = foundStep ?? null;

      if (step?.sectionId) {
        const [foundSection] = await db
          .select()
          .from(playbookSections)
          .where(eq(playbookSections.id, step.sectionId));
        section = foundSection ?? null;
      }

      if (step) {
        const [foundAction] = await db
          .select()
          .from(actions)
          .where(
            and(
              eq(actions.enrollmentId, enrollment.id),
              eq(actions.stepId, step.id),
            ),
          )
          .limit(1);
        action = foundAction ?? null;
      }
    }

    res.json(
      ok({
        enrollment: {
          id: enrollment.id,
          startDate: enrollment.startDate,
          programId: enrollment.playbookId,
        },
        program: {
          id: program.id,
          name: program.name,
          totalWeekdays: program.totalWeekdays,
          totalWeeks: program.totalWeeks,
          feedbackRequired: program.feedbackRequired,
          reflectionRequired: program.reflectionRequired,
          reflectionPrompt: program.reflectionPrompt,
          completionMessage: program.completionMessage,
          ctaLabel: program.ctaLabel,
          ctaUrl: program.ctaUrl,
        },
        schedule,
        step,
        section,
        action,
      }),
    );
  } catch (e: any) {
    console.error("[CLIENT] /today error:", e);
    res.status(500).json(err("INTERNAL_ERROR", e.message));
  }
});

// POST /api/client/today/complete — mark today's task done with feedback
const completeSchema = z.object({
  enrollmentId: z.number().int().positive(),
  stepId: z.number().int().positive(),
  feedbackText: z.string().optional(),
}).strict();

clientRouter.post("/today/complete", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const parsed = completeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(err("VALIDATION_ERROR", parsed.error.message));
    }
    const { enrollmentId, stepId, feedbackText } = parsed.data;

    // Verify the enrollment belongs to this user
    const [enrollment] = await db
      .select()
      .from(playbookApplications)
      .where(eq(playbookApplications.id, enrollmentId));
    if (!enrollment || enrollment.enrolledUserId !== userId) {
      return res.status(403).json(err("FORBIDDEN", "Not your enrollment"));
    }

    // Verify the step belongs to the enrollment's program
    const [step] = await db
      .select()
      .from(playbookSteps)
      .where(eq(playbookSteps.id, stepId));
    if (!step || step.playbookId !== enrollment.playbookId) {
      return res.status(400).json(err("VALIDATION_ERROR", "Step does not belong to this program"));
    }

    const [program] = await db.select().from(playbooks).where(eq(playbooks.id, enrollment.playbookId));
    if (program?.feedbackRequired && (!feedbackText || !feedbackText.trim())) {
      return res.status(400).json(err("VALIDATION_ERROR", "Feedback is required"));
    }

    // Look for an existing action for (enrollment, step)
    const [existing] = await db
      .select()
      .from(actions)
      .where(and(eq(actions.enrollmentId, enrollmentId), eq(actions.stepId, stepId)))
      .limit(1);

    const completedAt = new Date();
    let savedRow;
    if (existing) {
      const wasAlreadyClosed = existing.status === "closed";
      const [updated] = await db
        .update(actions)
        .set({
          status: "closed",
          feedbackText: feedbackText ?? null,
          completedAt,
          updatedAt: completedAt,
        })
        .where(eq(actions.id, existing.id))
        .returning();
      savedRow = updated;
      // Fire phase-completion only on the first close, not on later updates
      if (
        !wasAlreadyClosed &&
        program &&
        step.weekNumber === program.totalWeeks &&
        step.dayNumber === 5
      ) {
        await db
          .update(playbookApplications)
          .set({ completedAt, status: "completed" })
          .where(eq(playbookApplications.id, enrollmentId));
        sendPhaseCompletionEmail(enrollmentId).catch((e) =>
          console.error("[CLIENT] phase_completion email failed:", e?.message ?? e),
        );
      }
    } else {
      const [created] = await db
        .insert(actions)
        .values({
          tenantId: enrollment.tenantId,
          ownerUserId: userId,
          title: step.title,
          description: step.taskText ?? null,
          status: "closed",
          priority: "medium",
          sourceType: "coaching_step",
          sourceId: stepId,
          enrollmentId,
          stepId,
          feedbackText: feedbackText ?? null,
          completedAt,
        })
        .returning();
      savedRow = created;
      if (
        program &&
        step.weekNumber === program.totalWeeks &&
        step.dayNumber === 5
      ) {
        await db
          .update(playbookApplications)
          .set({ completedAt, status: "completed" })
          .where(eq(playbookApplications.id, enrollmentId));
        sendPhaseCompletionEmail(enrollmentId).catch((e) =>
          console.error("[CLIENT] phase_completion email failed:", e?.message ?? e),
        );
      }
    }
    res.status(existing ? 200 : 201).json(ok(savedRow));
  } catch (e: any) {
    console.error("[CLIENT] /today/complete error:", e);
    res.status(500).json(err("INTERNAL_ERROR", e.message));
  }
});

// GET /api/client/history — completed tasks grouped by week, newest first
clientRouter.get("/history", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const enrollment = await findActiveEnrollment(userId);
    if (!enrollment) {
      return res.json(ok({ enrollment: null, items: [] }));
    }

    const completed = await db
      .select({
        actionId: actions.id,
        feedbackText: actions.feedbackText,
        completedAt: actions.completedAt,
        stepId: playbookSteps.id,
        stepTitle: playbookSteps.title,
        taskText: playbookSteps.taskText,
        implementationText: playbookSteps.implementationText,
        mediaUrl: playbookSteps.mediaUrl,
        weekNumber: playbookSteps.weekNumber,
        dayNumber: playbookSteps.dayNumber,
        sectionId: playbookSteps.sectionId,
      })
      .from(actions)
      .innerJoin(playbookSteps, eq(actions.stepId, playbookSteps.id))
      .where(
        and(
          eq(actions.enrollmentId, enrollment.id),
          eq(actions.status, "closed"),
        ),
      )
      .orderBy(desc(actions.completedAt));

    // Pull section names in one shot
    const sectionIds = Array.from(
      new Set(completed.map((c) => c.sectionId).filter((id): id is number => id !== null)),
    );
    const sections =
      sectionIds.length > 0
        ? await db
            .select()
            .from(playbookSections)
            .where(inArray(playbookSections.id, sectionIds))
        : [];
    const sectionById = new Map(sections.map((s) => [s.id, s]));

    res.json(
      ok({
        enrollment: {
          id: enrollment.id,
          programId: enrollment.playbookId,
          startDate: enrollment.startDate,
        },
        items: completed.map((c) => ({
          ...c,
          sectionName: c.sectionId ? sectionById.get(c.sectionId)?.name ?? null : null,
        })),
      }),
    );
  } catch (e: any) {
    console.error("[CLIENT] /history error:", e);
    res.status(500).json(err("INTERNAL_ERROR", e.message));
  }
});
