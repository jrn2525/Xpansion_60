import { useState, useEffect, useCallback } from "react";
import { Logo } from "@/components/logo";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTenantStore } from "@/lib/tenant-store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  ChevronRight,
  User,
  Building2,
  MapPin,
  BarChart3,
  Target,
  Loader2,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  PartyPopper,
  Network,
  Minus,
} from "lucide-react";

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

const INDUSTRY_KPI_SUGGESTIONS: Record<string, { name: string; unit: string; dataType: string; direction: string }[]> = {
  restaurant: [
    { name: "Revenue", unit: "USD", dataType: "currency", direction: "higher_is_better" },
    { name: "Food Cost %", unit: "%", dataType: "percentage", direction: "lower_is_better" },
    { name: "Labor Cost %", unit: "%", dataType: "percentage", direction: "lower_is_better" },
    { name: "Customer Satisfaction", unit: "%", dataType: "percentage", direction: "higher_is_better" },
    { name: "Average Ticket Size", unit: "USD", dataType: "currency", direction: "higher_is_better" },
    { name: "Table Turnover Rate", unit: "turns", dataType: "number", direction: "higher_is_better" },
  ],
  retail: [
    { name: "Revenue", unit: "USD", dataType: "currency", direction: "higher_is_better" },
    { name: "Gross Margin %", unit: "%", dataType: "percentage", direction: "higher_is_better" },
    { name: "Inventory Turnover", unit: "turns", dataType: "number", direction: "higher_is_better" },
    { name: "Customer Satisfaction", unit: "%", dataType: "percentage", direction: "higher_is_better" },
    { name: "Average Transaction Value", unit: "USD", dataType: "currency", direction: "higher_is_better" },
    { name: "Shrinkage Rate", unit: "%", dataType: "percentage", direction: "lower_is_better" },
  ],
  fitness: [
    { name: "Monthly Revenue", unit: "USD", dataType: "currency", direction: "higher_is_better" },
    { name: "Member Retention Rate", unit: "%", dataType: "percentage", direction: "higher_is_better" },
    { name: "New Member Sign-ups", unit: "members", dataType: "number", direction: "higher_is_better" },
    { name: "Average Revenue Per Member", unit: "USD", dataType: "currency", direction: "higher_is_better" },
    { name: "Class Utilization Rate", unit: "%", dataType: "percentage", direction: "higher_is_better" },
  ],
  beauty: [
    { name: "Revenue", unit: "USD", dataType: "currency", direction: "higher_is_better" },
    { name: "Client Retention Rate", unit: "%", dataType: "percentage", direction: "higher_is_better" },
    { name: "Average Service Value", unit: "USD", dataType: "currency", direction: "higher_is_better" },
    { name: "Utilization Rate", unit: "%", dataType: "percentage", direction: "higher_is_better" },
    { name: "Product Sales %", unit: "%", dataType: "percentage", direction: "higher_is_better" },
  ],
  default: [
    { name: "Revenue", unit: "USD", dataType: "currency", direction: "higher_is_better" },
    { name: "Customer Satisfaction", unit: "%", dataType: "percentage", direction: "higher_is_better" },
    { name: "Labor Cost %", unit: "%", dataType: "percentage", direction: "lower_is_better" },
    { name: "Net Profit Margin", unit: "%", dataType: "percentage", direction: "higher_is_better" },
  ],
};

const STEPS = [
  { key: "profile", label: "Your Profile", icon: User, description: "Set up your account" },
  { key: "business", label: "Your Business", icon: Building2, description: "Tell us about your business" },
  { key: "structure", label: "Company Structure", icon: Network, description: "Tell us about your corporate structure" },
  { key: "location", label: "First Location", icon: MapPin, description: "Add your first location" },
  { key: "kpis", label: "What to Track", icon: BarChart3, description: "Choose your key metrics" },
  { key: "targets", label: "Set Targets", icon: Target, description: "Define what success looks like" },
];

interface KpiItem {
  name: string;
  unit: string;
  dataType: string;
  direction: string;
  selected: boolean;
  isCustom?: boolean;
}

interface TargetItem {
  name: string;
  unit: string;
  direction: string;
  targetValue: string;
  frequency: string;
}

