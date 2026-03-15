import { useLocation, Link } from "wouter";
import { Logo } from "@/components/logo";
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
  Newspaper,
  Star,
  Palette,
  Users,
  Home,
  Store,
  Settings,
  UserCheck,
  ClipboardEdit,
  PlugZap,
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
import { usePreferences } from "@/hooks/use-preferences";
import { useTenantBranding } from "@/hooks/use-tenant-branding";
import type { LucideIcon } from "lucide-react";

type TenantRole = "viewer" | "manager" | "admin" | "owner";

const allRoles: TenantRole[] = ["viewer", "manager", "admin", "owner"];
const adminOwnerRoles: TenantRole[] = ["admin", "owner"];

interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  visibleTo: TenantRole[];
  superadminOnly?: boolean;
}

type TenantWithRole = Tenant & { role?: string };

const clientNavItems: NavItem[] = [
  { title: "Home", url: "/", icon: Home, visibleTo: allRoles },
  { title: "My Business", url: "/my-business", icon: Store, visibleTo: allRoles },
  { title: "Enter Data", url: "/enter-data", icon: ClipboardEdit, visibleTo: allRoles },
  { title: "My Scorecard", url: "/my-scorecard", icon: Trophy, visibleTo: allRoles },
  { title: "Locations", url: "/locations", icon: MapPin, visibleTo: allRoles },
  { title: "Metrics", url: "/metrics", icon: BarChart3, visibleTo: allRoles },
  { title: "Scorecards", url: "/scorecards", icon: ClipboardCheck, visibleTo: allRoles },
  { title: "Trends", url: "/trends", icon: TrendingUp, visibleTo: allRoles },
];

const clientOperationsItems: NavItem[] = [
  { title: "Daily Brief", url: "/brief", icon: Newspaper, visibleTo: allRoles },
  { title: "Actions", url: "/actions", icon: ListChecks, visibleTo: allRoles },
  { title: "Goals", url: "/goals", icon: Target, visibleTo: allRoles },
  { title: "Playbooks", url: "/playbooks", icon: BookOpen, visibleTo: allRoles },
  { title: "Weekly Plans", url: "/weekly-plans", icon: Calendar, visibleTo: allRoles },
  { title: "Integrations", url: "/integrations", icon: PlugZap, visibleTo: allRoles },
  { title: "Settings", url: "/settings", icon: Settings, visibleTo: allRoles },
];

const navItems: NavItem[] = [
  { title: "Clients", url: "/clients", icon: UserCheck, visibleTo: [], superadminOnly: true },
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, visibleTo: allRoles },
  { title: "Command Center", url: "/command-center", icon: Crosshair, visibleTo: adminOwnerRoles },
  { title: "Portfolio", url: "/portfolio", icon: Briefcase, visibleTo: adminOwnerRoles },
  { title: "Tenants", url: "/tenants", icon: Building2, visibleTo: adminOwnerRoles },
  { title: "Locations", url: "/locations", icon: MapPin, visibleTo: allRoles },
  { title: "Metrics", url: "/metrics", icon: BarChart3, visibleTo: allRoles },
  { title: "Scorecards", url: "/scorecards", icon: ClipboardCheck, visibleTo: allRoles },
  { title: "Trends", url: "/trends", icon: TrendingUp, visibleTo: allRoles },
];

const operationsItems: NavItem[] = [
  { title: "Daily Brief", url: "/brief", icon: Newspaper, visibleTo: allRoles },
  { title: "Inbox", url: "/inbox", icon: Inbox, visibleTo: allRoles },
  { title: "Actions", url: "/actions", icon: ListChecks, visibleTo: allRoles },
  { title: "Goals", url: "/goals", icon: Target, visibleTo: allRoles },
  { title: "Benchmarking", url: "/benchmarking", icon: Trophy, visibleTo: allRoles },
  { title: "Playbooks", url: "/playbooks", icon: BookOpen, visibleTo: allRoles },
  { title: "Risk", url: "/risk", icon: AlertTriangle, visibleTo: allRoles },
  { title: "Weekly Plans", url: "/weekly-plans", icon: Calendar, visibleTo: allRoles },
  { title: "Campaigns", url: "/campaigns", icon: Megaphone, visibleTo: allRoles },
  { title: "Integrations", url: "/integrations", icon: PlugZap, visibleTo: allRoles },
];

const adminItems: NavItem[] = [
  { title: "Imports", url: "/admin/imports", icon: Upload, visibleTo: adminOwnerRoles },
  { title: "Alerts", url: "/admin/alerts", icon: Bell, visibleTo: adminOwnerRoles },
  { title: "Reports", url: "/admin/reports", icon: FileBarChart, visibleTo: adminOwnerRoles },
  { title: "Digests", url: "/admin/digests", icon: FileText, visibleTo: adminOwnerRoles },
  { title: "Notifications", url: "/admin/notifications", icon: Mail, visibleTo: adminOwnerRoles },
  { title: "Data Quality", url: "/admin/data-quality", icon: ShieldCheck, visibleTo: adminOwnerRoles },
  { title: "Security", url: "/admin/security", icon: Shield, visibleTo: adminOwnerRoles },
  { title: "Activity", url: "/admin/activity", icon: Activity, visibleTo: adminOwnerRoles },
  { title: "Branding", url: "/admin/branding", icon: Palette, visibleTo: adminOwnerRoles },
  { title: "Ops Health", url: "/admin/ops", icon: Server, visibleTo: adminOwnerRoles },
  { title: "Users", url: "/admin/users", icon: Users, visibleTo: [], superadminOnly: true },
  { title: "Command Tower", url: "/superadmin/tower", icon: Radio, visibleTo: [], superadminOnly: true },
];

