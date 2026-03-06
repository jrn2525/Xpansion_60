import { useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Plus, Play, FileBarChart, Clock, CheckCircle, XCircle } from "lucide-react";
import { useTenantStore } from "@/lib/tenant-store";

export default function AdminReportsPage() {
  const { activeTenantId } = useTenantStore();
  const { toast } = useToast();
  const [showDialog, setShowDialog] = useState(false);
  const [editingReport, setEditingReport] = useState<any>(null);
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);

  const [reportName, setReportName] = useState("");
  const [reportType, setReportType] = useState("weekly_owner");
  const [isActive, setIsActive] = useState(true);

  const { data: reportsResponse, isLoading } = useQuery<any>({
    queryKey: ["/api/admin/reports", `?tenantId=${activeTenantId}`],
    enabled: !!activeTenantId,
  });

  const { data: runsResponse } = useQuery<any>({
    queryKey: ["/api/admin/report-runs", `?reportId=${selectedReportId}`],
    enabled: !!selectedReportId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/admin/reports", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reports"] });
      setShowDialog(false);
      resetForm();
      toast({ title: "Report created" });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PUT", `/api/admin/reports/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reports"] });
      setShowDialog(false);
      setEditingReport(null);
      resetForm();
      toast({ title: "Report updated" });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const { data: schedulerStatusData } = useQuery<any>({
    queryKey: ["/api/admin/scheduler/status"],
  });

  const runSchedulerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/scheduler/run-now");
      return res.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/report-runs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/scheduler/status"] });
      toast({ title: "Scheduler run complete", description: `Ran ${result?.data?.reports || 0} report(s)` });
    },
    onError: (e: Error) => toast({ title: "Run failed", description: e.message, variant: "destructive" }),
  });

  const runMutation = useMutation({
    mutationFn: async (reportId: number) => {
      const res = await apiRequest("POST", `/api/admin/reports/${reportId}/run`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/report-runs"] });
      toast({ title: "Report run completed" });
    },
    onError: (e: Error) => toast({ title: "Run failed", description: e.message, variant: "destructive" }),
  });

  function resetForm() {
    setReportName("");
    setReportType("weekly_owner");
    setIsActive(true);
  }

  function openEdit(report: any) {
    setEditingReport(report);
    setReportName(report.name);
    setReportType(report.reportType);
    setIsActive(report.isActive);
    setShowDialog(true);
  }

  function handleSave() {
    const data = {
      tenantId: activeTenantId,
      name: reportName,
      reportType,
      configJson: JSON.stringify({}),
      scheduleJson: JSON.stringify({}),
      isActive,
    };
    if (editingReport) {
      updateMutation.mutate({ id: editingReport.id, data });
    } else {
      createMutation.mutate(data);
    }
  }

  const reports = reportsResponse?.data || reportsResponse || [];
  const runs = runsResponse?.data || runsResponse || [];

  if (!activeTenantId) {
    return <div className="p-6 text-center text-muted-foreground" data-testid="text-no-tenant">Select a tenant to manage reports</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Reports</h1>
        <Button onClick={() => { resetForm(); setEditingReport(null); setShowDialog(true); }} data-testid="button-create-report">
          <Plus className="h-4 w-4 mr-2" /> Create Report
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Report Scheduler</p>
              <p className="text-xs text-muted-foreground">
                {schedulerStatusData?.data?.schedulerActive ? "Active" : "Inactive"}
                {schedulerStatusData?.data?.jobs?.length > 0 && (() => {
                  const reportJob = schedulerStatusData.data.jobs.find((j: any) => j.jobType === "report");
                  if (reportJob?.lastRun) {
                    return ` · Last run: ${new Date(reportJob.lastRun.startedAt).toLocaleString()} · ${reportJob.lastRun.status}`;
                  }
                  return "";
                })()}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => runSchedulerMutation.mutate()}
            disabled={runSchedulerMutation.isPending}
            data-testid="button-run-scheduler"
          >
            <Play className="h-3 w-3 mr-1" /> {runSchedulerMutation.isPending ? "Running..." : "Run All Now"}
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : reports.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground" data-testid="text-no-reports">No reports defined</CardContent></Card>
      ) : (
        <div className="grid gap-4">
          {reports.map((report: any) => (
            <Card key={report.id} data-testid={`card-report-${report.id}`}>
              <CardContent className="py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileBarChart className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{report.name}</p>
                    <p className="text-sm text-muted-foreground">Type: {report.reportType}</p>
                  </div>
                  <Badge variant={report.isActive ? "default" : "secondary"}>{report.isActive ? "Active" : "Inactive"}</Badge>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setSelectedReportId(report.id === selectedReportId ? null : report.id); }} data-testid={`button-history-${report.id}`}>
                    <Clock className="h-3 w-3 mr-1" /> History
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => runMutation.mutate(report.id)} disabled={runMutation.isPending} data-testid={`button-run-${report.id}`}>
                    <Play className="h-3 w-3 mr-1" /> Run Now
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openEdit(report)} data-testid={`button-edit-report-${report.id}`}>
                    Edit
                  </Button>
                </div>
              </CardContent>
              {selectedReportId === report.id && (
                <CardContent className="border-t pt-4">
                  <h4 className="text-sm font-medium mb-2">Run History</h4>
                  {runs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No runs yet</p>
                  ) : (
                    <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Status</TableHead>
                          <TableHead>Started</TableHead>
                          <TableHead>Completed</TableHead>
                          <TableHead>Summary</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {runs.map((run: any) => (
                          <TableRow key={run.id} data-testid={`row-run-${run.id}`}>
                            <TableCell>
                              <Badge variant={run.status === "completed" ? "default" : run.status === "failed" ? "destructive" : "secondary"}>
                                {run.status}
                              </Badge>
                            </TableCell>
                            <TableCell>{run.startedAt ? new Date(run.startedAt).toLocaleString() : "—"}</TableCell>
                            <TableCell>{run.completedAt ? new Date(run.completedAt).toLocaleString() : "—"}</TableCell>
                            <TableCell className="max-w-xs truncate font-mono text-xs">
                              {run.summaryJson ? (() => { try { return JSON.stringify(JSON.parse(run.summaryJson)).slice(0, 100) + "..."; } catch { return run.summaryJson.slice(0, 100); } })() : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingReport ? "Edit Report" : "Create Report"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input value={reportName} onChange={(e) => setReportName(e.target.value)} data-testid="input-report-name" />
            </div>
            <div>
              <Label>Report Type</Label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger data-testid="select-report-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly_owner">Weekly Owner</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="portfolio">Portfolio</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} data-testid="switch-report-active" />
              <Label>Active</Label>
            </div>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending} className="w-full" data-testid="button-save-report">
              {editingReport ? "Update" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
