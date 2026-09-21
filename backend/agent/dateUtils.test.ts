import { describe, it, expect } from "vitest";
import { parseEventDate, istStartOfToday } from "./dateUtils";

// All assertions are written against absolute UTC instants (toISOString) so the
// tests are server-TZ independent. CI can run with TZ=UTC or TZ=Asia/Kolkata
// and the results must not change.

describe("parseEventDate", () => {
  it("treats naive ISO as IST (the agent's documented contract)", () => {
    // 11:00 IST → 05:30 UTC
    expect(parseEventDate("2026-05-14T11:00:00").toISOString()).toBe(
      "2026-05-14T05:30:00.000Z",
    );
  });

  it("treats naive ISO with seconds and milliseconds as IST", () => {
    expect(parseEventDate("2026-05-14T11:00:00.123").toISOString()).toBe(
      "2026-05-14T05:30:00.123Z",
    );
  });

  it("respects an explicit Z suffix (UTC)", () => {
    expect(parseEventDate("2026-05-14T11:00:00Z").toISOString()).toBe(
      "2026-05-14T11:00:00.000Z",
    );
  });

  it("respects an explicit +HH:MM offset", () => {
    expect(parseEventDate("2026-05-14T11:00:00+02:00").toISOString()).toBe(
      "2026-05-14T09:00:00.000Z",
    );
  });

  it("respects an explicit +HHMM offset (no colon)", () => {
    expect(parseEventDate("2026-05-14T11:00:00+0530").toISOString()).toBe(
      "2026-05-14T05:30:00.000Z",
    );
  });

  it("respects a negative offset", () => {
    expect(parseEventDate("2026-05-14T11:00:00-05:00").toISOString()).toBe(
      "2026-05-14T16:00:00.000Z",
    );
  });

  it("rejects date-only strings as Invalid Date (caller must guard)", () => {
    // "2026-05-14+05:30" is not a valid ISO 8601 — JS returns Invalid Date.
    // This test documents the current behaviour so the caller knows it must
    // either pre-validate, or treat NaN as a tool error.
    const d = parseEventDate("2026-05-14");
    expect(Number.isNaN(d.getTime())).toBe(true);
  });

  it("rejects total garbage as Invalid Date", () => {
    const d = parseEventDate("not-a-date");
    expect(Number.isNaN(d.getTime())).toBe(true);
  });

  it("handles midnight (boundary)", () => {
    // 00:00 IST → 18:30 UTC the previous day
    expect(parseEventDate("2026-05-14T00:00:00").toISOString()).toBe(
      "2026-05-13T18:30:00.000Z",
    );
  });

  it("handles 23:59 (boundary)", () => {
    // 23:59 IST → 18:29 UTC same day
    expect(parseEventDate("2026-05-14T23:59:00").toISOString()).toBe(
      "2026-05-14T18:29:00.000Z",
    );
  });

  it("regression: the bug from May 2026 — naive 11:00 IST must NOT become 16:30 IST", () => {
    // The bug chain: naive ISO returned to formatDateTime, then `new Date(naive)`
    // is parsed as UTC by node, then re-rendered in IST → +05:30. parseEventDate
    // anchors the IST interpretation up front so the chain can't happen.
    const d = parseEventDate("2026-05-14T11:00:00");
    const istWallClock = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
    expect(istWallClock).toBe("11:00");
  });
});

describe("istStartOfToday", () => {
  it("returns IST midnight of the given instant, server-TZ independent", () => {
    // 2026-05-18 09:00 UTC = 14:30 IST → IST midnight is 2026-05-18T00:00+05:30
    const now = new Date("2026-05-18T09:00:00Z");
    expect(istStartOfToday(now).toISOString()).toBe(
      "2026-05-17T18:30:00.000Z",
    );
  });

  it("rolls to the next IST day late at night UTC (the off-by-one window)", () => {
    // 2026-05-18 20:00 UTC = 2026-05-19 01:30 IST → today (IST) is May 19.
    const now = new Date("2026-05-18T20:00:00Z");
    expect(istStartOfToday(now).toISOString()).toBe(
      "2026-05-18T18:30:00.000Z",
    );
  });

  it("stays on the same IST day early morning UTC", () => {
    // 2026-05-18 02:00 UTC = 2026-05-18 07:30 IST → today (IST) is May 18.
    const now = new Date("2026-05-18T02:00:00Z");
    expect(istStartOfToday(now).toISOString()).toBe(
      "2026-05-17T18:30:00.000Z",
    );
  });
});
