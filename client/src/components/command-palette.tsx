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
  Building2,
  Mail,
  Activity,
  Radio,
  Search,
  Users,
  Settings,
  UserCheck,
} from "lucide-react";
import type { Tenant } from "@shared/schema";
import { useTenantStore } from "@/lib/tenant-store";

const allPages = [
  { title: "Clients", url: "/clients", icon: UserCheck },
  { title: "Settings", url: "/settings", icon: Settings },
  { title: "Users", url: "/admin/users", icon: Users },
  { title: "Notifications", url: "/admin/notifications", icon: Mail },
  { title: "Activity", url: "/admin/activity", icon: Activity },
  { title: "Command Tower", url: "/superadmin/tower", icon: Radio },
  { title: "Onboarding", url: "/onboarding", icon: Building2 },
];

const quickActions: { title: string; url: string; icon: typeof Search }[] = [];

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
      <CommandInput placeholder="Search pages, businesses, locations, actions..." data-testid="input-command-search" />
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
            <CommandGroup heading="Businesses">
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
