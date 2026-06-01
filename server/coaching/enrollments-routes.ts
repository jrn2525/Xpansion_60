import { Router, type RequestHandler } from "express";
import { db } from "../db";
import {
  playbooks,
  playbookApplications,
  enrollmentPauses,
} from "@shared/schema";
import { users } from "@shared/models/auth";
import { eq, and, asc, desc, isNull, isNotNull, sql } from "drizzle-orm";
import { isAuthenticated, isSuperAdminGuard } from "../replit_integrations/auth/replitAuth";
import { z } from "zod";
import { computeSchedule, type PauseRange } from "./schedule";

export const enrollmentsRouter = Router();

function ok(data: unknown) {
  return { ok: true, data };
}
function err(code: string, message: string) {
  return { ok: false, error: { code, message } };
}

const guard: RequestHandler[] = [isAuthenticated, isSuperAdminGuard];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

async function loadPauses(enrollmentId: number): Promise<PauseRange[]> {
  const rows = await db
    .select()
    .from(enrollmentPauses)
    .where(eq(enrollmentPauses.enrollmentId, enrollmentId))
    .orderBy(asc(enrollmentPauses.pauseStart));
  return rows.map((r) => ({
    pauseStart: r.pauseStart,
    pauseEnd: r.pauseEnd,
  }));
}

function activePauseFor(rawPauses: { pauseStart: string; pauseEnd: string | null }[], today: string) {
  return (
    rawPauses.find(
      (p) =>
        today >= p.pauseStart && (p.pauseEnd === null || today <= p.pauseEnd),
    ) ?? null
  );
}

// GET /api/admin/enrollments?tenantId=N — list with computed schedule status
enrollmentsRouter.get("/", ...guard, async (req, res) => {
  try {
    const tenantId = Number(req.query.tenantId);
    if (!tenantId || Number.isNaN(tenantId)) {
      return res
        .status(400)
        .json(err("VALIDATION_ERROR", "tenantId query parameter is required"));
    }

    const rows = await db
      .select({
        id: playbookApplications.id,
        playbookId: playbookApplications.playbookId,
        enrolledUserId: playbookApplications.enrolledUserId,
        appliedByUserId: playbookApplications.appliedByUserId,
        startDate: playbookApplications.startDate,
        status: playbookApplications.status,
        completedAt: playbookApplications.completedAt,
        createdAt: playbookApplications.createdAt,
        programName: playbooks.name,
        totalWeekdays: playbooks.totalWeekdays,
        clientEmail: users.email,
        clientFirstName: users.firstName,
        clientLastName: users.lastName,
      })
      .from(playbookApplications)
      .innerJoin(playbooks, eq(playbookApplications.playbookId, playbooks.id))
      .leftJoin(users, eq(playbookApplications.enrolledUserId, users.id))
      .where(
        and(
          eq(playbookApplications.tenantId, tenantId),
          isNotNull(playbookApplications.enrolledUserId),
        ),
      )
      .orderBy(desc(playbookApplications.createdAt));

    const today = todayISO();
    const enriched = await Promise.all(
      rows.map(async (r) => {
        const pauses = await loadPauses(r.id);
        const schedule = r.startDate
          ? computeSchedule({
              startDate: r.startDate,
              today,
              totalWeekdays: r.totalWeekdays,
              pauses,
            })
          : { status: "before_start" as const, startDate: "" };
        const activePause = activePauseFor(pauses, today);
        return {
          ...r,
          schedule,
          pauseCount: pauses.length,
          activePause,
        };
      }),
    );

    res.json(ok(enriched));
  } catch (e: any) {
    res.status(500).json(err("INTERNAL_ERROR", e.message));
  }
});

// POST /api/admin/enrollments — enroll a client in a program
const createEnrollmentSchema = z.object({
  tenantId: z.number().int().positive(),
  playbookId: z.number().int().positive(),
  enrolledUserId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
});

