import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useTenantStore } from "@/lib/tenant-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import {
  MapPin,
  BarChart3,
  Target,
  CheckCircle2,
  Circle,
  ArrowRight,
  Calendar,
  Store,
  TrendingUp,
  ClipboardEdit,
  Trophy,
  Clock,
  ListChecks,
  BookOpen,
  AlertCircle,
  Newspaper,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { Location, MetricDefinition, MetricValue, ScorecardTemplate, Action, Goal } from "@shared/schema";
import { getPeriodDates } from "@/lib/period-utils";

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  done: boolean;
  href: string;
  icon: any;
}

export default function ClientHomePage() {
  const { user } = useAuth();
  const { activeTenantId } = useTenantStore();

  const { data: tenants } = useQuery<any[]>({
    queryKey: ["/api/tenants"],
  });

  const { data: locations, isLoading: locsLoading } = useQuery<Location[]>({
    queryKey: ["/api/tenants", activeTenantId, "locations"],
    enabled: !!activeTenantId,
  });

  const { data: metrics, isLoading: metricsLoading } = useQuery<MetricDefinition[]>({
    queryKey: ["/api/tenants", activeTenantId, "metrics"],
    enabled: !!activeTenantId,
  });

  const { data: progressData } = useQuery<any>({
    queryKey: ["/api/v1/onboarding/progress"],
  });

  const { data: scorecards } = useQuery<ScorecardTemplate[]>({
    queryKey: ["/api/tenants", activeTenantId, "scorecards"],
    enabled: !!activeTenantId,
  });

  const activeScorecard = scorecards?.[0];
  const { data: runs } = useQuery<any[]>({
    queryKey: ["/api/tenants", activeTenantId, "scorecards", activeScorecard?.id, "runs"],
    enabled: !!activeTenantId && !!activeScorecard?.id,
  });

  const firstLocationId = locations?.[0]?.id;
  const frequency = progressData?.progress?.savedData?.trackingFrequency || progressData?.savedData?.trackingFrequency || "weekly";
  const currentPeriod = getPeriodDates(frequency, new Date());

  const { data: currentPeriodValues } = useQuery<MetricValue[]>({
    queryKey: ["/api/tenants", activeTenantId, "metric-values", {
      locationId: firstLocationId,
      periodStart: currentPeriod.periodStart.toISOString(),
      periodEnd: currentPeriod.periodEnd.toISOString(),
    }],
    enabled: !!activeTenantId && !!firstLocationId,
    queryFn: async () => {
      const params = new URLSearchParams({
        locationId: String(firstLocationId),
        periodStart: currentPeriod.periodStart.toISOString(),
        periodEnd: currentPeriod.periodEnd.toISOString(),
      });
      const res = await fetch(`/api/tenants/${activeTenantId}/metric-values?${params}`, { credentials: "include" });
      const data = await res.json();
      return data.data || [];
    },
  });

  const { data: allMetricValues } = useQuery<MetricValue[]>({
    queryKey: ["/api/tenants", activeTenantId, "metric-values", { locationId: firstLocationId }],
    enabled: !!activeTenantId && !!firstLocationId,
    queryFn: async () => {
      const params = new URLSearchParams({ locationId: String(firstLocationId) });
      const res = await fetch(`/api/tenants/${activeTenantId}/metric-values?${params}`, { credentials: "include" });
      const data = await res.json();
      return data.data || [];
    },
  });

  const hasEnteredData = (allMetricValues?.length || 0) > 0;

  const { data: actionsData } = useQuery<{ ok: boolean; data: Action[] }>({
    queryKey: ["/api/tenants", activeTenantId, "actions"],
    enabled: !!activeTenantId,
  });

  const { data: goalsData } = useQuery<{ ok: boolean; data: Goal[] }>({
    queryKey: ["/api/tenants", activeTenantId, "goals"],
    enabled: !!activeTenantId,
  });

  const { data: assignmentsData } = useQuery<{ ok: boolean; data: any[] }>({
    queryKey: ["/api/tenants", activeTenantId, "playbook-assignments"],
    enabled: !!activeTenantId,
  });

  const allActions = actionsData?.data || [];
  const openActions = allActions.filter(a => a.status !== "done");
  const overdueActions = openActions.filter(a => a.dueDate && new Date(a.dueDate) < new Date());
  const upcomingActions = openActions
    .sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    })
    .slice(0, 3);

  const allGoals = goalsData?.data || [];
  const activeGoals = allGoals.filter(g => g.status !== "completed");

  const assignments = assignmentsData?.data || [];
  const activeAssignments = assignments.filter((a: any) => a.status !== "completed");

  const activeTenant = tenants?.find((t: any) => t.id === activeTenantId);
  const activeLocations = locations?.filter((l) => l.isActive) || [];
  const activeMetrics = metrics?.filter((m) => m.isActive) || [];
  const isLoading = locsLoading || metricsLoading;
  const savedData = progressData?.progress?.savedData || progressData?.savedData || {};

  const latestRun = runs
    ?.filter((r: any) => r.locationId === Number(firstLocationId))
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] || null;

  const latestScore = latestRun ? Math.round(latestRun.totalScore) : null;
  const latestBand = latestRun?.band || null;

  const filledThisPeriod = currentPeriodValues?.length || 0;
  const totalActiveMetrics = activeMetrics.length;

  const lastUpdatedAt = allMetricValues?.length
    ? allMetricValues.reduce((latest, v) => {
        const t = new Date(v.recordedAt).getTime();
        return t > latest ? t : latest;
      }, 0)
    : null;

  const BAND_BADGE_COLORS: Record<string, string> = {
    excellent: "text-green-700 dark:text-green-400 bg-green-500/10",
    good: "text-blue-700 dark:text-blue-400 bg-blue-500/10",
    acceptable: "text-amber-700 dark:text-amber-400 bg-amber-500/10",
    poor: "text-red-700 dark:text-red-400 bg-red-500/10",
  };
  const BAND_LABELS: Record<string, string> = {
    excellent: "Excellent", good: "Good", acceptable: "Needs Work", poor: "Critical",
  };

  const checklist: ChecklistItem[] = [
    {
      id: "profile",
      label: "Complete your profile",
      description: "Name, phone, and job title",
      done: !!(user?.firstName && user?.lastName),
      href: "/settings",
      icon: CheckCircle2,
    },
    {
      id: "business",
      label: "Set up your business",
      description: "Business name and industry",
      done: !!activeTenant,
      href: "/my-business",
      icon: Store,
    },
    {
      id: "location",
      label: "Add your first location",
      description: "At least one active location",
      done: activeLocations.length > 0,
      href: "/locations",
      icon: MapPin,
    },
    {
      id: "metrics",
      label: "Define your KPIs",
      description: "Track what matters",
      done: activeMetrics.length > 0,
      href: "/metrics",
      icon: BarChart3,
    },
    {
      id: "targets",
      label: "Set targets for your KPIs",
      description: "Define what success looks like",
      done: !!(savedData.trackingFrequency),
      href: "/my-business",
      icon: Target,
    },
    {
      id: "data",
      label: "Enter your first numbers",
      description: "Start tracking your performance",
      done: hasEnteredData,
      href: "/enter-data",
      icon: ClipboardEdit,
    },
  ];

  const completedCount = checklist.filter((c) => c.done).length;
  const allDone = completedCount === checklist.length;
  const greeting = getGreeting();

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto" data-testid="page-client-home">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-welcome">
          {greeting}, {user?.firstName || "there"}
        </h1>
        <p className="text-muted-foreground mt-1" data-testid="text-business-name">
          {activeTenant?.name || "Your business dashboard"}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Locations"
          value={isLoading ? "—" : String(activeLocations.length)}
          icon={MapPin}
          testId="text-stat-locations"
        />
        <StatCard
          label="KPIs Tracked"
          value={isLoading ? "—" : String(activeMetrics.length)}
          icon={BarChart3}
          testId="text-stat-kpis"
        />
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                <Trophy className="h-4.5 w-4.5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Latest Score</p>
                {latestScore !== null ? (
                  <div className="flex items-center gap-2">
                    <p className="text-lg font-semibold" data-testid="text-stat-score">{latestScore}</p>
                    <Badge className={`text-xs ${BAND_BADGE_COLORS[latestBand!] || ""}`} data-testid="badge-stat-band">
                      {BAND_LABELS[latestBand!] || latestBand}
                    </Badge>
                  </div>
                ) : (
                  <p className="text-lg font-semibold text-muted-foreground" data-testid="text-stat-score">—</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                <Clock className="h-4.5 w-4.5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">This Period</p>
                {totalActiveMetrics > 0 ? (
                  <div>
                    <p className="text-lg font-semibold" data-testid="text-stat-completeness">
                      {filledThisPeriod}/{totalActiveMetrics}
                    </p>
                    <p className="text-xs text-muted-foreground" data-testid="text-stat-freshness">
                      {lastUpdatedAt ? `Updated ${getRelativeTime(lastUpdatedAt)}` : "No data yet"}
                    </p>
                  </div>
                ) : (
                  <p className="text-lg font-semibold text-muted-foreground" data-testid="text-stat-completeness">—</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {!allDone && (
        <Card data-testid="card-getting-started">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Getting Started</CardTitle>
              <Badge variant="secondary" data-testid="text-checklist-progress">
                {completedCount} of {checklist.length}
              </Badge>
            </div>
            <div className="w-full bg-muted rounded-full h-2 mt-2">
              <div
                className="bg-primary rounded-full h-2 transition-all"
                style={{ width: `${(completedCount / checklist.length) * 100}%` }}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            {checklist.map((item) => (
              <Link key={item.id} href={item.href}>
                <div
                  className={`flex items-center gap-3 p-3 rounded-lg transition-colors cursor-pointer ${
                    item.done
                      ? "opacity-60"
                      : "hover:bg-muted/50"
                  }`}
                  data-testid={`checklist-item-${item.id}`}
                >
                  {item.done ? (
                    <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground/40 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${item.done ? "line-through text-muted-foreground" : ""}`}>
                      {item.label}
                    </p>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </div>
                  {!item.done && <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {allDone && (
        <Card data-testid="card-all-set" className="border-primary/20 bg-primary/5">
          <CardContent className="py-8 text-center">
            <CheckCircle2 className="h-10 w-10 text-primary mx-auto mb-3" />
            <h3 className="text-lg font-semibold">You're all set!</h3>
            <p className="text-muted-foreground mt-1 max-w-md mx-auto">
              Your business is configured. Keep entering your numbers regularly to track performance.
            </p>
            <div className="flex justify-center gap-3 mt-4">
              <Link href="/enter-data">
                <Button data-testid="button-enter-data">
                  <ClipboardEdit className="h-4 w-4 mr-2" />
                  Enter Your Numbers
                </Button>
              </Link>
              <Link href="/my-scorecard">
                <Button variant="outline" data-testid="button-view-scorecard">
                  <TrendingUp className="h-4 w-4 mr-2" />
                  My Scorecard
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {allDone && (openActions.length > 0 || activeGoals.length > 0 || activeAssignments.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {openActions.length > 0 && (
            <Card data-testid="card-quick-actions">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-primary" />
                  Actions
                </CardTitle>
                <Link href="/actions">
                  <Button variant="ghost" size="sm" data-testid="button-view-all-actions">
                    View All <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="space-y-2">
                {overdueActions.length > 0 && (
                  <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 mb-2" data-testid="text-overdue-count">
                    <AlertCircle className="h-4 w-4" />
                    {overdueActions.length} overdue
                  </div>
                )}
                {upcomingActions.map(action => (
                  <div key={action.id} className="flex items-center gap-2 py-1.5" data-testid={`action-home-${action.id}`}>
                    <Circle className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                    <span className="text-sm truncate flex-1">{action.title}</span>
                    {action.dueDate && (
                      <span className={`text-xs shrink-0 ${new Date(action.dueDate) < new Date() ? "text-red-500" : "text-muted-foreground"}`}>
                        {new Date(action.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {activeGoals.length > 0 && (
            <Card data-testid="card-goals-summary">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  Goals
                </CardTitle>
                <Link href="/goals">
                  <Button variant="ghost" size="sm" data-testid="button-view-all-goals">
                    View All <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="space-y-2">
                {activeGoals.slice(0, 3).map(goal => {
                  const statusColor = goal.status === "on_track" ? "text-green-600 dark:text-green-400"
                    : goal.status === "at_risk" ? "text-amber-600 dark:text-amber-400"
                    : "text-red-600 dark:text-red-400";
                  const statusLabel = goal.status === "on_track" ? "On Track"
                    : goal.status === "at_risk" ? "At Risk" : "Off Track";
                  return (
                    <div key={goal.id} className="flex items-center justify-between gap-2 py-1.5" data-testid={`goal-home-${goal.id}`}>
                      <span className="text-sm truncate flex-1">{goal.title}</span>
                      <Badge variant="outline" className={`text-xs shrink-0 ${statusColor}`}>{statusLabel}</Badge>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {activeAssignments.length > 0 && (
            <Card data-testid="card-playbook-progress">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary" />
                  Playbooks
                </CardTitle>
                <Link href="/playbooks">
                  <Button variant="ghost" size="sm" data-testid="button-view-all-playbooks">
                    View All <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="space-y-3">
                {activeAssignments.slice(0, 3).map((assignment: any) => {
                  const pb = assignment.playbook;
                  if (!pb) return null;
                  const totalSteps = pb.steps?.length || 0;
                  const doneCount = (assignment.completedSteps || []).length;
                  const pct = totalSteps > 0 ? Math.round((doneCount / totalSteps) * 100) : 0;
                  return (
                    <div key={assignment.id} data-testid={`playbook-home-${assignment.id}`}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-sm font-medium truncate">{pb.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{doneCount}/{totalSteps}</span>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card data-testid="card-locations">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Your Locations</CardTitle>
            <Link href="/locations">
              <Button variant="ghost" size="sm" data-testid="button-manage-locations">
                Manage <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => <Skeleton key={i} className="h-10" />)}
              </div>
            ) : activeLocations.length === 0 ? (
              <div className="text-center py-6">
                <MapPin className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No locations yet</p>
                <Link href="/locations">
                  <Button variant="outline" size="sm" className="mt-2" data-testid="button-add-location">
                    Add Location
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {activeLocations.slice(0, 5).map((loc) => (
                  <div key={loc.id} className="flex items-center gap-3 py-2" data-testid={`row-location-${loc.id}`}>
                    <MapPin className="h-4 w-4 text-primary/60 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{loc.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[loc.city, loc.state].filter(Boolean).join(", ")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-kpis">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Your KPIs</CardTitle>
            <Link href="/metrics">
              <Button variant="ghost" size="sm" data-testid="button-manage-kpis">
                Manage <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => <Skeleton key={i} className="h-10" />)}
              </div>
            ) : activeMetrics.length === 0 ? (
              <div className="text-center py-6">
                <BarChart3 className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No KPIs defined yet</p>
                <Link href="/metrics">
                  <Button variant="outline" size="sm" className="mt-2" data-testid="button-add-kpi">
                    Add KPI
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {activeMetrics.slice(0, 5).map((metric) => (
                  <div key={metric.id} className="flex items-center gap-3 py-2" data-testid={`row-metric-${metric.id}`}>
                    <BarChart3 className="h-4 w-4 text-primary/60 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{metric.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {metric.direction === "higher_is_better" ? "Higher is better" : "Lower is better"}
                        {metric.unit ? ` · ${metric.unit}` : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, testId, capitalize }: {
  label: string;
  value: string;
  icon: any;
  testId: string;
  capitalize?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 shrink-0">
            <Icon className="h-4.5 w-4.5 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-lg font-semibold ${capitalize ? "capitalize" : ""}`} data-testid={testId}>
              {value}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function getRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
