import { describe, it, expect } from "vitest";
import { updateEvent } from "./updateEvent";

const schema = (updateEvent as unknown as { inputSchema: any }).inputSchema;
const parse = (input: any) => schema.safeParse(input);

describe("updateEvent inputSchema", () => {
  it("accepts just a link (no-op edit is the caller's concern)", () => {
    expect(parse({ link: "riplect.com/a/event/3" }).success).toBe(true);
  });

  it("requires a non-empty link", () => {
    expect(parse({}).success).toBe(false);
    expect(parse({ link: "" }).success).toBe(false);
  });

  it("accepts a partial scalar change", () => {
    const r = parse({ link: "riplect.com/a/event/3", price: "800" });
    expect(r.success).toBe(true);
  });

  it("rejects a malformed price", () => {
    expect(
      parse({ link: "x/event/1", price: "₹800" }).success,
    ).toBe(false);
  });

  it("rejects startAt without a time component", () => {
    expect(
      parse({ link: "x/event/1", startAt: "2026-06-01" }).success,
    ).toBe(false);
  });

  it("accepts a recurringPattern change", () => {
    const r = parse({
      link: "x/event/1",
      recurringPattern: {
        type: "weekly",
        weekdays: [5],
        intervalWeeks: 1,
        startDate: "2026-06-05",
        endDate: null,
      },
    });
    expect(r.success).toBe(true);
  });

  it("rejects duplicate weekdays in a pattern change", () => {
    const r = parse({
      link: "x/event/1",
      recurringPattern: {
        type: "weekly",
        weekdays: [5, 5],
        intervalWeeks: 1,
        startDate: "2026-06-05",
        endDate: null,
      },
    });
    expect(r.success).toBe(false);
  });

  it("accepts combined scalar + pattern + new time in one call", () => {
    const r = parse({
      link: "https://riplect.com/asha/event/12",
      price: "1000",
      startAt: "2026-06-05T18:00:00",
      recurringPattern: {
        type: "monthly_date",
        dayOfMonth: 15,
        startDate: "2026-06-15",
        endDate: null,
      },
    });
    expect(r.success).toBe(true);
  });
});
