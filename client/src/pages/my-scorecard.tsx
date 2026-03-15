import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTenantStore } from "@/lib/tenant-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Trophy,
  Play,
  Loader2,
  MapPin,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  BarChart3,
  AlertCircle,
} from "lucide-react";
import { Link } from "wouter";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine } from "recharts";
import type { Location, MetricDefinition, ScorecardTemplate } from "@shared/schema";
import { getPeriodDates, stepPeriod } from "@/lib/period-utils";

const BAND_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  excellent: { bg: "bg-green-500/10", text: "text-green-700 dark:text-green-400", border: "border-green-500/30" },
  good: { bg: "bg-blue-500/10", text: "text-blue-700 dark:text-blue-400", border: "border-blue-500/30" },
  acceptable: { bg: "bg-amber-500/10", text: "text-amber-700 dark:text-amber-400", border: "border-amber-500/30" },
  poor: { bg: "bg-red-500/10", text: "text-red-700 dark:text-red-400", border: "border-red-500/30" },
};

const BAND_LABELS: Record<string, string> = {
  excellent: "Excellent",
  good: "Good",
  acceptable: "Needs Work",
  poor: "Critical",
};

const BAND_CHART_COLORS: Record<string, string> = {
  excellent: "#22c55e",
  good: "#3b82f6",
  acceptable: "#f59e0b",
  poor: "#ef4444",
};

