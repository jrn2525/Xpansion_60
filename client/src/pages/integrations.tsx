import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTenantStore } from "@/lib/tenant-store";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Upload,
  Plug,
  ArrowRight,
  Trash2,
  PauseCircle,
  PlayCircle,
  Clock,
  MapPin,
  Globe,
  Database,
  FileJson,
  Zap,
  FileSpreadsheet,
  RefreshCw,
  Loader2,
  PlugZap,
} from "lucide-react";
import type { TenantIntegration } from "@shared/schema";

const TYPE_META: Record<string, { icon: any; label: string; color: string }> = {
  rest_api: { icon: Globe, label: "REST API", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  webhook: { icon: Zap, label: "Webhook", color: "bg-purple-500/10 text-purple-600 dark:text-purple-400" },
  database: { icon: Database, label: "Database", color: "bg-green-500/10 text-green-600 dark:text-green-400" },
  csv_feed: { icon: FileJson, label: "CSV/JSON Feed", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
};

const STATUS_BADGE: Record<string, { variant: "default" | "secondary" | "outline" | "destructive"; label: string }> = {
  active: { variant: "default", label: "Active" },
  draft: { variant: "secondary", label: "Draft" },
  paused: { variant: "outline", label: "Paused" },
  error: { variant: "destructive", label: "Error" },
};

export default function IntegrationsPage() {
  const { toast } = useToast();
  const { activeTenantId } = useTenantStore();
  const [, setLocation] = useLocation();

  const { data: integrations, isLoading } = useQuery<TenantIntegration[]>({
    queryKey: [`/api/tenants/${activeTenantId}/integrations`],
    enabled: !!activeTenantId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/tenants/${activeTenantId}/integrations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/tenants/${activeTenantId}/integrations`] });
      toast({ title: "Integration deleted" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const newStatus = status === "active" ? "paused" : "active";
      await apiRequest("PATCH", `/api/tenants/${activeTenantId}/integrations/${id}`, { status: newStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/tenants/${activeTenantId}/integrations`] });
    },
  });

  if (!activeTenantId) {
    return (
      <div className="p-6 text-center text-muted-foreground" data-testid="no-tenant">
        Select a tenant to manage integrations.
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6" data-testid="integrations-hub">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Integrations Hub</h1>
        <p className="text-sm text-muted-foreground">Import data and connect external sources to keep metrics current</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => setLocation("/integrations/import")}
          data-testid="card-import-wizard"
        >
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-lg bg-primary/10">
                <Upload className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-1">Import File</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Upload a CSV or Excel file to import metric data. Map columns, choose a destination, and review before importing.
                </p>
                <Button size="sm" data-testid="button-start-import">
                  Start Import <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => setLocation("/integrations/api")}
          data-testid="card-api-wizard"
        >
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-lg bg-primary/10">
                <Plug className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-1">API Integration</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Connect to REST APIs, webhooks, databases, or data feeds. Auto-sync metrics on a schedule.
                </p>
                <Button size="sm" data-testid="button-start-api">
                  Set Up Integration <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold" data-testid="text-active-heading">Active Integrations</h2>
          {integrations && integrations.length > 0 && (
            <Badge variant="secondary">{integrations.length} total</Badge>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : !integrations || integrations.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <PlugZap className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                No integrations set up yet. Use the wizards above to get started.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {integrations.map((intg) => {
              const typeMeta = TYPE_META[intg.type] || { icon: Plug, label: intg.type, color: "bg-muted text-muted-foreground" };
              const Icon = typeMeta.icon;
              const statusBadge = STATUS_BADGE[intg.status] || { variant: "outline" as const, label: intg.status };
              return (
                <Card key={intg.id} data-testid={`integration-card-${intg.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-lg ${typeMeta.color}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm truncate">{intg.name}</p>
                          <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {intg.syncSchedule || "Manual"}
                          </span>
                          {intg.lastSyncAt && (
                            <span>Last sync: {new Date(intg.lastSyncAt).toLocaleString()}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {(intg.status === "active" || intg.status === "paused") && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => toggleMutation.mutate({ id: intg.id, status: intg.status })}
                            disabled={toggleMutation.isPending}
                            data-testid={`button-toggle-${intg.id}`}
                          >
                            {intg.status === "active" ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteMutation.mutate(intg.id)}
                          disabled={deleteMutation.isPending}
                          className="text-destructive hover:text-destructive"
                          data-testid={`button-delete-${intg.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
