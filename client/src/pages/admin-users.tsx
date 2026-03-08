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
import { Users, Plus, UserPlus, Loader2, Shield } from "lucide-react";

interface AppUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  isSuperAdmin: string | null;
  createdAt: string | null;
}

interface TenantOption {
  id: number;
  name: string;
}

export default function AdminUsersPage() {
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newTenantId, setNewTenantId] = useState("");
  const [newRole, setNewRole] = useState("viewer");

  const { data: usersData, isLoading: usersLoading, error: usersError } = useQuery<AppUser[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: tenants } = useQuery<TenantOption[]>({
    queryKey: ["/api/tenants"],
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: {
      email: string;
      firstName: string;
      lastName: string;
      password: string;
      tenantId?: string;
      role?: string;
    }) => {
      const res = await apiRequest("POST", "/api/admin/users", data);
      return res.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setShowCreateDialog(false);
      resetForm();
      toast({
        title: "User created",
        description: `Account created for ${result?.data?.email || "user"}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create user",
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
    setNewTenantId("");
    setNewRole("viewer");
  }

  function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    createUserMutation.mutate({
      email: newEmail,
      firstName: newFirstName,
      lastName: newLastName,
      password: newPassword,
      tenantId: newTenantId || undefined,
      role: newTenantId ? newRole : undefined,
    });
  }

  const usersList = usersData || [];

  return (
    <div className="p-6 max-w-5xl space-y-6" data-testid="page-admin-users">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Users className="h-6 w-6" />
            User Management
          </h1>
          <p className="text-muted-foreground text-sm">Create and manage user accounts for your clients</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-user">
          <UserPlus className="h-4 w-4 mr-2" />
          Create User
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">All Users</CardTitle>
        </CardHeader>
        <CardContent>
          {usersLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : usersError ? (
            <div className="text-center py-8" data-testid="text-users-error">
              <p className="text-destructive font-medium">
                {(usersError as any)?.message?.includes("403")
                  ? "Access denied. Superadmin privileges required."
                  : "Failed to load users. Please try again."}
              </p>
            </div>
          ) : usersList.length === 0 ? (
            <p className="text-muted-foreground text-center py-8" data-testid="text-no-users">
              No users yet. Create your first user account.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usersList.map((u) => (
                    <TableRow key={u.id} data-testid={`row-user-${u.id}`}>
                      <TableCell>
                        <div className="font-medium" data-testid={`text-user-name-${u.id}`}>
                          {u.firstName || u.lastName
                            ? `${u.firstName || ""} ${u.lastName || ""}`.trim()
                            : "—"}
                        </div>
                      </TableCell>
                      <TableCell data-testid={`text-user-email-${u.id}`}>
                        {u.email || "—"}
                      </TableCell>
                      <TableCell>
                        {u.isSuperAdmin === "true" ? (
                          <Badge className="bg-primary/15 text-primary" data-testid={`badge-role-${u.id}`}>
                            <Shield className="h-3 w-3 mr-1" />
                            Superadmin
                          </Badge>
                        ) : (
                          <Badge variant="outline" data-testid={`badge-role-${u.id}`}>
                            User
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {u.createdAt
                          ? new Date(u.createdAt).toLocaleDateString()
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Create New User
            </DialogTitle>
            <DialogDescription>
              Create a login account for a client. They'll use their email and password to sign in.
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
              <Label htmlFor="newPassword">Password</Label>
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
              <p className="text-xs text-muted-foreground">Share this password with your client. They can use it to sign in.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="newTenant">Assign to Tenant</Label>
              <Select value={newTenantId} onValueChange={setNewTenantId}>
                <SelectTrigger data-testid="select-new-tenant">
                  <SelectValue placeholder="Select a tenant (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No tenant assignment</SelectItem>
                  {tenants?.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {newTenantId && newTenantId !== "none" && (
              <div className="space-y-2">
                <Label htmlFor="newRole">Tenant Role</Label>
                <Select value={newRole} onValueChange={setNewRole}>
                  <SelectTrigger data-testid="select-new-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">Viewer</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="owner">Owner</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

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
                    Create User
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
