import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/auth-utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, MapPin, Building2 } from "lucide-react";
import type { Location } from "@shared/schema";
import { useTenantStore } from "@/lib/tenant-store";

export default function LocationsPage() {
  const { toast } = useToast();
  const { activeTenantId } = useTenantStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    isActive: true,
  });

  const { data: locationsList, isLoading } = useQuery<Location[]>({
    queryKey: ["/api/tenants", activeTenantId, "locations"],
    enabled: !!activeTenantId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest(
        "POST",
        `/api/tenants/${activeTenantId}/locations`,
        data
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/tenants", activeTenantId, "locations"],
      });
      setDialogOpen(false);
      resetForm();
      toast({ title: "Location created" });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        window.location.href = "/api/login";
        return;
      }
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest(
        "PATCH",
        `/api/tenants/${activeTenantId}/locations/${id}`,
        data
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/tenants", activeTenantId, "locations"],
      });
      setDialogOpen(false);
      setEditingLocation(null);
      resetForm();
      toast({ title: "Location updated" });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        window.location.href = "/api/login";
        return;
      }
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest(
        "DELETE",
        `/api/tenants/${activeTenantId}/locations/${id}`
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/tenants", activeTenantId, "locations"],
      });
      toast({ title: "Location deleted" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  function resetForm() {
    setFormData({
      name: "",
      address: "",
      city: "",
      state: "",
      zipCode: "",
      isActive: true,
    });
  }

  function openCreate() {
    resetForm();
    setEditingLocation(null);
    setDialogOpen(true);
  }

  function openEdit(location: Location) {
    setEditingLocation(location);
    setFormData({
      name: location.name,
      address: location.address || "",
      city: location.city || "",
      state: location.state || "",
      zipCode: location.zipCode || "",
      isActive: location.isActive,
    });
    setDialogOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingLocation) {
      updateMutation.mutate({ id: editingLocation.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  }

  if (!activeTenantId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">No Client Selected</h2>
        <p className="text-muted-foreground">
          Select a client from the sidebar to manage locations.
        </p>
      </div>
    );
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-1">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-locations-title">
            Locations
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage franchise locations
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate} data-testid="button-create-location">
              <Plus className="h-4 w-4 mr-2" />
              New Location
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingLocation ? "Edit Location" : "Create Location"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="loc-name">Name</Label>
                <Input
                  id="loc-name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="Downtown Flagship"
                  data-testid="input-location-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="loc-address">Address</Label>
                <Input
                  id="loc-address"
                  value={formData.address}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      address: e.target.value,
                    }))
                  }
                  placeholder="100 Main Street"
                  data-testid="input-location-address"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="loc-city">City</Label>
                  <Input
                    id="loc-city"
                    value={formData.city}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        city: e.target.value,
                      }))
                    }
                    placeholder="Austin"
                    data-testid="input-location-city"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loc-state">State</Label>
                  <Input
                    id="loc-state"
                    value={formData.state}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        state: e.target.value,
                      }))
                    }
                    placeholder="TX"
                    data-testid="input-location-state"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loc-zip">ZIP</Label>
                  <Input
                    id="loc-zip"
                    value={formData.zipCode}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        zipCode: e.target.value,
                      }))
                    }
                    placeholder="78701"
                    data-testid="input-location-zip"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.isActive}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, isActive: checked }))
                  }
                  data-testid="switch-location-active"
                />
                <Label>Active</Label>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={isPending}
                data-testid="button-submit-location"
              >
                {isPending
                  ? "Saving..."
                  : editingLocation
                    ? "Update Location"
                    : "Create Location"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-6 w-48 mb-2" />
                <Skeleton className="h-4 w-64" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !locationsList || locationsList.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <MapPin className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg mb-1">No locations yet</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Add your first location to start tracking performance
            </p>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Add Location
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {locationsList.map((loc) => (
            <Card key={loc.id} data-testid={`card-location-${loc.id}`}>
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 shrink-0">
                    <MapPin className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-medium truncate">{loc.name}</h3>
                    <p className="text-sm text-muted-foreground truncate">
                      {[loc.address, loc.city, loc.state, loc.zipCode]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={loc.isActive ? "secondary" : "destructive"}>
                    {loc.isActive ? "Active" : "Inactive"}
                  </Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => openEdit(loc)}
                    data-testid={`button-edit-location-${loc.id}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        data-testid={`button-delete-location-${loc.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Location</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete "{loc.name}" and all
                          associated data.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteMutation.mutate(loc.id)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
