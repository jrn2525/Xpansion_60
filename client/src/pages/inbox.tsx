import { useState, Fragment } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTenantStore } from "@/lib/tenant-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Inbox as InboxIcon,
  AlertTriangle,
  Ban,
  Clock,
  Target,
  Bell,
  Lightbulb,
  ChevronRight,
  Zap,
  Info,
  ArrowRight,
  Shield,
} from "lucide-react";
import { statusColors } from "@/lib/semantic-colors";

interface InboxItem {
  type: string;
  urgency: number;
  id: number;
  title: string;
  description: string;
  entityId: number;
  factors: Record<string, any>;
  confidence: number;
  lastRefresh: string;
  convertible?: boolean;
}

interface InboxData {
  items: InboxItem[];
  summary: {
    totalItems: number;
    topRisks: number;
    blockedActions: number;
    overdueActions: number;
    offTrackGoals: number;
    criticalAlerts: number;
    opportunities: number;
  };
  generatedAt: string;
}

function typeIcon(type: string) {
  switch (type) {
    case "risk": return <AlertTriangle className="h-4 w-4 text-status-error-foreground" />;
    case "blocked_action": return <Ban className="h-4 w-4 text-status-error-foreground" />;
    case "overdue_action": return <Clock className="h-4 w-4 text-status-warning-foreground" />;
    case "off_track_goal": return <Target className="h-4 w-4 text-status-warning-foreground" />;
    case "critical_alert": return <Bell className="h-4 w-4 text-status-error-foreground" />;
    case "opportunity": return <Lightbulb className="h-4 w-4 text-primary" />;
    default: return <Info className="h-4 w-4" />;
  }
}

function typeLabel(type: string): string {
  switch (type) {
    case "risk": return "Risk";
    case "blocked_action": return "Blocked";
    case "overdue_action": return "Overdue";
    case "off_track_goal": return "Off-Track Goal";
    case "critical_alert": return "Critical Alert";
    case "opportunity": return "Opportunity";
    default: return type;
  }
}

function typeBadgeClass(type: string): string {
  switch (type) {
    case "risk":
    case "blocked_action":
    case "critical_alert":
      return statusColors.error;
    case "overdue_action":
    case "off_track_goal":
      return statusColors.warning;
    case "opportunity":
      return statusColors.info;
    default:
      return statusColors.neutral;
  }
}

function confidenceLabel(c: number): string {
  if (c >= 0.8) return "High";
  if (c >= 0.5) return "Medium";
  return "Low";
}

function confidenceBadgeClass(c: number): string {
  if (c >= 0.8) return statusColors.success;
  if (c >= 0.5) return statusColors.warning;
  return statusColors.error;
}