export default function OnboardingPage() {
  const [, setLoc] = useLocation();
  const { toast } = useToast();
  const { setActiveTenantId } = useTenantStore();

  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [needsPasswordChange, setNeedsPasswordChange] = useState(false);

  const [businessName, setBusinessName] = useState("");
  const [industry, setIndustry] = useState("");

  const [hasParentCompany, setHasParentCompany] = useState<boolean | null>(null);
  const [parentCompanyType, setParentCompanyType] = useState<string>("");
  const [parentCompanyName, setParentCompanyName] = useState("");
  const [subsidiaryCount, setSubsidiaryCount] = useState(1);
  const [subsidiaries, setSubsidiaries] = useState<{ name: string; type: string }[]>([{ name: "", type: "location" }]);

  const [locName, setLocName] = useState("");
  const [locCity, setLocCity] = useState("");
  const [locState, setLocState] = useState("");
  const [locAddress, setLocAddress] = useState("");

  const [kpiItems, setKpiItems] = useState<KpiItem[]>([]);
  const [customKpiName, setCustomKpiName] = useState("");
  const [customKpiUnit, setCustomKpiUnit] = useState("USD");
  const [customKpiDirection, setCustomKpiDirection] = useState("higher_is_better");

  const [targetItems, setTargetItems] = useState<TargetItem[]>([]);
  const [trackingFrequency, setTrackingFrequency] = useState("weekly");

  const [createdTenantId, setCreatedTenantId] = useState<number | null>(null);

  const { data: progressData } = useQuery<any>({
    queryKey: ["/api/v1/onboarding/progress"],
  });

  const { data: userData } = useQuery<any>({
    queryKey: ["/api/auth/user"],
  });

  useEffect(() => {
    if (initialLoadDone) return;
    if (userData) {
      setFirstName(userData.firstName || "");
      setLastName(userData.lastName || "");
      setPhone(userData.phone || "");
      setJobTitle(userData.jobTitle || "");
      setNeedsPasswordChange(userData.mustChangePassword === true);
    }
    if (progressData) {
      const d = progressData;
      if (d.isComplete) {
        setIsComplete(true);
        setInitialLoadDone(true);
        return;
      }
      if (d.currentStep !== undefined) setCurrentStep(d.currentStep);
      if (d.completedSteps) setCompletedSteps(d.completedSteps);
      if (d.tenantId) setCreatedTenantId(d.tenantId);
      const saved = d.savedData || {};
      if (saved.businessName) setBusinessName(saved.businessName);
      if (saved.industry) setIndustry(saved.industry);
      if (saved.hasParentCompany !== undefined) setHasParentCompany(saved.hasParentCompany);
      if (saved.parentCompanyType) setParentCompanyType(saved.parentCompanyType);
      if (saved.parentCompanyName) setParentCompanyName(saved.parentCompanyName);
      if (saved.subsidiaryCount) setSubsidiaryCount(saved.subsidiaryCount);
      if (saved.subsidiaries) setSubsidiaries(saved.subsidiaries);
      if (saved.locName) setLocName(saved.locName);
      if (saved.locCity) setLocCity(saved.locCity);
      if (saved.locState) setLocState(saved.locState);
      if (saved.locAddress) setLocAddress(saved.locAddress);
      if (saved.trackingFrequency) setTrackingFrequency(saved.trackingFrequency);
      setInitialLoadDone(true);
    }
    if (userData && progressData !== undefined) {
      setInitialLoadDone(true);
    }
  }, [userData, progressData, initialLoadDone]);

  useEffect(() => {
    if (industry && kpiItems.length === 0) {
      const suggestions = INDUSTRY_KPI_SUGGESTIONS[industry] || INDUSTRY_KPI_SUGGESTIONS.default;
      setKpiItems(suggestions.map(k => ({ ...k, selected: true })));
    }
  }, [industry]);

  const saveProgress = useCallback((overrides?: any) => {
    apiRequest("PUT", "/api/v1/onboarding/progress", {
      currentStep: overrides?.currentStep ?? currentStep,
      completedSteps: overrides?.completedSteps ?? completedSteps,
      tenantId: overrides?.tenantId ?? createdTenantId ?? undefined,
      savedData: {
        businessName, industry,
        hasParentCompany, parentCompanyType, parentCompanyName, subsidiaryCount, subsidiaries,
        locName, locCity, locState, locAddress, trackingFrequency,
        ...(overrides?.savedData || {}),
      },
    }).catch(() => {});
  }, [currentStep, completedSteps, createdTenantId, businessName, industry, hasParentCompany, parentCompanyType, parentCompanyName, subsidiaryCount, subsidiaries, locName, locCity, locState, locAddress, trackingFrequency]);

  const goToStep = (step: number) => {
    setCurrentStep(step);
    saveProgress({ currentStep: step });
  };

  const completeStep = (stepKey: string) => {
    const newCompleted = Array.from(new Set([...completedSteps, stepKey]));
    setCompletedSteps(newCompleted);
    const nextStep = currentStep + 1;
    setCurrentStep(nextStep);
    saveProgress({ currentStep: nextStep, completedSteps: newCompleted });
  };

  const profileMutation = useMutation({
    mutationFn: async () => {
      const profileRes = await apiRequest("PUT", "/api/auth/profile", {
        firstName, lastName, phone, jobTitle,
      });
      const profileData = await profileRes.json();

      if (needsPasswordChange && newPassword) {
        const pwRes = await apiRequest("PUT", "/api/auth/change-password", {
          currentPassword, newPassword,
        });
        await pwRes.json();
      }

      return profileData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setNeedsPasswordChange(false);
      completeStep("profile");
      toast({ title: "Profile updated" });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const businessMutation = useMutation({
    mutationFn: async () => {
      const slug = businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const res = await apiRequest("POST", "/api/tenants", { name: businessName, slug });
      return res.json();
    },
    onSuccess: (data: any) => {
      const tenantId = data.id;
      setCreatedTenantId(tenantId);
      setActiveTenantId(tenantId);
      queryClient.invalidateQueries({ queryKey: ["/api/tenants"] });
      completeStep("business");
      saveProgress({ tenantId, completedSteps: [...completedSteps, "business"], currentStep: currentStep + 1 });
      toast({ title: "Business created" });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const locationMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/tenants/${createdTenantId}/locations`, {
        name: locName, city: locCity, state: locState, address: locAddress,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", createdTenantId, "locations"] });
      completeStep("location");
      toast({ title: "Location added" });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const kpiMutation = useMutation({
    mutationFn: async () => {
      const selectedKpis = kpiItems.filter(k => k.selected);
      const results = [];
      for (const kpi of selectedKpis) {
        const res = await apiRequest("POST", `/api/tenants/${createdTenantId}/metrics`, {
          name: kpi.name,
          unit: kpi.unit,
          dataType: kpi.dataType,
          direction: kpi.direction,
          isActive: true,
        });
        results.push(await res.json());
      }
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", createdTenantId, "metrics"] });
      const selectedKpis = kpiItems.filter(k => k.selected);
      setTargetItems(selectedKpis.map(k => ({
        name: k.name, unit: k.unit, direction: k.direction,
        targetValue: "", frequency: trackingFrequency,
      })));
      completeStep("kpis");
      toast({ title: "KPIs created" });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", "/api/v1/onboarding/progress", {
        tenantId: createdTenantId,
        currentStep: STEPS.length,
        completedSteps: STEPS.map(s => s.key),
        isComplete: true,
        savedData: {
          businessName, industry, trackingFrequency,
          hasParentCompany, parentCompanyType, parentCompanyName,
          subsidiaryCount, subsidiaries,
        },
      });
    },
    onSuccess: () => {
      setIsComplete(true);
      toast({ title: "Setup complete!" });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const addCustomKpi = () => {
    if (!customKpiName.trim()) return;
    setKpiItems(prev => [...prev, {
      name: customKpiName.trim(),
      unit: customKpiUnit,
      dataType: customKpiUnit === "%" ? "percentage" : customKpiUnit === "USD" ? "currency" : "number",
      direction: customKpiDirection,
      selected: true,
      isCustom: true,
    }]);
    setCustomKpiName("");
  };

  const toggleKpi = (index: number) => {
    setKpiItems(prev => prev.map((k, i) => i === index ? { ...k, selected: !k.selected } : k));
  };

  const removeKpi = (index: number) => {
    setKpiItems(prev => prev.filter((_, i) => i !== index));
  };

  const canProceedProfile = firstName.trim() && lastName.trim() &&
    (!needsPasswordChange || (newPassword.length >= 8 && newPassword === confirmPassword));

  const canProceedBusiness = businessName.trim() && industry;
  const canProceedStructure = hasParentCompany === false ||
    (hasParentCompany === true && parentCompanyType && parentCompanyName.trim() &&
     subsidiaries.length > 0 && subsidiaries.every(s => s.name.trim()));
  const canProceedLocation = locName.trim();
  const canProceedKpis = kpiItems.some(k => k.selected);

  if (isComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" data-testid="onboarding-complete">
        <div className="text-center max-w-md px-6 space-y-6">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-500/10 mb-2">
            <PartyPopper className="h-10 w-10 text-green-500" />
          </div>
          <h1 className="text-3xl font-bold">You're All Set!</h1>
          <p className="text-muted-foreground text-lg">
            Your business is configured and ready to go. Head to your dashboard to start tracking your performance.
          </p>
          <Button size="lg" onClick={() => setLoc("/dashboard")} data-testid="button-go-to-dashboard">
            Go to Dashboard
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" data-testid="page-onboarding">
      <div className="border-b bg-card/50">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Logo className="h-8 w-auto" />
          <span className="text-sm text-muted-foreground">Step {currentStep + 1} of {STEPS.length}</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-6">
        <div className="flex items-center gap-2 mb-8" data-testid="progress-steps">
          {STEPS.map((step, i) => {
            const done = completedSteps.includes(step.key);
            const active = i === currentStep;
            return (
              <div key={step.key} className="flex items-center flex-1">
                <button
                  onClick={() => done || i <= currentStep ? goToStep(i) : null}
                  className={`flex items-center gap-2 text-sm font-medium transition-colors ${
                    done ? "text-green-500 cursor-pointer" :
                    active ? "text-foreground cursor-default" :
                    "text-muted-foreground/50 cursor-default"
                  }`}
                  data-testid={`step-${step.key}`}
                >
                  {done ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0" />
                  ) : (
                    <div className={`h-5 w-5 rounded-full border-2 shrink-0 flex items-center justify-center text-xs ${
                      active ? "border-primary text-primary" : "border-muted-foreground/30"
                    }`}>
                      {i + 1}
                    </div>
                  )}
                  <span className="hidden sm:inline">{step.label}</span>
                </button>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-px mx-2 ${done ? "bg-green-500" : "bg-border"}`} />
                )}
              </div>
            );
          })}
        </div>

        {currentStep === 0 && (
          <StepWrapper
            title="Let's set up your profile"
            subtitle="Tell us a bit about yourself so we can personalize your experience."
          >
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    placeholder="John"
                    data-testid="input-onb-first-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    placeholder="Doe"
                    data-testid="input-onb-last-name"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                    data-testid="input-onb-phone"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="jobTitle">Your Role / Title</Label>
                  <Input
                    id="jobTitle"
                    value={jobTitle}
                    onChange={e => setJobTitle(e.target.value)}
                    placeholder="Owner, CEO, Manager..."
                    data-testid="input-onb-job-title"
                  />
                </div>
              </div>

              {needsPasswordChange && (
                <div className="space-y-4 pt-2 border-t">
                  <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                    Please set a new password to secure your account.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="currentPw">Temporary Password</Label>
                    <div className="relative">
                      <Input
                        id="currentPw"
                        type={showCurrentPw ? "text" : "password"}
                        value={currentPassword}
                        onChange={e => setCurrentPassword(e.target.value)}
                        placeholder="Enter your temporary password"
                        data-testid="input-onb-current-pw"
                      />
                      <button type="button" onClick={() => setShowCurrentPw(!showCurrentPw)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {showCurrentPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="newPw">New Password</Label>
                    <div className="relative">
                      <Input
                        id="newPw"
                        type={showNewPw ? "text" : "password"}
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="At least 8 characters"
                        data-testid="input-onb-new-pw"
                      />
                      <button type="button" onClick={() => setShowNewPw(!showNewPw)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPw">Confirm New Password</Label>
                    <Input
                      id="confirmPw"
                      type="password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your new password"
                      data-testid="input-onb-confirm-pw"
                    />
                    {confirmPassword && newPassword !== confirmPassword && (
                      <p className="text-xs text-destructive">Passwords don't match</p>
                    )}
                  </div>
                </div>
              )}

              <Button
                className="w-full"
                size="lg"
                disabled={!canProceedProfile || profileMutation.isPending}
                onClick={() => profileMutation.mutate()}
                data-testid="button-onb-save-profile"
              >
                {profileMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Continue
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </StepWrapper>
        )}

        {currentStep === 1 && (
          <StepWrapper
            title="Tell us about your business"
            subtitle="This helps us tailor the platform to your industry and suggest the right metrics to track."
          >
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="businessName">Business Name</Label>
                <Input
                  id="businessName"
                  value={businessName}
                  onChange={e => setBusinessName(e.target.value)}
                  placeholder="e.g., Mike's Pizza, FreshFit Gym"
                  data-testid="input-onb-business-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="industry">What industry are you in?</Label>
                <Select value={industry} onValueChange={setIndustry}>
                  <SelectTrigger data-testid="select-onb-industry">
                    <SelectValue placeholder="Select your industry" />
                  </SelectTrigger>
                  <SelectContent>
                    {INDUSTRY_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="w-full"
                size="lg"
                disabled={!canProceedBusiness || businessMutation.isPending}
                onClick={() => businessMutation.mutate()}
                data-testid="button-onb-save-business"
              >
                {businessMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Continue
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </StepWrapper>
        )}

        {currentStep === 2 && (
          <StepWrapper
            title="Tell us about your company structure"
            subtitle="Do you operate under an umbrella company or holding company? This helps us understand how your business is organized."
          >
            <div className="space-y-5">
              <div className="space-y-3">
                <Label>Do you have an Umbrella Company or Holding Company?</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setHasParentCompany(true);
                    }}
                    className={`p-4 rounded-lg border-2 text-center transition-colors ${
                      hasParentCompany === true
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-muted-foreground/30"
                    }`}
                    data-testid="button-has-parent-yes"
                  >
                    <Network className="h-6 w-6 mx-auto mb-2" />
                    <p className="font-medium text-sm">Yes</p>
                    <p className="text-xs text-muted-foreground mt-1">I have a parent company</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHasParentCompany(false);
                      setParentCompanyType("");
                      setParentCompanyName("");
                      setSubsidiaries([{ name: "", type: "location" }]);
                      setSubsidiaryCount(1);
                    }}
                    className={`p-4 rounded-lg border-2 text-center transition-colors ${
                      hasParentCompany === false
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-muted-foreground/30"
                    }`}
                    data-testid="button-has-parent-no"
                  >
                    <Building2 className="h-6 w-6 mx-auto mb-2" />
                    <p className="font-medium text-sm">No</p>
                    <p className="text-xs text-muted-foreground mt-1">Just my business</p>
                  </button>
                </div>
              </div>

              {hasParentCompany === true && (
                <div className="space-y-5 pt-2 border-t">
                  <div className="space-y-3">
                    <Label>What type of parent company?</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setParentCompanyType("umbrella")}
                        className={`p-3 rounded-lg border-2 text-center transition-colors ${
                          parentCompanyType === "umbrella"
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-muted-foreground/30"
                        }`}
                        data-testid="button-type-umbrella"
                      >
                        <p className="font-medium text-sm">Umbrella Company</p>
                        <p className="text-xs text-muted-foreground mt-1">Multiple brands under one entity</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setParentCompanyType("holding")}
                        className={`p-3 rounded-lg border-2 text-center transition-colors ${
                          parentCompanyType === "holding"
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-muted-foreground/30"
                        }`}
                        data-testid="button-type-holding"
                      >
                        <p className="font-medium text-sm">Holding Company</p>
                        <p className="text-xs text-muted-foreground mt-1">Owns controlling interest in subsidiaries</p>
                      </button>
                    </div>
                  </div>

                  {parentCompanyType && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="parentCompanyName">
                          {parentCompanyType === "umbrella" ? "Umbrella" : "Holding"} Company Name
                        </Label>
                        <Input
                          id="parentCompanyName"
                          value={parentCompanyName}
                          onChange={e => setParentCompanyName(e.target.value)}
                          placeholder={`e.g., ${parentCompanyType === "umbrella" ? "Smith Restaurant Group" : "Smith Holdings LLC"}`}
                          data-testid="input-onb-parent-company-name"
                        />
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label>How many subsidiaries or locations?</Label>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              disabled={subsidiaryCount <= 1}
                              onClick={() => {
                                const newCount = Math.max(1, subsidiaryCount - 1);
                                setSubsidiaryCount(newCount);
                                setSubsidiaries(prev => prev.slice(0, newCount));
                              }}
                              data-testid="button-sub-count-minus"
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <span className="text-lg font-semibold w-8 text-center" data-testid="text-sub-count">{subsidiaryCount}</span>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              disabled={subsidiaryCount >= 20}
                              onClick={() => {
                                const newCount = subsidiaryCount + 1;
                                setSubsidiaryCount(newCount);
                                setSubsidiaries(prev => [...prev, { name: "", type: "location" }]);
                              }}
                              data-testid="button-sub-count-plus"
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                          {subsidiaries.map((sub, i) => (
                            <div key={i} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20" data-testid={`subsidiary-row-${i}`}>
                              <span className="text-sm text-muted-foreground font-medium w-6 shrink-0">{i + 1}.</span>
                              <Input
                                value={sub.name}
                                onChange={e => {
                                  const updated = [...subsidiaries];
                                  updated[i] = { ...updated[i], name: e.target.value };
                                  setSubsidiaries(updated);
                                }}
                                placeholder={`Name of subsidiary/location ${i + 1}`}
                                className="flex-1"
                                data-testid={`input-sub-name-${i}`}
                              />
                              <Select
                                value={sub.type}
                                onValueChange={val => {
                                  const updated = [...subsidiaries];
                                  updated[i] = { ...updated[i], type: val };
                                  setSubsidiaries(updated);
                                }}
                              >
                                <SelectTrigger className="w-36" data-testid={`select-sub-type-${i}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="location">Location</SelectItem>
                                  <SelectItem value="subsidiary">Subsidiary</SelectItem>
                                  <SelectItem value="brand">Brand</SelectItem>
                                  <SelectItem value="franchise">Franchise</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              <Button
                className="w-full"
                size="lg"
                disabled={!canProceedStructure}
                onClick={() => completeStep("structure")}
                data-testid="button-onb-save-structure"
              >
                Continue
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </StepWrapper>
        )}

        {currentStep === 3 && (
          <StepWrapper
            title="Where is your first location?"
            subtitle="Add the details for your first business location. You can add more locations later."
          >
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="locName">Location Name</Label>
                <Input
                  id="locName"
                  value={locName}
                  onChange={e => setLocName(e.target.value)}
                  placeholder="e.g., Downtown, Main Street, Location #1"
                  data-testid="input-onb-loc-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="locAddress">Address (optional)</Label>
                <Input
                  id="locAddress"
                  value={locAddress}
                  onChange={e => setLocAddress(e.target.value)}
                  placeholder="123 Main St"
                  data-testid="input-onb-loc-address"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="locCity">City</Label>
                  <Input
                    id="locCity"
                    value={locCity}
                    onChange={e => setLocCity(e.target.value)}
                    placeholder="City"
                    data-testid="input-onb-loc-city"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="locState">State</Label>
                  <Input
                    id="locState"
                    value={locState}
                    onChange={e => setLocState(e.target.value)}
                    placeholder="State"
                    data-testid="input-onb-loc-state"
                  />
                </div>
              </div>
              <Button
                className="w-full"
                size="lg"
                disabled={!canProceedLocation || locationMutation.isPending}
                onClick={() => locationMutation.mutate()}
                data-testid="button-onb-save-location"
              >
                {locationMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Continue
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </StepWrapper>
        )}

        {currentStep === 4 && (
          <StepWrapper
            title="What numbers matter most to your business?"
            subtitle="We've suggested some KPIs based on your industry. Select the ones you want to track, or add your own."
          >
            <div className="space-y-5">
              <div className="space-y-3">
                {kpiItems.map((kpi, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                      kpi.selected ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                    }`}
                    onClick={() => toggleKpi(i)}
                    data-testid={`kpi-item-${i}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-5 w-5 rounded border-2 flex items-center justify-center ${
                        kpi.selected ? "border-primary bg-primary" : "border-muted-foreground/30"
                      }`}>
                        {kpi.selected && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{kpi.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {kpi.unit} · {kpi.direction === "higher_is_better" ? "Higher is better" : "Lower is better"}
                        </p>
                      </div>
                    </div>
                    {kpi.isCustom && (
                      <button
                        onClick={(e) => { e.stopPropagation(); removeKpi(i); }}
                        className="text-muted-foreground hover:text-destructive p-1"
                        data-testid={`button-remove-kpi-${i}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                <p className="text-sm font-medium">Add a custom metric</p>
                <div className="flex gap-2">
                  <Input
                    value={customKpiName}
                    onChange={e => setCustomKpiName(e.target.value)}
                    placeholder="Metric name"
                    className="flex-1"
                    data-testid="input-onb-custom-kpi-name"
                  />
                  <Select value={customKpiUnit} onValueChange={setCustomKpiUnit}>
                    <SelectTrigger className="w-24" data-testid="select-onb-custom-kpi-unit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="%">%</SelectItem>
                      <SelectItem value="count">#</SelectItem>
                      <SelectItem value="hours">Hours</SelectItem>
                      <SelectItem value="days">Days</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={customKpiDirection} onValueChange={setCustomKpiDirection}>
                    <SelectTrigger className="w-32" data-testid="select-onb-custom-kpi-dir">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="higher_is_better">Higher = Better</SelectItem>
                      <SelectItem value="lower_is_better">Lower = Better</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="icon" onClick={addCustomKpi} disabled={!customKpiName.trim()} data-testid="button-add-custom-kpi">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <Button
                className="w-full"
                size="lg"
                disabled={!canProceedKpis || kpiMutation.isPending}
                onClick={() => kpiMutation.mutate()}
                data-testid="button-onb-save-kpis"
              >
                {kpiMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Continue
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </StepWrapper>
        )}

        {currentStep === 5 && (
          <StepWrapper
            title="What does success look like?"
            subtitle="Set target values for your metrics so you can easily spot when you're on or off track."
          >
            <div className="space-y-5">
              <div className="space-y-2 mb-4">
                <Label>How often will you enter numbers?</Label>
                <Select value={trackingFrequency} onValueChange={setTrackingFrequency}>
                  <SelectTrigger data-testid="select-onb-frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="biweekly">Every Two Weeks</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                {targetItems.map((t, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg border" data-testid={`target-item-${i}`}>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{t.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.direction === "higher_is_better" ? "Aim above" : "Stay below"} target
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {t.unit === "USD" && <span className="text-muted-foreground text-sm">$</span>}
                      <Input
                        type="number"
                        value={t.targetValue}
                        onChange={e => {
                          const newTargets = [...targetItems];
                          newTargets[i] = { ...t, targetValue: e.target.value };
                          setTargetItems(newTargets);
                        }}
                        placeholder="Target"
                        className="w-28"
                        data-testid={`input-target-${i}`}
                      />
                      {t.unit === "%" && <span className="text-muted-foreground text-sm">%</span>}
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-xs text-muted-foreground">
                Targets are optional — you can always set or change them later from your dashboard.
              </p>

              <Button
                className="w-full"
                size="lg"
                disabled={completeMutation.isPending}
                onClick={() => completeMutation.mutate()}
                data-testid="button-onb-finish"
              >
                {completeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Finish Setup
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </StepWrapper>
        )}
      </div>

      <div className="fixed bottom-0 inset-x-0 py-4 text-center">
        <p className="text-xs text-muted-foreground">Powered by Xpansion</p>
      </div>
    </div>
  );
}

function StepWrapper({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold" data-testid="text-step-title">{title}</h2>
        <p className="text-muted-foreground mt-1">{subtitle}</p>
      </div>
      <Card>
        <CardContent className="p-6">
          {children}
        </CardContent>
      </Card>
    </div>
  );
}
