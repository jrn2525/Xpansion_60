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
  Building2,
  Calendar,
  Store,
  ListChecks,
  TrendingUp,
  ClipboardEdit,
} from "lucide-react";
import type { Location, MetricDefinition, MetricValue } from "@shared/schema";

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

  const firstLocationId = locations?.[0]?.id;
  const { data: metricValues } = useQuery<MetricValue[]>({
    queryKey: ["/api/tenants", activeTenantId, "metric-values", { locationId: firstLocationId }],
    enabled: !!activeTenantId && !!firstLocationId,
    queryFn: async () => {
      const params = new URLSearchParams({ locationId: String(firstLocationId) });
      const res = await fetch(`/api/tenants/${activeTenantId}/metric-values?${params}`, { credentials: "include" });
      const data = await res.json();
      return data.data || [];
    },
  });

  const hasEnteredData = (metricValues?.length || 0) > 0;

  const activeTenant = tenants?.find((t: any) => t.id === activeTenantId);
  const activeLocations = locations?.filter((l) => l.isActive) || [];
  const activeMetrics = metrics?.filter((m) => m.isActive) || [];
  const isLoading = locsLoading || metricsLoading;
  const savedData = progressData?.savedData || {};

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

      <div className="grid gap-4 sm:grid-cols-3">
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
        <StatCard
          label="Frequency"
          value={savedData.trackingFrequency || "—"}
          icon={Calendar}
          testId="text-stat-frequency"
          capitalize
        />
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
