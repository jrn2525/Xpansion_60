/**
 * Schedule computation for the Xpansion 60 coaching app.
 *
 * Given a client's enrollment (start date + the program's total weekday count)
 * and any pauses they've taken, this answers a single question:
 *
 *   "What should this client see on the given date?"
 *
 * The return value is one of:
 *   - before_start  → program hasn't started yet
 *   - weekend       → it's Saturday or Sunday, no daily task
 *   - paused        → an active pause covers this date
 *   - complete      → past the final program day (e.g., day 61+ of a 60-day program)
 *   - active        → a regular weekday inside the program; weekNumber/dayNumber
 *                     describe where the client is in the curriculum
 *
 * "Weekdays elapsed" counts weekdays from the start date through today,
 * inclusive of both endpoints, minus any weekdays consumed by pauses. So:
 *
 *   - startDate = Mon 2026-01-05, today = Mon 2026-01-05 → 1 weekday elapsed → day 1, week 1
 *   - startDate = Mon 2026-01-05, today = Fri 2026-01-09 → 5 weekdays elapsed → day 5, week 1
 *   - startDate = Mon 2026-01-05, today = Mon 2026-01-12 → 6 weekdays elapsed → day 1, week 2
 *
 * Dates are passed as YYYY-MM-DD strings to dodge timezone bugs. The function
 * works in UTC internally but the values are calendar-day-only — there is no
 * notion of "what time of day."
 */

export type ScheduleResult =
  | { status: "before_start"; startDate: string }
  | { status: "weekend" }
  | { status: "paused"; pauseUntil: string | null }
  | { status: "complete" }
  | {
      status: "active";
      weekNumber: number;
      dayNumber: number;
      weekdaysElapsed: number;
    };

export interface PauseRange {
  /** YYYY-MM-DD, inclusive */
  pauseStart: string;
  /** YYYY-MM-DD, inclusive. null means the pause is still open-ended. */
  pauseEnd: string | null;
}

export interface ScheduleInput {
  /** YYYY-MM-DD — when this client's program begins */
  startDate: string;
  /** YYYY-MM-DD — the date we are computing the schedule for */
  today: string;
  /** Total weekdays in the program (60 for the v1 "4 Basics" phase) */
  totalWeekdays: number;
  /** Every pause for this enrollment — active, past, or future */
  pauses: PauseRange[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * MS_PER_DAY);
}

/** Count weekdays in [start, end], inclusive. Returns 0 if end < start. */
function countWeekdays(start: Date, end: Date): number {
  if (end.getTime() < start.getTime()) return 0;
  let count = 0;
  let current = start;
  while (current.getTime() <= end.getTime()) {
    if (!isWeekend(current)) count++;
    current = addDays(current, 1);
  }
  return count;
}

export function computeSchedule(input: ScheduleInput): ScheduleResult {
  const { startDate, today, totalWeekdays, pauses } = input;
  const start = parseISODate(startDate);
  const now = parseISODate(today);

  // 1. Program hasn't started yet
  if (now.getTime() < start.getTime()) {
    return { status: "before_start", startDate };
  }

  // 2. Currently inside a pause window
  for (const pause of pauses) {
    const pStart = parseISODate(pause.pauseStart);
    const pEnd = pause.pauseEnd ? parseISODate(pause.pauseEnd) : null;
    if (
      now.getTime() >= pStart.getTime() &&
      (pEnd === null || now.getTime() <= pEnd.getTime())
    ) {
      return { status: "paused", pauseUntil: pause.pauseEnd };
    }
  }

  // 3. Weekend — no task today regardless of program state
  if (isWeekend(now)) {
    return { status: "weekend" };
  }

  // 4. Count weekdays elapsed, then subtract weekdays consumed by past pauses
  const elapsedRaw = countWeekdays(start, now);
  let pauseDays = 0;
  for (const pause of pauses) {
    const pStart = parseISODate(pause.pauseStart);
    const pEnd = pause.pauseEnd ? parseISODate(pause.pauseEnd) : now;
    // Clip pause window to [start, now] so weekdays before the program or
    // after today don't get counted
    const clipStart =
      pStart.getTime() < start.getTime() ? start : pStart;
    const clipEnd = pEnd.getTime() > now.getTime() ? now : pEnd;
    pauseDays += countWeekdays(clipStart, clipEnd);
  }
  const weekdaysElapsed = elapsedRaw - pauseDays;

  // 5. Past the final program day
  if (weekdaysElapsed > totalWeekdays) {
    return { status: "complete" };
  }

  // 6. Active — translate into (weekNumber, dayNumber)
  //
  //    weekdaysElapsed = 1  → week 1, day 1
  //    weekdaysElapsed = 5  → week 1, day 5
  //    weekdaysElapsed = 6  → week 2, day 1
  //    weekdaysElapsed = 60 → week 12, day 5
  const weekNumber = Math.ceil(weekdaysElapsed / 5);
  const dayNumber = ((weekdaysElapsed - 1) % 5) + 1;

  return { status: "active", weekNumber, dayNumber, weekdaysElapsed };
}
