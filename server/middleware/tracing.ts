import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";

declare global {
  namespace Express {
    interface Request {
      traceId?: string;
    }
  }
}

export function tracingMiddleware(req: Request, res: Response, next: NextFunction) {
  const traceId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
  req.traceId = traceId;
  res.setHeader("X-Request-Id", traceId);

  const isWrite = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
  if (isWrite) {
    const userId = (req as any).user?.claims?.sub || "anonymous";
    const tenantMatch = req.path.match(/tenants\/(\d+)/);
    const tenantId = tenantMatch ? tenantMatch[1] : (req.body?.tenantId || "-");
    console.log(
      JSON.stringify({
        level: "info",
        traceId,
        method: req.method,
        path: req.path,
        userId,
        tenantId,
        timestamp: new Date().toISOString(),
      })
    );
  }

  next();
}
