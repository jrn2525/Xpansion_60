import type { Express, RequestHandler } from "express";
import { authStorage } from "./storage";
import { isAuthenticated, isSuperAdminGuard } from "./session";
import { storage } from "../storage";
import bcrypt from "bcryptjs";
import { db } from "../db";
import { users } from "@shared/models/auth";
import { accountActivationTokens } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";

const USER_TYPES = ["admin", "coach", "client"] as const;
type UserType = (typeof USER_TYPES)[number];
function isUserType(value: unknown): value is UserType {
  return typeof value === "string" && (USER_TYPES as readonly string[]).includes(value);
}
import { randomUUID, randomBytes } from "crypto";
import { sendCoachingEmail } from "../coaching/cron";
import { z } from "zod";

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_IP = 20;
const MAX_ATTEMPTS_PER_ACCOUNT = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

const ipAttempts = new Map<string, { count: number; firstAttempt: number }>();
const accountAttempts = new Map<string, { count: number; firstAttempt: number; lockedUntil: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of ipAttempts) {
    if (now - val.firstAttempt > LOGIN_WINDOW_MS) ipAttempts.delete(key);
  }
  for (const [key, val] of accountAttempts) {
    if (now - val.firstAttempt > LOGIN_WINDOW_MS && now > val.lockedUntil) accountAttempts.delete(key);
  }
}, 60 * 1000);

function checkRateLimit(ip: string, email: string): string | null {
  const now = Date.now();

  const acct = accountAttempts.get(email);
  if (acct && acct.lockedUntil > now) {
    const remainSec = Math.ceil((acct.lockedUntil - now) / 1000);
    return `Account temporarily locked. Try again in ${remainSec}s`;
  }

  const ipEntry = ipAttempts.get(ip);
  if (ipEntry) {
    if (now - ipEntry.firstAttempt > LOGIN_WINDOW_MS) {
      ipAttempts.set(ip, { count: 1, firstAttempt: now });
    } else if (ipEntry.count >= MAX_ATTEMPTS_PER_IP) {
      return "Too many login attempts from this IP. Try again later";
    }
  }

  return null;
}

function recordFailedAttempt(ip: string, email: string): void {
  const now = Date.now();

  const acct = accountAttempts.get(email);
  if (!acct || now - acct.firstAttempt > LOGIN_WINDOW_MS) {
    accountAttempts.set(email, { count: 1, firstAttempt: now, lockedUntil: 0 });
  } else {
    acct.count++;
    if (acct.count >= MAX_ATTEMPTS_PER_ACCOUNT) {
      acct.lockedUntil = now + LOCKOUT_DURATION_MS;
    }
  }
}

function recordAttempt(ip: string): void {
  const now = Date.now();
  const ipEntry = ipAttempts.get(ip);
  if (!ipEntry || now - ipEntry.firstAttempt > LOGIN_WINDOW_MS) {
    ipAttempts.set(ip, { count: 1, firstAttempt: now });
  } else {
    ipEntry.count++;
  }
}

function clearAttempts(ip: string, email: string): void {
  ipAttempts.delete(ip);
  accountAttempts.delete(email);
}

export function clearAccountLockout(email: string): boolean {
  const existed = accountAttempts.has(email);
  accountAttempts.delete(email);
  return existed;
}

export function getLoginStats() {
  const now = Date.now();
  let lockedAccounts = 0;
  for (const [, val] of accountAttempts) {
    if (val.lockedUntil > now) lockedAccounts++;
  }
  return { totalTrackedIPs: ipAttempts.size, totalTrackedAccounts: accountAttempts.size, lockedAccounts };
}

function validatePassword(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Z]/.test(password)) return "Password must contain an uppercase letter";
  if (!/[a-z]/.test(password)) return "Password must contain a lowercase letter";
  if (!/[0-9]/.test(password)) return "Password must contain a number";
  return null;
}

