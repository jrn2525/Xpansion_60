import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTenantStore } from "@/lib/tenant-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Building2,
  Target,
} from "lucide-react";

interface OverviewData {
  portfolioScore: number;
  locationCount: number;
  improvingCount: number;
  decliningCount: number;
  openAlerts: number;
  highCriticalAlerts: number;
  locationScores: {
    locationId: number;
    locationName: string;
    score: number;
    improving: boolean;
    declining: boolean;
  }[];
}

interface RankingEntry {
  locationId: number;
  locationName: string;
  currentAvg: number;
  previousAvg: number;
  delta: number;
  deltaPct: number;
}

interface RankingsData {
  rankings: any;
  top: RankingEntry[];
  bottom: RankingEntry[];
}

interface RiskEntry {
  locationId: number;
  locationName: string;
  riskCount: number;
  openAlerts: number;
  risks: {
    type: string;
    metricName: string;
    value?: number;
    threshold?: number;
    periods?: number;
  }[];
}

interface RiskData {
  riskLocations: RiskEntry[];
}

import { scoreColor, scoreBgColor, deltaTrendColor } from "@/lib/semantic-colors";

function getScoreColor(score: number): string {
  return scoreColor(score);
}

function getScoreBg(score: number): string {
  return scoreBgColor(score);
}

function getDeltaColor(delta: number): string {
  return deltaTrendColor(delta);
}

