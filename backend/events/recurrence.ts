import type { EventSeries } from "@shared/schema";
import {
  addDays,
  addMonths,
  addWeeks,
  getDate,
  getDay,
  getMonth,
  getYear,
  isAfter,
  isBefore,
  lastDayOfMonth,
  parse,
  set,
  startOfDay,
  startOfMonth,
} from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { IST, istStartOfToday } from "../agent/dateUtils";

export type SeriesPattern = EventSeries["pattern"];

// All recurrence math runs in "IST wall-clock space": every Date below has
// host-local fields equal to the Asia/Kolkata wall clock (via toZonedTime /
// calendar-only parsing). date-fns calendar ops (getDay, addDays, …) then
// operate in IST regardless of the host TZ (prod is UTC). Each emitted
// occurrence is converted back to a true absolute instant with fromZonedTime.

/** Parse a bare 'yyyy-MM-dd' as an IST calendar date (00:00, zoned space). */
function zonedCalendarDate(ymd: string): Date {
  return startOfDay(parse(ymd, "yyyy-MM-dd", new Date(2000, 0, 1)));
}

function nthWeekdayInMonth(
  year: number,
  month: number,
  nth: number,
  weekday: number,
): Date | null {
  const first = new Date(year, month, 1);
  const firstWd = getDay(first);
  let offset = weekday - firstWd;
  if (offset < 0) offset += 7;
  const day = 1 + offset + (nth - 1) * 7;
  const daysInMonth = getDate(lastDayOfMonth(first));
  if (day > daysInMonth) return null;
  return new Date(year, month, day);
}

export function extractTimeStr(
  dt: Date | string | null | undefined,
): string | null {
  if (!dt) return null;
  const d = typeof dt === "string" ? new Date(dt) : dt;
  if (Number.isNaN(d.getTime())) return null;
  // The IST wall-clock time of the instant — NOT the host-local time.
  return formatInTimeZone(d, IST, "HH:mm");
}

export function generateInstanceDates(
  pattern: SeriesPattern,
  from: Date,
  until: Date,
  startTimeHHMM: string | null,
): Date[] {
  // Move the absolute bounds into IST wall-clock space.
  const fromDay = startOfDay(toZonedTime(from, IST));
  const untilZoned = toZonedTime(until, IST);

  const [th, tm] = startTimeHHMM
    ? (startTimeHHMM.split(":").map(Number) as [number, number])
    : [0, 0];

  const out: Date[] = [];
  const inWindow = (day: Date) =>
    !isBefore(day, fromDay) && !isAfter(startOfDay(day), startOfDay(untilZoned));
  // `day` is an IST-wall-clock calendar date; attach the time then convert the
  // zoned wall clock back to the correct absolute instant.
  const push = (day: Date) => {
    const withTime = startTimeHHMM
      ? set(day, { hours: th, minutes: tm, seconds: 0, milliseconds: 0 })
      : day;
    out.push(fromZonedTime(withTime, IST));
  };

  if (pattern.type === "weekly") {
    const weekdays = [...(pattern.weekdays || [])].sort((a, b) => a - b);
    const intervalWeeks = pattern.intervalWeeks || 1;
    const ref = zonedCalendarDate(pattern.startDate);
    const dow = getDay(ref); // 0=Sun..6=Sat, in IST
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    let weekStart = addDays(ref, mondayOffset); // Monday of ref's week, 00:00
    // Skip whole intervals whose entire week ends before `from`.
    while (isBefore(addDays(weekStart, 6), fromDay)) {
      weekStart = addWeeks(weekStart, intervalWeeks);
    }
    while (!isAfter(startOfDay(weekStart), startOfDay(untilZoned))) {
      for (const wd of weekdays) {
        const off = wd === 0 ? 6 : wd - 1; // days after Monday
        const day = startOfDay(addDays(weekStart, off));
        if (inWindow(day)) push(day);
      }
      weekStart = addWeeks(weekStart, intervalWeeks);
    }
  } else if (pattern.type === "monthly_nth") {
    const { nth, weekday } = pattern;
    let cursor = startOfMonth(zonedCalendarDate(pattern.startDate));
    for (let i = 0; i < 120; i++) {
      const d = nthWeekdayInMonth(
        getYear(cursor),
        getMonth(cursor),
        nth,
        weekday,
      );
      if (d) {
        const day = startOfDay(d);
        if (isAfter(day, untilZoned)) break;
        if (!isBefore(day, fromDay)) push(day);
      }
      cursor = addMonths(cursor, 1);
    }
  } else if (pattern.type === "monthly_date") {
    const { dayOfMonth } = pattern;
    let cursor = startOfMonth(zonedCalendarDate(pattern.startDate));
    for (let i = 0; i < 120; i++) {
      const daysInMonth = getDate(lastDayOfMonth(cursor));
      const day = startOfDay(
        new Date(
          getYear(cursor),
          getMonth(cursor),
          Math.min(dayOfMonth, daysInMonth),
        ),
      );
      if (isAfter(day, untilZoned)) break;
      if (!isBefore(day, fromDay)) push(day);
      cursor = addMonths(cursor, 1);
    }
  } else if (pattern.type === "custom") {
    const days = (pattern.dates || [])
      .map(zonedCalendarDate)
      .filter((day) => inWindow(day))
      .sort((a, b) => a.getTime() - b.getTime());
    for (const day of days) push(day);
  }
  return out;
}