export default function MyScorecardPage() {
  const { toast } = useToast();
  const { activeTenantId } = useTenantStore();

  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [referenceDate, setReferenceDate] = useState(new Date());

  const { data: progressData } = useQuery<any>({
    queryKey: ["/api/v1/onboarding/progress"],
  });

  const frequency = progressData?.progress?.savedData?.trackingFrequency || progressData?.savedData?.trackingFrequency || "weekly";

  const periodInfo = useMemo(() => getPeriodDates(frequency, referenceDate), [frequency, referenceDate]);

  const { data: locations, isLoading: locsLoading } = useQuery<Location[]>({
    queryKey: ["/api/tenants", activeTenantId, "locations"],
    enabled: !!activeTenantId,
  });

  const { data: metrics } = useQuery<MetricDefinition[]>({
    queryKey: ["/api/tenants", activeTenantId, "metrics"],
    enabled: !!activeTenantId,
  });

  const { data: scorecards, isLoading: scorecardsLoading } = useQuery<ScorecardTemplate[]>({
    queryKey: ["/api/tenants", activeTenantId, "scorecards"],
    enabled: !!activeTenantId,
  });

  useEffect(() => {
    if (locations && locations.length > 0 && !selectedLocationId) {
      setSelectedLocationId(String(locations[0].id));
    }
  }, [locations, selectedLocationId]);

  const activeScorecard = scorecards?.[0];

  const { data: runs, isLoading: runsLoading } = useQuery<any[]>({
    queryKey: ["/api/tenants", activeTenantId, "scorecards", activeScorecard?.id, "runs"],
    enabled: !!activeTenantId && !!activeScorecard?.id,
  });

  const locationRuns = useMemo(() => {
    if (!runs) return [];
    return runs
      .filter((r: any) => r.locationId === Number(selectedLocationId))
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [runs, selectedLocationId]);

  const periodRun = useMemo(() => {
    if (!locationRuns.length) return null;
    const pStart = periodInfo.periodStart.toISOString();
    const match = locationRuns.find((r: any) => {
      const runStart = new Date(r.periodStart).toISOString();
      return runStart === pStart;
    });
    return match || null;
  }, [locationRuns, periodInfo]);

  const chartData = useMemo(() => {
    return locationRuns
      .slice(0, 12)
      .reverse()
      .map((run: any) => ({
        label: new Date(run.periodStart).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        score: Math.round(run.totalScore),
        band: run.band,
      }));
  }, [locationRuns]);

  const createScorecardMutation = useMutation({
    mutationFn: async () => {
      const activeMetrics = metrics?.filter(m => m.isActive !== false) || [];
      if (activeMetrics.length === 0) throw new Error("No active metrics to create a scorecard");

      const equalWeight = Math.floor(100 / activeMetrics.length);
      const remainder = 100 - equalWeight * activeMetrics.length;

      const res = await apiRequest("POST", `/api/tenants/${activeTenantId}/scorecards`, {
        name: "My Scorecard",
        description: "Auto-generated scorecard from your KPIs",
        metrics: activeMetrics.map((m, i) => ({
          metricDefinitionId: m.id,
          weight: equalWeight + (i === 0 ? remainder : 0),
        })),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", activeTenantId, "scorecards"] });
      toast({ title: "Scorecard created" });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const runScorecardMutation = useMutation({
    mutationFn: async () => {
      if (!activeScorecard) throw new Error("No scorecard");
      const res = await apiRequest("POST", `/api/tenants/${activeTenantId}/scorecards/${activeScorecard.id}/run`, {
        locationId: Number(selectedLocationId),
        period: periodInfo.period,
        periodStart: periodInfo.periodStart.toISOString(),
        periodEnd: periodInfo.periodEnd.toISOString(),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", activeTenantId, "scorecards", activeScorecard?.id, "runs"] });
      toast({ title: "Score calculated!" });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  if (locsLoading || scorecardsLoading) {
    return (
      <div className="p-6 space-y-6 max-w-2xl mx-auto">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  if (!locations || locations.length === 0) {
    return (
      <div className="p-6 max-w-2xl mx-auto" data-testid="page-my-scorecard">
        <div className="text-center py-16 space-y-4">
          <MapPin className="h-12 w-12 mx-auto text-muted-foreground" />
          <h2 className="text-xl font-semibold">No locations yet</h2>
          <p className="text-muted-foreground">Add a location first to start tracking scores.</p>
        </div>
      </div>
    );
  }

  if (!activeScorecard) {
    return (
      <div className="p-6 max-w-2xl mx-auto" data-testid="page-my-scorecard">
        <div>
          <h1 className="text-2xl font-bold">My Scorecard</h1>
          <p className="text-muted-foreground mt-1">See how your business is performing at a glance.</p>
        </div>
        <Card className="mt-6">
          <CardContent className="p-8 text-center space-y-4">
            <Trophy className="h-12 w-12 mx-auto text-muted-foreground" />
            <h3 className="text-lg font-semibold">No scorecard yet</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              We'll create a scorecard from your KPIs so you can see a single score that tells you how your business is doing.
            </p>
            <Button
              onClick={() => createScorecardMutation.mutate()}
              disabled={createScorecardMutation.isPending || !metrics || metrics.length === 0}
              data-testid="button-create-scorecard"
            >
              {createScorecardMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trophy className="h-4 w-4 mr-2" />
              )}
              Create My Scorecard
            </Button>
            {(!metrics || metrics.length === 0) && (
              <p className="text-sm text-amber-600">
                You need to set up KPIs first.{" "}
                <Link href="/metrics" className="underline">Go to Metrics</Link>
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const band = periodRun?.band || null;
  const totalScore = periodRun?.totalScore ?? null;
  const bandStyle = band ? BAND_COLORS[band] : null;
  const details = periodRun?.details || [];

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto" data-testid="page-my-scorecard">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">My Scorecard</h1>
        <p className="text-muted-foreground mt-1">See how your business is performing at a glance.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        {locations.length > 1 && (
          <div className="flex-1 space-y-1.5">
            <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
              <SelectTrigger data-testid="select-scorecard-location">
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
              <SelectContent>
                {locations.map(loc => (
                  <SelectItem key={loc.id} value={String(loc.id)}>{loc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setReferenceDate(stepPeriod(frequency, referenceDate, -1))}
              data-testid="button-prev-period"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <CardTitle className="text-lg flex items-center gap-2" data-testid="text-scorecard-period">
              <Calendar className="h-4 w-4" />
              {periodInfo.label}
            </CardTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setReferenceDate(stepPeriod(frequency, referenceDate, 1))}
              data-testid="button-next-period"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {runsLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : totalScore !== null ? (
            <div className="space-y-6">
              <div className={`text-center p-6 rounded-xl border-2 ${bandStyle?.bg} ${bandStyle?.border}`}>
                <p className="text-5xl font-bold" data-testid="text-total-score">{Math.round(totalScore)}</p>
                <p className="text-sm text-muted-foreground mt-1">out of 100</p>
                <Badge className={`mt-2 ${bandStyle?.bg} ${bandStyle?.text} border ${bandStyle?.border}`} data-testid="badge-score-band">
                  {BAND_LABELS[band] || band}
                </Badge>
              </div>

              {details.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Breakdown</h3>
                  {details.map((detail: any, i: number) => {
                    const detailBand = detail.band || "poor";
                    const detailStyle = BAND_COLORS[detailBand];
                    const metricName = metrics?.find(m => m.id === detail.metricDefinitionId)?.name || `Metric ${detail.metricDefinitionId}`;
                    return (
                      <div
                        key={i}
                        className={`flex items-center justify-between p-3 rounded-lg border ${detailStyle?.bg} ${detailStyle?.border}`}
                        data-testid={`scorecard-detail-${i}`}
                      >
                        <div>
                          <p className="font-medium text-sm">{metricName}</p>
                          <p className="text-xs text-muted-foreground">
                            Value: {detail.rawValue ?? "—"} · Weight: {detail.weight}%
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={`font-semibold ${detailStyle?.text}`}>
                            {detail.normalizedScore !== null ? Math.round(detail.normalizedScore) : "—"}
                          </p>
                          <p className="text-xs text-muted-foreground">{BAND_LABELS[detailBand] || detailBand}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 space-y-4">
              <AlertCircle className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="text-muted-foreground">No score calculated for this period yet.</p>
              <p className="text-xs text-muted-foreground">
                Make sure you've <Link href="/enter-data" className="text-primary underline">entered your numbers</Link> for this period, then calculate your score below.
              </p>
            </div>
          )}

          <div className="mt-6 pt-4 border-t flex flex-col sm:flex-row gap-3 items-center justify-between">
            <Link href="/enter-data" className="text-sm text-primary hover:underline flex items-center gap-1">
              <BarChart3 className="h-4 w-4" />
              Enter/update your numbers
              <ArrowRight className="h-3 w-3" />
            </Link>
            <Button
              onClick={() => runScorecardMutation.mutate()}
              disabled={runScorecardMutation.isPending}
              data-testid="button-calculate-score"
            >
              {runScorecardMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Calculate Score
            </Button>
          </div>
        </CardContent>
      </Card>

      {chartData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Score Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48" data-testid="chart-score-trend">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                    formatter={(value: number, _name: string, props: any) => [
                      `${value} — ${BAND_LABELS[props.payload.band] || props.payload.band}`,
                      "Score",
                    ]}
                  />
                  <ReferenceLine y={90} stroke="#22c55e" strokeDasharray="3 3" strokeOpacity={0.4} />
                  <ReferenceLine y={70} stroke="#3b82f6" strokeDasharray="3 3" strokeOpacity={0.4} />
                  <ReferenceLine y={50} stroke="#f59e0b" strokeDasharray="3 3" strokeOpacity={0.4} />
                  <Area
                    type="monotone"
                    dataKey="score"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#scoreGradient)"
                    dot={(props: any) => {
                      const color = BAND_CHART_COLORS[props.payload.band] || "hsl(var(--primary))";
                      return (
                        <circle
                          key={props.index}
                          cx={props.cx}
                          cy={props.cy}
                          r={4}
                          fill={color}
                          stroke="hsl(var(--card))"
                          strokeWidth={2}
                        />
                      );
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-center gap-4 mt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Excellent (90+)</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Good (70+)</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> Needs Work (50+)</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Critical</span>
            </div>
          </CardContent>
        </Card>
      )}

      {locationRuns.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Score History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {locationRuns
                .slice(0, 10)
                .map((run: any, i: number) => {
                  const runBand = run.band || "poor";
                  const runStyle = BAND_COLORS[runBand];
                  const isCurrentPeriod = new Date(run.periodStart).toISOString() === periodInfo.periodStart.toISOString();
                  return (
                    <div
                      key={run.id || i}
                      className={`flex items-center justify-between p-2 rounded-lg border ${isCurrentPeriod ? "border-primary/40 bg-primary/5" : ""}`}
                      data-testid={`score-history-${i}`}
                    >
                      <div className="text-sm">
                        <span className="font-medium">{run.period}</span>
                        <span className="text-muted-foreground ml-2 text-xs">
                          {new Date(run.periodStart).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                        {isCurrentPeriod && (
                          <Badge variant="outline" className="ml-2 text-xs px-1.5 py-0">Current</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold text-sm ${runStyle?.text}`}>{Math.round(run.totalScore)}</span>
                        <Badge variant="outline" className={`text-xs ${runStyle?.text} ${runStyle?.border}`}>
                          {BAND_LABELS[runBand]}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
