export const statusColors = {
  success: "bg-status-success/15 text-status-success-foreground",
  warning: "bg-status-warning/15 text-status-warning-foreground",
  error: "bg-status-error/15 text-status-error-foreground",
  info: "bg-status-info text-status-info-foreground",
  neutral: "bg-secondary text-secondary-foreground",
} as const;

export const severityColors = {
  low: "bg-status-info text-status-info-foreground",
  medium: "bg-status-warning/15 text-status-warning-foreground",
  high: "bg-status-error/20 text-status-error-foreground",
  critical: "bg-status-error/30 text-status-error-foreground",
} as const;

export const bandColors: Record<string, string> = {
  excellent: "hsl(var(--status-success))",
  good: "hsl(var(--primary))",
  acceptable: "hsl(var(--status-warning))",
  poor: "hsl(var(--status-error))",
};

export const bandBadgeStyles: Record<string, string> = {
  excellent: statusColors.success,
  good: statusColors.neutral,
  acceptable: statusColors.warning,
  poor: statusColors.error,
};

export function scoreColor(score: number): string {
  if (score >= 80) return "text-status-success-foreground";
  if (score >= 60) return "text-status-warning-foreground";
  return "text-status-error-foreground";
}

export function scoreBorderColor(score: number): string {
  if (score >= 80) return "border-status-success";
  if (score >= 60) return "border-status-warning";
  return "border-status-error";
}

export function scoreBgColor(score: number): string {
  if (score >= 80) return "bg-status-success/10";
  if (score >= 60) return "bg-status-warning/10";
  return "bg-status-error/10";
}

export function deltaTrendColor(delta: number): string {
  if (delta > 0) return "text-status-success-foreground";
  if (delta < 0) return "text-status-error-foreground";
  return "text-muted-foreground";
}

export const anomalyStyles = {
  card: "bg-status-error/10 border-status-error/30",
  icon: "text-status-error",
  text: "text-status-error-foreground",
  dot: "hsl(var(--status-error))",
} as const;

export const chartTokens = {
  primary: "hsl(var(--primary))",
  background: "hsl(var(--background))",
  foreground: "hsl(var(--foreground))",
  muted: "hsl(var(--muted-foreground))",
  border: "hsl(var(--border))",
  popover: "hsl(var(--popover))",
  popoverForeground: "hsl(var(--popover-foreground))",
  forecast: "hsl(var(--chart-5))",
  error: "hsl(var(--status-error))",
} as const;
