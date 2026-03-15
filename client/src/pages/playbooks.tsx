import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
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
import { Checkbox } from "@/components/ui/checkbox";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  BookOpen,
  Play,
  Trash2,
  MapPin,
  Pencil,
  Archive,
  ArchiveRestore,
  ChevronUp,
  ChevronDown,
  History,
  Calendar,
  User,
  TrendingUp,
  BarChart3,
  Lightbulb,
  Loader2,
  RefreshCw,
  CheckCircle2,
  Circle,
  ChevronRight,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Location } from "@shared/schema";
import { severityColors } from "@/lib/semantic-colors";
import { Progress } from "@/components/ui/progress";

interface PlaybookStep {
  title: string;
  description: string;
}

interface PlaybookWithSteps {
  id: number;
  name: string;
  description: string | null;
  category: string | null;
  isActive: boolean;
  isArchived?: boolean;
  version?: number;
  updatedByUserId?: string | null;
  steps: Array<{ id: number; stepOrder: number; title: string; description: string | null }>;
}

interface PlaybookApplication {
  id: number;
  playbookId: number;
  tenantId: number;
  locationId: number;
  appliedByUserId: string;
  status: string;
  createdAt: string | null;
}

interface TenantUserWithName {
  id: number;
  userId: string;
  role: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
}

interface EffectivenessRanking {
  playbookId: number;
  applications: number;
  avgUplift: number;
  totalUplift: number;
}

interface EffectivenessSnapshot {
  id: number;
  playbookId: number;
  locationId: number;
  applicationId: number;
  preAvgValue: number;
  postAvgValue: number;
  upliftPercent: number;
  prePeriods: number;
  postPeriods: number;
  computedAt: string | null;
}

interface PlaybookRecommendation {
  playbookId: number;
  avgUplift: number;
  applications: number;
  relevanceScore: number;
}

export default function PlaybooksPage() {
  const { user } = useAuth();
  const isClient = user?.isSuperAdmin !== "true";
  if (isClient) return <ClientPlaybooksView />;
  return <ConsultantPlaybooksView />;
}

