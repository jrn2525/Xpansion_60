import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Activity, Eye, User, Database, ChevronLeft, ChevronRight } from "lucide-react";
import { statusColors } from "@/lib/semantic-colors";

const actionColors: Record<string, string> = {
  create: statusColors.success,
  update: statusColors.info,
  delete: statusColors.error,
  reprocess: statusColors.warning,
  ip_block_created: statusColors.warning,
  ip_block_deleted: statusColors.info,
  force_logout: statusColors.error,
  account_unlocked: statusColors.success,
  incident_acknowledged: statusColors.info,
  incident_resolved: statusColors.success,
  incident_note_added: statusColors.info,
  login_success: statusColors.success,
  login_failed: statusColors.error,
};

const PAGE_SIZE = 50;

export default function AdminActivityPage() {
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>("");
  const [actionFilter, setActionFilter] = useState<string>("");
  const [actorFilter, setActorFilter] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [page, setPage] = useState(0);
  const [selectedLog, setSelectedLog] = useState<any>(null);

  const queryParams = new URLSearchParams();
  const effectiveEntityType = entityTypeFilter && entityTypeFilter !== "all" ? entityTypeFilter : "";
  if (effectiveEntityType) queryParams.set("entityType", effectiveEntityType);
  const effectiveAction = actionFilter && actionFilter !== "all" ? actionFilter : "";
  if (effectiveAction) queryParams.set("action", effectiveAction);
  if (actorFilter.trim()) queryParams.set("actorUserId", actorFilter.trim());
  if (startDate) queryParams.set("start", new Date(startDate).toISOString());
  if (endDate) queryParams.set("end", new Date(endDate).toISOString());
  queryParams.set("limit", String(PAGE_SIZE + 1));
  queryParams.set("offset", String(page * PAGE_SIZE));

  const { data: logsResponse, isLoading } = useQuery<any>({
    queryKey: ["/api/admin/activity", `?${queryParams.toString()}`],
  });

  const rawLogs = logsResponse?.data || logsResponse || [];
  const hasMore = rawLogs.length > PAGE_SIZE;
  const logs = rawLogs.slice(0, PAGE_SIZE);

  function renderDiff(before: string | null, after: string | null) {
    let beforeObj: any = null;
    let afterObj: any = null;
    try { if (before) beforeObj = JSON.parse(before); } catch { /* ignore */ }
    try { if (after) afterObj = JSON.parse(after); } catch { /* ignore */ }

    if (!beforeObj && !afterObj) return <p className="text-muted-foreground">No diff data</p>;

    const allKeys = new Set([
      ...Object.keys(beforeObj || {}),
      ...Object.keys(afterObj || {}),
    ]);

    return (
      <div className="space-y-1 font-mono text-xs">
        {Array.from(allKeys).map((key) => {
          const bVal = beforeObj?.[key];
          const aVal = afterObj?.[key];
          const changed = JSON.stringify(bVal) !== JSON.stringify(aVal);
          return (
            <div key={key} className={changed ? "bg-status-warning/10 px-2 py-1 rounded" : "px-2 py-1"}>
              <span className="text-muted-foreground">{key}:</span>{" "}
              {beforeObj && <span className="text-status-error-foreground line-through">{JSON.stringify(bVal)}</span>}
              {beforeObj && afterObj && " → "}
              {afterObj && <span className="text-status-success-foreground">{JSON.stringify(aVal)}</span>}
            </div>
          );
        })}
      </div>
    );
  }

  function handleApplyFilters() {
    setPage(0);
  }

  function handleClearFilters() {
    setEntityTypeFilter("");
    setActionFilter("");
    setActorFilter("");
    setStartDate("");
    setEndDate("");
    setPage(0);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Activity className="h-6 w-6" />
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Admin Activity Log</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">Entity Type</Label>
              <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
                <SelectTrigger data-testid="filter-entity-type"><SelectValue placeholder="All types" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="tenant">Tenant</SelectItem>
                  <SelectItem value="location">Location</SelectItem>
                  <SelectItem value="metric_definition">Metric</SelectItem>
                  <SelectItem value="metric_threshold">Threshold</SelectItem>
                  <SelectItem value="scorecard_template">Scorecard</SelectItem>
                  <SelectItem value="import_job">Import</SelectItem>
                  <SelectItem value="alert_rule">Alert Rule</SelectItem>
                  <SelectItem value="report">Report</SelectItem>
                  <SelectItem value="auth">Auth</SelectItem>
                  <SelectItem value="security">Security</SelectItem>
                  <SelectItem value="incident">Incident</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">Action</Label>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger data-testid="filter-action"><SelectValue placeholder="All actions" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All actions</SelectItem>
                  <SelectItem value="create">Create</SelectItem>
                  <SelectItem value="update">Update</SelectItem>
                  <SelectItem value="delete">Delete</SelectItem>
                  <SelectItem value="login_success">Login Success</SelectItem>
                  <SelectItem value="login_failed">Login Failed</SelectItem>
                  <SelectItem value="force_logout">Force Logout</SelectItem>
                  <SelectItem value="account_unlocked">Account Unlocked</SelectItem>
                  <SelectItem value="ip_block_created">IP Block Created</SelectItem>
                  <SelectItem value="ip_block_deleted">IP Block Deleted</SelectItem>
                  <SelectItem value="incident_acknowledged">Incident Ack</SelectItem>
                  <SelectItem value="incident_resolved">Incident Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">Actor User ID</Label>
              <Input
                value={actorFilter}
                onChange={(e) => setActorFilter(e.target.value)}
                placeholder="User ID..."
                data-testid="filter-actor"
              />
            </div>

            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                data-testid="filter-start-date"
              />
            </div>

            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                data-testid="filter-end-date"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3 mt-4">
            <Button onClick={handleApplyFilters} data-testid="button-apply-filters">Apply Filters</Button>
            <Button variant="outline" onClick={handleClearFilters} data-testid="button-clear-filters">Clear</Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : logs.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground" data-testid="text-no-logs">
            No activity logs found matching the current filters.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity Type</TableHead>
                    <TableHead>Entity ID</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log: any) => (
                    <TableRow key={log.id} data-testid={`row-activity-${log.id}`}>
                      <TableCell className="whitespace-nowrap text-sm" data-testid={`text-timestamp-${log.id}`}>
                        {log.createdAt ? new Date(log.createdAt).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell data-testid={`text-actor-${log.id}`}>
                        <span className="flex items-center gap-1 text-sm">
                          <User className="h-3 w-3 text-muted-foreground" />
                          <span className="font-mono">{log.actorUserId?.length > 16 ? log.actorUserId.slice(0, 16) + "..." : log.actorUserId}</span>
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge className={actionColors[log.action] || statusColors.neutral} data-testid={`badge-action-${log.id}`}>
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="flex items-center gap-1 w-fit" data-testid={`badge-entity-type-${log.id}`}>
                          <Database className="h-3 w-3" />{log.entityType}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm" data-testid={`text-entity-id-${log.id}`}>
                        {log.entityId}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground" data-testid={`text-tenant-${log.id}`}>
                        {log.tenantId || "—"}
                      </TableCell>
                      <TableCell>
                        {(log.beforeJson || log.afterJson) && (
                          <Button size="sm" variant="ghost" onClick={() => setSelectedLog(log)} data-testid={`button-diff-${log.id}`}>
                            <Eye className="h-3 w-3 mr-1" /> Diff
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between gap-4 p-4 border-t">
              <span className="text-sm text-muted-foreground" data-testid="text-page-info">
                Showing {logs.length} entries
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">Page {page + 1}</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!hasMore}
                  onClick={() => setPage((p) => p + 1)}
                  data-testid="button-next-page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Change Details — {selectedLog?.entityType} #{selectedLog?.entityId} ({selectedLog?.action})
            </DialogTitle>
          </DialogHeader>
          {selectedLog && renderDiff(selectedLog.beforeJson, selectedLog.afterJson)}
        </DialogContent>
      </Dialog>
    </div>
  );
}
