import { useQuery } from "@tanstack/react-query";
import { useTenantStore } from "@/lib/tenant-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { statusColors } from "@/lib/semantic-colors";
import {
  BarChart3,
  Trophy,
  AlertCircle,
  Target,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

interface Ranking {
  locationId: number;
  locationName: string;
  alertBurden: number;
  goalAttainment: number | null;
  goalsOnTrack: number;
  totalGoals: number;
  completedActions: number;
  totalActions: number;
  compositeScore: number;
}

export default function BenchmarkingPage() {
  const { activeTenantId } = useTenantStore();

  const { data, isLoading } = useQuery<{ ok: boolean; data: Ranking[] }>({
    queryKey: ["/api/tenants", activeTenantId, "benchmarking"],
    enabled: !!activeTenantId,
  });

  const rankings = data?.data || [];

  if (!activeTenantId) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold" data-testid="text-benchmarking-title">Benchmarking</h1>
        <p className="text-muted-foreground mt-1">Select a tenant to view location rankings.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20" />)}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-benchmarking-title">Benchmarking</h1>
        <p className="text-muted-foreground text-sm">Location rankings by composite performance</p>
      </div>

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
                    <div className="flex items-center justify-center h-10 w-10 rounded-full bg-muted font-bold text-lg shrink-0">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{r.locationName}</span>
                        {isTop && <Trophy className="h-4 w-4 text-status-success-foreground" />}
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Target className="h-3 w-3" />
                          Goals: {r.goalsOnTrack}/{r.totalGoals}
                          {r.goalAttainment !== null && (
                            <span className={r.goalAttainment >= 70 ? statusColors.success.text : r.goalAttainment >= 40 ? statusColors.warning.text : statusColors.error.text}>
                              ({r.goalAttainment}%)
                            </span>
                          )}
                        </span>
                        <span className="flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          Alerts: {r.alertBurden}
                        </span>
                        <span>
                          Actions: {r.completedActions}/{r.totalActions}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-bold">{r.compositeScore}</div>
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
