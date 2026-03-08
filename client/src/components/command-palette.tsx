import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  Building2,
  MapPin,
  BarChart3,
  ClipboardCheck,
  TrendingUp,
  Upload,
  Bell,
  FileBarChart,
  Briefcase,
  ShieldCheck,
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
  Mail,
  Search,
  Plus,
  FileUp,
  FileSpreadsheet,
} from "lucide-react";
import type { Tenant } from "@shared/schema";
import { useTenantStore } from "@/lib/tenant-store";

const allPages = [
  { title: "Daily Brief", url: "/brief", icon: Newspaper },
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Command Center", url: "/command-center", icon: Crosshair },
  { title: "Portfolio", url: "/portfolio", icon: Briefcase },
  { title: "Tenants", url: "/tenants", icon: Building2 },
  { title: "Locations", url: "/locations", icon: MapPin },
  { title: "Metrics", url: "/metrics", icon: BarChart3 },
  { title: "Scorecards", url: "/scorecards", icon: ClipboardCheck },
  { title: "Trends", url: "/trends", icon: TrendingUp },
  { title: "Inbox", url: "/inbox", icon: Inbox },
  { title: "Actions", url: "/actions", icon: ListChecks },
  { title: "Goals", url: "/goals", icon: Target },
  { title: "Benchmarking", url: "/benchmarking", icon: Trophy },
  { title: "Playbooks", url: "/playbooks", icon: BookOpen },
  { title: "Risk", url: "/risk", icon: AlertTriangle },
  { title: "Weekly Plans", url: "/weekly-plans", icon: Calendar },
  { title: "Campaigns", url: "/campaigns", icon: Megaphone },
  { title: "Imports", url: "/admin/imports", icon: Upload },
  { title: "Alerts", url: "/admin/alerts", icon: Bell },
  { title: "Reports", url: "/admin/reports", icon: FileBarChart },
  { title: "Digests", url: "/admin/digests", icon: FileText },
  { title: "Notifications", url: "/admin/notifications", icon: Mail },
  { title: "Data Quality", url: "/admin/data-quality", icon: ShieldCheck },
  { title: "Security", url: "/admin/security", icon: Shield },
  { title: "Activity", url: "/admin/activity", icon: Activity },
  { title: "Ops Health", url: "/admin/ops", icon: Server },
  { title: "Command Tower", url: "/superadmin/tower", icon: Radio },
  { title: "Onboarding", url: "/onboarding", icon: Building2 },
];

const quickActions = [
  { title: "Create Action", url: "/actions", icon: Plus },
  { title: "Import Data", url: "/admin/imports", icon: FileUp },
  { title: "Generate Report", url: "/admin/reports", icon: FileSpreadsheet },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();
  const { setActiveTenantId } = useTenantStore();
  const activeTenantId = useTenantStore().activeTenantId;

  const { data: tenantsList } = useQuery<Tenant[]>({
    queryKey: ["/api/tenants"],
  });

  const { data: locationsData } = useQuery<any[]>({
    queryKey: [`/api/tenants/${activeTenantId}/locations`],
    enabled: !!activeTenantId,
  });

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const navigateTo = useCallback(
    (url: string) => {
      setLocation(url);
      setOpen(false);
    },
    [setLocation],
  );

  const switchTenant = useCallback(
    (tenantId: number) => {
      setActiveTenantId(tenantId);
      setOpen(false);
    },
    [setActiveTenantId],
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search pages, tenants, locations, actions..." data-testid="input-command-search" />
      <CommandList>
        <CommandEmpty data-testid="text-command-empty">No results found.</CommandEmpty>

        <CommandGroup heading="Pages">
          {allPages.map((page) => (
            <CommandItem
              key={page.url}
              value={page.title}
              onSelect={() => navigateTo(page.url)}
              data-testid={`command-item-page-${page.title.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <page.icon className="h-4 w-4" />
              <span>{page.title}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        {tenantsList && tenantsList.length > 0 && (
          <>
            <CommandGroup heading="Tenants">
              {tenantsList.map((tenant) => (
                <CommandItem
                  key={tenant.id}
                  value={`tenant ${tenant.name}`}
                  onSelect={() => switchTenant(tenant.id)}
                  data-testid={`command-item-tenant-${tenant.id}`}
                >
                  <Building2 className="h-4 w-4" />
                  <span>{tenant.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {locationsData && locationsData.length > 0 && (
          <>
            <CommandGroup heading="Locations">
              {locationsData.map((loc: any) => (
                <CommandItem
                  key={loc.id}
                  value={`location ${loc.name}`}
                  onSelect={() => navigateTo("/locations")}
                  data-testid={`command-item-location-${loc.id}`}
                >
                  <MapPin className="h-4 w-4" />
                  <span>{loc.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="Quick Actions">
          {quickActions.map((action) => (
            <CommandItem
              key={action.title}
              value={action.title}
              onSelect={() => navigateTo(action.url)}
              data-testid={`command-item-action-${action.title.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <action.icon className="h-4 w-4" />
              <span>{action.title}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

export function CommandPaletteButton() {
  return (
    <button
      onClick={() => {
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "k", metaKey: true }),
        );
      }}
      className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover-elevate"
      data-testid="button-command-palette"
    >
      <Search className="h-4 w-4" />
      <span className="hidden sm:inline">Search</span>
      <kbd className="hidden sm:inline-flex pointer-events-none h-5 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
        <span className="text-xs">⌘</span>K
      </kbd>
    </button>
  );
}
