import { describe, it, expect } from "vitest";
import { normalizePhoneE164, normalizePhoneDigits } from "./phoneFormat";

describe("normalizePhoneE164", () => {
  it("passes a clean E.164 through unchanged", () => {
    expect(normalizePhoneE164("+919876543210")).toBe("+919876543210");
  });

  it("strips a Twilio 'whatsapp:' prefix", () => {
    expect(normalizePhoneE164("whatsapp:+919876543210")).toBe("+919876543210");
  });

  it("prepends '+' when missing", () => {
    expect(normalizePhoneE164("919876543210")).toBe("+919876543210");
  });

  it("auto-prefixes +91 for a bare 10-digit Indian mobile", () => {
    expect(normalizePhoneE164("9876543210")).toBe("+919876543210");
    expect(normalizePhoneE164("6123456789")).toBe("+916123456789");
    expect(normalizePhoneE164("987 654 3210")).toBe("+919876543210");
  });

  it("does NOT auto-prefix +91 when input already starts with +", () => {
    // Explicit "+" is treated as caller-asserted country code; we don't
    // second-guess it. Length passes E.164's permissive range — could be
    // a real foreign number (+98 = Iran, +9 short codes, etc.).
    expect(normalizePhoneE164("+9876543210")).toBe("+9876543210");
    // Sanity: +91 + 10-digit IN remains the canonical form.
    expect(normalizePhoneE164("+919876543210")).toBe("+919876543210");
  });

  it("does NOT auto-prefix +91 for 10-digit non-Indian-mobile patterns", () => {
    // Leading 5 isn't a valid IN mobile range — leave it as-is and let the
    // E.164 regex pass-through ("+5551234567"). Not great, but at least it
    // doesn't silently mis-tag a US/foreign 10-digit number as Indian.
    expect(normalizePhoneE164("5551234567")).toBe("+5551234567");
  });

  it("strips whitespace, hyphens, parentheses", () => {
    expect(normalizePhoneE164("+91 (987) 654-3210")).toBe("+919876543210");
  });

  it("converts a '00…' international prefix to '+'", () => {
    expect(normalizePhoneE164("0091 9876543210")).toBe("+919876543210");
  });

  it("returns null for too-short input", () => {
    expect(normalizePhoneE164("12345")).toBe(null);
  });

  it("returns null for empty / whitespace / nullish", () => {
    expect(normalizePhoneE164("")).toBe(null);
    expect(normalizePhoneE164("   ")).toBe(null);
    expect(normalizePhoneE164(null)).toBe(null);
    expect(normalizePhoneE164(undefined)).toBe(null);
  });

  it("returns null for non-digit garbage", () => {
    expect(normalizePhoneE164("not-a-number")).toBe(null);
  });
});

describe("normalizePhoneDigits", () => {
  it("strips the leading '+' from the E.164 form", () => {
    expect(normalizePhoneDigits("+919876543210")).toBe("919876543210");
    expect(normalizePhoneDigits("whatsapp:+919876543210")).toBe("919876543210");
  });

  it("returns null when the input can't normalise", () => {
    expect(normalizePhoneDigits("garbage")).toBe(null);
  });
});
