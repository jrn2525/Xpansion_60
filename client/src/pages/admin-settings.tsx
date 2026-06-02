import { useEffect, useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTenantStore } from "@/lib/tenant-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Settings as SettingsIcon, Save, Loader2 } from "lucide-react";

type Group = "branding" | "schedule" | "copy";
type InputType = "text" | "time" | "textarea" | "email";

interface SettingItem {
  key: string;
  value: string;
  label: string;
  description: string;
  group: Group;
  inputType: InputType;
}

interface SettingsResponse {
  groups: Group[];
  settings: SettingItem[];
}

const GROUP_TITLES: Record<Group, string> = {
  branding: "Branding",
  schedule: "Email schedule",
  copy: "Dashboard copy",
};

const GROUP_DESCRIPTIONS: Record<Group, string> = {
  branding: "Names and addresses your clients see.",
  schedule:
    "When automated emails go out each day. Times are in UTC — if Railway is in UTC, set 13:00 for 8am ET / 5am PT.",
  copy: "Messages clients see on their dashboard during weekends, pauses, etc.",
};

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const { activeTenantId } = useTenantStore();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery<SettingsResponse>({
    queryKey: ["/api/admin/app-settings", `?tenantId=${activeTenantId}`],
    enabled: !!activeTenantId,
  });

  useEffect(() => {
    if (data?.settings) {
      const initial: Record<string, string> = {};
      for (const s of data.settings) initial[s.key] = s.value;
      setDrafts(initial);
    }
  }, [data?.settings]);

  const dirty = useMemo(() => {
    if (!data?.settings) return false;
    return data.settings.some((s) => drafts[s.key] !== undefined && drafts[s.key] !== s.value);
  }, [data, drafts]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const updates =
        data?.settings
          .filter((s) => drafts[s.key] !== undefined && drafts[s.key] !== s.value)
          .map((s) => ({ key: s.key, value: drafts[s.key] })) ?? [];
      const res = await apiRequest("PUT", "/api/admin/app-settings", {
        tenantId: activeTenantId,
        updates,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/app-settings"] });
      toast({ title: "Settings saved" });
    },
    onError: (e: any) =>
      toast({ title: "Save failed", description: e?.message, variant: "destructive" }),
  });

  if (!activeTenantId) {
    return <p className="p-6 text-muted-foreground">No active workspace.</p>;
  }
  if (isLoading || !data) {
    return (
      <div className="p-6 max-w-3xl space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SettingsIcon className="h-6 w-6" />
          <div>
            <h1 className="text-2xl font-semibold">Settings</h1>
            <p className="text-sm text-muted-foreground">
              Everything visible to clients is configurable here — no code changes needed.
            </p>
          </div>
        </div>
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={!dirty || saveMutation.isPending}
          data-testid="button-save-settings"
        >
          {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          <Save className="h-4 w-4 mr-2" />
          Save changes
        </Button>
      </div>

      {data.groups.map((group) => {
        const groupSettings = data.settings.filter((s) => s.group === group);
        if (groupSettings.length === 0) return null;
        return (
          <Card key={group}>
            <CardHeader>
              <CardTitle>{GROUP_TITLES[group]}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {GROUP_DESCRIPTIONS[group]}
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              {groupSettings.map((s) => (
                <div key={s.key} className="space-y-2">
                  <Label htmlFor={s.key}>{s.label}</Label>
                  {s.inputType === "textarea" ? (
                    <Textarea
                      id={s.key}
                      value={drafts[s.key] ?? s.value}
                      onChange={(e) =>
                        setDrafts((d) => ({ ...d, [s.key]: e.target.value }))
                      }
                      rows={3}
                      data-testid={`input-${s.key}`}
                    />
                  ) : (
                    <Input
                      id={s.key}
                      type={s.inputType === "time" ? "time" : s.inputType === "email" ? "email" : "text"}
                      value={drafts[s.key] ?? s.value}
                      onChange={(e) =>
                        setDrafts((d) => ({ ...d, [s.key]: e.target.value }))
                      }
                      data-testid={`input-${s.key}`}
                    />
                  )}
                  <p className="text-xs text-muted-foreground">{s.description}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
