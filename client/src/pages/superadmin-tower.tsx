import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useEntityLookup } from "@/hooks/use-entity-lookup";
import { useTenantStore } from "@/lib/tenant-store";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Radio,
  Building2,
  MapPin,
  AlertTriangle,
  Users,
  Loader2,
  ArrowUpDown,
  Heart,
  ExternalLink,
  Clock,
  Activity,
} from "lucide-react";
import { severityColors } from "@/lib/semantic-colors";

interface TowerOverview {
  totalTenants: number;
  totalLocations: number;
  overallAvgRisk: number;
  totalOpenIncidents: number;
  totalOpenActions: number;
  tenants: TenantSummary[];
}

interface TenantSummary {
  tenantId: number;
  tenantName: string;
  locations: number;
  avgRisk: number;
  highRiskCount: number;
  openIncidents: number;
  openActions: number;
  riskLevel: string;
}

interface TenantLeaderboardItem {
  tenantId: number;
  tenantName: string;
  slug: string;
  locations: number;
  avgRisk: number;
  riskLevel: string;
  highRiskSnapshots: number;
  totalSnapshots: number;
}

interface InterventionItem {
  id: number;
  tenantId: number;
  locationId: number | null;
  metricDefinitionId: number | null;
  type: string;
  severity: string;
  title: string;
  description: string | null;
  riskScore: number | null;
  status: string;
  assignedToUserId: string | null;
  assignedAt: string | null;
  resolvedAt: string | null;
  createdAt: string | null;
}

interface ClientHealth {
  tenantId: number;
  tenantName: string;
  slug: string;
  totalUsers: number;
  activeUsersLast7d: number;
  actionsCreatedThisWeek: number;
  lastActivityDate: string | null;
  lastDataDate: string | null;
  status: "healthy" | "quiet" | "inactive";
}

const healthStatusConfig: Record<string, { color: string; label: string }> = {
  healthy: { color: "bg-status-success/15 text-status-success-foreground", label: "Active" },
  quiet: { color: "bg-status-warning/15 text-status-warning-foreground", label: "Going Quiet" },
  inactive: { color: "bg-status-error/20 text-status-error-foreground", label: "Inactive" },
};

