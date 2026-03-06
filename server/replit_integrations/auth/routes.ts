import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import { storage } from "../../storage";
import bcrypt from "bcryptjs";
import { db } from "../../db";
import { users } from "@shared/models/auth";
import { tenantUsers } from "@shared/schema";
import { eq } from "drizzle-orm";

export async function seedSuperAdmin(): Promise<void> {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.log("[SEED] ADMIN_EMAIL or ADMIN_PASSWORD not set, skipping admin seed");
    return;
  }

  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) {
    const updates: any = {};
    if (!existing.passwordHash) {
      updates.passwordHash = await bcrypt.hash(password, 12);
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
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Email and password required" } });
      }

      const [user] = await db.select().from(users).where(eq(users.email, email));
      if (!user || !user.passwordHash) {
        return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED", message: "Invalid email or password" } });
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED", message: "Invalid email or password" } });
      }

      if (user.isSuperAdmin !== "true") {
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
          res.json({ ok: true, data: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, isSuperAdmin: true } });
        });
      });
    } catch (error: any) {
      console.error("[AUTH] Login error:", error);
      res.status(500).json({ ok: false, error: { code: "INTERNAL_ERROR", message: "Login failed" } });
    }
  });

  app.post("/api/auth/logout", (req: any, res) => {
    req.logout((err: any) => {
      if (err) return res.status(500).json({ ok: false, error: { code: "INTERNAL_ERROR", message: "Logout failed" } });
      req.session.destroy((err2: any) => {
        res.json({ ok: true, data: { loggedOut: true } });
      });
    });
  });

  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      res.json(user);
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
