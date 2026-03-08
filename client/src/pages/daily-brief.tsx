import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTenantStore } from "@/lib/tenant-store";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  bandBadgeStyles,
  severityColors,
  scoreColor,
  deltaTrendColor,
} from "@/lib/semantic-colors";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Lightbulb,
  ListChecks,
  ArrowRight,
  CheckCircle2,
  Clock,
  Shield,
  Zap,
  MapPin,
  CalendarClock,
} from "lucide-react";
import { Link } from "wouter";
import { exportToPDF } from "@/lib/export-utils";
import { Download, Loader2 } from "lucide-react";

interface DailyBriefData {
  score: {
    totalScore: number | null;
    band: string | null;
    scoreDelta: number | null;
    trendDirection: "up" | "down" | "flat" | null;
    priorScore: number | null;
  } | null;
  topRisks: Array<{
    id: number;
    locationId: number;
    locationName: string | null;
    metricDefinitionId: number;
    riskScore: number;
    trendSlope: number;
    earlyWarnings: unknown;
    computedAt: string | null;
  }>;
  topOpportunities: Array<{
    id: number;
    title: string;
    description: string | null;
    impactScore: string;
    locationId: number | null;
    locationName: string | null;
    priority: string | null;
    confidenceScore: number | null;
  }>;
  topActions: Array<{
    id: number;
    title: string;
    description: string | null;
    status: string;
    priority: string | null;
    dueDate: string | null;
    locationId: number | null;
    locationName: string | null;
    ownerUserId: string | null;
  }>;
  lastUpdated: string | null;
}

function riskLevel(score: number): string {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 30) return "medium";
  return "low";
}

function TrendIcon({ direction, isMobile }: { direction: "up" | "down" | "flat" | null; isMobile?: boolean }) {
  const size = isMobile ? "h-6 w-6" : "h-5 w-5";
  if (direction === "up") return <TrendingUp className={size} />;
  if (direction === "down") return <TrendingDown className={size} />;
  return <Minus className={size} />;
}

