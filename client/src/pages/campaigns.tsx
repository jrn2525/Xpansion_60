import { useState, Fragment } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTenantStore } from "@/lib/tenant-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Megaphone,
  Plus,
  Pencil,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Calendar,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react";
import { statusColors } from "@/lib/semantic-colors";
import type { Campaign, Location, MetricDefinition } from "@shared/schema";

const CAMPAIGN_TYPES = [
  { value: "promo", label: "Promotion" },
  { value: "local_outreach", label: "Local Outreach" },
  { value: "staffing_initiative", label: "Staffing Initiative" },
  { value: "upsell_push", label: "Upsell Push" },
];

const CAMPAIGN_STATUSES = [
  { value: "planned", label: "Planned" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

function statusBadgeClass(status: string): string {
  switch (status) {
    case "active": return statusColors.success;
    case "planned": return statusColors.info;
    case "completed": return statusColors.neutral;
    case "cancelled": return statusColors.error;
    default: return statusColors.neutral;
  }
}

function confidenceBadgeClass(confidence: string): string {
  switch (confidence) {
    case "high": return statusColors.success;
    case "medium": return statusColors.warning;
    case "low": return statusColors.error;
    default: return statusColors.neutral;
  }
}

function typeLabel(type: string): string {
  return CAMPAIGN_TYPES.find(t => t.value === type)?.label || type;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString();
}

interface ImpactData {
  campaignId: number;
  campaignName: string;
  preAvg: number;
  postAvg: number;
  absoluteChange: number;
  percentChange: number;
  confidence: string;
  preDataPoints: number;
  postDataPoints: number;
  prePeriod: { start: string; end: string };
  postPeriod: { start: string; end: string };
}

function CampaignFormFields({
  form,
  setForm,
  locations,
  metrics,
}: {
  form: any;
  setForm: (f: any) => void;
  locations: Location[];
  metrics: MetricDefinition[];
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium">Name</label>
        <Input
          data-testid="input-campaign-name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Campaign name"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Type</label>
          <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
            <SelectTrigger data-testid="select-campaign-type">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              {CAMPAIGN_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium">Status</label>
          <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
            <SelectTrigger data-testid="select-campaign-status">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              {CAMPAIGN_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Location (optional)</label>
          <Select
            value={form.locationId ? String(form.locationId) : "all"}
            onValueChange={(v) => setForm({ ...form, locationId: v === "all" ? null : parseInt(v) })}
          >
            <SelectTrigger data-testid="select-campaign-location">
              <SelectValue placeholder="All locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              {locations.map((l) => (
                <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium">Tracked Metric (optional)</label>
          <Select
            value={form.metricDefinitionId ? String(form.metricDefinitionId) : "none"}
            onValueChange={(v) => setForm({ ...form, metricDefinitionId: v === "none" ? null : parseInt(v) })}
          >
            <SelectTrigger data-testid="select-campaign-metric">
              <SelectValue placeholder="No metric" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No Metric</SelectItem>
              {metrics.map((m) => (
                <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Start Date</label>
          <Input
            data-testid="input-campaign-start-date"
            type="date"
            value={form.startDate}
            onChange={(e) => setForm({ ...form, startDate: e.target.value })}
          />
        </div>
        <div>
          <label className="text-sm font-medium">End Date (optional)</label>
          <Input
            data-testid="input-campaign-end-date"
            type="date"
            value={form.endDate || ""}
            onChange={(e) => setForm({ ...form, endDate: e.target.value || null })}
          />
        </div>
      </div>
      <div>
        <label className="text-sm font-medium">Budget (optional)</label>
        <Input
          data-testid="input-campaign-budget"
          type="number"
          value={form.budget || ""}
          onChange={(e) => setForm({ ...form, budget: e.target.value ? parseFloat(e.target.value) : null })}
          placeholder="0.00"
        />
      </div>
      <div>
        <label className="text-sm font-medium">Description</label>
        <Textarea
          data-testid="input-campaign-description"
          value={form.description || ""}
          onChange={(e) => setForm({ ...form, description: e.target.value || null })}
          placeholder="Campaign details..."
          rows={3}
        />
      </div>
    </div>
  );
}

function ImpactCard({ campaignId, tenantId }: { campaignId: number; tenantId: number }) {
  const { data: impact, isLoading } = useQuery<ImpactData>({
    queryKey: ["/api/tenants", tenantId, "campaigns", campaignId, "impact"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/tenants/${tenantId}/campaigns/${campaignId}/impact`);
      const json = await res.json();
      return json.data;
    },
  });

  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (!impact) return <div className="text-sm text-muted-foreground" data-testid="text-no-impact">No impact data available</div>;

  const isPositive = impact.absoluteChange > 0;
  const isNeutral = impact.absoluteChange === 0;
  const ChangeIcon = isPositive ? ArrowUpRight : isNeutral ? Minus : ArrowDownRight;

  return (
    <Card data-testid={`card-impact-${campaignId}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Campaign Impact Attribution
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-muted-foreground">Pre-Campaign Avg</div>
            <div className="text-lg font-semibold" data-testid="text-pre-avg">{impact.preAvg}</div>
            <div className="text-xs text-muted-foreground">{impact.preDataPoints} data points</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Post-Campaign Avg</div>
            <div className="text-lg font-semibold" data-testid="text-post-avg">{impact.postAvg}</div>
            <div className="text-xs text-muted-foreground">{impact.postDataPoints} data points</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Change</div>
            <div className={`text-lg font-semibold flex items-center gap-1 ${isPositive ? "text-status-success-foreground" : isNeutral ? "text-muted-foreground" : "text-status-error-foreground"}`} data-testid="text-change">
              <ChangeIcon className="h-4 w-4" />
              {impact.absoluteChange > 0 ? "+" : ""}{impact.absoluteChange} ({impact.percentChange > 0 ? "+" : ""}{impact.percentChange}%)
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Confidence</div>
            <Badge className={confidenceBadgeClass(impact.confidence)} data-testid="badge-confidence">
              {impact.confidence}
            </Badge>
          </div>
        </div>
        <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
          <span>Pre: {formatDate(impact.prePeriod.start)} — {formatDate(impact.prePeriod.end)}</span>
          <span>Post: {formatDate(impact.postPeriod.start)} — {formatDate(impact.postPeriod.end)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CampaignsPage() {
  const { toast } = useToast();
  const { activeTenantId: currentTenantId } = useTenantStore();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editCampaign, setEditCampaign] = useState<Campaign | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "",
    type: "promo",
    status: "planned",
    locationId: null as number | null,
    metricDefinitionId: null as number | null,
    startDate: new Date().toISOString().slice(0, 10),
    endDate: null as string | null,
    budget: null as number | null,
    description: null as string | null,
  });

  const queryParams = new URLSearchParams();
  if (statusFilter !== "all") queryParams.set("status", statusFilter);
  if (typeFilter !== "all") queryParams.set("type", typeFilter);
  const qs = queryParams.toString();

  const { data: campaigns, isLoading } = useQuery<Campaign[]>({
    queryKey: ["/api/tenants", currentTenantId, "campaigns", qs],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/tenants/${currentTenantId}/campaigns${qs ? "?" + qs : ""}`);
      const json = await res.json();
      return json.data;
    },
    enabled: !!currentTenantId,
  });

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/locations", currentTenantId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/locations?tenantId=${currentTenantId}`);
      const json = await res.json();
      return json.data || json;
    },
    enabled: !!currentTenantId,
  });

  const { data: metrics = [] } = useQuery<MetricDefinition[]>({
    queryKey: ["/api/metric-definitions", currentTenantId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/metric-definitions?tenantId=${currentTenantId}`);
      const json = await res.json();
      return json.data || json;
    },
    enabled: !!currentTenantId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const body = {
        ...data,
        startDate: new Date(data.startDate).toISOString(),
        endDate: data.endDate ? new Date(data.endDate).toISOString() : null,
      };
      const res = await apiRequest("POST", `/api/tenants/${currentTenantId}/campaigns`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", currentTenantId, "campaigns"] });
      toast({ title: "Campaign created" });
      setCreateOpen(false);
      resetForm();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const body = { ...data };
      if (body.startDate) body.startDate = new Date(body.startDate).toISOString();
      if (body.endDate) body.endDate = new Date(body.endDate).toISOString();
      const res = await apiRequest("PUT", `/api/tenants/${currentTenantId}/campaigns/${id}`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", currentTenantId, "campaigns"] });
      toast({ title: "Campaign updated" });
      setEditCampaign(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function resetForm() {
    setForm({
      name: "",
      type: "promo",
      status: "planned",
      locationId: null,
      metricDefinitionId: null,
      startDate: new Date().toISOString().slice(0, 10),
      endDate: null,
      budget: null,
      description: null,
    });
  }

  function openEdit(c: Campaign) {
    setForm({
      name: c.name,
      type: c.type,
      status: c.status,
      locationId: c.locationId,
      metricDefinitionId: c.metricDefinitionId,
      startDate: c.startDate ? new Date(c.startDate).toISOString().slice(0, 10) : "",
      endDate: c.endDate ? new Date(c.endDate).toISOString().slice(0, 10) : null,
      budget: c.budget,
      description: c.description,
    });
    setEditCampaign(c);
  }

  if (!currentTenantId) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground" data-testid="text-no-tenant">Select a client to view campaigns.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Megaphone className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Campaigns</h1>
        </div>
        <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-campaign">
              <Plus className="h-4 w-4 mr-2" /> New Campaign
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Campaign</DialogTitle>
            </DialogHeader>
            <CampaignFormFields form={form} setForm={setForm} locations={locations} metrics={metrics} />
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setCreateOpen(false)} data-testid="button-cancel-create">Cancel</Button>
              <Button
                onClick={() => createMutation.mutate(form)}
                disabled={!form.name || !form.startDate || createMutation.isPending}
                data-testid="button-submit-create"
              >
                {createMutation.isPending ? "Creating..." : "Create"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40" data-testid="filter-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {CAMPAIGN_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40" data-testid="filter-type">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {CAMPAIGN_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : !campaigns?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Megaphone className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground" data-testid="text-empty">No campaigns found. Create one to start tracking performance.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Budget</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((c) => (
                <Fragment key={c.id}>
                  <TableRow
                    className="cursor-pointer"
                    onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                    data-testid={`row-campaign-${c.id}`}
                  >
                    <TableCell className="font-medium" data-testid={`text-campaign-name-${c.id}`}>{c.name}</TableCell>
                    <TableCell data-testid={`text-campaign-type-${c.id}`}>{typeLabel(c.type)}</TableCell>
                    <TableCell>
                      <Badge className={statusBadgeClass(c.status)} data-testid={`badge-status-${c.id}`}>{c.status}</Badge>
                    </TableCell>
                    <TableCell>{formatDate(c.startDate as any)}</TableCell>
                    <TableCell>{formatDate(c.endDate as any)}</TableCell>
                    <TableCell>
                      {c.budget != null ? (
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          {c.budget.toLocaleString()}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); openEdit(c); }}
                        data-testid={`button-edit-${c.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  {expandedId === c.id && (
                    <TableRow>
                      <TableCell colSpan={7} className="bg-muted/30 p-4">
                        {c.metricDefinitionId ? (
                          <ImpactCard campaignId={c.id} tenantId={currentTenantId} />
                        ) : (
                          <div className="text-sm text-muted-foreground" data-testid={`text-no-metric-${c.id}`}>
                            No tracked metric assigned — assign a metric to view impact attribution.
                          </div>
                        )}
                        {c.description && (
                          <div className="mt-3 text-sm text-muted-foreground" data-testid={`text-description-${c.id}`}>
                            {c.description}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={!!editCampaign} onOpenChange={(o) => { if (!o) setEditCampaign(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Campaign</DialogTitle>
          </DialogHeader>
          <CampaignFormFields form={form} setForm={setForm} locations={locations} metrics={metrics} />
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setEditCampaign(null)} data-testid="button-cancel-edit">Cancel</Button>
            <Button
              onClick={() => editCampaign && updateMutation.mutate({ id: editCampaign.id, data: form })}
              disabled={!form.name || !form.startDate || updateMutation.isPending}
              data-testid="button-submit-edit"
            >
              {updateMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
