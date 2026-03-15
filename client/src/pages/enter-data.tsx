import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTenantStore } from "@/lib/tenant-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Save,
  Loader2,
  MapPin,
  Calendar,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  ArrowUp,
  ArrowDown,
  ClipboardEdit,
  Target,
} from "lucide-react";
import type { Location, MetricDefinition, MetricValue } from "@shared/schema";
import { getPeriodDates, stepPeriod, getBandForValue, getTargetDisplay } from "@/lib/period-utils";

const BAND_INPUT_COLORS: Record<string, string> = {
  excellent: "border-green-500/50 bg-green-500/5",
  good: "border-blue-500/50 bg-blue-500/5",
  acceptable: "border-amber-500/50 bg-amber-500/5",
  poor: "border-red-500/50 bg-red-500/5",
};

export default function EnterDataPage() {
  const { toast } = useToast();
  const { activeTenantId } = useTenantStore();

  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [referenceDate, setReferenceDate] = useState(new Date());
  const [entryValues, setEntryValues] = useState<Record<number, string>>({});
  const [savedSuccessfully, setSavedSuccessfully] = useState(false);

  const { data: progressData } = useQuery<any>({
    queryKey: ["/api/v1/onboarding/progress"],
  });

  const frequency = progressData?.progress?.savedData?.trackingFrequency || progressData?.savedData?.trackingFrequency || "weekly";

  const periodInfo = useMemo(() => getPeriodDates(frequency, referenceDate), [frequency, referenceDate]);

  const { data: locations, isLoading: locsLoading } = useQuery<Location[]>({
    queryKey: ["/api/tenants", activeTenantId, "locations"],
    enabled: !!activeTenantId,
  });

  const { data: metrics, isLoading: metricsLoading } = useQuery<MetricDefinition[]>({
    queryKey: ["/api/tenants", activeTenantId, "metrics"],
    enabled: !!activeTenantId,
  });

  const activeMetricIds = metrics?.filter(m => m.isActive !== false).map(m => m.id) || [];
  const { data: allThresholds } = useQuery<Record<number, Array<{ band: string; minValue: number | null; maxValue: number | null }>>>({
    queryKey: ["/api/tenants", activeTenantId, "thresholds-all", activeMetricIds.join(",")],
    enabled: !!activeTenantId && activeMetricIds.length > 0,
    queryFn: async () => {
      const result: Record<number, Array<{ band: string; minValue: number | null; maxValue: number | null }>> = {};
      await Promise.all(activeMetricIds.map(async (metricId) => {
        const res = await fetch(`/api/tenants/${activeTenantId}/metrics/${metricId}/thresholds`, { credentials: "include" });
        const data = await res.json();
        result[metricId] = data.data || [];
      }));
      return result;
    },
  });

  useEffect(() => {
    if (locations && locations.length > 0 && !selectedLocationId) {
      setSelectedLocationId(String(locations[0].id));
    }
  }, [locations, selectedLocationId]);

  const locationId = selectedLocationId ? Number(selectedLocationId) : null;

  const { data: existingValues, isLoading: valuesLoading } = useQuery<MetricValue[]>({
    queryKey: ["/api/tenants", activeTenantId, "metric-values", {
      locationId,
      periodStart: periodInfo.periodStart.toISOString(),
      periodEnd: periodInfo.periodEnd.toISOString(),
    }],
    enabled: !!activeTenantId && !!locationId,
    queryFn: async () => {
      const params = new URLSearchParams({
        locationId: String(locationId),
        periodStart: periodInfo.periodStart.toISOString(),
        periodEnd: periodInfo.periodEnd.toISOString(),
      });
      const res = await fetch(`/api/tenants/${activeTenantId}/metric-values?${params}`, { credentials: "include" });
      const data = await res.json();
      return data.data || [];
    },
  });

  useEffect(() => {
    if (existingValues && metrics) {
      const valueMap: Record<number, string> = {};
      for (const ev of existingValues) {
        valueMap[ev.metricDefinitionId] = String(ev.value);
      }
      for (const m of metrics) {
        if (!(m.id in valueMap)) {
          valueMap[m.id] = "";
        }
      }
      setEntryValues(valueMap);
      setSavedSuccessfully(false);
    }
  }, [existingValues, metrics]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const entries = Object.entries(entryValues)
        .filter(([, val]) => val !== "" && !isNaN(Number(val)))
        .map(([metricId, val]) => ({
          metricDefinitionId: Number(metricId),
          value: Number(val),
        }));

      if (entries.length === 0) throw new Error("Enter at least one value");

      await apiRequest("PUT", `/api/tenants/${activeTenantId}/metric-values/bulk`, {
        locationId: Number(selectedLocationId),
        period: periodInfo.period,
        periodStart: periodInfo.periodStart.toISOString(),
        periodEnd: periodInfo.periodEnd.toISOString(),
        entries,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", activeTenantId, "metric-values"] });
      setSavedSuccessfully(true);
      toast({ title: "Numbers saved!", description: `Your ${periodInfo.period} data has been recorded.` });
    },
    onError: (e: Error) => {
      toast({ title: "Error saving", description: e.message, variant: "destructive" });
    },
  });

  const filledCount = Object.values(entryValues).filter(v => v !== "" && !isNaN(Number(v))).length;
  const totalMetrics = metrics?.length || 0;
  const isFuturePeriod = periodInfo.periodStart > new Date();

  const activeMetrics = metrics?.filter(m => m.isActive !== false) || [];

  if (locsLoading || metricsLoading) {
    return (
      <div className="p-6 space-y-6 max-w-2xl mx-auto">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!locations || locations.length === 0) {
    return (
      <div className="p-6 max-w-2xl mx-auto" data-testid="page-enter-data">
        <div className="text-center py-16 space-y-4">
          <MapPin className="h-12 w-12 mx-auto text-muted-foreground" />
          <h2 className="text-xl font-semibold">No locations yet</h2>
          <p className="text-muted-foreground">Add a location first before entering your numbers.</p>
        </div>
      </div>
    );
  }

  if (!activeMetrics || activeMetrics.length === 0) {
    return (
      <div className="p-6 max-w-2xl mx-auto" data-testid="page-enter-data">
        <div className="text-center py-16 space-y-4">
          <ClipboardEdit className="h-12 w-12 mx-auto text-muted-foreground" />
          <h2 className="text-xl font-semibold">No KPIs set up yet</h2>
          <p className="text-muted-foreground">Define your key metrics first so you can start tracking.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto" data-testid="page-enter-data">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Enter Your Numbers</h1>
        <p className="text-muted-foreground mt-1">
          Record your {frequency} performance data. Fill in as many metrics as you have available.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        {locations.length > 1 && (
          <div className="flex-1 space-y-1.5">
            <Label>Location</Label>
            <Select value={selectedLocationId} onValueChange={val => { setSelectedLocationId(val); setSavedSuccessfully(false); }}>
              <SelectTrigger data-testid="select-location">
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
              <SelectContent>
                {locations.map(loc => (
                  <SelectItem key={loc.id} value={String(loc.id)}>{loc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setReferenceDate(stepPeriod(frequency, referenceDate, -1))}
              data-testid="button-prev-period"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="text-center">
              <CardTitle className="text-lg flex items-center gap-2 justify-center" data-testid="text-period-label">
                <Calendar className="h-4 w-4" />
                {periodInfo.label}
              </CardTitle>
              {isFuturePeriod && (
                <Badge variant="outline" className="mt-1 text-amber-600 border-amber-300">Future period</Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setReferenceDate(stepPeriod(frequency, referenceDate, 1))}
              data-testid="button-next-period"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {valuesLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : (
            <div className="space-y-4">
              {activeMetrics.map((metric) => {
                const existingVal = existingValues?.find(v => v.metricDefinitionId === metric.id);
                const currentVal = entryValues[metric.id] || "";
                const hasValue = currentVal !== "" && !isNaN(Number(currentVal));
                const thresholds = allThresholds?.[metric.id] || [];
                const targetHint = getTargetDisplay(thresholds, metric.direction || "higher_is_better");
                const valueBand = hasValue ? getBandForValue(Number(currentVal), thresholds) : null;
                const bandClass = valueBand ? BAND_INPUT_COLORS[valueBand] || "" : "";

                return (
                  <div
                    key={metric.id}
                    className={`flex items-center gap-4 p-3 rounded-lg border transition-colors ${
                      valueBand ? bandClass : hasValue ? "border-primary/30 bg-primary/5" : "border-border"
                    }`}
                    data-testid={`metric-entry-${metric.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{metric.name}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs text-muted-foreground">{metric.unit}</span>
                        {metric.direction === "higher_is_better" ? (
                          <ArrowUp className="h-3 w-3 text-green-500" />
                        ) : (
                          <ArrowDown className="h-3 w-3 text-blue-500" />
                        )}
                        {targetHint && (
                          <span className="text-xs text-muted-foreground flex items-center gap-0.5" data-testid={`target-hint-${metric.id}`}>
                            <Target className="h-3 w-3" />
                            {targetHint}
                          </span>
                        )}
                        {existingVal && (
                          <Badge variant="outline" className="text-xs px-1.5 py-0">
                            Prev: {existingVal.value}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {metric.unit === "USD" && <span className="text-muted-foreground text-sm">$</span>}
                      <Input
                        type="number"
                        step="any"
                        value={currentVal}
                        onChange={e => {
                          setEntryValues(prev => ({ ...prev, [metric.id]: e.target.value }));
                          setSavedSuccessfully(false);
                        }}
                        placeholder="—"
                        className="w-32 text-right"
                        data-testid={`input-metric-${metric.id}`}
                      />
                      {metric.unit === "%" && <span className="text-muted-foreground text-sm">%</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between mt-6 pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              {filledCount} of {activeMetrics.length} metrics filled
            </div>
            <div className="flex items-center gap-3">
              {savedSuccessfully && (
                <span className="text-sm text-green-600 flex items-center gap-1" data-testid="text-save-success">
                  <CheckCircle2 className="h-4 w-4" />
                  Saved
                </span>
              )}
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={filledCount === 0 || saveMutation.isPending}
                size="lg"
                data-testid="button-save-data"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Numbers
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        You can come back and update these numbers anytime. Previous entries will be overwritten for the same period.
      </p>
    </div>
  );
}
