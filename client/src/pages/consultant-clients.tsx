import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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
} from "@/components/ui/dialog";
import {
  UserPlus,
  Plus,
  Loader2,
  Users,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Mail,
  Search,
  Building2,
  ArrowRight,
} from "lucide-react";

interface ClientUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  jobTitle: string | null;
  mustChangePassword: boolean | null;
  lastLoginAt: string | null;
  createdAt: string | null;
  status: string;
  onboardingStep: number;
  onboardingTotal: number;
  completedSteps: string[];
  businessName: string | null;
  tenantId: number | null;
  daysSinceLogin: number | null;
  needsAttention: boolean;
}

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
  active: { label: "Active", variant: "default", icon: CheckCircle2 },
  onboarding: { label: "Onboarding", variant: "secondary", icon: Clock },
  logged_in: { label: "Logged In", variant: "outline", icon: CheckCircle2 },
  invited: { label: "Invited", variant: "outline", icon: Mail },
};

export default function ConsultantClientsPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const { data: clients, isLoading } = useQuery<ClientUser[]>({
    queryKey: ["/api/admin/clients"],
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: { email: string; firstName: string; lastName: string; password: string }) => {
      const res = await apiRequest("POST", "/api/admin/users", data);
      return res.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setShowCreateDialog(false);
      resetForm();
      toast({
        title: "Client created",
        description: `Account created for ${result?.data?.email || "client"}. A welcome email has been sent.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create client",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  function resetForm() {
    setNewEmail("");
    setNewFirstName("");
    setNewLastName("");
    setNewPassword("");
  }

  function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    createUserMutation.mutate({
      email: newEmail,
      firstName: newFirstName,
      lastName: newLastName,
      password: newPassword,
    });
  }

  const filteredClients = (clients || []).filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.email?.toLowerCase().includes(q) ||
      c.firstName?.toLowerCase().includes(q) ||
      c.lastName?.toLowerCase().includes(q) ||
      c.businessName?.toLowerCase().includes(q)
    );
  });

  const attentionCount = filteredClients.filter((c) => c.needsAttention).length;
  const activeCount = filteredClients.filter((c) => c.status === "active").length;
  const onboardingCount = filteredClients.filter((c) => c.status === "onboarding" || c.status === "invited").length;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto" data-testid="page-consultant-clients">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" data-testid="text-page-title">
            <Users className="h-6 w-6" />
            Your Clients
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage client accounts and track their onboarding progress
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} data-testid="button-add-client">
          <UserPlus className="h-4 w-4 mr-2" />
          Add Client
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Active Clients" value={activeCount} testId="text-stat-active" />
        <SummaryCard label="In Onboarding" value={onboardingCount} testId="text-stat-onboarding" />
        <SummaryCard
          label="Needs Attention"
          value={attentionCount}
          testId="text-stat-attention"
          alert={attentionCount > 0}
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-base">All Clients</CardTitle>
            <div className="relative max-w-xs w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search clients..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-clients"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">
                {searchQuery ? "No clients match your search" : "No clients yet"}
              </p>
              {!searchQuery && (
                <p className="text-sm text-muted-foreground mt-1">
                  Create your first client account to get started.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredClients.map((client) => (
                <ClientRow key={client.id} client={client} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Add New Client
            </DialogTitle>
            <DialogDescription>
              Create a login account for a new client. They'll receive a welcome email with their credentials.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateUser} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  value={newFirstName}
                  onChange={(e) => setNewFirstName(e.target.value)}
                  placeholder="John"
                  data-testid="input-new-first-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  value={newLastName}
                  onChange={(e) => setNewLastName(e.target.value)}
                  placeholder="Doe"
                  data-testid="input-new-last-name"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="newEmail">Email</Label>
              <Input
                id="newEmail"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="client@example.com"
                required
                data-testid="input-new-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">Temporary Password</Label>
              <Input
                id="newPassword"
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                required
                minLength={8}
                data-testid="input-new-password"
              />
              <p className="text-xs text-muted-foreground">
                The client will be required to change this on first login.
              </p>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => { setShowCreateDialog(false); resetForm(); }} data-testid="button-cancel-create">
                Cancel
              </Button>
              <Button type="submit" disabled={createUserMutation.isPending} data-testid="button-submit-create">
                {createUserMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Client
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ClientRow({ client }: { client: ClientUser }) {
  const config = STATUS_CONFIG[client.status] || STATUS_CONFIG.invited;
  const StatusIcon = config.icon;
  const name = [client.firstName, client.lastName].filter(Boolean).join(" ") || "Unnamed";

  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-lg border ${
        client.needsAttention ? "border-orange-300 dark:border-orange-700 bg-orange-50/50 dark:bg-orange-950/20" : ""
      }`}
      data-testid={`card-client-${client.id}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold" data-testid={`text-client-name-${client.id}`}>
            {name}
          </p>
          <Badge variant={config.variant} className="text-xs" data-testid={`badge-status-${client.id}`}>
            <StatusIcon className="h-3 w-3 mr-1" />
            {config.label}
          </Badge>
          {client.needsAttention && (
            <Badge variant="destructive" className="text-xs" data-testid={`badge-attention-${client.id}`}>
              <AlertTriangle className="h-3 w-3 mr-1" />
              Needs Attention
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5" data-testid={`text-client-email-${client.id}`}>
          {client.email}
        </p>
        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          {client.businessName && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Building2 className="h-3 w-3" />
              {client.businessName}
            </span>
          )}
          {client.lastLoginAt && (
            <span className="text-xs text-muted-foreground">
              Last active: {formatRelativeDate(client.lastLoginAt)}
            </span>
          )}
          {!client.lastLoginAt && (
            <span className="text-xs text-muted-foreground">Never logged in</span>
          )}
        </div>
      </div>

      {client.status === "onboarding" && (
        <div className="shrink-0 w-32">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Onboarding</span>
            <span>{client.onboardingStep}/{client.onboardingTotal}</span>
          </div>
          <div className="w-full bg-muted rounded-full h-1.5">
            <div
              className="bg-primary rounded-full h-1.5 transition-all"
              style={{ width: `${(client.onboardingStep / client.onboardingTotal) * 100}%` }}
              data-testid={`progress-onboarding-${client.id}`}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, testId, alert }: {
  label: string;
  value: number;
  testId: string;
  alert?: boolean;
}) {
  return (
    <Card className={alert ? "border-orange-300 dark:border-orange-700" : ""}>
      <CardContent className="pt-4 pb-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold ${alert ? "text-orange-600 dark:text-orange-400" : ""}`} data-testid={testId}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString();
}
