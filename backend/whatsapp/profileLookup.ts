import {supabase} from "../supabaseAuth";
import {normalizePhoneDigits} from "./phoneFormat";

/**
 * Find a profileId by matching the verified phone via the get_profile_by_phone
 * RPC. Returns null if no profile exists for this phone, or the input doesn't
 * normalise to a valid E.164 number.
 *
 * The RPC was written against the digits-only form (no leading "+"), so we
 * normalise and strip here. All other comparisons in the codebase should go
 * through `normalizePhoneE164`.
 */
export async function findProfileByWhatsApp(
  phoneNumber: string,
): Promise<string | null> {
  if (!supabase) return null;

  const digits = normalizePhoneDigits(phoneNumber);
  if (!digits) {
    console.warn("[ProfileLookup] could not normalise phone:", phoneNumber);
    return null;
  }

  const {data, error} = await supabase.rpc("get_profile_by_phone", {
    phone_number: digits,
  });

  if (error) {
    console.error("[ProfileLookup] RPC error:", error.message);
    return null;
  }

  return (data as string | null) ?? null;
}
