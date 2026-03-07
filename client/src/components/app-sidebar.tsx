import { useLocation, Link } from "wouter";
import {
  LayoutDashboard,
  Building2,
  MapPin,
  BarChart3,
  ClipboardCheck,
  TrendingUp,
  LogOut,
  ChevronDown,
  Upload,
  Bell,
  FileBarChart,
  History,
  Briefcase,
  Mail,
  ShieldCheck,
  Sun,
  Moon,
  Crosshair,
  ListChecks,
  Target,
  Trophy,
  BookOpen,
  FileText,
  Shield,
  Activity,
  Server,
  AlertTriangle,
  Calendar,
  Radio,
  Megaphone,
  Inbox,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/components/theme-provider";
import { useQuery } from "@tanstack/react-query";
import type { Tenant } from "@shared/schema";
import { useTenantStore } from "@/lib/tenant-store";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Command Center", url: "/command-center", icon: Crosshair },
  { title: "Portfolio", url: "/portfolio", icon: Briefcase },
  { title: "Tenants", url: "/tenants", icon: Building2 },
  { title: "Locations", url: "/locations", icon: MapPin },
  { title: "Metrics", url: "/metrics", icon: BarChart3 },
  { title: "Scorecards", url: "/scorecards", icon: ClipboardCheck },
  { title: "Trends", url: "/trends", icon: TrendingUp },
];

const operationsItems = [
  { title: "Inbox", url: "/inbox", icon: Inbox },
  { title: "Actions", url: "/actions", icon: ListChecks },
  { title: "Goals", url: "/goals", icon: Target },
  { title: "Benchmarking", url: "/benchmarking", icon: Trophy },
  { title: "Playbooks", url: "/playbooks", icon: BookOpen },
  { title: "Risk", url: "/risk", icon: AlertTriangle },
  { title: "Weekly Plans", url: "/weekly-plans", icon: Calendar },
  { title: "Campaigns", url: "/campaigns", icon: Megaphone },
];

const adminItems = [
  { title: "Imports", url: "/admin/imports", icon: Upload },
  { title: "Alerts", url: "/admin/alerts", icon: Bell },
  { title: "Reports", url: "/admin/reports", icon: FileBarChart },
  { title: "Digests", url: "/admin/digests", icon: FileText },
  { title: "Notifications", url: "/admin/notifications", icon: Mail },
  { title: "Data Quality", url: "/admin/data-quality", icon: ShieldCheck },
  { title: "Audit Log", url: "/admin/audit", icon: History },
  { title: "Security", url: "/admin/security", icon: Shield },
  { title: "Activity Log", url: "/admin/activity", icon: Activity },
  { title: "Ops Health", url: "/admin/ops", icon: Server },
  { title: "Executive Reports", url: "/admin/executive-reports", icon: FileText },
  { title: "Command Tower", url: "/superadmin/tower", icon: Radio },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const { data: tenantsList, isLoading: tenantsLoading } = useQuery<Tenant[]>({
    queryKey: ["/api/tenants"],
  });

  const { activeTenantId, setActiveTenantId } = useTenantStore();

  const activeTenant = tenantsList?.find((t) => t.id === activeTenantId);

  if (tenantsList && tenantsList.length > 0 && !activeTenantId) {
    setActiveTenantId(tenantsList[0].id);
  }

  const initials = user
    ? `${(user.firstName || "")[0] || ""}${(user.lastName || "")[0] || ""}`.toUpperCase() || "U"
    : "U";

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold tracking-tight">
            X
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold tracking-tight" data-testid="text-app-title">
              Xpansion Console
            </span>
            <span className="text-[11px] text-sidebar-foreground/50 tracking-wide uppercase">
              Command Center
            </span>
          </div>
        </div>

        {tenantsLoading ? (
          <Skeleton className="h-9 w-full mt-3" />
        ) : tenantsList && tenantsList.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center justify-between gap-1 w-full mt-3 px-3 py-2 rounded-md bg-sidebar-accent text-sm text-sidebar-accent-foreground hover-elevate"
                data-testid="button-tenant-selector"
              >
                <span className="truncate font-medium">
                  {activeTenant?.name || "Select Tenant"}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {tenantsList.map((t) => (
                <DropdownMenuItem
                  key={t.id}
                  onClick={() => setActiveTenantId(t.id)}
                  data-testid={`menu-item-tenant-${t.id}`}
                >
                  <Building2 className="mr-2 h-4 w-4" />
                  {t.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive =
                  item.url === "/"
                    ? location === "/"
                    : location.startsWith(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                    >
                      <Link href={item.url} data-testid={`link-nav-${item.title.toLowerCase()}`}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Operations</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {operationsItems.map((item) => {
                const isActive = location.startsWith(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                    >
                      <Link href={item.url} data-testid={`link-nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Admin</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {adminItems.map((item) => {
                const isActive = location.startsWith(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                    >
                      <Link href={item.url} data-testid={`link-nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user?.profileImageUrl || ""} />
            <AvatarFallback className="text-xs bg-primary/20 text-primary">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-sm font-medium truncate" data-testid="text-user-name">
              {user?.firstName || user?.email || "User"}
            </span>
            <span className="text-xs text-sidebar-foreground/50 truncate">
              {user?.email || ""}
            </span>
          </div>
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-md text-sidebar-foreground/50 hover:text-sidebar-foreground hover-elevate"
            data-testid="button-theme-toggle"
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            onClick={() => logout()}
            className="p-1.5 rounded-md text-sidebar-foreground/50 hover:text-sidebar-foreground hover-elevate"
            data-testid="button-logout"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
