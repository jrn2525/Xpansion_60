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
import { Switch } from "@/components/ui/switch";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Plus,
  Pencil,
  Trash2,
  BarChart3,
  Building2,
  ChevronDown,
  ChevronRight,
  Save,
} from "lucide-react";
import { Download } from "lucide-react";
import { exportToCSV } from "@/lib/export-utils";
import type { MetricDefinition, MetricThreshold } from "@shared/schema";
import { useTenantStore } from "@/lib/tenant-store";

import { bandColors, chartTokens } from "@/lib/semantic-colors";

const BAND_COLORS: Record<string, string> = bandColors;

function ThresholdEditor({
  metricId,
  tenantId,
}: {
  metricId: number;
  tenantId: number;
}) {
  const { toast } = useToast();
  const { data: thresholds, isLoading } = useQuery<MetricThreshold[]>({
    queryKey: ["/api/tenants", tenantId, "metrics", metricId, "thresholds"],
  });

  const [localThresholds, setLocalThresholds] = useState<any[]>([]);
  const [initialized, setInitialized] = useState(false);

  if (thresholds && !initialized) {
    setLocalThresholds(
      thresholds.map((t) => ({
        band: t.band,
        minValue: t.minValue,
        maxValue: t.maxValue,
        color: t.color || BAND_COLORS[t.band] || chartTokens.muted,
      }))
    );
    setInitialized(true);
  }

  const saveMutation = useMutation({
    mutationFn: async (data: any[]) => {
      const res = await apiRequest(
        "PUT",
        `/api/tenants/${tenantId}/metrics/${metricId}/thresholds`,
        data
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [
          "/api/tenants",
          tenantId,
          "metrics",
          metricId,
          "thresholds",
        ],
      });
      toast({ title: "Thresholds saved" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  function addThreshold() {
    setLocalThresholds((prev) => [
      ...prev,
      { band: "acceptable", minValue: 0, maxValue: 100, color: bandColors.acceptable },
    ]);
  }

  function removeThreshold(index: number) {
    setLocalThresholds((prev) => prev.filter((_, i) => i !== index));
  }

  function updateThreshold(index: number, field: string, value: any) {
    setLocalThresholds((prev) =>
      prev.map((t, i) =>
        i === index
          ? {
              ...t,
              [field]: value,
              ...(field === "band" ? { color: BAND_COLORS[value] || t.color } : {}),
            }
          : t
      )
    );
  }

  if (isLoading) return <Skeleton className="h-20 w-full" />;

  return (
    <div className="space-y-3 pl-4 border-l-2 border-muted">
      {localThresholds.map((t, i) => (
        <div
          key={i}
          className="grid grid-cols-[1fr_80px_80px_40px] gap-2 items-end"
        >
          <div className="space-y-1">
            <Label className="text-xs">Band</Label>
            <Select
              value={t.band}
              onValueChange={(v) => updateThreshold(i, "band", v)}
            >
              <SelectTrigger className="h-9" data-testid={`select-threshold-band-${i}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="excellent">Excellent</SelectItem>
                <SelectItem value="good">Good</SelectItem>
                <SelectItem value="acceptable">Acceptable</SelectItem>
                <SelectItem value="poor">Poor</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Min</Label>
            <Input
              type="number"
              className="h-9"
              value={t.minValue}
              onChange={(e) =>
                updateThreshold(i, "minValue", parseFloat(e.target.value) || 0)
              }
              data-testid={`input-threshold-min-${i}`}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Max</Label>
            <Input
              type="number"
              className="h-9"
              value={t.maxValue}
              onChange={(e) =>
                updateThreshold(i, "maxValue", parseFloat(e.target.value) || 0)
              }
              data-testid={`input-threshold-max-${i}`}
            />
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => removeThreshold(i)}
            className="h-9"
            data-testid={`button-remove-threshold-${i}`}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={addThreshold} data-testid="button-add-threshold">
          <Plus className="h-3 w-3 mr-1" />
          Add Band
        </Button>
        <Button
          size="sm"
          onClick={() => saveMutation.mutate(localThresholds)}
          disabled={saveMutation.isPending}
          data-testid="button-save-thresholds"
        >
          <Save className="h-3 w-3 mr-1" />
          {saveMutation.isPending ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}

export default function MetricsPage() {
  const { toast } = useToast();
  const { activeTenantId } = useTenantStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMetric, setEditingMetric] = useState<MetricDefinition | null>(
    null
  );
  const [expandedMetric, setExpandedMetric] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    dataType: "number",
    unit: "",
    direction: "higher_is_better",
    isActive: true,
  });

  const { data: metricsList, isLoading } = useQuery<MetricDefinition[]>({
    queryKey: ["/api/tenants", activeTenantId, "metrics"],
    enabled: !!activeTenantId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest(
        "POST",
        `/api/tenants/${activeTenantId}/metrics`,
        data
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/tenants", activeTenantId, "metrics"],
      });
      setDialogOpen(false);
      resetForm();
      toast({ title: "Metric created" });
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
        `/api/tenants/${activeTenantId}/metrics/${id}`,
        data
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/tenants", activeTenantId, "metrics"],
      });
      setDialogOpen(false);
      setEditingMetric(null);
      resetForm();
      toast({ title: "Metric updated" });
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

  const toggleMutation = useMutation({
    mutationFn: async ({
      id,
      isActive,
    }: {
      id: number;
      isActive: boolean;
    }) => {
      const res = await apiRequest(
        "PATCH",
        `/api/tenants/${activeTenantId}/metrics/${id}/activate`,
        { isActive }
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/tenants", activeTenantId, "metrics"],
      });
    },
    onError: (error: Error) => {
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
        `/api/tenants/${activeTenantId}/metrics/${id}`
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/tenants", activeTenantId, "metrics"],
      });
      toast({ title: "Metric deleted" });
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
    setFormData({
      name: "",
      description: "",
      dataType: "number",
      unit: "",
      direction: "higher_is_better",
      isActive: true,
    });
  }

  function openCreate() {
    resetForm();
    setEditingMetric(null);
    setDialogOpen(true);
  }

  function openEdit(metric: MetricDefinition) {
    setEditingMetric(metric);
    setFormData({
      name: metric.name,
      description: metric.description || "",
      dataType: metric.dataType,
      unit: metric.unit || "",
      direction: metric.direction,
      isActive: metric.isActive,
    });
    setDialogOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingMetric) {
      updateMutation.mutate({ id: editingMetric.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  }

  if (!activeTenantId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">No Tenant Selected</h2>
        <p className="text-muted-foreground">
          Select a tenant from the sidebar to manage metrics.
        </p>
      </div>
    );
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-1">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-metrics-title">
            Metrics
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Define KPIs with thresholds and activation controls
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (metricsList && metricsList.length > 0) {
                exportToCSV(
                  metricsList,
                  [
                    { key: "id", header: "ID" },
                    { key: "name", header: "Name" },
                    { key: "description", header: "Description" },
                    { key: "dataType", header: "Data Type" },
                    { key: "unit", header: "Unit" },
                    { key: "direction", header: "Direction" },
                    { key: "isActive", header: "Active", format: (v: any) => v ? "Yes" : "No" },
                  ],
                  `metrics-export-${new Date().toISOString().split("T")[0]}`
                );
              }
            }}
            disabled={!metricsList || metricsList.length === 0}
            data-testid="button-export-csv"
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate} data-testid="button-create-metric">
              <Plus className="h-4 w-4 mr-2" />
              New Metric
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingMetric ? "Edit Metric" : "Create Metric"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="m-name">Name</Label>
                <Input
                  id="m-name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="Revenue"
                  data-testid="input-metric-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="m-desc">Description</Label>
                <Textarea
                  id="m-desc"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  placeholder="Monthly total revenue"
                  className="resize-none"
                  data-testid="input-metric-description"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Data Type</Label>
                  <Select
                    value={formData.dataType}
                    onValueChange={(v) =>
                      setFormData((prev) => ({ ...prev, dataType: v }))
                    }
                  >
                    <SelectTrigger data-testid="select-metric-datatype">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="number">Number</SelectItem>
                      <SelectItem value="percentage">Percentage</SelectItem>
                      <SelectItem value="currency">Currency</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="m-unit">Unit</Label>
                  <Input
                    id="m-unit"
                    value={formData.unit}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        unit: e.target.value,
                      }))
                    }
                    placeholder="USD, %, min"
                    data-testid="input-metric-unit"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Direction</Label>
                <Select
                  value={formData.direction}
                  onValueChange={(v) =>
                    setFormData((prev) => ({ ...prev, direction: v }))
                  }
                >
                  <SelectTrigger data-testid="select-metric-direction">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="higher_is_better">
                      Higher is Better
                    </SelectItem>
                    <SelectItem value="lower_is_better">
                      Lower is Better
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.isActive}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, isActive: checked }))
                  }
                  data-testid="switch-metric-active"
                />
                <Label>Active</Label>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={isPending}
                data-testid="button-submit-metric"
              >
                {isPending
                  ? "Saving..."
                  : editingMetric
                    ? "Update Metric"
                    : "Create Metric"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-6 w-48 mb-2" />
                <Skeleton className="h-4 w-64" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !metricsList || metricsList.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg mb-1">No metrics defined</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Create your first metric to start tracking performance
            </p>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Create Metric
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {metricsList.map((metric) => (
            <Collapsible
              key={metric.id}
              open={expandedMetric === metric.id}
              onOpenChange={(open) =>
                setExpandedMetric(open ? metric.id : null)
              }
            >
              <Card data-testid={`card-metric-${metric.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <CollapsibleTrigger asChild>
                        <button
                          className="p-1 rounded hover-elevate"
                          data-testid={`button-expand-metric-${metric.id}`}
                        >
                          {expandedMetric === metric.id ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>
                      </CollapsibleTrigger>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-medium">{metric.name}</h3>
                          <Badge variant="secondary">{metric.dataType}</Badge>
                          {metric.unit && (
                            <Badge variant="secondary">{metric.unit}</Badge>
                          )}
                          <Badge
                            variant={
                              metric.direction === "higher_is_better"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {metric.direction === "higher_is_better"
                              ? "Higher better"
                              : "Lower better"}
                          </Badge>
                        </div>
                        {metric.description && (
                          <p className="text-sm text-muted-foreground mt-1 truncate">
                            {metric.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch
                        checked={metric.isActive}
                        onCheckedChange={(checked) =>
                          toggleMutation.mutate({
                            id: metric.id,
                            isActive: checked,
                          })
                        }
                        data-testid={`switch-activate-metric-${metric.id}`}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEdit(metric)}
                        data-testid={`button-edit-metric-${metric.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            data-testid={`button-delete-metric-${metric.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Metric</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete "{metric.name}" and
                              all thresholds, values, and scorecard references.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() =>
                                deleteMutation.mutate(metric.id)
                              }
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                  <CollapsibleContent className="mt-4">
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">Thresholds</h4>
                      <ThresholdEditor
                        metricId={metric.id}
                        tenantId={activeTenantId!}
                      />
                    </div>
                  </CollapsibleContent>
                </CardContent>
              </Card>
            </Collapsible>
          ))}
        </div>
      )}
    </div>
  );
}
