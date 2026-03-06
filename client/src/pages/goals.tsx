import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTenantStore } from "@/lib/tenant-store";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { statusColors } from "@/lib/semantic-colors";
import {
  Plus,
  Target,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import type { Goal, Location, MetricDefinition } from "@shared/schema";

const goalStatusConfig: Record<string, { icon: any; badge: string; label: string }> = {
  on_track: { icon: CheckCircle2, label: "On Track", badge: statusColors.success.badge },
  at_risk: { icon: AlertTriangle, label: "At Risk", badge: statusColors.warning.badge },
  off_track: { icon: TrendingDown, label: "Off Track", badge: statusColors.error.badge },
};

export default function GoalsPage() {
  const { activeTenantId } = useTenantStore();
  const { toast } = useToast();
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    title: "",
    targetValue: "",
    period: "weekly",
    startDate: "",
    endDate: "",
    locationId: "",
    metricDefinitionId: "",
  });

  const { data: goalsData, isLoading } = useQuery<{ ok: boolean; data: Goal[] }>({
    queryKey: ["/api/tenants", activeTenantId, "goals"],
    enabled: !!activeTenantId,
  });

  const { data: varianceData } = useQuery<{ ok: boolean; data: any[] }>({
    queryKey: ["/api/tenants", activeTenantId, "goals", "variance"],
    enabled: !!activeTenantId,
  });

  const { data: locsData } = useQuery<Location[]>({
    queryKey: ["/api/tenants", activeTenantId, "locations"],
    enabled: !!activeTenantId,
  });

  const { data: metricsData } = useQuery<MetricDefinition[]>({
    queryKey: ["/api/tenants", activeTenantId, "metrics"],
    enabled: !!activeTenantId,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/tenants/${activeTenantId}/goals`, {
        ...form,
        targetValue: parseFloat(form.targetValue),
        locationId: form.locationId ? parseInt(form.locationId) : null,
        metricDefinitionId: form.metricDefinitionId ? parseInt(form.metricDefinitionId) : null,
        startDate: new Date(form.startDate).toISOString(),
        endDate: new Date(form.endDate).toISOString(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", activeTenantId, "goals"] });
      setShowCreate(false);
      setForm({ title: "", targetValue: "", period: "weekly", startDate: "", endDate: "", locationId: "", metricDefinitionId: "" });
      toast({ title: "Goal created" });
    },
  });

  const allGoals = goalsData?.data || [];
  const varianceMap = new Map((varianceData?.data || []).map((v: any) => [v.goalId, v]));
  const filtered = filterStatus === "all" ? allGoals : allGoals.filter(g => g.status === filterStatus);

  if (!activeTenantId) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold" data-testid="text-goals-title">Goals</h1>
        <p className="text-muted-foreground mt-1">Select a tenant to manage goals.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 max-w-7xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-goals-title">Goals</h1>
          <p className="text-muted-foreground text-sm">{allGoals.length} goals tracked</p>
        </div>
        <Button onClick={() => setShowCreate(true)} data-testid="button-create-goal">
          <Plus className="h-4 w-4 mr-2" />
          New Goal
        </Button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[160px]" data-testid="select-goal-status-filter">
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="on_track">On Track</SelectItem>
            <SelectItem value="at_risk">At Risk</SelectItem>
            <SelectItem value="off_track">Off Track</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Target className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground" data-testid="text-no-goals">
              No goals yet. Set goals to track target vs actual performance for specific metrics and locations.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(goal => {
            const v = varianceMap.get(goal.id);
            const cfg = goalStatusConfig[goal.status] || goalStatusConfig.on_track;
            const StatusIcon = cfg.icon;
            const variancePercent = v?.variancePercent;
            return (
              <Card key={goal.id} className={v?.flagged ? "border-status-error/50" : ""} data-testid={`goal-card-${goal.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm font-medium">{goal.title}</CardTitle>
                    <Badge variant="outline" className={cfg.badge}>
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {cfg.label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">Target</p>
                      <p className="font-semibold">{goal.targetValue}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Current</p>
                      <p className="font-semibold">{goal.currentValue ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Variance</p>
                      <p className={`font-semibold flex items-center gap-1 ${
                        variancePercent == null ? ""
                        : variancePercent >= 0 ? statusColors.success.text
                        : variancePercent >= -15 ? statusColors.warning.text
                        : statusColors.error.text
                      }`}>
                        {variancePercent != null ? (
                          <>
                            {variancePercent >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            {variancePercent.toFixed(1)}%
                          </>
                        ) : "—"}
                      </p>
                    </div>
                  </div>
                  {v?.flagged && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-status-error-foreground">
                      <AlertTriangle className="h-3 w-3" />
                      Off-track for {goal.consecutiveOffTrack}+ consecutive periods
                    </div>
                  )}
                  <div className="mt-2 text-xs text-muted-foreground">
                    {goal.period} · {new Date(goal.startDate).toLocaleDateString()} – {new Date(goal.endDate).toLocaleDateString()}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Goal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="goal-title">Title</Label>
              <Input id="goal-title" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Increase revenue by 10%" data-testid="input-goal-title" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="goal-target">Target Value</Label>
                <Input id="goal-target" type="number" value={form.targetValue} onChange={e => setForm(p => ({ ...p, targetValue: e.target.value }))} data-testid="input-goal-target" />
              </div>
              <div>
                <Label>Period</Label>
                <Select value={form.period} onValueChange={v => setForm(p => ({ ...p, period: v }))}>
                  <SelectTrigger data-testid="select-goal-period"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="goal-start">Start Date</Label>
                <Input id="goal-start" type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} data-testid="input-goal-start" />
              </div>
              <div>
                <Label htmlFor="goal-end">End Date</Label>
                <Input id="goal-end" type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} data-testid="input-goal-end" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Location</Label>
                <Select value={form.locationId} onValueChange={v => setForm(p => ({ ...p, locationId: v }))}>
                  <SelectTrigger data-testid="select-goal-location"><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    {(locsData || []).map((l: any) => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Metric</Label>
                <Select value={form.metricDefinitionId} onValueChange={v => setForm(p => ({ ...p, metricDefinitionId: v }))}>
                  <SelectTrigger data-testid="select-goal-metric"><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    {(metricsData || []).map((m: any) => <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!form.title || !form.targetValue || !form.startDate || !form.endDate || createMutation.isPending}
              className="w-full"
              data-testid="button-submit-goal"
            >
              Create Goal
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
