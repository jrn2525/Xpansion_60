import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  Building2,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  ComposedChart,
  Scatter,
} from "recharts";
import type { MetricDefinition, Location, MetricThreshold } from "@shared/schema";
import { useTenantStore } from "@/lib/tenant-store";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface TrendDataPoint {
  label: string;
  periodStart: string;
  periodEnd: string;
  value: number | null;
}

interface TrendResponse {
  metric: MetricDefinition;
  location: Location;
  period: string;
  thresholds: MetricThreshold[];
  data: TrendDataPoint[];
}

function TrendDirection({ data }: { data: TrendDataPoint[] }) {
  const values = data.filter((d) => d.value !== null).map((d) => d.value!);
  if (values.length < 2) {
    return (
      <div className="flex items-center gap-1 text-muted-foreground">
        <Minus className="h-4 w-4" />
        <span className="text-sm">Insufficient data</span>
      </div>
    );
  }
  const first = values.slice(0, Math.ceil(values.length / 2));
  const second = values.slice(Math.ceil(values.length / 2));
  const avgFirst = first.reduce((a, b) => a + b, 0) / first.length;
  const avgSecond = second.reduce((a, b) => a + b, 0) / second.length;
  const change = ((avgSecond - avgFirst) / avgFirst) * 100;

  if (Math.abs(change) < 2) {
    return (
      <div className="flex items-center gap-1 text-muted-foreground">
        <Minus className="h-4 w-4" />
        <span className="text-sm">Stable</span>
      </div>
    );
  }

  return change > 0 ? (
    <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
      <ArrowUpRight className="h-4 w-4" />
      <span className="text-sm font-medium">+{change.toFixed(1)}%</span>
    </div>
  ) : (
    <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
      <ArrowDownRight className="h-4 w-4" />
      <span className="text-sm font-medium">{change.toFixed(1)}%</span>
    </div>
  );
}