function auditLog(event: string, details: Record<string, unknown>): void {
  const safe = { ...details };
  delete safe.password;
  delete safe.passwordHash;
  console.log(`[AUDIT] ${event}`, JSON.stringify(safe));

  storage.getTenants().then((tenants) => {
    const tenantId = tenants[0]?.id || 1;
    storage.createAuditLog({
      tenantId,
      actorUserId: (safe.userId as string) || (safe.email as string) || "unknown",
      entityType: "auth",
      entityId: (safe.email as string) || "unknown",
      action: event.toLowerCase(),
      afterJson: JSON.stringify(safe),
    }).catch(() => {});
  }).catch(() => {});
}

export async function seedSuperAdmin(): Promise<void> {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.log("[SEED] ADMIN_EMAIL or ADMIN_PASSWORD not set, skipping admin seed");
    return;
  }

  const policyError = validatePassword(password);
  if (policyError) {
    console.error(`[SEED] ADMIN_PASSWORD does not meet policy: ${policyError}`);
    return;
  }

  // Backfill userType for any legacy rows missing it. Existing super admins
  // become 'admin'; everyone else becomes 'client'. Idempotent.
  try {
    await db
      .update(users)
      .set({ userType: "admin" })
      .where(and(isNull(users.userType), eq(users.isSuperAdmin, "true")));
    await db.update(users).set({ userType: "client" }).where(isNull(users.userType));
  } catch (e) {
    console.error("[SEED] userType backfill failed:", e);
  }

  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) {
    const updates: any = {};
    if (!existing.passwordHash) {
      updates.passwordHash = await bcrypt.hash(password, 12);
    } else {
      const matches = await bcrypt.compare(password, existing.passwordHash);
      if (!matches) {
        updates.passwordHash = await bcrypt.hash(password, 12);
      }
    }
    if (existing.isSuperAdmin !== "true") {
      updates.isSuperAdmin = "true";
    }
    if ((existing as any).userType !== "admin") {
      updates.userType = "admin";
    }
    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date();
      await db.update(users).set(updates).where(eq(users.id, existing.id));
      console.log(`[SEED] Updated existing user ${email}: ${Object.keys(updates).join(", ")}`);
    } else {
      console.log(`[SEED] Superadmin ${email} already exists`);
    }
    return;
  }

  const hash = await bcrypt.hash(password, 12);
  const adminId = `admin-${Date.now()}`;
  await db.insert(users).values({
    id: adminId,
    email,
    firstName: "Admin",
    lastName: "User",
    passwordHash: hash,
    isSuperAdmin: "true",
    userType: "admin",
  });

  const allTenants = await storage.getTenants();
  for (const tenant of allTenants) {
    const existingTu = await storage.getTenantUserByUserId(tenant.id, adminId);
    if (!existingTu) {
      await storage.createTenantUser({ tenantId: tenant.id, userId: adminId, role: "owner" });
    }
  }
  console.log(`[SEED] Superadmin ${email} created and assigned to ${allTenants.length} tenant(s)`);
}

