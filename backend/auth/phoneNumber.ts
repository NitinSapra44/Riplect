/**
 * E.164 phone-number normalization.
 *
 * Every phone the new identity flow stores or compares MUST be passed
 * through this normalizer first so that the WhatsApp bot, the OTP flow,
 * and the profiles lookup all agree on the same string representation.
 */
export function normalizeToE164(input: string | null | undefined): string | null {
  if (!input) return null;
  const cleaned = String(input)
    .replace(/^whatsapp:/i, "")
    .replace(/[\s()\-.]/g, "")
    .trim();
  if (!cleaned.startsWith("+")) return null;
  const digits = cleaned.slice(1);
  if (!/^\d{8,15}$/.test(digits)) return null;
  return "+" + digits;
}

/** Mask a phone for safe display in conflict responses. */
export function maskPhone(e164: string): string {
  if (!e164 || e164.length < 5) return "***";
  const tail = e164.slice(-2);
  return `+•••${tail}`;
}
