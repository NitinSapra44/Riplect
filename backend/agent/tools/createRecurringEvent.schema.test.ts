import { describe, it, expect } from "vitest";
import { createRecurringEvent } from "./createRecurringEvent";

const schema = (createRecurringEvent as unknown as { inputSchema: any })
  .inputSchema;

function parse(input: any) {
  return schema.safeParse(input);
}

const minimum = {
  profileId: "p1",
  title: "Vinyasa",
  startAt: "2026-05-15T11:00:00",
  price: "500",
  location: "Chandra Shala",
  recurringPattern: {
    type: "weekly",
    weekdays: [3, 5],
    intervalWeeks: 1,
    startDate: "2026-05-15",
    endDate: null,
  },
};

describe("createRecurringEvent inputSchema", () => {
  it("accepts a minimal valid weekly input", () => {
    expect(parse(minimum).success).toBe(true);
  });

  it("rejects empty weekdays array", () => {
    const r = parse({
      ...minimum,
      recurringPattern: { ...minimum.recurringPattern, weekdays: [] },
    });
    expect(r.success).toBe(false);
  });

  it("rejects duplicate weekdays", () => {
    const r = parse({
      ...minimum,
      recurringPattern: { ...minimum.recurringPattern, weekdays: [3, 3, 5] },
    });
    expect(r.success).toBe(false);
  });

  it("rejects weekday out of range", () => {
    const r = parse({
      ...minimum,
      recurringPattern: { ...minimum.recurringPattern, weekdays: [7] },
    });
    expect(r.success).toBe(false);
  });

  it("rejects empty custom dates array", () => {
    const r = parse({
      ...minimum,
      recurringPattern: { type: "custom", dates: [] },
    });
    expect(r.success).toBe(false);
  });

  it("rejects badly-formatted custom dates", () => {
    const r = parse({
      ...minimum,
      recurringPattern: { type: "custom", dates: ["May 14, 2026"] },
    });
    expect(r.success).toBe(false);
  });

  it("rejects pattern.startDate that isn't YYYY-MM-DD", () => {
    const r = parse({
      ...minimum,
      recurringPattern: {
        ...minimum.recurringPattern,
        startDate: "2026-05-15T00:00:00",
      },
    });
    expect(r.success).toBe(false);
  });

  it("rejects startAt without time component", () => {
    expect(parse({ ...minimum, startAt: "2026-05-15" }).success).toBe(false);
  });

  it("rejects endAt <= startAt", () => {
    expect(
      parse({ ...minimum, endAt: "2026-05-15T11:00:00" }).success,
    ).toBe(false);
    expect(
      parse({ ...minimum, endAt: "2026-05-15T10:00:00" }).success,
    ).toBe(false);
  });

  it("rejects intervalWeeks < 1", () => {
    const r = parse({
      ...minimum,
      recurringPattern: { ...minimum.recurringPattern, intervalWeeks: 0 },
    });
    expect(r.success).toBe(false);
  });

  it("accepts monthly_nth pattern", () => {
    const r = parse({
      ...minimum,
      startAt: "2026-06-07T10:00:00",
      recurringPattern: {
        type: "monthly_nth",
        nth: 1,
        weekday: 0,
        startDate: "2026-06-07",
        endDate: null,
      },
    });
    expect(r.success).toBe(true);
  });

  it("rejects monthly_nth.nth out of [1..5]", () => {
    const r = parse({
      ...minimum,
      recurringPattern: {
        type: "monthly_nth",
        nth: 6,
        weekday: 0,
        startDate: "2026-06-07",
        endDate: null,
      },
    });
    expect(r.success).toBe(false);
  });
});
