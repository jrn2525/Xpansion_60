import { useQuery, useMutation } from "@tanstack/react-query";
import { useTenantStore } from "@/lib/tenant-store";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { statusColors, severityColors } from "@/lib/semantic-colors";
import {
  Trophy,
  AlertTriangle,
  Bell,
  MapPin,
  RefreshCw,
  Plus,
  Target,
  Clock,
  Zap,
  ChevronRight,
  Crosshair,
} from "lucide-react";
import { Link } from "wouter";

interface CommandCenterData {
  wins: Array<{ type: string; title: string; id: number }>;
  risks: Array<{ type: string; title: string; id: number }>;
  criticalAlerts: Array<{ id: number; message: string; severity: string }>;
  locationsNeedingIntervention: Array<{ id: number; name: string }>;
  priorities: Array<{ type: string; title: string; severity?: string; sourceId: number; dueDate?: string; impactScore?: string }>;
  stats: {
    totalActions: number;
    openActions: number;
    overdueActions: number;
    blockedActions: number;
    totalGoals: number;
    offTrackGoals: number;
    openOpportunities: number;
    openAlerts: number;
  };
}

export default function CommandCenterPage() {
  const { activeTenantId } = useTenantStore();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<{ ok: boolean; data: CommandCenterData }>({
    queryKey: ["/api/tenants", activeTenantId, "weekly-command-center"],
    enabled: !!activeTenantId,
  });

  const refreshMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/tenants/${activeTenantId}/weekly-command-center/refresh`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", activeTenantId, "weekly-command-center"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", activeTenantId, "opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", activeTenantId, "goals"] });
      toast({ title: "Command center refreshed", description: "Opportunities and goal statuses have been updated." });
    },
  });

  const cc = data?.data;

  if (!activeTenantId) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-2" data-testid="text-command-center-title">Command Center</h1>
        <p className="text-muted-foreground">Select a tenant to view your weekly command center.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-48" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-command-center-title">Command Center</h1>
          <p className="text-muted-foreground text-sm">Weekly snapshot — what matters now</p>
        </div>
        <Button
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending}
          variant="outline"
          data-testid="button-refresh-command-center"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
          Refresh Data
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-sm text-muted-foreground">Open Actions</div>
            <div className="text-2xl font-bold" data-testid="stat-open-actions">{cc?.stats.openActions ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-sm text-muted-foreground">Overdue</div>
            <div className={`text-2xl font-bold ${(cc?.stats.overdueActions ?? 0) > 0 ? statusColors.error.text : ""}`} data-testid="stat-overdue-actions">
              {cc?.stats.overdueActions ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-sm text-muted-foreground">Off-Track Goals</div>
            <div className={`text-2xl font-bold ${(cc?.stats.offTrackGoals ?? 0) > 0 ? statusColors.warning.text : ""}`} data-testid="stat-off-track-goals">
              {cc?.stats.offTrackGoals ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-sm text-muted-foreground">Open Alerts</div>
            <div className={`text-2xl font-bold ${(cc?.stats.openAlerts ?? 0) > 0 ? statusColors.error.text : ""}`} data-testid="stat-open-alerts">
              {cc?.stats.openAlerts ?? 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="h-4 w-4 text-status-success-foreground" />
              Top Wins
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!cc?.wins.length ? (
              <p className="text-sm text-muted-foreground py-4" data-testid="text-no-wins">No wins logged yet. Complete actions to see wins here.</p>
            ) : (
              <ul className="space-y-2">
                {cc.wins.map((w, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm" data-testid={`win-item-${i}`}>
                    <div className="h-2 w-2 rounded-full bg-status-success shrink-0" />
                    {w.title}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-status-warning-foreground" />
              Top Risks
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!cc?.risks.length ? (
              <p className="text-sm text-muted-foreground py-4" data-testid="text-no-risks">No risks detected. Goals and actions are on track.</p>
            ) : (
              <ul className="space-y-2">
                {cc.risks.map((r, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm" data-testid={`risk-item-${i}`}>
                    <div className="h-2 w-2 rounded-full bg-status-warning shrink-0" />
                    <span className="flex-1">{r.title}</span>
                    <Badge variant="outline" className="text-xs capitalize">{r.type.replace(/_/g, " ")}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4 text-status-error-foreground" />
              Critical Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!cc?.criticalAlerts.length ? (
              <p className="text-sm text-muted-foreground py-4" data-testid="text-no-critical-alerts">No critical alerts. Systems are stable.</p>
            ) : (
              <ul className="space-y-2">
                {cc.criticalAlerts.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 text-sm" data-testid={`alert-item-${a.id}`}>
                    <Badge className={severityColors[a.severity]?.badge || ""} variant="outline">{a.severity}</Badge>
                    <span className="flex-1 truncate">{a.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4 text-primary" />
              Locations Needing Intervention
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!cc?.locationsNeedingIntervention.length ? (
              <p className="text-sm text-muted-foreground py-4" data-testid="text-no-interventions">All locations are performing within acceptable ranges.</p>
            ) : (
              <ul className="space-y-2">
                {cc.locationsNeedingIntervention.map((loc) => (
                  <li key={loc.id} className="flex items-center justify-between gap-2 text-sm" data-testid={`intervention-loc-${loc.id}`}>
                    <span className="flex items-center gap-2">
                      <MapPin className="h-3 w-3 text-muted-foreground" />
                      {loc.name}
                    </span>
                    <Link href="/actions">
                      <Button variant="ghost" size="sm" className="h-7 text-xs">
                        View <ChevronRight className="h-3 w-3 ml-1" />
                      </Button>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Crosshair className="h-4 w-4 text-primary" />
            This Week's Priorities
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!cc?.priorities.length ? (
            <p className="text-sm text-muted-foreground py-4" data-testid="text-no-priorities">
              No priorities generated yet. Click "Refresh Data" to scan for trends, threshold misses, and low scorecard outcomes.
            </p>
          ) : (
            <div className="space-y-3">
              {cc.priorities.map((p, i) => (
                <div key={i} className="flex items-center justify-between gap-3 p-3 rounded-md border" data-testid={`priority-item-${i}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    {p.type === "alert" && <Bell className="h-4 w-4 text-status-error-foreground shrink-0" />}
                    {p.type === "overdue_action" && <Clock className="h-4 w-4 text-status-warning-foreground shrink-0" />}
                    {p.type === "off_track_goal" && <Target className="h-4 w-4 text-status-warning-foreground shrink-0" />}
                    {p.type === "opportunity" && <Zap className="h-4 w-4 text-primary shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{p.title}</p>
                      <p className="text-xs text-muted-foreground capitalize">{p.type.replace(/_/g, " ")}</p>
                    </div>
                  </div>
                  <Link href="/actions">
                    <Button variant="outline" size="sm" className="shrink-0" data-testid={`button-create-action-${i}`}>
                      <Plus className="h-3 w-3 mr-1" />
                      Action
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
