# Hand-off to `Riplek/wp-bot` — Restoring the unified onboarding flow

**Audience:** the team maintaining the external `Riplek/wp-bot` repository, whose code is merged into this repo as `backend/agent/**`.

**Why this exists:** after PR #28 was merged into the main app, four bot-side behaviors regressed against the unified-auth contract that the rest of the app assumes. This document lists every change needed in the bot repo (and only the bot repo) to restore end-to-end onboarding. Nothing in this document needs to be implemented on the main-app/Replit side — that work is already done.

---

## Summary of the gap

After PR #28, the bot:

1. Mints `<phone>@phone.riplek.com` placeholder emails on `auth.users` (legacy behavior the unified model deliberately removed).
2. Doesn't populate the canonical `profiles.phone_e164` column on new profiles.
3. Sends users a `${APP_BASE_URL}/auth` URL instead of `${APP_BASE_URL}/claim?phone=<E.164>` — so users land on a generic sign-in page with no phone pre-fill.
4. Reads `process.env.APP_BASE_URL` directly with no fallback, so URLs render as `undefined/...` whenever the env var isn't explicitly set.

All four issues live in one file: **`backend/agent/tools/createProfile.ts`**. Issue 4 also affects three other tool files (event / session / recurring-event URLs), so any link the bot sends today is potentially broken, not just the login link.

Nothing else in `backend/agent/` needs to change — the new self/cm split, the redis lock, post-create messaging, `setAvailability`, `createRecurringEvent`, `lookupProfile`, etc. are all good as-is. The pre-agent reconciliation guard wasn't lost; it moved into `conversationStore.ensureConversation`, which is the right place for it.

---

## Change 1 (MUST) — Rewrite `backend/agent/tools/createProfile.ts` to delegate to the unified bridge

There is already a Replit-side helper, `backend/whatsapp/createBotProfile.ts`, designed to be the single entry point for bot-driven account creation. It handles all four regressions at once: phone-only auth user, `phone_e164` write, `/claim?phone=...` link generation, and race-safe reconciliation (both pre- and post-insert). Adopting it is a ~30-line rewrite of `tools/createProfile.ts`.

### Full replacement file

```ts
// backend/agent/tools/createProfile.ts
import { tool } from "ai";
import { z } from "zod";
import { createBotProfile } from "../../whatsapp/createBotProfile";

export const createProfile = tool({
  description:
    "Create a new Riplect profile. Creates a phone-only Supabase auth user, a profile, and returns a one-tap claim link the user taps in WhatsApp to sign in on the web.",
  inputSchema: z.object({
    phone: z
      .string()
      .describe("Creator's phone number in E.164 format (e.g. +919876543210)"),
    displayName: z.string().describe("Creator's full name"),
    title: z
      .string()
      .describe("Professional title (e.g. 'Yoga Teacher', 'Sound Healer')"),
    sourceChannel: z
      .string()
      .default("whatsapp")
      .describe("Channel the creator was onboarded from"),
    profileImageUrl: z
      .string()
      .optional()
      .describe(
        "Profile picture URL from the Available Images list in session context.",
      ),
  }),
  execute: async ({
    phone,
    displayName,
    title,
    sourceChannel,
    profileImageUrl,
  }) => {
    const result = await createBotProfile({
      phone,
      displayName,
      title,
      profileImageUrl,
      sourceChannel,
    });

    if (!result.ok) {
      return {
        success: false,
        errorCode: result.code,
        error: result.error,
      };
    }

    return {
      success: true,
      profileId: result.profileId,
      username: result.username,
      displayName: result.displayName,
      // Field name kept as `loginLink` so existing prompts and
      // postCreateMessages templates don't need to change. Value is now the
      // /claim?phone=<E.164> URL that pre-fills the phone on the web.
      loginLink: result.claimLink,
      reconciled: result.reconciled,
    };
  },
});
```

### Why this is a one-shot fix

`createBotProfile` already encapsulates:

- Phone normalization to E.164 (no more `phone.replace("+", "")`).
- Profile-level reconciliation via `findProfileByWhatsApp` — same idempotency the old code had.
- Auth-user creation via `createPhoneOnlyUserIfMissing`, which is the unified-identity helper that guarantees no fake email and is race-safe (handles the orphan-auth-user recovery case the old code did manually with `findAuthUserIdByPhone`).
- Profile-row insert with `phoneE164`, `contactInfo: { phone, whatsapp }`, and `onboardingCompleted: false`.
- Concurrent-insert race recovery via 23505 unique-violation handling.
- Claim link generation via `getAppBaseUrl()` — picks up `PUBLIC_APP_URL` → `APP_URL` → `REPLIT_DOMAINS` → `localhost`, in that order.
- Structured `[bot-signup]` logs at every branch for ops visibility.

### Result-shape mapping