/**
 * The [genFrom, genUntil] window to feed generateInstanceDates for a given
 * pattern. Single-sourced so createRecurringEvent (initial create) and
 * updateEvent (pattern/time edit + regenerate) can't drift apart:
 *
 *  - genFrom is always IST-midnight today — NOT the pattern's startDate. The
 *    floor must be today so a wrong first-weekday pick can't clip the earliest
 *    valid occurrence (the "skipped Wed, started Fri" bug). pattern.startDate
 *    still anchors which week/day the series belongs to inside the engine.
 *  - custom → unbounded (the explicit date list is its own bound).
 *  - bounded patterns → min(end-of-pattern's-last-day in IST, 6 months out).
 *  - indefinite → 6 months out (the cron lazily extends later).
 */
export function computeGenerationWindow(
  pattern: SeriesPattern,
  now: Date = new Date(),
): { genFrom: Date; genUntil: Date } {
  const genFrom = istStartOfToday(now);
  const sixMonthsOut = addMonths(now, 6);
  let genUntil: Date;
  if (pattern.type === "custom") {
    genUntil = new Date(8640000000000000);
  } else if ("endDate" in pattern && pattern.endDate) {
    const patternEnd = fromZonedTime(`${pattern.endDate}T23:59:59.999`, IST);
    genUntil = patternEnd < sixMonthsOut ? patternEnd : sixMonthsOut;
  } else {
    genUntil = sixMonthsOut;
  }
  return { genFrom, genUntil };
}

export function cadenceLabelFromPattern(pattern: SeriesPattern | null): string {
  if (!pattern) return "Recurring";
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const DAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  if (pattern.type === "weekly") {
    const dayNames = [...pattern.weekdays].sort((a, b) => a - b).map((d) => DAYS[d]).join(" & ");
    if (pattern.intervalWeeks === 2) return `Every other ${dayNames}`;
    if (pattern.intervalWeeks > 2) return `Every ${pattern.intervalWeeks} weeks on ${dayNames}`;
    return `Every ${dayNames}`;
  }
  if (pattern.type === "monthly_nth") {
    const ORDINALS = ["", "1st", "2nd", "3rd", "4th", "5th"];
    return `${ORDINALS[pattern.nth] ?? "Nth"} ${DAYS_LONG[pattern.weekday]} of each month`;
  }
  if (pattern.type === "monthly_date") {
    const d = pattern.dayOfMonth;
    const suffix = d === 1 ? "st" : d === 2 ? "nd" : d === 3 ? "rd" : "th";
    return `${d}${suffix} of each month`;
  }
  if (pattern.type === "custom") return "Custom dates";
  return "Recurring";
}
