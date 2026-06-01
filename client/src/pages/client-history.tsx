import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { CalendarOff, History, ArrowRight } from "lucide-react";

interface HistoryItem {
  actionId: number;
  feedbackText: string | null;
  completedAt: string | null;
  stepId: number;
  stepTitle: string;
  taskText: string | null;
  implementationText: string | null;
  mediaUrl: string | null;
  weekNumber: number | null;
  dayNumber: number | null;
  sectionId: number | null;
  sectionName: string | null;
}

interface HistoryResponse {
  enrollment: { id: number; programId: number; startDate: string | null } | null;
  items: HistoryItem[];
}

export default function ClientHistoryPage() {
  const { data, isLoading } = useQuery<HistoryResponse>({
    queryKey: ["/api/client/history"],
  });

  const grouped = useMemo(() => {
    if (!data?.items?.length) return [];
    // Group by sectionName (preserve insertion order — items come back sorted by completedAt desc)
    const map = new Map<string, HistoryItem[]>();
    for (const item of data.items) {
      const key = item.sectionName ?? "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    // Within each section, group by week
    return Array.from(map.entries()).map(([sectionName, items]) => {
      const byWeek = new Map<number, HistoryItem[]>();
      for (const item of items) {
        const w = item.weekNumber ?? 0;
        if (!byWeek.has(w)) byWeek.set(w, []);
        byWeek.get(w)!.push(item);
      }
      return {
        sectionName,
        weeks: Array.from(byWeek.entries())
          .sort((a, b) => b[0] - a[0])
          .map(([weekNumber, tasks]) => ({ weekNumber, tasks })),
      };
    });
  }, [data]);

  if (isLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!data?.enrollment || data.items.length === 0) {
    return (
      <div className="p-6 max-w-xl mx-auto">
        <div className="text-center space-y-4 py-16">
          <CalendarOff className="h-12 w-12 mx-auto text-muted-foreground" />
          <h1 className="text-2xl font-semibold">No history yet</h1>
          <p className="text-muted-foreground">
            Completed daily tasks will appear here, organized by section and week.
            Head to <strong>Today</strong> to log your first one.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <History className="h-6 w-6" />
        <div>
          <h1 className="text-2xl font-semibold">History</h1>
          <p className="text-sm text-muted-foreground">
            Everything you've completed, most recent first.
          </p>
        </div>
      </div>

      {grouped.map((group) => (
        <div key={group.sectionName} className="space-y-3">
          <h2 className="text-lg font-semibold text-muted-foreground uppercase tracking-wide">
            {group.sectionName}
          </h2>
          {group.weeks.map(({ weekNumber, tasks }) => (
            <Card key={`${group.sectionName}-${weekNumber}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Week {weekNumber}
                  <span className="ml-2 text-xs text-muted-foreground font-normal">
                    {tasks.length} task{tasks.length === 1 ? "" : "s"}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {tasks
                  .sort((a, b) => (a.dayNumber ?? 0) - (b.dayNumber ?? 0))
                  .map((t) => (
                    <div
                      key={t.actionId}
                      className="border rounded-md p-4 space-y-3"
                      data-testid={`history-item-${t.actionId}`}
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">Day {t.dayNumber}</Badge>
                        {t.completedAt && (
                          <span className="text-xs text-muted-foreground">
                            {new Date(t.completedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      {t.taskText && (
                        <div>
                          <div className="text-xs uppercase text-muted-foreground mb-1">
                            Task
                          </div>
                          <p className="whitespace-pre-line text-sm leading-relaxed">
                            {t.taskText}
                          </p>
                        </div>
                      )}
                      {t.implementationText && (
                        <div>
                          <div className="text-xs uppercase text-muted-foreground mb-1">
                            Implementation
                          </div>
                          <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                            {t.implementationText}
                          </p>
                        </div>
                      )}
                      {t.mediaUrl && (
                        <a
                          href={t.mediaUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline text-xs"
                        >
                          View media
                          <ArrowRight className="h-3 w-3" />
                        </a>
                      )}
                      <div>
                        <div className="text-xs uppercase text-muted-foreground mb-1">
                          Your feedback
                        </div>
                        {t.feedbackText ? (
                          <p className="whitespace-pre-line text-sm leading-relaxed">
                            {t.feedbackText}
                          </p>
                        ) : (
                          <p className="text-xs italic text-muted-foreground">
                            No feedback recorded.
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
              </CardContent>
            </Card>
          ))}
        </div>
      ))}
    </div>
  );
}
