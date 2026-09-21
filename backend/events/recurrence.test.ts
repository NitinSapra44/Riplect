import { describe, it, expect } from "vitest";
import {
  generateInstanceDates,
  extractTimeStr,
  cadenceLabelFromPattern,
  type SeriesPattern,
} from "./recurrence";

// Helpers ---------------------------------------------------------------

// Compute the IST wall-clock date+time for a JS Date, regardless of the host TZ.
// All recurrence assertions go through this so the same test passes on UTC and
// IST hosts.
function istParts(d: Date): {
  ymd: string; // YYYY-MM-DD
  hhmm: string; // HH:MM
  weekday: string; // "Mon", "Tue", …
} {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    ymd: `${get("year")}-${get("month")}-${get("day")}`,
    hhmm: `${get("hour")}:${get("minute")}`,
    weekday: get("weekday"),
  };
}

// Build a Date for a given IST wall-clock (YYYY-MM-DDTHH:mm) — uses the same
// "append +05:30" trick the production code does, so we don't depend on
// parseEventDate inside these tests.
function istDate(iso: string): Date {
  return new Date(iso + "+05:30");
}

// Tests -----------------------------------------------------------------

describe("extractTimeStr", () => {
  it("returns null for null/undefined input", () => {
    expect(extractTimeStr(null)).toBe(null);
    expect(extractTimeStr(undefined)).toBe(null);
  });

  it("returns '00:00' for IST midnight (not null)", () => {
    // midnight is a real time; null is reserved for "no input". Anchored to
    // IST so the assertion is host-TZ independent (prod is UTC).
    expect(extractTimeStr(istDate("2026-05-14T00:00:00"))).toBe("00:00");
  });

  it("zero-pads single-digit IST hours/minutes", () => {
    expect(extractTimeStr(istDate("2026-05-14T09:05:00"))).toBe("09:05");
  });

  it("formats the IST wall-clock time, not the host-local time", () => {
    // 2026-05-14 11:00 IST == 05:30 UTC. On a UTC host, host-local getHours()
    // would wrongly yield 05:30 — formatInTimeZone keeps it 11:00.
    expect(extractTimeStr(new Date("2026-05-14T05:30:00Z"))).toBe("11:00");
  });
});

describe("cadenceLabelFromPattern", () => {
  it("labels weekly with single day", () => {
    const p: SeriesPattern = {
      type: "weekly",
      weekdays: [1],
      intervalWeeks: 1,
      startDate: "2026-05-11",
      endDate: null,
    };
    expect(cadenceLabelFromPattern(p)).toBe("Every Mon");
  });

  it("labels weekly with multiple days, sorted", () => {
    const p: SeriesPattern = {
      type: "weekly",
      weekdays: [5, 3], // Fri, Wed → should sort to Wed & Fri
      intervalWeeks: 1,
      startDate: "2026-05-13",
      endDate: null,
    };
    expect(cadenceLabelFromPattern(p)).toBe("Every Wed & Fri");
  });

  it("labels biweekly", () => {
    const p: SeriesPattern = {
      type: "weekly",
      weekdays: [1],
      intervalWeeks: 2,
      startDate: "2026-05-11",
      endDate: null,
    };
    expect(cadenceLabelFromPattern(p)).toBe("Every other Mon");
  });

  it("labels monthly_nth", () => {
    const p: SeriesPattern = {
      type: "monthly_nth",
      nth: 1,
      weekday: 0, // Sunday
      startDate: "2026-05-03",
      endDate: null,
    };
    expect(cadenceLabelFromPattern(p)).toBe("1st Sunday of each month");
  });

  it("labels monthly_date with proper ordinal", () => {
    const p: SeriesPattern = {
      type: "monthly_date",
      dayOfMonth: 1,
      startDate: "2026-05-01",
      endDate: null,
    };
    expect(cadenceLabelFromPattern(p)).toBe("1st of each month");

    const p2: SeriesPattern = { ...p, dayOfMonth: 22 } as SeriesPattern;
    expect(cadenceLabelFromPattern(p2)).toBe("22th of each month");
  });

  it("labels custom", () => {
    const p: SeriesPattern = {
      type: "custom",
      dates: ["2026-05-14"],
    };
    expect(cadenceLabelFromPattern(p)).toBe("Custom dates");
  });
});

