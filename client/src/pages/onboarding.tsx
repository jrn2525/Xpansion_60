import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTenantStore } from "@/lib/tenant-store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  SkipForward,
  Building2,
  MapPin,
  BarChart3,
  ClipboardCheck,
  Play,
  Bell,
  PartyPopper,
  Loader2,
} from "lucide-react";
import type { Tenant, Location as LocationType, MetricDefinition, ScorecardTemplate } from "@shared/schema";

const STEPS = [
  { key: "tenant", label: "Create/Select Tenant", icon: Building2, description: "Set up your organization" },
  { key: "location", label: "Add First Location", icon: MapPin, description: "Add a business location" },
  { key: "kpis", label: "Create Starter KPIs", icon: BarChart3, description: "Revenue, CSAT, Labor Cost" },
  { key: "scorecard", label: "Create Scorecard", icon: ClipboardCheck, description: "Weighted performance card" },
  { key: "score_run", label: "Run Scorecard", icon: Play, description: "Execute for a location" },
  { key: "alert", label: "Enable Alert Rule", icon: Bell, description: "Auto-alert on revenue dip" },
];

export default function OnboardingPage() {
  const [, setLoc] = useLocation();
  const { toast } = useToast();
  const { activeTenantId, setActiveTenantId } = useTenantStore();

  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [isComplete, setIsComplete] = useState(false);

  const [tenantName, setTenantName] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null);
  const [createMode, setCreateMode] = useState(true);

  const [locName, setLocName] = useState("");
  const [locCity, setLocCity] = useState("");
  const [locState, setLocState] = useState("");

  const [createdMetrics, setCreatedMetrics] = useState<MetricDefinition[]>([]);
  const [createdScorecard, setCreatedScorecard] = useState<ScorecardTemplate | null>(null);
  const [createdLocationId, setCreatedLocationId] = useState<number | null>(null);

  const [scoreRunPeriod, setScoreRunPeriod] = useState("month");

  const { data: tenantsList, isLoading: tenantsLoading } = useQuery<Tenant[]>({
    queryKey: ["/api/tenants"],
  });

  const { data: progressData } = useQuery<any>({
    queryKey: ["/api/v1/onboarding/progress"],
  });

  useEffect(() => {
    if (progressData?.data) {
      const d = progressData.data;
      if (d.isComplete) {
        setIsComplete(true);
      }
      if (d.currentStep) setCurrentStep(d.currentStep);
      if (d.completedSteps) setCompletedSteps(d.completedSteps);
      if (d.tenantId) {
        setSelectedTenantId(d.tenantId);
        setActiveTenantId(d.tenantId);
      }
    }
  }, [progressData, setActiveTenantId]);

  useEffect(() => {
    if (tenantsList && tenantsList.length > 0 && !selectedTenantId) {
      setCreateMode(false);
    }
  }, [tenantsList, selectedTenantId]);

  const effectiveTenantId = selectedTenantId || activeTenantId;

  const { data: locations } = useQuery<LocationType[]>({
    queryKey: ["/api/tenants", effectiveTenantId, "locations"],
    enabled: !!effectiveTenantId,
  });

  const { data: scorecards } = useQuery<ScorecardTemplate[]>({
    queryKey: ["/api/tenants", effectiveTenantId, "scorecards"],
    enabled: !!effectiveTenantId,
  });

  const markStepComplete = (stepKey: string) => {
    const newCompleted = Array.from(new Set([...completedSteps, stepKey]));
    setCompletedSteps(newCompleted);

    if (effectiveTenantId) {
      apiRequest("PUT", "/api/v1/onboarding/progress", {
        tenantId: effectiveTenantId,
        currentStep: currentStep + 1,
        completedSteps: newCompleted,
      }).catch(() => {});
    }
  };

  const createTenantMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/tenants", {
        name: tenantName,
        slug: tenantSlug || tenantName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
      });
      return res.json();
    },
    onSuccess: (data: Tenant) => {
      setSelectedTenantId(data.id);
      setActiveTenantId(data.id);
      queryClient.invalidateQueries({ queryKey: ["/api/tenants"] });
      markStepComplete("tenant");
      setCurrentStep(1);
      toast({ title: "Tenant created", description: `"${data.name}" is ready.` });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const selectExistingTenant = () => {
    if (!selectedTenantId) return;
    setActiveTenantId(selectedTenantId);
    markStepComplete("tenant");
    setCurrentStep(1);
    toast({ title: "Tenant selected" });
  };

  const createLocationMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/tenants/${effectiveTenantId}/locations`, {
        name: locName,
        city: locCity,
        state: locState,
      });
      return res.json();
    },
    onSuccess: (data: LocationType) => {
      setCreatedLocationId(data.id);
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", effectiveTenantId, "locations"] });
      markStepComplete("location");
      setCurrentStep(2);
      toast({ title: "Location added", description: `"${data.name}" created.` });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const createKpisMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/v1/onboarding/starter-kpis", {
        tenantId: effectiveTenantId,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      setCreatedMetrics(data.data?.metrics || []);
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", effectiveTenantId, "metrics"] });
      markStepComplete("kpis");
      setCurrentStep(3);
      toast({ title: "KPIs created", description: "3 starter KPIs ready." });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const createScorecardMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/v1/onboarding/starter-scorecard", {
        tenantId: effectiveTenantId,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      setCreatedScorecard(data.data?.scorecard || null);
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", effectiveTenantId, "scorecards"] });
      markStepComplete("scorecard");
      setCurrentStep(4);
      toast({ title: "Scorecard created", description: "Starter Performance Scorecard ready." });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const runScorecardMut = useMutation({
    mutationFn: async () => {
      const scorecardId = createdScorecard?.id || scorecards?.[0]?.id;
      const locationId = createdLocationId || locations?.[0]?.id;
      if (!scorecardId || !locationId) throw new Error("Need scorecard and location first");

      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const res = await apiRequest("POST", `/api/tenants/${effectiveTenantId}/scorecards/${scorecardId}/run`, {
        locationId,
        period: scoreRunPeriod,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
      });
      return res.json();
    },
    onSuccess: () => {
      markStepComplete("score_run");
      setCurrentStep(5);
      toast({ title: "Scorecard executed", description: "Score run completed." });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const createAlertMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/v1/onboarding/starter-alert", {
        tenantId: effectiveTenantId,
      });
      return res.json();
    },
    onSuccess: () => {
      markStepComplete("alert");
      setIsComplete(true);
      apiRequest("POST", "/api/v1/onboarding/complete", {
        tenantId: effectiveTenantId,
      }).catch(() => {});
      toast({ title: "Alert rule enabled", description: "Revenue alert is active." });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const goBack = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };

  const skipStep = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  if (isComplete) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] p-6" data-testid="onboarding-complete">
        <Card className="max-w-lg w-full text-center">
          <CardContent className="pt-8 pb-8 space-y-6">
            <div className="flex justify-center">
              <div className="h-16 w-16 rounded-full bg-status-success/15 flex items-center justify-center">
                <PartyPopper className="h-8 w-8 text-status-success-foreground" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold" data-testid="text-complete-title">Setup Complete</h2>
              <p className="text-muted-foreground">
                Your franchise console is ready. Head to the Daily Brief for an overview of your operations.
              </p>
            </div>
            <Button
              onClick={() => setLoc("/brief")}
              data-testid="button-go-to-brief"
            >
              Go to Daily Brief
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center p-6 space-y-6 max-w-3xl mx-auto">
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold" data-testid="text-onboarding-title">Welcome to Xpansion Console</h1>
        <p className="text-muted-foreground">Let's get your franchise set up in a few quick steps.</p>
      </div>

      <div className="w-full" data-testid="progress-bar">
        <div className="flex items-center justify-between mb-2">
          {STEPS.map((step, i) => {
            const done = completedSteps.includes(step.key);
            const active = i === currentStep;
            return (
              <button
                key={step.key}
                onClick={() => setCurrentStep(i)}
                className="flex flex-col items-center gap-1 flex-1"
                data-testid={`step-indicator-${step.key}`}
              >
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                    done
                      ? "bg-primary text-primary-foreground"
                      : active
                        ? "bg-primary/20 text-primary border border-primary"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                </div>
                <span className={`text-[10px] text-center leading-tight hidden sm:block ${active ? "font-semibold" : "text-muted-foreground"}`}>
                  {step.label}
                </span>
              </button>
            );
          })}
        </div>
        <div className="w-full bg-muted rounded-full h-1.5">
          <div
            className="bg-primary h-1.5 rounded-full transition-all"
            style={{ width: `${(completedSteps.length / STEPS.length) * 100}%` }}
            data-testid="progress-fill"
          />
        </div>
      </div>

      <Card className="w-full">
        <CardHeader>
          <div className="flex items-center gap-3">
            {(() => {
              const StepIcon = STEPS[currentStep].icon;
              return <StepIcon className="h-5 w-5 text-primary" />;
            })()}
            <div>
              <CardTitle className="text-lg" data-testid="text-step-title">
                Step {currentStep + 1}: {STEPS[currentStep].label}
              </CardTitle>
              <CardDescription>{STEPS[currentStep].description}</CardDescription>
            </div>
          </div>
          {completedSteps.includes(STEPS[currentStep].key) && (
            <Badge variant="secondary" className="w-fit" data-testid="badge-step-complete">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Completed
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {currentStep === 0 && (
            <StepTenant
              tenantsList={tenantsList || []}
              tenantsLoading={tenantsLoading}
              createMode={createMode}
              setCreateMode={setCreateMode}
              tenantName={tenantName}
              setTenantName={setTenantName}
              tenantSlug={tenantSlug}
              setTenantSlug={setTenantSlug}
              selectedTenantId={selectedTenantId}
              setSelectedTenantId={setSelectedTenantId}
              onCreateTenant={() => createTenantMut.mutate()}
              onSelectExisting={selectExistingTenant}
              isPending={createTenantMut.isPending}
            />
          )}

          {currentStep === 1 && (
            <StepLocation
              locName={locName}
              setLocName={setLocName}
              locCity={locCity}
              setLocCity={setLocCity}
              locState={locState}
              setLocState={setLocState}
              onCreateLocation={() => createLocationMut.mutate()}
              isPending={createLocationMut.isPending}
              existingLocations={locations || []}
              onSelectExisting={(loc) => {
                setCreatedLocationId(loc.id);
                markStepComplete("location");
                setCurrentStep(2);
              }}
            />
          )}

          {currentStep === 2 && (
            <StepKPIs
              onCreateKpis={() => createKpisMut.mutate()}
              isPending={createKpisMut.isPending}
              createdMetrics={createdMetrics}
            />
          )}

          {currentStep === 3 && (
            <StepScorecard
              onCreateScorecard={() => createScorecardMut.mutate()}
              isPending={createScorecardMut.isPending}
              createdScorecard={createdScorecard}
            />
          )}

          {currentStep === 4 && (
            <StepScoreRun
              onRunScorecard={() => runScorecardMut.mutate()}
              isPending={runScorecardMut.isPending}
              locations={locations || []}
              scorecards={scorecards || []}
              createdLocationId={createdLocationId}
              createdScorecard={createdScorecard}
              scoreRunPeriod={scoreRunPeriod}
              setScoreRunPeriod={setScoreRunPeriod}
            />
          )}

          {currentStep === 5 && (
            <StepAlert
              onCreateAlert={() => createAlertMut.mutate()}
              isPending={createAlertMut.isPending}
            />
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-2 w-full">
        <Button
          variant="outline"
          onClick={goBack}
          disabled={currentStep === 0}
          data-testid="button-back"
        >
          <ChevronLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Button
          variant="ghost"
          onClick={skipStep}
          disabled={currentStep >= STEPS.length - 1}
          data-testid="button-skip"
        >
          Skip <SkipForward className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

function StepTenant({
  tenantsList,
  tenantsLoading,
  createMode,
  setCreateMode,
  tenantName,
  setTenantName,
  tenantSlug,
  setTenantSlug,
  selectedTenantId,
  setSelectedTenantId,
  onCreateTenant,
  onSelectExisting,
  isPending,
}: {
  tenantsList: Tenant[];
  tenantsLoading: boolean;
  createMode: boolean;
  setCreateMode: (v: boolean) => void;
  tenantName: string;
  setTenantName: (v: string) => void;
  tenantSlug: string;
  setTenantSlug: (v: string) => void;
  selectedTenantId: number | null;
  setSelectedTenantId: (v: number | null) => void;
  onCreateTenant: () => void;
  onSelectExisting: () => void;
  isPending: boolean;
}) {
  if (tenantsLoading) return <Skeleton className="h-20 w-full" />;

  return (
    <div className="space-y-4">
      {tenantsList.length > 0 && (
        <div className="flex gap-2">
          <Button
            variant={createMode ? "default" : "outline"}
            onClick={() => setCreateMode(true)}
            data-testid="button-create-tenant-mode"
          >
            Create New
          </Button>
          <Button
            variant={!createMode ? "default" : "outline"}
            onClick={() => setCreateMode(false)}
            data-testid="button-select-tenant-mode"
          >
            Use Existing
          </Button>
        </div>
      )}

      {createMode ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="tenant-name">Organization Name</Label>
            <Input
              id="tenant-name"
              placeholder="My Franchise Corp"
              value={tenantName}
              onChange={(e) => {
                setTenantName(e.target.value);
                setTenantSlug(e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""));
              }}
              data-testid="input-tenant-name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tenant-slug">Slug</Label>
            <Input
              id="tenant-slug"
              placeholder="my-franchise-corp"
              value={tenantSlug}
              onChange={(e) => setTenantSlug(e.target.value)}
              data-testid="input-tenant-slug"
            />
          </div>
          <Button
            onClick={onCreateTenant}
            disabled={!tenantName.trim() || isPending}
            data-testid="button-create-tenant"
          >
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Tenant
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <Label>Select existing tenant</Label>
          <Select
            value={selectedTenantId?.toString() || ""}
            onValueChange={(v) => setSelectedTenantId(parseInt(v))}
          >
            <SelectTrigger data-testid="select-existing-tenant">
              <SelectValue placeholder="Choose a tenant" />
            </SelectTrigger>
            <SelectContent>
              {tenantsList.map((t) => (
                <SelectItem key={t.id} value={t.id.toString()} data-testid={`option-tenant-${t.id}`}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={onSelectExisting}
            disabled={!selectedTenantId}
            data-testid="button-select-tenant"
          >
            Continue with Selected Tenant
          </Button>
        </div>
      )}
    </div>
  );
}

function StepLocation({
  locName,
  setLocName,
  locCity,
  setLocCity,
  locState,
  setLocState,
  onCreateLocation,
  isPending,
  existingLocations,
  onSelectExisting,
}: {
  locName: string;
  setLocName: (v: string) => void;
  locCity: string;
  setLocCity: (v: string) => void;
  locState: string;
  setLocState: (v: string) => void;
  onCreateLocation: () => void;
  isPending: boolean;
  existingLocations: LocationType[];
  onSelectExisting: (loc: LocationType) => void;
}) {
  return (
    <div className="space-y-4">
      {existingLocations.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">You already have locations. Select one or create a new one.</p>
          <div className="flex flex-wrap gap-2">
            {existingLocations.map((loc) => (
              <Button
                key={loc.id}
                variant="outline"
                onClick={() => onSelectExisting(loc)}
                data-testid={`button-select-location-${loc.id}`}
              >
                <MapPin className="h-3.5 w-3.5 mr-1.5" /> {loc.name}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="loc-name">Location Name</Label>
          <Input
            id="loc-name"
            placeholder="Downtown Store"
            value={locName}
            onChange={(e) => setLocName(e.target.value)}
            data-testid="input-location-name"
          />
        </div>
        <div className="flex gap-3 flex-wrap">
          <div className="space-y-1.5 flex-1 min-w-[140px]">
            <Label htmlFor="loc-city">City</Label>
            <Input
              id="loc-city"
              placeholder="Austin"
              value={locCity}
              onChange={(e) => setLocCity(e.target.value)}
              data-testid="input-location-city"
            />
          </div>
          <div className="space-y-1.5 flex-1 min-w-[140px]">
            <Label htmlFor="loc-state">State</Label>
            <Input
              id="loc-state"
              placeholder="TX"
              value={locState}
              onChange={(e) => setLocState(e.target.value)}
              data-testid="input-location-state"
            />
          </div>
        </div>
        <Button
          onClick={onCreateLocation}
          disabled={!locName.trim() || isPending}
          data-testid="button-create-location"
        >
          {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Add Location
        </Button>
      </div>
    </div>
  );
}

function StepKPIs({
  onCreateKpis,
  isPending,
  createdMetrics,
}: {
  onCreateKpis: () => void;
  isPending: boolean;
  createdMetrics: MetricDefinition[];
}) {
  const kpiTemplates = [
    { name: "Revenue", desc: "Track location revenue (USD)", icon: "$" },
    { name: "Customer Satisfaction", desc: "Customer satisfaction score (%)", icon: "%" },
    { name: "Labor Cost %", desc: "Labor cost as percentage of revenue", icon: "%" },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        We'll create 3 industry-standard KPIs with pre-configured thresholds.
      </p>
      <div className="grid gap-3">
        {kpiTemplates.map((kpi) => {
          const created = createdMetrics.find((m) => m.name === kpi.name);
          return (
            <div
              key={kpi.name}
              className="flex items-center gap-3 p-3 rounded-md border"
              data-testid={`kpi-template-${kpi.name.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                {kpi.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{kpi.name}</p>
                <p className="text-xs text-muted-foreground">{kpi.desc}</p>
              </div>
              {created && (
                <Badge variant="secondary" data-testid={`badge-kpi-created-${kpi.name.toLowerCase().replace(/\s+/g, "-")}`}>
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Created
                </Badge>
              )}
            </div>
          );
        })}
      </div>
      <Button
        onClick={onCreateKpis}
        disabled={isPending || createdMetrics.length >= 3}
        data-testid="button-create-kpis"
      >
        {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        {createdMetrics.length >= 3 ? "KPIs Already Created" : "Create All 3 KPIs"}
      </Button>
    </div>
  );
}

