import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTenantStore } from "@/lib/tenant-store";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Mail, Save, Eye, Send, Loader2, Pencil, RotateCcw } from "lucide-react";

interface EmailTemplate {
  key: string;
  label: string;
  description: string;
  placeholders: string[];
  enabled: boolean;
  subject: string;
  body: string;
  defaultSubject: string;
  defaultBody: string;
}

interface TemplatesResponse {
  templates: EmailTemplate[];
}

export default function AdminMessagingPage() {
  const { toast } = useToast();
  const { activeTenantId } = useTenantStore();
  const { user } = useAuth();

  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [previewing, setPreviewing] = useState<{ subject: string; body: string } | null>(null);
  const [testSendTarget, setTestSendTarget] = useState("");

  const { data, isLoading } = useQuery<TemplatesResponse>({
    queryKey: ["/api/admin/email-templates", `?tenantId=${activeTenantId}`],
    enabled: !!activeTenantId,
  });

  useEffect(() => {
    if (user?.email && !testSendTarget) {
      setTestSendTarget(user.email);
    }
  }, [user?.email, testSendTarget]);

  const toggleMutation = useMutation({
    mutationFn: async ({ key, enabled }: { key: string; enabled: boolean }) => {
      const res = await apiRequest("PUT", `/api/admin/email-templates/${key}`, {
        tenantId: activeTenantId,
        enabled,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email-templates"] });
    },
    onError: (e: any) =>
      toast({ title: "Toggle failed", description: e?.message, variant: "destructive" }),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const res = await apiRequest("PUT", `/api/admin/email-templates/${editing.key}`, {
        tenantId: activeTenantId,
        subject: editSubject,
        body: editBody,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email-templates"] });
      toast({ title: "Template saved" });
      setEditing(null);
    },
    onError: (e: any) =>
      toast({ title: "Save failed", description: e?.message, variant: "destructive" }),
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!editing) return null;
      const res = await apiRequest(
        "POST",
        `/api/admin/email-templates/${editing.key}/preview`,
        { subject: editSubject, body: editBody },
      );
      const json = await res.json();
      return json.data as { subject: string; body: string };
    },
    onSuccess: (data) => {
      if (data) setPreviewing(data);
    },
    onError: (e: any) =>
      toast({ title: "Preview failed", description: e?.message, variant: "destructive" }),
  });

  const testSendMutation = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const res = await apiRequest(
        "POST",
        `/api/admin/email-templates/${editing.key}/test-send`,
        { to: testSendTarget, subject: editSubject, body: editBody },
      );
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Test email sent",
        description: `Check ${testSendTarget} in a moment.`,
      });
    },
    onError: (e: any) =>
      toast({ title: "Send failed", description: e?.message, variant: "destructive" }),
  });

  function openEdit(t: EmailTemplate) {
    setEditing(t);
    setEditSubject(t.subject);
    setEditBody(t.body);
  }

  function resetToDefault() {
    if (!editing) return;
    setEditSubject(editing.defaultSubject);
    setEditBody(editing.defaultBody);
  }

  if (!activeTenantId) return <p className="p-6 text-muted-foreground">No active workspace.</p>;
  if (isLoading || !data) {
    return (
      <div className="p-6 max-w-4xl space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Mail className="h-6 w-6" />
        <div>
          <h1 className="text-2xl font-semibold">Messaging</h1>
          <p className="text-sm text-muted-foreground">
            Every email the app sends. Edit subject and body, toggle off any you
            don't want, preview with sample data, send a test to yourself before
            going live.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {data.templates.map((t) => (
          <Card key={t.key} data-testid={`template-${t.key}`}>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    {t.label}
                    {!t.enabled && (
                      <Badge variant="outline" className="text-amber-600 border-amber-500">
                        Disabled
                      </Badge>
                    )}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">{t.description}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={t.enabled}
                    onCheckedChange={(enabled) =>
                      toggleMutation.mutate({ key: t.key, enabled })
                    }
                    data-testid={`toggle-${t.key}`}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEdit(t)}
                    data-testid={`button-edit-${t.key}`}
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-sm space-y-1">
                <div>
                  <span className="text-muted-foreground">Subject:</span>{" "}
                  <span className="font-medium">{t.subject}</span>
                </div>
                <div className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-line">
                  {t.body}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        {editing && (
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing.label}</DialogTitle>
              <DialogDescription>{editing.description}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="edit-subject">Subject</Label>
                <Input
                  id="edit-subject"
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  data-testid="input-template-subject"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="edit-body">Body</Label>
                  <Button variant="ghost" size="sm" onClick={resetToDefault} type="button">
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Reset to default
                  </Button>
                </div>
                <Textarea
                  id="edit-body"
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={14}
                  className="font-mono text-sm"
                  data-testid="input-template-body"
                />
              </div>

              <div className="rounded-md bg-muted/40 p-3 space-y-2">
                <p className="text-xs font-medium uppercase text-muted-foreground tracking-wide">
                  Available placeholders
                </p>
                <div className="flex flex-wrap gap-2">
                  {editing.placeholders.map((p) => (
                    <code
                      key={p}
                      className="px-2 py-0.5 text-xs rounded bg-background border"
                    >
                      {p}
                    </code>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Each will be replaced with the real value when the email goes
                  out. Click "Preview" to see them filled in with sample data.
                </p>
              </div>

              <div className="rounded-md border p-3 space-y-2">
                <Label htmlFor="test-target" className="text-xs">
                  Test send to
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="test-target"
                    type="email"
                    value={testSendTarget}
                    onChange={(e) => setTestSendTarget(e.target.value)}
                    placeholder="you@example.com"
                    data-testid="input-test-target"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => testSendMutation.mutate()}
                    disabled={!testSendTarget || testSendMutation.isPending}
                    data-testid="button-test-send"
                  >
                    {testSendMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4 mr-2" />
                    )}
                    Send test
                  </Button>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => previewMutation.mutate()}
                disabled={previewMutation.isPending}
                data-testid="button-preview"
              >
                {previewMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Eye className="h-4 w-4 mr-2" />
                )}
                Preview
              </Button>
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                data-testid="button-save-template"
              >
                {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Save className="h-4 w-4 mr-2" />
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* Preview dialog */}
      <Dialog open={!!previewing} onOpenChange={(open) => !open && setPreviewing(null)}>
        {previewing && (
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Preview with sample data</DialogTitle>
              <DialogDescription>
                This is what the email would look like with sample placeholder values.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label className="text-xs uppercase text-muted-foreground">Subject</Label>
                <div className="rounded-md border p-3 font-medium">{previewing.subject}</div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs uppercase text-muted-foreground">Body</Label>
                <div className="rounded-md border p-3 whitespace-pre-line text-sm leading-relaxed">
                  {previewing.body}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => setPreviewing(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
