import { describe, it, expect } from "vitest";
import { createEvent } from "./createEvent";

// The AI SDK exposes the Zod inputSchema on the tool. We test the SCHEMA
// directly (not execute) so we don't need to mock storage/profiles. This pins
// every validation rule we added — anyone weakening these to "fix" a tool
// failure will trip a test.

const schema = (createEvent as unknown as { inputSchema: any }).inputSchema;

function parse(input: any) {
  return schema.safeParse(input);
}

const minimum = {
  profileId: "p1",
  title: "Yoga",
  startAt: "2026-05-14T11:00:00",
  price: "500",
  location: "Chandra Shala",
};

describe("createEvent inputSchema", () => {
  it("accepts a minimal valid input", () => {
    expect(parse(minimum).success).toBe(true);
  });

  it("rejects date-only startAt (no time component)", () => {
    const r = parse({ ...minimum, startAt: "2026-05-14" });
    expect(r.success).toBe(false);
  });

  it("rejects garbage startAt", () => {
    const r = parse({ ...minimum, startAt: "next Wednesday" });
    expect(r.success).toBe(false);
  });

  it("accepts ISO with explicit Z offset", () => {
    expect(parse({ ...minimum, startAt: "2026-05-14T11:00:00Z" }).success).toBe(
      true,
    );
  });

  it("accepts ISO with +05:30 offset", () => {
    expect(
      parse({ ...minimum, startAt: "2026-05-14T11:00:00+05:30" }).success,
    ).toBe(true);
  });

  it("rejects endAt that is equal to startAt", () => {
    const r = parse({
      ...minimum,
      endAt: minimum.startAt,
    });
    expect(r.success).toBe(false);
  });

  it("rejects endAt earlier than startAt", () => {
    const r = parse({
      ...minimum,
      endAt: "2026-05-14T10:00:00",
    });
    expect(r.success).toBe(false);
  });

  it("accepts endAt later than startAt", () => {
    const r = parse({
      ...minimum,
      endAt: "2026-05-14T12:30:00",
    });
    expect(r.success).toBe(true);
  });

  it("rejects empty title", () => {
    expect(parse({ ...minimum, title: "" }).success).toBe(false);
  });

  it("rejects empty location", () => {
    expect(parse({ ...minimum, location: "" }).success).toBe(false);
  });

  it("rejects price with currency symbol", () => {
    expect(parse({ ...minimum, price: "₹500" }).success).toBe(false);
  });

  it("rejects price with comma", () => {
    expect(parse({ ...minimum, price: "1,000" }).success).toBe(false);
  });

  it("rejects negative price", () => {
    expect(parse({ ...minimum, price: "-100" }).success).toBe(false);
  });

  it("accepts price='0' (free)", () => {
    expect(parse({ ...minimum, price: "0" }).success).toBe(true);
  });

  it("accepts price with decimals", () => {
    expect(parse({ ...minimum, price: "500.50" }).success).toBe(true);
  });

  it("rejects price with too many decimals", () => {
    expect(parse({ ...minimum, price: "500.555" }).success).toBe(false);
  });

  it("rejects non-integer / non-positive maxAttendees", () => {
    expect(parse({ ...minimum, maxAttendees: 0 }).success).toBe(false);
    expect(parse({ ...minimum, maxAttendees: -1 }).success).toBe(false);
    expect(parse({ ...minimum, maxAttendees: 1.5 }).success).toBe(false);
  });

  it("defaults mode to 'offline' when omitted", () => {
    const r = parse(minimum);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.mode).toBe("offline");
    }
  });
});