enrollmentsRouter.post("/", ...guard, async (req: any, res) => {
  try {
    const parsed = createEnrollmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(err("VALIDATION_ERROR", parsed.error.message));
    }
    const { tenantId, playbookId, enrolledUserId, startDate } = parsed.data;
    const appliedByUserId = req.user?.claims?.sub;

    // Prevent duplicate enrollment of the same user in the same program
    const existing = await db
      .select({ id: playbookApplications.id })
      .from(playbookApplications)
      .where(
        and(
          eq(playbookApplications.tenantId, tenantId),
          eq(playbookApplications.playbookId, playbookId),
          eq(playbookApplications.enrolledUserId, enrolledUserId),
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      return res
        .status(409)
        .json(err("CONFLICT", "This client is already enrolled in this program"));
    }

    const [row] = await db
      .insert(playbookApplications)
      .values({
        tenantId,
        playbookId,
        enrolledUserId,
        appliedByUserId,
        startDate,
        status: "active",
      })
      .returning();

    res.status(201).json(ok(row));
  } catch (e: any) {
    res.status(500).json(err("INTERNAL_ERROR", e.message));
  }
});

// DELETE /api/admin/enrollments/:id — cancel an enrollment
enrollmentsRouter.delete("/:id", ...guard, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const result = await db
      .delete(playbookApplications)
      .where(eq(playbookApplications.id, id))
      .returning();
    if (result.length === 0) {
      return res.status(404).json(err("NOT_FOUND", "Enrollment not found"));
    }
    res.json(ok({ deleted: true }));
  } catch (e: any) {
    res.status(500).json(err("INTERNAL_ERROR", e.message));
  }
});

// GET /api/admin/enrollments/:id — single enrollment with pauses
enrollmentsRouter.get("/:id", ...guard, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [enrollment] = await db
      .select()
      .from(playbookApplications)
      .where(eq(playbookApplications.id, id));
    if (!enrollment) {
      return res.status(404).json(err("NOT_FOUND", "Enrollment not found"));
    }
    const pauses = await db
      .select()
      .from(enrollmentPauses)
      .where(eq(enrollmentPauses.enrollmentId, id))
      .orderBy(asc(enrollmentPauses.pauseStart));
    res.json(ok({ enrollment, pauses }));
  } catch (e: any) {
    res.status(500).json(err("INTERNAL_ERROR", e.message));
  }
});

// POST /api/admin/enrollments/:id/pauses — create a pause
const createPauseSchema = z.object({
  pauseStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pauseEnd: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  reason: z.string().nullable().optional(),
});

enrollmentsRouter.post("/:id/pauses", ...guard, async (req: any, res) => {
  try {
    const id = Number(req.params.id);
    const parsed = createPauseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(err("VALIDATION_ERROR", parsed.error.message));
    }
    const [row] = await db
      .insert(enrollmentPauses)
      .values({
        enrollmentId: id,
        pauseStart: parsed.data.pauseStart,
        pauseEnd: parsed.data.pauseEnd ?? null,
        reason: parsed.data.reason ?? null,
        createdByUserId: req.user?.claims?.sub,
      })
      .returning();
    res.status(201).json(ok(row));
  } catch (e: any) {
    res.status(500).json(err("INTERNAL_ERROR", e.message));
  }
});

// PUT /api/admin/enrollments/:id/pauses/:pauseId — end a pause early or edit
const updatePauseSchema = z.object({
  pauseEnd: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  reason: z.string().nullable().optional(),
});

enrollmentsRouter.put("/:id/pauses/:pauseId", ...guard, async (req, res) => {
  try {
    const pauseId = Number(req.params.pauseId);
    const parsed = updatePauseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(err("VALIDATION_ERROR", parsed.error.message));
    }
    const [row] = await db
      .update(enrollmentPauses)
      .set(parsed.data)
      .where(eq(enrollmentPauses.id, pauseId))
      .returning();
    if (!row) {
      return res.status(404).json(err("NOT_FOUND", "Pause not found"));
    }
    res.json(ok(row));
  } catch (e: any) {
    res.status(500).json(err("INTERNAL_ERROR", e.message));
  }
});
