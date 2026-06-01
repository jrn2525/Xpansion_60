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
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  Plus,
  UserPlus,
  Loader2,
  Shield,
  Pencil,
  MoreHorizontal,
  PauseCircle,
  PlayCircle,
  Trash2,
} from "lucide-react";

interface AppUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  businessName: string | null;
  isSuperAdmin: string | null;
  suspendedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string | null;
}

function displayName(u: AppUser): string {
  const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
  return name || u.email || "—";
}

export default function AdminUsersPage() {
  const { toast } = useToast();

  const [showCreate, setShowCreate] = useState(false);
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newBusinessName, setNewBusinessName] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editBusinessName, setEditBusinessName] = useState("");
  const [editPassword, setEditPassword] = useState("");

  const [deletingUser, setDeletingUser] = useState<AppUser | null>(null);

  const { data: users, isLoading, error } = useQuery<AppUser[]>({
    queryKey: ["/api/admin/users"],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/users", {
        email: newEmail,
        firstName: newFirstName,
        lastName: newLastName,
        phone: newPhone,
        businessName: newBusinessName,
        password: newPassword,
      });
      return res.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setShowCreate(false);
      resetCreate();
      toast({
        title: "User created",
        description: `Account created for ${result?.data?.email ?? "user"}`,
      });
    },
    onError: (e: any) =>
      toast({
        title: "Failed to create user",
        description: e?.message ?? "Unknown error",
        variant: "destructive",
      }),
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!editingUser) return;
      const payload: Record<string, unknown> = {
        firstName: editFirstName,
        lastName: editLastName,
        email: editEmail,
        phone: editPhone,
        businessName: editBusinessName,
      };
      if (editPassword) payload.password = editPassword;
      const res = await apiRequest("PUT", `/api/admin/users/${editingUser.id}`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User updated" });
      setEditingUser(null);
      setEditPassword("");
    },
    onError: (e: any) =>
      toast({
        title: "Update failed",
        description: e?.message ?? "Unknown error",
        variant: "destructive",
      }),
  });

  const suspendMutation = useMutation({
    mutationFn: async ({ id, suspended }: { id: string; suspended: boolean }) => {
      const path = suspended ? "unsuspend" : "suspend";
      const res = await apiRequest("POST", `/api/admin/users/${id}/${path}`);
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: variables.suspended ? "User restored" : "User suspended",
        description: variables.suspended
          ? "They can log in again."
          : "They can no longer log in.",
      });
    },
    onError: (e: any) =>
      toast({
        title: "Action failed",
        description: e?.message ?? "Unknown error",
        variant: "destructive",
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/users/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User deleted" });
      setDeletingUser(null);
    },
    onError: (e: any) =>
      toast({
        title: "Delete failed",
        description: e?.message ?? "Unknown error",
        variant: "destructive",
      }),
  });

  function resetCreate() {
    setNewFirstName("");
    setNewLastName("");
    setNewEmail("");
    setNewPhone("");
    setNewBusinessName("");
    setNewPassword("");
  }

  function openEdit(u: AppUser) {
    setEditingUser(u);
    setEditFirstName(u.firstName ?? "");
    setEditLastName(u.lastName ?? "");
    setEditEmail(u.email ?? "");
    setEditPhone(u.phone ?? "");
    setEditBusinessName(u.businessName ?? "");
    setEditPassword("");
  }

  const list = users ?? [];

  return (
    <div className="p-6 max-w-6xl space-y-6" data-testid="page-admin-users">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" />
            User Management
          </h1>
          <p className="text-muted-foreground text-sm">
            Create and manage user accounts for your clients
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} data-testid="button-create-user">
          <UserPlus className="h-4 w-4 mr-2" />
          Create User
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">All Users</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-destructive font-medium">
                {(error as any)?.message?.includes("403")
                  ? "Access denied. Superadmin privileges required."
                  : "Failed to load users. Please try again."}
              </p>
            </div>
          ) : list.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No users yet. Create your first user account.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Business</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last login</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((u) => {
                    const suspended = !!u.suspendedAt;
                    const isAdmin = u.isSuperAdmin === "true";
                    return (
                      <TableRow key={u.id} data-testid={`row-user-${u.id}`}>
                        <TableCell className="font-medium">{displayName(u)}</TableCell>
                        <TableCell>{u.email ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {u.phone ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {u.businessName ?? "—"}
                        </TableCell>
                        <TableCell>
                          {isAdmin ? (
                            <Badge className="bg-primary/15 text-primary">
                              <Shield className="h-3 w-3 mr-1" />
                              Admin
                            </Badge>
                          ) : suspended ? (
                            <Badge variant="outline" className="border-amber-500 text-amber-600">
                              Suspended
                            </Badge>
                          ) : (
                            <Badge variant="outline">Active</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {u.lastLoginAt
                            ? new Date(u.lastLoginAt).toLocaleDateString()
                            : "Never"}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                data-testid={`button-actions-${u.id}`}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => openEdit(u)}
                                data-testid={`menu-edit-${u.id}`}
                              >
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              {!isAdmin && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    suspendMutation.mutate({ id: u.id, suspended })
                                  }
                                  data-testid={`menu-suspend-${u.id}`}
                                >
                                  {suspended ? (
                                    <>
                                      <PlayCircle className="h-4 w-4 mr-2" />
                                      Restore access
                                    </>
                                  ) : (
                                    <>
                                      <PauseCircle className="h-4 w-4 mr-2" />
                                      Suspend
                                    </>
                                  )}
                                </DropdownMenuItem>
                              )}
                              {!isAdmin && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => setDeletingUser(u)}
                                    className="text-destructive focus:text-destructive"
                                    data-testid={`menu-delete-${u.id}`}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Create New User
            </DialogTitle>
            <DialogDescription>
              Create a login account for a client. They'll sign in with this
              email and password.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate();
            }}
            className="space-y-4"
          >
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
              <Label htmlFor="newPhone">Phone Number</Label>
              <Input
                id="newPhone"
                type="tel"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="555-123-4567"
                data-testid="input-new-phone"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="newBusinessName">Business Name</Label>
              <Input
                id="newBusinessName"
                value={newBusinessName}
                onChange={(e) => setNewBusinessName(e.target.value)}
                placeholder="Sunrise Burgers, LLC"
                data-testid="input-new-business-name"
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
              <p className="text-xs text-muted-foreground">
                Share this with your client. They'll be asked to change it on
                first sign-in.
              </p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowCreate(false);
                  resetCreate();
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                data-testid="button-submit-create"
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Creating…
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Create User
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog
        open={!!editingUser}
        onOpenChange={(open) => {
          if (!open) {
            setEditingUser(null);
            setEditPassword("");
          }
        }}
      >
        {editingUser && (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-5 w-5" />
                Edit User
              </DialogTitle>
              <DialogDescription>{editingUser.email}</DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                editMutation.mutate();
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="editFirstName">First Name</Label>
                  <Input
                    id="editFirstName"
                    value={editFirstName}
                    onChange={(e) => setEditFirstName(e.target.value)}
                    data-testid="input-edit-first-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editLastName">Last Name</Label>
                  <Input
                    id="editLastName"
                    value={editLastName}
                    onChange={(e) => setEditLastName(e.target.value)}
                    data-testid="input-edit-last-name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="editEmail">Email</Label>
                <Input
                  id="editEmail"
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  required
                  data-testid="input-edit-email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="editPhone">Phone Number</Label>
                <Input
                  id="editPhone"
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  data-testid="input-edit-phone"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="editBusinessName">Business Name</Label>
                <Input
                  id="editBusinessName"
                  value={editBusinessName}
                  onChange={(e) => setEditBusinessName(e.target.value)}
                  data-testid="input-edit-business-name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="editPassword">Reset password (optional)</Label>
                <Input
                  id="editPassword"
                  type="text"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="Leave blank to keep current password"
                  minLength={8}
                  data-testid="input-edit-password"
                />
                <p className="text-xs text-muted-foreground">
                  If set, the user must change it on their next sign-in.
                </p>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingUser(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={editMutation.isPending}
                  data-testid="button-submit-edit"
                >
                  {editMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Saving…
                    </>
                  ) : (
                    "Save changes"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deletingUser}
        onOpenChange={(open) => !open && setDeletingUser(null)}
      >
        {deletingUser && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this user?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes <strong>{displayName(deletingUser)}</strong>{" "}
                ({deletingUser.email}). Their enrollments, feedback, and reflections
                are removed. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteMutation.mutate(deletingUser.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete"
              >
                {deleteMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Deleting…
                  </>
                ) : (
                  "Delete user"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </div>
  );
}
