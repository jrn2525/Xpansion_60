import { Router } from "express";
import { storage } from "./storage";
import { isAuthenticated } from "./replit_integrations/auth";

export const dailyBriefRouter = Router();

dailyBriefRouter.get("/tenants/:tenantId/daily-brief", isAuthenticated, async (req: any, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
    }
    const tu = await storage.getTenantUserByUserId(tenantId, userId);
    if (!tu) {
      return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "No access to this tenant" } });
    }

    const [scorecardsRaw, riskSnapshotsRaw, opportunitiesRaw, actionsRaw, locationsRaw] = await Promise.all([
      storage.getScorecardTemplates(tenantId),
      storage.getRiskSnapshots(tenantId),
      storage.getOpportunities(tenantId),
      storage.getActions(tenantId),
      storage.getLocations(tenantId),
    ]);

    let latestScore: { totalScore: number | null; band: string | null; createdAt: Date | null } | null = null;
    let priorScore: { totalScore: number | null; band: string | null } | null = null;
    let latestScoreRunDate: Date | null = null;

    for (const sc of scorecardsRaw) {
      const runs = await storage.getScoreRuns(sc.id);
      if (runs.length > 0) {
        const sorted = [...runs].sort((a, b) => {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bTime - aTime;
        });

        const latest = sorted[0];
        const latestTime = latest.createdAt ? new Date(latest.createdAt).getTime() : 0;

        if (!latestScore || latestTime > (latestScoreRunDate?.getTime() || 0)) {
          latestScore = {
            totalScore: latest.totalScore,
            band: latest.band,
            createdAt: latest.createdAt,
          };
          latestScoreRunDate = latest.createdAt ? new Date(latest.createdAt) : null;

          if (sorted.length > 1) {
            priorScore = {
              totalScore: sorted[1].totalScore,
              band: sorted[1].band,
            };
          } else {
            priorScore = null;
          }
        }
      }
    }

    let scoreDelta: number | null = null;
    let trendDirection: "up" | "down" | "flat" | null = null;
    if (latestScore?.totalScore != null && priorScore?.totalScore != null) {
      scoreDelta = latestScore.totalScore - priorScore.totalScore;
      if (scoreDelta > 0.5) trendDirection = "up";
      else if (scoreDelta < -0.5) trendDirection = "down";
      else trendDirection = "flat";
    }

    const sortedRisks = [...riskSnapshotsRaw].sort((a, b) => b.riskScore - a.riskScore);
    const topRisks = sortedRisks.slice(0, 3).map(r => {
      const location = locationsRaw.find(l => l.id === r.locationId);
      return {
        id: r.id,
        locationId: r.locationId,
        locationName: location?.name || null,
        metricDefinitionId: r.metricDefinitionId,
        riskScore: r.riskScore,
        trendSlope: r.trendSlope,
        earlyWarnings: r.earlyWarnings,
        computedAt: r.computedAt,
      };
    });

    const openOpportunities = opportunitiesRaw
      .filter(o => o.status === "open")
      .sort((a, b) => {
        const scoreOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
        return (scoreOrder[b.impactScore] || 0) - (scoreOrder[a.impactScore] || 0);
      });
    const topOpportunities = openOpportunities.slice(0, 3).map(o => {
      const location = locationsRaw.find(l => l.id === o.locationId);
      return {
        id: o.id,
        title: o.title,
        description: o.description,
        impactScore: o.impactScore,
        locationId: o.locationId,
        locationName: location?.name || null,
        priority: o.priority,
        confidenceScore: o.confidenceScore,
      };
    });

    const pendingOrInProgress = actionsRaw
      .filter(a => a.status === "open" || a.status === "in_progress")
      .sort((a, b) => {
        const priorityOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
        const aPri = priorityOrder[a.priority || "medium"] || 0;
        const bPri = priorityOrder[b.priority || "medium"] || 0;
        if (bPri !== aPri) return bPri - aPri;
        if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return 0;
      });
    const topActions = pendingOrInProgress.slice(0, 3).map(a => {
      const location = locationsRaw.find(l => l.id === a.locationId);
      return {
        id: a.id,
        title: a.title,
        description: a.description,
        status: a.status,
        priority: a.priority,
        dueDate: a.dueDate,
        locationId: a.locationId,
        locationName: location?.name || null,
        ownerUserId: a.ownerUserId,
      };
    });

    let lastUpdated: Date | null = null;
    if (latestScoreRunDate) {
      lastUpdated = latestScoreRunDate;
    }
    for (const r of riskSnapshotsRaw) {
      if (r.computedAt) {
        const t = new Date(r.computedAt);
        if (!lastUpdated || t > lastUpdated) lastUpdated = t;
      }
    }

    res.json({
      ok: true,
      data: {
        score: latestScore
          ? {
              totalScore: latestScore.totalScore,
              band: latestScore.band,
              scoreDelta,
              trendDirection,
              priorScore: priorScore?.totalScore ?? null,
            }
          : null,
        topRisks,
        topOpportunities,
        topActions,
        lastUpdated,
      },
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: { code: "INTERNAL_ERROR", message: error.message } });
  }
});
