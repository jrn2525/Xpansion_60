import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  CalendarOff,
  CheckCircle2,
  PauseCircle,
  Sparkles,
  Loader2,
  Trophy,
  ArrowRight,
} from "lucide-react";

type ScheduleResult =
  | { status: "before_start"; startDate: string }
  | { status: "weekend" }
  | { status: "paused"; pauseUntil: string | null }
  | { status: "complete" }
  | { status: "active"; weekNumber: number; dayNumber: number; weekdaysElapsed: number };

interface TodayResponse {
  enrollment: { id: number; startDate: string; programId: number } | null;
  program: {
    id: number;
    name: string;
    totalWeekdays: number;
    totalWeeks: number;
    feedbackRequired: boolean;
    reflectionRequired: boolean;
    reflectionPrompt: string;
    completionMessage: string | null;
    ctaLabel: string | null;
    ctaUrl: string | null;
  } | null;
  schedule: ScheduleResult | null;
  step: {
    id: number;
    title: string;
    taskText: string | null;
    implementationText: string | null;
    mediaUrl: string | null;
    weekNumber: number | null;
    dayNumber: number | null;
    sectionId: number | null;
  } | null;
  section: { id: number; name: string; order: number; startDay: number; endDay: number } | null;
  action: {
    id: number;
    status: string;
    feedbackText: string | null;
    completedAt: string | null;
  } | null;
}

export default function ClientTodayPage() {
  const { toast } = useToast();
  const [feedback, setFeedback] = useState("");

  const { data, isLoading } = useQuery<TodayResponse>({
    queryKey: ["/api/client/today"],
  });

  // When the server's action has feedback already, populate the textarea
  useEffect(() => {
    if (data?.action?.feedbackText && !feedback) {
      setFeedback(data.action.feedbackText);
    }
  }, [data?.action?.feedbackText, feedback]);

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!data?.enrollment || !data?.step) return;
      const res = await apiRequest("POST", "/api/client/today/complete", {
        enrollmentId: data.enrollment.id,
        stepId: data.step.id,
        feedbackText: feedback,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/client/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/client/history"] });
      toast({ title: "Task marked complete" });
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't save",
        description: e?.message ?? "Try again",
        variant: "destructive",
      }),
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-2xl space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const { enrollment, program, schedule, step, section, action } = data ?? {};

  if (!enrollment || !program || !schedule) {
    return (
      <EmptyState
        icon={<CalendarOff className="h-12 w-12 text-muted-foreground" />}
        title="You're not enrolled in a program yet"
        body="Your coach will assign you to a program. Once that happens, your daily task will appear here every weekday morning."
      />
    );
  }

  if (schedule.status === "before_start") {
    return (
      <EmptyState
        icon={<Sparkles className="h-12 w-12 text-primary" />}
        title={`Your program starts ${schedule.startDate}`}
        body={`${program.name} is ready to go. Your first daily task will appear on this screen on the start date.`}
      />
    );
  }

  if (schedule.status === "paused") {
    return (
      <EmptyState
        icon={<PauseCircle className="h-12 w-12 text-amber-500" />}
        title="Your program is paused"
        body={
          schedule.pauseUntil
            ? `Daily tasks will resume on ${schedule.pauseUntil}.`
            : "Daily tasks will resume when your coach lifts the pause."
        }
      />
    );
  }

  if (schedule.status === "weekend") {
    return (
      <EmptyState
        icon={<Sparkles className="h-12 w-12 text-primary" />}
        title="Enjoy the weekend"
        body="No daily task today. Your next task lands Monday morning."
      />
    );
  }

  if (schedule.status === "complete") {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-4 py-10">
          <Trophy className="h-16 w-16 mx-auto text-primary" />
          <h1 className="text-3xl font-semibold">You finished {program.name}!</h1>
          {program.completionMessage && (
            <p className="text-muted-foreground whitespace-pre-line">
              {program.completionMessage}
            </p>
          )}
        </div>
        {program.ctaLabel && program.ctaUrl && (
          <div className="text-center">
            <Button asChild size="lg">
              <a href={program.ctaUrl} target="_blank" rel="noreferrer">
                {program.ctaLabel}
                <ArrowRight className="h-4 w-4 ml-2" />
              </a>
            </Button>
          </div>
        )}
        <div className="text-center">
          <Button asChild variant="ghost">
            <Link href="/history">View your full journey</Link>
          </Button>
        </div>
      </div>
    );
  }

  // schedule.status === "active"
  if (!step) {
    return (
      <EmptyState
        icon={<CalendarOff className="h-12 w-12 text-muted-foreground" />}
        title="Today's task isn't ready yet"
        body="Your coach hasn't filled in this day's task. Check back later or reach out to them."
      />
    );
  }

  const alreadyDone = action?.status === "closed";
  const feedbackRequired = program.feedbackRequired;
  const canSubmit = feedbackRequired ? feedback.trim().length > 0 : true;
  const dayNumber = (schedule.weekNumber - 1) * 5 + schedule.dayNumber;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {section && (
            <span>
              Section {section.order}: <strong>{section.name}</strong>
            </span>
          )}
          <span>·</span>
          <span>
            Day {dayNumber} of {program.totalWeekdays}
          </span>
          <span>·</span>
          <span>
            Week {schedule.weekNumber} / Day {schedule.dayNumber}
          </span>
        </div>
        <h1 className="text-3xl font-semibold mt-2">Today</h1>
      </div>

      {alreadyDone && (
        <div className="rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 p-4 flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-medium">You already completed today's task</div>
            <div className="text-sm opacity-80">
              You can update your feedback below if you want to add more thoughts.
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs uppercase tracking-wide">
              1 · Task
            </Badge>
            <span className="text-sm text-muted-foreground">What to do today</span>
          </div>
        </CardHeader>
        <CardContent>
          {step.taskText ? (
            <p className="whitespace-pre-line text-base leading-relaxed">
              {step.taskText}
            </p>
          ) : (
            <p className="text-muted-foreground italic">
              Your coach hasn't written today's task yet.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs uppercase tracking-wide">
              2 · Implementation
            </Badge>
            <span className="text-sm text-muted-foreground">How to do it</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {step.implementationText ? (
            <p className="whitespace-pre-line text-base leading-relaxed">
              {step.implementationText}
            </p>
          ) : (
            <p className="text-muted-foreground italic">
              No implementation notes today — improvise.
            </p>
          )}
          {step.mediaUrl && (
            <a
              href={step.mediaUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline text-sm"
            >
              View attached media
              <ArrowRight className="h-3 w-3" />
            </a>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs uppercase tracking-wide">
              3 · Feedback
            </Badge>
            <span className="text-sm text-muted-foreground">
              What happened when you did it
              {feedbackRequired && " (required)"}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="How did it go? What did you notice? What surprised you?"
            rows={6}
            data-testid="input-feedback"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {alreadyDone && action?.completedAt
                ? `Last saved ${new Date(action.completedAt).toLocaleString()}`
                : feedbackRequired
                  ? "All three sections must be filled in to mark complete."
                  : "You can submit without feedback if you want to."}
            </p>
            <Button
              onClick={() => completeMutation.mutate()}
              disabled={!canSubmit || completeMutation.isPending}
              data-testid="button-mark-complete"
            >
              {completeMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {alreadyDone ? "Update" : "Mark complete"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="p-6 max-w-xl mx-auto">
      <div className="text-center space-y-4 py-16">
        <div className="flex justify-center">{icon}</div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