function priorityBadgeStyle(priority: string | null): string {
  switch (priority) {
    case "critical":
      return severityColors.critical;
    case "high":
      return severityColors.high;
    case "medium":
      return severityColors.medium;
    case "low":
      return severityColors.low;
    default:
      return "bg-secondary text-secondary-foreground";
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatTimestamp(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const d = new Date(dateStr);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function DailyBriefPage() {
  const { activeTenantId } = useTenantStore();
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const isMobile = useIsMobile();

  async function handleExportPDF() {
    setExporting(true);
    try {
      await exportToPDF("daily-brief-content", `daily-brief-${new Date().toISOString().split("T")[0]}`);
      toast({ title: "PDF exported successfully" });
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  const { data: briefResponse, isLoading } = useQuery<{ ok: boolean; data: DailyBriefData }>({
    queryKey: ["/api/v1/tenants", activeTenantId, "daily-brief"],
    enabled: !!activeTenantId,
  });

  const markDoneMutation = useMutation({
    mutationFn: async (actionId: number) => {
      const res = await apiRequest("PATCH", `/api/tenants/${activeTenantId}/actions/${actionId}`, {
        status: "done",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/tenants", activeTenantId, "daily-brief"] });
      toast({ title: "Action marked as done" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update action", description: err.message, variant: "destructive" });
    },
  });

  const convertToActionMutation = useMutation({
    mutationFn: async (opp: { title: string; description: string | null; locationId: number | null }) => {
      const res = await apiRequest("POST", `/api/tenants/${activeTenantId}/actions`, {
        tenantId: activeTenantId,
        title: `[Opportunity] ${opp.title}`,
        description: opp.description || "",
        status: "open",
        priority: "medium",
        locationId: opp.locationId,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/tenants", activeTenantId, "daily-brief"] });
      toast({ title: "Action created from opportunity" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create action", description: err.message, variant: "destructive" });
    },
  });

  const brief = briefResponse?.data;

  if (!activeTenantId) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[50vh]" data-testid="brief-no-tenant">
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <Shield className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">Select a tenant to view your daily brief.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={`${isMobile ? "p-3" : "p-6"} space-y-6`} data-testid="brief-loading">
        <Skeleton className="h-40 w-full" />
        <div className={`grid grid-cols-1 ${isMobile ? "" : "md:grid-cols-2 lg:grid-cols-3"} gap-4`}>
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  return (
    <div className={`${isMobile ? "p-3 space-y-4" : "p-6 space-y-6"} max-w-5xl mx-auto`} data-testid="page-daily-brief">
      <div className="flex items-center justify-end">
        <Button
          variant="outline"
          size={isMobile ? "default" : "sm"}
          onClick={handleExportPDF}
          disabled={exporting}
          className={isMobile ? "w-full min-h-[44px]" : ""}
          data-testid="button-export-pdf"
        >
          {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
          Export PDF
        </Button>
      </div>
      <div id="daily-brief-content">
      <HeroScore score={brief?.score ?? null} isMobile={isMobile} />

      {isMobile ? (
        <div className="space-y-4 mt-4">
          <SwipeableCardRow>
            <RisksSection risks={brief?.topRisks ?? []} isMobile={isMobile} />
            <OpportunitiesSection
              opportunities={brief?.topOpportunities ?? []}
              onConvert={(opp) => convertToActionMutation.mutate(opp)}
              isConverting={convertToActionMutation.isPending}
              isMobile={isMobile}
            />
            <ActionsSection
              actions={brief?.topActions ?? []}
              onMarkDone={(id) => markDoneMutation.mutate(id)}
              isMarkingDone={markDoneMutation.isPending}
              isMobile={isMobile}
            />
          </SwipeableCardRow>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <RisksSection risks={brief?.topRisks ?? []} isMobile={false} />
          <OpportunitiesSection
            opportunities={brief?.topOpportunities ?? []}
            onConvert={(opp) => convertToActionMutation.mutate(opp)}
            isConverting={convertToActionMutation.isPending}
            isMobile={false}
          />
          <ActionsSection
            actions={brief?.topActions ?? []}
            onMarkDone={(id) => markDoneMutation.mutate(id)}
            isMarkingDone={markDoneMutation.isPending}
            isMobile={false}
          />
        </div>
      )}

      <div className={`text-xs text-muted-foreground text-center pt-2 ${isMobile ? "pb-4" : ""}`} data-testid="text-last-updated">
        Last updated: {formatTimestamp(brief?.lastUpdated ?? null)}
      </div>
      </div>
    </div>
  );
}

function SwipeableCardRow({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 -mx-3 px-3"
      style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
      data-testid="swipeable-card-row"
    >
      {Array.isArray(children) ? children.map((child, i) => (
        <div key={i} className="min-w-[85vw] snap-center flex-shrink-0">
          {child}
        </div>
      )) : children}
    </div>
  );
}

function HeroScore({ score, isMobile }: { score: DailyBriefData["score"]; isMobile: boolean }) {
  if (!score || score.totalScore == null) {
    return (
      <Card data-testid="card-hero-score-empty">
        <CardContent className={`${isMobile ? "p-5" : "p-8"} text-center space-y-3`}>
          <Zap className={`${isMobile ? "h-12 w-12" : "h-10 w-10"} mx-auto text-muted-foreground`} />
          <h2 className={`${isMobile ? "text-xl" : "text-lg"} font-semibold`} data-testid="text-no-score-title">No Score Yet</h2>
          <p className="text-sm text-muted-foreground" data-testid="text-no-score-msg">
            Run a scorecard to see your overall performance score.
          </p>
          <Button asChild variant="default" className={isMobile ? "w-full min-h-[44px]" : ""} data-testid="link-go-scorecards">
            <Link href="/scorecards">
              Go to Scorecards
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const displayScore = Math.round(score.totalScore);
  const bandLabel = score.band || "unknown";
  const bandStyle = bandBadgeStyles[bandLabel] || "bg-secondary text-secondary-foreground";

  return (
    <Card data-testid="card-hero-score">
      <CardContent className={isMobile ? "p-5" : "p-6"}>
        <div className={`flex ${isMobile ? "flex-col items-center text-center" : "flex-col sm:flex-row items-center"} gap-4`}>
          <div className="flex flex-col items-center gap-2">
            <span
              className={`${isMobile ? "text-6xl" : "text-5xl"} font-bold tabular-nums ${scoreColor(displayScore)}`}
              data-testid="text-overall-score"
            >
              {displayScore}
            </span>
            <Badge className={bandStyle} data-testid="badge-score-band">
              {bandLabel}
            </Badge>
          </div>

          {score.trendDirection && score.scoreDelta != null && (
            <div className={`flex items-center gap-2 ${isMobile ? "justify-center" : ""}`} data-testid="trend-indicator">
              <span className={deltaTrendColor(score.scoreDelta)}>
                <TrendIcon direction={score.trendDirection} isMobile={isMobile} />
              </span>
              <div className="flex flex-col">
                <span
                  className={`${isMobile ? "text-base" : "text-sm"} font-medium ${deltaTrendColor(score.scoreDelta)}`}
                  data-testid="text-score-delta"
                >
                  {score.scoreDelta > 0 ? "+" : ""}
                  {score.scoreDelta.toFixed(1)} pts
                </span>
                <span className={`${isMobile ? "text-sm" : "text-xs"} text-muted-foreground`} data-testid="text-prior-score">
                  vs prior: {score.priorScore != null ? Math.round(score.priorScore) : "N/A"}
                </span>
              </div>
            </div>
          )}

          {!isMobile && <div className="flex-1" />}

          <div className={`text-sm text-muted-foreground ${isMobile ? "" : "hidden sm:block"}`}>
            Overall Performance Score
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RisksSection({ risks, isMobile }: { risks: DailyBriefData["topRisks"]; isMobile: boolean }) {
  return (
    <Card data-testid="card-top-risks">
      <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
        <CardTitle className={`${isMobile ? "text-base" : "text-sm"} font-semibold flex items-center gap-2`}>
          <AlertTriangle className={`${isMobile ? "h-5 w-5" : "h-4 w-4"} text-status-error`} />
          Top Risks
        </CardTitle>
        <Button variant="ghost" size={isMobile ? "default" : "sm"} asChild className={isMobile ? "min-h-[44px]" : ""} data-testid="link-view-all-risks">
          <Link href="/risk">View All</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {risks.length === 0 ? (
          <div className="text-center py-6 space-y-2" data-testid="risks-empty-state">
            <Shield className="h-8 w-8 mx-auto text-status-success-foreground" />
            <p className="text-sm text-muted-foreground">No risks detected — great!</p>
          </div>
        ) : (
          risks.map((risk) => {
            const level = riskLevel(risk.riskScore);
            const badgeStyle = severityColors[level as keyof typeof severityColors] || "";
            return (
              <div
                key={risk.id}
                className={`flex items-start justify-between gap-2 ${isMobile ? "py-3 min-h-[44px]" : "py-2"} border-b last:border-b-0`}
                data-testid={`risk-item-${risk.id}`}
              >
                <div className="flex flex-col gap-1 min-w-0">
                  {risk.locationName && (
                    <span className={`${isMobile ? "text-sm" : "text-xs"} text-muted-foreground flex items-center gap-1`} data-testid={`risk-location-${risk.id}`}>
                      <MapPin className={`${isMobile ? "h-4 w-4" : "h-3 w-3"}`} />
                      {risk.locationName}
                    </span>
                  )}
                  <span className={`${isMobile ? "text-base" : "text-sm"} font-medium`} data-testid={`risk-score-${risk.id}`}>
                    Risk Score: {Math.round(risk.riskScore)}
                  </span>
                </div>
                <Badge className={badgeStyle} data-testid={`badge-risk-severity-${risk.id}`}>
                  {level}
                </Badge>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function OpportunitiesSection({
  opportunities,
  onConvert,
  isConverting,
  isMobile,
}: {
  opportunities: DailyBriefData["topOpportunities"];
  onConvert: (opp: { title: string; description: string | null; locationId: number | null }) => void;
  isConverting: boolean;
  isMobile: boolean;
}) {
  return (
    <Card data-testid="card-top-opportunities">
      <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
        <CardTitle className={`${isMobile ? "text-base" : "text-sm"} font-semibold flex items-center gap-2`}>
          <Lightbulb className={`${isMobile ? "h-5 w-5" : "h-4 w-4"} text-status-warning-foreground`} />
          Top Opportunities
        </CardTitle>
        <Button variant="ghost" size={isMobile ? "default" : "sm"} asChild className={isMobile ? "min-h-[44px]" : ""} data-testid="link-view-all-opportunities">
          <Link href="/actions">View All</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {opportunities.length === 0 ? (
          <div className="text-center py-6 space-y-2" data-testid="opportunities-empty-state">
            <Lightbulb className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No open opportunities right now.</p>
          </div>
        ) : (
          opportunities.map((opp) => (
            <div
              key={opp.id}
              className={`flex flex-col gap-2 ${isMobile ? "py-3" : "py-2"} border-b last:border-b-0`}
              data-testid={`opportunity-item-${opp.id}`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className={`${isMobile ? "text-base" : "text-sm"} font-medium`} data-testid={`opportunity-title-${opp.id}`}>
                  {opp.title}
                </span>
                <Badge
                  className={priorityBadgeStyle(opp.impactScore)}
                  data-testid={`badge-impact-${opp.id}`}
                >
                  {opp.impactScore}
                </Badge>
              </div>
              {!isMobile && opp.locationName && (
                <span className="text-xs text-muted-foreground flex items-center gap-1" data-testid={`opportunity-location-${opp.id}`}>
                  <MapPin className="h-3 w-3" />
                  {opp.locationName}
                </span>
              )}
              <Button
                variant="outline"
                size={isMobile ? "default" : "sm"}
                onClick={() =>
                  onConvert({ title: opp.title, description: opp.description, locationId: opp.locationId })
                }
                disabled={isConverting}
                className={isMobile ? "w-full min-h-[44px]" : ""}
                data-testid={`button-convert-action-${opp.id}`}
              >
                <ArrowRight className="mr-1 h-3 w-3" />
                Convert to Action
              </Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function ActionsSection({
  actions,
  onMarkDone,
  isMarkingDone,
  isMobile,
}: {
  actions: DailyBriefData["topActions"];
  onMarkDone: (id: number) => void;
  isMarkingDone: boolean;
  isMobile: boolean;
}) {
  return (
    <Card data-testid="card-do-this-next">
      <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
        <CardTitle className={`${isMobile ? "text-base" : "text-sm"} font-semibold flex items-center gap-2`}>
          <ListChecks className={`${isMobile ? "h-5 w-5" : "h-4 w-4"} text-primary`} />
          Do This Next
        </CardTitle>
        <Button variant="ghost" size={isMobile ? "default" : "sm"} asChild className={isMobile ? "min-h-[44px]" : ""} data-testid="link-view-all-actions">
          <Link href="/actions">View All</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {actions.length === 0 ? (
          <div className="text-center py-6 space-y-2" data-testid="actions-empty-state">
            <CheckCircle2 className="h-8 w-8 mx-auto text-status-success-foreground" />
            <p className="text-sm text-muted-foreground">All caught up — no pending actions!</p>
          </div>
        ) : (
          actions.map((action) => (
            <div
              key={action.id}
              className={`flex flex-col gap-2 ${isMobile ? "py-3" : "py-2"} border-b last:border-b-0`}
              data-testid={`action-item-${action.id}`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className={`${isMobile ? "text-base" : "text-sm"} font-medium`} data-testid={`action-title-${action.id}`}>
                  {action.title}
                </span>
                <Badge
                  className={priorityBadgeStyle(action.priority)}
                  data-testid={`badge-action-priority-${action.id}`}
                >
                  {action.priority || "medium"}
                </Badge>
              </div>
              {!isMobile && (
                <div className="flex items-center gap-3 flex-wrap">
                  <Badge
                    variant="outline"
                    data-testid={`badge-action-status-${action.id}`}
                  >
                    {action.status === "in_progress" ? "In Progress" : "Open"}
                  </Badge>
                  {action.dueDate && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1" data-testid={`action-due-${action.id}`}>
                      <CalendarClock className="h-3 w-3" />
                      Due {formatDate(action.dueDate)}
                    </span>
                  )}
                  {action.locationName && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1" data-testid={`action-location-${action.id}`}>
                      <MapPin className="h-3 w-3" />
                      {action.locationName}
                    </span>
                  )}
                </div>
              )}
              {isMobile && action.dueDate && (
                <span className="text-sm text-muted-foreground flex items-center gap-1" data-testid={`action-due-${action.id}`}>
                  <CalendarClock className="h-4 w-4" />
                  Due {formatDate(action.dueDate)}
                </span>
              )}
              <Button
                variant="outline"
                size={isMobile ? "default" : "sm"}
                onClick={() => onMarkDone(action.id)}
                disabled={isMarkingDone}
                className={isMobile ? "w-full min-h-[44px]" : ""}
                data-testid={`button-mark-done-${action.id}`}
              >
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Mark Done
              </Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
