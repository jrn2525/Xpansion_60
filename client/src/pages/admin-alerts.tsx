import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useEntityLookup } from "@/hooks/use-entity-lookup";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Bell, Plus, Shield, CheckCircle, Eye, AlertTriangle, Play, Clock, ListChecks, User } from "lucide-react";
import { useTenantStore } from "@/lib/tenant-store";

import { severityColors, statusColors } from "@/lib/semantic-colors";

const alertStatusColors: Record<string, string> = {
  open: statusColors.error,
  ack: statusColors.warning,
  resolved: statusColors.success,
};

const impactColors: Record<string, string> = {
  low: "bg-status-info text-status-info-foreground",
  medium: "bg-status-warning/15 text-status-warning-foreground",
  high: "bg-status-error/20 text-status-error-foreground",
};

export default function AdminAlertsPage() {
  const { activeTenantId } = useTenantStore();
  const { toast } = useToast();
  const { resolveUser, users } = useEntityLookup();
  const [showRuleDialog, setShowRuleDialog] = useState(false);
  const [editingRule, setEditingRule] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [severityFilter, setSeverityFilter] = useState<string>("");
  const [impactFilter, setImpactFilter] = useState<string>("");
  const [expandedEventId, setExpandedEventId] = useState<number | null>(null);
  const [checkedActions, setCheckedActions] = useState<Record<string, boolean>>({});

  const [ruleName, setRuleName] = useState("");
  const [ruleSeverity, setRuleSeverity] = useState("medium");
  const [conditionType, setConditionType] = useState("threshold_breach");
  const [conditionMetricId, setConditionMetricId] = useState("");
  const [conditionOperator, setConditionOperator] = useState("above");
  const [conditionThreshold, setConditionThreshold] = useState("");
  const [conditionDropPercent, setConditionDropPercent] = useState("10");
  const [ruleIsActive, setRuleIsActive] = useState(true);
  const [cooldownMinutes, setCooldownMinutes] = useState("0");
  const [escalationMinutes, setEscalationMinutes] = useState("0");
  const [dedupWindowMinutes, setDedupWindowMinutes] = useState("0");
  const [ruleImpactLevel, setRuleImpactLevel] = useState("");
  const [rulePersistentThresholdDays, setRulePersistentThresholdDays] = useState("");
  const [ruleRecommendedActions, setRuleRecommendedActions] = useState("");
  const [ruleOwnerUserId, setRuleOwnerUserId] = useState("");

  const { data: rulesResponse, isLoading: rulesLoading } = useQuery<any>({
    queryKey: ["/api/admin/alert-rules", `?tenantId=${activeTenantId}`],
    enabled: !!activeTenantId,
  });

  const effectiveStatus = statusFilter && statusFilter !== "all" ? statusFilter : "";
  const effectiveSeverity = severityFilter && severityFilter !== "all" ? severityFilter : "";
  const effectiveImpact = impactFilter && impactFilter !== "all" ? impactFilter : "";
  const eventsQueryKey = ["/api/admin/alert-events", `?tenantId=${activeTenantId}${effectiveStatus ? `&status=${effectiveStatus}` : ""}${effectiveSeverity ? `&severity=${effectiveSeverity}` : ""}${effectiveImpact ? `&impactLevel=${effectiveImpact}` : ""}`];
  const { data: eventsResponse, isLoading: eventsLoading } = useQuery<any>({
    queryKey: eventsQueryKey,
    enabled: !!activeTenantId,
  });

  const { data: metricsData } = useQuery<any[]>({
    queryKey: ["/api/tenants", activeTenantId, "metrics"],
    enabled: !!activeTenantId,
  });

  const createRuleMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/admin/alert-rules", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/alert-rules"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/alert-events"] });
      setShowRuleDialog(false);
      resetForm();
      toast({ title: "Alert rule created" });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const updateRuleMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PUT", `/api/admin/alert-rules/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/alert-rules"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/alert-events"] });
      setShowRuleDialog(false);
      setEditingRule(null);
      resetForm();
      toast({ title: "Alert rule updated" });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const ackMutation = useMutation({
    mutationFn: async (eventId: number) => {
      const res = await apiRequest("POST", `/api/admin/alert-events/${eventId}/ack`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/alert-events"] });
      toast({ title: "Event acknowledged" });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async (eventId: number) => {
      const res = await apiRequest("POST", `/api/admin/alert-events/${eventId}/resolve`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/alert-events"] });
      toast({ title: "Event resolved" });
    },
  });

  const { data: schedulerStatusData } = useQuery<any>({
    queryKey: ["/api/admin/scheduler/status"],
  });

  const runNowMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/scheduler/run-now");
      return res.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/alert-events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/scheduler/status"] });
      toast({ title: "Scheduler run complete", description: `Evaluated ${result?.data?.alerts || 0} alert rules` });
    },
    onError: (e: Error) => toast({ title: "Run failed", description: e.message, variant: "destructive" }),
  });

  function resetForm() {
    setRuleName("");
    setRuleSeverity("medium");
    setConditionType("threshold_breach");
    setConditionMetricId("");
    setConditionOperator("above");
    setConditionThreshold("");
    setConditionDropPercent("10");
    setRuleIsActive(true);
    setCooldownMinutes("0");
    setEscalationMinutes("0");
    setDedupWindowMinutes("0");
    setRuleImpactLevel("");
    setRulePersistentThresholdDays("");
    setRuleRecommendedActions("");
    setRuleOwnerUserId("");
  }

  function openEditRule(rule: any) {
    setEditingRule(rule);
    setRuleName(rule.name);
    setRuleSeverity(rule.severity);
    setRuleIsActive(rule.isActive);
    setCooldownMinutes(String(rule.cooldownMinutes || "0"));
    setEscalationMinutes(String(rule.escalationMinutes || "0"));
    setDedupWindowMinutes(String(rule.dedupWindowMinutes || "0"));
    setRuleImpactLevel(rule.impactLevel || "");
    setRulePersistentThresholdDays(String(rule.persistentThresholdDays || ""));
    setRuleOwnerUserId(rule.ownerUserId || "");
    const actions = rule.recommendedActions;
    if (Array.isArray(actions)) {
      setRuleRecommendedActions(actions.join("\n"));
    } else {
      setRuleRecommendedActions("");
    }
    try {
      const cond = JSON.parse(rule.conditionJson);
      setConditionType(cond.type || "threshold_breach");
      setConditionMetricId(String(cond.metricDefinitionId || ""));
      setConditionOperator(cond.operator || "above");
      setConditionThreshold(String(cond.threshold || ""));
      setConditionDropPercent(String(cond.dropPercent || "10"));
    } catch { /* ignore */ }
    setShowRuleDialog(true);
  }

  function handleSaveRule() {
    const conditionJson = conditionType === "threshold_breach"
      ? JSON.stringify({ type: "threshold_breach", metricDefinitionId: parseInt(conditionMetricId), operator: conditionOperator, threshold: parseFloat(conditionThreshold) })
      : JSON.stringify({ type: "trend_deterioration", metricDefinitionId: parseInt(conditionMetricId), dropPercent: parseFloat(conditionDropPercent) });

    const recommendedActionsArray = ruleRecommendedActions
      .split("\n")
      .map(s => s.trim())
      .filter(s => s.length > 0);

    const data: any = {
      tenantId: activeTenantId,
      name: ruleName,
      severity: ruleSeverity,
      conditionJson,
      actionJson: JSON.stringify({ type: "alert_event" }),
      isActive: ruleIsActive,
      cooldownMinutes: parseInt(cooldownMinutes) || 0,
      escalationMinutes: parseInt(escalationMinutes) || 0,
      dedupWindowMinutes: parseInt(dedupWindowMinutes) || 0,
      impactLevel: ruleImpactLevel || null,
      persistentThresholdDays: rulePersistentThresholdDays ? parseInt(rulePersistentThresholdDays) : null,
      recommendedActions: recommendedActionsArray.length > 0 ? recommendedActionsArray : null,
      ownerUserId: ruleOwnerUserId || null,
    };

    if (editingRule) {
      updateRuleMutation.mutate({ id: editingRule.id, data });
    } else {
      createRuleMutation.mutate(data);
    }
  }

  function toggleCheckedAction(eventId: number, actionIndex: number) {
    const key = `${eventId}-${actionIndex}`;
    setCheckedActions(prev => ({ ...prev, [key]: !prev[key] }));
  }

  const rules = rulesResponse?.data || rulesResponse || [];
  const events = eventsResponse?.data || eventsResponse || [];
  const metrics = metricsData || [];
  if (!activeTenantId) {
    return <div className="p-6 text-center text-muted-foreground" data-testid="text-no-tenant">Select a client to manage alerts</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Alert Management</h1>
      </div>

      <Card>
        <CardContent className="p-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Scheduler</p>
              <p className="text-xs text-muted-foreground">
                {schedulerStatusData?.data?.schedulerActive ? "Active" : "Inactive"}
                {schedulerStatusData?.data?.jobs?.length > 0 && (() => {
                  const alertJob = schedulerStatusData.data.jobs.find((j: any) => j.jobType === "alert_evaluation");
                  if (alertJob?.lastRun) {
                    return ` · Last run: ${new Date(alertJob.lastRun.startedAt).toLocaleString()} · ${alertJob.lastRun.status}`;
                  }
                  return "";
                })()}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => runNowMutation.mutate()}
            disabled={runNowMutation.isPending}
            data-testid="button-run-now"
          >
            <Play className="h-3 w-3 mr-1" /> {runNowMutation.isPending ? "Running..." : "Run Now"}
          </Button>
        </CardContent>
      </Card>

      <Tabs defaultValue="events">
        <TabsList>
          <TabsTrigger value="events" data-testid="tab-events">Events</TabsTrigger>
          <TabsTrigger value="rules" data-testid="tab-rules">Rules</TabsTrigger>
        </TabsList>

        <TabsContent value="events" className="space-y-4">
          <div className="flex gap-4 flex-wrap">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40" data-testid="filter-status"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="ack">Acknowledged</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-40" data-testid="filter-severity"><SelectValue placeholder="All severities" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
            <Select value={impactFilter} onValueChange={setImpactFilter}>
              <SelectTrigger className="w-40" data-testid="filter-impact"><SelectValue placeholder="All impacts" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All impacts</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {eventsLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : events.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground" data-testid="text-no-events">No alert events yet. Events will appear here when alert rules are triggered.</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {events.map((event: any) => {
                const isExpanded = expandedEventId === event.id;
                const recActions: string[] = Array.isArray(event.recommendedActions) ? event.recommendedActions : [];
                return (
                  <Card key={event.id} data-testid={`card-event-${event.id}`}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={alertStatusColors[event.status] || ""} data-testid={`badge-event-status-${event.id}`}>{event.status}</Badge>
                        <Badge className={severityColors[event.severity as keyof typeof severityColors] || ""} data-testid={`badge-event-severity-${event.id}`}>{event.severity}</Badge>
                        {event.impactLevel && (
                          <Badge className={impactColors[event.impactLevel] || ""} data-testid={`badge-event-impact-${event.id}`}>
                            Impact: {event.impactLevel}
                          </Badge>
                        )}
                        {event.ownerUserId && (
                          <Badge variant="outline" data-testid={`badge-event-owner-${event.id}`}>
                            <User className="h-3 w-3 mr-1" /> {resolveUser(event.ownerUserId)}
                          </Badge>
                        )}
                        <span className="ml-auto text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="text-sm" data-testid={`text-event-message-${event.id}`}>{event.message}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        {event.status === "open" && (
                          <Button size="sm" variant="outline" onClick={() => ackMutation.mutate(event.id)} data-testid={`button-ack-${event.id}`}>
                            <Eye className="h-3 w-3 mr-1" /> Ack
                          </Button>
                        )}
                        {event.status !== "resolved" && (
                          <Button size="sm" variant="outline" onClick={() => resolveMutation.mutate(event.id)} data-testid={`button-resolve-${event.id}`}>
                            <CheckCircle className="h-3 w-3 mr-1" /> Resolve
                          </Button>
                        )}
                        {recActions.length > 0 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setExpandedEventId(isExpanded ? null : event.id)}
                            data-testid={`button-toggle-actions-${event.id}`}
                          >
                            <ListChecks className="h-3 w-3 mr-1" /> {isExpanded ? "Hide" : "Show"} Actions ({recActions.length})
                          </Button>
                        )}
                      </div>
                      {isExpanded && recActions.length > 0 && (
                        <div className="border-t pt-3 space-y-2" data-testid={`section-recommended-actions-${event.id}`}>
                          <p className="text-xs font-medium text-muted-foreground">Recommended Actions</p>
                          {recActions.map((action: string, idx: number) => {
                            const actionKey = `${event.id}-${idx}`;
                            const isChecked = !!checkedActions[actionKey];
                            return (
                              <div key={idx} className="flex items-center gap-2">
                                <Checkbox
                                  checked={isChecked}
                                  onCheckedChange={() => toggleCheckedAction(event.id, idx)}
                                  data-testid={`checkbox-action-${event.id}-${idx}`}
                                />
                                <span className={`text-sm ${isChecked ? "line-through text-muted-foreground" : ""}`} data-testid={`text-action-${event.id}-${idx}`}>
                                  {action}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="rules" className="space-y-4">
          <Button onClick={() => { resetForm(); setEditingRule(null); setShowRuleDialog(true); }} data-testid="button-create-rule">
            <Plus className="h-4 w-4 mr-2" /> Create Rule
          </Button>

          {rulesLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : rules.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground" data-testid="text-no-rules">No alert rules yet. Create a rule to start monitoring your metrics.</CardContent></Card>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Impact</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule: any) => {
                  let condDesc = "";
                  try {
                    const c = JSON.parse(rule.conditionJson);
                    const m = metrics.find((m: any) => m.id === c.metricDefinitionId);
                    condDesc = c.type === "threshold_breach"
                      ? `${m?.name || "?"} ${c.operator} ${c.threshold}`
                      : `${m?.name || "?"} drops ≥${c.dropPercent}%`;
                  } catch { condDesc = "—"; }
                  return (
                    <TableRow key={rule.id} data-testid={`row-rule-${rule.id}`}>
                      <TableCell className="font-medium">{rule.name}</TableCell>
                      <TableCell><Badge className={severityColors[rule.severity as keyof typeof severityColors] || ""}>{rule.severity}</Badge></TableCell>
                      <TableCell>
                        {rule.impactLevel ? (
                          <Badge className={impactColors[rule.impactLevel] || ""} data-testid={`badge-rule-impact-${rule.id}`}>{rule.impactLevel}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>{condDesc}</TableCell>
                      <TableCell>
                        {rule.ownerUserId ? (
                          <span className="text-sm" data-testid={`text-rule-owner-${rule.id}`}>{resolveUser(rule.ownerUserId)}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>{rule.isActive ? <CheckCircle className="h-4 w-4 text-status-success-foreground" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => openEditRule(rule)} data-testid={`button-edit-rule-${rule.id}`}>Edit</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={showRuleDialog} onOpenChange={setShowRuleDialog}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRule ? "Edit Alert Rule" : "Create Alert Rule"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input value={ruleName} onChange={(e) => setRuleName(e.target.value)} data-testid="input-rule-name" />
            </div>
            <div>
              <Label>Severity</Label>
              <Select value={ruleSeverity} onValueChange={setRuleSeverity}>
                <SelectTrigger data-testid="select-rule-severity"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Impact Level</Label>
              <Select value={ruleImpactLevel || "none"} onValueChange={(v) => setRuleImpactLevel(v === "none" ? "" : v)}>
                <SelectTrigger data-testid="select-rule-impact"><SelectValue placeholder="Select impact" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not set</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Condition Type</Label>
              <Select value={conditionType} onValueChange={setConditionType}>
                <SelectTrigger data-testid="select-condition-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="threshold_breach">Threshold Breach</SelectItem>
                  <SelectItem value="trend_deterioration">Trend Deterioration</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Metric</Label>
              <Select value={conditionMetricId} onValueChange={setConditionMetricId}>
                <SelectTrigger data-testid="select-condition-metric"><SelectValue placeholder="Select metric" /></SelectTrigger>
                <SelectContent>
                  {metrics.map((m: any) => <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {conditionType === "threshold_breach" && (
              <>
                <div>
                  <Label>Operator</Label>
                  <Select value={conditionOperator} onValueChange={setConditionOperator}>
                    <SelectTrigger data-testid="select-condition-operator"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="above">Above</SelectItem>
                      <SelectItem value="below">Below</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Threshold Value</Label>
                  <Input type="number" value={conditionThreshold} onChange={(e) => setConditionThreshold(e.target.value)} data-testid="input-condition-threshold" />
                </div>
              </>
            )}
            {conditionType === "trend_deterioration" && (
              <div>
                <Label>Drop Percentage (%)</Label>
                <Input type="number" value={conditionDropPercent} onChange={(e) => setConditionDropPercent(e.target.value)} data-testid="input-condition-drop" />
              </div>
            )}
            <div className="border-t pt-4 mt-2">
              <p className="text-sm font-medium mb-3">Noise Reduction</p>
              <div>
                <Label>Persistent Threshold (days)</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="e.g. 7"
                  value={rulePersistentThresholdDays}
                  onChange={(e) => setRulePersistentThresholdDays(e.target.value)}
                  data-testid="input-persistent-threshold-days"
                />
                <p className="text-xs text-muted-foreground mt-1">Triggers a persistent issue alert if metric stays below threshold for this many days.</p>
              </div>
            </div>
            <div className="border-t pt-4 mt-2">
              <p className="text-sm font-medium mb-3">Workflow Automation</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Cooldown (min)</Label>
                  <Input type="number" min="0" value={cooldownMinutes} onChange={(e) => setCooldownMinutes(e.target.value)} data-testid="input-cooldown" />
                </div>
                <div>
                  <Label className="text-xs">Escalation (min)</Label>
                  <Input type="number" min="0" value={escalationMinutes} onChange={(e) => setEscalationMinutes(e.target.value)} data-testid="input-escalation" />
                </div>
                <div>
                  <Label className="text-xs">Dedup Window (min)</Label>
                  <Input type="number" min="0" value={dedupWindowMinutes} onChange={(e) => setDedupWindowMinutes(e.target.value)} data-testid="input-dedup" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Cooldown prevents repeat alerts. Escalation bumps severity on unresolved events. Dedup suppresses duplicates.</p>
            </div>
            <div className="border-t pt-4 mt-2">
              <p className="text-sm font-medium mb-3">Ownership & Actions</p>
              <div>
                <Label>Owner</Label>
                <Select value={ruleOwnerUserId || "none"} onValueChange={(v) => setRuleOwnerUserId(v === "none" ? "" : v)}>
                  <SelectTrigger data-testid="select-rule-owner"><SelectValue placeholder="Assign owner" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.userId} value={u.userId}>{u.username || u.userId} ({u.role})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="mt-3">
                <Label>Recommended Actions (one per line)</Label>
                <Textarea
                  value={ruleRecommendedActions}
                  onChange={(e) => setRuleRecommendedActions(e.target.value)}
                  placeholder={"Check revenue dashboard\nContact location manager\nReview recent imports"}
                  rows={4}
                  data-testid="textarea-recommended-actions"
                />
                <p className="text-xs text-muted-foreground mt-1">Checklist items shown when this alert fires.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={ruleIsActive} onCheckedChange={setRuleIsActive} data-testid="switch-rule-active" />
              <Label>Active</Label>
            </div>
            <Button onClick={handleSaveRule} disabled={createRuleMutation.isPending || updateRuleMutation.isPending} className="w-full" data-testid="button-save-rule">
              {editingRule ? "Update Rule" : "Create Rule"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function XCircle(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>
    </svg>
  );
}
