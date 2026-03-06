export const statusColors = {
  success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  warning: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  error: "bg-red-500/15 text-red-700 dark:text-red-400",
  info: "bg-muted text-muted-foreground",
  neutral: "bg-secondary text-secondary-foreground",
} as const;

export const severityColors = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  high: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  critical: "bg-red-500/15 text-red-700 dark:text-red-400",
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
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

export function scoreBorderColor(score: number): string {
  if (score >= 80) return "border-emerald-500";
  if (score >= 60) return "border-amber-500";
  return "border-red-500";
}

export function scoreBgColor(score: number): string {
  if (score >= 80) return "bg-emerald-500/10";
  if (score >= 60) return "bg-amber-500/10";
  return "bg-red-500/10";
}

export function deltaTrendColor(delta: number): string {
  if (delta > 0) return "text-emerald-600 dark:text-emerald-400";
  if (delta < 0) return "text-red-600 dark:text-red-400";
  return "text-muted-foreground";
}
