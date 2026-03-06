import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTenantStore } from "@/lib/tenant-store";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { statusColors, scoreColor } from "@/lib/semantic-colors";
import {
  BarChart3,
  Trophy,
  AlertCircle,
  Target,
  TrendingUp,
  ClipboardList,
  Settings2,
  RefreshCw,
  Save,
  X,
  Info,
} from "lucide-react";

interface BenchmarkingWeights {
  goalAttainmentWeight: number;
  alertPenaltyWeight: number;
  trendMomentumWeight: number;
  scorecardContributionWeight: number;
}

interface Ranking {
  locationId: number;
  locationName: string;
  alertBurden: number;
  goalAttainment: number;
  goalsOnTrack: number;
  totalGoals: number;
  completedActions: number;
  totalActions: number;
  actionCompletion: number;
  alertPenalty: number;
  trendMomentum: number;
  scorecardContribution: number;
  compositeScore: number;
}

interface BenchmarkingResponse {
  ok: boolean;
  data: {
    rankings: Ranking[];
    weights: BenchmarkingWeights;
  };
}

interface ConfigResponse {
  ok: boolean;
  data: BenchmarkingWeights & { id?: number; tenantId?: number };
}

const WEIGHT_LABELS: { key: keyof BenchmarkingWeights; label: string; icon: typeof Target; description: string }[] = [
  { key: "goalAttainmentWeight", label: "Goal Attainment", icon: Target, description: "% of goals on track" },
  { key: "alertPenaltyWeight", label: "Alert Penalty", icon: AlertCircle, description: "Deduction per open alert" },
  { key: "trendMomentumWeight", label: "Trend Momentum", icon: TrendingUp, description: "Action completion rate" },
  { key: "scorecardContributionWeight", label: "Scorecard Contribution", icon: ClipboardList, description: "Goal attainment overlap" },
];

const DEFAULT_WEIGHTS: BenchmarkingWeights = {
  goalAttainmentWeight: 40,
  alertPenaltyWeight: 25,
  trendMomentumWeight: 20,
  scorecardContributionWeight: 15,
};

