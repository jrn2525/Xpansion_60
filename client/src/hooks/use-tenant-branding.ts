import { useQuery } from "@tanstack/react-query";
import { useTenantStore } from "@/lib/tenant-store";
import { useEffect } from "react";

interface TenantWithBranding {
  id: number;
  name: string;
  slug: string;
  logoUrl?: string | null;
  accentColor?: string | null;
  role?: string;
}

export function useTenantBranding() {
  const { activeTenantId } = useTenantStore();

  const { data: tenants } = useQuery<TenantWithBranding[]>({
    queryKey: ["/api/tenants"],
  });

  const activeTenant = tenants?.find((t) => t.id === activeTenantId);
  const logoUrl = activeTenant?.logoUrl || null;
  const accentColor = activeTenant?.accentColor || null;

  useEffect(() => {
    const root = document.documentElement;
    if (accentColor) {
      const r = parseInt(accentColor.slice(1, 3), 16);
      const g = parseInt(accentColor.slice(3, 5), 16);
      const b = parseInt(accentColor.slice(5, 7), 16);
      const max = Math.max(r, g, b) / 255;
      const min = Math.min(r, g, b) / 255;
      const l = (max + min) / 2;
      const d = max - min;
      let s = 0;
      let h = 0;
      if (d !== 0) {
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r / 255) h = ((g / 255 - b / 255) / d + (g < b ? 6 : 0)) * 60;
        else if (max === g / 255) h = ((b / 255 - r / 255) / d + 2) * 60;
        else h = ((r / 255 - g / 255) / d + 4) * 60;
      }
      const hsl = `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
      root.style.setProperty("--primary", hsl);
      root.style.setProperty("--sidebar-primary", hsl);
    } else {
      root.style.removeProperty("--primary");
      root.style.removeProperty("--sidebar-primary");
    }
    return () => {
      root.style.removeProperty("--primary");
      root.style.removeProperty("--sidebar-primary");
    };
  }, [accentColor]);

  return { logoUrl, accentColor, activeTenant };
}
