import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTenantStore } from "@/lib/tenant-store";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { statusColors } from "@/lib/semantic-colors";
import {
  FileText,
  Play,
  Trophy,
  AlertTriangle,
  Ban,
  Clock,
  Lightbulb,
  ChevronRight,
} from "lucide-react";

interface Digest {
  id: number;
  tenantId: number;
  generatedByUserId: string;
  winsJson: string;
  risksJson: string;
  blockedActionsJson: string;
  overdueActionsJson: string;
  recommendedMovesJson: string;
  summaryText: string | null;
  createdAt: string;
}

export default function AdminDigestsPage() {
  const { activeTenantId } = useTenantStore();
  const { toast } = useToast();
  const [viewDigest, setViewDigest] = useState<Digest | null>(null);

  const { data: digestsData, isLoading } = useQuery<{ ok: boolean; data: Digest[] }>({
    queryKey: ["/api/admin/digests", activeTenantId, "history"],
    enabled: !!activeTenantId,
  });

  const runMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/admin/digests/${activeTenantId}/run`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/digests", activeTenantId, "history"] });
      toast({ title: "Digest generated", description: "Weekly digest has been compiled." });
    },
  });

  const digests = digestsData?.data || [];

  if (!activeTenantId) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold" data-testid="text-digests-title">Weekly Digests</h1>
        <p className="text-muted-foreground mt-1">Select a tenant to manage digests.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20" />)}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 max-w-7xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-digests-title">Weekly Digests</h1>
          <p className="text-muted-foreground text-sm">Executive coaching summaries</p>
        </div>
        <Button onClick={() => runMutation.mutate()} disabled={runMutation.isPending} data-testid="button-run-digest">
          <Play className="h-4 w-4 mr-2" />
          {runMutation.isPending ? "Generating..." : "Run Now"}
        </Button>
      </div>

      {digests.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground" data-testid="text-no-digests">
              No digests generated yet. Click "Run Now" to generate a weekly executive summary with wins, risks, and recommended next moves.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {digests.map(d => {
            const wins = JSON.parse(d.winsJson || "[]");
            const risks = JSON.parse(d.risksJson || "[]");
            const overdue = JSON.parse(d.overdueActionsJson || "[]");
            return (
              <Card
                key={d.id}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => setViewDigest(d)}
                data-testid={`digest-card-${d.id}`}
              >
                <CardContent className="py-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="h-5 w-5 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{new Date(d.createdAt).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
                      <p className="text-xs text-muted-foreground truncate">{d.summaryText}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className={statusColors.success.badge}>{wins.length} wins</Badge>
                    <Badge variant="outline" className={statusColors.warning.badge}>{risks.length} risks</Badge>
                    {overdue.length > 0 && <Badge variant="outline" className={statusColors.error.badge}>{overdue.length} overdue</Badge>}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!viewDigest} onOpenChange={() => setViewDigest(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Weekly Digest — {viewDigest && new Date(viewDigest.createdAt).toLocaleDateString()}
            </DialogTitle>
          </DialogHeader>
          {viewDigest && (
            <div className="space-y-5">
              {viewDigest.summaryText && (
                <p className="text-sm text-muted-foreground border-l-2 border-primary pl-3">{viewDigest.summaryText}</p>
              )}

              <DigestSection
                icon={Trophy}
                title="Wins"
                items={JSON.parse(viewDigest.winsJson || "[]")}
                emptyText="No wins this period."
                colorClass="text-status-success-foreground"
              />
              <DigestSection
                icon={AlertTriangle}
                title="Risks"
                items={JSON.parse(viewDigest.risksJson || "[]")}
                emptyText="No risks identified."
                colorClass="text-status-warning-foreground"
              />
              <DigestSection
                icon={Ban}
                title="Blocked Actions"
                items={JSON.parse(viewDigest.blockedActionsJson || "[]")}
                emptyText="No blocked actions."
                colorClass="text-status-error-foreground"
              />
              <DigestSection
                icon={Clock}
                title="Overdue Actions"
                items={JSON.parse(viewDigest.overdueActionsJson || "[]")}
                emptyText="No overdue actions."
                colorClass="text-status-error-foreground"
              />
              <DigestSection
                icon={Lightbulb}
                title="Recommended Next Moves"
                items={JSON.parse(viewDigest.recommendedMovesJson || "[]")}
                emptyText="No recommendations at this time."
                colorClass="text-primary"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DigestSection({ icon: Icon, title, items, emptyText, colorClass }: {
  icon: any;
  title: string;
  items: string[];
  emptyText: string;
  colorClass: string;
}) {
  return (
    <div>
      <h3 className="text-sm font-medium flex items-center gap-2 mb-2">
        <Icon className={`h-4 w-4 ${colorClass}`} />
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground pl-6">{emptyText}</p>
      ) : (
        <ul className="space-y-1 pl-6">
          {items.map((item, idx) => (
            <li key={idx} className="text-sm flex items-start gap-2" data-testid={`digest-${title.toLowerCase().replace(/ /g, "-")}-${idx}`}>
              <span className="text-muted-foreground shrink-0">•</span>
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