function urgencyBar(urgency: number) {
  const pct = Math.round(urgency * 100);
  const color = urgency >= 0.8 ? "bg-status-error" : urgency >= 0.5 ? "bg-status-warning" : "bg-primary";
  return (
    <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function ExplainabilityDrawer({
  item,
  open,
  onClose,
}: {
  item: InboxItem | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!item) return null;

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent data-testid="drawer-explainability">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {typeIcon(item.type)}
            Why This?
          </SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-5">
          <div>
            <div className="text-sm font-medium text-muted-foreground">Item</div>
            <div className="text-sm mt-1" data-testid="text-explain-title">{item.title}</div>
          </div>

          <div>
            <div className="text-sm font-medium text-muted-foreground">Type</div>
            <Badge className={typeBadgeClass(item.type)} data-testid="badge-explain-type">{typeLabel(item.type)}</Badge>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm font-medium text-muted-foreground">Urgency</div>
              <div className="flex items-center gap-2 mt-1">
                {urgencyBar(item.urgency)}
                <span className="text-sm" data-testid="text-explain-urgency">{Math.round(item.urgency * 100)}%</span>
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-muted-foreground">Confidence</div>
              <Badge className={confidenceBadgeClass(item.confidence)} data-testid="badge-explain-confidence">
                {confidenceLabel(item.confidence)} ({Math.round(item.confidence * 100)}%)
              </Badge>
            </div>
          </div>

          <div>
            <div className="text-sm font-medium text-muted-foreground mb-2">Factors & Weights</div>
            <div className="space-y-2 bg-muted/30 rounded-lg p-3">
              {Object.entries(item.factors).map(([key, value]) => (
                <div key={key} className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">{key.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim()}</span>
                  <span className="font-mono" data-testid={`text-factor-${key}`}>
                    {typeof value === "object" ? JSON.stringify(value) : String(value ?? "N/A")}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-sm font-medium text-muted-foreground">Last Refresh</div>
            <div className="text-sm mt-1" data-testid="text-explain-refresh">
              {item.lastRefresh ? new Date(item.lastRefresh).toLocaleString() : "Unknown"}
            </div>
          </div>

          {item.description && (
            <div>
              <div className="text-sm font-medium text-muted-foreground">Description</div>
              <div className="text-sm mt-1 text-muted-foreground">{item.description}</div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function InboxPage() {
  const { toast } = useToast();
  const { activeTenantId } = useTenantStore();
  const [explainItem, setExplainItem] = useState<InboxItem | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const { data, isLoading } = useQuery<InboxData>({
    queryKey: ["/api/v1/tenants", activeTenantId, "inbox"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/v1/tenants/${activeTenantId}/inbox`);
      const json = await res.json();
      return json.data;
    },
    enabled: !!activeTenantId,
    refetchInterval: 60000,
  });

  const convertMutation = useMutation({
    mutationFn: async (opportunityId: number) => {
      const res = await apiRequest("POST", `/api/tenants/${activeTenantId}/opportunities/${opportunityId}/create-action`, {
        title: `Action from Inbox opportunity #${opportunityId}`,
        priority: "medium",
        status: "pending",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/tenants", activeTenantId, "inbox"] });
      toast({ title: "Action created from opportunity" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (!activeTenantId) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground" data-testid="text-no-tenant">Select a tenant to view your inbox.</p>
      </div>
    );
  }

  const filteredItems = data?.items?.filter(i => typeFilter === "all" || i.type === typeFilter) || [];
  const types = ["all", "risk", "blocked_action", "overdue_action", "off_track_goal", "critical_alert", "opportunity"];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <InboxIcon className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Command Inbox</h1>
          {data && (
            <Badge variant="outline" className="ml-2" data-testid="badge-total-items">
              {data.summary.totalItems} items
            </Badge>
          )}
        </div>
      </div>

      {data?.summary && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-status-error-foreground" />
              <span className="text-sm">Risks</span>
            </div>
            <div className="text-2xl font-bold mt-1" data-testid="text-risk-count">{data.summary.topRisks}</div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <Ban className="h-4 w-4 text-status-error-foreground" />
              <span className="text-sm">Blocked</span>
            </div>
            <div className="text-2xl font-bold mt-1" data-testid="text-blocked-count">{data.summary.blockedActions}</div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-status-warning-foreground" />
              <span className="text-sm">Overdue</span>
            </div>
            <div className="text-2xl font-bold mt-1" data-testid="text-overdue-count">{data.summary.overdueActions}</div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-status-warning-foreground" />
              <span className="text-sm">Off-Track</span>
            </div>
            <div className="text-2xl font-bold mt-1" data-testid="text-offtrack-count">{data.summary.offTrackGoals}</div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-status-error-foreground" />
              <span className="text-sm">Alerts</span>
            </div>
            <div className="text-2xl font-bold mt-1" data-testid="text-alert-count">{data.summary.criticalAlerts}</div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-primary" />
              <span className="text-sm">Opportunities</span>
            </div>
            <div className="text-2xl font-bold mt-1" data-testid="text-opp-count">{data.summary.opportunities}</div>
          </Card>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {types.map((t) => (
          <Button
            key={t}
            variant={typeFilter === t ? "default" : "outline"}
            size="sm"
            onClick={() => setTypeFilter(t)}
            data-testid={`filter-${t}`}
          >
            {t === "all" ? "All" : typeLabel(t)}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : !filteredItems.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <InboxIcon className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground" data-testid="text-empty">
              {typeFilter === "all" ? "Inbox is clear — no urgent items right now." : `No ${typeLabel(typeFilter).toLowerCase()} items.`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredItems.map((item) => (
            <Card key={`${item.type}-${item.id}`} data-testid={`card-inbox-${item.type}-${item.id}`}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0">{typeIcon(item.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate" data-testid={`text-item-title-${item.id}`}>{item.title}</span>
                      <Badge className={`${typeBadgeClass(item.type)} text-xs`}>{typeLabel(item.type)}</Badge>
                    </div>
                    {item.description && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">{item.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="flex items-center gap-1">
                      {urgencyBar(item.urgency)}
                    </div>
                    <Badge className={`${confidenceBadgeClass(item.confidence)} text-xs`} data-testid={`badge-confidence-${item.id}`}>
                      {confidenceLabel(item.confidence)}
                    </Badge>
                    {item.convertible && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); convertMutation.mutate(item.entityId); }}
                        disabled={convertMutation.isPending}
                        data-testid={`button-convert-${item.id}`}
                      >
                        <Zap className="h-3 w-3 mr-1" /> Act
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExplainItem(item)}
                      data-testid={`button-explain-${item.id}`}
                    >
                      <Info className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ExplainabilityDrawer item={explainItem} open={!!explainItem} onClose={() => setExplainItem(null)} />
    </div>
  );
}
