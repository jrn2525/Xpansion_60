import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTenantStore } from "@/lib/tenant-store";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FileText,
  Play,
  Calendar,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Lightbulb,
  Loader2,
} from "lucide-react";
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

interface ImprovedItem {
  location: string;
  metric: string;
  slope: number;
  riskScore: number;
}

interface WorsenedItem {
  location: string;
  metric: string;
  slope: number;
  riskScore: number;
}

interface RiskItem {
  location: string;
  metric: string;
  riskScore: number;
  earlyWarnings: string[];
}

interface RecommendedMove {
  type: string;
  action: string;
  priority: string;
}

export default function AdminExecutiveReportsPage() {
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

  function parseJson<T>(json: string | null): T[] {
    if (!json) return [];
    try { return JSON.parse(json); } catch { return []; }
  }

  if (!activeTenantId) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold" data-testid="text-exec-reports-title">Executive Reports</h1>
        <p className="text-muted-foreground mt-1">Select a tenant to manage executive reports.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16" />)}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-exec-reports-title">Executive Reports</h1>
          <p className="text-muted-foreground text-sm">Weekly intelligence summaries for leadership</p>
        </div>
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
          Run Report
        </Button>
      </div>

      {reports.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground" data-testid="text-no-reports">
              No executive reports yet. Click "Run Report" to generate the first weekly summary.
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
                        <Calendar className="h-3 w-3 mr-1" />
                        {report.weekKey}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {report.createdAt ? new Date(report.createdAt).toLocaleString() : "N/A"}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-medium text-status-success-foreground" data-testid={`text-improved-count-${report.id}`}>
                        {improved.length}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-medium text-status-error-foreground" data-testid={`text-worsened-count-${report.id}`}>
                        {worsened.length}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-medium" data-testid={`text-risks-count-${report.id}`}>
                        {risks.length}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm" data-testid={`text-moves-count-${report.id}`}>
                        {moves.length}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedReport(report)}
                        data-testid={`button-view-report-${report.id}`}
                      >
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
          {selectedReport && (
            <ReportViewer report={selectedReport} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReportViewer({ report }: { report: ExecutiveReport }) {
  function parseJson<T>(json: string | null): T[] {
    if (!json) return [];
    try { return JSON.parse(json); } catch { return []; }
  }

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
                  <Badge variant="secondary" className="shrink-0">
                    slope {item.slope?.toFixed(4)}
                  </Badge>
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
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary">risk {item.riskScore?.toFixed(0)}</Badge>
                  </div>
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
                      <Badge key={wi} variant="outline" className="text-xs">
                        {w.replace(/_/g, " ")}
                      </Badge>
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
                  <div className="flex-1 min-w-0">
                    <p>{item.action}</p>
                  </div>
                  <Badge className={
                    item.priority === "high" ? severityColors.high :
                    item.priority === "critical" ? severityColors.critical :
                    item.priority === "medium" ? severityColors.medium :
                    severityColors.low
                  }>
                    {item.priority}
                  </Badge>
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