const allItems: NavItem[] = [...clientNavItems, ...clientOperationsItems, ...navItems, ...operationsItems, ...adminItems];

export { navItems, operationsItems, adminItems, clientNavItems, clientOperationsItems, allItems };
export type { NavItem };

function filterItemsByRole(items: NavItem[], role: TenantRole | null, isSuperAdmin: boolean): NavItem[] {
  return items.filter((item) => {
    if (item.superadminOnly) return isSuperAdmin;
    if (isSuperAdmin) return true;
    if (!role) return false;
    return item.visibleTo.includes(role);
  });
}

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { pinnedPages, isPinned, togglePin, isLoading: prefsLoading } = usePreferences();

  const { data: tenantsList, isLoading: tenantsLoading } = useQuery<TenantWithRole[]>({
    queryKey: ["/api/tenants"],
  });

  const { activeTenantId, setActiveTenantId } = useTenantStore();

  const activeTenant = tenantsList?.find((t) => t.id === activeTenantId);

  if (tenantsList && tenantsList.length > 0 && !activeTenantId) {
    setActiveTenantId(tenantsList[0].id);
  }

  const isSuperAdmin = user?.isSuperAdmin === "true";
  const activeRole = (activeTenant?.role as TenantRole) || null;
  const { logoUrl } = useTenantBranding();

  const isClient = !isSuperAdmin;

  const filteredNavItems = isClient
    ? clientNavItems
    : filterItemsByRole(navItems, activeRole, isSuperAdmin);
  const filteredOperationsItems = isClient
    ? clientOperationsItems
    : filterItemsByRole(operationsItems, activeRole, isSuperAdmin);
  const filteredAdminItems = isClient
    ? []
    : filterItemsByRole(adminItems, activeRole, isSuperAdmin);

  const initials = user
    ? `${(user.firstName || "")[0] || ""}${(user.lastName || "")[0] || ""}`.toUpperCase() || "U"
    : "U";

  const favoriteItems = pinnedPages
    .map((url) => allItems.find((item) => item.url === url))
    .filter((item): item is NavItem => {
      if (!item) return false;
      if (item.superadminOnly) return isSuperAdmin;
      if (isSuperAdmin) return true;
      if (!activeRole) return false;
      return item.visibleTo.includes(activeRole);
    });

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2" data-testid="text-app-title">
          {logoUrl ? (
            <img src={logoUrl} alt={activeTenant?.name || "Logo"} className="h-8 w-auto max-w-[160px] object-contain" data-testid="tenant-logo" />
          ) : (
            <Logo className="h-8 w-auto" />
          )}
        </div>

        {tenantsLoading ? (
          <Skeleton className="h-9 w-full mt-3" />
        ) : !isClient && tenantsList && tenantsList.length > 0 ? (
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
        {favoriteItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Favorites</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {favoriteItems.map((item) => {
                  const isActive = location.startsWith(item.url);
                  return (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                      >
                        <Link href={item.url} data-testid={`link-fav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                          <item.icon className="h-4 w-4" />
                          <span className="flex-1">{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePin(item.url);
                        }}
                        className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-md text-primary opacity-80"
                        data-testid={`button-unpin-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                        title="Unpin page"
                      >
                        <Star className="h-3.5 w-3.5 fill-current" />
                      </button>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {filteredNavItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filteredNavItems.map((item) => {
                  const isActive = item.url === "/" ? location === "/" : location.startsWith(item.url);
                  const pinned = isPinned(item.url);
                  return (
                    <SidebarMenuItem key={item.title} className="group/pin relative">
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                      >
                        <Link href={item.url} data-testid={`link-nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePin(item.url);
                        }}
                        className={`absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-md ${
                          pinned
                            ? "text-primary opacity-80"
                            : "text-sidebar-foreground/30 opacity-0 group-hover/pin:opacity-100 transition-opacity"
                        }`}
                        data-testid={`button-pin-${item.title.toLowerCase()}`}
                        title={pinned ? "Unpin page" : "Pin page"}
                      >
                        <Star className={`h-3.5 w-3.5 ${pinned ? "fill-current" : ""}`} />
                      </button>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {filteredOperationsItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Operations</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filteredOperationsItems.map((item) => {
                  const isActive = location.startsWith(item.url);
                  const pinned = isPinned(item.url);
                  return (
                    <SidebarMenuItem key={item.title} className="group/pin relative">
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                      >
                        <Link href={item.url} data-testid={`link-nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePin(item.url);
                        }}
                        className={`absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-md ${
                          pinned
                            ? "text-primary opacity-80"
                            : "text-sidebar-foreground/30 opacity-0 group-hover/pin:opacity-100 transition-opacity"
                        }`}
                        data-testid={`button-pin-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                        title={pinned ? "Unpin page" : "Pin page"}
                      >
                        <Star className={`h-3.5 w-3.5 ${pinned ? "fill-current" : ""}`} />
                      </button>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {filteredAdminItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filteredAdminItems.map((item) => {
                  const isActive = location.startsWith(item.url);
                  const pinned = isPinned(item.url);
                  return (
                    <SidebarMenuItem key={item.title} className="group/pin relative">
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                      >
                        <Link href={item.url} data-testid={`link-nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePin(item.url);
                        }}
                        className={`absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-md ${
                          pinned
                            ? "text-primary opacity-80"
                            : "text-sidebar-foreground/30 opacity-0 group-hover/pin:opacity-100 transition-opacity"
                        }`}
                        data-testid={`button-pin-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                        title={pinned ? "Unpin page" : "Pin page"}
                      >
                        <Star className={`h-3.5 w-3.5 ${pinned ? "fill-current" : ""}`} />
                      </button>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
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
