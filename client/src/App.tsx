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
const AdminNotificationsPage = lazy(() => import("@/pages/admin-notifications"));
const AdminActivityPage = lazy(() => import("@/pages/admin-activity"));
const SuperadminTowerPage = lazy(() => import("@/pages/superadmin-tower"));
const OnboardingPage = lazy(() => import("@/pages/onboarding"));
const AdminUsersPage = lazy(() => import("@/pages/admin-users"));
const AdminProgramsPage = lazy(() => import("@/pages/admin-programs"));
const AdminProgramDetailPage = lazy(() => import("@/pages/admin-program-detail"));
const ClientHomePage = lazy(() => import("@/pages/client-home"));
const ConsultantClientsPage = lazy(() => import("@/pages/consultant-clients"));
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
  "/": "Home | Xpansion 60",
  "/clients": "Clients | Xpansion 60",
  "/settings": "Settings | Xpansion 60",
  "/admin/users": "Users | Xpansion 60",
  "/admin/programs": "Programs | Xpansion 60",
  "/admin/notifications": "Notifications | Xpansion 60",
  "/admin/activity": "Activity | Xpansion 60",
  "/superadmin/tower": "Command Tower | Xpansion 60",
  "/onboarding": "Onboarding | Xpansion 60",
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
      <Route path="/settings" component={ClientSettingsPage} />
      <Route path="/admin/users" component={AdminUsersPage} />
      <Route path="/admin/programs" component={AdminProgramsPage} />
      <Route path="/admin/programs/:id" component={AdminProgramDetailPage} />
      <Route path="/admin/notifications" component={AdminNotificationsPage} />
      <Route path="/admin/activity" component={AdminActivityPage} />
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