function ConsultantPlaybooksView() {
  const { activeTenantId } = useTenantStore();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [showApply, setShowApply] = useState<number | null>(null);
  const [showEdit, setShowEdit] = useState<PlaybookWithSteps | null>(null);
  const [showApplications, setShowApplications] = useState<number | null>(null);
  const [selectedLocationIds, setSelectedLocationIds] = useState<Set<number>>(new Set());
  const [form, setForm] = useState({ name: "", description: "", category: "" });
  const [steps, setSteps] = useState<PlaybookStep[]>([{ title: "", description: "" }]);
  const [editForm, setEditForm] = useState({ name: "", description: "", category: "" });
  const [editSteps, setEditSteps] = useState<PlaybookStep[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [activeTab, setActiveTab] = useState("playbooks");
  const getLocalDateStr = (daysFromNow: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const [applyOverrides, setApplyOverrides] = useState({
    ownerUserId: "",
    priority: "medium",
    dueDate: getLocalDateStr(14),
  });

  const { data: playbooksData, isLoading } = useQuery<{ ok: boolean; data: PlaybookWithSteps[] }>({
    queryKey: ["/api/tenants", activeTenantId, "playbooks"],
    enabled: !!activeTenantId,
  });

  const { data: locsData } = useQuery<Location[]>({
    queryKey: ["/api/tenants", activeTenantId, "locations"],
    enabled: !!activeTenantId,
  });

  const { data: usersData } = useQuery<{ ok: boolean; data: TenantUserWithName[] }>({
    queryKey: ["/api/tenants", activeTenantId, "users"],
    enabled: !!activeTenantId,
  });

  const { data: applicationsData, isLoading: applicationsLoading } = useQuery<{ ok: boolean; data: PlaybookApplication[] }>({
    queryKey: ["/api/tenants", activeTenantId, "playbooks", showApplications, "applications"],
    enabled: !!activeTenantId && showApplications !== null,
  });

  const { data: effectivenessData, isLoading: effectivenessLoading } = useQuery<{ ok: boolean; data: { rankings: EffectivenessRanking[]; snapshots: EffectivenessSnapshot[] } }>({
    queryKey: ["/api/tenants", activeTenantId, "playbooks/effectiveness"],
    enabled: !!activeTenantId && activeTab === "effectiveness",
  });

  const { data: recommendationsData } = useQuery<{ ok: boolean; data: PlaybookRecommendation[] }>({
    queryKey: ["/api/tenants", activeTenantId, "playbooks/recommendations"],
    enabled: !!activeTenantId && activeTab === "effectiveness",
  });

  const computeEffectivenessMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/tenants/${activeTenantId}/playbooks/compute-effectiveness`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", activeTenantId, "playbooks/effectiveness"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", activeTenantId, "playbooks/recommendations"] });
      toast({ title: "Effectiveness computed" });
    },
    onError: (error: any) => {
      toast({ title: "Computation failed", description: error.message, variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/tenants/${activeTenantId}/playbooks`, {
        ...form,
        steps: steps.filter(s => s.title.trim()),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", activeTenantId, "playbooks"] });
      setShowCreate(false);
      setForm({ name: "", description: "", category: "" });
      setSteps([{ title: "", description: "" }]);
      toast({ title: "Playbook created" });
    },
  });

  const editMutation = useMutation({
    mutationFn: () =>
      apiRequest("PUT", `/api/tenants/${activeTenantId}/playbooks/${showEdit?.id}`, {
        ...editForm,
        steps: editSteps.filter(s => s.title.trim()),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", activeTenantId, "playbooks"] });
      setShowEdit(null);
      toast({ title: "Playbook updated" });
    },
    onError: (error: any) => {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (playbookId: number) =>
      apiRequest("DELETE", `/api/tenants/${activeTenantId}/playbooks/${playbookId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", activeTenantId, "playbooks"] });
      toast({ title: "Playbook archived" });
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: (playbookId: number) =>
      apiRequest("POST", `/api/tenants/${activeTenantId}/playbooks/${playbookId}/unarchive`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", activeTenantId, "playbooks"] });
      toast({ title: "Playbook restored" });
    },
  });

  const applyMutation = useMutation({
    mutationFn: (playbookId: number) =>
      apiRequest("POST", `/api/tenants/${activeTenantId}/playbooks/${playbookId}/apply`, {
        locationIds: Array.from(selectedLocationIds),
        ownerUserId: applyOverrides.ownerUserId || undefined,
        priority: applyOverrides.priority,
        dueDate: applyOverrides.dueDate || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", activeTenantId, "actions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", activeTenantId, "playbooks"] });
      setShowApply(null);
      setSelectedLocationIds(new Set());
      setApplyOverrides({ ownerUserId: "", priority: "medium", dueDate: getLocalDateStr(14) });
      toast({ title: "Playbook applied", description: "Actions created for selected locations." });
    },
  });

  const pbs = playbooksData?.data || [];
  const locations = locsData || [];
  const tenantUsers = usersData?.data || [];

  const activePbs = pbs.filter(pb => !pb.isArchived);
  const archivedPbs = pbs.filter(pb => pb.isArchived);

  function openEditModal(pb: PlaybookWithSteps) {
    setEditForm({
      name: pb.name,
      description: pb.description || "",
      category: pb.category || "",
    });
    setEditSteps(
      pb.steps
        .sort((a, b) => a.stepOrder - b.stepOrder)
        .map(s => ({ title: s.title, description: s.description || "" }))
    );
    setShowEdit(pb);
  }

  function moveStep(list: PlaybookStep[], setList: (s: PlaybookStep[]) => void, idx: number, dir: -1 | 1) {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= list.length) return;
    const newList = [...list];
    [newList[idx], newList[newIdx]] = [newList[newIdx], newList[idx]];
    setList(newList);
  }

  function getUserDisplayName(userId: string): string {
    const u = tenantUsers.find(tu => tu.userId === userId);
    if (u?.displayName) return u.displayName;
    if (u?.firstName) return `${u.firstName} ${u.lastName || ""}`.trim();
    return userId.slice(0, 8);
  }

  if (!activeTenantId) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold" data-testid="text-playbooks-title">Playbooks</h1>
        <p className="text-muted-foreground mt-1">Select a client to manage playbooks.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32" />)}
      </div>
    );
  }

  const effectivenessRankings = effectivenessData?.data?.rankings || [];
  const effectivenessSnapshots = effectivenessData?.data?.snapshots || [];
  const recommendations = recommendationsData?.data || [];

  function getPlaybookName(playbookId: number): string {
    const pb = pbs.find(p => p.id === playbookId);
    return pb?.name || `Playbook #${playbookId}`;
  }

  return (
    <div className="p-6 space-y-4 max-w-7xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-playbooks-title">Playbooks</h1>
          <p className="text-muted-foreground text-sm">Reusable action templates for underperforming locations</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {activeTab === "playbooks" && archivedPbs.length > 0 && (
            <Button
              variant="outline"
              onClick={() => setShowArchived(!showArchived)}
              data-testid="button-toggle-archived"
            >
              <Archive className="h-4 w-4 mr-2" />
              {showArchived ? "Hide" : "Show"} Archived ({archivedPbs.length})
            </Button>
          )}
          {activeTab === "playbooks" && (
            <Button onClick={() => setShowCreate(true)} data-testid="button-create-playbook">
              <Plus className="h-4 w-4 mr-2" />
              New Playbook
            </Button>
          )}
          {activeTab === "effectiveness" && (
            <Button
              variant="outline"
              onClick={() => computeEffectivenessMutation.mutate()}
              disabled={computeEffectivenessMutation.isPending}
              data-testid="button-compute-effectiveness"
            >
              {computeEffectivenessMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Compute Effectiveness
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="playbooks" data-testid="tab-playbooks">
            <BookOpen className="h-4 w-4 mr-1" />
            Playbooks
          </TabsTrigger>
          <TabsTrigger value="effectiveness" data-testid="tab-effectiveness">
            <BarChart3 className="h-4 w-4 mr-1" />
            Effectiveness
          </TabsTrigger>
        </TabsList>

        <TabsContent value="effectiveness" className="space-y-6 mt-4">
          {effectivenessLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16" />)}
            </div>
          ) : (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Effectiveness Rankings
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {effectivenessRankings.length === 0 ? (
                    <p className="text-muted-foreground text-center py-4" data-testid="text-no-effectiveness">
                      No effectiveness data yet. Apply playbooks to locations and then compute effectiveness.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Playbook</TableHead>
                            <TableHead>Applications</TableHead>
                            <TableHead>Avg Uplift</TableHead>
                            <TableHead>Trend</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {effectivenessRankings.map((ranking) => (
                            <TableRow key={ranking.playbookId} data-testid={`row-effectiveness-${ranking.playbookId}`}>
                              <TableCell className="font-medium" data-testid={`text-eff-playbook-${ranking.playbookId}`}>
                                {getPlaybookName(ranking.playbookId)}
                              </TableCell>
                              <TableCell data-testid={`text-eff-apps-${ranking.playbookId}`}>{ranking.applications}</TableCell>
                              <TableCell>
                                <span
                                  className={ranking.avgUplift > 0 ? "text-status-success-foreground font-medium" : ranking.avgUplift < 0 ? "text-status-error-foreground font-medium" : "text-muted-foreground"}
                                  data-testid={`text-eff-uplift-${ranking.playbookId}`}
                                >
                                  {ranking.avgUplift > 0 ? "+" : ""}{ranking.avgUplift.toFixed(1)}%
                                </span>
                              </TableCell>
                              <TableCell>
                                {ranking.avgUplift > 0 ? (
                                  <TrendingUp className="h-4 w-4 text-status-success-foreground" />
                                ) : ranking.avgUplift < 0 ? (
                                  <TrendingUp className="h-4 w-4 text-status-error-foreground rotate-180" />
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {effectivenessSnapshots.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Uplift Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Playbook</TableHead>
                            <TableHead>Location</TableHead>
                            <TableHead>Pre Avg</TableHead>
                            <TableHead>Post Avg</TableHead>
                            <TableHead>Uplift</TableHead>
                            <TableHead>Periods (Pre/Post)</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {effectivenessSnapshots.slice(0, 20).map((snap) => {
                            const loc = locations.find(l => l.id === snap.locationId);
                            return (
                              <TableRow key={snap.id} data-testid={`row-snapshot-${snap.id}`}>
                                <TableCell className="text-sm">{getPlaybookName(snap.playbookId)}</TableCell>
                                <TableCell className="text-sm">{loc?.name || `#${snap.locationId}`}</TableCell>
                                <TableCell className="text-sm">{snap.preAvgValue.toFixed(2)}</TableCell>
                                <TableCell className="text-sm">{snap.postAvgValue.toFixed(2)}</TableCell>
                                <TableCell>
                                  <span className={snap.upliftPercent > 0 ? "text-status-success-foreground font-medium" : snap.upliftPercent < 0 ? "text-status-error-foreground font-medium" : ""}>
                                    {snap.upliftPercent > 0 ? "+" : ""}{snap.upliftPercent.toFixed(1)}%
                                  </span>
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">{snap.prePeriods} / {snap.postPeriods}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {recommendations.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Lightbulb className="h-4 w-4" />
                      Recommendations
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {recommendations.map((rec, idx) => (
                        <div key={rec.playbookId} className="flex items-center justify-between gap-4" data-testid={`row-recommendation-${rec.playbookId}`}>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm text-muted-foreground shrink-0 w-5 text-right">{idx + 1}.</span>
                            <span className="text-sm font-medium truncate" data-testid={`text-rec-name-${rec.playbookId}`}>
                              {getPlaybookName(rec.playbookId)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 flex-wrap">
                            <Badge variant="secondary">{rec.applications} uses</Badge>
                            <Badge className={rec.avgUplift > 0 ? severityColors.low : severityColors.medium}>
                              {rec.avgUplift > 0 ? "+" : ""}{rec.avgUplift.toFixed(1)}% uplift
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="playbooks" className="mt-4">

      {activePbs.length === 0 && !showArchived ? (
        <Card>
          <CardContent className="py-8 text-center">
            <BookOpen className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground" data-testid="text-no-playbooks">
              No playbooks yet. Create a playbook to define reusable action templates that can be applied to multiple locations.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {activePbs.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activePbs.map(pb => (
                <Card key={pb.id} data-testid={`playbook-card-${pb.id}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-base">{pb.name}</CardTitle>
                        {pb.version && pb.version > 1 && (
                          <Badge variant="secondary" className="text-xs">v{pb.version}</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-wrap">
                        {pb.category && <Badge variant="outline">{pb.category}</Badge>}
                      </div>
                    </div>
                    {pb.description && <p className="text-sm text-muted-foreground">{pb.description}</p>}
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1 mb-3">
                      {pb.steps
                        .sort((a, b) => a.stepOrder - b.stepOrder)
                        .map((step, idx) => (
                          <div key={step.id} className="flex items-start gap-2 text-sm" data-testid={`step-${pb.id}-${idx}`}>
                            <span className="text-muted-foreground shrink-0 w-5 text-right">{step.stepOrder}.</span>
                            <span>{step.title}</span>
                          </div>
                        ))}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setShowApply(pb.id);
                          setSelectedLocationIds(new Set());
                          setApplyOverrides({ ownerUserId: "", priority: "medium", dueDate: getLocalDateStr(14) });
                        }}
                        data-testid={`button-apply-playbook-${pb.id}`}
                      >
                        <Play className="h-3 w-3 mr-1" />
                        Apply
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditModal(pb)}
                        data-testid={`button-edit-playbook-${pb.id}`}
                      >
                        <Pencil className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowApplications(pb.id)}
                        data-testid={`button-history-playbook-${pb.id}`}
                      >
                        <History className="h-3 w-3 mr-1" />
                        History
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => archiveMutation.mutate(pb.id)}
                        disabled={archiveMutation.isPending}
                        data-testid={`button-archive-playbook-${pb.id}`}
                      >
                        <Archive className="h-3 w-3 mr-1" />
                        Archive
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {showArchived && archivedPbs.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3 text-muted-foreground" data-testid="text-archived-heading">Archived Playbooks</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {archivedPbs.map(pb => (
                  <Card key={pb.id} className="opacity-70" data-testid={`playbook-card-archived-${pb.id}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <CardTitle className="text-base">{pb.name}</CardTitle>
                          <Badge variant="secondary">Archived</Badge>
                        </div>
                        {pb.category && <Badge variant="outline">{pb.category}</Badge>}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-1 mb-3">
                        {pb.steps
                          .sort((a, b) => a.stepOrder - b.stepOrder)
                          .map((step, idx) => (
                            <div key={step.id} className="flex items-start gap-2 text-sm" data-testid={`step-archived-${pb.id}-${idx}`}>
                              <span className="text-muted-foreground shrink-0 w-5 text-right">{step.stepOrder}.</span>
                              <span>{step.title}</span>
                            </div>
                          ))}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => unarchiveMutation.mutate(pb.id)}
                        disabled={unarchiveMutation.isPending}
                        data-testid={`button-unarchive-playbook-${pb.id}`}
                      >
                        <ArchiveRestore className="h-3 w-3 mr-1" />
                        Restore
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

        </TabsContent>
      </Tabs>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Playbook</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="pb-name">Name</Label>
              <Input id="pb-name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Playbook name" data-testid="input-playbook-name" />
            </div>
            <div>
              <Label htmlFor="pb-desc">Description</Label>
              <Textarea id="pb-desc" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="What this playbook addresses..." data-testid="input-playbook-description" />
            </div>
            <div>
              <Label htmlFor="pb-cat">Category</Label>
              <Input id="pb-cat" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} placeholder="e.g. Revenue, Operations" data-testid="input-playbook-category" />
            </div>
            <div>
              <Label>Steps</Label>
              <div className="space-y-2">
                {steps.map((step, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={idx === 0}
                        onClick={() => moveStep(steps, setSteps, idx, -1)}
                        data-testid={`button-step-up-${idx}`}
                        style={{ visibility: idx === 0 ? "hidden" : "visible" }}
                      >
                        <ChevronUp className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={idx === steps.length - 1}
                        onClick={() => moveStep(steps, setSteps, idx, 1)}
                        data-testid={`button-step-down-${idx}`}
                        style={{ visibility: idx === steps.length - 1 ? "hidden" : "visible" }}
                      >
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </div>
                    <span className="text-sm text-muted-foreground mt-2 w-5 text-right shrink-0">{idx + 1}.</span>
                    <div className="flex-1 space-y-1">
                      <Input
                        value={step.title}
                        onChange={e => {
                          const newSteps = [...steps];
                          newSteps[idx] = { ...newSteps[idx], title: e.target.value };
                          setSteps(newSteps);
                        }}
                        placeholder="Step title"
                        data-testid={`input-step-title-${idx}`}
                      />
                    </div>
                    {steps.length > 1 && (
                      <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setSteps(steps.filter((_, i) => i !== idx))} data-testid={`button-remove-step-${idx}`}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setSteps([...steps, { title: "", description: "" }])} data-testid="button-add-step">
                  <Plus className="h-3 w-3 mr-1" />
                  Add Step
                </Button>
              </div>
            </div>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!form.name || steps.every(s => !s.title.trim()) || createMutation.isPending}
              className="w-full"
              data-testid="button-submit-playbook"
            >
              Create Playbook
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showEdit !== null} onOpenChange={() => setShowEdit(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Playbook</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-pb-name">Name</Label>
              <Input
                id="edit-pb-name"
                value={editForm.name}
                onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                placeholder="Playbook name"
                data-testid="input-edit-playbook-name"
              />
            </div>
            <div>
              <Label htmlFor="edit-pb-desc">Description</Label>
              <Textarea
                id="edit-pb-desc"
                value={editForm.description}
                onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))}
                placeholder="What this playbook addresses..."
                data-testid="input-edit-playbook-description"
              />
            </div>
            <div>
              <Label htmlFor="edit-pb-cat">Category</Label>
              <Input
                id="edit-pb-cat"
                value={editForm.category}
                onChange={e => setEditForm(p => ({ ...p, category: e.target.value }))}
                placeholder="e.g. Revenue, Operations"
                data-testid="input-edit-playbook-category"
              />
            </div>
            <div>
              <Label>Steps</Label>
              <div className="space-y-2">
                {editSteps.map((step, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={idx === 0}
                        onClick={() => moveStep(editSteps, setEditSteps, idx, -1)}
                        data-testid={`button-edit-step-up-${idx}`}
                        style={{ visibility: idx === 0 ? "hidden" : "visible" }}
                      >
                        <ChevronUp className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={idx === editSteps.length - 1}
                        onClick={() => moveStep(editSteps, setEditSteps, idx, 1)}
                        data-testid={`button-edit-step-down-${idx}`}
                        style={{ visibility: idx === editSteps.length - 1 ? "hidden" : "visible" }}
                      >
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </div>
                    <span className="text-sm text-muted-foreground mt-2 w-5 text-right shrink-0">{idx + 1}.</span>
                    <div className="flex-1 space-y-1">
                      <Input
                        value={step.title}
                        onChange={e => {
                          const newSteps = [...editSteps];
                          newSteps[idx] = { ...newSteps[idx], title: e.target.value };
                          setEditSteps(newSteps);
                        }}
                        placeholder="Step title"
                        data-testid={`input-edit-step-title-${idx}`}
                      />
                    </div>
                    {editSteps.length > 1 && (
                      <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setEditSteps(editSteps.filter((_, i) => i !== idx))} data-testid={`button-edit-remove-step-${idx}`}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setEditSteps([...editSteps, { title: "", description: "" }])} data-testid="button-edit-add-step">
                  <Plus className="h-3 w-3 mr-1" />
                  Add Step
                </Button>
              </div>
            </div>
            <Button
              onClick={() => editMutation.mutate()}
              disabled={!editForm.name || editSteps.every(s => !s.title.trim()) || editMutation.isPending}
              className="w-full"
              data-testid="button-submit-edit-playbook"
            >
              {editMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showApply !== null} onOpenChange={() => setShowApply(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Apply Playbook to Locations</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="locations">
            <TabsList className="w-full">
              <TabsTrigger value="locations" className="flex-1" data-testid="tab-locations">Locations</TabsTrigger>
              <TabsTrigger value="overrides" className="flex-1" data-testid="tab-overrides">Overrides</TabsTrigger>
            </TabsList>
            <TabsContent value="locations" className="space-y-3 mt-3">
              <p className="text-sm text-muted-foreground">Select locations to apply the playbook. Actions will be created for each step at each location.</p>
              {locations.filter(l => l.isActive).map(loc => (
                <label key={loc.id} className="flex items-center gap-2 cursor-pointer" data-testid={`checkbox-location-${loc.id}`}>
                  <Checkbox
                    checked={selectedLocationIds.has(loc.id)}
                    onCheckedChange={(checked) => {
                      const next = new Set(selectedLocationIds);
                      if (checked) next.add(loc.id); else next.delete(loc.id);
                      setSelectedLocationIds(next);
                    }}
                  />
                  <MapPin className="h-3 w-3 text-muted-foreground" />
                  <span className="text-sm">{loc.name}</span>
                </label>
              ))}
            </TabsContent>
            <TabsContent value="overrides" className="space-y-4 mt-3">
              <p className="text-sm text-muted-foreground">Override defaults for the generated actions.</p>
              <div>
                <Label className="flex items-center gap-1 mb-1">
                  <User className="h-3 w-3" />
                  Owner
                </Label>
                <Select
                  value={applyOverrides.ownerUserId}
                  onValueChange={v => setApplyOverrides(p => ({ ...p, ownerUserId: v }))}
                >
                  <SelectTrigger data-testid="select-apply-owner">
                    <SelectValue placeholder="Default (me)" />
                  </SelectTrigger>
                  <SelectContent>
                    {tenantUsers.map(u => (
                      <SelectItem key={u.userId} value={u.userId} data-testid={`option-owner-${u.userId}`}>
                        {u.displayName || u.firstName || u.userId.slice(0, 8)} ({u.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="flex items-center gap-1 mb-1">Priority</Label>
                <Select
                  value={applyOverrides.priority}
                  onValueChange={v => setApplyOverrides(p => ({ ...p, priority: v }))}
                >
                  <SelectTrigger data-testid="select-apply-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="flex items-center gap-1 mb-1">
                  <Calendar className="h-3 w-3" />
                  Due Date
                </Label>
                <div className="flex items-center gap-2 flex-wrap">
                  <Input
                    type="date"
                    value={applyOverrides.dueDate}
                    onChange={e => setApplyOverrides(p => ({ ...p, dueDate: e.target.value }))}
                    className="flex-1"
                    data-testid="input-apply-due-date"
                  />
                  {[
                    { label: "1 Week", days: 7 },
                    { label: "2 Weeks", days: 14 },
                    { label: "1 Month", days: 30 },
                  ].map(preset => (
                    <Button
                      key={preset.label}
                      variant="outline"
                      size="sm"
                      onClick={() => setApplyOverrides(p => ({ ...p, dueDate: getLocalDateStr(preset.days) }))}
                      data-testid={`button-preset-${preset.label.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>
            </TabsContent>
          </Tabs>
          <Button
            onClick={() => showApply && applyMutation.mutate(showApply)}
            disabled={selectedLocationIds.size === 0 || applyMutation.isPending}
            className="w-full mt-2"
            data-testid="button-confirm-apply"
          >
            Apply to {selectedLocationIds.size} Location{selectedLocationIds.size !== 1 ? "s" : ""}
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={showApplications !== null} onOpenChange={() => setShowApplications(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Application History</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {applicationsLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12" />)}
              </div>
            ) : (applicationsData?.data || []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-applications">
                No applications yet. Apply this playbook to locations to see history.
              </p>
            ) : (
              (applicationsData?.data || []).map(app => {
                const loc = locations.find(l => l.id === app.locationId);
                return (
                  <div key={app.id} className="flex items-center justify-between gap-2 py-2 border-b last:border-b-0" data-testid={`application-row-${app.id}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate" data-testid={`text-application-location-${app.id}`}>
                          {loc?.name || `Location #${app.locationId}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          by {getUserDisplayName(app.appliedByUserId)}
                          {app.createdAt && ` on ${new Date(app.createdAt).toLocaleDateString()}`}
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary" data-testid={`badge-application-status-${app.id}`}>
                      {app.status}
                    </Badge>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface AssignmentWithPlaybook {
  id: number;
  playbookId: number;
  tenantId: number;
  locationId: number;
  appliedByUserId: string;
  status: string;
  completedSteps: number[];
  completedAt: string | null;
  createdAt: string | null;
  playbook: {
    id: number;
    name: string;
    description: string | null;
    category: string | null;
    steps: Array<{ id: number; stepOrder: number; title: string; description: string | null }>;
  } | null;
}

function ClientPlaybooksView() {
  const { activeTenantId } = useTenantStore();
  const { toast } = useToast();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: assignmentsData, isLoading } = useQuery<{ ok: boolean; data: AssignmentWithPlaybook[] }>({
    queryKey: ["/api/tenants", activeTenantId, "playbook-assignments"],
    enabled: !!activeTenantId,
  });

  const { data: locsData } = useQuery<Location[]>({
    queryKey: ["/api/tenants", activeTenantId, "locations"],
    enabled: !!activeTenantId,
  });

  const toggleStepMutation = useMutation({
    mutationFn: ({ applicationId, stepOrder, completed }: { applicationId: number; stepOrder: number; completed: boolean }) =>
      apiRequest("PATCH", `/api/tenants/${activeTenantId}/playbook-assignments/${applicationId}/steps`, { stepOrder, completed }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", activeTenantId, "playbook-assignments"] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update step", description: error.message, variant: "destructive" });
    },
  });

  const assignments = assignmentsData?.data || [];
  const locations = locsData || [];
  const active = assignments.filter(a => a.status !== "completed");
  const completed = assignments.filter(a => a.status === "completed");

  if (!activeTenantId) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold" data-testid="text-playbooks-title">My Playbooks</h1>
        <p className="text-muted-foreground mt-1">Select a client to view your playbooks.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32" />)}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl" data-testid="page-client-playbooks">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-playbooks-title">My Playbooks</h1>
        <p className="text-muted-foreground text-sm">Step-by-step guides assigned to help improve your business</p>
      </div>

      {assignments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground" data-testid="text-no-playbooks">
              No playbooks assigned yet. Your consultant will assign playbooks when there's a specific area to work on.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {active.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Active</h2>
              {active.map(assignment => {
                const pb = assignment.playbook;
                if (!pb) return null;
                const totalSteps = pb.steps.length;
                const doneCount = (assignment.completedSteps || []).length;
                const pct = totalSteps > 0 ? Math.round((doneCount / totalSteps) * 100) : 0;
                const isExpanded = expandedId === assignment.id;
                const loc = locations.find(l => l.id === assignment.locationId);

                return (
                  <Card key={assignment.id} data-testid={`playbook-assignment-${assignment.id}`}>
                    <CardContent className="p-4">
                      <button
                        className="w-full text-left"
                        onClick={() => setExpandedId(isExpanded ? null : assignment.id)}
                        data-testid={`button-expand-playbook-${assignment.id}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <BookOpen className="h-4 w-4 text-primary shrink-0" />
                              <span className="font-semibold truncate">{pb.name}</span>
                              {pb.category && (
                                <Badge variant="outline" className="text-xs shrink-0">{pb.category}</Badge>
                              )}
                            </div>
                            {loc && (
                              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {loc.name}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-right">
                              <span className="text-sm font-medium">{doneCount}/{totalSteps}</span>
                              <span className="text-xs text-muted-foreground ml-1">steps</span>
                            </div>
                            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                          </div>
                        </div>
                        <Progress value={pct} className="mt-3 h-2" />
                      </button>

                      {isExpanded && (
                        <div className="mt-4 space-y-2 border-t pt-4">
                          {pb.description && (
                            <p className="text-sm text-muted-foreground mb-3">{pb.description}</p>
                          )}
                          {pb.steps.map((step) => {
                            const isDone = (assignment.completedSteps || []).includes(step.stepOrder);
                            return (
                              <div
                                key={step.id}
                                className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${isDone ? "bg-muted/50 border-muted" : "hover:bg-muted/30"}`}
                                data-testid={`playbook-step-${assignment.id}-${step.stepOrder}`}
                              >
                                <button
                                  className="mt-0.5 shrink-0"
                                  onClick={() => toggleStepMutation.mutate({
                                    applicationId: assignment.id,
                                    stepOrder: step.stepOrder,
                                    completed: !isDone,
                                  })}
                                  disabled={toggleStepMutation.isPending}
                                  data-testid={`button-toggle-step-${assignment.id}-${step.stepOrder}`}
                                >
                                  {isDone ? (
                                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                                  ) : (
                                    <Circle className="h-5 w-5 text-muted-foreground" />
                                  )}
                                </button>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm font-medium ${isDone ? "line-through text-muted-foreground" : ""}`}>
                                    {step.title}
                                  </p>
                                  {step.description && (
                                    <p className="text-xs text-muted-foreground mt-1">{step.description}</p>
                                  )}
                                </div>
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

          {completed.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Completed</h2>
              {completed.map(assignment => {
                const pb = assignment.playbook;
                if (!pb) return null;
                const loc = locations.find(l => l.id === assignment.locationId);
                return (
                  <Card key={assignment.id} className="opacity-70" data-testid={`playbook-completed-${assignment.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                          <span className="font-medium">{pb.name}</span>
                          {loc && <span className="text-xs text-muted-foreground">· {loc.name}</span>}
                        </div>
                        <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30">
                          Completed
                        </Badge>
                      </div>
                      {assignment.completedAt && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Completed on {new Date(assignment.completedAt).toLocaleDateString()}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
