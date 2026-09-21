import { describe, it, expect } from "vitest";
import { createProfile } from "./createProfile";

const schema = (createProfile as unknown as { inputSchema: any }).inputSchema;
function parse(input: any) {
  return schema.safeParse(input);
}

const minimum = {
  phone: "+919876543210",
  displayName: "Karolina",
  title: "Yoga Teacher",
  email: "karolina@example.com",
};

describe("createProfile inputSchema", () => {
  it("accepts a minimal valid input", () => {
    expect(parse(minimum).success).toBe(true);
  });

  it("rejects empty displayName", () => {
    expect(parse({ ...minimum, displayName: "" }).success).toBe(false);
  });

  it("rejects empty title", () => {
    expect(parse({ ...minimum, title: "" }).success).toBe(false);
  });

  it("rejects malformed email", () => {
    expect(parse({ ...minimum, email: "not-an-email" }).success).toBe(false);
  });

  it("rejects malformed profileImageUrl when provided", () => {
    expect(parse({ ...minimum, profileImageUrl: "not a url" }).success).toBe(
      false,
    );
  });

  it("accepts profileImageUrl as proper URL", () => {
    expect(
      parse({
        ...minimum,
        profileImageUrl: "https://example.com/img.jpg",
      }).success,
    ).toBe(true);
  });

  // Phone format is normalised inside execute() rather than the schema (we
  // accept Twilio's "whatsapp:+…" form too), so the schema-level check is
  // intentionally lenient.
  it("accepts the Twilio 'whatsapp:+…' form on the schema (normalised later)", () => {
    expect(
      parse({ ...minimum, phone: "whatsapp:+919876543210" }).success,
    ).toBe(true);
  });
});
