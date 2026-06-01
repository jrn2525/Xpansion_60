import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ArrowLeft, Loader2, Save, Settings2, Pencil } from "lucide-react";

interface Program {
  id: number;
  tenantId: number;
  name: string;
  description: string | null;
  isActive: boolean;
  isArchived: boolean;
  totalWeeks: number;
  totalWeekdays: number;
  feedbackRequired: boolean;
  reflectionRequired: boolean;
  reflectionPrompt: string;
  completionMessage: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
}

interface Section {
  id: number;
  playbookId: number;
  order: number;
  name: string;
  startDay: number;
  endDay: number;
  transitionEmailEnabled: boolean;
  transitionEmailSubject: string | null;
  transitionEmailBody: string | null;
}

interface Step {
  id: number;
  playbookId: number;
  stepOrder: number;
  title: string;
  weekNumber: number | null;
  dayNumber: number | null;
  sectionId: number | null;
  taskText: string | null;
  implementationText: string | null;
  mediaUrl: string | null;
}

interface ProgramDetail {
  program: Program;
  sections: Section[];
  steps: Step[];
}

export default function AdminProgramDetailPage() {
  const params = useParams<{ id: string }>();
  const programId = Number(params.id);
  const { toast } = useToast();

  const { data, isLoading } = useQuery<ProgramDetail>({
    queryKey: [`/api/admin/programs/${programId}`],
    enabled: !!programId,
  });

  // Local edit state
  const [programDraft, setProgramDraft] = useState<Partial<Program> | null>(null);
  const [stepDrafts, setStepDrafts] = useState<Record<number, Partial<Step>>>({});
  const [editingSection, setEditingSection] = useState<Section | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (data?.program) setProgramDraft(data.program);
  }, [data?.program]);

  const settingsDirty = useMemo(() => {
    if (!data?.program || !programDraft) return false;
    const keys: (keyof Program)[] = [
      "name",
      "description",
      "isActive",
      "isArchived",
      "totalWeeks",
      "totalWeekdays",
      "feedbackRequired",
      "reflectionRequired",
      "reflectionPrompt",
      "completionMessage",
      "ctaLabel",
      "ctaUrl",
    ];
    return keys.some((k) => (programDraft as any)[k] !== (data.program as any)[k]);
  }, [data, programDraft]);

  const dirtyStepCount = Object.keys(stepDrafts).length;

  const stepsBySection = useMemo(() => {
    if (!data) return new Map<number | null, Step[]>();
    const byId = new Map<number | null, Step[]>();
    for (const s of data.steps) {
      const key = s.sectionId ?? null;
      const arr = byId.get(key) ?? [];
      arr.push(s);
      byId.set(key, arr);
    }
    return byId;
  }, [data]);

  const saveSettings = useMutation({
    mutationFn: async () => {
      if (!programDraft) return;
      const { id: _id, tenantId: _t, ...payload } = programDraft as any;
      const res = await apiRequest("PUT", `/api/admin/programs/${programId}`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/programs/${programId}`] });
      toast({ title: "Program settings saved" });
    },
    onError: (e: any) =>
      toast({ title: "Save failed", description: e?.message, variant: "destructive" }),
  });

  const saveSteps = useMutation({
    mutationFn: async () => {
      const entries = Object.entries(stepDrafts);
      if (entries.length === 0) return;
      await Promise.all(
        entries.map(([stepId, patch]) =>
          apiRequest("PUT", `/api/admin/programs/${programId}/steps/${stepId}`, patch),
        ),
      );
    },
    onSuccess: () => {
      setStepDrafts({});
      queryClient.invalidateQueries({ queryKey: [`/api/admin/programs/${programId}`] });
      toast({ title: `Saved ${dirtyStepCount} task${dirtyStepCount === 1 ? "" : "s"}` });
    },
    onError: (e: any) =>
      toast({ title: "Save failed", description: e?.message, variant: "destructive" }),
  });

  const saveSection = useMutation({
    mutationFn: async (section: Section) => {
      const { id, playbookId: _p, order: _o, ...patch } = section;
      const res = await apiRequest(
        "PUT",
        `/api/admin/programs/${programId}/sections/${id}`,
        patch,
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/programs/${programId}`] });
      toast({ title: "Section saved" });
      setEditingSection(null);
    },
    onError: (e: any) =>
      toast({ title: "Save failed", description: e?.message, variant: "destructive" }),
  });

  if (isLoading || !data || !programDraft) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const sectionsSorted = [...data.sections].sort((a, b) => a.order - b.order);
  const unassignedSteps = stepsBySection.get(null) ?? [];

  const stepValue = (step: Step, key: keyof Step) => {
    const draft = stepDrafts[step.id];
    if (draft && key in draft) return (draft as any)[key] ?? "";
    return (step as any)[key] ?? "";
  };

  const updateStepDraft = (step: Step, key: keyof Step, value: string) => {
    setStepDrafts((prev) => {
      const next = { ...prev };
      const existing = next[step.id] ?? {};
      const merged = { ...existing, [key]: value };
      // If merged matches the original, drop it from drafts so dirty count is accurate
      const matchesOriginal = ["taskText", "implementationText", "mediaUrl"].every(
        (k) => (merged as any)[k] === undefined || (merged as any)[k] === ((step as any)[k] ?? ""),
      );
      if (matchesOriginal) {
        delete next[step.id];
      } else {
        next[step.id] = merged;
      }
      return next;
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
            <Link href="/admin/programs">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Programs
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold" data-testid="text-program-name">
            {data.program.name}
          </h1>
          {data.program.description && (
            <p className="text-muted-foreground mt-1">{data.program.description}</p>
          )}
          <div className="flex gap-2 mt-2">
            <Badge variant={data.program.isActive ? "default" : "secondary"}>
              {data.program.isActive ? "Active" : "Inactive"}
            </Badge>
            <Badge variant="outline">
              {data.program.totalWeeks} weeks / {data.program.totalWeekdays} weekdays
            </Badge>
          </div>
        </div>
        <Button variant="outline" onClick={() => setShowSettings(true)} data-testid="button-settings">
          <Settings2 className="h-4 w-4 mr-2" />
          Program settings
        </Button>
      </div>

      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur py-2 border-b -mx-6 px-6 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {dirtyStepCount > 0
            ? `${dirtyStepCount} unsaved task change${dirtyStepCount === 1 ? "" : "s"}`
            : "All tasks saved"}
        </div>
        <Button
          onClick={() => saveSteps.mutate()}
          disabled={dirtyStepCount === 0 || saveSteps.isPending}
          data-testid="button-save-tasks"
        >
          {saveSteps.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save tasks
        </Button>
      </div>

      {sectionsSorted.length === 0 && unassignedSteps.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            This program has no tasks yet. Reseed The 4 Basics structure from
            Program settings to create 60 empty weekday slots.
          </CardContent>
        </Card>
      )}

      {sectionsSorted.map((section) => {
        const sectionSteps = (stepsBySection.get(section.id) ?? []).sort(
          (a, b) => a.stepOrder - b.stepOrder,
        );
        return (
          <Card key={section.id} data-testid={`section-${section.id}`}>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>
                  Section {section.order}: {section.name}
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Days {section.startDay}–{section.endDay} ({sectionSteps.length} task
                  {sectionSteps.length === 1 ? "" : "s"})
                  {section.transitionEmailEnabled && (
                    <Badge variant="outline" className="ml-2">
                      Transition email on
                    </Badge>
                  )}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditingSection(section)}
                data-testid={`button-edit-section-${section.id}`}
              >
                <Pencil className="h-4 w-4 mr-1" />
                Edit
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {sectionSteps.map((step) => (
                <div
                  key={step.id}
                  className="border rounded-md p-4 space-y-3"
                  data-testid={`step-${step.id}`}
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      Week {step.weekNumber} · Day {step.dayNumber}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      ({step.title})
                    </span>
                    {stepDrafts[step.id] && (
                      <Badge variant="secondary" className="ml-auto">
                        Unsaved
                      </Badge>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase text-muted-foreground">
                      Task — what the client should do
                    </Label>
                    <Textarea
                      value={stepValue(step, "taskText")}
                      onChange={(e) => updateStepDraft(step, "taskText", e.target.value)}
                      placeholder="Reach out to 3 dormant contacts and ask them how they've been."
                      rows={2}
                      data-testid={`input-task-${step.id}`}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase text-muted-foreground">
                      Implementation — example or how-to
                    </Label>
                    <Textarea
                      value={stepValue(step, "implementationText")}
                      onChange={(e) =>
                        updateStepDraft(step, "implementationText", e.target.value)
                      }
                      placeholder="Pick three names from your dormant CRM filter. Send a short, no-ask message — just check in. Sample script: ..."
                      rows={3}
                      data-testid={`input-implementation-${step.id}`}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase text-muted-foreground">
                      Media URL (optional) — image, video, or doc to embed
                    </Label>
                    <Input
                      value={stepValue(step, "mediaUrl")}
                      onChange={(e) => updateStepDraft(step, "mediaUrl", e.target.value)}
                      placeholder="https://..."
                      data-testid={`input-media-${step.id}`}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}

      {/* Program settings dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Program settings</DialogTitle>
            <DialogDescription>
              These settings apply to every client enrolled in this program.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="set-name">Name</Label>
              <Input
                id="set-name"
                value={programDraft.name ?? ""}
                onChange={(e) =>
                  setProgramDraft((d) => ({ ...(d ?? {}), name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="set-description">Description</Label>
              <Textarea
                id="set-description"
                value={programDraft.description ?? ""}
                onChange={(e) =>
                  setProgramDraft((d) => ({
                    ...(d ?? {}),
                    description: e.target.value || null,
                  }))
                }
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="set-weeks">Total weeks</Label>
                <Input
                  id="set-weeks"
                  type="number"
                  value={programDraft.totalWeeks ?? 12}
                  onChange={(e) =>
                    setProgramDraft((d) => ({
                      ...(d ?? {}),
                      totalWeeks: parseInt(e.target.value, 10) || 0,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="set-weekdays">Total weekdays</Label>
                <Input
                  id="set-weekdays"
                  type="number"
                  value={programDraft.totalWeekdays ?? 60}
                  onChange={(e) =>
                    setProgramDraft((d) => ({
                      ...(d ?? {}),
                      totalWeekdays: parseInt(e.target.value, 10) || 0,
                    }))
                  }
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>Feedback required to mark task complete</Label>
              <Switch
                checked={programDraft.feedbackRequired ?? true}
                onCheckedChange={(checked) =>
                  setProgramDraft((d) => ({ ...(d ?? {}), feedbackRequired: checked }))
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Saturday reflection required</Label>
              <Switch
                checked={programDraft.reflectionRequired ?? false}
                onCheckedChange={(checked) =>
                  setProgramDraft((d) => ({ ...(d ?? {}), reflectionRequired: checked }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="set-reflection-prompt">Reflection prompt</Label>
              <Textarea
                id="set-reflection-prompt"
                value={programDraft.reflectionPrompt ?? ""}
                onChange={(e) =>
                  setProgramDraft((d) => ({ ...(d ?? {}), reflectionPrompt: e.target.value }))
                }
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="set-completion">Completion message (shown at day 60)</Label>
              <Textarea
                id="set-completion"
                value={programDraft.completionMessage ?? ""}
                onChange={(e) =>
                  setProgramDraft((d) => ({
                    ...(d ?? {}),
                    completionMessage: e.target.value || null,
                  }))
                }
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="set-cta-label">Next-phase CTA label</Label>
                <Input
                  id="set-cta-label"
                  value={programDraft.ctaLabel ?? ""}
                  onChange={(e) =>
                    setProgramDraft((d) => ({
                      ...(d ?? {}),
                      ctaLabel: e.target.value || null,
                    }))
                  }
                  placeholder="Start Phase 2"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="set-cta-url">Next-phase CTA URL</Label>
                <Input
                  id="set-cta-url"
                  value={programDraft.ctaUrl ?? ""}
                  onChange={(e) =>
                    setProgramDraft((d) => ({
                      ...(d ?? {}),
                      ctaUrl: e.target.value || null,
                    }))
                  }
                  placeholder="https://..."
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowSettings(false)}>
              Close
            </Button>
            <Button
              onClick={() => saveSettings.mutate()}
              disabled={!settingsDirty || saveSettings.isPending}
              data-testid="button-save-settings"
            >
              {saveSettings.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Save settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Section edit dialog */}
      <Dialog
        open={!!editingSection}
        onOpenChange={(open) => !open && setEditingSection(null)}
      >
        {editingSection && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit section</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="sec-name">Name</Label>
                <Input
                  id="sec-name"
                  value={editingSection.name}
                  onChange={(e) =>
                    setEditingSection({ ...editingSection, name: e.target.value })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Send transition email when section ends</Label>
                <Switch
                  checked={editingSection.transitionEmailEnabled}
                  onCheckedChange={(checked) =>
                    setEditingSection({
                      ...editingSection,
                      transitionEmailEnabled: checked,
                    })
                  }
                />
              </div>
              {editingSection.transitionEmailEnabled && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="sec-subj">Email subject</Label>
                    <Input
                      id="sec-subj"
                      value={editingSection.transitionEmailSubject ?? ""}
                      onChange={(e) =>
                        setEditingSection({
                          ...editingSection,
                          transitionEmailSubject: e.target.value || null,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sec-body">Email body</Label>
                    <Textarea
                      id="sec-body"
                      rows={6}
                      value={editingSection.transitionEmailBody ?? ""}
                      onChange={(e) =>
                        setEditingSection({
                          ...editingSection,
                          transitionEmailBody: e.target.value || null,
                        })
                      }
                    />
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditingSection(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => saveSection.mutate(editingSection)}
                disabled={saveSection.isPending}
                data-testid="button-save-section"
              >
                {saveSection.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