export default function BenchmarkingPage() {
  const { activeTenantId } = useTenantStore();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draftWeights, setDraftWeights] = useState<BenchmarkingWeights>(DEFAULT_WEIGHTS);

  const { data: benchmarkingData, isLoading } = useQuery<BenchmarkingResponse>({
    queryKey: ["/api/tenants", activeTenantId, "benchmarking"],
    enabled: !!activeTenantId,
  });

  const { data: configData, isLoading: configLoading } = useQuery<ConfigResponse>({
    queryKey: ["/api/tenants", activeTenantId, "benchmarking", "config"],
    enabled: !!activeTenantId,
  });

  const currentWeights: BenchmarkingWeights = configData?.data || benchmarkingData?.data?.weights || DEFAULT_WEIGHTS;
  const rankings = benchmarkingData?.data?.rankings || [];

  useEffect(() => {
    if (!editing) {
      setDraftWeights(currentWeights);
    }
  }, [configData, benchmarkingData, editing]);

  const saveConfigMutation = useMutation({
    mutationFn: async (weights: BenchmarkingWeights) => {
      const res = await apiRequest("PUT", `/api/tenants/${activeTenantId}/benchmarking/config`, weights);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", activeTenantId, "benchmarking"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", activeTenantId, "benchmarking", "config"] });
      setEditing(false);
      toast({ title: "Weights saved", description: "Benchmarking formula updated successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const recomputeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/tenants/${activeTenantId}/benchmarking/config`, currentWeights);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", activeTenantId, "benchmarking"] });
      toast({ title: "Rankings recomputed", description: "Location rankings have been recalculated." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const totalDraftWeight = draftWeights.goalAttainmentWeight + draftWeights.alertPenaltyWeight + draftWeights.trendMomentumWeight + draftWeights.scorecardContributionWeight;
  const isValidTotal = totalDraftWeight === 100;

  function handleWeightChange(key: keyof BenchmarkingWeights, value: number) {
    setDraftWeights(prev => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    if (!isValidTotal) {
      toast({ title: "Invalid weights", description: `Weights must sum to 100. Currently: ${totalDraftWeight}`, variant: "destructive" });
      return;
    }
    saveConfigMutation.mutate(draftWeights);
  }

  function handleCancel() {
    setDraftWeights(currentWeights);
    setEditing(false);
  }

  if (!activeTenantId) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold" data-testid="text-benchmarking-title">Benchmarking</h1>
        <p className="text-muted-foreground mt-1">Select a tenant to view location rankings.</p>
      </div>
    );
  }

  if (isLoading || configLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40" />
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20" />)}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-benchmarking-title">Benchmarking</h1>
          <p className="text-muted-foreground text-sm">Location rankings by configurable composite performance formula</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!editing && (
            <Button variant="outline" onClick={() => setEditing(true)} data-testid="button-edit-weights">
              <Settings2 className="h-4 w-4 mr-2" />
              Edit Weights
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => recomputeMutation.mutate()}
            disabled={recomputeMutation.isPending}
            data-testid="button-recompute"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${recomputeMutation.isPending ? "animate-spin" : ""}`} />
            Recompute Now
          </Button>
        </div>
      </div>

      <Card data-testid="card-formula-config">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="text-base font-semibold">Scoring Formula</CardTitle>
          {editing && (
            <div className="flex items-center gap-2">
              <Badge variant={isValidTotal ? "default" : "destructive"} data-testid="badge-weight-total">
                Total: {totalDraftWeight}/100
              </Badge>
              <Button size="sm" onClick={handleSave} disabled={!isValidTotal || saveConfigMutation.isPending} data-testid="button-save-weights">
                <Save className="h-4 w-4 mr-1" />
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={handleCancel} data-testid="button-cancel-weights">
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Info className="h-4 w-4 shrink-0" />
            <span data-testid="text-formula-preview">
              Score = (Goal Attainment x {editing ? draftWeights.goalAttainmentWeight : currentWeights.goalAttainmentWeight}%) + (Alert Penalty x {editing ? draftWeights.alertPenaltyWeight : currentWeights.alertPenaltyWeight}%) + (Trend Momentum x {editing ? draftWeights.trendMomentumWeight : currentWeights.trendMomentumWeight}%) + (Scorecard x {editing ? draftWeights.scorecardContributionWeight : currentWeights.scorecardContributionWeight}%)
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {WEIGHT_LABELS.map(({ key, label, icon: Icon, description }) => {
              const displayValue = editing ? draftWeights[key] : currentWeights[key];
              return (
                <div key={key} className="space-y-2" data-testid={`weight-control-${key}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{label}</span>
                    </div>
                    <span className="text-sm font-bold tabular-nums" data-testid={`text-weight-value-${key}`}>
                      {displayValue}%
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{description}</p>
                  {editing ? (
                    <Slider
                      min={0}
                      max={100}
                      step={5}
                      value={[draftWeights[key]]}
                      onValueChange={([v]) => handleWeightChange(key, v)}
                      data-testid={`slider-${key}`}
                    />
                  ) : (
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${displayValue}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {rankings.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <BarChart3 className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground" data-testid="text-no-rankings">
              No active locations to rank. Add locations and set goals to see benchmarking data.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rankings.map((r, idx) => {
            const isTop = idx === 0;
            const isBottom = idx === rankings.length - 1 && rankings.length > 1;
            return (
              <Card key={r.locationId} className={isTop ? "border-status-success/50" : isBottom ? "border-status-error/50" : ""} data-testid={`ranking-card-${r.locationId}`}>
                <CardContent className="py-4">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center h-10 w-10 rounded-full bg-muted font-bold text-lg shrink-0" data-testid={`text-rank-${r.locationId}`}>
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium" data-testid={`text-location-name-${r.locationId}`}>{r.locationName}</span>
                        {isTop && <Trophy className="h-4 w-4 text-status-success-foreground" />}
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Target className="h-3 w-3" />
                          Goals: {r.goalsOnTrack}/{r.totalGoals}
                          {r.goalAttainment !== null && (
                            <span className={r.goalAttainment >= 70 ? "text-status-success-foreground" : r.goalAttainment >= 40 ? "text-status-warning-foreground" : "text-status-error-foreground"}>
                              ({r.goalAttainment}%)
                            </span>
                          )}
                        </span>
                        <span className="flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          Alerts: {r.alertBurden}
                        </span>
                        <span className="flex items-center gap-1">
                          <TrendingUp className="h-3 w-3" />
                          Actions: {r.completedActions}/{r.totalActions}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                        <span>GA: {r.goalAttainment}</span>
                        <span>AP: {r.alertPenalty}</span>
                        <span>TM: {r.trendMomentum}</span>
                        <span>SC: {r.scorecardContribution}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-lg font-bold ${scoreColor(r.compositeScore)}`} data-testid={`text-score-${r.locationId}`}>{r.compositeScore}</div>
                      <div className="text-xs text-muted-foreground">Score</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
