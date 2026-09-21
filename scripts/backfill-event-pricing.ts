/**
 * One-shot backfill that normalizes legacy event pricing fields.
 *
 * Background:
 *   Many older event rows in production have inconsistent pricing fields:
 *   `pricing_type` may be NULL/empty, may have stray case/whitespace
 *   ('PAID', ' paid '), or `requires_payment` may not match what the
 *   live booking flow actually does. The registration handler in
 *   `server/routes.ts` is the source of truth — it derives:
 *
 *     pricingTypeRaw = lower(trim(pricing_type ?? ''))
 *     isExplicitlyFreeOrDonation = pricingTypeRaw IN ('free','donation')
 *     priceNum = parseFloat(price ?? '0')
 *     eventIsPaid = !isExplicitlyFreeOrDonation && priceNum > 0
 *
 *   Task #118 patched the symptom (emails now use the same rule), but
 *   the underlying data still lies, so any new code that reads
 *   `event.pricingType` / `event.requiresPayment` directly will trip
 *   over the same trap. This script rewrites those two fields on every
 *   event so they agree with the canonical derivation above.
 *
 * What it does (idempotent — safe to re-run):
 *   1. Normalizes any non-NULL `pricing_type` to its trimmed lowercase
 *      form (so 'PAID', ' paid ' become 'paid').
 *   2. For rows whose `pricing_type` is NULL/empty or is some unknown
 *      legacy value (anything not in {'paid','free','donation'}),
 *      derives a value from `price` + `donation_note`:
 *        - price > 0                          -> 'paid'
 *        - price <= 0 AND donation_note set   -> 'donation'
 *        - price <= 0 AND no donation_note    -> 'free'
 *   3. For rows where `pricing_type='paid'` but `price <= 0` (which the
 *      canonical rule would treat as NOT paid), demotes pricing_type to
 *      'donation' (if a donation_note exists) or 'free'. After this
 *      step, `pricing_type='paid'` always implies `price > 0`.
 *   4. Syncs `requires_payment` to exactly match the canonical rule:
 *      TRUE iff (lower(trim(pricing_type)) NOT IN ('free','donation'))
 *           AND price > 0
 *      After step 3, this is equivalent to `pricing_type = 'paid'`.
 *
 * Usage:
 *   tsx scripts/backfill-event-pricing.ts [--dry-run]
 *
 * Recommended rollout:
 *   - Run with `--dry-run` against staging, eyeball the preview counts.
 *   - Run for real against staging, verify post-run consistency block
 *     reports zeros across the board.
 *   - Repeat against production.
 */

import { sql, type SQL } from "drizzle-orm";
import { db } from "../backend/db";

const DRY_RUN = process.argv.includes("--dry-run");

/**
 * `db.execute` from drizzle/postgres-js returns the result of `postgres`
 * which is an array-like with both numeric indexes and a `count` field. We
 * normalize that here so the rest of the script can treat results uniformly
 * without scattering shape checks.
 */
interface ExecResult<TRow> extends Array<TRow> {
  count: number;
}

async function execRows<TRow extends Record<string, unknown>>(
  query: SQL,
): Promise<ExecResult<TRow>> {
  return (await db.execute<TRow>(query)) as unknown as ExecResult<TRow>;
}

interface PreviewRow {
  total_events: number | string;
  needs_case_normalize: number | string;
  will_set_paid_from_unknown: number | string;
  will_set_donation_from_unknown: number | string;
  will_set_free_from_unknown: number | string;
  will_demote_paid_zero_price: number | string;
  requires_payment_drift: number | string;
}

interface VerifyRow {
  pricing_type_not_normalized: number | string;
  pricing_type_unknown_value: number | string;
  paid_with_zero_price: number | string;
  requires_payment_drift: number | string;
}

const toNum = (v: number | string | undefined | null): number =>
  typeof v === "number" ? v : Number(v ?? 0);