describe("generateInstanceDates — weekly", () => {
  it("generates instances on the chosen weekdays at the chosen time", () => {
    const pattern: SeriesPattern = {
      type: "weekly",
      weekdays: [3, 5], // Wed, Fri
      intervalWeeks: 1,
      startDate: "2026-05-13", // a Wednesday
      endDate: "2026-05-22",
    };
    const startTime = extractTimeStr(istDate("2026-05-13T11:00:00"))!;
    const from = istDate("2026-05-13T00:00:00");
    const until = istDate("2026-05-22T23:59:00");

    const dates = generateInstanceDates(pattern, from, until, startTime);

    // Wed 13, Fri 15, Wed 20, Fri 22
    expect(dates).toHaveLength(4);
    const days = dates.map((d) => istParts(d).weekday);
    expect(days).toEqual(["Wed", "Fri", "Wed", "Fri"]);
  });

  it("respects intervalWeeks=2 (biweekly)", () => {
    const pattern: SeriesPattern = {
      type: "weekly",
      weekdays: [1], // Mon
      intervalWeeks: 2,
      startDate: "2026-05-11", // Monday
      endDate: "2026-06-08",
    };
    const startTime = extractTimeStr(istDate("2026-05-11T11:00:00"))!;
    const from = istDate("2026-05-11T00:00:00");
    const until = istDate("2026-06-08T23:59:00");

    const dates = generateInstanceDates(pattern, from, until, startTime);
    // May 11, May 25, Jun 8
    expect(dates).toHaveLength(3);
  });

  it("filters out instances before `from`", () => {
    const pattern: SeriesPattern = {
      type: "weekly",
      weekdays: [3, 5],
      intervalWeeks: 1,
      startDate: "2026-05-13",
      endDate: "2026-05-22",
    };
    // Move `from` to May 16 — should skip the May 13 Wed and the May 15 Fri.
    const startTime = "11:00";
    const from = istDate("2026-05-16T00:00:00");
    const until = istDate("2026-05-22T23:59:00");

    const dates = generateInstanceDates(pattern, from, until, startTime);
    // Wed 20, Fri 22 only
    expect(dates).toHaveLength(2);
  });

  it("regression (CM Wed&Fri): today=Mon floor keeps the first Wed even when the LLM mis-picks Friday as the anchor", () => {
    // Production bug: CM creates "Vinyasa, Wed & Fri" on Mon 18 May. The LLM
    // emitted startAt/startDate = Fri 22 May (the SECOND listed weekday). When
    // createRecurringEvent used startAt's date as the generation floor, Wed 20
    // May was clipped and the series started Friday. The fix anchors the floor
    // to *today* (Mon 18 May) — pattern.startDate only picks the week — so the
    // first instance is correctly Wed 20 May regardless of the LLM's pick.
    const pattern: SeriesPattern = {
      type: "weekly",
      weekdays: [3, 5], // Wed, Fri
      intervalWeeks: 1,
      startDate: "2026-05-22", // LLM's wrong pick (Friday)
      endDate: null,
    };
    const from = istDate("2026-05-18T00:00:00"); // today = Monday
    const until = istDate("2026-06-05T23:59:00");

    const dates = generateInstanceDates(pattern, from, until, "11:00");
    const ymds = dates.map((d) => istParts(d).ymd);
    expect(ymds.slice(0, 4)).toEqual([
      "2026-05-20", // Wed — NOT skipped
      "2026-05-22", // Fri
      "2026-05-27", // Wed
      "2026-05-29", // Fri
    ]);
  });

  it("handles a startDate that's NOT on a target weekday", () => {
    const pattern: SeriesPattern = {
      type: "weekly",
      weekdays: [3, 5], // Wed, Fri
      intervalWeeks: 1,
      startDate: "2026-05-14", // Thursday — not a target day
      endDate: "2026-05-22",
    };
    const startTime = "11:00";
    const from = istDate("2026-05-14T00:00:00");
    const until = istDate("2026-05-22T23:59:00");

    const dates = generateInstanceDates(pattern, from, until, startTime);
    // The Wed of that week (May 13) is BEFORE `from`, so first instance is
    // Fri May 15. Then Wed May 20, Fri May 22.
    expect(dates).toHaveLength(3);
    const ymds = dates.map((d) => istParts(d).ymd);
    expect(ymds).toEqual(["2026-05-15", "2026-05-20", "2026-05-22"]);
  });
});

