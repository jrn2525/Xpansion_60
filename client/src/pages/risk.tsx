import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTenantStore } from "@/lib/tenant-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Activity,
  Shield,
  Target,
  Zap,
} from "lucide-react";
import { severityColors, scoreColor } from "@/lib/semantic-colors";
import type { Location, MetricDefinition, RiskSnapshot } from "@shared/schema";

function riskLevel(score: number): string {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 30) return "medium";
  return "low";
}

function riskBadgeClass(score: number): string {
  const level = riskLevel(score);
  return severityColors[level as keyof typeof severityColors] || "";
}

function riskBarColor(score: number): string {
  if (score >= 80) return "bg-status-error";
  if (score >= 60) return "bg-status-error/70";
  if (score >= 30) return "bg-status-warning";
  return "bg-status-success";
}

interface RiskOverviewData {
  overallAvgRisk: number;
  totalSnapshots: number;
  highRiskCount: number;
  criticalWarnings: number;
  topAtRiskLocations: Array<{
    locationId: number;
    avgRisk: number;
    maxRisk: number;
    count: number;
    warnings: number;
  }>;
  riskDistribution: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
}

export default function RiskDashboardPage() {
  const { activeTenantId } = useTenantStore();
  const { toast } = useToast();
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);
  const [selectedMetricId, setSelectedMetricId] = useState<number | null>(null);

  const { data: overviewResponse, isLoading: overviewLoading } = useQuery<{ ok: boolean; data: RiskOverviewData }>({
    queryKey: ["/api/tenants", activeTenantId, "risk/overview"],
    enabled: !!activeTenantId,
  });

  const { data: locationsData } = useQuery<Location[]>({
    queryKey: ["/api/tenants", activeTenantId, "locations"],
    enabled: !!activeTenantId,
  });

  const { data: metricsData } = useQuery<MetricDefinition[]>({
    queryKey: ["/api/tenants", activeTenantId, "metrics"],
    enabled: !!activeTenantId,
  });

  const { data: locationSnapshotsResponse } = useQuery<{ ok: boolean; data: RiskSnapshot[] }>({
    queryKey: ["/api/tenants", activeTenantId, "risk/location", selectedLocationId],
    enabled: !!activeTenantId && !!selectedLocationId,
  });

  const recomputeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/tenants/${activeTenantId}/risk/recompute`);
      return res.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", activeTenantId, "risk/overview"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", activeTenantId, "risk/location"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", activeTenantId, "risk/metric"] });
      toast({ title: "Risk recomputed", description: `${result?.data?.snapshotsCreated || 0} snapshots created` });
    },
    onError: (e: Error) => toast({ title: "Recompute failed", description: e.message, variant: "destructive" }),
  });

  const overview = overviewResponse?.data;
  const locations = locationsData || [];
  const metrics = metricsData || [];
  const locationSnapshots = locationSnapshotsResponse?.data || [];

  const locationMap = new Map(locations.map(l => [l.id, l]));
  const metricMap = new Map(metrics.map(m => [m.id, m]));

  if (!activeTenantId) {
    return (
      <div className="p-6 text-center text-muted-foreground" data-testid="text-no-tenant">
        Select a client to view risk dashboard
      </div>
    );
  }

  const heatmapData: Record<number, Record<number, RiskSnapshot>> = {};
  const topLocations = overview?.topAtRiskLocations || [];

  if (locationSnapshots.length > 0) {
    for (const s of locationSnapshots) {
      if (!heatmapData[s.locationId]) heatmapData[s.locationId] = {};
      heatmapData[s.locationId][s.metricDefinitionId] = s;
    }
  }

  const selectedSnapshot = selectedLocationId && selectedMetricId
    ? heatmapData[selectedLocationId]?.[selectedMetricId] || null
    : null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-status-error/10">
            <Shield className="h-5 w-5 text-status-error-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Risk Dashboard</h1>
            <p className="text-sm text-muted-foreground">Predictive risk analysis across locations and metrics</p>
          </div>
        </div>
        <Button
          onClick={() => recomputeMutation.mutate()}
          disabled={recomputeMutation.isPending}
          data-testid="button-recompute"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${recomputeMutation.isPending ? "animate-spin" : ""}`} />
          {recomputeMutation.isPending ? "Computing..." : "Recompute Risk"}
        </Button>
      </div>

      {overviewLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : overview ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Avg Risk Score</CardTitle>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <Activity className="h-4 w-4 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${scoreColor(100 - overview.overallAvgRisk)}`} data-testid="text-avg-risk">
                  {overview.overallAvgRisk}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{overview.totalSnapshots} metric-location pairs</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">High Risk Items</CardTitle>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-status-error/10">
                  <AlertTriangle className="h-4 w-4 text-status-error-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-status-error-foreground" data-testid="text-high-risk-count">
                  {overview.highRiskCount}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Score 60+</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Early Warnings</CardTitle>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-status-warning/10">
                  <Zap className="h-4 w-4 text-status-warning-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-status-warning-foreground" data-testid="text-warnings-count">
                  {overview.criticalWarnings}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Active warnings</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Risk Distribution</CardTitle>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <Target className="h-4 w-4 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 flex-wrap" data-testid="text-risk-distribution">
                  <Badge className={severityColors.low}>{overview.riskDistribution.low} Low</Badge>
                  <Badge className={severityColors.medium}>{overview.riskDistribution.medium} Med</Badge>
                  <Badge className={severityColors.high}>{overview.riskDistribution.high} High</Badge>
                  <Badge className={severityColors.critical}>{overview.riskDistribution.critical} Crit</Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Risk Heatmap</CardTitle>
              </CardHeader>
              <CardContent>
                {topLocations.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8" data-testid="text-no-heatmap">
                    No risk data available. Click Recompute Risk to generate.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Location</TableHead>
                          <TableHead>Avg Risk</TableHead>
                          <TableHead>Max Risk</TableHead>
                          <TableHead>Metrics</TableHead>
                          <TableHead>Warnings</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {topLocations.map((loc) => {
                          const location = locationMap.get(loc.locationId);
                          return (
                            <TableRow
                              key={loc.locationId}
                              className="cursor-pointer hover-elevate"
                              onClick={() => {
                                setSelectedLocationId(loc.locationId);
                                setSelectedMetricId(null);
                              }}
                              data-testid={`row-risk-location-${loc.locationId}`}
                            >
                              <TableCell className="font-medium">
                                {location?.name || `Location #${loc.locationId}`}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <div className="w-20">
                                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                                      <div
                                        className={`h-full rounded-full ${riskBarColor(loc.avgRisk)}`}
                                        style={{ width: `${Math.min(100, loc.avgRisk)}%` }}
                                      />
                                    </div>
                                  </div>
                                  <Badge className={riskBadgeClass(loc.avgRisk)}>
                                    {loc.avgRisk}
                                  </Badge>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge className={riskBadgeClass(loc.maxRisk)}>
                                  {loc.maxRisk.toFixed(0)}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-muted-foreground">{loc.count}</TableCell>
                              <TableCell>
                                {loc.warnings > 0 ? (
                                  <Badge className={severityColors.high}>
                                    {loc.warnings}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground">0</span>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              {selectedLocationId && locationSnapshots.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {locationMap.get(selectedLocationId)?.name || `Location #${selectedLocationId}`} — Risk Breakdown
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {locationSnapshots.map((snap) => {
                      const metric = metricMap.get(snap.metricDefinitionId);
                      const warnings: string[] = snap.earlyWarnings ? JSON.parse(snap.earlyWarnings) : [];
                      const isSelected = selectedMetricId === snap.metricDefinitionId;
                      return (
                        <div
                          key={snap.id}
                          className={`p-3 rounded-md border cursor-pointer hover-elevate ${isSelected ? "border-primary bg-primary/5" : ""}`}
                          onClick={() => setSelectedMetricId(snap.metricDefinitionId)}
                          data-testid={`card-risk-metric-${snap.metricDefinitionId}`}
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="text-sm font-medium">
                              {metric?.name || `Metric #${snap.metricDefinitionId}`}
                            </span>
                            <Badge className={riskBadgeClass(snap.riskScore)}>
                              {snap.riskScore.toFixed(0)}
                            </Badge>
                          </div>
                          <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full ${riskBarColor(snap.riskScore)}`}
                              style={{ width: `${Math.min(100, snap.riskScore)}%` }}
                            />
                          </div>
                          {warnings.length > 0 && (
                            <div className="flex gap-1 mt-2 flex-wrap">
                              {warnings.map((w, i) => (
                                <Badge key={i} className={severityColors.high} data-testid={`badge-warning-${snap.id}-${i}`}>
                                  {w === "likely_threshold_breach" ? "Threshold Breach" :
                                   w === "likely_goal_miss" ? "Goal Miss" :
                                   w === "score_deterioration" ? "Deterioration" : w}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Risk Details</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground" data-testid="text-select-location">
                      {topLocations.length > 0
                        ? "Select a location from the heatmap to view metric-level risk details"
                        : "No risk data available yet"}
                    </p>
                  </CardContent>
                </Card>
              )}

              {selectedSnapshot && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Risk Contributors</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <TrendingDown className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">Trend Slope</span>
                        </div>
                        <span className={`text-sm font-medium ${selectedSnapshot.trendSlope < 0 ? "text-status-error-foreground" : "text-status-success-foreground"}`}>
                          {selectedSnapshot.trendSlope > 0 ? "+" : ""}{selectedSnapshot.trendSlope.toFixed(4)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Activity className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">Variance Instability</span>
                        </div>
                        <span className="text-sm font-medium">{selectedSnapshot.varianceInstability.toFixed(3)}</span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">Alert Burden</span>
                        </div>
                        <span className="text-sm font-medium">{selectedSnapshot.alertBurden.toFixed(0)}</span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Target className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">Unresolved Actions</span>
                        </div>
                        <span className="text-sm font-medium">{selectedSnapshot.unresolvedActions}</span>
                      </div>

                      {selectedSnapshot.forecastValue !== null && (
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">Forecast</span>
                          </div>
                          <span className="text-sm font-medium">
                            {selectedSnapshot.forecastValue?.toFixed(1)}
                            {selectedSnapshot.confidenceLow !== null && selectedSnapshot.confidenceHigh !== null && (
                              <span className="text-muted-foreground ml-1">
                                ({selectedSnapshot.confidenceLow?.toFixed(1)} — {selectedSnapshot.confidenceHigh?.toFixed(1)})
                              </span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>

                    {(() => {
                      const warnings: string[] = selectedSnapshot.earlyWarnings
                        ? JSON.parse(selectedSnapshot.earlyWarnings)
                        : [];
                      if (warnings.length === 0) return null;
                      return (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2">Early Warnings</p>
                          <div className="flex gap-1 flex-wrap">
                            {warnings.map((w, i) => (
                              <Badge key={i} className={severityColors.critical} data-testid={`badge-contributor-warning-${i}`}>
                                {w === "likely_threshold_breach" ? "Threshold Breach" :
                                 w === "likely_goal_miss" ? "Goal Miss" :
                                 w === "score_deterioration" ? "Deterioration" : w}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    <p className="text-xs text-muted-foreground">
                      Computed: {selectedSnapshot.computedAt ? new Date(selectedSnapshot.computedAt).toLocaleString() : "N/A"}
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </>
      ) : !overviewLoading && (
        <Card>
          <CardContent className="py-12 text-center">
            <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Risk Data</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Click "Recompute Risk" to analyze risk across your locations and metrics.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
