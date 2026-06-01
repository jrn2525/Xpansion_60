import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000;
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: sessionTtl,
    },
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const unauthorizedResponse = { ok: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } };
  const user = req.user as any;

  if (!req.isAuthenticated() || !user) {
    return res.status(401).json(unauthorizedResponse);
  }

  if (user.authType === "local" && user.claims?.sub) {
    return next();
  }

  return res.status(401).json(unauthorizedResponse);
};

export const isSuperAdminGuard: RequestHandler = async (req, res, next) => {
  const user = req.user as any;
  if (!user?.claims?.sub) {
    return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
  }
  const { authStorage: aStore } = await import("./storage");
  const dbUser = await aStore.getUser(user.claims.sub);
  if (!dbUser || (dbUser as any).isSuperAdmin !== "true") {
    return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Superadmin access required" } });
  }
  next();
};
