import { useState } from "react";
import { Link } from "wouter";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BookOpen, Plus, Loader2, ArrowRight } from "lucide-react";

interface Program {
  id: number;
  tenantId: number;
  name: string;
  description: string | null;
  isActive: boolean;
  isArchived: boolean;
  totalWeeks: number;
  totalWeekdays: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export default function AdminProgramsPage() {
  const { toast } = useToast();
  const { activeTenantId } = useTenantStore();

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [seedFourBasics, setSeedFourBasics] = useState(true);

  const { data: programs, isLoading } = useQuery<Program[]>({
    queryKey: ["/api/admin/programs", `?tenantId=${activeTenantId}`],
    enabled: !!activeTenantId,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/programs", {
        tenantId: activeTenantId,
        name: newName,
        description: newDescription || null,
        seedFourBasics,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/programs"] });
      toast({ title: "Program created" });
      setShowCreate(false);
      setNewName("");
      setNewDescription("");
      setSeedFourBasics(true);
    },
    onError: (e: any) => {
      toast({
        title: "Couldn't create program",
        description: e?.message ?? "Unknown error",
        variant: "destructive",
      });
    },
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
          <BookOpen className="h-6 w-6" />
          <div>
            <h1 className="text-2xl font-semibold">Programs</h1>
            <p className="text-sm text-muted-foreground">
              12-week coaching program templates. Each program is 60 weekday tasks
              optionally split into sections.
            </p>
          </div>
        </div>
        <Button onClick={() => setShowCreate(true)} data-testid="button-new-program">
          <Plus className="h-4 w-4 mr-2" />
          New Program
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All programs</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : programs && programs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Length</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[140px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {programs.map((p) => (
                  <TableRow key={p.id} data-testid={`row-program-${p.id}`}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-muted-foreground max-w-md truncate">
                      {p.description || <span className="italic">No description</span>}
                    </TableCell>
                    <TableCell>
                      {p.totalWeeks}w / {p.totalWeekdays}d
                    </TableCell>
                    <TableCell>
                      {p.isArchived ? (
                        <Badge variant="outline">Archived</Badge>
                      ) : p.isActive ? (
                        <Badge>Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/admin/programs/${p.id}`}>
                          Open
                          <ArrowRight className="h-4 w-4 ml-1" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="py-10 text-center text-muted-foreground">
              No programs yet. Click <strong>New Program</strong> to create one —
              check the "Seed The 4 Basics structure" box to start with 4 sections
              and 60 empty weekday slots ready to fill in.
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New program</DialogTitle>
            <DialogDescription>
              A program template is a 60-weekday curriculum that you can later
              enroll clients into. You can change everything here later.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="program-name">Name</Label>
              <Input
                id="program-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="The 4 Basics"
                data-testid="input-program-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="program-description">Description (optional)</Label>
              <Input
                id="program-description"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="One-sentence summary clients will see"
                data-testid="input-program-description"
              />
            </div>
            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={seedFourBasics}
                onCheckedChange={(checked) => setSeedFourBasics(checked === true)}
                data-testid="checkbox-seed-four-basics"
              />
              <span className="text-sm">
                <span className="font-medium">Seed The 4 Basics structure</span>
                <span className="block text-muted-foreground">
                  Creates 4 sections (Greeting, Educate, Process, Close) of 15
                  weekdays each, plus 60 empty task slots ready for you to fill in.
                </span>
              </span>
            </label>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!newName.trim() || createMutation.isPending}
              data-testid="button-create-program"
            >
              {createMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
