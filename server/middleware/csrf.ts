import type { RequestHandler } from "express";

/**
 * Origin/Referer check that protects cookie-authed state-changing endpoints
 * against cross-site request forgery.
 *
 * We already set `sameSite: "lax"` on the auth cookie, which is enough to
 * block the worst CSRF cases on modern browsers. This adds a defense-in-depth
 * check: for any non-GET/HEAD/OPTIONS request hitting `/api`, the request's
 * Origin (or Referer fallback) must match APP_URL's host. Requests with no
 * Origin/Referer at all are allowed (server-to-server calls, mobile apps,
 * curl scripts in your own ops) — the goal is to reject browser-driven
 * cross-site POSTs, not to lock out tooling.
 *
 * Exempted: `/api/health` (used by Railway's healthcheck, no Origin header).
 */
export function csrfOriginCheck(): RequestHandler {
  const appUrl = process.env.APP_URL ?? "";
  let allowedHost: string | null = null;
  try {
    allowedHost = appUrl ? new URL(appUrl).host : null;
  } catch {
    allowedHost = null;
  }
  if (!allowedHost) {
    console.warn("[CSRF] APP_URL is unset or malformed — Origin check disabled");
  }

  const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
  const EXEMPT_PATHS = new Set(["/api/health"]);

  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    if (!req.path.startsWith("/api")) return next();
    if (EXEMPT_PATHS.has(req.path)) return next();
    if (!allowedHost) return next();

    const origin = req.get("origin") || req.get("referer");
    if (!origin) return next(); // No Origin/Referer at all → allow (tooling/server-to-server)

    try {
      const candidateHost = new URL(origin).host;
      if (candidateHost === allowedHost) return next();
    } catch {
      // Malformed Origin/Referer header — reject below
    }

    return res.status(403).json({
      ok: false,
      error: {
        code: "CSRF_BLOCKED",
        message: "Request rejected: cross-site origin not permitted.",
      },
    });
  };
}
