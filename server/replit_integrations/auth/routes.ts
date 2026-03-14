import type { Express, RequestHandler } from "express";
import { authStorage } from "./storage";
import { isAuthenticated, isSuperAdminGuard } from "./replitAuth";
import { storage } from "../../storage";
import bcrypt from "bcryptjs";
import { db } from "../../db";
import { users } from "@shared/models/auth";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { sendEmail } from "../../services/notifications";

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
          res.json({ ok: true, data: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, isSuperAdmin: user.isSuperAdmin === "true", mustChangePassword: user.mustChangePassword === true } });
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
        isSuperAdmin: users.isSuperAdmin,
        createdAt: users.createdAt,
      }).from(users).orderBy(users.createdAt);
      res.json({ ok: true, data: allUsers });
    } catch (error: any) {
      res.status(500).json({ ok: false, error: { code: "INTERNAL_ERROR", message: error.message } });
    }
  });

  app.post("/api/admin/users", isAuthenticated, isSuperAdminGuard, async (req: any, res) => {
    try {
      const { email, firstName, lastName, password, tenantId, role } = req.body;
      if (!email || !password) {
        return res.status(400).json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Email and password are required" } });
      }
      if (password.length < 8) {
        return res.status(400).json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Password must be at least 8 characters" } });
      }

      const [existing] = await db.select().from(users).where(eq(users.email, email));
      if (existing) {
        return res.status(409).json({ ok: false, error: { code: "CONFLICT", message: "A user with this email already exists" } });
      }

      const validRoles = ["viewer", "manager", "admin", "owner"];
      if (role && !validRoles.includes(role)) {
        return res.status(400).json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid role. Must be one of: " + validRoles.join(", ") } });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid email format" } });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const userId = `user-${randomUUID()}`;
      const [newUser] = await db.insert(users).values({
        id: userId,
        email,
        firstName: firstName || null,
        lastName: lastName || null,
        passwordHash,
        isSuperAdmin: "false",
        mustChangePassword: true,
      }).returning();

      if (tenantId) {
        const tid = parseInt(tenantId);
        if (!isNaN(tid)) {
          await storage.createTenantUser({ tenantId: tid, userId, role: role || "owner" });
        }
      }

      auditLog("USER_CREATED", {
        createdBy: req.user.claims.sub,
        newUserId: userId,
        email,
        tenantId: tenantId || null,
        role: role || null,
      });

      const appUrl = `https://${req.get("host")}`;
      const clientName = firstName || "there";
      try {
        await sendEmail(
          email,
          "Welcome to Xpansion Console — Your Account is Ready",
          buildWelcomeEmail(clientName, email, password, appUrl)
        );
      } catch (emailErr: any) {
        console.error("[AUTH] Welcome email failed:", emailErr.message);
      }

      const { passwordHash: _, ...safeUser } = newUser as any;
      res.status(201).json({ ok: true, data: safeUser });
    } catch (error: any) {
      console.error("[AUTH] Create user error:", error);
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

function buildWelcomeEmail(name: string, email: string, password: string, appUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background:linear-gradient(135deg,#dc2626,#b91c1c);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">Xpansion Console</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:13px;letter-spacing:1px;text-transform:uppercase;">Franchise Intelligence Platform</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              <h2 style="margin:0 0 16px;color:#18181b;font-size:20px;font-weight:600;">Welcome, ${name}!</h2>
              <p style="margin:0 0 24px;color:#3f3f46;font-size:15px;line-height:1.6;">
                Your account has been created and is ready to go. Sign in to set up your business profile and start tracking the metrics that matter most to your franchise.
              </p>
              <div style="background-color:#fafafa;border:1px solid #e4e4e7;border-radius:8px;padding:20px;margin:0 0 24px;">
                <p style="margin:0 0 12px;font-size:13px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Your Login Credentials</p>
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:6px 0;color:#52525b;font-size:14px;width:80px;">Email:</td>
                    <td style="padding:6px 0;color:#18181b;font-size:14px;font-weight:600;">${email}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;color:#52525b;font-size:14px;width:80px;">Password:</td>
                    <td style="padding:6px 0;color:#18181b;font-size:14px;font-weight:600;">${password}</td>
                  </tr>
                </table>
              </div>
              <p style="margin:0 0 24px;color:#71717a;font-size:13px;line-height:1.5;">
                You'll be asked to set a new password when you first sign in. A quick setup wizard will guide you through getting everything configured.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${appUrl}" style="display:inline-block;background-color:#dc2626;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 32px;border-radius:8px;">
                      Sign In to Get Started
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;background-color:#fafafa;border-top:1px solid #e4e4e7;text-align:center;">
              <p style="margin:0;color:#a1a1aa;font-size:12px;">Powered by Xpansion Console</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
