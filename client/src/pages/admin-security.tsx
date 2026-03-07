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
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Shield,
  ShieldAlert,
  Ban,
  AlertTriangle,
  Lock,
  LogOut,
  Unlock,
  Trash2,
  Plus,
  Eye,
  CheckCircle,
  MessageSquare,
  Activity,
  Users,
} from "lucide-react";
import { severityColors, statusColors } from "@/lib/semantic-colors";

const incidentStatusColors: Record<string, string> = {
  open: statusColors.error,
  acknowledged: statusColors.warning,
  resolved: statusColors.success,
};

const incidentSeverityColors: Record<string, string> = {
  low: severityColors.low,
  medium: severityColors.medium,
  high: severityColors.high,
  critical: severityColors.critical,
};

export default function AdminSecurityPage() {
  const { toast } = useToast();
  const [selectedIncidentId, setSelectedIncidentId] = useState<number | null>(null);
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [newIpAddress, setNewIpAddress] = useState("");
  const [newIpReason, setNewIpReason] = useState("");
  const [newIpExpiry, setNewIpExpiry] = useState("");
  const [forceLogoutUserId, setForceLogoutUserId] = useState("");
  const [unlockUserId, setUnlockUserId] = useState("");
  const [incidentStatusFilter, setIncidentStatusFilter] = useState("");
  const [incidentSeverityFilter, setIncidentSeverityFilter] = useState("");

  const { data: dashboardResponse, isLoading: dashboardLoading } = useQuery<any>({
    queryKey: ["/api/admin/security/dashboard"],
  });

  const { data: ipBlocksResponse, isLoading: ipBlocksLoading } = useQuery<any>({
    queryKey: ["/api/admin/security/ip-blocks"],
  });

  const incidentQueryParams = new URLSearchParams();
  const effStatus = incidentStatusFilter && incidentStatusFilter !== "all" ? incidentStatusFilter : "";
  const effSeverity = incidentSeverityFilter && incidentSeverityFilter !== "all" ? incidentSeverityFilter : "";
  if (effStatus) incidentQueryParams.set("status", effStatus);
  if (effSeverity) incidentQueryParams.set("severity", effSeverity);
  const incidentQs = incidentQueryParams.toString();

  const { data: incidentsResponse, isLoading: incidentsLoading } = useQuery<any>({
    queryKey: ["/api/admin/incidents", `?${incidentQs}`],
  });

  const { data: incidentDetailResponse, isLoading: incidentDetailLoading } = useQuery<any>({
    queryKey: ["/api/admin/incidents", String(selectedIncidentId)],
    enabled: !!selectedIncidentId,
  });

  const createIpBlockMutation = useMutation({
    mutationFn: async (data: { ipAddress: string; reason?: string; expiresAt?: string }) => {
      const res = await apiRequest("POST", "/api/admin/security/ip-block", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/security/ip-blocks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/security/dashboard"] });
      setNewIpAddress("");
      setNewIpReason("");
      setNewIpExpiry("");
      toast({ title: "IP block created" });
    },
    onError: (e: Error) => toast({ title: "Failed to block IP", description: e.message, variant: "destructive" }),
  });

  const deleteIpBlockMutation = useMutation({
    mutationFn: async (blockId: number) => {
      const res = await apiRequest("DELETE", `/api/admin/security/ip-block/${blockId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/security/ip-blocks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/security/dashboard"] });
      toast({ title: "IP block removed" });
    },
    onError: (e: Error) => toast({ title: "Failed to remove IP block", description: e.message, variant: "destructive" }),
  });

  const forceLogoutMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("POST", `/api/admin/security/users/${userId}/force-logout`, { reason: "Admin action" });
      return res.json();
    },
    onSuccess: (result: any) => {
      setForceLogoutUserId("");
      toast({ title: "Force logout complete", description: `${result?.data?.sessionsDestroyed || 0} sessions destroyed` });
    },
    onError: (e: Error) => toast({ title: "Force logout failed", description: e.message, variant: "destructive" }),
  });

  const unlockAccountMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("POST", `/api/admin/security/users/${userId}/unlock`, { reason: "Admin action" });
      return res.json();
    },
    onSuccess: (result: any) => {
      setUnlockUserId("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/security/dashboard"] });
      toast({ title: "Account unlocked", description: result?.data?.wasLocked ? "Account was locked and is now unlocked" : "Account was not locked" });
    },
    onError: (e: Error) => toast({ title: "Unlock failed", description: e.message, variant: "destructive" }),
  });

  const ackIncidentMutation = useMutation({
    mutationFn: async (incidentId: number) => {
      const res = await apiRequest("POST", `/api/admin/incidents/${incidentId}/acknowledge`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/incidents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/security/dashboard"] });
      toast({ title: "Incident acknowledged" });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const resolveIncidentMutation = useMutation({
    mutationFn: async (incidentId: number) => {
      const res = await apiRequest("POST", `/api/admin/incidents/${incidentId}/resolve`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/incidents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/security/dashboard"] });
      toast({ title: "Incident resolved" });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const addNoteMutation = useMutation({
    mutationFn: async ({ incidentId, content }: { incidentId: number; content: string }) => {
      const res = await apiRequest("POST", `/api/admin/incidents/${incidentId}/notes`, { content });
      return res.json();
    },
    onSuccess: () => {
      if (selectedIncidentId) {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/incidents", String(selectedIncidentId)] });
      }
      setNoteContent("");
      toast({ title: "Note added" });
    },
    onError: (e: Error) => toast({ title: "Failed to add note", description: e.message, variant: "destructive" }),
  });

  const dashboard = dashboardResponse?.data;
  const ipBlocks = ipBlocksResponse?.data || [];
  const incidents = incidentsResponse?.data || [];
  const incidentDetail = incidentDetailResponse?.data;

  function handleAddIpBlock() {
    if (!newIpAddress.trim()) return;
    const payload: any = { ipAddress: newIpAddress.trim() };
    if (newIpReason.trim()) payload.reason = newIpReason.trim();
    if (newIpExpiry) payload.expiresAt = new Date(newIpExpiry).toISOString();
    createIpBlockMutation.mutate(payload);
  }

  function openIncidentDetail(incidentId: number) {
    setSelectedIncidentId(incidentId);
    setShowIncidentModal(true);
    setNoteContent("");
  }

  function handleAddNote() {
    if (!selectedIncidentId || !noteContent.trim()) return;
    addNoteMutation.mutate({ incidentId: selectedIncidentId, content: noteContent.trim() });
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6" />
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Security Dashboard</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {dashboardLoading ? (
          [1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <Card data-testid="card-failed-logins">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Failed Logins (24h)</CardTitle>
                <ShieldAlert className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-failed-logins">{dashboard?.metrics?.failedLogins24h ?? 0}</div>
                <p className="text-xs text-muted-foreground">{dashboard?.metrics?.successLogins24h ?? 0} successful</p>
              </CardContent>
            </Card>
            <Card data-testid="card-ip-blocks">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active IP Blocks</CardTitle>
                <Ban className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-ip-blocks">{dashboard?.metrics?.activeIpBlocks ?? 0}</div>
                <p className="text-xs text-muted-foreground">{dashboard?.metrics?.trackedIPs ?? 0} IPs tracked</p>
              </CardContent>
            </Card>
            <Card data-testid="card-open-incidents">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Open Incidents</CardTitle>
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-open-incidents">{dashboard?.metrics?.openIncidents ?? 0}</div>
              </CardContent>
            </Card>
            <Card data-testid="card-locked-accounts">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Locked Accounts</CardTitle>
                <Lock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-locked-accounts">{dashboard?.metrics?.lockedAccounts ?? 0}</div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Tabs defaultValue="login-activity">
        <TabsList className="flex-wrap">
          <TabsTrigger value="login-activity" data-testid="tab-login-activity">
            <Activity className="h-3 w-3 mr-1" /> Login Activity
          </TabsTrigger>
          <TabsTrigger value="ip-blocks" data-testid="tab-ip-blocks">
            <Ban className="h-3 w-3 mr-1" /> IP Blocks
          </TabsTrigger>
          <TabsTrigger value="incidents" data-testid="tab-incidents">
            <AlertTriangle className="h-3 w-3 mr-1" /> Incidents
          </TabsTrigger>
          <TabsTrigger value="user-mgmt" data-testid="tab-user-mgmt">
            <Users className="h-3 w-3 mr-1" /> User Management
          </TabsTrigger>
        </TabsList>

        <TabsContent value="login-activity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Login Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {dashboardLoading ? (
                <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : !dashboard?.recentAuthLogs?.length ? (
                <p className="text-muted-foreground text-center py-6" data-testid="text-no-auth-logs">No recent auth activity</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Timestamp</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Actor</TableHead>
                        <TableHead>Entity ID</TableHead>
                        <TableHead>Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dashboard.recentAuthLogs.map((log: any, idx: number) => (
                        <TableRow key={log.id || idx} data-testid={`row-auth-log-${log.id || idx}`}>
                          <TableCell className="whitespace-nowrap text-sm">{log.createdAt ? new Date(log.createdAt).toLocaleString() : "—"}</TableCell>
                          <TableCell>
                            <Badge className={log.action === "login_success" ? statusColors.success : log.action === "login_failed" ? statusColors.error : statusColors.info} data-testid={`badge-auth-action-${log.id || idx}`}>
                              {log.action}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm font-mono">{log.actorUserId?.slice(0, 16) || "—"}</TableCell>
                          <TableCell className="text-sm">{log.entityId || "—"}</TableCell>
                          <TableCell className="text-sm max-w-xs truncate">{log.afterJson ? (() => { try { const d = JSON.parse(log.afterJson); return d.ip || d.email || "—"; } catch { return "—"; } })() : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ip-blocks" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add IP Block</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[180px]">
                  <Label>IP Address</Label>
                  <Input
                    value={newIpAddress}
                    onChange={(e) => setNewIpAddress(e.target.value)}
                    placeholder="e.g. 192.168.1.100"
                    data-testid="input-ip-address"
                  />
                </div>
                <div className="flex-1 min-w-[180px]">
                  <Label>Reason</Label>
                  <Input
                    value={newIpReason}
                    onChange={(e) => setNewIpReason(e.target.value)}
                    placeholder="Reason for blocking"
                    data-testid="input-ip-reason"
                  />
                </div>
                <div className="min-w-[180px]">
                  <Label>Expires (optional)</Label>
                  <Input
                    type="datetime-local"
                    value={newIpExpiry}
                    onChange={(e) => setNewIpExpiry(e.target.value)}
                    data-testid="input-ip-expiry"
                  />
                </div>
                <Button onClick={handleAddIpBlock} disabled={createIpBlockMutation.isPending || !newIpAddress.trim()} data-testid="button-add-ip-block">
                  <Plus className="h-4 w-4 mr-1" /> {createIpBlockMutation.isPending ? "Blocking..." : "Block IP"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Active IP Blocks</CardTitle>
            </CardHeader>
            <CardContent>
              {ipBlocksLoading ? (
                <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : ipBlocks.length === 0 ? (
                <p className="text-muted-foreground text-center py-6" data-testid="text-no-ip-blocks">No IP addresses are currently blocked</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>IP Address</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Blocked By</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Expires</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ipBlocks.map((block: any) => (
                        <TableRow key={block.id} data-testid={`row-ip-block-${block.id}`}>
                          <TableCell className="font-mono text-sm" data-testid={`text-ip-${block.id}`}>{block.ipAddress}</TableCell>
                          <TableCell className="text-sm max-w-xs truncate">{block.reason || "—"}</TableCell>
                          <TableCell className="text-sm font-mono">{block.blockedBy?.slice(0, 12) || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap text-sm">{block.createdAt ? new Date(block.createdAt).toLocaleString() : "—"}</TableCell>
                          <TableCell className="whitespace-nowrap text-sm">
                            {block.expiresAt ? new Date(block.expiresAt).toLocaleString() : <Badge variant="outline">Permanent</Badge>}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => deleteIpBlockMutation.mutate(block.id)}
                              disabled={deleteIpBlockMutation.isPending}
                              data-testid={`button-delete-ip-block-${block.id}`}
                            >
                              <Trash2 className="h-3 w-3 mr-1" /> Remove
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="incidents" className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Select value={incidentStatusFilter} onValueChange={setIncidentStatusFilter}>
              <SelectTrigger className="w-40" data-testid="filter-incident-status">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="acknowledged">Acknowledged</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
            <Select value={incidentSeverityFilter} onValueChange={setIncidentSeverityFilter}>
              <SelectTrigger className="w-40" data-testid="filter-incident-severity">
                <SelectValue placeholder="All severities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {incidentsLoading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : incidents.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground" data-testid="text-no-incidents">
                No incidents found
              </CardContent>
            </Card>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Severity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Detected</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {incidents.map((incident: any) => (
                    <TableRow key={incident.id} data-testid={`row-incident-${incident.id}`}>
                      <TableCell>
                        <Badge className={incidentSeverityColors[incident.severity] || ""} data-testid={`badge-incident-severity-${incident.id}`}>
                          {incident.severity}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={incidentStatusColors[incident.status] || ""} data-testid={`badge-incident-status-${incident.id}`}>
                          {incident.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{incident.type}</TableCell>
                      <TableCell className="text-sm max-w-xs truncate">{incident.title}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{incident.detectedAt ? new Date(incident.detectedAt).toLocaleString() : "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openIncidentDetail(incident.id)} data-testid={`button-view-incident-${incident.id}`}>
                            <Eye className="h-3 w-3 mr-1" /> View
                          </Button>
                          {incident.status === "open" && (
                            <Button size="sm" variant="outline" onClick={() => ackIncidentMutation.mutate(incident.id)} disabled={ackIncidentMutation.isPending} data-testid={`button-ack-incident-${incident.id}`}>
                              <CheckCircle className="h-3 w-3 mr-1" /> Ack
                            </Button>
                          )}
                          {incident.status !== "resolved" && (
                            <Button size="sm" variant="outline" onClick={() => resolveIncidentMutation.mutate(incident.id)} disabled={resolveIncidentMutation.isPending} data-testid={`button-resolve-incident-${incident.id}`}>
                              <CheckCircle className="h-3 w-3 mr-1" /> Resolve
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="user-mgmt" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <LogOut className="h-4 w-4" /> Force Logout
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>User ID</Label>
                  <Input
                    value={forceLogoutUserId}
                    onChange={(e) => setForceLogoutUserId(e.target.value)}
                    placeholder="Enter user ID"
                    data-testid="input-force-logout-user"
                  />
                </div>
                <Button
                  variant="destructive"
                  onClick={() => forceLogoutMutation.mutate(forceLogoutUserId)}
                  disabled={forceLogoutMutation.isPending || !forceLogoutUserId.trim()}
                  data-testid="button-force-logout"
                >
                  <LogOut className="h-4 w-4 mr-1" /> {forceLogoutMutation.isPending ? "Logging out..." : "Force Logout"}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Unlock className="h-4 w-4" /> Unlock Account
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>User ID</Label>
                  <Input
                    value={unlockUserId}
                    onChange={(e) => setUnlockUserId(e.target.value)}
                    placeholder="Enter user ID"
                    data-testid="input-unlock-user"
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={() => unlockAccountMutation.mutate(unlockUserId)}
                  disabled={unlockAccountMutation.isPending || !unlockUserId.trim()}
                  data-testid="button-unlock-account"
                >
                  <Unlock className="h-4 w-4 mr-1" /> {unlockAccountMutation.isPending ? "Unlocking..." : "Unlock Account"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={showIncidentModal} onOpenChange={(open) => { if (!open) { setShowIncidentModal(false); setSelectedIncidentId(null); } }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Incident Details</DialogTitle>
            <DialogDescription>
              {incidentDetail ? `${incidentDetail.type} — ${incidentDetail.severity} severity` : "Loading..."}
            </DialogDescription>
          </DialogHeader>
          {incidentDetailLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : incidentDetail ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge className={incidentSeverityColors[incidentDetail.severity] || ""} data-testid="badge-detail-severity">{incidentDetail.severity}</Badge>
                <Badge className={incidentStatusColors[incidentDetail.status] || ""} data-testid="badge-detail-status">{incidentDetail.status}</Badge>
              </div>
              <div>
                <p className="text-sm font-medium">{incidentDetail.title}</p>
                <p className="text-sm text-muted-foreground mt-1">{incidentDetail.description}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Detected:</span>{" "}
                  {incidentDetail.detectedAt ? new Date(incidentDetail.detectedAt).toLocaleString() : "—"}
                </div>
                {incidentDetail.acknowledgedAt && (
                  <div>
                    <span className="text-muted-foreground">Acknowledged:</span>{" "}
                    {new Date(incidentDetail.acknowledgedAt).toLocaleString()}
                  </div>
                )}
                {incidentDetail.resolvedAt && (
                  <div>
                    <span className="text-muted-foreground">Resolved:</span>{" "}
                    {new Date(incidentDetail.resolvedAt).toLocaleString()}
                  </div>
                )}
              </div>

              {incidentDetail.evidenceJson && (
                <div>
                  <p className="text-sm font-medium mb-1">Evidence</p>
                  <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-32" data-testid="text-evidence">
                    {(() => { try { return JSON.stringify(JSON.parse(incidentDetail.evidenceJson), null, 2); } catch { return incidentDetail.evidenceJson; } })()}
                  </pre>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {incidentDetail.status === "open" && (
                  <Button size="sm" variant="outline" onClick={() => ackIncidentMutation.mutate(incidentDetail.id)} disabled={ackIncidentMutation.isPending} data-testid="button-detail-ack">
                    <CheckCircle className="h-3 w-3 mr-1" /> Acknowledge
                  </Button>
                )}
                {incidentDetail.status !== "resolved" && (
                  <Button size="sm" variant="outline" onClick={() => resolveIncidentMutation.mutate(incidentDetail.id)} disabled={resolveIncidentMutation.isPending} data-testid="button-detail-resolve">
                    <CheckCircle className="h-3 w-3 mr-1" /> Resolve
                  </Button>
                )}
              </div>

              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-2 flex items-center gap-1">
                  <MessageSquare className="h-4 w-4" /> Notes ({incidentDetail.notes?.length || 0})
                </p>
                {incidentDetail.notes?.length > 0 ? (
                  <div className="space-y-2 mb-4">
                    {incidentDetail.notes.map((note: any) => (
                      <div key={note.id} className="bg-muted p-3 rounded-md" data-testid={`note-${note.id}`}>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs font-mono text-muted-foreground">{note.authorUserId?.slice(0, 12)}</span>
                          <span className="text-xs text-muted-foreground">{note.createdAt ? new Date(note.createdAt).toLocaleString() : ""}</span>
                        </div>
                        <p className="text-sm">{note.content}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground mb-4" data-testid="text-no-notes">No notes yet</p>
                )}
                <div className="space-y-2">
                  <Textarea
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    placeholder="Add a note..."
                    className="resize-none"
                    data-testid="input-note-content"
                  />
                  <Button
                    size="sm"
                    onClick={handleAddNote}
                    disabled={addNoteMutation.isPending || !noteContent.trim()}
                    data-testid="button-add-note"
                  >
                    <MessageSquare className="h-3 w-3 mr-1" /> {addNoteMutation.isPending ? "Adding..." : "Add Note"}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">Incident not found</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
