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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  Play,
  FileBarChart,
  Clock,
  FileText,
  Calendar,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Lightbulb,
  Loader2,
} from "lucide-react";
import { useTenantStore } from "@/lib/tenant-store";
import { severityColors } from "@/lib/semantic-colors";

interface ExecutiveReport {
  id: number;
  tenantId: number;
  generatedByUserId: string;
  weekKey: string;
  improvedJson: string | null;
  worsenedJson: string | null;
  risksJson: string | null;
  recommendedMovesJson: string | null;
  summaryMarkdown: string | null;
  createdAt: string | null;
}

interface ImprovedItem { location: string; metric: string; slope: number; riskScore: number; }
interface WorsenedItem { location: string; metric: string; slope: number; riskScore: number; }
interface RiskItem { location: string; metric: string; riskScore: number; earlyWarnings: string[]; }
interface RecommendedMove { type: string; action: string; priority: string; }

function parseJson<T>(json: string | null): T[] {
  if (!json) return [];
  try { return JSON.parse(json); } catch { return []; }
}

function ReportViewer({ report }: { report: ExecutiveReport }) {
  const improved = parseJson<ImprovedItem>(report.improvedJson);
  const worsened = parseJson<WorsenedItem>(report.worsenedJson);
  const risks = parseJson<RiskItem>(report.risksJson);
  const moves = parseJson<RecommendedMove>(report.recommendedMovesJson);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <TrendingUp className="h-5 w-5 mx-auto text-status-success-foreground mb-1" />
            <p className="text-2xl font-bold" data-testid="text-viewer-improved">{improved.length}</p>
            <p className="text-xs text-muted-foreground">Improved</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <TrendingDown className="h-5 w-5 mx-auto text-status-error-foreground mb-1" />
            <p className="text-2xl font-bold" data-testid="text-viewer-worsened">{worsened.length}</p>
            <p className="text-xs text-muted-foreground">Worsened</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <AlertTriangle className="h-5 w-5 mx-auto text-status-warning-foreground mb-1" />
            <p className="text-2xl font-bold" data-testid="text-viewer-risks">{risks.length}</p>
            <p className="text-xs text-muted-foreground">Risks</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <Lightbulb className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold" data-testid="text-viewer-moves">{moves.length}</p>
            <p className="text-xs text-muted-foreground">Moves</p>
          </CardContent>
        </Card>
      </div>

      {improved.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-status-success-foreground" />
              What Improved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {improved.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between gap-2 text-sm" data-testid={`row-improved-${idx}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium truncate">{item.location}</span>
                    <span className="text-muted-foreground">/</span>
                    <span className="truncate">{item.metric}</span>
                  </div>
                  <Badge variant="secondary" className="shrink-0">slope {item.slope?.toFixed(4)}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {worsened.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-status-error-foreground" />
              What Worsened
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {worsened.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between gap-2 text-sm" data-testid={`row-worsened-${idx}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium truncate">{item.location}</span>
                    <span className="text-muted-foreground">/</span>
                    <span className="truncate">{item.metric}</span>
                  </div>
                  <Badge variant="secondary" className="shrink-0">risk {item.riskScore?.toFixed(0)}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {risks.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-status-warning-foreground" />
              Biggest Risks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {risks.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between gap-2 text-sm" data-testid={`row-risk-${idx}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium truncate">{item.location}</span>
                    <span className="text-muted-foreground">/</span>
                    <span className="truncate">{item.metric}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <Badge className={item.riskScore >= 80 ? severityColors.critical : item.riskScore >= 60 ? severityColors.high : severityColors.medium}>
                      {item.riskScore?.toFixed(0)}
                    </Badge>
                    {item.earlyWarnings?.map((w, wi) => (
                      <Badge key={wi} variant="outline" className="text-xs">{w.replace(/_/g, " ")}</Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {moves.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Lightbulb className="h-4 w-4" />
              Recommended Next Moves
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {moves.map((item, idx) => (
                <div key={idx} className="flex items-start gap-3 text-sm" data-testid={`row-move-${idx}`}>
                  <span className="text-muted-foreground shrink-0 w-5 text-right">{idx + 1}.</span>
                  <div className="flex-1 min-w-0"><p>{item.action}</p></div>
                  <Badge className={
                    item.priority === "high" ? severityColors.high :
                    item.priority === "critical" ? severityColors.critical :
                    item.priority === "medium" ? severityColors.medium :
                    severityColors.low
                  }>{item.priority}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {report.summaryMarkdown && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Full Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm whitespace-pre-wrap font-sans text-muted-foreground" data-testid="text-summary-markdown">
              {report.summaryMarkdown}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ExecutiveSummariesTab() {
  const { activeTenantId } = useTenantStore();
  const { toast } = useToast();
  const [selectedReport, setSelectedReport] = useState<ExecutiveReport | null>(null);

  const { data: historyResponse, isLoading } = useQuery<{ ok: boolean; data: ExecutiveReport[] }>({
    queryKey: ["/api/admin/executive-reports", activeTenantId, "history"],
    enabled: !!activeTenantId,
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/admin/executive-reports/${activeTenantId}/run`),
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/executive-reports", activeTenantId, "history"] });
      toast({ title: "Report generated", description: `Week ${data?.data?.weekKey || ""}` });
    },
    onError: (error: any) => {
      toast({ title: "Failed to generate report", description: error.message, variant: "destructive" });
    },
  });

  const reports = historyResponse?.data || [];

  if (isLoading) {
    return <div className="space-y-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>;
  }

  return (
    <>
      <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
        <p className="text-muted-foreground text-sm">Weekly intelligence summaries for leadership</p>
        <Button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          data-testid="button-run-report"
        >
          {generateMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Play className="h-4 w-4 mr-2" />
          )}
          Generate Report
        </Button>
      </div>

      {reports.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground" data-testid="text-no-exec-reports">
              No executive reports yet. Click "Generate Report" to create the first weekly summary.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Week</TableHead>
                <TableHead>Generated</TableHead>
                <TableHead>Improved</TableHead>
                <TableHead>Worsened</TableHead>
                <TableHead>Risks</TableHead>
                <TableHead>Moves</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((report) => {
                const improved = parseJson<ImprovedItem>(report.improvedJson);
                const worsened = parseJson<WorsenedItem>(report.worsenedJson);
                const risks = parseJson<RiskItem>(report.risksJson);
                const moves = parseJson<RecommendedMove>(report.recommendedMovesJson);
                return (
                  <TableRow key={report.id} data-testid={`row-report-${report.id}`}>
                    <TableCell>
                      <Badge variant="outline" data-testid={`text-week-${report.id}`}>
                        <Calendar className="h-3 w-3 mr-1" />{report.weekKey}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {report.createdAt ? new Date(report.createdAt).toLocaleString() : "N/A"}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-medium text-status-success-foreground">{improved.length}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-medium text-status-error-foreground">{worsened.length}</span>
                    </TableCell>
                    <TableCell><span className="text-sm font-medium">{risks.length}</span></TableCell>
                    <TableCell><span className="text-sm">{moves.length}</span></TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => setSelectedReport(report)} data-testid={`button-view-report-${report.id}`}>
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={selectedReport !== null} onOpenChange={() => setSelectedReport(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              <FileText className="h-5 w-5" />
              Executive Report — {selectedReport?.weekKey}
            </DialogTitle>
          </DialogHeader>
          {selectedReport && <ReportViewer report={selectedReport} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ConfigurationsTab() {
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

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <Button onClick={() => { resetForm(); setEditingReport(null); setShowDialog(true); }} data-testid="button-create-report">
          <Plus className="h-4 w-4 mr-2" /> Create Report
        </Button>
      </div>

      <Card className="mb-4">
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
    </>
  );
}

export default function AdminReportsPage() {
  const { activeTenantId } = useTenantStore();

  if (!activeTenantId) {
    return <div className="p-6 text-center text-muted-foreground" data-testid="text-no-tenant">Select a tenant to manage reports</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-center gap-3 flex-wrap">
        <FileBarChart className="h-6 w-6" />
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Reporting Center</h1>
      </div>

      <Tabs defaultValue="executive" className="w-full">
        <TabsList data-testid="tabs-reports">
          <TabsTrigger value="executive" data-testid="tab-executive-summaries">
            <FileText className="h-4 w-4 mr-1.5" />
            Executive Summaries
          </TabsTrigger>
          <TabsTrigger value="configurations" data-testid="tab-configurations">
            <Clock className="h-4 w-4 mr-1.5" />
            Configurations
          </TabsTrigger>
        </TabsList>
        <TabsContent value="executive" className="mt-4">
          <ExecutiveSummariesTab />
        </TabsContent>
        <TabsContent value="configurations" className="mt-4">
          <ConfigurationsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
