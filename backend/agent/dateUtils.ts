// Events are always in IST. The agent emits naive ISO strings like
// "2026-04-20T10:00:00" meaning "10am IST". We anchor every such string to
// Asia/Kolkata explicitly (via date-fns-tz) so the resulting absolute instant
// is correct no matter what timezone the host process runs in (prod is UTC).
// Strings that already carry an offset/Z pass through unchanged.

import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export const IST = "Asia/Kolkata";

const HAS_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/;
// Naive datetime: date + time, optional seconds/millis, NO offset. Date-only
// strings ("2026-05-14") are intentionally excluded so they parse as Invalid
// Date — callers must pre-validate (the tool zod schemas do).
const NAIVE_DATETIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/;

export function parseEventDate(iso: string): Date {
  if (HAS_OFFSET.test(iso)) return new Date(iso);
  if (NAIVE_DATETIME.test(iso)) return fromZonedTime(iso, IST);
  return new Date(NaN);
}

/**
 * The IST-midnight instant of "today" (relative to `now`), as a Date, no
 * matter what timezone the host process runs in.
 *
 * Used as the lower bound for recurring-event generation. We deliberately do
 * NOT derive that bound from the LLM-supplied startAt: the model is unreliable
 * at picking *which* upcoming weekday a multi-day series ("Wed & Fri") should
 * start on, and using its startAt as the floor silently dropped the earlier
 * weekday (skipped Wed, started Fri). Anchoring to today instead makes the
 * first occurrence deterministic; pattern.startDate still controls the week
 * (and an intentionally later series start).
 */
export function istStartOfToday(now: Date = new Date()): Date {
  const ymd = formatInTimeZone(now, IST, "yyyy-MM-dd");
  return fromZonedTime(`${ymd}T00:00:00`, IST);
}