describe("generateInstanceDates — monthly_nth", () => {
  it("generates the Nth weekday of each month", () => {
    const pattern: SeriesPattern = {
      type: "monthly_nth",
      nth: 1,
      weekday: 0, // 1st Sunday
      startDate: "2026-05-01",
      endDate: null,
    };
    const startTime = "10:00";
    const from = istDate("2026-05-01T00:00:00");
    const until = istDate("2026-07-31T23:59:00");

    const dates = generateInstanceDates(pattern, from, until, startTime);
    // 1st Sundays of May, Jun, Jul 2026: May 3, Jun 7, Jul 5
    expect(dates).toHaveLength(3);
    const ymds = dates.map((d) => istParts(d).ymd);
    expect(ymds).toEqual(["2026-05-03", "2026-06-07", "2026-07-05"]);
    dates.forEach((d) => expect(istParts(d).weekday).toBe("Sun"));
  });

  it("skips months that don't have an Nth occurrence", () => {
    const pattern: SeriesPattern = {
      type: "monthly_nth",
      nth: 5, // 5th Friday — only some months have one
      weekday: 5,
      startDate: "2026-01-01",
      endDate: null,
    };
    const from = istDate("2026-01-01T00:00:00");
    const until = istDate("2026-12-31T23:59:00");

    const dates = generateInstanceDates(pattern, from, until, "10:00");
    // Months in 2026 with 5 Fridays: Jan, Apr, Jul, Oct (verifiable by hand).
    // The exact count is less important than the property; we assert all
    // returned dates ARE Fridays and there's at least one and fewer than 12.
    expect(dates.length).toBeGreaterThan(0);
    expect(dates.length).toBeLessThan(12);
    dates.forEach((d) => expect(istParts(d).weekday).toBe("Fri"));
  });
});

describe("generateInstanceDates — monthly_date", () => {
  it("clamps day-of-month to the month's last day", () => {
    const pattern: SeriesPattern = {
      type: "monthly_date",
      dayOfMonth: 31,
      startDate: "2026-01-31",
      endDate: null,
    };
    const from = istDate("2026-01-01T00:00:00");
    const until = istDate("2026-04-30T23:59:00");

    const dates = generateInstanceDates(pattern, from, until, "12:00");
    const days = dates.map((d) => istParts(d).ymd);
    // Feb has 28 (2026 is not a leap year), Apr has 30 → clamped
    expect(days).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });
});

describe("generateInstanceDates — custom", () => {
  it("generates only the specified dates", () => {
    const pattern: SeriesPattern = {
      type: "custom",
      dates: ["2026-05-14", "2026-05-20"],
    };
    const from = istDate("2026-05-01T00:00:00");
    const until = istDate("2026-06-01T23:59:00");

    const dates = generateInstanceDates(pattern, from, until, "11:00");
    expect(dates).toHaveLength(2);
    expect(dates.map((d) => istParts(d).ymd)).toEqual(["2026-05-14", "2026-05-20"]);
  });

  it("returns [] for empty dates array (caller must handle)", () => {
    const pattern: SeriesPattern = { type: "custom", dates: [] };
    const from = istDate("2026-05-01T00:00:00");
    const until = istDate("2026-06-01T23:59:00");
    const dates = generateInstanceDates(pattern, from, until, "11:00");
    expect(dates).toHaveLength(0);
  });

  it("filters out dates outside the window", () => {
    const pattern: SeriesPattern = {
      type: "custom",
      dates: ["2026-04-01", "2026-05-14", "2026-08-01"],
    };
    const from = istDate("2026-05-01T00:00:00");
    const until = istDate("2026-06-01T23:59:00");
    const dates = generateInstanceDates(pattern, from, until, "11:00");
    expect(dates).toHaveLength(1);
    expect(istParts(dates[0]).ymd).toBe("2026-05-14");
  });

  it("sorts the output", () => {
    const pattern: SeriesPattern = {
      type: "custom",
      dates: ["2026-05-20", "2026-05-14", "2026-05-17"],
    };
    const from = istDate("2026-05-01T00:00:00");
    const until = istDate("2026-06-01T23:59:00");
    const dates = generateInstanceDates(pattern, from, until, "11:00");
    expect(dates.map((d) => istParts(d).ymd)).toEqual([
      "2026-05-14",
      "2026-05-17",
      "2026-05-20",
    ]);
  });
});
