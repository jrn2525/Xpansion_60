import { describe, expect, it } from "vitest";
import { computeSchedule, type PauseRange } from "./schedule";

// Helper to build the input record with sensible defaults
function input(
  overrides: Partial<{
    startDate: string;
    today: string;
    totalWeekdays: number;
    pauses: PauseRange[];
  }>,
) {
  return {
    startDate: "2026-01-05", // Mon
    today: "2026-01-05",
    totalWeekdays: 60,
    pauses: [],
    ...overrides,
  };
}

// Calendar reference for the dates used below (2026-01-XX):
//   05 Mon  06 Tue  07 Wed  08 Thu  09 Fri  10 Sat  11 Sun
//   12 Mon  13 Tue  14 Wed  15 Thu  16 Fri  17 Sat  18 Sun
//   ...
//   For 60 weekdays from Mon 2026-01-05 the program ends on Fri 2026-03-27.

describe("computeSchedule — before start", () => {
  it("returns before_start when today is one day before startDate", () => {
    const result = computeSchedule(
      input({ startDate: "2026-01-05", today: "2026-01-04" }),
    );
    expect(result).toEqual({ status: "before_start", startDate: "2026-01-05" });
  });

  it("returns before_start when today is far before startDate", () => {
    const result = computeSchedule(
      input({ startDate: "2026-06-01", today: "2026-01-05" }),
    );
    expect(result.status).toBe("before_start");
  });
});

describe("computeSchedule — weekday starts", () => {
  it("Monday start, today is the start: day 1, week 1", () => {
    const result = computeSchedule(
      input({ startDate: "2026-01-05", today: "2026-01-05" }),
    );
    expect(result).toEqual({
      status: "active",
      weekNumber: 1,
      dayNumber: 1,
      weekdaysElapsed: 1,
    });
  });

  it("Monday start, Tuesday: day 2, week 1", () => {
    const result = computeSchedule(
      input({ startDate: "2026-01-05", today: "2026-01-06" }),
    );
    expect(result).toMatchObject({
      status: "active",
      weekNumber: 1,
      dayNumber: 2,
      weekdaysElapsed: 2,
    });
  });

  it("Monday start, Friday of same week: day 5, week 1", () => {
    const result = computeSchedule(
      input({ startDate: "2026-01-05", today: "2026-01-09" }),
    );
    expect(result).toMatchObject({
      status: "active",
      weekNumber: 1,
      dayNumber: 5,
      weekdaysElapsed: 5,
    });
  });

  it("Monday start, next Monday: day 1, week 2", () => {
    const result = computeSchedule(
      input({ startDate: "2026-01-05", today: "2026-01-12" }),
    );
    expect(result).toMatchObject({
      status: "active",
      weekNumber: 2,
      dayNumber: 1,
      weekdaysElapsed: 6,
    });
  });

  it("Friday start, today is the Friday: day 1, week 1", () => {
    const result = computeSchedule(
      input({ startDate: "2026-01-09", today: "2026-01-09" }),
    );
    expect(result).toMatchObject({
      status: "active",
      weekNumber: 1,
      dayNumber: 1,
      weekdaysElapsed: 1,
    });
  });

  it("Friday start, Monday next week: day 2, week 1 (5-day windows, not calendar weeks)", () => {
    const result = computeSchedule(
      input({ startDate: "2026-01-09", today: "2026-01-12" }),
    );
    expect(result).toMatchObject({
      status: "active",
      weekNumber: 1,
      dayNumber: 2,
      weekdaysElapsed: 2,
    });
  });
});

describe("computeSchedule — weekend handling", () => {
  it("Monday start, Saturday of that week: weekend", () => {
    const result = computeSchedule(
      input({ startDate: "2026-01-05", today: "2026-01-10" }),
    );
    expect(result).toEqual({ status: "weekend" });
  });

  it("Monday start, Sunday of that week: weekend", () => {
    const result = computeSchedule(
      input({ startDate: "2026-01-05", today: "2026-01-11" }),
    );
    expect(result).toEqual({ status: "weekend" });
  });

  it("Saturday start, that same Saturday: weekend (program hasn't really begun)", () => {
    const result = computeSchedule(
      input({ startDate: "2026-01-10", today: "2026-01-10" }),
    );
    expect(result).toEqual({ status: "weekend" });
  });

  it("Saturday start, following Monday: day 1, week 1 (first weekday counts as day 1)", () => {
    const result = computeSchedule(
      input({ startDate: "2026-01-10", today: "2026-01-12" }),
    );
    expect(result).toMatchObject({
      status: "active",
      weekNumber: 1,
      dayNumber: 1,
      weekdaysElapsed: 1,
    });
  });
});

describe("computeSchedule — program boundaries", () => {
  // 60 weekdays from Mon 2026-01-05:
  //   week 12 day 5 = Fri 2026-03-27
  //   day after = Sat 2026-03-28 (weekend)
  //   first non-weekend after end = Mon 2026-03-30 (day 61, "complete")
  it("day 60 of a 60-day program: week 12, day 5", () => {
    const result = computeSchedule(
      input({ startDate: "2026-01-05", today: "2026-03-27" }),
    );
    expect(result).toMatchObject({
      status: "active",
      weekNumber: 12,
      dayNumber: 5,
      weekdaysElapsed: 60,
    });
  });

  it("Monday after day 60: complete", () => {
    const result = computeSchedule(
      input({ startDate: "2026-01-05", today: "2026-03-30" }),
    );
    expect(result).toEqual({ status: "complete" });
  });

  it("respects a non-default totalWeekdays (e.g., a future 40-day program)", () => {
    // 40 weekdays from Mon 2026-01-05 = Fri 2026-02-27
    const result = computeSchedule(
      input({
        startDate: "2026-01-05",
        today: "2026-03-02", // first Monday after day 40
        totalWeekdays: 40,
      }),
    );
    expect(result).toEqual({ status: "complete" });
  });
});

