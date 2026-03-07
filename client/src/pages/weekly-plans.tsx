import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Calendar, Plus, CheckCircle, XCircle, ArrowRight, Sparkles, User, Clock } from "lucide-react";
import { useTenantStore } from "@/lib/tenant-store";
import { severityColors, statusColors } from "@/lib/semantic-colors";

const planStatusStyles: Record<string, string> = {
  draft: statusColors.warning,
  approved: statusColors.success,
  rejected: statusColors.error,
  pushed: statusColors.info,
};

const priorityStyles: Record<string, string> = {
  low: severityColors.low,
  medium: severityColors.medium,
  high: severityColors.high,
  critical: severityColors.critical,
};

export default function WeeklyPlansPage() {
  const { activeTenantId } = useTenantStore();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);

  const effectiveStatus = statusFilter && statusFilter !== "all" ? statusFilter : "";
  const plansQueryKey = ["/api/tenants", activeTenantId, `weekly-plans${effectiveStatus ? `?status=${effectiveStatus}` : ""}`];

  const { data: plansResponse, isLoading: plansLoading } = useQuery<any>({
    queryKey: plansQueryKey,
    enabled: !!activeTenantId,
  });

  const { data: itemsResponse, isLoading: itemsLoading } = useQuery<any>({
    queryKey: ["/api/tenants", activeTenantId, "weekly-plans", selectedPlanId, "items"],
    enabled: false,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/tenants/${activeTenantId}/weekly-plans/generate`);
      return res.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants"] });
      const plan = result?.data?.plan;
      const items = result?.data?.items;
      if (plan) {
        setSelectedPlanId(plan.id);
        setSelectedPlanData({ plan, items: items || [] });
      }
      toast({ title: "Weekly plan generated", description: `${items?.length || 0} items created` });
    },
    onError: (e: Error) => toast({ title: "Generation failed", description: e.message, variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: async (planId: number) => {
      const res = await apiRequest("POST", `/api/tenants/${activeTenantId}/weekly-plans/${planId}/approve`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants"] });
      if (selectedPlanData) {
        setSelectedPlanData({ ...selectedPlanData, plan: { ...selectedPlanData.plan, status: "approved" } });
      }
      toast({ title: "Plan approved" });
    },
    onError: (e: Error) => toast({ title: "Approval failed", description: e.message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: async (planId: number) => {
      const res = await apiRequest("POST", `/api/tenants/${activeTenantId}/weekly-plans/${planId}/reject`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants"] });
      if (selectedPlanData) {
        setSelectedPlanData({ ...selectedPlanData, plan: { ...selectedPlanData.plan, status: "rejected" } });
      }
      toast({ title: "Plan rejected" });
    },
    onError: (e: Error) => toast({ title: "Rejection failed", description: e.message, variant: "destructive" }),
  });

  const pushMutation = useMutation({
    mutationFn: async (planId: number) => {
      const res = await apiRequest("POST", `/api/tenants/${activeTenantId}/weekly-plans/${planId}/push-actions`);
      return res.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants"] });
      if (selectedPlanData) {
        setSelectedPlanData({ ...selectedPlanData, plan: { ...selectedPlanData.plan, status: "pushed" } });
      }
      toast({ title: "Actions created", description: `${result?.data?.actionsCreated || 0} actions pushed` });
    },
    onError: (e: Error) => toast({ title: "Push failed", description: e.message, variant: "destructive" }),
  });

  const [selectedPlanData, setSelectedPlanData] = useState<{ plan: any; items: any[] } | null>(null);

  async function openPlanDetail(plan: any) {
    setSelectedPlanId(plan.id);
    try {
      const res = await fetch(`/api/tenants/${activeTenantId}/weekly-plans/${plan.id}/items`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load items");
      const data = await res.json();
      const items = data?.data || data || [];
      setSelectedPlanData({ plan, items });
    } catch {
      setSelectedPlanData({ plan, items: [] });
    }
  }

  const plans = plansResponse?.data || plansResponse || [];

  const ownerWorkload: Record<string, number> = {};
  if (selectedPlanData?.items) {
    for (const item of selectedPlanData.items) {
      const owner = item.suggestedOwnerUserId || "Unassigned";
      ownerWorkload[owner] = (ownerWorkload[owner] || 0) + 1;
    }
  }

  if (!activeTenantId) {
    return <div className="p-6 text-center text-muted-foreground" data-testid="text-no-tenant">Select a tenant to manage weekly plans</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Calendar className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Weekly Plans</h1>
        </div>
        <Button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          data-testid="button-generate-plan"
        >
          <Sparkles className="h-4 w-4 mr-2" />
          {generateMutation.isPending ? "Generating..." : "Generate New Plan"}
        </Button>
      </div>

      <div className="flex gap-4 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40" data-testid="filter-plan-status">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="pushed">Pushed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {plansLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : plans.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground" data-testid="text-no-plans">
            No weekly plans yet. Click "Generate New Plan" to create one based on current risk data, goals, and opportunities.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {plans.map((plan: any) => (
            <Card
              key={plan.id}
              className="hover-elevate cursor-pointer"
              onClick={() => openPlanDetail(plan)}
              data-testid={`card-plan-${plan.id}`}
            >
              <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                  <Badge className={planStatusStyles[plan.status] || ""} data-testid={`badge-plan-status-${plan.id}`}>
                    {plan.status}
                  </Badge>
                  <span className="font-medium" data-testid={`text-plan-week-${plan.id}`}>{plan.weekKey}</span>
                  <span className="text-sm text-muted-foreground">
                    {plan.generatedAt ? new Date(plan.generatedAt).toLocaleDateString() : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {plan.approvedByUserId && (
                    <span className="text-xs text-muted-foreground">
                      Approved {plan.approvedAt ? new Date(plan.approvedAt).toLocaleDateString() : ""}
                    </span>
                  )}
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!selectedPlanData} onOpenChange={(open) => { if (!open) { setSelectedPlanData(null); setSelectedPlanId(null); } }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {selectedPlanData && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3 flex-wrap">
                  <span>Plan: {selectedPlanData.plan.weekKey}</span>
                  <Badge className={planStatusStyles[selectedPlanData.plan.status] || ""} data-testid="badge-detail-status">
                    {selectedPlanData.plan.status}
                  </Badge>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="flex gap-2 flex-wrap">
                  {selectedPlanData.plan.status === "draft" && (
                    <>
                      <Button
                        onClick={() => approveMutation.mutate(selectedPlanData.plan.id)}
                        disabled={approveMutation.isPending}
                        data-testid="button-approve-plan"
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        {approveMutation.isPending ? "Approving..." : "Approve"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => rejectMutation.mutate(selectedPlanData.plan.id)}
                        disabled={rejectMutation.isPending}
                        data-testid="button-reject-plan"
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        {rejectMutation.isPending ? "Rejecting..." : "Reject"}
                      </Button>
                    </>
                  )}
                  {selectedPlanData.plan.status === "approved" && (
                    <Button
                      onClick={() => pushMutation.mutate(selectedPlanData.plan.id)}
                      disabled={pushMutation.isPending}
                      data-testid="button-push-actions"
                    >
                      <ArrowRight className="h-4 w-4 mr-2" />
                      {pushMutation.isPending ? "Pushing..." : "Push to Actions"}
                    </Button>
                  )}
                </div>

                {Object.keys(ownerWorkload).length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <User className="h-4 w-4" />
                        Owner Workload
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pb-3">
                      <div className="flex gap-3 flex-wrap">
                        {Object.entries(ownerWorkload).map(([owner, count]) => (
                          <div key={owner} className="flex items-center gap-2" data-testid={`text-workload-${owner}`}>
                            <span className="text-sm">{owner}</span>
                            <Badge variant="secondary">{count}</Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {selectedPlanData.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6" data-testid="text-no-items">No items in this plan</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Priority</TableHead>
                          <TableHead>Title</TableHead>
                          <TableHead>Score</TableHead>
                          <TableHead>Owner</TableHead>
                          <TableHead>Due</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedPlanData.items
                          .sort((a: any, b: any) => (b.priorityScore || 0) - (a.priorityScore || 0))
                          .map((item: any) => (
                          <TableRow key={item.id} data-testid={`row-item-${item.id}`}>
                            <TableCell>
                              <Badge className={priorityStyles[item.priority] || ""} data-testid={`badge-item-priority-${item.id}`}>
                                {item.priority}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium text-sm" data-testid={`text-item-title-${item.id}`}>{item.title}</p>
                                {item.description && (
                                  <p className="text-xs text-muted-foreground mt-1 max-w-md truncate">{item.description}</p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm font-mono" data-testid={`text-item-score-${item.id}`}>
                                {item.priorityScore?.toFixed(1) || "0.0"}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm text-muted-foreground" data-testid={`text-item-owner-${item.id}`}>
                                {item.suggestedOwnerUserId || "—"}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm text-muted-foreground" data-testid={`text-item-due-${item.id}`}>
                                {item.suggestedDueDate ? new Date(item.suggestedDueDate).toLocaleDateString() : "—"}
                              </span>
                            </TableCell>
                            <TableCell>
                              {item.actionId ? (
                                <Badge className={statusColors.success} data-testid={`badge-item-pushed-${item.id}`}>
                                  Pushed
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">Pending</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                <div className="text-xs text-muted-foreground pt-2">
                  {selectedPlanData.plan.generatedAt && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Generated {new Date(selectedPlanData.plan.generatedAt).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
