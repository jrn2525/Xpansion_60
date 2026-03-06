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
import { Upload, FileText, RefreshCw, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { useTenantStore } from "@/lib/tenant-store";

const statusColors: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  partial: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
};

export default function AdminImportsPage() {
  const { activeTenantId } = useTenantStore();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [locationId, setLocationId] = useState("");
  const [mappingConfig, setMappingConfig] = useState('{"metricKey":"metric","valueKey":"value","periodKey":"period","periodStartKey":"period_start","periodEndKey":"period_end"}');

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/imports"] });
      toast({ title: "Import started", description: "CSV is being processed" });
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

  const handleUpload = () => {
    const file = fileRef.current?.files?.[0];
    if (!file || !locationId || !activeTenantId) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("tenantId", String(activeTenantId));
    fd.append("locationId", locationId);
    fd.append("mappingConfig", mappingConfig);
    uploadMutation.mutate(fd);
  };

  const jobs = jobsResponse?.data || jobsResponse || [];
  const errors = errorsResponse?.data || errorsResponse || [];

  if (!activeTenantId) {
    return <div className="p-6 text-center text-muted-foreground" data-testid="text-no-tenant">Select a tenant to manage imports</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold" data-testid="text-page-title">CSV Imports</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5" /> Upload CSV</CardTitle>
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
              <Label>CSV File</Label>
              <Input ref={fileRef} type="file" accept=".csv" data-testid="input-csv-file" />
            </div>
            <div>
              <Label>Column Mapping (JSON)</Label>
              <Input value={mappingConfig} onChange={(e) => setMappingConfig(e.target.value)} data-testid="input-mapping" />
            </div>
          </div>
          <Button onClick={handleUpload} disabled={uploadMutation.isPending} data-testid="button-upload">
            {uploadMutation.isPending ? "Uploading..." : "Upload & Import"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Import History</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : jobs.length === 0 ? (
            <p className="text-muted-foreground text-center py-8" data-testid="text-no-imports">No imports yet</p>
          ) : (
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
                      <Badge className={statusColors[job.status] || ""} data-testid={`badge-status-${job.id}`}>
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
                    <TableCell className="text-red-600">{e.errorMessage}</TableCell>
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
