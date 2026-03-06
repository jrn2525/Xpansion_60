import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";
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

function AuthenticatedRouter() {
  return (
    <Switch>
      <Route path="/" component={DashboardPage} />
      <Route path="/tenants" component={TenantsPage} />
      <Route path="/locations" component={LocationsPage} />
      <Route path="/metrics" component={MetricsPage} />
      <Route path="/scorecards" component={ScorecardsPage} />
      <Route path="/trends" component={TrendsPage} />
      <Route path="/admin/imports" component={AdminImportsPage} />
      <Route path="/admin/alerts" component={AdminAlertsPage} />
      <Route path="/admin/reports" component={AdminReportsPage} />
      <Route path="/admin/audit" component={AdminAuditPage} />
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
      <div className="flex items-center justify-center h-screen">
        <div className="space-y-4 text-center">
          <Skeleton className="h-8 w-8 rounded-md mx-auto" />
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
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AppContent />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
