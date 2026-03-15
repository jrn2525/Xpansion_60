import { useQuery } from "@tanstack/react-query";
import { useTenantStore } from "@/lib/tenant-store";

interface TenantUser {
  id: number;
  userId: string;
  role: string;
  username: string | null;
}

interface Tenant {
  id: number;
  name: string;
}

interface Location {
  id: number;
  name: string;
}

interface MetricDefinition {
  id: number;
  name: string;
}

export function useEntityLookup(tenantIdOverride?: number) {
  const { activeTenantId } = useTenantStore();
  const tenantId = tenantIdOverride ?? activeTenantId;

  const { data: users = [] } = useQuery<TenantUser[]>({
    queryKey: ["/api/tenants", tenantId, "users"],
    enabled: !!tenantId,
    staleTime: 60_000,
    select: (response: any) => response?.data ?? response ?? [],
  });

  const { data: tenants = [] } = useQuery<Tenant[]>({
    queryKey: ["/api/admin/tenants"],
    staleTime: 60_000,
    select: (response: any) => response?.data ?? response ?? [],
  });

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/tenants", tenantId, "locations"],
    enabled: !!tenantId,
    staleTime: 60_000,
    select: (response: any) => response?.data ?? response ?? [],
  });

  const { data: metrics = [] } = useQuery<MetricDefinition[]>({
    queryKey: ["/api/tenants", tenantId, "metrics"],
    enabled: !!tenantId,
    staleTime: 60_000,
    select: (response: any) => response?.data ?? response ?? [],
  });

  const userMap = new Map<string, string>();
  for (const u of users) {
    if (u.username) userMap.set(u.userId, u.username);
  }

  const tenantMap = new Map<number, string>();
  for (const t of tenants) {
    tenantMap.set(t.id, t.name);
  }

  const locationMap = new Map<number, string>();
  for (const l of locations) {
    locationMap.set(l.id, l.name);
  }

  const metricMap = new Map<number, string>();
  for (const m of metrics) {
    metricMap.set(m.id, m.name);
  }

  function resolveUser(id: string | null | undefined, truncateLength = 12): string {
    if (!id) return "—";
    return userMap.get(id) || (id.length > truncateLength ? id.slice(0, truncateLength) + "…" : id);
  }

  function resolveTenant(id: number | null | undefined): string {
    if (id == null) return "—";
    return tenantMap.get(id) || `Business #${id}`;
  }

  function resolveLocation(id: number | null | undefined): string {
    if (id == null) return "—";
    return locationMap.get(id) || `Location #${id}`;
  }

  function resolveMetric(id: number | null | undefined): string {
    if (id == null) return "—";
    return metricMap.get(id) || `Metric #${id}`;
  }

  return {
    users,
    tenants,
    locations,
    metrics,
    resolveUser,
    resolveTenant,
    resolveLocation,
    resolveMetric,
  };
}
