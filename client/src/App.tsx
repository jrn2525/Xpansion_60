import { Switch, Route, useRoute } from "wouter";
import { Logo } from "@/components/logo";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";
import { lazy, Suspense, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ErrorBoundary } from "@/components/error-boundary";
import { CommandPalette, CommandPaletteButton } from "@/components/command-palette";
import { NotificationBell } from "@/components/notification-bell";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { ShortcutsDialog } from "@/components/shortcuts-dialog";

const NotFound = lazy(() => import("@/pages/not-found"));
const LandingPage = lazy(() => import("@/pages/landing"));
const DashboardPage = lazy(() => import("@/pages/dashboard"));
const TenantsPage = lazy(() => import("@/pages/tenants"));
const LocationsPage = lazy(() => import("@/pages/locations"));
const MetricsPage = lazy(() => import("@/pages/metrics"));
const ScorecardsPage = lazy(() => import("@/pages/scorecards"));
const TrendsPage = lazy(() => import("@/pages/trends"));
const AdminImportsPage = lazy(() => import("@/pages/admin-imports"));
const AdminAlertsPage = lazy(() => import("@/pages/admin-alerts"));
const AdminReportsPage = lazy(() => import("@/pages/admin-reports"));
const AdminNotificationsPage = lazy(() => import("@/pages/admin-notifications"));
const AdminDataQualityPage = lazy(() => import("@/pages/admin-data-quality"));
const PortfolioPage = lazy(() => import("@/pages/portfolio"));
const CommandCenterPage = lazy(() => import("@/pages/command-center"));
const ActionsPage = lazy(() => import("@/pages/actions"));
const GoalsPage = lazy(() => import("@/pages/goals"));
const BenchmarkingPage = lazy(() => import("@/pages/benchmarking"));
const PlaybooksPage = lazy(() => import("@/pages/playbooks"));
const AdminDigestsPage = lazy(() => import("@/pages/admin-digests"));
const AdminSecurityPage = lazy(() => import("@/pages/admin-security"));
const AdminActivityPage = lazy(() => import("@/pages/admin-activity"));
const AdminOpsPage = lazy(() => import("@/pages/admin-ops"));
const RiskPage = lazy(() => import("@/pages/risk"));
const WeeklyPlansPage = lazy(() => import("@/pages/weekly-plans"));
const SuperadminTowerPage = lazy(() => import("@/pages/superadmin-tower"));
const CampaignsPage = lazy(() => import("@/pages/campaigns"));
const InboxPage = lazy(() => import("@/pages/inbox"));
const OnboardingPage = lazy(() => import("@/pages/onboarding"));
const DailyBriefPage = lazy(() => import("@/pages/daily-brief"));
const TenantBrandingPage = lazy(() => import("@/pages/tenant-branding"));
const AdminUsersPage = lazy(() => import("@/pages/admin-users"));
const ClientHomePage = lazy(() => import("@/pages/client-home"));
const ConsultantClientsPage = lazy(() => import("@/pages/consultant-clients"));
const MyBusinessPage = lazy(() => import("@/pages/my-business"));
const ClientSettingsPage = lazy(() => import("@/pages/client-settings"));

function LoadingSkeleton() {
  return (
    <div className="flex items-center justify-center h-full p-6" data-testid="loading-skeleton">
      <div className="space-y-4 text-center">
        <Logo className="h-10 w-auto mx-auto" />
        <Skeleton className="h-4 w-32 mx-auto" />
      </div>
    </div>
  );
}

const routeTitles: Record<string, string> = {
  "/": "Home | Xpansion Console",
  "/clients": "Clients | Xpansion Console",
  "/my-business": "My Business | Xpansion Console",
  "/settings": "Settings | Xpansion Console",
  "/dashboard": "Dashboard | Xpansion Console",
  "/command-center": "Command Center | Xpansion Console",
  "/portfolio": "Portfolio | Xpansion Console",
  "/tenants": "Tenants | Xpansion Console",
  "/locations": "Locations | Xpansion Console",
  "/metrics": "Metrics | Xpansion Console",
  "/scorecards": "Scorecards | Xpansion Console",
  "/trends": "Trends | Xpansion Console",
  "/actions": "Actions | Xpansion Console",
  "/goals": "Goals | Xpansion Console",
  "/benchmarking": "Benchmarking | Xpansion Console",
  "/playbooks": "Playbooks | Xpansion Console",
  "/admin/imports": "Data Imports | Xpansion Console",
  "/admin/alerts": "Alert Rules | Xpansion Console",
  "/admin/reports": "Reports | Xpansion Console",
  "/admin/notifications": "Notifications | Xpansion Console",
  "/admin/data-quality": "Data Quality | Xpansion Console",
  "/admin/digests": "Weekly Digests | Xpansion Console",
  "/admin/security": "Security | Xpansion Console",
  "/admin/activity": "Activity Center | Xpansion Console",
  "/admin/ops": "Ops Health | Xpansion Console",
  "/risk": "Risk Dashboard | Xpansion Console",
  "/weekly-plans": "Weekly Plans | Xpansion Console",
  "/campaigns": "Campaigns | Xpansion Console",
  "/brief": "Daily Brief | Xpansion Console",
  "/inbox": "Command Inbox | Xpansion Console",
  "/superadmin/tower": "Command Tower | Xpansion Console",
  "/onboarding": "Onboarding | Xpansion Console",
};

