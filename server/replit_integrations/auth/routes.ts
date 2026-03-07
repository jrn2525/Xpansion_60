import type { Express, RequestHandler } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import { storage } from "../../storage";
import bcrypt from "bcryptjs";
import { db } from "../../db";
import { users } from "@shared/models/auth";
import { eq } from "drizzle-orm";

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

      if (user.isSuperAdmin !== "true") {
        recordFailedAttempt(clientIp, email);
        auditLog("LOGIN_FAILED", { email, ip: clientIp, reason: "not_superadmin", userAgent: req.headers["user-agent"] });
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Admin access only" } });
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
          res.json({ ok: true, data: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, isSuperAdmin: true } });
        });
      });
    } catch (error: any) {
      console.error("[AUTH] Login error:", error);
      res.status(500).json({ ok: false, error: { code: "INTERNAL_ERROR", message: "Login failed" } });
    }
  });

  app.post("/api/auth/logout", (req: any, res) => {
    const wasLocal = req.user?.authType === "local";
    req.logout((err: any) => {
      if (err) return res.status(500).json({ ok: false, error: { code: "INTERNAL_ERROR", message: "Logout failed" } });
      req.session.destroy((err2: any) => {
        res.clearCookie("connect.sid", { path: "/" });
        auditLog("LOGOUT", { authType: wasLocal ? "local" : "replit" });
        res.json({ ok: true, data: { loggedOut: true } });
      });
    });
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
          isSuperAdmin: (user as any).isSuperAdmin === "true",
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
}