const riskLevelColors: Record<string, string> = {
  low: "bg-status-success/15 text-status-success-foreground",
  medium: "bg-status-warning/15 text-status-warning-foreground",
  high: "bg-status-error/20 text-status-error-foreground",
  critical: "bg-status-error/30 text-status-error-foreground",
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

export default function SuperadminTowerPage() {
  const { toast } = useToast();
  const { resolveUser, users } = useEntityLookup();
  const { setActiveTenantId } = useTenantStore();
  const [, navigate] = useLocation();
  const [sortBy, setSortBy] = useState("risk");
  const [riskFilter, setRiskFilter] = useState("all");
  const [interventionStatus, setInterventionStatus] = useState("all");
  const [interventionSeverity, setInterventionSeverity] = useState("all");
  const [assignDialog, setAssignDialog] = useState<InterventionItem | null>(null);
  const [assignUserId, setAssignUserId] = useState("");

  const { data: overviewResponse, isLoading: overviewLoading } = useQuery<{ ok: boolean; data: TowerOverview }>({
    queryKey: ["/api/superadmin/tower/overview"],
  });

  const { data: healthData, isLoading: healthLoading } = useQuery<ClientHealth[]>({
    queryKey: ["/api/superadmin/tower/health"],
  });

  function quickSwitch(tenantId: number) {
    setActiveTenantId(tenantId);
    navigate("/dashboard");
  }

  const tenantParams = new URLSearchParams();
  tenantParams.set("sort", sortBy);
  if (riskFilter !== "all") tenantParams.set("riskLevel", riskFilter);

  const { data: tenantsResponse, isLoading: tenantsLoading } = useQuery<{ ok: boolean; data: TenantLeaderboardItem[] }>({
    queryKey: ["/api/superadmin/tower/tenants", `?${tenantParams.toString()}`],
  });

  const interventionParams = new URLSearchParams();
  if (interventionStatus !== "all") interventionParams.set("status", interventionStatus);
  if (interventionSeverity !== "all") interventionParams.set("severity", interventionSeverity);

  const { data: interventionsResponse, isLoading: interventionsLoading } = useQuery<{ ok: boolean; data: InterventionItem[] }>({
    queryKey: ["/api/superadmin/tower/interventions", `?${interventionParams.toString()}`],
  });

  const assignMutation = useMutation({
    mutationFn: (interventionId: number) =>
      apiRequest("POST", `/api/superadmin/tower/interventions/${interventionId}/assign`, {
        assignedToUserId: assignUserId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/tower/interventions"] });
      setAssignDialog(null);
      setAssignUserId("");
      toast({ title: "Intervention assigned" });
    },
    onError: (error: any) => {
      toast({ title: "Assignment failed", description: error.message, variant: "destructive" });
    },
  });

  const overview = overviewResponse?.data;
  const tenants = tenantsResponse?.data || [];
  const interventions = interventionsResponse?.data || [];

  if (overviewLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-tower-title">
          <Radio className="h-6 w-6" />
          Command Tower
        </h1>
        <p className="text-muted-foreground text-sm">Cross-client oversight and intervention management</p>
      </div>

      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <Building2 className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
              <p className="text-2xl font-bold" data-testid="text-total-tenants">{overview.totalTenants}</p>
              <p className="text-xs text-muted-foreground">Clients</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <MapPin className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
              <p className="text-2xl font-bold" data-testid="text-total-locations">{overview.totalLocations}</p>
              <p className="text-xs text-muted-foreground">Locations</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <AlertTriangle className="h-5 w-5 mx-auto text-status-warning-foreground mb-1" />
              <p className="text-2xl font-bold" data-testid="text-avg-risk">{overview.overallAvgRisk}</p>
              <p className="text-xs text-muted-foreground">Avg Risk</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold" data-testid="text-open-incidents">{overview.totalOpenIncidents}</p>
              <p className="text-xs text-muted-foreground">Open Incidents</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold" data-testid="text-open-actions">{overview.totalOpenActions}</p>
              <p className="text-xs text-muted-foreground">Open Actions</p>
            </CardContent>
          </Card>
        </div>
      )}

      {overview && overview.tenants.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Portfolio Heatmap</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {overview.tenants.map((t) => (
                <div
                  key={t.tenantId}
                  className={`px-3 py-2 rounded-md text-sm font-medium ${riskLevelColors[t.riskLevel] || riskLevelColors.low}`}
                  data-testid={`heatmap-tenant-${t.tenantId}`}
                >
                  <p className="font-medium">{t.tenantName}</p>
                  <p className="text-xs opacity-80">Risk: {t.avgRisk} | Locs: {t.locations}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Heart className="h-4 w-4" />
            Client Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          {healthLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16" />)}
            </div>
          ) : !healthData || healthData.length === 0 ? (
            <p className="text-muted-foreground text-center py-4" data-testid="text-no-health">No client data available.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {healthData.map((client) => {
                const cfg = healthStatusConfig[client.status] || healthStatusConfig.inactive;
                return (
                  <div
                    key={client.tenantId}
                    className="border rounded-lg p-4 flex flex-col gap-2"
                    data-testid={`health-card-${client.tenantId}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-sm" data-testid={`health-name-${client.tenantId}`}>{client.tenantName}</p>
                        <Badge className={`text-xs ${cfg.color}`} data-testid={`health-status-${client.tenantId}`}>{cfg.label}</Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => quickSwitch(client.tenantId)}
                        data-testid={`button-switch-${client.tenantId}`}
                        title="Switch to this client"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        <span>{client.activeUsersLast7d}/{client.totalUsers} active</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Activity className="h-3 w-3" />
                        <span>{client.actionsCreatedThisWeek} actions/wk</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>Last seen: {timeAgo(client.lastActivityDate)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>Data: {timeAgo(client.lastDataDate)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="text-base">Client Leaderboard</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-36" data-testid="select-sort-by">
                  <ArrowUpDown className="h-3 w-3 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="risk">Risk</SelectItem>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="locations">Locations</SelectItem>
                </SelectContent>
              </Select>
              <Select value={riskFilter} onValueChange={setRiskFilter}>
                <SelectTrigger className="w-36" data-testid="select-risk-filter">
                  <SelectValue placeholder="All levels" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {tenantsLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : tenants.length === 0 ? (
            <p className="text-muted-foreground text-center py-4" data-testid="text-no-tenants">No clients found matching filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Locations</TableHead>
                    <TableHead>Avg Risk</TableHead>
                    <TableHead>Risk Level</TableHead>
                    <TableHead>High-Risk</TableHead>
                    <TableHead>Snapshots</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenants.map((tenant) => (
                    <TableRow key={tenant.tenantId} data-testid={`row-tenant-${tenant.tenantId}`}>
                      <TableCell>
                        <div>
                          <p className="font-medium" data-testid={`text-tenant-name-${tenant.tenantId}`}>{tenant.tenantName}</p>
                          <p className="text-xs text-muted-foreground">{tenant.slug}</p>
                        </div>
                      </TableCell>
                      <TableCell data-testid={`text-tenant-locations-${tenant.tenantId}`}>{tenant.locations}</TableCell>
                      <TableCell>
                        <span className="font-medium" data-testid={`text-tenant-risk-${tenant.tenantId}`}>{tenant.avgRisk}</span>
                      </TableCell>
                      <TableCell>
                        <Badge className={riskLevelColors[tenant.riskLevel] || ""} data-testid={`badge-risk-level-${tenant.tenantId}`}>
                          {tenant.riskLevel}
                        </Badge>
                      </TableCell>
                      <TableCell data-testid={`text-high-risk-${tenant.tenantId}`}>{tenant.highRiskSnapshots}</TableCell>
                      <TableCell>{tenant.totalSnapshots}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="text-base">Intervention Queue</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={interventionStatus} onValueChange={setInterventionStatus}>
                <SelectTrigger className="w-36" data-testid="select-intervention-status">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="assigned">Assigned</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
              <Select value={interventionSeverity} onValueChange={setInterventionSeverity}>
                <SelectTrigger className="w-36" data-testid="select-intervention-severity">
                  <SelectValue placeholder="All severities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severities</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {interventionsLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : interventions.length === 0 ? (
            <p className="text-muted-foreground text-center py-4" data-testid="text-no-interventions">No interventions found.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Assigned</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {interventions.map((item) => (
                    <TableRow key={item.id} data-testid={`row-intervention-${item.id}`}>
                      <TableCell>
                        <Badge variant="outline" data-testid={`badge-type-${item.id}`}>
                          {item.type.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={severityColors[item.severity as keyof typeof severityColors] || ""} data-testid={`badge-severity-${item.id}`}>
                          {item.severity}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm max-w-xs truncate" data-testid={`text-title-${item.id}`}>{item.title}</p>
                      </TableCell>
                      <TableCell data-testid={`text-risk-score-${item.id}`}>
                        {item.riskScore != null ? item.riskScore.toFixed(0) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" data-testid={`badge-status-${item.id}`}>{item.status}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground" data-testid={`text-assigned-${item.id}`}>
                        {resolveUser(item.assignedToUserId)}
                      </TableCell>
                      <TableCell>
                        {item.status !== "resolved" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { setAssignDialog(item); setAssignUserId(item.assignedToUserId || ""); }}
                            data-testid={`button-assign-${item.id}`}
                          >
                            <Users className="h-3 w-3 mr-1" />
                            Assign
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={assignDialog !== null} onOpenChange={() => setAssignDialog(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Intervention</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-1">Title</p>
              <p className="text-sm text-muted-foreground" data-testid="text-assign-title">{assignDialog?.title}</p>
            </div>
            <div>
              <p className="text-sm font-medium mb-1">Assign To</p>
              <Select value={assignUserId || "none"} onValueChange={(v) => setAssignUserId(v === "none" ? "" : v)}>
                <SelectTrigger data-testid="select-assign-user">
                  <SelectValue placeholder="Select a user" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.userId} value={u.userId}>{u.username || u.userId} ({u.role})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => assignDialog && assignMutation.mutate(assignDialog.id)}
              disabled={!assignUserId.trim() || assignMutation.isPending}
              className="w-full"
              data-testid="button-confirm-assign"
            >
              {assignMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Assign
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