function StepScorecard({
  onCreateScorecard,
  isPending,
  createdScorecard,
}: {
  onCreateScorecard: () => void;
  isPending: boolean;
  createdScorecard: ScorecardTemplate | null;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Create a weighted scorecard that combines your 3 KPIs into one performance score.
        Each metric will be weighted equally (~33%).
      </p>
      <div className="p-3 rounded-md border">
        <p className="text-sm font-medium">Starter Performance Scorecard</p>
        <p className="text-xs text-muted-foreground mt-1">Revenue + Customer Satisfaction + Labor Cost % (equal weights)</p>
      </div>
      {createdScorecard && (
        <Badge variant="secondary" data-testid="badge-scorecard-created">
          <CheckCircle2 className="h-3 w-3 mr-1" /> Scorecard Created (ID: {createdScorecard.id})
        </Badge>
      )}
      <Button
        onClick={onCreateScorecard}
        disabled={isPending || !!createdScorecard}
        data-testid="button-create-scorecard"
      >
        {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        {createdScorecard ? "Scorecard Already Created" : "Create Scorecard"}
      </Button>
    </div>
  );
}

function StepScoreRun({
  onRunScorecard,
  isPending,
  locations,
  scorecards,
  createdLocationId,
  createdScorecard,
  scoreRunPeriod,
  setScoreRunPeriod,
}: {
  onRunScorecard: () => void;
  isPending: boolean;
  locations: LocationType[];
  scorecards: ScorecardTemplate[];
  createdLocationId: number | null;
  createdScorecard: ScorecardTemplate | null;
  scoreRunPeriod: string;
  setScoreRunPeriod: (v: string) => void;
}) {
  const locationName = locations.find((l) => l.id === createdLocationId)?.name || locations[0]?.name || "No location";
  const scorecardName = createdScorecard?.name || scorecards[0]?.name || "No scorecard";

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Run your scorecard against a location for the current period.
        This will compute a performance score from any available metric data.
      </p>
      <div className="space-y-3">
        <div className="p-3 rounded-md border space-y-1">
          <p className="text-xs text-muted-foreground">Location</p>
          <p className="text-sm font-medium" data-testid="text-run-location">{locationName}</p>
        </div>
        <div className="p-3 rounded-md border space-y-1">
          <p className="text-xs text-muted-foreground">Scorecard</p>
          <p className="text-sm font-medium" data-testid="text-run-scorecard">{scorecardName}</p>
        </div>
        <div className="space-y-1.5">
          <Label>Period</Label>
          <Select value={scoreRunPeriod} onValueChange={setScoreRunPeriod}>
            <SelectTrigger data-testid="select-period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">Month</SelectItem>
              <SelectItem value="quarter">Quarter</SelectItem>
              <SelectItem value="year">Year</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button
        onClick={onRunScorecard}
        disabled={isPending || (!createdLocationId && locations.length === 0)}
        data-testid="button-run-scorecard"
      >
        {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        Run Scorecard
      </Button>
    </div>
  );
}

function StepAlert({
  onCreateAlert,
  isPending,
}: {
  onCreateAlert: () => void;
  isPending: boolean;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Enable a default alert rule that fires when Revenue drops below target ($15,000).
        This helps you catch problems early.
      </p>
      <div className="p-3 rounded-md border space-y-2">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          <p className="text-sm font-medium">Revenue Below Target</p>
        </div>
        <p className="text-xs text-muted-foreground">Severity: High | Threshold: Revenue &lt; $15,000 | Cooldown: 24h</p>
        <div className="text-xs text-muted-foreground">
          <p className="font-medium mb-1">Recommended actions:</p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>Review recent marketing spend and ROI</li>
            <li>Check staffing levels against traffic patterns</li>
            <li>Analyze top-selling vs underperforming products</li>
            <li>Compare to nearby competitor pricing</li>
          </ul>
        </div>
      </div>
      <Button
        onClick={onCreateAlert}
        disabled={isPending}
        data-testid="button-create-alert"
      >
        {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        Enable Alert Rule & Complete Setup
      </Button>
    </div>
  );
}
