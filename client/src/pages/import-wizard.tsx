import { useState, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTenantStore } from "@/lib/tenant-store";
import { useLocation } from "wouter";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Upload,
  FileSpreadsheet,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  MapPin,
  Calendar,
  Columns,
  Eye,
  Sparkles,
  Download,
  AlertTriangle,
} from "lucide-react";
import type { Location, MetricDefinition } from "@shared/schema";
import { getPeriodDates } from "@/lib/period-utils";

type Step = 1 | 2 | 3 | 4 | 5;

interface PreviewData {
  headers: string[];
  sampleRows: Record<string, any>[];
  totalRows: number;
  suggestedMappings: Record<string, string | null>;
  availableMetrics: { id: number; name: string; unit: string | null }[];
}

interface ImportResult {
  totalRows: number;
  successRows: number;
  failedRows: number;
  errors: { line: number; reason: string }[];
}

const STEPS = [
  { num: 1, label: "Upload", icon: Upload },
  { num: 2, label: "Map Columns", icon: Columns },
  { num: 3, label: "Destination", icon: MapPin },
  { num: 4, label: "Review", icon: Eye },
  { num: 5, label: "Results", icon: CheckCircle2 },
];

export default function ImportWizardPage() {
  const { toast } = useToast();
  const { activeTenantId } = useTenantStore();
  const [, setLocation] = useLocation();

  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, string | null>>({});
  const [mappingMode, setMappingMode] = useState<"rows" | "column_per_metric">("rows");
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [period, setPeriod] = useState("month");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [saveMappingName, setSaveMappingName] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  const { data: locations } = useQuery<Location[]>({
    queryKey: [`/api/tenants/${activeTenantId}/locations`],
    enabled: !!activeTenantId,
  });

  const { data: templates } = useQuery({
    queryKey: [`/api/tenants/${activeTenantId}/mapping-templates`],
    enabled: !!activeTenantId,
  });

  const previewMutation = useMutation({
    mutationFn: async (uploadFile: File) => {
      const formData = new FormData();
      formData.append("file", uploadFile);
      const resp = await fetch(`/api/tenants/${activeTenantId}/import-preview`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const json = await resp.json();
      if (!json.ok) throw new Error(json.message || "Preview failed");
      return json.data as PreviewData;
    },
    onSuccess: (data) => {
      setPreview(data);
      setColumnMapping(data.suggestedMappings);
      const hasMetricCol = Object.values(data.suggestedMappings).includes("__metric_name__");
      setMappingMode(hasMetricCol ? "rows" : "column_per_metric");
      setStep(2);
    },
    onError: (err: Error) => {
      toast({ title: "File Error", description: err.message, variant: "destructive" });
    },
  });

  const executeMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("No file");
      const formData = new FormData();
      formData.append("file", file);
      formData.append("locationId", selectedLocationId);
      formData.append("period", period);
      formData.append("periodStart", periodStart);
      formData.append("periodEnd", periodEnd);
      formData.append("columnMapping", JSON.stringify(columnMapping));
      formData.append("mappingMode", mappingMode);
      if (saveMappingName) formData.append("saveMappingAs", saveMappingName);
      const resp = await fetch(`/api/tenants/${activeTenantId}/import-execute`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const json = await resp.json();
      if (!json.ok) throw new Error(json.message || "Import failed");
      return json.data as ImportResult;
    },
    onSuccess: (data) => {
      setResult(data);
      setStep(5);
      queryClient.invalidateQueries({ queryKey: [`/api/tenants/${activeTenantId}/mapping-templates`] });
    },
    onError: (err: Error) => {
      toast({ title: "Import Error", description: err.message, variant: "destructive" });
    },
  });

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setResult(null);
      setPreview(null);
    }
  }, []);

  const handleUpload = () => {
    if (file) previewMutation.mutate(file);
  };

  const handlePeriodChange = (p: string) => {
    setPeriod(p);
    const dates = getPeriodDates(p, new Date());
    setPeriodStart(dates.periodStart.toISOString().split("T")[0]);
    setPeriodEnd(dates.periodEnd.toISOString().split("T")[0]);
  };

  const applyTemplate = (tpl: any) => {
    if (tpl.mappingConfig) {
      setColumnMapping(tpl.mappingConfig);
      toast({ title: "Template applied", description: `"${tpl.name}" mapping loaded` });
    }
  };

  const canProceedFromStep2 = () => {
    if (mappingMode === "rows") {
      const hasMetric = Object.values(columnMapping).includes("__metric_name__");
      const hasValue = Object.values(columnMapping).includes("__value__");
      return hasMetric && hasValue;
    }
    return Object.values(columnMapping).some(v => v && v !== "__metric_name__" && v !== "__value__");
  };

  const canProceedFromStep3 = () => {
    return selectedLocationId && periodStart && periodEnd;
  };

  const getMappedCount = () => {
    return Object.values(columnMapping).filter(v => v !== null).length;
  };

  if (!activeTenantId) {
    return (
      <div className="p-6 text-center text-muted-foreground" data-testid="no-tenant">
        Select a tenant to start importing.
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6" data-testid="import-wizard">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Import Wizard</h1>
          <p className="text-sm text-muted-foreground">Import metric data from CSV or Excel files</p>
        </div>
        <Button variant="outline" onClick={() => setLocation("/integrations")} data-testid="button-back-hub">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Hub
        </Button>
      </div>

      <div className="flex items-center gap-2 mb-6">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const isActive = step === s.num;
          const isDone = step > s.num;
          return (
            <div key={s.num} className="flex items-center gap-2">
              {i > 0 && <div className={`h-px w-8 ${isDone ? "bg-green-500" : "bg-border"}`} />}
              <div
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  isActive ? "bg-primary text-primary-foreground" :
                  isDone ? "bg-green-500/10 text-green-600 dark:text-green-400" :
                  "bg-muted text-muted-foreground"
                }`}
                data-testid={`step-indicator-${s.num}`}
              >
                {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                {s.label}
              </div>
            </div>
          );
        })}
      </div>

      {step === 1 && (
        <Card data-testid="step-upload">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" /> Upload File
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-8 text-center space-y-3">
              <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Drag & drop or click to select a CSV or Excel file
              </p>
              <Input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileSelect}
                className="max-w-xs mx-auto"
                data-testid="input-file"
              />
            </div>
            {file && (
              <div className="flex items-center justify-between bg-muted/50 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium" data-testid="text-filename">{file.name}</span>
                  <Badge variant="secondary">{(file.size / 1024).toFixed(1)} KB</Badge>
                </div>
                <Button
                  onClick={handleUpload}
                  disabled={previewMutation.isPending}
                  data-testid="button-upload"
                >
                  {previewMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Analyzing...</>
                  ) : (
                    <><Sparkles className="h-4 w-4 mr-1" /> Analyze & Preview</>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === 2 && preview && (
        <Card data-testid="step-map-columns">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Columns className="h-5 w-5" /> Map Columns
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {preview.totalRows} rows found with {preview.headers.length} columns.
                Map each column to a metric or role.
              </p>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{getMappedCount()}/{preview.headers.length} mapped</Badge>
                {(templates as any[])?.length > 0 && (
                  <Select onValueChange={(v) => {
                    const tpl = (templates as any[])?.find((t: any) => String(t.id) === v);
                    if (tpl) applyTemplate(tpl);
                  }}>
                    <SelectTrigger className="w-40" data-testid="select-template">
                      <SelectValue placeholder="Load template" />
                    </SelectTrigger>
                    <SelectContent>
                      {(templates as any[])?.map((t: any) => (
                        <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <div className="flex gap-2 mb-2">
              <Button
                variant={mappingMode === "rows" ? "default" : "outline"}
                size="sm"
                onClick={() => setMappingMode("rows")}
                data-testid="button-mode-rows"
              >
                Row-based (metric name + value columns)
              </Button>
              <Button
                variant={mappingMode === "column_per_metric" ? "default" : "outline"}
                size="sm"
                onClick={() => setMappingMode("column_per_metric")}
                data-testid="button-mode-columns"
              >
                Column-per-metric
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File Column</TableHead>
                  <TableHead>Sample Values</TableHead>
                  <TableHead>Maps To</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.headers.map((h) => (
                  <TableRow key={h}>
                    <TableCell className="font-medium">{h}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                      {preview.sampleRows.slice(0, 3).map(r => r[h]).filter(Boolean).join(", ")}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={columnMapping[h] || "unmapped"}
                        onValueChange={(v) => setColumnMapping(prev => ({ ...prev, [h]: v === "unmapped" ? null : v }))}
                      >
                        <SelectTrigger className="w-48" data-testid={`select-mapping-${h}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unmapped">-- Skip --</SelectItem>
                          {mappingMode === "rows" && (
                            <>
                              <SelectItem value="__metric_name__">Metric Name Column</SelectItem>
                              <SelectItem value="__value__">Value Column</SelectItem>
                            </>
                          )}
                          {mappingMode === "column_per_metric" && preview.availableMetrics.map(m => (
                            <SelectItem key={m.id} value={m.name}>{m.name}{m.unit ? ` (${m.unit})` : ""}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep(1)} data-testid="button-back-1">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button onClick={() => { handlePeriodChange(period); setStep(3); }} disabled={!canProceedFromStep2()} data-testid="button-next-3">
                Next <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card data-testid="step-destination">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" /> Destination
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Location</Label>
                <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                  <SelectTrigger data-testid="select-location">
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations?.map((l) => (
                      <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Period</Label>
                <Select value={period} onValueChange={handlePeriodChange}>
                  <SelectTrigger data-testid="select-period">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="week">Weekly</SelectItem>
                    <SelectItem value="month">Monthly</SelectItem>
                    <SelectItem value="quarter">Quarterly</SelectItem>
                    <SelectItem value="year">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Period Start</Label>
                <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} data-testid="input-period-start" />
              </div>
              <div className="space-y-2">
                <Label>Period End</Label>
                <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} data-testid="input-period-end" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Save mapping as template (optional)</Label>
              <Input
                placeholder="e.g. Monthly Revenue Template"
                value={saveMappingName}
                onChange={(e) => setSaveMappingName(e.target.value)}
                data-testid="input-save-mapping"
              />
            </div>

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep(2)} data-testid="button-back-2">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button onClick={() => setStep(4)} disabled={!canProceedFromStep3()} data-testid="button-next-4">
                Next <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 4 && preview && (
        <Card data-testid="step-review">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" /> Review & Confirm
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">File</p>
                <p className="text-sm font-medium truncate">{file?.name}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Rows</p>
                <p className="text-sm font-medium">{preview.totalRows}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Location</p>
                <p className="text-sm font-medium">{locations?.find(l => String(l.id) === selectedLocationId)?.name}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Period</p>
                <p className="text-sm font-medium">{periodStart} to {periodEnd}</p>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Column Mappings</p>
              <div className="space-y-1">
                {Object.entries(columnMapping).filter(([_, v]) => v !== null).map(([col, target]) => (
                  <div key={col} className="flex items-center gap-2 text-sm">
                    <Badge variant="secondary">{col}</Badge>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <Badge variant="outline">
                      {target === "__metric_name__" ? "Metric Name" : target === "__value__" ? "Value" : target}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
              <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                Existing values for the same metric, location, and period will be overwritten.
              </div>
            </div>

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep(3)} data-testid="button-back-3">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button onClick={() => executeMutation.mutate()} disabled={executeMutation.isPending} data-testid="button-execute">
                {executeMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Importing...</>
                ) : (
                  <><Download className="h-4 w-4 mr-1" /> Execute Import</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 5 && result && (
        <Card data-testid="step-results">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {result.failedRows === 0 ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              )}
              Import Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-muted/50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold">{result.totalRows}</p>
                <p className="text-xs text-muted-foreground">Total Rows</p>
              </div>
              <div className="bg-green-500/10 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-green-600">{result.successRows}</p>
                <p className="text-xs text-muted-foreground">Imported</p>
              </div>
              <div className={`rounded-lg p-4 text-center ${result.failedRows > 0 ? "bg-red-500/10" : "bg-muted/50"}`}>
                <p className={`text-2xl font-bold ${result.failedRows > 0 ? "text-red-600" : ""}`}>{result.failedRows}</p>
                <p className="text-xs text-muted-foreground">Failed</p>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-medium text-red-600">Errors:</p>
                {result.errors.map((e, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs bg-red-500/5 rounded p-2">
                    <XCircle className="h-3 w-3 text-red-500 shrink-0" />
                    <span>Row {e.line}: {e.reason}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => { setStep(1); setFile(null); setResult(null); setPreview(null); }} data-testid="button-import-another">
                <Upload className="h-4 w-4 mr-1" /> Import Another
              </Button>
              <Button onClick={() => setLocation("/integrations")} data-testid="button-done">
                Done <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