export function registerAuthRoutes(app: Express): void {
  app.post("/api/auth/login", async (req: any, res) => {
    const clientIp = req.ip || req.socket?.remoteAddress || "unknown";
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Email and password required" } });
      }

      const rateLimitMsg = checkRateLimit(clientIp, email);
      if (rateLimitMsg) {
        auditLog("LOGIN_RATE_LIMITED", { email, ip: clientIp });
        return res.status(429).json({ ok: false, error: { code: "RATE_LIMITED", message: rateLimitMsg } });
      }

      recordAttempt(clientIp);

      const [user] = await db.select().from(users).where(eq(users.email, email));
      if (!user || !user.passwordHash) {
        recordFailedAttempt(clientIp, email);
        auditLog("LOGIN_FAILED", { email, ip: clientIp, reason: "user_not_found", userAgent: req.headers["user-agent"] });
        return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED", message: "Invalid email or password" } });
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        recordFailedAttempt(clientIp, email);
        auditLog("LOGIN_FAILED", { email, ip: clientIp, reason: "bad_password", userAgent: req.headers["user-agent"] });
        return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED", message: "Invalid email or password" } });
      }

      if ((user as any).suspendedAt) {
        auditLog("LOGIN_BLOCKED_SUSPENDED", { email, userId: user.id, ip: clientIp });
        return res.status(403).json({ ok: false, error: { code: "ACCOUNT_SUSPENDED", message: "This account is suspended. Contact your coach." } });
      }

      const sessionUser = {
        authType: "local",
        claims: {
          sub: user.id,
          email: user.email,
          first_name: user.firstName,
          last_name: user.lastName,
        },
      };

      req.session.regenerate((regenErr: any) => {
        if (regenErr) {
          console.error("[AUTH] Session regenerate error:", regenErr);
          return res.status(500).json({ ok: false, error: { code: "INTERNAL_ERROR", message: "Session error" } });
        }
        req.login(sessionUser, (err: any) => {
          if (err) {
            console.error("[AUTH] Login session error:", err);
            return res.status(500).json({ ok: false, error: { code: "INTERNAL_ERROR", message: "Session error" } });
          }
          clearAttempts(clientIp, email);
          auditLog("LOGIN_SUCCESS", { userId: user.id, email, ip: clientIp, userAgent: req.headers["user-agent"] });
          db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id)).catch((e: any) => console.error("[AUTH] Failed to update lastLoginAt:", e));
          res.json({ ok: true, data: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, isSuperAdmin: user.isSuperAdmin === "true", mustChangePassword: user.mustChangePassword === true } });
        });
      });
    } catch (error: any) {
      console.error("[AUTH] Login error:", error);
      res.status(500).json({ ok: false, error: { code: "INTERNAL_ERROR", message: "Login failed" } });
    }
  });

  // POST /api/auth/activate — first-time password set via the emailed link.
  // Public (no isAuthenticated): the token IS the credential.
  const activateSchema = z.object({
    token: z.string().min(8),
    password: z.string().min(8),
  }).strict();
  app.post("/api/auth/activate", async (req: any, res) => {
    try {
      const parsed = activateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ ok: false, error: { code: "VALIDATION_ERROR", message: parsed.error.message } });
      }
      const { token, password } = parsed.data;
      const policyError = validatePassword(password);
      if (policyError) {
        return res.status(400).json({ ok: false, error: { code: "VALIDATION_ERROR", message: policyError } });
      }

      const [row] = await db
        .select()
        .from(accountActivationTokens)
        .where(eq(accountActivationTokens.token, token));
      if (!row) {
        return res.status(400).json({ ok: false, error: { code: "INVALID_TOKEN", message: "This activation link is not valid." } });
      }
      if (row.usedAt) {
        return res.status(400).json({ ok: false, error: { code: "TOKEN_USED", message: "This activation link has already been used. Sign in with your password." } });
      }
      if (row.expiresAt.getTime() < Date.now()) {
        return res.status(400).json({ ok: false, error: { code: "TOKEN_EXPIRED", message: "This activation link has expired. Ask your coach to send a new one." } });
      }

      const [user] = await db.select().from(users).where(eq(users.id, row.userId));
      if (!user) {
        return res.status(400).json({ ok: false, error: { code: "INVALID_TOKEN", message: "This activation link is not valid." } });
      }
      if ((user as any).suspendedAt) {
        return res.status(403).json({ ok: false, error: { code: "ACCOUNT_SUSPENDED", message: "This account is suspended." } });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      await db.update(users).set({
        passwordHash,
        mustChangePassword: false,
        updatedAt: new Date(),
      }).where(eq(users.id, user.id));
      await db.update(accountActivationTokens).set({ usedAt: new Date() }).where(eq(accountActivationTokens.id, row.id));

      auditLog("ACCOUNT_ACTIVATED", { userId: user.id, email: user.email });
      res.json({ ok: true, data: { email: user.email } });
    } catch (e: any) {
      console.error("[AUTH] Activate error:", e);
      res.status(500).json({ ok: false, error: { code: "INTERNAL_ERROR", message: e.message } });
    }
  });

  app.post("/api/auth/logout", (req: any, res) => {
    const wasLocal = req.user?.authType === "local";
    req.logout((err: any) => {
      if (err) return res.status(500).json({ ok: false, error: { code: "INTERNAL_ERROR", message: "Logout failed" } });
      req.session.destroy((err2: any) => {
        res.clearCookie("connect.sid", { path: "/" });
        auditLog("LOGOUT", { authType: wasLocal ? "local" : "unknown" });
        res.json({ ok: true, data: { loggedOut: true } });
      });
    });
  });

  // Sign out of every active session for this user, on every device.
  app.post("/api/auth/logout-everywhere", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const count = await storage.deleteSessionsByUserId(userId).catch(() => 0);
      auditLog("LOGOUT_EVERYWHERE", { userId, sessionsDeleted: count });
      // Clear THIS request's cookie too — the row is already gone.
      req.logout(() => {
        req.session?.destroy(() => {
          res.clearCookie("connect.sid", { path: "/" });
          res.json({ ok: true, data: { sessionsDeleted: count } });
        });
      });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: { code: "INTERNAL_ERROR", message: e.message } });
    }
  });

  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      if (user) {
        const { passwordHash, ...safeUser } = user as any;
        res.json(safeUser);
      } else {
        res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "User not found" } });
      }
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ ok: false, error: { code: "INTERNAL_ERROR", message: "Failed to fetch user" } });
    }
  });

  app.get("/api/auth/me", async (req: any, res) => {
    if (!req.isAuthenticated || !req.isAuthenticated() || !req.user?.claims?.sub) {
      return res.status(401).json({
        ok: false,
        error: { code: "UNAUTHORIZED", message: "Unauthorized" },
      });
    }

    try {
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      if (!user) {
        return res.status(401).json({
          ok: false,
          error: { code: "UNAUTHORIZED", message: "Unauthorized" },
        });
      }

      const tenantUsers = await storage.getUserTenants(userId);

      res.json({
        ok: true,
        data: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          profileImageUrl: user.profileImageUrl,
          phone: (user as any).phone,
          jobTitle: (user as any).jobTitle,
          isSuperAdmin: (user as any).isSuperAdmin === "true",
          mustChangePassword: (user as any).mustChangePassword === true,
          tenants: tenantUsers.map((tu: any) => ({
            tenantId: tu.tenantId,
            role: tu.role,
            tenantName: tu.tenant?.name,
          })),
        },
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({
        ok: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to fetch user" },
      });
    }
  });

  app.get("/api/admin/users", isAuthenticated, isSuperAdminGuard, async (req: any, res) => {
    try {
      const allUsers = await db.select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
        businessName: users.businessName,
        isSuperAdmin: users.isSuperAdmin,
        userType: users.userType,
        suspendedAt: users.suspendedAt,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      }).from(users).orderBy(users.createdAt);
      res.json({ ok: true, data: allUsers });
    } catch (error: any) {
      res.status(500).json({ ok: false, error: { code: "INTERNAL_ERROR", message: error.message } });
    }
  });

  app.get("/api/admin/clients", isAuthenticated, isSuperAdminGuard, async (req: any, res) => {
    try {
      const { ne } = await import("drizzle-orm");
      const { onboardingProgress, tenants, tenantUsers } = await import("@shared/schema");

      const clientUsers = await db.select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
        jobTitle: users.jobTitle,
        mustChangePassword: users.mustChangePassword,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      }).from(users).where(ne(users.isSuperAdmin, "true")).orderBy(users.createdAt);

      const clientIds = clientUsers.map(u => u.id);

      const allProgress = clientIds.length > 0
        ? await db.select().from(onboardingProgress).where(
            (await import("drizzle-orm")).inArray(onboardingProgress.userId, clientIds)
          )
        : [];

      const allMemberships = clientIds.length > 0
        ? await db.select({
            userId: tenantUsers.userId,
            tenantId: tenantUsers.tenantId,
            role: tenantUsers.role,
          }).from(tenantUsers).where(
            (await import("drizzle-orm")).inArray(tenantUsers.userId, clientIds)
          )
        : [];

      const tenantIds = [...new Set(allMemberships.map(m => m.tenantId))];
      const allTenants = tenantIds.length > 0
        ? await db.select({ id: tenants.id, name: tenants.name }).from(tenants).where(
            (await import("drizzle-orm")).inArray(tenants.id, tenantIds)
          )
        : [];
      const tenantMap = Object.fromEntries(allTenants.map(t => [t.id, t.name]));

      const clients = clientUsers.map(u => {
        const progress = allProgress.find(p => p.userId === u.id);
        const memberships = allMemberships.filter(m => m.userId === u.id);
        const primaryTenantId = memberships.length > 0 ? memberships[0].tenantId : null;

        let status = "invited";
        if (progress?.isComplete) status = "active";
        else if (progress && progress.currentStep > 0) status = "onboarding";
        else if (u.lastLoginAt) status = "logged_in";

        const daysSinceLogin = u.lastLoginAt
          ? Math.floor((Date.now() - new Date(u.lastLoginAt).getTime()) / (1000 * 60 * 60 * 24))
          : null;
        const needsAttention = (status === "onboarding" && daysSinceLogin !== null && daysSinceLogin > 3)
          || (status === "invited" && !u.lastLoginAt);

        return {
          ...u,
          status,
          onboardingStep: progress?.currentStep || 0,
          onboardingTotal: 6,
          completedSteps: progress?.completedSteps || [],
          businessName: tenantMap[primaryTenantId!] || null,
          tenantId: primaryTenantId,
          daysSinceLogin,
          needsAttention,
        };
      });

      res.json({ ok: true, data: clients });
    } catch (error: any) {
      console.error("[ADMIN] Clients list error:", error);
      res.status(500).json({ ok: false, error: { code: "INTERNAL_ERROR", message: error.message } });
    }
  });

  const createUserSchema = z.object({
    email: z.string().min(1),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    phone: z.string().optional(),
    businessName: z.string().optional(),
    userType: z.enum(["admin", "coach", "client"]).optional(),
  }).strict();

  app.post("/api/admin/users", isAuthenticated, isSuperAdminGuard, async (req: any, res) => {
    try {
      const parsed = createUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ ok: false, error: { code: "VALIDATION_ERROR", message: parsed.error.message } });
      }
      const { email, firstName, lastName, phone, businessName, userType } = parsed.data;
      if (!email) {
        return res.status(400).json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Email is required" } });
      }
      if (userType !== undefined && !isUserType(userType)) {
        return res.status(400).json({ ok: false, error: { code: "VALIDATION_ERROR", message: `userType must be one of: ${USER_TYPES.join(", ")}` } });
      }

      const [existing] = await db.select().from(users).where(eq(users.email, email));
      if (existing) {
        return res.status(409).json({ ok: false, error: { code: "CONFLICT", message: "A user with this email already exists" } });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid email format" } });
      }

      // Generate a random unguessable password the user never sees. They'll
      // set their own via the activation link in the welcome email. We still
      // bcrypt-hash this so the column is populated and login attempts before
      // activation fail at the password check rather than from a null hash.
      const placeholderPassword = randomBytes(24).toString("hex");
      const effectiveType: UserType = (userType as UserType | undefined) ?? "client";
      const passwordHash = await bcrypt.hash(placeholderPassword, 10);
      const userId = `user-${randomUUID()}`;
      const [newUser] = await db.insert(users).values({
        id: userId,
        email,
        firstName: firstName || null,
        lastName: lastName || null,
        phone: phone || null,
        businessName: businessName || null,
        passwordHash,
        isSuperAdmin: effectiveType === "admin" ? "true" : "false",
        userType: effectiveType,
        mustChangePassword: true,
      }).returning();

      // Mint a one-time activation token. 7-day TTL is plenty.
      const token = randomBytes(48).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await db.insert(accountActivationTokens).values({
        token,
        userId,
        expiresAt,
      });
      const appUrl = process.env.APP_URL ?? "https://www.xpansion60.com";
      const activationUrl = `${appUrl.replace(/\/$/, "")}/activate?token=${token}`;

      auditLog("USER_CREATED", {
        createdBy: req.user.claims.sub,
        newUserId: userId,
        email,
        businessName: businessName || null,
        userType: effectiveType,
      });

      // Welcome email goes through the admin-editable template system. We
      // need a tenantId for the template lookup — in v1 there's only one
      // tenant, so we pick the first. Multi-tenant future will need an
      // explicit tenantId on the create-user request.
      try {
        const [firstTenant] = await storage.getTenants();
        if (firstTenant) {
          await sendCoachingEmail({
            tenantId: firstTenant.id,
            templateKey: "welcome",
            entityId: `welcome:${userId}`,
            to: email,
            vars: {
              client_first_name: firstName || "there",
              client_email: email,
              activation_url: activationUrl,
            },
          });
        } else {
          console.warn("[AUTH] No tenants found — skipping welcome email");
        }
      } catch (emailErr: any) {
        console.error("[AUTH] Welcome email failed:", emailErr?.message ?? emailErr);
      }

      const { passwordHash: _, ...safeUser } = newUser as any;
      res.status(201).json({ ok: true, data: safeUser });
    } catch (error: any) {
      console.error("[AUTH] Create user error:", error);
      res.status(500).json({ ok: false, error: { code: "INTERNAL_ERROR", message: error.message } });
    }
  });

  const updateUserSchema = z.object({
    email: z.string().min(1).optional(),
    password: z.string().min(8).optional(),
    firstName: z.string().nullable().optional(),
    lastName: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    businessName: z.string().nullable().optional(),
    userType: z.enum(["admin", "coach", "client"]).optional(),
  }).strict();

  app.put("/api/admin/users/:id", isAuthenticated, isSuperAdminGuard, async (req: any, res) => {
    try {
      const userId = req.params.id;
      const parsed = updateUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ ok: false, error: { code: "VALIDATION_ERROR", message: parsed.error.message } });
      }
      const { email, firstName, lastName, phone, businessName, password, userType } = parsed.data;

      const [target] = await db.select().from(users).where(eq(users.id, userId));
      if (!target) {
        return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "User not found" } });
      }

      const updates: any = { updatedAt: new Date() };
      if (email !== undefined) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return res.status(400).json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid email format" } });
        }
        if (email !== target.email) {
          const [dup] = await db.select().from(users).where(eq(users.email, email));
          if (dup && dup.id !== userId) {
            return res.status(409).json({ ok: false, error: { code: "CONFLICT", message: "Another user already has this email" } });
          }
          updates.email = email;
        }
      }
      if (firstName !== undefined) updates.firstName = firstName || null;
      if (lastName !== undefined) updates.lastName = lastName || null;
      if (phone !== undefined) updates.phone = phone || null;
      if (businessName !== undefined) updates.businessName = businessName || null;
      if (userType !== undefined) {
        if (!isUserType(userType)) {
          return res.status(400).json({ ok: false, error: { code: "VALIDATION_ERROR", message: `userType must be one of: ${USER_TYPES.join(", ")}` } });
        }
        if (userId === req.user.claims.sub && userType !== "admin") {
          return res.status(400).json({ ok: false, error: { code: "VALIDATION_ERROR", message: "You can't change your own user type away from admin" } });
        }
        updates.userType = userType;
        updates.isSuperAdmin = userType === "admin" ? "true" : "false";
      }
      if (password) {
        if (password.length < 8) {
          return res.status(400).json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Password must be at least 8 characters" } });
        }
        updates.passwordHash = await bcrypt.hash(password, 10);
        updates.mustChangePassword = true;
      }

      const [updated] = await db.update(users).set(updates).where(eq(users.id, userId)).returning();
      auditLog("USER_UPDATED", { updatedBy: req.user.claims.sub, targetUserId: userId, fields: Object.keys(updates) });
      const { passwordHash: _, ...safeUser } = updated as any;
      res.json({ ok: true, data: safeUser });
    } catch (error: any) {
      console.error("[AUTH] Update user error:", error);
      res.status(500).json({ ok: false, error: { code: "INTERNAL_ERROR", message: error.message } });
    }
  });

  app.post("/api/admin/users/:id/suspend", isAuthenticated, isSuperAdminGuard, async (req: any, res) => {
    try {
      const userId = req.params.id;
      if (userId === req.user.claims.sub) {
        return res.status(400).json({ ok: false, error: { code: "VALIDATION_ERROR", message: "You can't suspend yourself" } });
      }
      const [updated] = await db.update(users).set({ suspendedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, userId)).returning();
      if (!updated) {
        return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "User not found" } });
      }
      await storage.deleteSessionsByUserId(userId).catch(() => {});
      auditLog("USER_SUSPENDED", { suspendedBy: req.user.claims.sub, targetUserId: userId });
      res.json({ ok: true, data: { suspended: true } });
    } catch (error: any) {
      res.status(500).json({ ok: false, error: { code: "INTERNAL_ERROR", message: error.message } });
    }
  });

  app.post("/api/admin/users/:id/unsuspend", isAuthenticated, isSuperAdminGuard, async (req: any, res) => {
    try {
      const userId = req.params.id;
      const [updated] = await db.update(users).set({ suspendedAt: null, updatedAt: new Date() }).where(eq(users.id, userId)).returning();
      if (!updated) {
        return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "User not found" } });
      }
      auditLog("USER_UNSUSPENDED", { unsuspendedBy: req.user.claims.sub, targetUserId: userId });
      res.json({ ok: true, data: { suspended: false } });
    } catch (error: any) {
      res.status(500).json({ ok: false, error: { code: "INTERNAL_ERROR", message: error.message } });
    }
  });

  app.delete("/api/admin/users/:id", isAuthenticated, isSuperAdminGuard, async (req: any, res) => {
    try {
      const userId = req.params.id;
      if (userId === req.user.claims.sub) {
        return res.status(400).json({ ok: false, error: { code: "VALIDATION_ERROR", message: "You can't delete yourself" } });
      }
      const [target] = await db.select().from(users).where(eq(users.id, userId));
      if (!target) {
        return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "User not found" } });
      }
      await storage.deleteSessionsByUserId(userId).catch(() => {});
      await db.delete(users).where(eq(users.id, userId));
      auditLog("USER_DELETED", { deletedBy: req.user.claims.sub, targetUserId: userId, email: target.email });
      res.json({ ok: true, data: { deleted: true } });
    } catch (error: any) {
      console.error("[AUTH] Delete user error:", error);
      res.status(500).json({ ok: false, error: { code: "INTERNAL_ERROR", message: error.message } });
    }
  });

  app.put("/api/auth/change-password", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { currentPassword, newPassword } = req.body;

      if (!newPassword || newPassword.length < 8) {
        return res.status(400).json({ ok: false, error: { code: "VALIDATION_ERROR", message: "New password must be at least 8 characters" } });
      }

      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) {
        return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "User not found" } });
      }

      if (user.passwordHash) {
        if (!currentPassword) {
          return res.status(400).json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Current password is required" } });
        }
        const valid = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!valid) {
          return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED", message: "Current password is incorrect" } });
        }
      }

      const newHash = await bcrypt.hash(newPassword, 10);
      await db.update(users).set({
        passwordHash: newHash,
        mustChangePassword: false,
        updatedAt: new Date(),
      }).where(eq(users.id, userId));

      auditLog("PASSWORD_CHANGED", { userId });
      res.json({ ok: true, data: { message: "Password updated successfully" } });
    } catch (error: any) {
      console.error("[AUTH] Change password error:", error);
      res.status(500).json({ ok: false, error: { code: "INTERNAL_ERROR", message: error.message } });
    }
  });

  app.put("/api/auth/profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { firstName, lastName, phone, jobTitle, profileImageUrl } = req.body;

      const updates: any = { updatedAt: new Date() };
      if (firstName !== undefined) updates.firstName = firstName;
      if (lastName !== undefined) updates.lastName = lastName;
      if (phone !== undefined) updates.phone = phone;
      if (jobTitle !== undefined) updates.jobTitle = jobTitle;
      if (profileImageUrl !== undefined) updates.profileImageUrl = profileImageUrl;

      const [updated] = await db.update(users).set(updates).where(eq(users.id, userId)).returning();
      const { passwordHash: _, ...safeUser } = updated as any;

      auditLog("PROFILE_UPDATED", { userId });
      res.json({ ok: true, data: safeUser });
    } catch (error: any) {
      console.error("[AUTH] Profile update error:", error);
      res.status(500).json({ ok: false, error: { code: "INTERNAL_ERROR", message: error.message } });
    }
  });
}