The agent currently returns these fields on success: `success`, `profileId`, `username`, `displayName`, `loginLink`. The mapping above keeps every one of those fields. The new `reconciled: boolean` is additive — existing consumers will ignore it, but downstream prompts/messages can use it to differentiate "welcome, your account is ready" from "welcome back, here's your existing account."

On failure, the new code emits one of `INVALID_PHONE | NOT_CONFIGURED | AUTH_CREATE_FAILED | PROFILE_INSERT_FAILED`. The old code emitted `AUTH_CREATE_FAILED | AUTH_USER_EXISTS | PROFILE_CREATE_FAILED`. If any prompt or downstream code branches on `errorCode`, the only meaningful change is that `AUTH_USER_EXISTS` no longer occurs — the new helper transparently reuses orphan auth users instead of erroring out.

### What to delete from this file

The whole `findAuthUserIdByPhone` helper (lines 23–34) goes away — `createPhoneOnlyUserIfMissing` handles that recovery internally. Same for the `systemEmail` variable, the `supabase.auth.admin.createUser` call, the entire `if (createError)` recovery branch, and all five `process.env.APP_BASE_URL` template strings.

---

## Change 2 (SHOULD) — Replace `process.env.APP_BASE_URL` with `getAppBaseUrl()` in the other three tool files

The same env-var bug affects every URL the bot sends, not just login links. Today, every "your event is at X" or "your session is at Y" message will render as `undefined/...` in environments where `APP_BASE_URL` isn't set. Switching to `getAppBaseUrl()` fixes this once and for all, with a sensible fallback chain.

Affected files and the exact lines:

**`backend/agent/tools/createSession.ts`** (1 occurrence)

```ts
// Add to imports at the top:
import { getAppBaseUrl } from "../../email/utils";

// Line 87 — replace:
const sessionUrl = `${process.env.APP_BASE_URL}/${profile.username}/session/${session.id}`;
// with:
const sessionUrl = `${getAppBaseUrl()}/${profile.username}/session/${session.id}`;
```

**`backend/agent/tools/createEvent.ts`** (1 occurrence)

```ts
// Add to imports at the top:
import { getAppBaseUrl } from "../../email/utils";

// Line 130 — replace:
const eventUrl = `${process.env.APP_BASE_URL}/${profile.username}/event/${event.id}`;
// with:
const eventUrl = `${getAppBaseUrl()}/${profile.username}/event/${event.id}`;
```

**`backend/agent/tools/createRecurringEvent.ts`** (2 occurrences, lines 184 and 224)

```ts
// Add to imports at the top:
import { getAppBaseUrl } from "../../email/utils";

// Line 184 — replace:
eventUrl: `${process.env.APP_BASE_URL}/${profile.username}/event/${placeholder.id}`,
// with:
eventUrl: `${getAppBaseUrl()}/${profile.username}/event/${placeholder.id}`,

// Line 224 — replace:
eventUrl: `${process.env.APP_BASE_URL}/${profile.username}/event/${first.id}`,
// with:
eventUrl: `${getAppBaseUrl()}/${profile.username}/event/${first.id}`,
```

After Change 1, no other file in `backend/agent/` reads `APP_BASE_URL`. So this is the complete list — once these four files are updated, no further env-var setup is needed for the bot to produce working URLs in any environment.

`getAppBaseUrl()` source for reference (lives at `backend/email/utils.ts` lines 17–28):

```ts
export function getAppBaseUrl(): string {
  if (process.env.PUBLIC_APP_URL) return stripTrailingSlash(process.env.PUBLIC_APP_URL);
  if (process.env.APP_URL) return stripTrailingSlash(process.env.APP_URL);
  if (process.env.NODE_ENV !== 'production' && process.env.REPLIT_DOMAINS) {
    return `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`;
  }
  return 'http://localhost:5000';
}
```

---

## Change 3 (SHOULD) — Restore canonical-column-first lookup in `backend/whatsapp/profileLookup.ts`

This file is also touched by the external repo. The current version goes through a Postgres RPC `get_profile_by_phone` and silently returns null on RPC error — which means a missing function or an RLS hiccup looks identical to "no profile exists." It also strips the `+` and never tries the canonical `phone_e164` column directly.

After Change 1 is in place, every new bot signup writes `phone_e164` correctly, so the canonical column path becomes worth using. Recommended replacement:

```ts
// backend/whatsapp/profileLookup.ts
import { db } from "../db";
import { sql } from "drizzle-orm";
import { normalizeToE164 } from "../auth/phoneNumber";

/**
 * Find a profileId by verified WhatsApp phone. Two-stage lookup:
 *   1. Canonical `profiles.phone_e164` column (post-Task-150 path).
 *   2. Legacy JSONB `contact_info->>'phone'` / `->>'whatsapp'` fallback for
 *      profiles that pre-date Task #150 or were created without phone_e164.
 * Returns null if neither matches.
 */
export async function findProfileByWhatsApp(
  phoneNumber: string,
): Promise<string | null> {
  const phoneE164 = normalizeToE164(phoneNumber);
  if (!phoneE164) return null;

  try {
    const rows = await db.execute<{ id: string }>(sql`
      SELECT id::text AS id FROM profiles
      WHERE phone_e164 = ${phoneE164}
      LIMIT 1
    `);
    if (rows[0]?.id) return rows[0].id;

    // Legacy JSONB fallback — bot-created profiles from before the
    // canonical column adoption, or web-created profiles that only set
    // contact_info.phone via the old onboarding wizard.
    const legacyRows = await db.execute<{ id: string }>(sql`
      SELECT id::text AS id FROM profiles
      WHERE contact_info->>'phone' = ${phoneE164}
         OR contact_info->>'whatsapp' = ${phoneE164}
      LIMIT 1
    `);
    return legacyRows[0]?.id ?? null;
  } catch (err) {
    console.error("[ProfileLookup] query failed:", err);
    return null;
  }
}
```

`normalizeToE164` lives at `backend/auth/phoneNumber.ts` and is already used by the rest of the unified-auth code, so the bot pulls in only Replit-side helpers that the platform team owns. No Postgres RPC dependency, fewer silent-failure modes, and works for both new and legacy profiles.

---

## Change 4 (NICE-TO-HAVE) — Make `loginLink` consumers branch on `reconciled`

After Change 1, the agent has a new boolean `reconciled` on success. If you'd like the bot's first message to read differently for returning users than for net-new ones, the prompt or `postCreateMessages` template can branch on it. Not required for correctness — purely a UX nicety. Example phrasing:

- `reconciled: false` → "Welcome to Riplect! Tap here to finish setting up your account: <claimLink>"
- `reconciled: true`  → "Welcome back! Tap here to sign in: <claimLink>"

---

## What does NOT need to change in `backend/agent/`

To prevent unnecessary churn in the bot repo, here's the explicit "leave alone" list:

- The new self/cm message-handler split (`handleSelfMessage.ts`, `handleCmMessage.ts`, `handleWhatsAppMessage.ts`, `messageHandlerShared.ts`, `postCreateMessages.ts`) — architecturally fine, no changes needed.
- The Redis lock (`backend/whatsapp/messageLock.ts`, `backend/whatsapp/redisClient.ts`) — works correctly with the platform's Upstash setup.
- `setAvailability.ts`, `createRecurringEvent.ts`, `lookupProfile.ts`, `createSession.ts`, `createEvent.ts` — only the env-var fix from Change 2 is needed; their core logic is fine.
- `riplectAgent.ts`, `cmAgent.ts`, `model.ts`, `context.ts` — no changes.
- The pre-agent reconciliation guard — it's already in `conversationStore.ensureConversation` (which calls `findProfileByWhatsApp` whenever a conversation row has no `profileId`). Nothing to add.

---

## Test plan after the bot team ships these changes

To confirm the unified flow is working end-to-end, the platform team will run:

1. Brand-new WhatsApp number messages the bot for the first time → bot calls `createProfile` → verify in Supabase that the `auth.users` row has `email = NULL`, `phone = '+...'`, and the matching `profiles` row has `phone_e164 = '+...'`, `onboarding_completed = false`.
2. The bot's reply contains a URL of shape `https://<host>/claim?phone=%2B...` (URL-encoded `+`).
3. Tapping the link opens the `/claim` page, which auto-triggers a phone OTP, the user enters it, and lands on `/onboarding` already authenticated.
4. Same WhatsApp number messages the bot a second time → conversation is reused, no duplicate `auth.users` or `profiles` row is created, bot's reply uses the same `loginLink`.
5. A creator who originally signed up on web with a real email later messages the bot from a number that matches `profiles.phone_e164` → bot reconciles to the existing profile (`reconciled: true`), no new `auth.users` row, no duplicate profile.
6. The bot creates an event/session and the URL in the reply renders with the correct host (no `undefined/...`).

---

## Quick reference — files in scope

| File | Change |
|---|---|
| `backend/agent/tools/createProfile.ts` | **MUST** — full rewrite (Change 1) |
| `backend/agent/tools/createSession.ts` | **SHOULD** — 1 line + 1 import (Change 2) |
| `backend/agent/tools/createEvent.ts` | **SHOULD** — 1 line + 1 import (Change 2) |
| `backend/agent/tools/createRecurringEvent.ts` | **SHOULD** — 2 lines + 1 import (Change 2) |
| `backend/whatsapp/profileLookup.ts` | **SHOULD** — full rewrite (Change 3) |
| `backend/agent/postCreateMessages.ts` *(or wherever the welcome copy lives)* | **NICE-TO-HAVE** — branch on `reconciled` (Change 4) |

Everything else in `backend/agent/` and `backend/whatsapp/` should be left as-is.
