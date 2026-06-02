import { db } from "../db";
import {
  tenantUsers,
  playbooks,
  playbookSections,
  playbookSteps,
  playbookApplications,
} from "@shared/schema";
import { users } from "@shared/models/auth";
import { and, eq } from "drizzle-orm";

/**
 * Tenant-isolation helpers used by every admin endpoint that takes a
 * tenantId from input or operates on a tenant-scoped row by primary key.
 *
 * Today every admin user is also a super admin, so each of these resolves
 * to "yes, allow" — but the pattern is in place so adding a Coach role
 * with restricted access later (or a tenant-scoped admin) is a single-
 * file change. Defense in depth: even if the isSuperAdminGuard middleware
 * is ever removed by mistake, these checks still keep one tenant out of
 * another's data.
 */

/** Resolve the caller's `(userId, isSuperAdmin)` from req.user.claims. */
function callerContext(req: any): { userId: string | null; isSuperAdmin: boolean } {
  const userId = (req?.user?.claims?.sub as string | undefined) ?? null;
  // Pull from claims if available (faster); otherwise the caller can re-check via DB.
  return { userId, isSuperAdmin: false };
}

async function isSuperAdmin(userId: string): Promise<boolean> {
  const [u] = await db.select({ flag: users.isSuperAdmin }).from(users).where(eq(users.id, userId));
  return u?.flag === "true";
}

/**
 * True if the caller is a super admin OR has a tenant_users row for this tenant.
 * Use this whenever an admin endpoint takes a tenantId from query/body.
 */
export async function canAccessTenant(callerUserId: string, tenantId: number): Promise<boolean> {
  if (!callerUserId || !tenantId) return false;
  if (await isSuperAdmin(callerUserId)) return true;
  const [row] = await db
    .select({ id: tenantUsers.id })
    .from(tenantUsers)
    .where(and(eq(tenantUsers.tenantId, tenantId), eq(tenantUsers.userId, callerUserId)))
    .limit(1);
  return !!row;
}

/** Express helper — returns 403 and `false` if the caller can't access the tenant. */
export async function requireTenantAccess(
  req: any,
  res: any,
  tenantId: number,
): Promise<boolean> {
  const callerUserId = callerContext(req).userId;
  if (!callerUserId) {
    res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } });
    return false;
  }
  const allowed = await canAccessTenant(callerUserId, tenantId);
  if (!allowed) {
    res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Tenant access denied" } });
    return false;
  }
  return true;
}

/** Look up a row's tenantId and verify the caller can reach it. */
async function checkOwnership<T>(
  req: any,
  res: any,
  ownerLookup: () => Promise<T & { tenantId: number } | undefined>,
  notFoundMessage: string,
): Promise<(T & { tenantId: number }) | null> {
  const row = await ownerLookup();
  if (!row) {
    res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: notFoundMessage } });
    return null;
  }
  const ok = await requireTenantAccess(req, res, row.tenantId);
  return ok ? row : null;
}

export async function requireProgramAccess(req: any, res: any, programId: number) {
  return checkOwnership(
    req,
    res,
    async () => {
      const [row] = await db
        .select({ id: playbooks.id, tenantId: playbooks.tenantId })
        .from(playbooks)
        .where(eq(playbooks.id, programId));
      return row;
    },
    "Program not found",
  );
}

export async function requireSectionAccess(req: any, res: any, sectionId: number) {
  return checkOwnership(
    req,
    res,
    async () => {
      const [row] = await db
        .select({ id: playbookSections.id, tenantId: playbooks.tenantId })
        .from(playbookSections)
        .innerJoin(playbooks, eq(playbookSections.playbookId, playbooks.id))
        .where(eq(playbookSections.id, sectionId));
      return row;
    },
    "Section not found",
  );
}

export async function requireStepAccess(req: any, res: any, stepId: number) {
  return checkOwnership(
    req,
    res,
    async () => {
      const [row] = await db
        .select({ id: playbookSteps.id, tenantId: playbooks.tenantId })
        .from(playbookSteps)
        .innerJoin(playbooks, eq(playbookSteps.playbookId, playbooks.id))
        .where(eq(playbookSteps.id, stepId));
      return row;
    },
    "Step not found",
  );
}

export async function requireEnrollmentAccess(req: any, res: any, enrollmentId: number) {
  return checkOwnership(
    req,
    res,
    async () => {
      const [row] = await db
        .select({ id: playbookApplications.id, tenantId: playbookApplications.tenantId })
        .from(playbookApplications)
        .where(eq(playbookApplications.id, enrollmentId));
      return row;
    },
    "Enrollment not found",
  );
}
