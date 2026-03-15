import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenantStore } from "@/lib/tenant-store";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Palette, Image, Save, RotateCcw } from "lucide-react";
import { useState, useEffect } from "react";

interface TenantWithBranding {
  id: number;
  name: string;
  logoUrl?: string | null;
  accentColor?: string | null;
}

export default function TenantBrandingPage() {
  const { activeTenantId } = useTenantStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: tenants } = useQuery<TenantWithBranding[]>({
    queryKey: ["/api/tenants"],
  });

  const activeTenant = tenants?.find((t) => t.id === activeTenantId);

  const [logoUrl, setLogoUrl] = useState("");
  const [accentColor, setAccentColor] = useState("#e11d48");

  useEffect(() => {
    if (activeTenant) {
      setLogoUrl(activeTenant.logoUrl || "");
      setAccentColor(activeTenant.accentColor || "#e11d48");
    }
  }, [activeTenant]);

  const updateMutation = useMutation({
    mutationFn: async (data: { logoUrl?: string | null; accentColor?: string | null }) => {
      await apiRequest("PATCH", `/api/tenants/${activeTenantId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants"] });
      toast({ title: "Branding updated", description: "Your branding changes have been saved." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save branding.", variant: "destructive" });
    },
  });

  const handleSave = () => {
    updateMutation.mutate({
      logoUrl: logoUrl.trim() || null,
      accentColor: accentColor || null,
    });
  };

  const handleReset = () => {
    updateMutation.mutate({ logoUrl: null, accentColor: null });
    setLogoUrl("");
    setAccentColor("#e11d48");
  };

  if (!activeTenantId) {
    return (
      <div className="p-6" data-testid="branding-no-tenant">
        <p className="text-muted-foreground">Select a client to manage branding.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6" data-testid="page-tenant-branding">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Branding</h1>
        <p className="text-muted-foreground">Customize how your franchise sees the platform.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Image className="h-5 w-5" />
            Logo
          </CardTitle>
          <CardDescription>
            Enter a URL to your logo image. It will appear in the sidebar header.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="logoUrl">Logo URL</Label>
            <Input
              id="logoUrl"
              placeholder="https://example.com/logo.png"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              data-testid="input-logo-url"
            />
          </div>
          {logoUrl && (
            <div className="p-4 rounded-lg bg-muted flex items-center justify-center" data-testid="logo-preview">
              <img
                src={logoUrl}
                alt="Logo preview"
                className="max-h-16 max-w-[200px] object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Accent Color
          </CardTitle>
          <CardDescription>
            Choose an accent color for buttons and highlights. Defaults to brand red when not set.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="space-y-2 flex-1">
              <Label htmlFor="accentColor">Color</Label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  id="accentColor"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="h-10 w-14 rounded border border-input cursor-pointer"
                  data-testid="input-accent-color"
                />
                <Input
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  placeholder="#e11d48"
                  className="max-w-[120px] font-mono text-sm"
                  data-testid="input-accent-hex"
                />
              </div>
            </div>
            <div
              className="h-12 w-12 rounded-lg shadow-sm"
              style={{ backgroundColor: accentColor }}
              data-testid="color-swatch-preview"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button
          onClick={handleSave}
          disabled={updateMutation.isPending}
          data-testid="button-save-branding"
        >
          <Save className="h-4 w-4 mr-2" />
          {updateMutation.isPending ? "Saving..." : "Save Changes"}
        </Button>
        <Button
          variant="outline"
          onClick={handleReset}
          disabled={updateMutation.isPending}
          data-testid="button-reset-branding"
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset to Default
        </Button>
      </div>
    </div>
  );
}
