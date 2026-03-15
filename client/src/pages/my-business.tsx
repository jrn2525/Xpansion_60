import { useState, useEffect } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Store,
  MapPin,
  BarChart3,
  Save,
  Loader2,
  Pencil,
  ArrowRight,
} from "lucide-react";
import { Link } from "wouter";
import type { Tenant, Location, MetricDefinition } from "@shared/schema";

const INDUSTRY_OPTIONS = [
  { value: "restaurant", label: "Restaurant / Food Service" },
  { value: "retail", label: "Retail" },
  { value: "fitness", label: "Fitness / Gym" },
  { value: "beauty", label: "Beauty / Salon / Spa" },
  { value: "automotive", label: "Automotive Services" },
  { value: "healthcare", label: "Healthcare / Medical" },
  { value: "home_services", label: "Home Services" },
  { value: "education", label: "Education / Tutoring" },
  { value: "cleaning", label: "Cleaning Services" },
  { value: "pet_services", label: "Pet Services" },
  { value: "real_estate", label: "Real Estate" },
  { value: "other", label: "Other" },
];

export default function MyBusinessPage() {
  const { toast } = useToast();
  const { activeTenantId } = useTenantStore();
  const [editingBusiness, setEditingBusiness] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [industry, setIndustry] = useState("");

  const { data: tenant, isLoading: tenantLoading } = useQuery<Tenant>({
    queryKey: ["/api/tenants", activeTenantId],
    enabled: !!activeTenantId,
  });

  const { data: locations, isLoading: locsLoading } = useQuery<Location[]>({
    queryKey: ["/api/tenants", activeTenantId, "locations"],
    enabled: !!activeTenantId,
  });

  const { data: metrics, isLoading: metricsLoading } = useQuery<MetricDefinition[]>({
    queryKey: ["/api/tenants", activeTenantId, "metrics"],
    enabled: !!activeTenantId,
  });

  const { data: progressData } = useQuery<any>({
    queryKey: ["/api/v1/onboarding/progress"],
  });

  useEffect(() => {
    if (tenant) {
      setBusinessName(tenant.name);
    }
    if (progressData?.savedData?.industry) {
      setIndustry(progressData.savedData.industry);
    }
  }, [tenant, progressData]);

  const updateTenantMutation = useMutation({
    mutationFn: async (data: { name: string }) => {
      await apiRequest("PATCH", `/api/tenants/${activeTenantId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", activeTenantId] });
      setEditingBusiness(false);
      toast({ title: "Business updated", description: "Your business name has been saved." });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update", description: error.message, variant: "destructive" });
    },
  });

  const updateIndustryMutation = useMutation({
    mutationFn: async (newIndustry: string) => {
      await apiRequest("PUT", "/api/v1/onboarding/progress", { savedData: { industry: newIndustry } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/onboarding/progress"] });
      toast({ title: "Industry updated" });
    },
  });

  const handleSaveBusiness = () => {
    if (!businessName.trim()) return;
    updateTenantMutation.mutate({ name: businessName.trim() });
    if (industry) {
      updateIndustryMutation.mutate(industry);
    }
  };

  const activeLocations = locations?.filter((l) => l.isActive) || [];
  const activeMetrics = metrics?.filter((m) => m.isActive) || [];
  const savedData = progressData?.savedData || {};
  const industryLabel = INDUSTRY_OPTIONS.find((o) => o.value === industry)?.label || industry;

  if (!activeTenantId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8" data-testid="page-my-business-empty">
        <Store className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h2 className="text-xl font-semibold mb-2">No Business Set Up</h2>
        <p className="text-muted-foreground max-w-md">
          Complete the onboarding wizard to set up your business.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto" data-testid="page-my-business">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" data-testid="text-page-title">
          <Store className="h-6 w-6" />
          My Business
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage your business profile, locations, and KPIs
        </p>
      </div>

      <Card data-testid="card-business-profile">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Business Profile</CardTitle>
          {!editingBusiness && (
            <Button variant="ghost" size="sm" onClick={() => setEditingBusiness(true)} data-testid="button-edit-business">
              <Pencil className="h-3.5 w-3.5 mr-1" />
              Edit
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {tenantLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : editingBusiness ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="businessName">Business Name</Label>
                <Input
                  id="businessName"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Your business name"
                  data-testid="input-business-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="industry">Industry</Label>
                <Select value={industry} onValueChange={setIndustry}>
                  <SelectTrigger data-testid="select-industry">
                    <SelectValue placeholder="Select industry" />
                  </SelectTrigger>
                  <SelectContent>
                    {INDUSTRY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => { setEditingBusiness(false); setBusinessName(tenant?.name || ""); }} data-testid="button-cancel-edit">
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveBusiness}
                  disabled={updateTenantMutation.isPending || !businessName.trim()}
                  data-testid="button-save-business"
                >
                  {updateTenantMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Business Name</p>
                <p className="text-sm font-medium" data-testid="text-business-name">{tenant?.name || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Industry</p>
                <p className="text-sm font-medium" data-testid="text-industry">{industryLabel || "—"}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-locations">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Locations</CardTitle>
          <Link href="/locations">
            <Button variant="ghost" size="sm" data-testid="button-manage-locations">
              Manage <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {locsLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : activeLocations.length === 0 ? (
            <div className="text-center py-6">
              <MapPin className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No locations added yet</p>
              <Link href="/locations">
                <Button variant="outline" size="sm" className="mt-2" data-testid="button-add-location">
                  Add Location
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {activeLocations.map((loc) => (
                <div key={loc.id} className="flex items-center justify-between py-2 border-b last:border-b-0" data-testid={`row-location-${loc.id}`}>
                  <div className="flex items-center gap-3">
                    <MapPin className="h-4 w-4 text-primary/60 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{loc.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[loc.city, loc.state].filter(Boolean).join(", ") || "No address"}
                      </p>
                    </div>
                  </div>
                  <Badge variant={loc.isActive ? "secondary" : "destructive"}>
                    {loc.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-kpis">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">KPIs & Metrics</CardTitle>
          <Link href="/metrics">
            <Button variant="ghost" size="sm" data-testid="button-manage-metrics">
              Manage <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {metricsLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : activeMetrics.length === 0 ? (
            <div className="text-center py-6">
              <BarChart3 className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No KPIs defined yet</p>
              <Link href="/metrics">
                <Button variant="outline" size="sm" className="mt-2" data-testid="button-add-metric">
                  Add KPI
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {activeMetrics.map((metric) => (
                <div key={metric.id} className="flex items-center justify-between py-2 border-b last:border-b-0" data-testid={`row-metric-${metric.id}`}>
                  <div className="flex items-center gap-3">
                    <BarChart3 className="h-4 w-4 text-primary/60 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{metric.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {metric.direction === "higher_is_better" ? "Higher is better" : "Lower is better"}
                      </p>
                    </div>
                  </div>
                  {metric.unit && <Badge variant="outline">{metric.unit}</Badge>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {savedData.trackingFrequency && (
        <Card data-testid="card-tracking">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tracking Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <div>
              <p className="text-xs text-muted-foreground">Tracking Frequency</p>
              <p className="text-sm font-medium capitalize" data-testid="text-tracking-frequency">
                {savedData.trackingFrequency}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