function RouteTitle() {
  const [location] = useLocation();
  useEffect(() => {
    document.title = routeTitles[location] || "Xpansion Console";
  }, [location]);
  return null;
}

function RoleBasedHome() {
  const { user } = useAuth();
  const isSuperAdmin = user?.isSuperAdmin === "true";
  return isSuperAdmin ? <ConsultantClientsPage /> : <ClientHomePage />;
}

function SuperAdminRoute({ component: Component }: { component: React.ComponentType }) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const isSuperAdmin = user?.isSuperAdmin === "true";
  useEffect(() => {
    if (!isSuperAdmin) setLocation("/");
  }, [isSuperAdmin, setLocation]);
  if (!isSuperAdmin) return null;
  return <Component />;
}

function AuthenticatedRouter() {
  return (
    <Switch>
      <Route path="/" component={RoleBasedHome} />
      <Route path="/clients">{() => <SuperAdminRoute component={ConsultantClientsPage} />}</Route>
      <Route path="/my-business" component={MyBusinessPage} />
      <Route path="/settings" component={ClientSettingsPage} />
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/command-center" component={CommandCenterPage} />
      <Route path="/portfolio" component={PortfolioPage} />
      <Route path="/tenants" component={TenantsPage} />
      <Route path="/locations" component={LocationsPage} />
      <Route path="/metrics" component={MetricsPage} />
      <Route path="/scorecards" component={ScorecardsPage} />
      <Route path="/trends" component={TrendsPage} />
      <Route path="/actions" component={ActionsPage} />
      <Route path="/goals" component={GoalsPage} />
      <Route path="/benchmarking" component={BenchmarkingPage} />
      <Route path="/playbooks" component={PlaybooksPage} />
      <Route path="/admin/imports" component={AdminImportsPage} />
      <Route path="/admin/alerts" component={AdminAlertsPage} />
      <Route path="/admin/reports" component={AdminReportsPage} />
      <Route path="/admin/notifications" component={AdminNotificationsPage} />
      <Route path="/admin/data-quality" component={AdminDataQualityPage} />
      <Route path="/admin/digests" component={AdminDigestsPage} />
      <Route path="/admin/security" component={AdminSecurityPage} />
      <Route path="/admin/activity" component={AdminActivityPage} />
      <Route path="/admin/ops" component={AdminOpsPage} />
      <Route path="/risk" component={RiskPage} />
      <Route path="/weekly-plans" component={WeeklyPlansPage} />
      <Route path="/campaigns" component={CampaignsPage} />
      <Route path="/brief" component={DailyBriefPage} />
      <Route path="/inbox" component={InboxPage} />
      <Route path="/admin/branding" component={TenantBrandingPage} />
      <Route path="/admin/users" component={AdminUsersPage} />
      <Route path="/superadmin/tower" component={SuperadminTowerPage} />
      <Route path="/onboarding" component={OnboardingPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedLayout() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  const { showShortcuts, setShowShortcuts } = useKeyboardShortcuts();

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between gap-1 p-2 border-b shrink-0">
            <div className="flex items-center gap-1">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <CommandPaletteButton />
            </div>
            <div className="flex items-center gap-1">
              <NotificationBell />
            </div>
          </header>
          <CommandPalette />
          <ShortcutsDialog open={showShortcuts} onOpenChange={setShowShortcuts} />
          <main className="flex-1 overflow-auto">
            <ErrorBoundary>
              <Suspense fallback={<LoadingSkeleton />}>
                <AuthenticatedRouter />
              </Suspense>
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function SessionExpiredListener() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  useEffect(() => {
    const handler = () => {
      toast({
        title: "Session Expired",
        description: "Your session has expired. Please log in again.",
        variant: "destructive",
      });
      setLocation("/");
    };
    window.addEventListener("session-expired", handler);
    return () => window.removeEventListener("session-expired", handler);
  }, [toast, setLocation]);

  return null;
}

function OnboardingRedirect() {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const { data: tenantsList, isLoading } = useQuery<any[]>({
    queryKey: ["/api/tenants"],
  });

  const { data: progressData } = useQuery<any>({
    queryKey: ["/api/v1/onboarding/progress"],
  });

  useEffect(() => {
    if (location === "/onboarding") return;

    const mustChange = (user as any)?.mustChangePassword === true;
    const noTenants = !isLoading && tenantsList && tenantsList.length === 0;
    const onboardingIncomplete = progressData && !progressData.isComplete && progressData.currentStep > 0;

    if (mustChange || noTenants || onboardingIncomplete) {
      setLocation("/onboarding");
    }
  }, [isLoading, tenantsList, location, setLocation, user, progressData]);

  return null;
}

function AppContent() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="space-y-4 text-center">
          <Logo className="h-10 w-auto mx-auto" />
          <Skeleton className="h-4 w-32 mx-auto" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <ErrorBoundary><Suspense fallback={<LoadingSkeleton />}><LandingPage /></Suspense></ErrorBoundary>;
  }

  return (
    <>
      <OnboardingRedirect />
      <AuthenticatedLayout />
    </>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <RouteTitle />
          <Toaster />
          <SessionExpiredListener />
          <AppContent />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
