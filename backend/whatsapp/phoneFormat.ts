// Single source of truth for phone-number normalisation across the WhatsApp /
// agent surface. Everything we read or compare comes through here so that
// "+91 9876543210", "whatsapp:+919876543210" and "919876543210" can't silently
// fail equality checks (which they did before — see profileLookup vs cmAuth).
//
// Canonical form: E.164 with a leading "+" and digits only ("+919876543210").

const E164 = /^\+\d{6,15}$/;

// Riplect is India-first: when a CM types a bare 10-digit number with no
// country code (very common for Indian users sharing a WhatsApp number),
// default to +91. Without this coercion the raw input would silently become
// "+9876543210" — a wrong country code — and the resulting auth.users row
// would never be findable by the real inbound "+91…" From.
const IN_LOCAL_DIGITS = /^[6-9]\d{9}$/;

/**
 * Normalise an inbound phone identifier to canonical E.164 ("+<digits>").
 *
 * Strips a Twilio "whatsapp:" prefix, any whitespace, hyphens, parentheses, and
 * a leading double-plus. Re-prepends "+" if the result is missing it. Returns
 * `null` when the result doesn't look like a valid E.164 number — callers MUST
 * handle null (don't fall back to the raw input, that's how the bugs happened).
 *
 * 10-digit Indian mobile shortcuts (starting with 6-9) are auto-prefixed with
 * "+91" — the dominant CM-typed format. Numbers already carrying a "+" or
 * "00…" prefix are not coerced, so non-Indian numbers stay intact.
 */
export function normalizePhoneE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim();
  if (s.startsWith("whatsapp:")) s = s.slice("whatsapp:".length);
  s = s.replace(/[\s\-()]/g, "");
  if (!s) return null;
  // Drop leading "00" (some intl formats) → re-add "+".
  if (s.startsWith("00")) s = "+" + s.slice(2);
  // Bare 10-digit Indian mobile (starts 6/7/8/9) — auto-prefix +91.
  if (!s.startsWith("+") && IN_LOCAL_DIGITS.test(s)) s = "+91" + s;
  if (!s.startsWith("+")) s = "+" + s;
  return E164.test(s) ? s : null;
}

/**
 * Variant that strips the leading "+" — used only for PG identity lookups that
 * already stored numbers without the plus. Prefer `normalizePhoneE164` for new
 * code.
 */
export function normalizePhoneDigits(raw: string | null | undefined): string | null {
  const e164 = normalizePhoneE164(raw);
  return e164 ? e164.slice(1) : null;
}
