import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/auth-utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Pencil,
  Trash2,
  ClipboardCheck,
  Building2,
  Play,
  X,
  Trophy,
} from "lucide-react";
import type {
  ScorecardTemplate,
  MetricDefinition,
  Location,
  ScorecardMetric,
} from "@shared/schema";
import { useTenantStore } from "@/lib/tenant-store";

import { bandBadgeStyles } from "@/lib/semantic-colors";

const BAND_STYLES: Record<string, string> = bandBadgeStyles;

interface ScorecardWithMetrics extends ScorecardTemplate {
  metrics?: ScorecardMetric[];
}

function ScoreRunDialog({
  scorecard,
  tenantId,
}: {
  scorecard: ScorecardTemplate;
  tenantId: number;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [locationId, setLocationId] = useState("");
  const [period, setPeriod] = useState("month");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [result, setResult] = useState<any>(null);

  const { data: locationsList } = useQuery<Location[]>({
    queryKey: ["/api/tenants", tenantId, "locations"],
    enabled: !!tenantId,
  });

  const { data: metricsList } = useQuery<MetricDefinition[]>({
    queryKey: ["/api/tenants", tenantId, "metrics"],
    enabled: !!tenantId,
  });

  const runMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest(
        "POST",
        `/api/tenants/${tenantId}/scorecards/${scorecard.id}/run`,
        data
      );
      return res.json();
    },
    onSuccess: (data) => {
      setResult(data);
      toast({ title: "Score run completed" });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        window.location.href = "/api/login";
        return;
      }
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  function handleRun() {
    if (!locationId || !periodStart || !periodEnd) {
      toast({
        title: "Missing fields",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }
    runMutation.mutate({
      locationId: parseInt(locationId),
      period,
      periodStart,
      periodEnd,
    });
  }

  function getMetricName(metricDefId: number) {
    return metricsList?.find((m) => m.id === metricDefId)?.name || `Metric ${metricDefId}`;
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setResult(null); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" data-testid={`button-run-scorecard-${scorecard.id}`}>
          <Play className="h-3 w-3 mr-1" />
          Run
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Run Scorecard: {scorecard.name}</DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <div className="text-center py-4">
              <Trophy className="h-8 w-8 mx-auto mb-2 text-primary" />
              <p className="text-3xl font-bold" data-testid="text-total-score">
                {typeof result.totalScore === "number"
                  ? result.totalScore.toFixed(1)
                  : "N/A"}
              </p>
              <div className="mt-2">
                <span
                  className={`inline-block px-3 py-1 rounded-md text-sm font-medium ${
                    BAND_STYLES[result.band] || "bg-muted text-muted-foreground"
                  }`}
                  data-testid="text-overall-band"
                >
                  {result.band ? result.band.charAt(0).toUpperCase() + result.band.slice(1) : "N/A"}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Detail Breakdown</h4>
              {result.details?.map((detail: any, i: number) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-2 py-2 px-3 rounded-md bg-muted/50"
                  data-testid={`row-score-detail-${i}`}
                >
                  <span className="text-sm">{getMetricName(detail.metricDefinitionId)}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      Raw: {detail.rawValue ?? "N/A"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Weighted: {detail.weightedScore?.toFixed(1) ?? "N/A"}
                    </span>
                    {detail.band && (
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          BAND_STYLES[detail.band] || ""
                        }`}
                      >
                        {detail.band}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setResult(null)}
            >
              Run Another
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Location</Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger data-testid="select-run-location">
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  {locationsList?.map((loc) => (
                    <SelectItem key={loc.id} value={String(loc.id)}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Period</Label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger data-testid="select-run-period">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Month</SelectItem>
                  <SelectItem value="quarter">Quarter</SelectItem>
                  <SelectItem value="bi-year">Bi-Year</SelectItem>
                  <SelectItem value="year">Year</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Period Start</Label>
                <Input
                  type="date"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                  data-testid="input-run-start"
                />
              </div>
              <div className="space-y-2">
                <Label>Period End</Label>
                <Input
                  type="date"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  data-testid="input-run-end"
                />
              </div>
            </div>
            <Button
              className="w-full"
              onClick={handleRun}
              disabled={runMutation.isPending}
              data-testid="button-execute-run"
            >
              {runMutation.isPending ? "Running..." : "Execute Score Run"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function ScorecardsPage() {
  const { toast } = useToast();
  const { activeTenantId } = useTenantStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingScorecard, setEditingScorecard] =
    useState<ScorecardWithMetrics | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    isActive: true,
  });
  const [selectedMetrics, setSelectedMetrics] = useState<
    { metricDefinitionId: number; weight: number }[]
  >([]);

  const { data: scorecardsList, isLoading } = useQuery<ScorecardTemplate[]>({
    queryKey: ["/api/tenants", activeTenantId, "scorecards"],
    enabled: !!activeTenantId,
  });

  const { data: metricsList } = useQuery<MetricDefinition[]>({
    queryKey: ["/api/tenants", activeTenantId, "metrics"],
    enabled: !!activeTenantId,
  });

  const activeMetrics = metricsList?.filter((m) => m.isActive) || [];

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest(
        "POST",
        `/api/tenants/${activeTenantId}/scorecards`,
        data
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/tenants", activeTenantId, "scorecards"],
      });
      setDialogOpen(false);
      resetForm();
      toast({ title: "Scorecard created" });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        window.location.href = "/api/login";
        return;
      }
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest(
        "PATCH",
        `/api/tenants/${activeTenantId}/scorecards/${id}`,
        data
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/tenants", activeTenantId, "scorecards"],
      });
      setDialogOpen(false);
      setEditingScorecard(null);
      resetForm();
      toast({ title: "Scorecard updated" });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        window.location.href = "/api/login";
        return;
      }
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest(
        "DELETE",
        `/api/tenants/${activeTenantId}/scorecards/${id}`
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/tenants", activeTenantId, "scorecards"],
      });
      toast({ title: "Scorecard deleted" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  function resetForm() {
    setFormData({ name: "", description: "", isActive: true });
    setSelectedMetrics([]);
  }

  function openCreate() {
    resetForm();
    setEditingScorecard(null);
    setDialogOpen(true);
  }

  async function openEdit(scorecard: ScorecardTemplate) {
    try {
      const res = await fetch(
        `/api/tenants/${activeTenantId}/scorecards/${scorecard.id}`,
        { credentials: "include" }
      );
      const data = await res.json();
      setEditingScorecard(data);
      setFormData({
        name: data.name,
        description: data.description || "",
        isActive: data.isActive,
      });
      setSelectedMetrics(
        (data.metrics || []).map((m: ScorecardMetric) => ({
          metricDefinitionId: m.metricDefinitionId,
          weight: m.weight,
        }))
      );
      setDialogOpen(true);
    } catch {
      toast({
        title: "Error loading scorecard",
        variant: "destructive",
      });
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = { ...formData, metrics: selectedMetrics };
    if (editingScorecard) {
      updateMutation.mutate({ id: editingScorecard.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function addMetricToScorecard() {
    const available = activeMetrics.filter(
      (m) => !selectedMetrics.some((sm) => sm.metricDefinitionId === m.id)
    );
    if (available.length > 0) {
      setSelectedMetrics((prev) => [
        ...prev,
        { metricDefinitionId: available[0].id, weight: 0.25 },
      ]);
    }
  }

  function removeMetricFromScorecard(index: number) {
    setSelectedMetrics((prev) => prev.filter((_, i) => i !== index));
  }

  function updateScorecardMetric(
    index: number,
    field: string,
    value: any
  ) {
    setSelectedMetrics((prev) =>
      prev.map((m, i) => (i === index ? { ...m, [field]: value } : m))
    );
  }

  const totalWeight = selectedMetrics.reduce((sum, m) => sum + m.weight, 0);

  if (!activeTenantId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">No Tenant Selected</h2>
        <p className="text-muted-foreground">
          Select a tenant from the sidebar to manage scorecards.
        </p>
      </div>
    );
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-1">
        <div>
          <h1
            className="text-2xl font-bold"
            data-testid="text-scorecards-title"
          >
            Scorecards
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Build weighted scorecard templates and run scoring
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button
              onClick={openCreate}
              data-testid="button-create-scorecard"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Scorecard
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingScorecard ? "Edit Scorecard" : "Create Scorecard"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sc-name">Name</Label>
                <Input
                  id="sc-name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                  placeholder="Monthly Performance Review"
                  data-testid="input-scorecard-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sc-desc">Description</Label>
                <Textarea
                  id="sc-desc"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  className="resize-none"
                  placeholder="Describe this scorecard template"
                  data-testid="input-scorecard-description"
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-1">
                  <Label>Metrics & Weights</Label>
                  <span
                    className={`text-xs font-medium ${
                      Math.abs(totalWeight - 1) < 0.01
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    Total: {(totalWeight * 100).toFixed(0)}%
                  </span>
                </div>
                {selectedMetrics.map((sm, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[1fr_80px_32px] gap-2 items-end"
                  >
                    <Select
                      value={String(sm.metricDefinitionId)}
                      onValueChange={(v) =>
                        updateScorecardMetric(
                          i,
                          "metricDefinitionId",
                          parseInt(v)
                        )
                      }
                    >
                      <SelectTrigger
                        className="h-9"
                        data-testid={`select-scorecard-metric-${i}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {activeMetrics.map((m) => (
                          <SelectItem key={m.id} value={String(m.id)}>
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      step="0.05"
                      min="0"
                      max="1"
                      className="h-9"
                      value={sm.weight}
                      onChange={(e) =>
                        updateScorecardMetric(
                          i,
                          "weight",
                          parseFloat(e.target.value) || 0
                        )
                      }
                      data-testid={`input-scorecard-weight-${i}`}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-9"
                      onClick={() => removeMetricFromScorecard(i)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addMetricToScorecard}
                  disabled={
                    selectedMetrics.length >= activeMetrics.length
                  }
                  data-testid="button-add-scorecard-metric"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Metric
                </Button>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isPending}
                data-testid="button-submit-scorecard"
              >
                {isPending
                  ? "Saving..."
                  : editingScorecard
                    ? "Update Scorecard"
                    : "Create Scorecard"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-6 w-48 mb-2" />
                <Skeleton className="h-4 w-64" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !scorecardsList || scorecardsList.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <ClipboardCheck className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg mb-1">
              No scorecards defined
            </h3>
            <p className="text-muted-foreground text-sm mb-4">
              Create a scorecard template with weighted metrics
            </p>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Create Scorecard
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {scorecardsList.map((sc) => (
            <Card key={sc.id} data-testid={`card-scorecard-${sc.id}`}>
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 shrink-0">
                    <ClipboardCheck className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-medium truncate">{sc.name}</h3>
                    {sc.description && (
                      <p className="text-sm text-muted-foreground truncate">
                        {sc.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={sc.isActive ? "secondary" : "destructive"}>
                    {sc.isActive ? "Active" : "Inactive"}
                  </Badge>
                  <ScoreRunDialog
                    scorecard={sc}
                    tenantId={activeTenantId!}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => openEdit(sc)}
                    data-testid={`button-edit-scorecard-${sc.id}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        data-testid={`button-delete-scorecard-${sc.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Scorecard</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete "{sc.name}" and all score
                          runs.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteMutation.mutate(sc.id)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
