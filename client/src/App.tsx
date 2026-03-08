import { Switch, Route, useRoute } from "wouter";
import logoPath from "@assets/XConsole_transparent.png";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/landing";
import DashboardPage from "@/pages/dashboard";
import TenantsPage from "@/pages/tenants";
import LocationsPage from "@/pages/locations";
import MetricsPage from "@/pages/metrics";
import ScorecardsPage from "@/pages/scorecards";
import TrendsPage from "@/pages/trends";
import AdminImportsPage from "@/pages/admin-imports";
import AdminAlertsPage from "@/pages/admin-alerts";
import AdminReportsPage from "@/pages/admin-reports";
import AdminAuditPage from "@/pages/admin-audit";
import AdminNotificationsPage from "@/pages/admin-notifications";
import AdminDataQualityPage from "@/pages/admin-data-quality";
import PortfolioPage from "@/pages/portfolio";
import CommandCenterPage from "@/pages/command-center";
import ActionsPage from "@/pages/actions";
import GoalsPage from "@/pages/goals";
import BenchmarkingPage from "@/pages/benchmarking";
import PlaybooksPage from "@/pages/playbooks";
import AdminDigestsPage from "@/pages/admin-digests";
import AdminSecurityPage from "@/pages/admin-security";
import AdminActivityPage from "@/pages/admin-activity";
import AdminOpsPage from "@/pages/admin-ops";
import RiskPage from "@/pages/risk";
import WeeklyPlansPage from "@/pages/weekly-plans";
import AdminExecutiveReportsPage from "@/pages/admin-executive-reports";
import SuperadminTowerPage from "@/pages/superadmin-tower";
import CampaignsPage from "@/pages/campaigns";
import InboxPage from "@/pages/inbox";
import OnboardingPage from "@/pages/onboarding";
import DailyBriefPage from "@/pages/daily-brief";

const routeTitles: Record<string, string> = {
  "/": "Daily Brief | Xpansion Console",
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
  "/admin/audit": "Audit Log | Xpansion Console",
  "/admin/notifications": "Notifications | Xpansion Console",
  "/admin/data-quality": "Data Quality | Xpansion Console",
  "/admin/digests": "Weekly Digests | Xpansion Console",
  "/admin/security": "Security | Xpansion Console",
  "/admin/activity": "Activity Log | Xpansion Console",
  "/admin/ops": "Ops Health | Xpansion Console",
  "/risk": "Risk Dashboard | Xpansion Console",
  "/weekly-plans": "Weekly Plans | Xpansion Console",
  "/campaigns": "Campaigns | Xpansion Console",
  "/brief": "Daily Brief | Xpansion Console",
  "/inbox": "Command Inbox | Xpansion Console",
  "/admin/executive-reports": "Executive Reports | Xpansion Console",
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

function AuthenticatedRouter() {
  return (
    <Switch>
      <Route path="/" component={DailyBriefPage} />
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
      <Route path="/admin/audit" component={AdminAuditPage} />
      <Route path="/admin/notifications" component={AdminNotificationsPage} />
      <Route path="/admin/data-quality" component={AdminDataQualityPage} />
      <Route path="/admin/digests" component={AdminDigestsPage} />
      <Route path="/admin/security" component={AdminSecurityPage} />
      <Route path="/admin/activity" component={AdminActivityPage} />
      <Route path="/admin/ops" component={AdminOpsPage} />
      <Route path="/risk" component={RiskPage} />
      <Route path="/weekly-plans" component={WeeklyPlansPage} />
      <Route path="/admin/executive-reports" component={AdminExecutiveReportsPage} />
      <Route path="/campaigns" component={CampaignsPage} />
      <Route path="/brief" component={DailyBriefPage} />
      <Route path="/inbox" component={InboxPage} />
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

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center gap-1 p-2 border-b shrink-0">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
          </header>
          <main className="flex-1 overflow-auto">
            <AuthenticatedRouter />
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
  const { data: tenantsList, isLoading } = useQuery<any[]>({
    queryKey: ["/api/tenants"],
  });

  useEffect(() => {
    if (!isLoading && tenantsList && tenantsList.length === 0 && location !== "/onboarding") {
      setLocation("/onboarding");
    }
  }, [isLoading, tenantsList, location, setLocation]);

  return null;
}

function AppContent() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="space-y-4 text-center">
          <img src={logoPath} alt="Xpansion Console" className="h-10 w-auto mx-auto" />
          <Skeleton className="h-4 w-32 mx-auto" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <LandingPage />;
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
