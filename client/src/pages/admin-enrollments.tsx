import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTenantStore } from "@/lib/tenant-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
import { ClipboardList, Plus, Loader2, Pause, Play } from "lucide-react";

type ScheduleStatus =
  | { status: "before_start"; startDate: string }
  | { status: "weekend" }
  | { status: "paused"; pauseUntil: string | null }
  | { status: "complete" }
  | { status: "active"; weekNumber: number; dayNumber: number; weekdaysElapsed: number };

interface Enrollment {
  id: number;
  playbookId: number;
  enrolledUserId: string | null;
  startDate: string | null;
  status: string;
  completedAt: string | null;
  createdAt: string | null;
  programName: string;
  totalWeekdays: number;
  clientEmail: string | null;
  clientFirstName: string | null;
  clientLastName: string | null;
  schedule: ScheduleStatus;
  pauseCount: number;
  activePause: { pauseStart: string; pauseEnd: string | null } | null;
}

interface Program {
  id: number;
  name: string;
  totalWeekdays: number;
}

interface AppUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  isSuperAdmin: string | null;
}

function clientName(e: { clientFirstName: string | null; clientLastName: string | null; clientEmail: string | null }) {
  const first = e.clientFirstName?.trim();
  const last = e.clientLastName?.trim();
  if (first || last) return [first, last].filter(Boolean).join(" ");
  return e.clientEmail ?? "Unknown";
}

function userLabel(u: AppUser) {
  const first = u.firstName?.trim();
  const last = u.lastName?.trim();
  if (first || last) return `${[first, last].filter(Boolean).join(" ")} (${u.email})`;
  return u.email ?? u.id;
}

function ScheduleBadge({ schedule, active }: { schedule: ScheduleStatus; active: { pauseEnd: string | null } | null }) {
  switch (schedule.status) {
    case "before_start":
      return <Badge variant="outline">Starts {schedule.startDate}</Badge>;
    case "weekend":
      return <Badge variant="secondary">Weekend</Badge>;
    case "paused":
      return (
        <Badge variant="outline" className="border-amber-500 text-amber-600">
          Paused{active?.pauseEnd ? ` until ${active.pauseEnd}` : ""}
        </Badge>
      );
    case "complete":
      return <Badge variant="secondary">Complete</Badge>;
    case "active":
      return (
        <Badge>
          Week {schedule.weekNumber} · Day {schedule.dayNumber}
        </Badge>
      );
  }
}

