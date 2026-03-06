import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Bell, Send, Mail, MessageSquare } from "lucide-react";
import { useTenantStore } from "@/lib/tenant-store";

import { statusColors } from "@/lib/semantic-colors";

const deliveryStatusColors: Record<string, string> = {
  sent: statusColors.success,
  delivered: statusColors.success,
  failed: statusColors.error,
  pending: statusColors.warning,
};

const SEVERITIES = ["low", "medium", "high", "critical"] as const;

export default function AdminNotificationsPage() {
  const { activeTenantId } = useTenantStore();
  const { toast } = useToast();

  const [emailEnabled, setEmailEnabled] = useState(false);
  const [slackEnabled, setSlackEnabled] = useState(false);
  const [slackWebhookUrl, setSlackWebhookUrl] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [recipientsText, setRecipientsText] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string[]>(["critical", "high"]);
  const [notifyOnAck, setNotifyOnAck] = useState(false);
  const [notifyOnResolved, setNotifyOnResolved] = useState(true);

  const { data: settingsResponse, isLoading: settingsLoading } = useQuery<any>({
    queryKey: ["/api/admin/notification-settings", `?tenantId=${activeTenantId}`],
    enabled: !!activeTenantId,
  });

  const { data: deliveriesResponse, isLoading: deliveriesLoading } = useQuery<any>({
    queryKey: ["/api/admin/notification-deliveries", `?tenantId=${activeTenantId}`],
    enabled: !!activeTenantId,
  });

  const settings = settingsResponse?.data || null;
  const deliveries = deliveriesResponse?.data || [];

  useEffect(() => {
    if (settings) {
      setEmailEnabled(settings.emailEnabled ?? false);
      setSlackEnabled(settings.slackEnabled ?? false);
      setSlackWebhookUrl(settings.slackWebhookUrl ?? "");
      setSenderEmail(settings.senderEmail ?? "");
      try {
        const recipients = JSON.parse(settings.recipientsJson || "[]");
        setRecipientsText(Array.isArray(recipients) ? recipients.join(", ") : "");
      } catch {
        setRecipientsText("");
      }
      try {
        const sf = JSON.parse(settings.severityFilterJson || '["critical","high"]');
        setSeverityFilter(Array.isArray(sf) ? sf : ["critical", "high"]);
      } catch {
        setSeverityFilter(["critical", "high"]);
      }
      setNotifyOnAck(settings.notifyOnAck ?? false);
      setNotifyOnResolved(settings.notifyOnResolved ?? true);
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PUT", `/api/admin/notification-settings/${activeTenantId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notification-settings"] });
      toast({ title: "Notification settings saved" });
    },
    onError: (e: Error) => toast({ title: "Failed to save", description: e.message, variant: "destructive" }),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/notification-test", { tenantId: activeTenantId });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notification-deliveries"] });
      const results = data?.data?.results || [];
      const summary = results.map((r: any) => `${r.channel}: ${r.status}${r.error ? ` (${r.error})` : ""}`).join(", ");
      toast({ title: "Test notification sent", description: summary || "Check delivery history" });
    },
    onError: (e: Error) => toast({ title: "Test failed", description: e.message, variant: "destructive" }),
  });

  function handleSave() {
    const recipientsArray = recipientsText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    saveMutation.mutate({
      emailEnabled,
      slackEnabled,
      slackWebhookUrl,
      senderEmail,
      recipientsJson: JSON.stringify(recipientsArray),
      severityFilterJson: JSON.stringify(severityFilter),
      notifyOnAck,
      notifyOnResolved,
    });
  }

  function toggleSeverity(sev: string) {
    setSeverityFilter((prev) =>
      prev.includes(sev) ? prev.filter((s) => s !== sev) : [...prev, sev]
    );
  }

  if (!activeTenantId) {
    return (
      <div className="p-6 text-center text-muted-foreground" data-testid="text-no-tenant">
        Select a tenant to manage notification settings
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold" data-testid="text-page-title">Notification Settings</h1>

      {settingsLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Switch
                  checked={emailEnabled}
                  onCheckedChange={setEmailEnabled}
                  data-testid="switch-email-enabled"
                />
                <Label className="flex items-center gap-2">
                  <Mail className="h-4 w-4" /> Email Notifications
                </Label>
              </div>

              <div className="flex items-center gap-3">
                <Switch
                  checked={slackEnabled}
                  onCheckedChange={setSlackEnabled}
                  data-testid="switch-slack-enabled"
                />
                <Label className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" /> Slack Notifications
                </Label>
              </div>

              {slackEnabled && (
                <div>
                  <Label>Slack Webhook URL</Label>
                  <Input
                    value={slackWebhookUrl}
                    onChange={(e) => setSlackWebhookUrl(e.target.value)}
                    placeholder="https://hooks.slack.com/services/..."
                    data-testid="input-slack-webhook-url"
                  />
                </div>
              )}

              <div>
                <Label>Sender Email</Label>
                <Input
                  value={senderEmail}
                  onChange={(e) => setSenderEmail(e.target.value)}
                  placeholder="noreply@example.com"
                  data-testid="input-sender-email"
                />
              </div>

              <div>
                <Label>Recipients (comma-separated emails)</Label>
                <Input
                  value={recipientsText}
                  onChange={(e) => setRecipientsText(e.target.value)}
                  placeholder="admin@example.com, manager@example.com"
                  data-testid="input-recipients"
                />
              </div>

              <div>
                <Label className="mb-2 block">Severity Filter</Label>
                <div className="flex flex-wrap gap-4">
                  {SEVERITIES.map((sev) => (
                    <div key={sev} className="flex items-center gap-2">
                      <Checkbox
                        checked={severityFilter.includes(sev)}
                        onCheckedChange={() => toggleSeverity(sev)}
                        data-testid={`checkbox-severity-${sev}`}
                      />
                      <Label className="capitalize">{sev}</Label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Switch
                  checked={notifyOnAck}
                  onCheckedChange={setNotifyOnAck}
                  data-testid="switch-notify-on-ack"
                />
                <Label>Notify on Acknowledge</Label>
              </div>

              <div className="flex items-center gap-3">
                <Switch
                  checked={notifyOnResolved}
                  onCheckedChange={setNotifyOnResolved}
                  data-testid="switch-notify-on-resolved"
                />
                <Label>Notify on Resolved</Label>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                data-testid="button-save-settings"
              >
                {saveMutation.isPending ? "Saving..." : "Save Settings"}
              </Button>
              <Button
                variant="outline"
                onClick={() => testMutation.mutate()}
                disabled={testMutation.isPending}
                data-testid="button-test-notification"
              >
                <Send className="h-4 w-4 mr-2" />
                {testMutation.isPending ? "Sending..." : "Send Test Notification"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle data-testid="text-delivery-history-title">Delivery History</CardTitle>
        </CardHeader>
        <CardContent>
          {deliveriesLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : deliveries.length === 0 ? (
            <p className="text-center text-muted-foreground py-4" data-testid="text-no-deliveries">
              No delivery history yet
            </p>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Channel</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveries.map((d: any) => (
                  <TableRow key={d.id} data-testid={`row-delivery-${d.id}`}>
                    <TableCell>
                      <Badge variant="secondary" data-testid={`badge-channel-${d.id}`}>
                        {d.channel}
                      </Badge>
                    </TableCell>
                    <TableCell data-testid={`text-recipient-${d.id}`}>{d.recipientAddress}</TableCell>
                    <TableCell className="max-w-xs truncate" data-testid={`text-subject-${d.id}`}>
                      {d.subjectOrTitle}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={deliveryStatusColors[d.status] || ""}
                        data-testid={`badge-delivery-status-${d.id}`}
                      >
                        {d.status}
                      </Badge>
                    </TableCell>
                    <TableCell data-testid={`text-timestamp-${d.id}`}>
                      {d.createdAt ? new Date(d.createdAt).toLocaleString() : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
