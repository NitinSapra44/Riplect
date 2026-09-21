import {normalizePhoneE164} from "./phoneFormat";

/**
 * Community Manager (CM) authorization.
 *
 * Authorized CM phone numbers are configured via the WHATSAPP_CM_NUMBERS env
 * variable as a comma-separated list of phone numbers in any format — we
 * normalise both sides to canonical E.164 ("+<digits>") before comparing so
 * "+91 987 654 3210" in the env matches "whatsapp:+919876543210" inbound.
 */

function parseCmNumbers(): string[] {
  const raw = process.env.WHATSAPP_CM_NUMBERS ?? "";
  const out: string[] = [];
  for (const piece of raw.split(",")) {
    const norm = normalizePhoneE164(piece);
    if (norm) out.push(norm);
    else if (piece.trim().length > 0) {
      console.warn(
        "[CmAuth] ignoring unparseable WHATSAPP_CM_NUMBERS entry:",
        piece.trim(),
      );
    }
  }
  return out;
}

/**
 * Returns true if the inbound `From` number belongs to an authorized CM.
 * Accepts any Twilio/E.164 variant; both sides are normalised through
 * `normalizePhoneE164` so formatting drift can't break the check.
 */
export function isCmNumber(from: string): boolean {
  const normalized = normalizePhoneE164(from);
  if (!normalized) return false;
  return parseCmNumbers().includes(normalized);
}
