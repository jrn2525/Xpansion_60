import { useState } from "react";
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
  ChevronDown,
  Crosshair,
  Gauge,
  Lightbulb,
  RotateCcw,
} from "lucide-react";
import { Link } from "wouter";
import type { Opportunity } from "@shared/schema";

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

interface RationaleData {
  factors: Array<{ label: string; value: string }>;
  summary: string;
}

const priorityBadgeStyle: Record<string, string> = {
  critical: "bg-status-error/20 text-status-error-foreground",
  high: "bg-status-error/15 text-status-error-foreground",
  medium: "bg-status-warning/15 text-status-warning-foreground",
  low: "bg-status-info text-status-info-foreground",
};

function confidenceLabel(score: number | null | undefined): string {
  if (score == null) return "N/A";
  if (score >= 0.8) return "High";
  if (score >= 0.5) return "Medium";
  return "Low";
}

function confidenceColor(score: number | null | undefined): string {
  if (score == null) return "text-muted-foreground";
  if (score >= 0.8) return "text-status-success-foreground";
  if (score >= 0.5) return "text-status-warning-foreground";
  return "text-status-error-foreground";
}

function OpportunityCard({ opp, tenantId }: { opp: Opportunity; tenantId: number }) {
  const [expanded, setExpanded] = useState(false);
  const { toast } = useToast();

  let rationale: RationaleData | null = null;
  try { rationale = opp.rationaleJson ? JSON.parse(opp.rationaleJson) : null; } catch { /* ignore malformed JSON */ }

  const createActionMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/tenants/${tenantId}/opportunities/${opp.id}/create-action`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "weekly-command-center"] });
      toast({ title: "Action created", description: `Action created from opportunity: ${opp.title}` });
    },
  });

  return (
    <Card data-testid={`card-opportunity-${opp.id}`}>
      <CardContent className="pt-4 pb-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <Zap className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-medium" data-testid={`text-opportunity-title-${opp.id}`}>{opp.title}</p>
              {opp.description && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{opp.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Badge
              className={priorityBadgeStyle[opp.priority] || priorityBadgeStyle.medium}
              variant="outline"
              data-testid={`badge-priority-${opp.id}`}
            >
              {opp.priority}
            </Badge>
            <Badge variant="outline" data-testid={`badge-impact-${opp.id}`}>
              {opp.impactScore} impact
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
          <span className="flex items-center gap-1" data-testid={`text-confidence-${opp.id}`}>
            <Gauge className="h-3 w-3" />
            Confidence:{" "}
            <span className={`font-medium ${confidenceColor(opp.confidenceScore)}`}>
              {opp.confidenceScore != null ? `${Math.round(opp.confidenceScore * 100)}%` : "N/A"}
            </span>
            <span className={confidenceColor(opp.confidenceScore)}>
              ({confidenceLabel(opp.confidenceScore)})
            </span>
          </span>
          {opp.detectedAt && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Detected: {new Date(opp.detectedAt).toLocaleDateString()}
            </span>
          )}
          {opp.lastRecomputedAt && (
            <span className="flex items-center gap-1">
              <RotateCcw className="h-3 w-3" />
              Recomputed: {new Date(opp.lastRecomputedAt).toLocaleDateString()}
            </span>
          )}
        </div>

        {rationale && (
          <div>
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover-elevate rounded-md px-1 py-0.5"
              data-testid={`button-rationale-toggle-${opp.id}`}
            >
              <Lightbulb className="h-3 w-3" />
              Why this matters
              {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
            {expanded && (
              <div className="mt-2 p-3 rounded-md bg-muted/50 space-y-2" data-testid={`panel-rationale-${opp.id}`}>
                <p className="text-xs">{rationale.summary}</p>
                {rationale.factors.length > 0 && (
                  <div className="space-y-1">
                    {rationale.factors.map((f, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-muted-foreground">{f.label}</span>
                        <span className="font-medium">{f.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1 flex-wrap">
          {opp.status === "open" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => createActionMutation.mutate()}
              disabled={createActionMutation.isPending}
              data-testid={`button-create-action-opp-${opp.id}`}
            >
              <Plus className="h-3 w-3 mr-1" />
              Create Action
            </Button>
          )}
          {opp.status === "actioned" && (
            <Badge variant="outline" className="bg-status-success/10 text-status-success-foreground">
              Actioned
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function CommandCenterPage() {
  const { activeTenantId } = useTenantStore();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<{ ok: boolean; data: CommandCenterData }>({
    queryKey: ["/api/tenants", activeTenantId, "weekly-command-center"],
    enabled: !!activeTenantId,
  });

  const { data: opportunitiesData, isLoading: oppsLoading } = useQuery<{ ok: boolean; data: Opportunity[] }>({
    queryKey: ["/api/tenants", activeTenantId, "opportunities"],
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

  const recomputeMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/tenants/${activeTenantId}/opportunities/recompute`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", activeTenantId, "opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", activeTenantId, "weekly-command-center"] });
      toast({ title: "Opportunities recomputed", description: "Priority and confidence scores have been updated." });
    },
  });

  const cc = data?.data;
  const opportunities = opportunitiesData?.data || [];
  const openOpportunities = opportunities.filter(o => o.status === "open");

  if (!activeTenantId) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-2" data-testid="text-command-center-title">Command Center</h1>
        <p className="text-muted-foreground">Select a client to view your weekly command center.</p>
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
            <div className={`text-2xl font-bold ${(cc?.stats.overdueActions ?? 0) > 0 ? "text-status-error-foreground" : ""}`} data-testid="stat-overdue-actions">
              {cc?.stats.overdueActions ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-sm text-muted-foreground">Off-Track Goals</div>
            <div className={`text-2xl font-bold ${(cc?.stats.offTrackGoals ?? 0) > 0 ? "text-status-warning-foreground" : ""}`} data-testid="stat-off-track-goals">
              {cc?.stats.offTrackGoals ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-sm text-muted-foreground">Open Alerts</div>
            <div className={`text-2xl font-bold ${(cc?.stats.openAlerts ?? 0) > 0 ? "text-status-error-foreground" : ""}`} data-testid="stat-open-alerts">
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
                    <Badge className={(severityColors as Record<string, string>)[a.severity] || ""} variant="outline">{a.severity}</Badge>
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
                      <Button variant="ghost" size="sm" className="text-xs">
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

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold" data-testid="text-opportunities-heading">Opportunities</h2>
            {openOpportunities.length > 0 && (
              <Badge variant="secondary" data-testid="badge-open-opportunities-count">{openOpportunities.length} open</Badge>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => recomputeMutation.mutate()}
            disabled={recomputeMutation.isPending}
            data-testid="button-recompute-opportunities"
          >
            <RotateCcw className={`h-4 w-4 mr-2 ${recomputeMutation.isPending ? "animate-spin" : ""}`} />
            Recompute
          </Button>
        </div>

        {oppsLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32" />)}
          </div>
        ) : openOpportunities.length === 0 ? (
          <Card>
            <CardContent className="py-6">
              <p className="text-sm text-muted-foreground text-center" data-testid="text-no-opportunities">
                No open opportunities. Click "Refresh Data" to scan for trends and threshold misses.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {openOpportunities.map(opp => (
              <OpportunityCard key={opp.id} opp={opp} tenantId={activeTenantId} />
            ))}
          </div>
        )}
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
