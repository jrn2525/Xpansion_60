export interface PeriodInfo {
  period: string;
  periodStart: Date;
  periodEnd: Date;
  label: string;
}

export function getPeriodDates(frequency: string, referenceDate: Date): PeriodInfo {
  const d = new Date(referenceDate);
  if (frequency === "daily") {
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    end.setMilliseconds(-1);
    return {
      period: "day",
      periodStart: start,
      periodEnd: end,
      label: start.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" }),
    };
  }
  if (frequency === "weekly") {
    const dayOfWeek = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((dayOfWeek + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return {
      period: "week",
      periodStart: monday,
      periodEnd: sunday,
      label: `${monday.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${sunday.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
    };
  }
  if (frequency === "biweekly") {
    const startOfYear = new Date(d.getFullYear(), 0, 1);
    const daysSinceStart = Math.floor((d.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
    const biweekNum = Math.floor(daysSinceStart / 14);
    const periodStart = new Date(startOfYear);
    periodStart.setDate(startOfYear.getDate() + biweekNum * 14);
    periodStart.setHours(0, 0, 0, 0);
    const periodEnd = new Date(periodStart);
    periodEnd.setDate(periodStart.getDate() + 13);
    periodEnd.setHours(23, 59, 59, 999);
    return {
      period: "biweek",
      periodStart,
      periodEnd,
      label: `${periodStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${periodEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
    };
  }
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
  return {
    period: "month",
    periodStart: start,
    periodEnd: end,
    label: start.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
  };
}

export function stepPeriod(frequency: string, date: Date, direction: number): Date {
  const d = new Date(date);
  if (frequency === "daily") { d.setDate(d.getDate() + direction); return d; }
  if (frequency === "weekly") { d.setDate(d.getDate() + 7 * direction); return d; }
  if (frequency === "biweekly") { d.setDate(d.getDate() + 14 * direction); return d; }
  d.setMonth(d.getMonth() + direction);
  return d;
}

export function getBandForValue(
  value: number,
  thresholds: Array<{ band: string; minValue: number | null; maxValue: number | null }>
): string | null {
  for (const t of thresholds) {
    const min = t.minValue ?? -Infinity;
    const max = t.maxValue ?? Infinity;
    if (value >= min && value <= max) {
      return t.band;
    }
  }
  return null;
}

export function getTargetDisplay(
  thresholds: Array<{ band: string; minValue: number | null; maxValue: number | null }>,
  direction: string
): string | null {
  const good = thresholds.find(t => t.band === "good");
  if (!good) return null;
  if (direction === "higher_is_better") {
    return `≥ ${good.minValue}`;
  }
  return `≤ ${good.maxValue}`;
}
