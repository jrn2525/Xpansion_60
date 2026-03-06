import { Switch, Route, useRoute } from "wouter";
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

const routeTitles: Record<string, string> = {
  "/": "Dashboard | Xpansion Console",
  "/portfolio": "Portfolio | Xpansion Console",
  "/tenants": "Tenants | Xpansion Console",
  "/locations": "Locations | Xpansion Console",
  "/metrics": "Metrics | Xpansion Console",
  "/scorecards": "Scorecards | Xpansion Console",
  "/trends": "Trends | Xpansion Console",
  "/admin/imports": "Data Imports | Xpansion Console",
  "/admin/alerts": "Alert Rules | Xpansion Console",
  "/admin/reports": "Reports | Xpansion Console",
  "/admin/audit": "Audit Log | Xpansion Console",
  "/admin/notifications": "Notifications | Xpansion Console",
  "/admin/data-quality": "Data Quality | Xpansion Console",
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
      <Route path="/" component={DashboardPage} />
      <Route path="/portfolio" component={PortfolioPage} />
      <Route path="/tenants" component={TenantsPage} />
      <Route path="/locations" component={LocationsPage} />
      <Route path="/metrics" component={MetricsPage} />
      <Route path="/scorecards" component={ScorecardsPage} />
      <Route path="/trends" component={TrendsPage} />
      <Route path="/admin/imports" component={AdminImportsPage} />
      <Route path="/admin/alerts" component={AdminAlertsPage} />
      <Route path="/admin/reports" component={AdminReportsPage} />
      <Route path="/admin/audit" component={AdminAuditPage} />
      <Route path="/admin/notifications" component={AdminNotificationsPage} />
      <Route path="/admin/data-quality" component={AdminDataQualityPage} />
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

function AppContent() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="space-y-4 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground text-lg font-bold mx-auto">
            X
          </div>
          <Skeleton className="h-4 w-32 mx-auto" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <LandingPage />;
  }

  return <AuthenticatedLayout />;
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <RouteTitle />
          <Toaster />
          <AppContent />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