export default function PortfolioPage() {
  const { activeTenantId } = useTenantStore();
  const { toast } = useToast();
  const [leaderboardTab, setLeaderboardTab] = useState("top");

  const { data: overviewResponse, isLoading: overviewLoading } = useQuery<{ ok: boolean; data: OverviewData }>({
    queryKey: ["/api/tenants", activeTenantId, "portfolio", "overview"],
    enabled: !!activeTenantId,
  });

  const { data: rankingsResponse, isLoading: rankingsLoading } = useQuery<{ ok: boolean; data: RankingsData }>({
    queryKey: ["/api/tenants", activeTenantId, "portfolio", "rankings"],
    enabled: !!activeTenantId,
  });

  const { data: riskResponse, isLoading: riskLoading } = useQuery<{ ok: boolean; data: RiskData }>({
    queryKey: ["/api/tenants", activeTenantId, "portfolio", "risk"],
    enabled: !!activeTenantId,
  });

  const overview = overviewResponse?.data;
  const rankings = rankingsResponse?.data;
  const risk = riskResponse?.data;

  if (!activeTenantId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2" data-testid="text-no-tenant-title">No Tenant Selected</h2>
        <p className="text-muted-foreground max-w-md" data-testid="text-no-tenant">
          Select a tenant from the sidebar to view the portfolio dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-portfolio-title">
          Executive Portfolio Dashboard
        </h1>
        <p className="text-sm text-muted-foreground mt-1" data-testid="text-portfolio-subtitle">
          High-level overview of all franchise locations
        </p>
      </div>

      {overviewLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-10 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Portfolio Score
              </CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <span
                  className={`text-3xl font-bold ${getScoreColor(overview?.portfolioScore ?? 0)}`}
                  data-testid="text-portfolio-score"
                >
                  {overview?.portfolioScore ?? "—"}
                </span>
                <span
                  className={`inline-block h-3 w-3 rounded-full ${getScoreBg(overview?.portfolioScore ?? 0)}`}
                  data-testid="indicator-portfolio-score"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {overview?.locationCount ?? 0} locations
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Improving Locations
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </CardHeader>
            <CardContent>
              <div
                className="text-3xl font-bold text-emerald-600 dark:text-emerald-400"
                data-testid="text-improving-count"
              >
                {overview?.improvingCount ?? 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Trending upward</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Declining Locations
              </CardTitle>
              <TrendingDown className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div
                className="text-3xl font-bold text-destructive"
                data-testid="text-declining-count"
              >
                {overview?.decliningCount ?? 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Trending downward</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                High/Critical Alerts
              </CardTitle>
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </CardHeader>
            <CardContent>
              <div
                className="text-3xl font-bold"
                data-testid="text-alerts-count"
              >
                {overview?.highCriticalAlerts ?? 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {overview?.openAlerts ?? 0} total open
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1">
            <CardTitle className="text-base" data-testid="text-leaderboard-title">
              Location Leaderboard
            </CardTitle>
          </CardHeader>
          <CardContent>
            {rankingsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <Tabs value={leaderboardTab} onValueChange={setLeaderboardTab}>
                <TabsList>
                  <TabsTrigger value="top" data-testid="tab-top-performers">
                    Top Performers
                  </TabsTrigger>
                  <TabsTrigger value="bottom" data-testid="tab-bottom-performers">
                    Bottom Performers
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="top">
                  {!rankings?.top?.length ? (
                    <p className="text-sm text-muted-foreground py-4" data-testid="text-no-top">
                      No ranking data available
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Location</TableHead>
                          <TableHead className="text-right">Current Avg</TableHead>
                          <TableHead className="text-right">Delta</TableHead>
                          <TableHead className="text-right">Delta %</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rankings.top.slice(0, 5).map((entry) => (
                          <TableRow key={entry.locationId} data-testid={`row-top-${entry.locationId}`}>
                            <TableCell className="font-medium">{entry.locationName}</TableCell>
                            <TableCell className="text-right" data-testid={`text-top-avg-${entry.locationId}`}>
                              {typeof entry.currentAvg === "number" ? entry.currentAvg.toFixed(1) : "—"}
                            </TableCell>
                            <TableCell className={`text-right ${getDeltaColor(entry.delta)}`} data-testid={`text-top-delta-${entry.locationId}`}>
                              {entry.delta > 0 ? "+" : ""}{typeof entry.delta === "number" ? entry.delta.toFixed(1) : "—"}
                            </TableCell>
                            <TableCell className={`text-right ${getDeltaColor(entry.deltaPct)}`} data-testid={`text-top-deltapct-${entry.locationId}`}>
                              {entry.deltaPct > 0 ? "+" : ""}{typeof entry.deltaPct === "number" ? entry.deltaPct.toFixed(1) : "—"}%
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="bottom">
                  {!rankings?.bottom?.length ? (
                    <p className="text-sm text-muted-foreground py-4" data-testid="text-no-bottom">
                      No ranking data available
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Location</TableHead>
                          <TableHead className="text-right">Current Avg</TableHead>
                          <TableHead className="text-right">Delta</TableHead>
                          <TableHead className="text-right">Delta %</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rankings.bottom.slice(0, 5).map((entry) => (
                          <TableRow key={entry.locationId} data-testid={`row-bottom-${entry.locationId}`}>
                            <TableCell className="font-medium">{entry.locationName}</TableCell>
                            <TableCell className="text-right" data-testid={`text-bottom-avg-${entry.locationId}`}>
                              {typeof entry.currentAvg === "number" ? entry.currentAvg.toFixed(1) : "—"}
                            </TableCell>
                            <TableCell className={`text-right ${getDeltaColor(entry.delta)}`} data-testid={`text-bottom-delta-${entry.locationId}`}>
                              {entry.delta > 0 ? "+" : ""}{typeof entry.delta === "number" ? entry.delta.toFixed(1) : "—"}
                            </TableCell>
                            <TableCell className={`text-right ${getDeltaColor(entry.deltaPct)}`} data-testid={`text-bottom-deltapct-${entry.locationId}`}>
                              {entry.deltaPct > 0 ? "+" : ""}{typeof entry.deltaPct === "number" ? entry.deltaPct.toFixed(1) : "—"}%
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1">
            <CardTitle className="text-base" data-testid="text-risk-title">
              Risk Matrix
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {riskLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : !risk?.riskLocations?.length ? (
              <p className="text-sm text-muted-foreground py-4" data-testid="text-no-risks">
                No at-risk locations detected
              </p>
            ) : (
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Risks</TableHead>
                    <TableHead className="text-right">Alerts</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {risk.riskLocations.map((loc) => (
                    <TableRow key={loc.locationId} data-testid={`row-risk-${loc.locationId}`}>
                      <TableCell className="font-medium">{loc.locationName}</TableCell>
                      <TableCell className="text-right" data-testid={`text-risk-count-${loc.locationId}`}>
                        {loc.riskCount}
                      </TableCell>
                      <TableCell className="text-right" data-testid={`text-risk-alerts-${loc.locationId}`}>
                        {loc.openAlerts}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {loc.risks.map((r, idx) => (
                            <Badge
                              key={idx}
                              variant="secondary"
                              data-testid={`badge-risk-${loc.locationId}-${idx}`}
                            >
                              {r.metricName}: {r.type}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