describe("computeSchedule — pauses", () => {
  it("during an open-ended pause: paused with pauseUntil = null", () => {
    const result = computeSchedule(
      input({
        startDate: "2026-01-05",
        today: "2026-01-08",
        pauses: [{ pauseStart: "2026-01-07", pauseEnd: null }],
      }),
    );
    expect(result).toEqual({ status: "paused", pauseUntil: null });
  });

  it("during a closed pause: paused with pauseUntil set", () => {
    const result = computeSchedule(
      input({
        startDate: "2026-01-05",
        today: "2026-01-09",
        pauses: [{ pauseStart: "2026-01-07", pauseEnd: "2026-01-13" }],
      }),
    );
    expect(result).toEqual({
      status: "paused",
      pauseUntil: "2026-01-13",
    });
  });

  it("after a one-week pause, schedule shifts forward by exactly 5 weekdays", () => {
    // Mon Jan 5 = day 1. Pause Wed Jan 7 → Tue Jan 13 (5 weekdays: Wed, Thu, Fri, Mon, Tue).
    // Resume Wed Jan 14 — should be day 3 of week 1 (not day 8).
    const result = computeSchedule(
      input({
        startDate: "2026-01-05",
        today: "2026-01-14",
        pauses: [{ pauseStart: "2026-01-07", pauseEnd: "2026-01-13" }],
      }),
    );
    expect(result).toMatchObject({
      status: "active",
      weekNumber: 1,
      dayNumber: 3,
      weekdaysElapsed: 3,
    });
  });

  it("pause that spans a weekend only subtracts weekdays", () => {
    // Pause Fri Jan 9 → Mon Jan 12 (Sat/Sun don't count) = 2 weekdays.
    // Mon Jan 5 = day 1. Tue Jan 13 would have been day 7, but with 2 weekdays
    // of pause subtracted it is day 5 of week 1.
    const result = computeSchedule(
      input({
        startDate: "2026-01-05",
        today: "2026-01-13",
        pauses: [{ pauseStart: "2026-01-09", pauseEnd: "2026-01-12" }],
      }),
    );
    expect(result).toMatchObject({
      status: "active",
      weekNumber: 1,
      dayNumber: 5,
      weekdaysElapsed: 5,
    });
  });

  it("pause spanning a section boundary still shifts the schedule cleanly", () => {
    // Pause Wed Jan 21 (day 13) through Tue Jan 27 (would've been day 17). That
    // is 5 weekdays paused. Without pause day 18 would land on Wed Jan 28; with
    // it, Jan 28 is day 13 again (the day they paused, +0 — i.e., day 13).
    // Wait — they paused starting day 13, so resuming on day 13 is correct.
    const result = computeSchedule(
      input({
        startDate: "2026-01-05",
        today: "2026-01-28",
        pauses: [{ pauseStart: "2026-01-21", pauseEnd: "2026-01-27" }],
      }),
    );
    expect(result).toMatchObject({ status: "active", weekdaysElapsed: 13 });
  });

  it("pause that started before program start has its pre-program days ignored", () => {
    // startDate = Mon Jan 5. Pause from Dec 28 (Mon) → Wed Jan 7. Only Jan 5-7
    // weekdays count, i.e. 3 weekdays. Today Jan 8 = elapsed Jan 5-8 = 4
    // weekdays minus 3 paused = 1 weekday elapsed → day 1.
    const result = computeSchedule(
      input({
        startDate: "2026-01-05",
        today: "2026-01-08",
        pauses: [{ pauseStart: "2025-12-29", pauseEnd: "2026-01-07" }],
      }),
    );
    expect(result).toMatchObject({
      status: "active",
      weekdaysElapsed: 1,
    });
  });

  it("multiple non-overlapping pauses both shift the schedule", () => {
    // startDate Mon Jan 5. Pause 1 = Wed Jan 7 → Wed Jan 7 (1 weekday).
    // Pause 2 = Mon Jan 12 → Mon Jan 12 (1 weekday). Today Tue Jan 13.
    // Raw elapsed Jan 5-13 = 7 weekdays; minus 2 paused = 5 → day 5, week 1.
    const result = computeSchedule(
      input({
        startDate: "2026-01-05",
        today: "2026-01-13",
        pauses: [
          { pauseStart: "2026-01-07", pauseEnd: "2026-01-07" },
          { pauseStart: "2026-01-12", pauseEnd: "2026-01-12" },
        ],
      }),
    );
    expect(result).toMatchObject({
      status: "active",
      weekdaysElapsed: 5,
    });
  });

  it("paused on a weekend day still returns paused (pause check beats weekend check)", () => {
    const result = computeSchedule(
      input({
        startDate: "2026-01-05",
        today: "2026-01-10", // Saturday
        pauses: [{ pauseStart: "2026-01-07", pauseEnd: "2026-01-13" }],
      }),
    );
    expect(result.status).toBe("paused");
  });
});

describe("computeSchedule — input ordering", () => {
  it("before_start beats every other condition (including a weekend)", () => {
    // Today is Saturday and before start. Should return before_start, not weekend.
    const result = computeSchedule(
      input({ startDate: "2026-01-12", today: "2026-01-10" }),
    );
    expect(result.status).toBe("before_start");
  });
});
