import { describe, it, expect } from "vitest";
import { createSession } from "./createSession";

const schema = (createSession as unknown as { inputSchema: any }).inputSchema;
function parse(input: any) {
  return schema.safeParse(input);
}

const minimum = {
  profileId: "p1",
  title: "Discovery call",
  duration: 30,
  price: "0",
};

describe("createSession inputSchema", () => {
  it("accepts a minimal valid input", () => {
    const r = parse(minimum);
    expect(r.success).toBe(true);
  });

  it("defaults mode to 'offline' when omitted", () => {
    const r = parse(minimum);
    if (r.success) expect(r.data.mode).toBe("offline");
  });

  it("rejects mode that isn't online or offline", () => {
    expect(parse({ ...minimum, mode: "hybrid" }).success).toBe(false);
  });

  it("rejects duration <= 0", () => {
    expect(parse({ ...minimum, duration: 0 }).success).toBe(false);
    expect(parse({ ...minimum, duration: -10 }).success).toBe(false);
  });

  it("rejects non-integer duration", () => {
    expect(parse({ ...minimum, duration: 30.5 }).success).toBe(false);
  });

  it("rejects duration over 24h", () => {
    expect(parse({ ...minimum, duration: 24 * 60 + 1 }).success).toBe(false);
  });

  it("rejects price with currency symbol", () => {
    expect(parse({ ...minimum, price: "₹500" }).success).toBe(false);
  });

  it("rejects price with comma", () => {
    expect(parse({ ...minimum, price: "1,000" }).success).toBe(false);
  });

  it("accepts price='0' (free)", () => {
    expect(parse({ ...minimum, price: "0" }).success).toBe(true);
  });

  it("rejects empty title", () => {
    expect(parse({ ...minimum, title: "" }).success).toBe(false);
  });
});
