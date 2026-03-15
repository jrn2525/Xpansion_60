import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTenantStore } from "@/lib/tenant-store";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Plug,
  Key,
  Columns,
  Clock,
  Zap,
  MapPin,
  Globe,
  Database,
  FileJson,
  RefreshCw,
} from "lucide-react";
import type { Location, MetricDefinition } from "@shared/schema";

type Step = 1 | 2 | 3 | 4 | 5 | 6;

const INTEGRATION_TYPES = [
  { id: "rest_api", name: "REST API", icon: Globe, desc: "Connect to any REST API endpoint" },
  { id: "webhook", name: "Webhook Receiver", icon: Zap, desc: "Receive data via incoming webhooks" },
  { id: "database", name: "External Database", icon: Database, desc: "Connect to an external database" },
  { id: "csv_feed", name: "CSV/JSON Feed", icon: FileJson, desc: "Pull data from a scheduled URL" },
];

const SYNC_SCHEDULES = [
  { value: "manual", label: "Manual only" },
  { value: "hourly", label: "Every hour" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const STEPS = [
  { num: 1, label: "Type", icon: Plug },
  { num: 2, label: "Configure", icon: Globe },
  { num: 3, label: "Credentials", icon: Key },
  { num: 4, label: "Map Fields", icon: Columns },
  { num: 5, label: "Schedule", icon: Clock },
  { num: 6, label: "Activate", icon: Zap },
];

export default function ApiWizardPage() {
  const { toast } = useToast();
  const { activeTenantId } = useTenantStore();
  const [, setLocation] = useLocation();

  const [step, setStep] = useState<Step>(1);
  const [integrationType, setIntegrationType] = useState("");
  const [name, setName] = useState("");
  const [config, setConfig] = useState<Record<string, any>>({
    baseUrl: "",
    endpoint: "",
    method: "GET",
    headers: "",
  });
  const [credentials, setCredentials] = useState<Record<string, any>>({
    apiKey: "",
    authType: "none",
    username: "",
    password: "",
  });
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [syncSchedule, setSyncSchedule] = useState("manual");
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [createdId, setCreatedId] = useState<number | null>(null);

  const { data: locations } = useQuery<Location[]>({
    queryKey: [`/api/tenants/${activeTenantId}/locations`],
    enabled: !!activeTenantId,
  });

  const { data: metrics } = useQuery<MetricDefinition[]>({
    queryKey: [`/api/tenants/${activeTenantId}/metrics`],
    enabled: !!activeTenantId,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const resp = await apiRequest("POST", `/api/tenants/${activeTenantId}/integrations`, {
        name,
        type: integrationType,
        config,
        credentials,
        fieldMapping,
        syncSchedule,
        locationId: selectedLocationId ? Number(selectedLocationId) : null,
        status: "draft",
      });
      return resp.json();
    },
    onSuccess: (data) => {
      const id = data.data?.id;
      setCreatedId(id);
      setStep(6);
      queryClient.invalidateQueries({ queryKey: [`/api/tenants/${activeTenantId}/integrations`] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      if (!createdId) {
        const resp = await apiRequest("POST", `/api/tenants/${activeTenantId}/integrations`, {
          name,
          type: integrationType,
          config,
          credentials,
          fieldMapping,
          syncSchedule,
          locationId: selectedLocationId ? Number(selectedLocationId) : null,
          status: "draft",
        });
        const data = await resp.json();
        const id = data.data?.id;
        setCreatedId(id);

        const testResp = await apiRequest("POST", `/api/tenants/${activeTenantId}/integrations/${id}/test`);
        return testResp.json();
      }
      const testResp = await apiRequest("POST", `/api/tenants/${activeTenantId}/integrations/${createdId}/test`);
      return testResp.json();
    },
    onSuccess: (data) => {
      setTestResult(data.data);
      queryClient.invalidateQueries({ queryKey: [`/api/tenants/${activeTenantId}/integrations`] });
    },
    onError: (err: Error) => {
      setTestResult({ success: false, message: err.message });
    },
  });

  const activateMutation = useMutation({
    mutationFn: async () => {
      if (!createdId) throw new Error("No integration created");
      const resp = await apiRequest("PATCH", `/api/tenants/${activeTenantId}/integrations/${createdId}`, {
        status: "active",
        fieldMapping,
        syncSchedule,
        locationId: selectedLocationId ? Number(selectedLocationId) : null,
      });
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/tenants/${activeTenantId}/integrations`] });
      toast({ title: "Integration activated", description: `"${name}" is now active` });
    },
    onError: (err: Error) => {
      toast({ title: "Activation failed", description: err.message, variant: "destructive" });
    },
  });

  const selectedType = INTEGRATION_TYPES.find(t => t.id === integrationType);

  if (!activeTenantId) {
    return (
      <div className="p-6 text-center text-muted-foreground" data-testid="no-tenant">
        Select a client to create an integration.
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6" data-testid="api-wizard">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">API Integration Wizard</h1>
          <p className="text-sm text-muted-foreground">Connect external data sources to auto-sync metrics</p>
        </div>
        <Button variant="outline" onClick={() => setLocation("/integrations")} data-testid="button-back-hub">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Hub
        </Button>
      </div>

      <div className="flex items-center gap-2 mb-6">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const isActive = step === s.num;
          const isDone = step > s.num;
          return (
            <div key={s.num} className="flex items-center gap-2">
              {i > 0 && <div className={`h-px w-6 ${isDone ? "bg-green-500" : "bg-border"}`} />}
              <div
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  isActive ? "bg-primary text-primary-foreground" :
                  isDone ? "bg-green-500/10 text-green-600 dark:text-green-400" :
                  "bg-muted text-muted-foreground"
                }`}
                data-testid={`step-indicator-${s.num}`}
              >
                {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                {s.label}
              </div>
            </div>
          );
        })}
      </div>

      {step === 1 && (
        <Card data-testid="step-type">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plug className="h-5 w-5" /> Choose Integration Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {INTEGRATION_TYPES.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => setIntegrationType(t.id)}
                    className={`p-4 rounded-lg border-2 text-left transition-colors ${
                      integrationType === t.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                    data-testid={`button-type-${t.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-muted">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{t.name}</p>
                        <p className="text-xs text-muted-foreground">{t.desc}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end pt-4">
              <Button onClick={() => setStep(2)} disabled={!integrationType} data-testid="button-next-2">
                Next <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card data-testid="step-configure">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" /> Name & Configure
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Integration Name</Label>
              <Input
                placeholder="e.g. POS Revenue Sync"
                value={name}
                onChange={(e) => setName(e.target.value)}
                data-testid="input-name"
              />
            </div>

            {(integrationType === "rest_api" || integrationType === "csv_feed") && (
              <>
                <div className="space-y-2">
                  <Label>Base URL</Label>
                  <Input
                    placeholder="https://api.example.com"
                    value={config.baseUrl}
                    onChange={(e) => setConfig(prev => ({ ...prev, baseUrl: e.target.value }))}
                    data-testid="input-base-url"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Endpoint Path</Label>
                  <Input
                    placeholder="/v1/reports/daily"
                    value={config.endpoint}
                    onChange={(e) => setConfig(prev => ({ ...prev, endpoint: e.target.value }))}
                    data-testid="input-endpoint"
                  />
                </div>
                {integrationType === "rest_api" && (
                  <div className="space-y-2">
                    <Label>HTTP Method</Label>
                    <Select value={config.method} onValueChange={(v) => setConfig(prev => ({ ...prev, method: v }))}>
                      <SelectTrigger data-testid="select-method">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GET">GET</SelectItem>
                        <SelectItem value="POST">POST</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}

            {integrationType === "webhook" && (
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <p className="text-sm font-medium">Webhook URL</p>
                <p className="text-xs text-muted-foreground">
                  After creation, a unique webhook URL will be generated. Send POST requests to this URL with your metric data.
                </p>
              </div>
            )}

            {integrationType === "database" && (
              <div className="space-y-2">
                <Label>Connection String</Label>
                <Input
                  placeholder="postgres://user:pass@host:5432/db"
                  value={config.connectionString || ""}
                  onChange={(e) => setConfig(prev => ({ ...prev, connectionString: e.target.value }))}
                  type="password"
                  data-testid="input-connection-string"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Custom Headers (JSON, optional)</Label>
              <Textarea
                placeholder='{"Content-Type": "application/json"}'
                value={config.headers}
                onChange={(e) => setConfig(prev => ({ ...prev, headers: e.target.value }))}
                rows={2}
                data-testid="input-headers"
              />
            </div>

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep(1)} data-testid="button-back-1">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button onClick={() => setStep(3)} disabled={!name.trim()} data-testid="button-next-3">
                Next <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card data-testid="step-credentials">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" /> Credentials
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Authentication Type</Label>
              <Select value={credentials.authType} onValueChange={(v) => setCredentials(prev => ({ ...prev, authType: v }))}>
                <SelectTrigger data-testid="select-auth-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Authentication</SelectItem>
                  <SelectItem value="api_key">API Key</SelectItem>
                  <SelectItem value="basic">Basic Auth</SelectItem>
                  <SelectItem value="bearer">Bearer Token</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {credentials.authType === "api_key" && (
              <div className="space-y-2">
                <Label>API Key</Label>
                <Input
                  type="password"
                  placeholder="Enter your API key"
                  value={credentials.apiKey}
                  onChange={(e) => setCredentials(prev => ({ ...prev, apiKey: e.target.value }))}
                  data-testid="input-api-key"
                />
              </div>
            )}

            {credentials.authType === "basic" && (
              <>
                <div className="space-y-2">
                  <Label>Username</Label>
                  <Input
                    value={credentials.username}
                    onChange={(e) => setCredentials(prev => ({ ...prev, username: e.target.value }))}
                    data-testid="input-username"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <Input
                    type="password"
                    value={credentials.password}
                    onChange={(e) => setCredentials(prev => ({ ...prev, password: e.target.value }))}
                    data-testid="input-password"
                  />
                </div>
              </>
            )}

            {credentials.authType === "bearer" && (
              <div className="space-y-2">
                <Label>Bearer Token</Label>
                <Input
                  type="password"
                  placeholder="Enter bearer token"
                  value={credentials.apiKey}
                  onChange={(e) => setCredentials(prev => ({ ...prev, apiKey: e.target.value }))}
                  data-testid="input-bearer-token"
                />
              </div>
            )}

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep(2)} data-testid="button-back-2">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button onClick={() => setStep(4)} data-testid="button-next-4">
                Next <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card data-testid="step-map-fields">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Columns className="h-5 w-5" /> Map Fields
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Map the response fields from the API to your metrics. Enter the JSON path for each metric.
            </p>

            {metrics?.map((m) => (
              <div key={m.id} className="flex items-center gap-3">
                <Label className="w-40 shrink-0 text-sm">{m.name}{m.unit ? ` (${m.unit})` : ""}</Label>
                <Input
                  placeholder={`e.g. data.${m.name.toLowerCase().replace(/\s+/g, "_")}`}
                  value={fieldMapping[String(m.id)] || ""}
                  onChange={(e) => setFieldMapping(prev => ({ ...prev, [String(m.id)]: e.target.value }))}
                  data-testid={`input-field-mapping-${m.id}`}
                />
              </div>
            ))}

            {(!metrics || metrics.length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No metrics defined yet. Create metrics first to map API fields.
              </p>
            )}

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep(3)} data-testid="button-back-3">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button onClick={() => setStep(5)} data-testid="button-next-5">
                Next <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 5 && (
        <Card data-testid="step-schedule">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" /> Schedule & Location
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Sync Schedule</Label>
                <Select value={syncSchedule} onValueChange={setSyncSchedule}>
                  <SelectTrigger data-testid="select-schedule">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SYNC_SCHEDULES.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Target Location</Label>
                <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                  <SelectTrigger data-testid="select-location">
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations?.map((l) => (
                      <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep(4)} data-testid="button-back-4">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} data-testid="button-next-6">
                {createMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Creating...</>
                ) : (
                  <>Next <ArrowRight className="h-4 w-4 ml-1" /></>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 6 && (
        <Card data-testid="step-activate">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" /> Test & Activate
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Name</p>
                <p className="text-sm font-medium">{name}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Type</p>
                <p className="text-sm font-medium">{selectedType?.name}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Schedule</p>
                <p className="text-sm font-medium">{SYNC_SCHEDULES.find(s => s.value === syncSchedule)?.label}</p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => testMutation.mutate()}
                disabled={testMutation.isPending}
                data-testid="button-test"
              >
                {testMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Testing...</>
                ) : (
                  <><RefreshCw className="h-4 w-4 mr-1" /> Test Connection</>
                )}
              </Button>
            </div>

            {testResult && (
              <div className={`flex items-center gap-2 p-3 rounded-lg ${
                testResult.success ? "bg-green-500/10 text-green-600 dark:text-green-400" : "bg-red-500/10 text-red-600 dark:text-red-400"
              }`}>
                {testResult.success ? <CheckCircle2 className="h-4 w-4" /> : <Plug className="h-4 w-4" />}
                <span className="text-sm">{testResult.message}</span>
              </div>
            )}

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep(5)} data-testid="button-back-5">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setLocation("/integrations")}
                  data-testid="button-save-draft"
                >
                  Save as Draft
                </Button>
                <Button
                  onClick={() => activateMutation.mutate()}
                  disabled={activateMutation.isPending}
                  data-testid="button-activate"
                >
                  {activateMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Activating...</>
                  ) : (
                    <><Zap className="h-4 w-4 mr-1" /> Activate Integration</>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
