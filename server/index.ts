import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { securityHeaders } from "./middleware/security-headers";

console.log("[BOOT] xpansion-60 server entrypoint loaded:", import.meta.filename ?? import.meta.url ?? "unknown-file");

const requiredSecrets = ["SESSION_SECRET", "DATABASE_URL", "APP_URL"];
for (const key of requiredSecrets) {
  if (!process.env[key]) {
    console.error(`[BOOT] FATAL: Required env var ${key} is missing`);
    process.exit(1);
  }
}

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

app.use(securityHeaders);

const idempotencyCache = new Map<string, { status: number; body: any; timestamp: number }>();
const IDEMPOTENCY_TTL = 5 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of idempotencyCache) {
    if (now - val.timestamp > IDEMPOTENCY_TTL) idempotencyCache.delete(key);
  }
}, 60 * 1000);

app.use((req: any, res, next) => {
  const idempotencyKey = req.headers["x-idempotency-key"] as string | undefined;
  if (!idempotencyKey || req.method === "GET") return next();

  const cached = idempotencyCache.get(idempotencyKey);
  if (cached) {
    return res.status(cached.status).json(cached.body);
  }

  const originalJson = res.json.bind(res);
  res.json = function (body: any) {
    idempotencyCache.set(idempotencyKey, { status: res.statusCode, body, timestamp: Date.now() });
    return originalJson(body);
  };
  next();
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, _res, next) => {
  if (req.path.startsWith("/api")) {
    console.log("[API HIT]", req.method, req.path);
  }
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "xpansion-60",
    timestamp: new Date().toISOString(),
  });
});

(async () => {
  await registerRoutes(httpServer, app);

  try {
    const { seedSuperAdmin } = await import("./auth/routes");
    await seedSuperAdmin();
  } catch (e) {
    console.error("[SEED] Admin seed error:", e);
  }

  app.use("/api", (_req: Request, res: Response) => {
    res.status(404).json({
      ok: false,
      error: { code: "NOT_FOUND", message: "API route not found" },
    });
  });

  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith("/api")) return next(err);
    console.error("API Error:", err);
    if (res.headersSent) return;
    res.status(err?.status || err?.statusCode || 500).json({
      ok: false,
      error: {
        code: err?.code || "INTERNAL_ERROR",
        message: err?.message || "Unexpected server error",
      },
    });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
