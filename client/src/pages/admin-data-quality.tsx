import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTenantStore } from "@/lib/tenant-store";
import { useEntityLookup } from "@/hooks/use-entity-lookup";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ShieldCheck, AlertTriangle, Plus } from "lucide-react";

interface Rule {
  id?: number;
  tenantId?: number;
  ruleName: string;
  ruleType: string;
  config: string;
  isActive: boolean;
}

interface Violation {
  id: number;
  tenantId: number;
  ruleId: number;
  locationId: number;
  metricDefinitionId: number;
  severity: string;
  message: string;
  detailJson: string;
  createdAt: string;
}

interface MetricScore {
  metricId: number;
  metricName: string;
  score: number;
  violationCount: number;
}

interface QualityScore {
  locationId: number;
  locationName: string;
  score: number;
  metrics: MetricScore[];
}

interface DataQualityResponse {
  ok: boolean;
  data: {
    rules: Rule[];
    violations: Violation[];
    qualityScores: QualityScore[];
  };
}

import { statusColors, scoreColor, scoreBorderColor } from "@/lib/semantic-colors";

const severityBadgeClasses: Record<string, string> = {
  warning: statusColors.warning,
  error: statusColors.error,
  info: statusColors.info,
};

const ruleTypes = ["period_continuity", "outlier_detection", "duplicate_detection"];

export default function AdminDataQualityPage() {
  const { activeTenantId } = useTenantStore();
  const { toast } = useToast();
  const { resolveLocation, resolveMetric } = useEntityLookup();
  const [localRules, setLocalRules] = useState<Rule[] | null>(null);

  const queryKey = ["/api/admin/data-quality", `?tenantId=${activeTenantId}`];

  const { data: response, isLoading } = useQuery<DataQualityResponse>({
    queryKey,
    enabled: !!activeTenantId,
  });

  const rules = localRules ?? response?.data?.rules ?? [];
  const violations = response?.data?.violations ?? [];
  const qualityScores = response?.data?.qualityScores ?? [];

  const hasLocalChanges = localRules !== null;

  const saveMutation = useMutation({
    mutationFn: async (rulesToSave: Rule[]) => {
      const res = await apiRequest("PUT", `/api/admin/data-quality/rules/${activeTenantId}`, {
        rules: rulesToSave.map(({ id, ruleName, ruleType, config, isActive }) => ({
          id,
          ruleName,
          ruleType,
          config,
          isActive,
        })),
      });
      return res.json();
    },
    onSuccess: () => {
      setLocalRules(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/data-quality"] });
      toast({ title: "Rules saved successfully" });
    },
    onError: (e: Error) =>
      toast({ title: "Failed to save rules", description: e.message, variant: "destructive" }),
  });

  function handleToggleRule(index: number, checked: boolean) {
    const current = [...rules];
    current[index] = { ...current[index], isActive: checked };
    setLocalRules(current);
  }

  function handleAddRule() {
    const current = [...rules];
    current.push({
      ruleName: "New Rule",
      ruleType: "period_continuity",
      config: "{}",
      isActive: true,
    });
    setLocalRules(current);
  }

  function handleRuleNameChange(index: number, name: string) {
    const current = [...rules];
    current[index] = { ...current[index], ruleName: name };
    setLocalRules(current);
  }

  function handleRuleTypeChange(index: number, type: string) {
    const current = [...rules];
    current[index] = { ...current[index], ruleType: type };
    setLocalRules(current);
  }

  function handleSave() {
    saveMutation.mutate(rules);
  }

  if (!activeTenantId) {
    return (
      <div className="p-6 text-center text-muted-foreground" data-testid="text-no-tenant">
        Select a client to manage data quality
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-6 w-6" />
        <h1 className="text-2xl font-bold" data-testid="text-page-title">
          Data Quality
        </h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {qualityScores.map((qs) => (
          <Card
            key={qs.locationId}
            className={`border-l-0 border-t-4 ${scoreBorderColor(qs.score)}`}
            data-testid={`card-quality-score-${qs.locationId}`}
          >
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{qs.locationName}</CardTitle>
              <span className={`text-2xl font-bold ${scoreColor(qs.score)}`} data-testid={`text-score-${qs.locationId}`}>
                {qs.score}%
              </span>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {qs.metrics.map((m) => (
                  <div key={m.metricId} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground truncate">{m.metricName}</span>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={scoreColor(m.score)}>{m.score}%</span>
                      {m.violationCount > 0 && (
                        <Badge variant="secondary" className="text-xs" data-testid={`badge-violation-count-${qs.locationId}-${m.metricId}`}>
                          {m.violationCount}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
        {qualityScores.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground" data-testid="text-no-scores">
              No quality scores yet. Scores are generated after data imports.
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-lg">Quality Rules</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={handleAddRule} data-testid="button-add-rule">
              <Plus className="h-4 w-4 mr-2" /> Add Rule
            </Button>
            <Button
              onClick={handleSave}
              disabled={!hasLocalChanges || saveMutation.isPending}
              data-testid="button-save-rules"
            >
              {saveMutation.isPending ? "Saving..." : "Save Rules"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {rules.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground" data-testid="text-no-rules">
              No rules configured
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map((rule, index) => (
                <div
                  key={rule.id ?? `new-${index}`}
                  className="flex items-center gap-3 p-3 rounded-md border flex-wrap"
                  data-testid={`row-rule-${rule.id ?? index}`}
                >
                  <Input
                    value={rule.ruleName}
                    onChange={(e) => handleRuleNameChange(index, e.target.value)}
                    className="max-w-xs"
                    data-testid={`input-rule-name-${rule.id ?? index}`}
                  />
                  <Select
                    value={rule.ruleType}
                    onValueChange={(val) => handleRuleTypeChange(index, val)}
                  >
                    <SelectTrigger className="w-48" data-testid={`select-rule-type-${rule.id ?? index}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ruleTypes.map((rt) => (
                        <SelectItem key={rt} value={rt}>
                          {rt.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Badge variant="outline">{rule.ruleType.replace(/_/g, " ")}</Badge>
                  <div className="flex items-center gap-2 ml-auto">
                    <Label className="text-sm text-muted-foreground">Active</Label>
                    <Switch
                      checked={rule.isActive}
                      onCheckedChange={(checked) => handleToggleRule(index, checked)}
                      data-testid={`switch-rule-active-${rule.id ?? index}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2 space-y-0">
          <AlertTriangle className="h-5 w-5" />
          <CardTitle className="text-lg">Violations</CardTitle>
        </CardHeader>
        <CardContent>
          {violations.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground" data-testid="text-no-violations">
              No violations detected — your data is clean.
            </div>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Severity</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Metric</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {violations.map((v) => (
                  <TableRow key={v.id} data-testid={`row-violation-${v.id}`}>
                    <TableCell>
                      <Badge
                        className={severityBadgeClasses[v.severity] || ""}
                        data-testid={`badge-severity-${v.id}`}
                      >
                        {v.severity}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-md truncate" data-testid={`text-violation-message-${v.id}`}>
                      {v.message}
                    </TableCell>
                    <TableCell data-testid={`text-violation-location-${v.id}`}>
                      {resolveLocation(v.locationId)}
                    </TableCell>
                    <TableCell data-testid={`text-violation-metric-${v.id}`}>
                      {resolveMetric(v.metricDefinitionId)}
                    </TableCell>
                    <TableCell data-testid={`text-violation-date-${v.id}`}>
                      {new Date(v.createdAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
