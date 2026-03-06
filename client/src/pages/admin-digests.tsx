import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTenantStore } from "@/lib/tenant-store";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  Calendar,
  Save,
  Settings,
  CheckCircle,
  XCircle,
  Loader2,
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

interface DigestSchedule {
  id?: number;
  tenantId: number;
  dayOfWeek: number;
  sendTime: string;
  timezone: string;
  recipientsJson: string;
  isEnabled: boolean;
}

interface DigestSchedulerRun {
  id: number;
  tenantId: number;
  weekKey: string;
  status: string;
  digestId: number | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const TIMEZONE_OPTIONS = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Australia/Sydney",
  "UTC",
];

function getWeekKey(date: Date = new Date()): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dayOfWeek = d.getDay();
  const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  d.setDate(diff);
  return `${d.getFullYear()}-W${String(Math.ceil((((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000) + 1) / 7)).padStart(2, "0")}`;
}

function computeNextRun(schedule: DigestSchedule): string | null {
  if (!schedule.isEnabled) return null;
  const now = new Date();
  const currentDay = now.getDay();
  let daysUntil = schedule.dayOfWeek - currentDay;
  if (daysUntil < 0) daysUntil += 7;
  const [hours, minutes] = schedule.sendTime.split(":").map(Number);
  if (daysUntil === 0) {
    const scheduledTime = new Date(now);
    scheduledTime.setHours(hours, minutes, 0, 0);
    if (scheduledTime > now) {
      return scheduledTime.toLocaleString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    daysUntil = 7;
  }
  const next = new Date(now);
  next.setDate(now.getDate() + daysUntil);
  next.setHours(hours, minutes, 0, 0);
  return next.toLocaleString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminDigestsPage() {
  const { activeTenantId } = useTenantStore();
  const { toast } = useToast();
  const [viewDigest, setViewDigest] = useState<Digest | null>(null);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [scheduleEditing, setScheduleEditing] = useState(false);

  const [editDayOfWeek, setEditDayOfWeek] = useState(1);
  const [editSendTime, setEditSendTime] = useState("09:00");
  const [editTimezone, setEditTimezone] = useState("America/New_York");
  const [editRecipients, setEditRecipients] = useState("");
  const [editIsEnabled, setEditIsEnabled] = useState(false);

  const { data: digestsData, isLoading: digestsLoading } = useQuery<{ ok: boolean; data: Digest[] }>({
    queryKey: ["/api/admin/digests", activeTenantId, "history"],
    enabled: !!activeTenantId,
  });

  const { data: scheduleData, isLoading: scheduleLoading } = useQuery<{ ok: boolean; data: DigestSchedule }>({
    queryKey: ["/api/admin/digests", activeTenantId, "schedule"],
    enabled: !!activeTenantId,
  });

  const { data: runsData, isLoading: runsLoading } = useQuery<{ ok: boolean; data: DigestSchedulerRun[] }>({
    queryKey: ["/api/admin/digests", activeTenantId, "scheduler-runs"],
    enabled: !!activeTenantId,
  });

  const schedule = scheduleData?.data;
  const runs = runsData?.data || [];
  const digests = digestsData?.data || [];

  const currentWeekKey = getWeekKey();
  const thisWeekRun = runs.find(r => r.weekKey === currentWeekKey && r.status === "success");

  const runMutation = useMutation({
    mutationFn: (force: boolean) =>
      apiRequest("POST", `/api/admin/digests/${activeTenantId}/run`, force ? { force: true } : undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/digests", activeTenantId, "history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/digests", activeTenantId, "scheduler-runs"] });
      toast({ title: "Digest generated", description: "Weekly digest has been compiled." });
    },
    onError: (error: any) => {
      if (error.message?.includes("409")) {
        setShowDuplicateWarning(true);
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: (data: { dayOfWeek: number; sendTime: string; timezone: string; recipientsJson: string; isEnabled: boolean }) =>
      apiRequest("PUT", `/api/admin/digests/${activeTenantId}/schedule`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/digests", activeTenantId, "schedule"] });
      setScheduleEditing(false);
      toast({ title: "Schedule saved", description: "Digest schedule has been updated." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  function handleRunNow() {
    if (thisWeekRun) {
      setShowDuplicateWarning(true);
    } else {
      runMutation.mutate(false);
    }
  }

  function handleForceRun() {
    setShowDuplicateWarning(false);
    runMutation.mutate(true);
  }

  function startEditingSchedule() {
    if (schedule) {
      setEditDayOfWeek(schedule.dayOfWeek);
      setEditSendTime(schedule.sendTime);
      setEditTimezone(schedule.timezone);
      setEditRecipients(
        (() => {
          try { return JSON.parse(schedule.recipientsJson).join(", "); } catch { return ""; }
        })()
      );
      setEditIsEnabled(schedule.isEnabled);
    }
    setScheduleEditing(true);
  }

  function handleSaveSchedule() {
    const recipientsArr = editRecipients
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
    scheduleMutation.mutate({
      dayOfWeek: editDayOfWeek,
      sendTime: editSendTime,
      timezone: editTimezone,
      recipientsJson: JSON.stringify(recipientsArr),
      isEnabled: editIsEnabled,
    });
  }

  if (!activeTenantId) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold" data-testid="text-digests-title">Weekly Digests</h1>
        <p className="text-muted-foreground mt-1">Select a tenant to manage digests.</p>
      </div>
    );
  }

  if (digestsLoading || scheduleLoading || runsLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20" />)}
      </div>
    );
  }

  const lastRun = runs.length > 0 ? runs[0] : null;
  const nextRunLabel = schedule ? computeNextRun(schedule) : null;

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-digests-title">Weekly Digests</h1>
          <p className="text-muted-foreground text-sm">Executive coaching summaries &amp; scheduling</p>
        </div>
        <Button onClick={handleRunNow} disabled={runMutation.isPending} data-testid="button-run-digest">
          {runMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
          {runMutation.isPending ? "Generating..." : "Run Now"}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Run</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {lastRun ? (
              <div>
                <p className="text-sm font-medium" data-testid="text-last-run-date">
                  {new Date(lastRun.startedAt).toLocaleString(undefined, {
                    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                  })}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge
                    variant="outline"
                    className={lastRun.status === "success" ? statusColors.success : lastRun.status === "failed" ? statusColors.error : statusColors.warning}
                    data-testid="badge-last-run-status"
                  >
                    {lastRun.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{lastRun.weekKey}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground" data-testid="text-no-last-run">No runs yet</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Next Scheduled Run</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {schedule?.isEnabled && nextRunLabel ? (
              <p className="text-sm font-medium" data-testid="text-next-run">{nextRunLabel}</p>
            ) : (
              <p className="text-sm text-muted-foreground" data-testid="text-next-run-disabled">
                {schedule?.isEnabled ? "Calculating..." : "Schedule disabled"}
              </p>
            )}
            {schedule && (
              <p className="text-xs text-muted-foreground mt-1">
                {DAY_NAMES[schedule.dayOfWeek]}s at {schedule.sendTime} ({schedule.timezone})
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Week</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {thisWeekRun ? (
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-status-success-foreground" />
                <p className="text-sm font-medium" data-testid="text-this-week-status">Digest generated</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground" data-testid="text-this-week-status">Not yet generated</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">{currentWeekKey}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">Schedule Settings</CardTitle>
          {!scheduleEditing && (
            <Button variant="outline" size="sm" onClick={startEditingSchedule} data-testid="button-edit-schedule">
              <Settings className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {scheduleEditing ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Label htmlFor="schedule-enabled" className="text-sm">Enabled</Label>
                <Switch
                  id="schedule-enabled"
                  checked={editIsEnabled}
                  onCheckedChange={setEditIsEnabled}
                  data-testid="switch-schedule-enabled"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2">
                  <Label className="text-sm">Day of Week</Label>
                  <Select
                    value={String(editDayOfWeek)}
                    onValueChange={(v) => setEditDayOfWeek(Number(v))}
                  >
                    <SelectTrigger data-testid="select-day-of-week">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAY_NAMES.map((name, i) => (
                        <SelectItem key={i} value={String(i)}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm">Send Time</Label>
                  <Input
                    type="time"
                    value={editSendTime}
                    onChange={(e) => setEditSendTime(e.target.value)}
                    data-testid="input-send-time"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm">Timezone</Label>
                  <Select value={editTimezone} onValueChange={setEditTimezone}>
                    <SelectTrigger data-testid="select-timezone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONE_OPTIONS.map(tz => (
                        <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Recipients (comma-separated emails)</Label>
                <Input
                  value={editRecipients}
                  onChange={(e) => setEditRecipients(e.target.value)}
                  placeholder="admin@example.com, manager@example.com"
                  data-testid="input-recipients"
                />
              </div>

              <div className="flex gap-2 flex-wrap">
                <Button onClick={handleSaveSchedule} disabled={scheduleMutation.isPending} data-testid="button-save-schedule">
                  {scheduleMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  {scheduleMutation.isPending ? "Saving..." : "Save Schedule"}
                </Button>
                <Button variant="outline" onClick={() => setScheduleEditing(false)} data-testid="button-cancel-schedule">
                  Cancel
                </Button>
              </div>
            </div>
          ) : schedule ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Status</p>
                <Badge variant="outline" className={schedule.isEnabled ? statusColors.success : statusColors.neutral} data-testid="badge-schedule-status">
                  {schedule.isEnabled ? "Enabled" : "Disabled"}
                </Badge>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Day</p>
                <p className="font-medium" data-testid="text-schedule-day">{DAY_NAMES[schedule.dayOfWeek]}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Time</p>
                <p className="font-medium" data-testid="text-schedule-time">{schedule.sendTime} ({schedule.timezone})</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Recipients</p>
                <p className="font-medium" data-testid="text-schedule-recipients">
                  {(() => { try { const r = JSON.parse(schedule.recipientsJson); return r.length > 0 ? r.join(", ") : "None configured"; } catch { return "None configured"; } })()}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No schedule configured yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scheduler Run History</CardTitle>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-runs">No scheduler runs recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Week</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Completed</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map(run => (
                    <TableRow key={run.id} data-testid={`row-scheduler-run-${run.id}`}>
                      <TableCell className="font-mono text-sm" data-testid={`text-run-week-${run.id}`}>{run.weekKey}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={run.status === "success" ? statusColors.success : run.status === "failed" ? statusColors.error : statusColors.warning}
                          data-testid={`badge-run-status-${run.id}`}
                        >
                          {run.status === "success" && <CheckCircle className="h-3 w-3 mr-1" />}
                          {run.status === "failed" && <XCircle className="h-3 w-3 mr-1" />}
                          {run.status === "running" && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                          {run.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(run.startedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {run.completedAt ? new Date(run.completedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "-"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                        {run.errorMessage || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Digest History</CardTitle>
        </CardHeader>
        <CardContent>
          {digests.length === 0 ? (
            <div className="py-6 text-center">
              <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground text-sm" data-testid="text-no-digests">
                No digests generated yet. Click "Run Now" to generate a weekly executive summary.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {digests.map(d => {
                const wins = JSON.parse(d.winsJson || "[]");
                const risks = JSON.parse(d.risksJson || "[]");
                const overdue = JSON.parse(d.overdueActionsJson || "[]");
                return (
                  <div
                    key={d.id}
                    className="flex items-center justify-between gap-4 p-3 rounded-md border cursor-pointer hover-elevate"
                    onClick={() => setViewDigest(d)}
                    data-testid={`digest-card-${d.id}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="h-5 w-5 text-primary shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{new Date(d.createdAt).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
                        <p className="text-xs text-muted-foreground truncate">{d.summaryText}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      <Badge variant="outline" className={statusColors.success}>{wins.length} wins</Badge>
                      <Badge variant="outline" className={statusColors.warning}>{risks.length} risks</Badge>
                      {overdue.length > 0 && <Badge variant="outline" className={statusColors.error}>{overdue.length} overdue</Badge>}
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

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

      <AlertDialog open={showDuplicateWarning} onOpenChange={setShowDuplicateWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Digest Already Generated</AlertDialogTitle>
            <AlertDialogDescription>
              A digest has already been generated for the current week ({currentWeekKey}). Running again will create a duplicate digest for this week.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-force-run">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleForceRun} data-testid="button-force-run">
              Generate Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
