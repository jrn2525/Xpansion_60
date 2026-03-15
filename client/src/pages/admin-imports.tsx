import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Upload, FileText, RefreshCw, AlertTriangle, CheckCircle, XCircle, Shield, Save, Trash2 } from "lucide-react";
import { useTenantStore } from "@/lib/tenant-store";

import { statusColors } from "@/lib/semantic-colors";

const importStatusColors: Record<string, string> = {
  pending: statusColors.info,
  completed: statusColors.success,
  partial: statusColors.warning,
  failed: statusColors.error,
};

const qualityBadgeStyles: Record<string, string> = {
  excellent: statusColors.success,
  good: statusColors.info,
  fair: statusColors.warning,
  poor: statusColors.error,
};

interface ValidationPreview {
  totalRows: number;
  validRows: number;
  warningRows: number;
  failedRows: number;
  qualityScore: number;
  qualityBadge: string;
  errors: Array<{ line: number; reason: string }>;
}

interface QualitySummary {
  totalRows: number;
  validRows: number;
  validPct: number;
  warningRows: number;
  warningPct: number;
  failedRows: number;
  failedPct: number;
  qualityScore: number;
  qualityBadge: string;
}

export default function AdminImportsPage() {
  const { activeTenantId } = useTenantStore();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [locationId, setLocationId] = useState("");
  const [mappingConfig, setMappingConfig] = useState('{"metricKey":"metric","valueKey":"value","periodKey":"period","periodStartKey":"period_start","periodEndKey":"period_end"}');
  const [validationPreview, setValidationPreview] = useState<ValidationPreview | null>(null);
  const [qualitySummary, setQualitySummary] = useState<QualitySummary | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);

  const { data: jobsResponse, isLoading } = useQuery<any>({
    queryKey: ["/api/admin/imports", `?tenantId=${activeTenantId}`],
    enabled: !!activeTenantId,
  });

  const { data: locationsData } = useQuery<any[]>({
    queryKey: ["/api/tenants", activeTenantId, "locations"],
    enabled: !!activeTenantId,
  });

  const { data: errorsResponse } = useQuery<any>({
    queryKey: ["/api/admin/imports", selectedJob?.id, "errors"],
    enabled: !!selectedJob,
  });

  const { data: templatesResponse } = useQuery<any>({
    queryKey: ["/api/admin/import-templates", `?tenantId=${activeTenantId}`],
    enabled: !!activeTenantId,
  });

  const validateMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await fetch("/api/admin/imports/validate", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error?.message || "Validation failed");
      return res.json();
    },
    onSuccess: (result) => {
      const data = result.data || result;
      setValidationPreview(data);
      toast({ title: "Validation complete", description: `${data.validRows}/${data.totalRows} rows valid` });
    },
    onError: (e: Error) => toast({ title: "Validation failed", description: e.message, variant: "destructive" }),
  });

  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await fetch("/api/admin/imports", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error?.message || "Upload failed");
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/imports"] });
      const data = result.data || result;
      if (data.qualitySummary) {
        setQualitySummary(data.qualitySummary);
      }
      setValidationPreview(null);
      setShowSaveTemplate(true);
      toast({ title: "Import started", description: "File is being processed" });
      if (fileRef.current) fileRef.current.value = "";
    },
    onError: (e: Error) => toast({ title: "Upload failed", description: e.message, variant: "destructive" }),
  });

  const reprocessMutation = useMutation({
    mutationFn: async (jobId: number) => {
      const res = await apiRequest("POST", `/api/admin/imports/${jobId}/reprocess`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/imports"] });
      toast({ title: "Reprocess complete" });
    },
    onError: (e: Error) => toast({ title: "Reprocess failed", description: e.message, variant: "destructive" }),
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async (data: { name: string; tenantId: number; mappingConfig: any }) => {
      const res = await apiRequest("POST", "/api/admin/import-templates", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/import-templates"] });
      setTemplateName("");
      setShowSaveTemplate(false);
      toast({ title: "Template saved" });
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/import-templates/${id}?tenantId=${activeTenantId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/import-templates"] });
      toast({ title: "Template deleted" });
    },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const handleValidate = () => {
    const file = fileRef.current?.files?.[0];
    if (!file || !activeTenantId) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("tenantId", String(activeTenantId));
    fd.append("mappingConfig", mappingConfig);
    setValidationPreview(null);
    validateMutation.mutate(fd);
  };

  const handleUpload = () => {
    const file = fileRef.current?.files?.[0];
    if (!file || !locationId || !activeTenantId) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("tenantId", String(activeTenantId));
    fd.append("locationId", locationId);
    fd.append("mappingConfig", mappingConfig);
    setQualitySummary(null);
    uploadMutation.mutate(fd);
  };

  const handleSaveTemplate = () => {
    if (!templateName.trim() || !activeTenantId) return;
    let parsedConfig: any;
    try { parsedConfig = JSON.parse(mappingConfig); } catch { return; }
    saveTemplateMutation.mutate({
      name: templateName.trim(),
      tenantId: activeTenantId,
      mappingConfig: parsedConfig,
    });
  };

  const handleLoadTemplate = (templateId: string) => {
    const templates = templatesResponse?.data || templatesResponse || [];
    const template = templates.find((t: any) => String(t.id) === templateId);
    if (template) {
      const config = typeof template.mappingConfig === "string"
        ? template.mappingConfig
        : JSON.stringify(template.mappingConfig);
      setMappingConfig(config);
      toast({ title: "Template loaded", description: `Loaded "${template.name}"` });
    }
  };

  const jobs = jobsResponse?.data || jobsResponse || [];
  const errors = errorsResponse?.data || errorsResponse || [];
  const templates = templatesResponse?.data || templatesResponse || [];

  if (!activeTenantId) {
    return <div className="p-6 text-center text-muted-foreground" data-testid="text-no-tenant">Select a tenant to manage imports</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold" data-testid="text-page-title">Data Imports</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5" /> Upload File</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Location</Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger data-testid="select-location"><SelectValue placeholder="Select location" /></SelectTrigger>
                <SelectContent>
                  {(locationsData || []).map((loc: any) => (
                    <SelectItem key={loc.id} value={String(loc.id)}>{loc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>File (CSV or Excel)</Label>
              <Input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" data-testid="input-csv-file" />
            </div>
            <div>
              <Label>Column Mapping (JSON)</Label>
              <Input value={mappingConfig} onChange={(e) => setMappingConfig(e.target.value)} data-testid="input-mapping" />
            </div>
          </div>

          {templates.length > 0 && (
            <div className="flex items-center gap-3 flex-wrap">
              <Label className="text-sm text-muted-foreground">Load Template:</Label>
              <Select onValueChange={handleLoadTemplate}>
                <SelectTrigger className="w-[220px]" data-testid="select-template">
                  <SelectValue placeholder="Select template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t: any) => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {templates.map((t: any) => (
                <Button
                  key={t.id}
                  size="icon"
                  variant="ghost"
                  onClick={() => deleteTemplateMutation.mutate(t.id)}
                  disabled={deleteTemplateMutation.isPending}
                  data-testid={`button-delete-template-${t.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="outline" onClick={handleValidate} disabled={validateMutation.isPending || !fileRef.current?.files?.[0]} data-testid="button-validate">
              <Shield className="h-4 w-4 mr-2" />
              {validateMutation.isPending ? "Validating..." : "Validate First"}
            </Button>
            <Button onClick={handleUpload} disabled={uploadMutation.isPending} data-testid="button-upload">
              {uploadMutation.isPending ? "Uploading..." : "Upload & Import"}
            </Button>
            {showSaveTemplate && (
              <div className="flex items-center gap-2 flex-wrap">
                <Input
                  placeholder="Template name"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  className="w-[180px]"
                  data-testid="input-template-name"
                />
                <Button variant="outline" onClick={handleSaveTemplate} disabled={saveTemplateMutation.isPending || !templateName.trim()} data-testid="button-save-template">
                  <Save className="h-4 w-4 mr-2" />
                  {saveTemplateMutation.isPending ? "Saving..." : "Save as Template"}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {validationPreview && (
        <Card data-testid="card-validation-preview">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Validation Preview
              <Badge className={qualityBadgeStyles[validationPreview.qualityBadge] || ""} data-testid="badge-quality-score">
                {validationPreview.qualityScore}% — {validationPreview.qualityBadge}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div data-testid="text-total-rows">
                <p className="text-sm text-muted-foreground">Total Rows</p>
                <p className="text-2xl font-bold">{validationPreview.totalRows}</p>
              </div>
              <div data-testid="text-valid-rows">
                <p className="text-sm text-muted-foreground">Valid Rows</p>
                <p className="text-2xl font-bold text-status-success-foreground">{validationPreview.validRows}</p>
              </div>
              <div data-testid="text-warning-rows">
                <p className="text-sm text-muted-foreground">Warning Rows</p>
                <p className="text-2xl font-bold text-status-warning-foreground">{validationPreview.warningRows}</p>
              </div>
              <div data-testid="text-failed-rows">
                <p className="text-sm text-muted-foreground">Failed Rows</p>
                <p className="text-2xl font-bold text-status-error-foreground">{validationPreview.failedRows}</p>
              </div>
            </div>

            {validationPreview.errors.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Error Samples (first 10):</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Line</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {validationPreview.errors.map((e, idx) => (
                      <TableRow key={idx} data-testid={`row-validation-error-${idx}`}>
                        <TableCell>{e.line}</TableCell>
                        <TableCell className="text-destructive">{e.reason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {qualitySummary && (
        <Card data-testid="card-quality-summary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              Post-Import Quality Summary
              <Badge className={qualityBadgeStyles[qualitySummary.qualityBadge] || ""} data-testid="badge-post-quality">
                {qualitySummary.qualityScore}% — {qualitySummary.qualityBadge}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div data-testid="text-summary-total">
                <p className="text-sm text-muted-foreground">Total Rows</p>
                <p className="text-2xl font-bold">{qualitySummary.totalRows}</p>
              </div>
              <div data-testid="text-summary-valid">
                <p className="text-sm text-muted-foreground">Valid</p>
                <p className="text-2xl font-bold text-status-success-foreground">{qualitySummary.validRows} ({qualitySummary.validPct}%)</p>
              </div>
              <div data-testid="text-summary-warnings">
                <p className="text-sm text-muted-foreground">Warnings</p>
                <p className="text-2xl font-bold text-status-warning-foreground">{qualitySummary.warningRows} ({qualitySummary.warningPct}%)</p>
              </div>
              <div data-testid="text-summary-failed">
                <p className="text-sm text-muted-foreground">Failed</p>
                <p className="text-2xl font-bold text-status-error-foreground">{qualitySummary.failedRows} ({qualitySummary.failedPct}%)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Import History</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : jobs.length === 0 ? (
            <p className="text-muted-foreground text-center py-8" data-testid="text-no-imports">No imports yet. Upload a CSV or Excel file above to import metric data.</p>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Success</TableHead>
                  <TableHead>Failed</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job: any) => (
                  <TableRow key={job.id} data-testid={`row-import-${job.id}`}>
                    <TableCell className="flex items-center gap-2"><FileText className="h-4 w-4" />{job.fileName}</TableCell>
                    <TableCell>
                      <Badge className={importStatusColors[job.status] || ""} data-testid={`badge-status-${job.id}`}>
                        {job.status === "completed" && <CheckCircle className="h-3 w-3 mr-1" />}
                        {job.status === "failed" && <XCircle className="h-3 w-3 mr-1" />}
                        {job.status === "partial" && <AlertTriangle className="h-3 w-3 mr-1" />}
                        {job.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{job.totalRows}</TableCell>
                    <TableCell>{job.successRows}</TableCell>
                    <TableCell>{job.failedRows}</TableCell>
                    <TableCell>{new Date(job.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="space-x-2">
                      {job.failedRows > 0 && (
                        <Button size="sm" variant="outline" onClick={() => setSelectedJob(job)} data-testid={`button-errors-${job.id}`}>
                          Errors
                        </Button>
                      )}
                      {(job.status === "partial" || job.status === "failed") && (
                        <Button size="sm" variant="outline" onClick={() => reprocessMutation.mutate(job.id)} disabled={reprocessMutation.isPending} data-testid={`button-reprocess-${job.id}`}>
                          <RefreshCw className="h-3 w-3 mr-1" /> Reprocess
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

      <Dialog open={!!selectedJob} onOpenChange={(open) => !open && setSelectedJob(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Row Errors — {selectedJob?.fileName}</DialogTitle>
          </DialogHeader>
          {errors.length === 0 ? (
            <p className="text-muted-foreground">No errors found</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Row</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead>Raw Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {errors.map((e: any) => (
                  <TableRow key={e.id} data-testid={`row-error-${e.id}`}>
                    <TableCell>{e.rowNumber}</TableCell>
                    <TableCell className="text-destructive">{e.errorMessage}</TableCell>
                    <TableCell className="font-mono text-xs max-w-[300px] truncate">{e.rawData}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
