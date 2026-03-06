import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTenantStore } from "@/lib/tenant-store";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { statusColors } from "@/lib/semantic-colors";
import {
  Plus,
  List,
  Columns3,
  Clock,
  AlertCircle,
  CheckCircle2,
  CircleDot,
  Ban,
  Send,
  MessageSquare,
} from "lucide-react";
import type { Action, Location } from "@shared/schema";

const STATUS_OPTIONS = ["open", "in_progress", "blocked", "done"] as const;
const PRIORITY_OPTIONS = ["low", "medium", "high", "critical"] as const;

const statusIcons: Record<string, any> = {
  open: CircleDot,
  in_progress: Clock,
  blocked: Ban,
  done: CheckCircle2,
};

const statusBadgeClass: Record<string, string> = {
  open: statusColors.info.badge,
  in_progress: "bg-primary/15 text-primary border-primary/30",
  blocked: statusColors.error.badge,
  done: statusColors.success.badge,
};

const priorityBadgeClass: Record<string, string> = {
  low: statusColors.info.badge,
  medium: statusColors.warning.badge,
  high: statusColors.error.badge,
  critical: statusColors.error.badge,
};

export default function ActionsPage() {
  const { activeTenantId } = useTenantStore();
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedAction, setSelectedAction] = useState<Action | null>(null);
  const [checkinNote, setCheckinNote] = useState("");

  const [newAction, setNewAction] = useState({
    title: "",
    description: "",
    priority: "medium",
    status: "open",
    locationId: "",
    dueDate: "",
  });

  const { data: actionsData, isLoading } = useQuery<{ ok: boolean; data: Action[] }>({
    queryKey: ["/api/tenants", activeTenantId, "actions"],
    enabled: !!activeTenantId,
  });

  const { data: locationsData } = useQuery<Location[]>({
    queryKey: ["/api/tenants", activeTenantId, "locations"],
    enabled: !!activeTenantId,
  });

  const { data: checkinsData } = useQuery<{ ok: boolean; data: any[] }>({
    queryKey: ["/api/tenants", activeTenantId, "actions", selectedAction?.id, "checkins"],
    enabled: !!activeTenantId && !!selectedAction,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/tenants/${activeTenantId}/actions`, {
        ...newAction,
        locationId: newAction.locationId ? parseInt(newAction.locationId) : null,
        dueDate: newAction.dueDate ? new Date(newAction.dueDate).toISOString() : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", activeTenantId, "actions"] });
      setShowCreateDialog(false);
      setNewAction({ title: "", description: "", priority: "medium", status: "open", locationId: "", dueDate: "" });
      toast({ title: "Action created" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest("PUT", `/api/tenants/${activeTenantId}/actions/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", activeTenantId, "actions"] });
      toast({ title: "Action updated" });
    },
  });

  const checkinMutation = useMutation({
    mutationFn: (note: string) =>
      apiRequest("POST", `/api/tenants/${activeTenantId}/actions/${selectedAction?.id}/checkins`, { note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", activeTenantId, "actions", selectedAction?.id, "checkins"] });
      setCheckinNote("");
      toast({ title: "Check-in recorded" });
    },
  });

  const allActions = actionsData?.data || [];
  const filteredActions = filterStatus === "all" ? allActions : allActions.filter(a => a.status === filterStatus);
  const now = new Date();

  const isOverdue = (a: Action) => a.dueDate && new Date(a.dueDate) < now && a.status !== "done";

  if (!activeTenantId) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold" data-testid="text-actions-title">Actions</h1>
        <p className="text-muted-foreground mt-1">Select a tenant to manage actions.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 gap-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 max-w-7xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-actions-title">Actions</h1>
          <p className="text-muted-foreground text-sm">{allActions.length} total actions</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border rounded-md">
            <Button
              variant={viewMode === "list" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("list")}
              data-testid="button-view-list"
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "kanban" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("kanban")}
              data-testid="button-view-kanban"
            >
              <Columns3 className="h-4 w-4" />
            </Button>
          </div>
          <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-action">
            <Plus className="h-4 w-4 mr-2" />
            New Action
          </Button>
        </div>
      </div>

      {viewMode === "list" && (
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[160px]" data-testid="select-filter-status">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {STATUS_OPTIONS.map(s => (
                <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {viewMode === "list" ? (
        <div className="space-y-2">
          {filteredActions.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground" data-testid="text-no-actions">
                  No actions found. Create an action to start tracking execution work.
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredActions.map(action => {
              const StatusIcon = statusIcons[action.status] || CircleDot;
              return (
                <Card
                  key={action.id}
                  className={`cursor-pointer hover:bg-muted/50 transition-colors ${isOverdue(action) ? "border-status-error/50" : ""}`}
                  onClick={() => setSelectedAction(action)}
                  data-testid={`action-card-${action.id}`}
                >
                  <CardContent className="py-3 flex items-center gap-3">
                    <StatusIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">{action.title}</span>
                        {isOverdue(action) && (
                          <Badge variant="outline" className={statusColors.error.badge}>
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Overdue
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        {action.dueDate && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(action.dueDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <Badge variant="outline" className={statusBadgeClass[action.status] || ""}>
                      {action.status.replace(/_/g, " ")}
                    </Badge>
                    <Badge variant="outline" className={priorityBadgeClass[action.priority] || ""}>
                      {action.priority}
                    </Badge>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {STATUS_OPTIONS.map(status => {
            const statusActions = allActions.filter(a => a.status === status);
            return (
              <div key={status} className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium capitalize">{status.replace(/_/g, " ")}</h3>
                  <Badge variant="secondary" className="text-xs">{statusActions.length}</Badge>
                </div>
                <div className="space-y-2 min-h-[100px] rounded-md bg-muted/30 p-2">
                  {statusActions.map(action => (
                    <Card
                      key={action.id}
                      className={`cursor-pointer hover:bg-muted/50 transition-colors ${isOverdue(action) ? "border-status-error/50" : ""}`}
                      onClick={() => setSelectedAction(action)}
                      data-testid={`kanban-card-${action.id}`}
                    >
                      <CardContent className="p-3">
                        <p className="text-sm font-medium truncate">{action.title}</p>
                        <div className="flex items-center gap-1 mt-2">
                          <Badge variant="outline" className={`text-xs ${priorityBadgeClass[action.priority] || ""}`}>
                            {action.priority}
                          </Badge>
                          {isOverdue(action) && (
                            <Badge variant="outline" className={`text-xs ${statusColors.error.badge}`}>Overdue</Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Action</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="action-title">Title</Label>
              <Input
                id="action-title"
                value={newAction.title}
                onChange={(e) => setNewAction(prev => ({ ...prev, title: e.target.value }))}
                placeholder="What needs to be done?"
                data-testid="input-action-title"
              />
            </div>
            <div>
              <Label htmlFor="action-desc">Description</Label>
              <Textarea
                id="action-desc"
                value={newAction.description}
                onChange={(e) => setNewAction(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Details about this action..."
                data-testid="input-action-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Priority</Label>
                <Select value={newAction.priority} onValueChange={v => setNewAction(prev => ({ ...prev, priority: v }))}>
                  <SelectTrigger data-testid="select-action-priority"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Location</Label>
                <Select value={newAction.locationId} onValueChange={v => setNewAction(prev => ({ ...prev, locationId: v }))}>
                  <SelectTrigger data-testid="select-action-location"><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    {(locationsData || []).map((l: any) => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="action-due">Due Date</Label>
              <Input
                id="action-due"
                type="date"
                value={newAction.dueDate}
                onChange={(e) => setNewAction(prev => ({ ...prev, dueDate: e.target.value }))}
                data-testid="input-action-due-date"
              />
            </div>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!newAction.title || createMutation.isPending}
              className="w-full"
              data-testid="button-submit-action"
            >
              Create Action
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Sheet open={!!selectedAction} onOpenChange={() => setSelectedAction(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selectedAction && (
            <>
              <SheetHeader>
                <SheetTitle className="text-left">{selectedAction.title}</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 mt-4">
                {selectedAction.description && (
                  <p className="text-sm text-muted-foreground">{selectedAction.description}</p>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={statusBadgeClass[selectedAction.status] || ""}>
                    {selectedAction.status.replace(/_/g, " ")}
                  </Badge>
                  <Badge variant="outline" className={priorityBadgeClass[selectedAction.priority] || ""}>
                    {selectedAction.priority}
                  </Badge>
                  {isOverdue(selectedAction) && (
                    <Badge variant="outline" className={statusColors.error.badge}>Overdue</Badge>
                  )}
                </div>
                {selectedAction.dueDate && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Due {new Date(selectedAction.dueDate).toLocaleDateString()}
                  </p>
                )}

                <div>
                  <Label>Update Status</Label>
                  <Select
                    value={selectedAction.status}
                    onValueChange={v => {
                      updateMutation.mutate({ id: selectedAction.id, data: { status: v } });
                      setSelectedAction({ ...selectedAction, status: v });
                    }}
                  >
                    <SelectTrigger data-testid="select-update-status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="border-t pt-4">
                  <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Check-ins
                  </h3>
                  <div className="space-y-3 mb-4">
                    {(checkinsData?.data || []).length === 0 ? (
                      <p className="text-sm text-muted-foreground" data-testid="text-no-checkins">No check-ins yet. Add a note to track progress.</p>
                    ) : (
                      (checkinsData?.data || []).map((c: any) => (
                        <div key={c.id} className="text-sm border rounded-md p-3" data-testid={`checkin-${c.id}`}>
                          <p>{c.note}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(c.createdAt).toLocaleString()}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={checkinNote}
                      onChange={e => setCheckinNote(e.target.value)}
                      placeholder="Add a check-in note..."
                      data-testid="input-checkin-note"
                      onKeyDown={e => {
                        if (e.key === "Enter" && checkinNote.trim()) checkinMutation.mutate(checkinNote);
                      }}
                    />
                    <Button
                      size="icon"
                      onClick={() => checkinNote.trim() && checkinMutation.mutate(checkinNote)}
                      disabled={!checkinNote.trim() || checkinMutation.isPending}
                      data-testid="button-submit-checkin"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
