import { useQuery } from "@tanstack/react-query";
import { useEntityLookup } from "@/hooks/use-entity-lookup";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Server, Database, Clock, Cpu, Activity, CheckCircle, XCircle, AlertTriangle, Layers, Gauge, RotateCcw, Timer } from "lucide-react";
import { statusColors } from "@/lib/semantic-colors";

const runStatusColors: Record<string, string> = {
  completed: statusColors.success,
  running: statusColors.info,
  failed: statusColors.error,
};

export default function AdminOpsPage() {
  const { resolveTenant } = useEntityLookup();
  const { data: healthResponse, isLoading } = useQuery<any>({
    queryKey: ["/api/admin/ops/health"],
  });

  const health = healthResponse?.data || healthResponse || null;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Ops Health</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
        <Card><CardContent className="p-6"><Skeleton className="h-40 w-full" /></CardContent></Card>
      </div>
    );
  }

  if (!health) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Ops Health</h1>
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground" data-testid="text-no-data">
            Unable to load health data. You may not have admin access.
          </CardContent>
        </Card>
      </div>
    );
  }

  const schedulerSummary = health.scheduler?.summary || { total: 0, completed: 0, failed: 0 };
  const recentRuns = health.scheduler?.recentRuns || [];
  const jobQueue = health.jobQueue || null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Server className="h-6 w-6" />
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Ops Health</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Uptime</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-uptime">{health.uptimeFormatted}</div>
            <p className="text-xs text-muted-foreground">{health.uptime?.toLocaleString()}s total</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Database</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2" data-testid="text-db-status">
              {health.dbStatus === "connected" ? (
                <>
                  <CheckCircle className="h-5 w-5 text-status-success-foreground" />
                  <span className="text-2xl font-bold">Connected</span>
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 text-status-error-foreground" />
                  <span className="text-2xl font-bold">Disconnected</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Memory</CardTitle>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-memory">
              {health.memory?.heapUsed || 0} MB
            </div>
            <p className="text-xs text-muted-foreground">
              {health.memory?.heapUsed || 0} / {health.memory?.heapTotal || 0} MB heap, {health.memory?.rss || 0} MB RSS
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Scheduler</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-scheduler-summary">
              {schedulerSummary.completed}/{schedulerSummary.total}
            </div>
            <p className="text-xs text-muted-foreground">
              {schedulerSummary.completed} completed, {schedulerSummary.failed} failed
            </p>
          </CardContent>
        </Card>
      </div>

      {jobQueue && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <Layers className="h-5 w-5" />
            <h2 className="text-lg font-semibold" data-testid="text-job-queue-title">Job Queue Metrics</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Queue Depth</CardTitle>
                <Layers className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-queue-depth">{jobQueue.queueDepth}</div>
                <p className="text-xs text-muted-foreground">{jobQueue.running} running</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
                <Gauge className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-success-rate">{jobQueue.successRate}%</div>
                <p className="text-xs text-muted-foreground">{jobQueue.completed} completed, {jobQueue.failed} failed</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Retries</CardTitle>
                <RotateCcw className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-retries">{jobQueue.totalRetries}</div>
                <p className="text-xs text-muted-foreground">{jobQueue.deadLettered} dead-lettered</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">p95 Latency</CardTitle>
                <Timer className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-p95-latency">{jobQueue.p95LatencyMs}ms</div>
                <p className="text-xs text-muted-foreground">95th percentile job duration</p>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {schedulerSummary.failed > 0 && (
        <Card className="border-status-error/30">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertTriangle className="h-5 w-5 text-status-error-foreground" />
            <span className="text-status-error-foreground font-medium" data-testid="text-failed-warning">
              {schedulerSummary.failed} scheduler run(s) failed recently. Check the table below for details.
            </span>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Scheduler Runs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {recentRuns.length === 0 ? (
            <p className="text-center text-muted-foreground py-8" data-testid="text-no-runs">
              No scheduler runs recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job Type</TableHead>
                    <TableHead>Job Key</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Completed</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentRuns.map((run: any) => (
                    <TableRow key={run.id} data-testid={`row-scheduler-run-${run.id}`}>
                      <TableCell className="font-medium" data-testid={`text-job-type-${run.id}`}>
                        {run.jobType}
                      </TableCell>
                      <TableCell className="font-mono text-sm" data-testid={`text-job-key-${run.id}`}>
                        {run.jobKey}
                      </TableCell>
                      <TableCell>
                        <Badge className={runStatusColors[run.status] || statusColors.neutral} data-testid={`badge-run-status-${run.id}`}>
                          {run.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm" data-testid={`text-duration-${run.id}`}>
                        {run.durationMs != null ? `${run.durationMs}ms` : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground" data-testid={`text-run-tenant-${run.id}`}>
                        {resolveTenant(run.tenantId)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm" data-testid={`text-started-${run.id}`}>
                        {run.startedAt ? new Date(run.startedAt).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm" data-testid={`text-completed-${run.id}`}>
                        {run.completedAt ? new Date(run.completedAt).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-sm text-status-error-foreground" data-testid={`text-error-${run.id}`}>
                        {run.errorSnapshot || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
