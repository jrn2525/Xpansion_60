import { useLocation, Link } from "wouter";
import { Logo } from "@/components/logo";
import {
  LogOut,
  Mail,
  Sun,
  Moon,
  Activity,
  Star,
  Users,
  Home,
  Settings,
  UserCheck,
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/components/theme-provider";
import { useQuery } from "@tanstack/react-query";
import type { Tenant } from "@shared/schema";
import { useTenantStore } from "@/lib/tenant-store";
import { usePreferences } from "@/hooks/use-preferences";
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

const clientNavItems: NavItem[] = [
  { title: "Home", url: "/", icon: Home, visibleTo: allRoles },
];

const clientOperationsItems: NavItem[] = [
  { title: "Settings", url: "/settings", icon: Settings, visibleTo: allRoles },
];

const navItems: NavItem[] = [
  { title: "Clients", url: "/clients", icon: UserCheck, visibleTo: [], superadminOnly: true },
];

const operationsItems: NavItem[] = [];

const adminItems: NavItem[] = [
  { title: "Users", url: "/admin/users", icon: Users, visibleTo: [], superadminOnly: true },
  { title: "Notifications", url: "/admin/notifications", icon: Mail, visibleTo: adminOwnerRoles },
  { title: "Activity", url: "/admin/activity", icon: Activity, visibleTo: adminOwnerRoles },
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
  const { pinnedPages, isPinned, togglePin } = usePreferences();

  const { data: tenantsList } = useQuery<Tenant[]>({
    queryKey: ["/api/tenants"],
  });

  const { activeTenantId, setActiveTenantId } = useTenantStore();

  if (tenantsList && tenantsList.length > 0 && !activeTenantId) {
    setActiveTenantId(tenantsList[0].id);
  }

  const isSuperAdmin = user?.isSuperAdmin === "true";
  const isClient = !isSuperAdmin;

  const filteredNavItems = isClient
    ? clientNavItems
    : filterItemsByRole(navItems, null, isSuperAdmin);
  const filteredOperationsItems = isClient
    ? clientOperationsItems
    : filterItemsByRole(operationsItems, null, isSuperAdmin);
  const filteredAdminItems = isClient
    ? []
    : filterItemsByRole(adminItems, null, isSuperAdmin);

  const initials = user
    ? `${(user.firstName || "")[0] || ""}${(user.lastName || "")[0] || ""}`.toUpperCase() || "U"
    : "U";

  const favoriteItems = pinnedPages
    .map((url) => allItems.find((item) => item.url === url))
    .filter((item): item is NavItem => {
      if (!item) return false;
      if (item.superadminOnly) return isSuperAdmin;
      return true;
    });

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2" data-testid="text-app-title">
          <Logo className="h-8 w-auto" />
        </div>
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
