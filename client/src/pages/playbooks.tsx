import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  BookOpen,
  ListOrdered,
  Play,
  Trash2,
  MapPin,
} from "lucide-react";
import type { Location } from "@shared/schema";

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
  steps: Array<{ id: number; stepOrder: number; title: string; description: string | null }>;
}

export default function PlaybooksPage() {
  const { activeTenantId } = useTenantStore();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [showApply, setShowApply] = useState<number | null>(null);
  const [selectedLocationIds, setSelectedLocationIds] = useState<Set<number>>(new Set());
  const [form, setForm] = useState({ name: "", description: "", category: "" });
  const [steps, setSteps] = useState<PlaybookStep[]>([{ title: "", description: "" }]);

  const { data: playbooksData, isLoading } = useQuery<{ ok: boolean; data: PlaybookWithSteps[] }>({
    queryKey: ["/api/tenants", activeTenantId, "playbooks"],
    enabled: !!activeTenantId,
  });

  const { data: locsData } = useQuery<Location[]>({
    queryKey: ["/api/tenants", activeTenantId, "locations"],
    enabled: !!activeTenantId,
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

  const applyMutation = useMutation({
    mutationFn: (playbookId: number) =>
      apiRequest("POST", `/api/tenants/${activeTenantId}/playbooks/${playbookId}/apply`, {
        locationIds: Array.from(selectedLocationIds),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", activeTenantId, "actions"] });
      setShowApply(null);
      setSelectedLocationIds(new Set());
      toast({ title: "Playbook applied", description: "Actions created for selected locations." });
    },
  });

  const pbs = playbooksData?.data || [];
  const locations = locsData || [];

  if (!activeTenantId) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold" data-testid="text-playbooks-title">Playbooks</h1>
        <p className="text-muted-foreground mt-1">Select a tenant to manage playbooks.</p>
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
    <div className="p-6 space-y-4 max-w-7xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-playbooks-title">Playbooks</h1>
          <p className="text-muted-foreground text-sm">Reusable action templates for underperforming locations</p>
        </div>
        <Button onClick={() => setShowCreate(true)} data-testid="button-create-playbook">
          <Plus className="h-4 w-4 mr-2" />
          New Playbook
        </Button>
      </div>

      {pbs.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <BookOpen className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground" data-testid="text-no-playbooks">
              No playbooks yet. Create a playbook to define reusable action templates that can be applied to multiple locations.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pbs.map(pb => (
            <Card key={pb.id} data-testid={`playbook-card-${pb.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{pb.name}</CardTitle>
                  {pb.category && <Badge variant="outline">{pb.category}</Badge>}
                </div>
                {pb.description && <p className="text-sm text-muted-foreground">{pb.description}</p>}
              </CardHeader>
              <CardContent>
                <div className="space-y-1 mb-3">
                  {pb.steps.map((step, idx) => (
                    <div key={step.id} className="flex items-start gap-2 text-sm" data-testid={`step-${pb.id}-${idx}`}>
                      <span className="text-muted-foreground shrink-0 w-5 text-right">{step.stepOrder}.</span>
                      <span>{step.title}</span>
                    </div>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setShowApply(pb.id); setSelectedLocationIds(new Set()); }}
                  data-testid={`button-apply-playbook-${pb.id}`}
                >
                  <Play className="h-3 w-3 mr-1" />
                  Apply to Locations
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
                      <Button variant="ghost" size="icon" className="shrink-0 h-9 w-9" onClick={() => setSteps(steps.filter((_, i) => i !== idx))}>
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

      <Dialog open={showApply !== null} onOpenChange={() => setShowApply(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Apply Playbook to Locations</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
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
            <Button
              onClick={() => showApply && applyMutation.mutate(showApply)}
              disabled={selectedLocationIds.size === 0 || applyMutation.isPending}
              className="w-full"
              data-testid="button-confirm-apply"
            >
              Apply to {selectedLocationIds.size} Location{selectedLocationIds.size !== 1 ? "s" : ""}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
