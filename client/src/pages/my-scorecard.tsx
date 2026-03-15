import { useState, useEffect } from "react";
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
import type { Location, MetricDefinition, ScorecardTemplate } from "@shared/schema";

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

function getMonthPeriod(referenceDate: Date) {
  const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0, 23, 59, 59, 999);
  return {
    period: "month",
    periodStart: start,
    periodEnd: end,
    label: start.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
  };
}

export default function MyScorecardPage() {
  const { toast } = useToast();
  const { activeTenantId } = useTenantStore();

  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [referenceDate, setReferenceDate] = useState(new Date());

  const periodInfo = getMonthPeriod(referenceDate);

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

  const latestRun = runs?.find(
    (r: any) => r.locationId === Number(selectedLocationId)
  );

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

  const band = latestRun?.band || null;
  const totalScore = latestRun?.totalScore ?? null;
  const bandStyle = band ? BAND_COLORS[band] : null;
  const details = latestRun?.details || [];

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
              onClick={() => setReferenceDate(prev => { const d = new Date(prev); d.setMonth(d.getMonth() - 1); return d; })}
              data-testid="button-prev-month"
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
              onClick={() => setReferenceDate(prev => { const d = new Date(prev); d.setMonth(d.getMonth() + 1); return d; })}
              data-testid="button-next-month"
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

      {runs && runs.filter((r: any) => r.locationId === Number(selectedLocationId)).length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Score History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {runs
                .filter((r: any) => r.locationId === Number(selectedLocationId))
                .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .slice(0, 10)
                .map((run: any, i: number) => {
                  const runBand = run.band || "poor";
                  const runStyle = BAND_COLORS[runBand];
                  return (
                    <div
                      key={run.id || i}
                      className="flex items-center justify-between p-2 rounded-lg border"
                      data-testid={`score-history-${i}`}
                    >
                      <div className="text-sm">
                        <span className="font-medium">{run.period}</span>
                        <span className="text-muted-foreground ml-2 text-xs">
                          {new Date(run.createdAt).toLocaleDateString()}
                        </span>
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
