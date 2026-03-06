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
import { History, Eye, User, Database } from "lucide-react";
import { useTenantStore } from "@/lib/tenant-store";

const actionColors: Record<string, string> = {
  create: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  update: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  delete: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  reprocess: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
};

export default function AdminAuditPage() {
  const { activeTenantId } = useTenantStore();
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>("");
  const [selectedLog, setSelectedLog] = useState<any>(null);

  const queryParams = new URLSearchParams();
  if (activeTenantId) queryParams.set("tenantId", String(activeTenantId));
  const effectiveEntityType = entityTypeFilter && entityTypeFilter !== "all" ? entityTypeFilter : "";
  if (effectiveEntityType) queryParams.set("entityType", effectiveEntityType);

  const { data: logsResponse, isLoading } = useQuery<any>({
    queryKey: ["/api/admin/audit", `?${queryParams.toString()}`],
    enabled: !!activeTenantId,
  });

  const logs = logsResponse?.data || logsResponse || [];

  if (!activeTenantId) {
    return <div className="p-6 text-center text-muted-foreground" data-testid="text-no-tenant">Select a tenant to view audit logs</div>;
  }

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
            <div key={key} className={changed ? "bg-yellow-50 dark:bg-yellow-900/20 px-2 py-1 rounded" : "px-2 py-1"}>
              <span className="text-muted-foreground">{key}:</span>{" "}
              {beforeObj && <span className="text-red-600 line-through">{JSON.stringify(bVal)}</span>}
              {beforeObj && afterObj && " → "}
              {afterObj && <span className="text-green-600">{JSON.stringify(aVal)}</span>}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold" data-testid="text-page-title">Audit Log</h1>

      <div className="flex gap-4">
        <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
          <SelectTrigger className="w-48" data-testid="filter-entity-type"><SelectValue placeholder="All entity types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All entity types</SelectItem>
            <SelectItem value="tenant">Tenant</SelectItem>
            <SelectItem value="location">Location</SelectItem>
            <SelectItem value="metric_definition">Metric</SelectItem>
            <SelectItem value="metric_threshold">Threshold</SelectItem>
            <SelectItem value="scorecard_template">Scorecard</SelectItem>
            <SelectItem value="import_job">Import</SelectItem>
            <SelectItem value="alert_rule">Alert Rule</SelectItem>
            <SelectItem value="report">Report</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : logs.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground" data-testid="text-no-logs">No audit logs found</CardContent></Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity ID</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log: any) => (
              <TableRow key={log.id} data-testid={`row-audit-${log.id}`}>
                <TableCell className="whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="flex items-center gap-1 w-fit">
                    <Database className="h-3 w-3" />{log.entityType}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge className={actionColors[log.action] || ""}>{log.action}</Badge>
                </TableCell>
                <TableCell className="font-mono text-sm">{log.entityId}</TableCell>
                <TableCell className="flex items-center gap-1">
                  <User className="h-3 w-3" />{log.actorUserId.slice(0, 12)}...
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
