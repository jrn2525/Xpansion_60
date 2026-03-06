import { useQuery } from "@tanstack/react-query";
import { useTenantStore } from "@/lib/tenant-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  MapPin,
  BarChart3,
  ClipboardCheck,
  ArrowUpRight,
  AlertCircle,
} from "lucide-react";
import type {
  Tenant,
  Location,
  MetricDefinition,
  ScorecardTemplate,
} from "@shared/schema";

function StatCard({
  title,
  value,
  icon: Icon,
  description,
  testId,
}: {
  title: string;
  value: string | number;
  icon: any;
  description?: string;
  testId: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold" data-testid={testId}>
          {value}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { activeTenantId } = useTenantStore();

  const { data: tenant } = useQuery<Tenant>({
    queryKey: ["/api/tenants", activeTenantId],
    enabled: !!activeTenantId,
  });

  const { data: locations, isLoading: locsLoading } = useQuery<Location[]>({
    queryKey: ["/api/tenants", activeTenantId, "locations"],
    enabled: !!activeTenantId,
  });

  const { data: metrics, isLoading: metricsLoading } = useQuery<
    MetricDefinition[]
  >({
    queryKey: ["/api/tenants", activeTenantId, "metrics"],
    enabled: !!activeTenantId,
  });

  const { data: scorecards, isLoading: scorecardsLoading } = useQuery<
    ScorecardTemplate[]
  >({
    queryKey: ["/api/tenants", activeTenantId, "scorecards"],
    enabled: !!activeTenantId,
  });

  if (!activeTenantId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 mb-4">
          <Building2 className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-xl font-semibold mb-2">No Tenant Selected</h2>
        <p className="text-muted-foreground max-w-md">
          Select a tenant from the sidebar or create one to get started.
        </p>
      </div>
    );
  }

  const isLoading = locsLoading || metricsLoading || scorecardsLoading;
  const activeMetrics = metrics?.filter((m) => m.isActive) || [];
  const inactiveMetrics = metrics?.filter((m) => !m.isActive) || [];
  const activeLocations = locations?.filter((l) => l.isActive) || [];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-dashboard-title">
          {tenant?.name || "Dashboard"}
        </h1>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <Badge variant="secondary" data-testid="badge-tenant-type">
            {tenant?.type === "multi_location"
              ? "Multi-Location"
              : "Single Location"}
          </Badge>
          {tenant?.isActive ? (
            <Badge variant="default">Active</Badge>
          ) : (
            <Badge variant="destructive">Inactive</Badge>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Locations"
            value={activeLocations.length}
            icon={MapPin}
            description={`${locations?.length || 0} total`}
            testId="text-stat-locations"
          />
          <StatCard
            title="Active Metrics"
            value={activeMetrics.length}
            icon={BarChart3}
            description={
              inactiveMetrics.length > 0
                ? `${inactiveMetrics.length} inactive`
                : "All active"
            }
            testId="text-stat-metrics"
          />
          <StatCard
            title="Scorecards"
            value={scorecards?.length || 0}
            icon={ClipboardCheck}
            description="Templates defined"
            testId="text-stat-scorecards"
          />
          <StatCard
            title="Tenant Type"
            value={
              tenant?.type === "multi_location" ? "Multi" : "Single"
            }
            icon={Building2}
            description={
              tenant?.type === "multi_location"
                ? "Multiple locations"
                : "Single location"
            }
            testId="text-stat-type"
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1">
            <CardTitle className="text-base">Recent Locations</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {activeLocations.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <AlertCircle className="h-4 w-4" />
                <span>No locations configured yet</span>
              </div>
            ) : (
              <div className="space-y-3">
                {activeLocations.slice(0, 5).map((loc) => (
                  <div
                    key={loc.id}
                    className="flex items-center justify-between gap-1 py-2"
                    data-testid={`row-location-${loc.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <MapPin className="h-4 w-4 text-primary/60" />
                      <div>
                        <p className="text-sm font-medium">{loc.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {[loc.city, loc.state].filter(Boolean).join(", ")}
                        </p>
                      </div>
                    </div>
                    <Badge variant={loc.isActive ? "secondary" : "destructive"}>
                      {loc.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1">
            <CardTitle className="text-base">Active Metrics</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {activeMetrics.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <AlertCircle className="h-4 w-4" />
                <span>No metrics defined yet</span>
              </div>
            ) : (
              <div className="space-y-3">
                {activeMetrics.slice(0, 5).map((metric) => (
                  <div
                    key={metric.id}
                    className="flex items-center justify-between gap-1 py-2"
                    data-testid={`row-metric-${metric.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <BarChart3 className="h-4 w-4 text-primary/60" />
                      <div>
                        <p className="text-sm font-medium">{metric.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {metric.dataType} &middot; {metric.direction === "higher_is_better" ? "Higher is better" : "Lower is better"}
                        </p>
                      </div>
                    </div>
                    {metric.unit && (
                      <Badge variant="secondary">{metric.unit}</Badge>
                    )}
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