export default function AdminEnrollmentsPage() {
  const { toast } = useToast();
  const { activeTenantId } = useTenantStore();

  const [showEnroll, setShowEnroll] = useState(false);
  const [newUserId, setNewUserId] = useState<string>("");
  const [newProgramId, setNewProgramId] = useState<string>("");
  const [newStartDate, setNewStartDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );

  const [pausingEnrollment, setPausingEnrollment] = useState<Enrollment | null>(null);
  const [pauseStart, setPauseStart] = useState<string>(new Date().toISOString().slice(0, 10));
  const [pauseEnd, setPauseEnd] = useState<string>("");
  const [pauseReason, setPauseReason] = useState<string>("");

  const { data: enrollments, isLoading } = useQuery<Enrollment[]>({
    queryKey: ["/api/admin/enrollments", `?tenantId=${activeTenantId}`],
    enabled: !!activeTenantId,
  });

  const { data: programs } = useQuery<Program[]>({
    queryKey: ["/api/admin/programs", `?tenantId=${activeTenantId}`],
    enabled: !!activeTenantId,
  });

  const { data: allUsers } = useQuery<AppUser[]>({
    queryKey: ["/api/admin/users"],
  });

  const clientUsers = useMemo(
    () => (allUsers ?? []).filter((u) => u.isSuperAdmin !== "true"),
    [allUsers],
  );

  const enrollMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/enrollments", {
        tenantId: activeTenantId,
        playbookId: Number(newProgramId),
        enrolledUserId: newUserId,
        startDate: newStartDate,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/enrollments"] });
      toast({ title: "Client enrolled" });
      setShowEnroll(false);
      setNewUserId("");
      setNewProgramId("");
    },
    onError: (e: any) =>
      toast({ title: "Couldn't enroll", description: e?.message, variant: "destructive" }),
  });

  const pauseMutation = useMutation({
    mutationFn: async () => {
      if (!pausingEnrollment) return;
      const res = await apiRequest(
        "POST",
        `/api/admin/enrollments/${pausingEnrollment.id}/pauses`,
        {
          pauseStart,
          pauseEnd: pauseEnd || null,
          reason: pauseReason || null,
        },
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/enrollments"] });
      toast({ title: "Pause created" });
      setPausingEnrollment(null);
      setPauseEnd("");
      setPauseReason("");
    },
    onError: (e: any) =>
      toast({ title: "Pause failed", description: e?.message, variant: "destructive" }),
  });

  const endPauseMutation = useMutation({
    mutationFn: async (enrollment: Enrollment) => {
      // Find the active pause and end it today
      const detailRes = await fetch(`/api/admin/enrollments/${enrollment.id}`, {
        credentials: "include",
      });
      const detail = await detailRes.json();
      const active = detail.data.pauses.find(
        (p: any) =>
          !p.pauseEnd ||
          p.pauseEnd >= new Date().toISOString().slice(0, 10),
      );
      if (!active) throw new Error("No active pause found");
      const today = new Date().toISOString().slice(0, 10);
      const res = await apiRequest(
        "PUT",
        `/api/admin/enrollments/${enrollment.id}/pauses/${active.id}`,
        { pauseEnd: today },
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/enrollments"] });
      toast({ title: "Pause ended" });
    },
    onError: (e: any) =>
      toast({ title: "Couldn't end pause", description: e?.message, variant: "destructive" }),
  });

  if (!activeTenantId) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">No active workspace selected.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-6 w-6" />
          <div>
            <h1 className="text-2xl font-semibold">Enrollments</h1>
            <p className="text-sm text-muted-foreground">
              Assign clients to coaching programs, monitor progress, and pause schedules.
            </p>
          </div>
        </div>
        <Button
          onClick={() => setShowEnroll(true)}
          disabled={!programs?.length || !clientUsers.length}
          data-testid="button-new-enrollment"
        >
          <Plus className="h-4 w-4 mr-2" />
          New enrollment
        </Button>
      </div>

      {(!programs || programs.length === 0) && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            You don't have any programs yet. Go to <strong>Programs</strong> and
            create one before enrolling clients.
          </CardContent>
        </Card>
      )}
      {(!clientUsers || clientUsers.length === 0) && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            No client users yet. Go to <strong>Users</strong> to invite a client
            before enrolling them in a program.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All enrollments</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : enrollments && enrollments.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Program</TableHead>
                  <TableHead>Start date</TableHead>
                  <TableHead>Today's status</TableHead>
                  <TableHead>Pauses</TableHead>
                  <TableHead className="w-[140px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrollments.map((e) => {
                  const isPaused = e.schedule.status === "paused";
                  return (
                    <TableRow key={e.id} data-testid={`row-enrollment-${e.id}`}>
                      <TableCell className="font-medium">{clientName(e)}</TableCell>
                      <TableCell>{e.programName}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {e.startDate ?? "—"}
                      </TableCell>
                      <TableCell>
                        <ScheduleBadge schedule={e.schedule} active={e.activePause} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {e.pauseCount > 0 ? `${e.pauseCount} total` : "—"}
                      </TableCell>
                      <TableCell>
                        {isPaused ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => endPauseMutation.mutate(e)}
                            disabled={endPauseMutation.isPending}
                            data-testid={`button-end-pause-${e.id}`}
                          >
                            <Play className="h-4 w-4 mr-1" />
                            Resume
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setPausingEnrollment(e);
                              setPauseStart(new Date().toISOString().slice(0, 10));
                            }}
                            data-testid={`button-pause-${e.id}`}
                          >
                            <Pause className="h-4 w-4 mr-1" />
                            Pause
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="py-10 text-center text-muted-foreground">
              No enrollments yet. Click <strong>New enrollment</strong> to assign a
              client to a program.
            </div>
          )}
        </CardContent>
      </Card>

      {/* New enrollment dialog */}
      <Dialog open={showEnroll} onOpenChange={setShowEnroll}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New enrollment</DialogTitle>
            <DialogDescription>
              Assign a client to a program. They'll start seeing daily tasks on the
              chosen start date (weekdays only).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="enroll-client">Client</Label>
              <Select value={newUserId} onValueChange={setNewUserId}>
                <SelectTrigger id="enroll-client" data-testid="select-client">
                  <SelectValue placeholder="Pick a client" />
                </SelectTrigger>
                <SelectContent>
                  {clientUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {userLabel(u)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="enroll-program">Program</Label>
              <Select value={newProgramId} onValueChange={setNewProgramId}>
                <SelectTrigger id="enroll-program" data-testid="select-program">
                  <SelectValue placeholder="Pick a program" />
                </SelectTrigger>
                <SelectContent>
                  {(programs ?? []).map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name} ({p.totalWeekdays} weekdays)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="enroll-start">Start date</Label>
              <Input
                id="enroll-start"
                type="date"
                value={newStartDate}
                onChange={(e) => setNewStartDate(e.target.value)}
                data-testid="input-start-date"
              />
              <p className="text-xs text-muted-foreground">
                Day 1 is the first weekday on or after this date.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowEnroll(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => enrollMutation.mutate()}
              disabled={
                !newUserId ||
                !newProgramId ||
                !newStartDate ||
                enrollMutation.isPending
              }
              data-testid="button-confirm-enroll"
            >
              {enrollMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Enroll
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pause dialog */}
      <Dialog
        open={!!pausingEnrollment}
        onOpenChange={(open) => !open && setPausingEnrollment(null)}
      >
        {pausingEnrollment && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Pause {clientName(pausingEnrollment)}'s schedule</DialogTitle>
              <DialogDescription>
                Their daily emails stop and the dashboard shows "Paused" until the
                end date. When they resume, the schedule shifts forward by exactly
                the paused weekdays.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="pause-start">Pause starts</Label>
                <Input
                  id="pause-start"
                  type="date"
                  value={pauseStart}
                  onChange={(e) => setPauseStart(e.target.value)}
                  data-testid="input-pause-start"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pause-end">Pause ends (leave blank for open-ended)</Label>
                <Input
                  id="pause-end"
                  type="date"
                  value={pauseEnd}
                  onChange={(e) => setPauseEnd(e.target.value)}
                  data-testid="input-pause-end"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pause-reason">Reason (optional)</Label>
                <Input
                  id="pause-reason"
                  value={pauseReason}
                  onChange={(e) => setPauseReason(e.target.value)}
                  placeholder="Vacation, illness, etc."
                  data-testid="input-pause-reason"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setPausingEnrollment(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => pauseMutation.mutate()}
                disabled={!pauseStart || pauseMutation.isPending}
                data-testid="button-confirm-pause"
              >
                {pauseMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Pause
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