async function backfillEventPricing(): Promise<void> {
  console.log(
    `[backfill-event-pricing] Starting${DRY_RUN ? " (DRY RUN — no writes)" : ""}...`,
  );

  // 1) Snapshot of what we are about to touch, for logging. The
  //    `requires_payment_drift` count is computed against the SAME
  //    expression the registration handler uses at runtime, so it
  //    counts every row whose stored requires_payment disagrees with
  //    what the booking flow would derive on the fly today.
  const previewRows = await execRows<PreviewRow>(sql`
    SELECT
      COUNT(*) AS total_events,
      COUNT(*) FILTER (
        WHERE pricing_type IS NOT NULL
          AND pricing_type <> LOWER(TRIM(pricing_type))
      ) AS needs_case_normalize,
      COUNT(*) FILTER (
        WHERE (
          pricing_type IS NULL
          OR LOWER(TRIM(pricing_type)) NOT IN ('paid','free','donation')
        )
        AND price::numeric > 0
      ) AS will_set_paid_from_unknown,
      COUNT(*) FILTER (
        WHERE (
          pricing_type IS NULL
          OR LOWER(TRIM(pricing_type)) NOT IN ('paid','free','donation')
        )
        AND price::numeric <= 0
        AND donation_note IS NOT NULL
        AND donation_note <> ''
      ) AS will_set_donation_from_unknown,
      COUNT(*) FILTER (
        WHERE (
          pricing_type IS NULL
          OR LOWER(TRIM(pricing_type)) NOT IN ('paid','free','donation')
        )
        AND price::numeric <= 0
        AND (donation_note IS NULL OR donation_note = '')
      ) AS will_set_free_from_unknown,
      COUNT(*) FILTER (
        WHERE LOWER(TRIM(COALESCE(pricing_type, ''))) = 'paid'
          AND price::numeric <= 0
      ) AS will_demote_paid_zero_price,
      COUNT(*) FILTER (
        WHERE requires_payment IS DISTINCT FROM (
          (LOWER(TRIM(COALESCE(pricing_type, ''))) NOT IN ('free','donation'))
          AND price::numeric > 0
        )
      ) AS requires_payment_drift
    FROM events
  `);

  const preview: PreviewRow = previewRows[0] ?? {
    total_events: 0,
    needs_case_normalize: 0,
    will_set_paid_from_unknown: 0,
    will_set_donation_from_unknown: 0,
    will_set_free_from_unknown: 0,
    will_demote_paid_zero_price: 0,
    requires_payment_drift: 0,
  };
  console.log("[backfill-event-pricing] Preview of pending changes:");
  console.log(`  - total events scanned:                    ${toNum(preview.total_events)}`);
  console.log(`  - pricing_type case/whitespace normalize:  ${toNum(preview.needs_case_normalize)}`);
  console.log(`  - pricing_type -> 'paid' (unknown/empty):  ${toNum(preview.will_set_paid_from_unknown)}`);
  console.log(`  - pricing_type -> 'donation' (unknown):    ${toNum(preview.will_set_donation_from_unknown)}`);
  console.log(`  - pricing_type -> 'free' (unknown/empty):  ${toNum(preview.will_set_free_from_unknown)}`);
  console.log(`  - pricing_type 'paid' demoted (price<=0):  ${toNum(preview.will_demote_paid_zero_price)}`);
  console.log(`  - requires_payment rows out of sync:       ${toNum(preview.requires_payment_drift)}`);

  if (DRY_RUN) {
    console.log("[backfill-event-pricing] Dry run complete — no rows written.");
    return;
  }

  // 2) Normalize case/whitespace on any non-NULL pricing_type. Doing
  //    this first means every later step can use exact-match comparisons
  //    against 'paid' / 'free' / 'donation' without worrying about
  //    legacy stray casing.
  const normalizeResult = await execRows(sql`
    UPDATE events
    SET pricing_type = LOWER(TRIM(pricing_type))
    WHERE pricing_type IS NOT NULL
      AND pricing_type <> LOWER(TRIM(pricing_type))
  `);
  console.log(
    `[backfill-event-pricing] Normalized pricing_type case/whitespace on ${normalizeResult.count} row(s).`,
  );

  // 3) Set pricing_type='paid' for rows with no recognized pricing_type
  //    but a positive price.
  const paidResult = await execRows(sql`
    UPDATE events
    SET pricing_type = 'paid'
    WHERE (
      pricing_type IS NULL
      OR pricing_type NOT IN ('paid','free','donation')
    )
    AND price::numeric > 0
  `);
  console.log(
    `[backfill-event-pricing] Set pricing_type='paid' on ${paidResult.count} row(s).`,
  );

  // 4) Set pricing_type='donation' for non-positive-price rows that
  //    carry a donation note but no recognized pricing_type.
  const donationResult = await execRows(sql`
    UPDATE events
    SET pricing_type = 'donation'
    WHERE (
      pricing_type IS NULL
      OR pricing_type NOT IN ('paid','free','donation')
    )
    AND price::numeric <= 0
    AND donation_note IS NOT NULL
    AND donation_note <> ''
  `);
  console.log(
    `[backfill-event-pricing] Set pricing_type='donation' on ${donationResult.count} row(s).`,
  );

  // 5) Set pricing_type='free' for everything else without a recognized
  //    pricing_type (no positive price, no donation note).
  const freeResult = await execRows(sql`
    UPDATE events
    SET pricing_type = 'free'
    WHERE (
      pricing_type IS NULL
      OR pricing_type NOT IN ('paid','free','donation')
    )
    AND price::numeric <= 0
  `);
  console.log(
    `[backfill-event-pricing] Set pricing_type='free' on ${freeResult.count} row(s).`,
  );

  // 6) Demote pricing_type='paid' rows whose price is non-positive. The
  //    canonical rule treats those as NOT paid (price gate fails), so
  //    leaving pricing_type='paid' would create exactly the kind of
  //    drift this backfill exists to clear.
  const demoteToDonationResult = await execRows(sql`
    UPDATE events
    SET pricing_type = 'donation'
    WHERE pricing_type = 'paid'
      AND price::numeric <= 0
      AND donation_note IS NOT NULL
      AND donation_note <> ''
  `);
  const demoteToFreeResult = await execRows(sql`
    UPDATE events
    SET pricing_type = 'free'
    WHERE pricing_type = 'paid'
      AND price::numeric <= 0
  `);
  console.log(
    `[backfill-event-pricing] Demoted pricing_type='paid' rows with price<=0: ` +
      `${demoteToDonationResult.count} -> 'donation', ${demoteToFreeResult.count} -> 'free'.`,
  );

  // 7) Sync requires_payment to the canonical derivation. Because
  //    steps 2-6 normalized pricing_type, the canonical expression
  //
  //      (lower(trim(pricing_type)) NOT IN ('free','donation'))
  //      AND price > 0
  //
  //    is now equivalent to `pricing_type = 'paid'` for every row, but
  //    we still write the full expression below to stay faithful to the
  //    booking-flow rule and to be robust if some edge case slipped
  //    past the prior steps.
  const reqTrueResult = await execRows(sql`
    UPDATE events
    SET requires_payment = TRUE
    WHERE requires_payment IS DISTINCT FROM TRUE
      AND (LOWER(TRIM(COALESCE(pricing_type, ''))) NOT IN ('free','donation'))
      AND price::numeric > 0
  `);
  const reqFalseResult = await execRows(sql`
    UPDATE events
    SET requires_payment = FALSE
    WHERE requires_payment IS DISTINCT FROM FALSE
      AND (
        LOWER(TRIM(COALESCE(pricing_type, ''))) IN ('free','donation')
        OR price::numeric <= 0
      )
  `);
  console.log(
    `[backfill-event-pricing] Set requires_payment=TRUE on ${reqTrueResult.count} row(s), FALSE on ${reqFalseResult.count} row(s).`,
  );

  // 8) Verification — every count below should be 0 after a successful
  //    run. If any are non-zero, something about the data violated an
  //    assumption above and the script needs to be revisited.
  const verifyRows = await execRows<VerifyRow>(sql`
    SELECT
      COUNT(*) FILTER (
        WHERE pricing_type IS NOT NULL
          AND pricing_type <> LOWER(TRIM(pricing_type))
      ) AS pricing_type_not_normalized,
      COUNT(*) FILTER (
        WHERE pricing_type IS NULL
          OR pricing_type NOT IN ('paid','free','donation')
      ) AS pricing_type_unknown_value,
      COUNT(*) FILTER (
        WHERE pricing_type = 'paid' AND price::numeric <= 0
      ) AS paid_with_zero_price,
      COUNT(*) FILTER (
        WHERE requires_payment IS DISTINCT FROM (
          (LOWER(TRIM(COALESCE(pricing_type, ''))) NOT IN ('free','donation'))
          AND price::numeric > 0
        )
      ) AS requires_payment_drift
    FROM events
  `);
  const verify: VerifyRow = verifyRows[0] ?? {
    pricing_type_not_normalized: 0,
    pricing_type_unknown_value: 0,
    paid_with_zero_price: 0,
    requires_payment_drift: 0,
  };
  console.log("[backfill-event-pricing] Post-backfill consistency check (all should be 0):");
  console.log(`  - pricing_type still not normalized:         ${toNum(verify.pricing_type_not_normalized)}`);
  console.log(`  - pricing_type still unknown/empty:          ${toNum(verify.pricing_type_unknown_value)}`);
  console.log(`  - 'paid' rows with price<=0:                 ${toNum(verify.paid_with_zero_price)}`);
  console.log(`  - requires_payment vs canonical rule drift:  ${toNum(verify.requires_payment_drift)}`);

  const totalChanged =
    normalizeResult.count +
    paidResult.count +
    donationResult.count +
    freeResult.count +
    demoteToDonationResult.count +
    demoteToFreeResult.count +
    reqTrueResult.count +
    reqFalseResult.count;
  console.log(
    `[backfill-event-pricing] Done. Total row updates applied: ${totalChanged}.`,
  );
}

backfillEventPricing()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("[backfill-event-pricing] FAILED:", err);
    process.exit(1);
  });