export default function TrendsPage() {
  const { activeTenantId } = useTenantStore();
  const [selectedMetricId, setSelectedMetricId] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [selectedPeriod, setSelectedPeriod] = useState("month");

  const { data: metricsList } = useQuery<MetricDefinition[]>({
    queryKey: ["/api/tenants", activeTenantId, "metrics"],
    enabled: !!activeTenantId,
  });

  const { data: locationsList } = useQuery<Location[]>({
    queryKey: ["/api/tenants", activeTenantId, "locations"],
    enabled: !!activeTenantId,
  });

  const { toast } = useToast();
  const [showForecast, setShowForecast] = useState(true);
  const [showAnomalies, setShowAnomalies] = useState(true);

  const canQuery =
    !!activeTenantId && !!selectedMetricId && !!selectedLocationId;

  const {
    data: trendData,
    isLoading: trendsLoading,
    error: trendsError,
  } = useQuery<TrendResponse>({
    queryKey: [
      "/api/tenants",
      activeTenantId,
      `trends?metricId=${selectedMetricId}&locationId=${selectedLocationId}&period=${selectedPeriod}`,
    ],
    enabled: canQuery,
  });

  const { data: forecastData } = useQuery<any>({
    queryKey: ["/api/tenants", activeTenantId, "metrics", selectedMetricId, `forecast?locationId=${selectedLocationId}&periods=3`],
    enabled: canQuery && showForecast,
  });

  const { data: anomalyData } = useQuery<any>({
    queryKey: ["/api/tenants", activeTenantId, "metrics", selectedMetricId, `anomalies?locationId=${selectedLocationId}`],
    enabled: canQuery && showAnomalies,
  });

  const generateForecastMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/tenants/${activeTenantId}/metrics/${selectedMetricId}/forecast`, {
        locationId: parseInt(selectedLocationId),
        periods: 3,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", activeTenantId, "metrics", selectedMetricId] });
      toast({ title: "Forecast generated" });
    },
    onError: (e: Error) => toast({ title: "Forecast failed", description: e.message, variant: "destructive" }),
  });

  const detectAnomaliesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/tenants/${activeTenantId}/metrics/${selectedMetricId}/anomalies/detect`, {
        locationId: parseInt(selectedLocationId),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", activeTenantId, "metrics", selectedMetricId] });
      toast({ title: "Anomaly detection complete" });
    },
    onError: (e: Error) => toast({ title: "Detection failed", description: e.message, variant: "destructive" }),
  });

  if (!activeTenantId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">No Tenant Selected</h2>
        <p className="text-muted-foreground">
          Select a tenant from the sidebar to view trends.
        </p>
      </div>
    );
  }

  const forecasts = forecastData?.data || forecastData || [];
  const anomalies = anomalyData?.data || anomalyData || [];

  const chartData = (trendData?.data || []).map((d) => {
    const anomaly = anomalies.find((a: any) => {
      if (!a.metricValueId) return false;
      return true;
    });
    return {
      ...d,
      displayValue: d.value,
      isAnomaly: false,
    };
  });

  if (showForecast && forecasts.length > 0) {
    for (const f of forecasts) {
      const label = f.periodStart ? new Date(f.periodStart).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : `F${forecasts.indexOf(f) + 1}`;
      chartData.push({
        label,
        periodStart: f.periodStart,
        periodEnd: f.periodEnd,
        value: null,
        displayValue: null,
        forecastValue: f.forecastValue,
        confidenceLow: f.confidenceLow,
        confidenceHigh: f.confidenceHigh,
        isAnomaly: false,
      } as any);
    }
  }

  if (showAnomalies && anomalies.length > 0) {
    for (const a of anomalies) {
      const match = chartData.find((d: any) => d.displayValue === a.actualValue);
      if (match) {
        (match as any).isAnomaly = true;
        (match as any).anomalyMessage = a.message;
        (match as any).anomalyValue = a.actualValue;
        (match as any).baselineValue = a.baselineValue;
      }
    }
  }

  const hasData = chartData.some((d) => d.value !== null || (d as any).forecastValue);
  const selectedMetric = metricsList?.find(
    (m) => m.id === parseInt(selectedMetricId)
  );

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-trends-title">
          Trends
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Analyze performance trends over time
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Metric</Label>
              <Select
                value={selectedMetricId}
                onValueChange={setSelectedMetricId}
              >
                <SelectTrigger data-testid="select-trend-metric">
                  <SelectValue placeholder="Select metric" />
                </SelectTrigger>
                <SelectContent>
                  {metricsList?.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Location</Label>
              <Select
                value={selectedLocationId}
                onValueChange={setSelectedLocationId}
              >
                <SelectTrigger data-testid="select-trend-location">
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  {locationsList?.map((l) => (
                    <SelectItem key={l.id} value={String(l.id)}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Period</Label>
              <Select
                value={selectedPeriod}
                onValueChange={setSelectedPeriod}
              >
                <SelectTrigger data-testid="select-trend-period">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Monthly</SelectItem>
                  <SelectItem value="quarter">Quarterly</SelectItem>
                  <SelectItem value="bi-year">Bi-Yearly</SelectItem>
                  <SelectItem value="year">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {!canQuery ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <TrendingUp className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg mb-1">Select parameters</h3>
            <p className="text-muted-foreground text-sm">
              Choose a metric, location, and period to view trends
            </p>
          </CardContent>
        </Card>
      ) : trendsLoading ? (
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-[300px] w-full" />
          </CardContent>
        </Card>
      ) : trendsError ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mb-4" />
            <h3 className="font-semibold text-lg mb-1">Error loading trends</h3>
            <p className="text-muted-foreground text-sm">
              {(trendsError as Error).message}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground mb-1">
                  Current Value
                </p>
                <p className="text-2xl font-bold" data-testid="text-trend-current">
                  {(() => {
                    const vals = chartData.filter((d) => d.value !== null);
                    const last = vals[vals.length - 1];
                    return last ? last.value : "N/A";
                  })()}
                </p>
                {selectedMetric?.unit && (
                  <Badge variant="secondary" className="mt-1">
                    {selectedMetric.unit}
                  </Badge>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground mb-1">Trend</p>
                <TrendDirection data={trendData?.data || []} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground mb-1">
                  Data Coverage
                </p>
                <p className="text-2xl font-bold" data-testid="text-trend-coverage">
                  {chartData.filter((d) => d.value !== null).length}/
                  {chartData.length}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Periods with data
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 flex-wrap">
              <CardTitle className="text-base">
                {trendData?.metric?.name || "Metric"} -{" "}
                {trendData?.location?.name || "Location"}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={showForecast ? "default" : "outline"}
                  onClick={() => setShowForecast(!showForecast)}
                  data-testid="button-toggle-forecast"
                >
                  Forecast
                </Button>
                <Button
                  size="sm"
                  variant={showAnomalies ? "default" : "outline"}
                  onClick={() => setShowAnomalies(!showAnomalies)}
                  data-testid="button-toggle-anomalies"
                >
                  Anomalies
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => generateForecastMutation.mutate()}
                  disabled={generateForecastMutation.isPending}
                  data-testid="button-generate-forecast"
                >
                  {generateForecastMutation.isPending ? "Generating..." : "Refresh Forecast"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => detectAnomaliesMutation.mutate()}
                  disabled={detectAnomaliesMutation.isPending}
                  data-testid="button-detect-anomalies"
                >
                  {detectAnomaliesMutation.isPending ? "Detecting..." : "Detect Anomalies"}
                </Button>
                <Badge variant="secondary">{selectedPeriod}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {!hasData ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <AlertCircle className="h-8 w-8 text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">
                    No data recorded for this period range
                  </p>
                </div>
              ) : (
                <div className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        className="stroke-border"
                      />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 12 }}
                        className="fill-muted-foreground"
                      />
                      <YAxis
                        tick={{ fontSize: 12 }}
                        className="fill-muted-foreground"
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "6px",
                          color: "hsl(var(--popover-foreground))",
                        }}
                        content={({ payload, label }: any) => {
                          if (!payload || payload.length === 0) return null;
                          const point = payload[0]?.payload;
                          return (
                            <div className="bg-popover border rounded-md p-2 text-sm shadow-md">
                              <p className="font-medium">{label}</p>
                              {point?.displayValue != null && <p>Value: {point.displayValue}{selectedMetric?.unit ? ` ${selectedMetric.unit}` : ""}</p>}
                              {point?.forecastValue != null && <p className="text-primary">Forecast: {point.forecastValue}</p>}
                              {point?.confidenceLow != null && <p className="text-muted-foreground text-xs">CI: {point.confidenceLow} - {point.confidenceHigh}</p>}
                              {point?.isAnomaly && <p className="text-red-500 font-medium">Anomaly: {point.anomalyMessage}</p>}
                            </div>
                          );
                        }}
                      />
                      {trendData?.thresholds?.map((t) => (
                        <ReferenceLine
                          key={`${t.band}-min`}
                          y={t.minValue}
                          stroke={t.color || "hsl(var(--muted-foreground))"}
                          strokeDasharray="5 5"
                          strokeOpacity={0.5}
                        />
                      ))}
                      {showForecast && (
                        <Area
                          type="monotone"
                          dataKey="confidenceHigh"
                          stroke="none"
                          fill="hsl(var(--primary))"
                          fillOpacity={0.1}
                          connectNulls={false}
                        />
                      )}
                      {showForecast && (
                        <Area
                          type="monotone"
                          dataKey="confidenceLow"
                          stroke="none"
                          fill="hsl(var(--background))"
                          fillOpacity={1}
                          connectNulls={false}
                        />
                      )}
                      <Line
                        type="monotone"
                        dataKey="displayValue"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={(props: any) => {
                          const { cx, cy, payload } = props;
                          if (payload?.isAnomaly) {
                            return (
                              <circle key={`anomaly-${cx}-${cy}`} cx={cx} cy={cy} r={7} fill="hsl(0, 84%, 60%)" stroke="white" strokeWidth={2} />
                            );
                          }
                          return <circle key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={4} fill="hsl(var(--primary))" />;
                        }}
                        activeDot={{ r: 6 }}
                        connectNulls={false}
                      />
                      {showForecast && (
                        <Line
                          type="monotone"
                          dataKey="forecastValue"
                          stroke="hsl(var(--chart-5))"
                          strokeWidth={2}
                          strokeDasharray="6 3"
                          dot={{ r: 4, fill: "hsl(var(--chart-5))" }}
                          connectNulls={false}
                        />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
              {anomalies.length > 0 && showAnomalies && (
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-medium">Detected Anomalies</p>
                  {anomalies.map((a: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-2 text-sm p-2 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                      <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                      <span className="text-red-700 dark:text-red-300">{a.message}</span>
                      <Badge variant="secondary" className="ml-auto">{a.severity}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {trendData?.thresholds && trendData.thresholds.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Threshold Bands</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {trendData.thresholds.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-2 p-3 rounded-md bg-muted/50"
                    >
                      <div
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: t.color || "hsl(var(--muted-foreground))" }}
                      />
                      <div>
                        <p className="text-sm font-medium capitalize">
                          {t.band}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t.minValue} - {t.maxValue}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
