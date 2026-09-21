import { parseEventDate } from "./dateUtils";
import type { OutboundMessage } from "../whatsapp/routes";

type ToolResult = { toolName: string; output: any };

function formatPrice(price: string, currency: string, isFree?: boolean): string {
  if (isFree || price === "0" || price === "0.0" || price === "0.00") return "Free";
  const symbol = currency === "INR" ? "₹" : `${currency} `;
  return `${symbol}${price}`;
}

// Route through parseEventDate so a naive ISO ("2026-05-14T11:00:00") is
// interpreted as IST, not the host's local TZ. Without this, a UTC host would
// re-render the time +05:30 ahead of what the dashboard shows.
function formatDateTime(iso: string, timezone: string): string {
  try {
    return parseEventDate(iso).toLocaleString("en-IN", {
      timeZone: timezone,
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return iso;
  }
}

function buildEventCaption(o: any): string {
  const parts: string[] = [];
  parts.push(`*${o.title}*`);
  if (o.thumbnailDescription) parts.push("", o.thumbnailDescription);

  const meta: string[] = [];
  if (o.startAt) meta.push(`📅 ${formatDateTime(o.startAt, o.timezone || "Asia/Kolkata")}`);
  if (o.mode === "online") {
    meta.push(`💻 Online`);
  } else if (o.location) {
    meta.push(`📍 ${o.location}`);
  }
  meta.push(`💰 ${formatPrice(o.price, o.currency, o.pricingType === "free")}`);
  if (o.cadence) meta.push(`🔄 ${o.cadence}`);
  if (meta.length > 0) parts.push("", ...meta);

  parts.push("", o.eventUrl);
  return parts.join("\n");
}

function buildSessionCaption(o: any): string {
  const parts: string[] = [];
  parts.push(`*${o.title}*`);
  if (o.thumbnailDescription) parts.push("", o.thumbnailDescription);

  const meta: string[] = [];
  if (o.duration) meta.push(`⏱ ${o.duration} mins`);
  meta.push(`💰 ${formatPrice(o.price, o.currency, o.isFree)}`);
  if (o.isOnline && !o.isOffline) meta.push(`💻 Online`);
  if (meta.length > 0) parts.push("", ...meta);

  parts.push("", o.sessionUrl);
  return parts.join("\n");
}

/**
 * Build the post-create message sequence (self mode).
 *
 * Order:
 *   1. Welcome + login link (only if a profile was just created in this turn)
 *   2. For each created event/session, in agent-call order:
 *        - "Your {title} is live!"
 *        - Shareable flyer (image + caption with link), or text-only fallback
 *
 * Returns [] if no creation tools succeeded — caller should fall back to the
 * agent's own reply text in that case.
 */
export function buildPostCreateMessages(orderedToolResults: ToolResult[]): OutboundMessage[] {
  const messages: OutboundMessage[] = [];

  const profileResult = orderedToolResults.find(
    (r) => r.toolName === "createProfile" && r.output?.success,
  );
  if (profileResult) {
    const { displayName, magicLink, alreadyExisted } = profileResult.output;
    const name = displayName ?? "";
    // Distinguish a freshly-created profile from the idempotent
    // "you already have one" path so we don't congratulate returning users
    // with the new-signup welcome.
    const greet = alreadyExisted
      ? name
        ? `Welcome back, ${name} 🙌`
        : "Welcome back 🙌"
      : name
        ? `Welcome to Riplect, ${name}! 🎉`
        : "Welcome to Riplect! 🎉";
    const bodyForCreated = magicLink
      ? `${greet}\n\nYour profile is created. Tap the link below to sign in to your dashboard and complete onboarding:\n\n${magicLink}`
      : `${greet}\n\nYour profile is created. We couldn't generate a sign-in link right now — please head to riplect.com and sign in to continue.`;
    const bodyForReturning = magicLink
      ? `${greet}\n\nLooks like you already have a Riplect profile — here's a fresh sign-in link for your dashboard:\n\n${magicLink}`
      : `${greet}\n\nLooks like you already have a Riplect profile. Head to riplect.com to sign in.`;
    messages.push({ body: alreadyExisted ? bodyForReturning : bodyForCreated });
  }

  for (const r of orderedToolResults) {
    if (!r.output?.success) continue;

    if (r.toolName === "createEvent" || r.toolName === "createRecurringEvent") {
      const o = r.output;
      messages.push({ body: `🎉 Your event is live!` });

      const caption = buildEventCaption(o);
      messages.push(
        o.featuredImage
          ? { body: caption, mediaUrl: o.featuredImage }
          : { body: caption },
      );
      continue;
    }

    if (r.toolName === "createSession") {
      const o = r.output;
      messages.push({ body: `🎉 Your session is live!` });

      const caption = buildSessionCaption(o);
      messages.push(
        o.featuredImage
          ? { body: caption, mediaUrl: o.featuredImage }
          : { body: caption },
      );
      continue;
    }
  }

  return messages;
}

/**
 * Build the post-create message sequence for CM mode.
 *
 * The CM is staff submitting on behalf of an organizer they don't share a
 * chat with — so the messaging is tailored for forwarding:
 *   1. createProfile success → "Profile created for {name}. Login link to share with them: {loginLink}"
 *   2. For each event/session, in agent-call order:
 *        - "Event/Session published for {organizer}. Forward this to them:"
 *        - Shareable flyer (image + caption with link)
 *
 * No "Welcome to Riplect" — that's directed at the creator and the creator
 * isn't the one in this chat.
 */
export function buildCmPostCreateMessages(orderedToolResults: ToolResult[]): OutboundMessage[] {
  const messages: OutboundMessage[] = [];

  const profileResult = orderedToolResults.find(
    (r) => r.toolName === "createProfile" && r.output?.success,
  );
  if (profileResult) {
    const { displayName, magicLink, alreadyExisted } = profileResult.output;
    const who = displayName ?? "the organizer";
    const verb = alreadyExisted ? "already on Riplect" : "created";
    if (magicLink) {
      messages.push({
        body:
          `✅ ${who} is ${verb}.\n\n` +
          `Forward this sign-in link to them — it lets them access their dashboard:\n\n${magicLink}`,
      });
    } else {
      messages.push({
        body:
          `✅ ${who} is ${verb}.\n\n` +
          `We couldn't generate a sign-in link right now — they can head to riplect.com to sign in.`,
      });
    }
  }

  for (const r of orderedToolResults) {
    if (!r.output?.success) continue;

    if (r.toolName === "createEvent" || r.toolName === "createRecurringEvent") {
      const o = r.output;
      const who = o.organizerName ?? "the organizer";
      messages.push({ body: `🎉 Event published for ${who}. Forward this to them:` });

      const caption = buildEventCaption(o);
      messages.push(
        o.featuredImage
          ? { body: caption, mediaUrl: o.featuredImage }
          : { body: caption },
      );
      continue;
    }

    if (r.toolName === "createSession") {
      const o = r.output;
      const who = o.organizerName ?? "the organizer";
      messages.push({ body: `🎉 Session published for ${who}. Forward this to them:` });

      const caption = buildSessionCaption(o);
      messages.push(
        o.featuredImage
          ? { body: caption, mediaUrl: o.featuredImage }
          : { body: caption },
      );
      continue;
    }

    if (r.toolName === "updateEvent") {
      const o = r.output;
      const who = o.organizerName ?? "the organizer";
      messages.push({
        body: `✅ Updated *${o.title}* for ${who}. Forward the updated flyer:`,
      });
      // Preserve & warn: name the booked dates that kept their original time.
      if (
        Array.isArray(o.preservedRegisteredDates) &&
        o.preservedRegisteredDates.length > 0
      ) {
        messages.push({
          body:
            `Heads up — these dates already had signups, so they kept their original time and weren't moved:\n• ` +
            o.preservedRegisteredDates.join("\n• "),
        });
      }
      const caption = buildEventCaption(o);
      messages.push(
        o.featuredImage
          ? { body: caption, mediaUrl: o.featuredImage }
          : { body: caption },
      );
      continue;
    }

    if (r.toolName === "updateSession") {
      const o = r.output;
      const who = o.organizerName ?? "the organizer";
      messages.push({
        body: `✅ Updated *${o.title}* for ${who}. Forward the updated flyer:`,
      });
      const caption = buildSessionCaption(o);
      messages.push(
        o.featuredImage
          ? { body: caption, mediaUrl: o.featuredImage }
          : { body: caption },
      );
      continue;
    }

    if (r.toolName === "deleteEvent") {
      const o = r.output;
      const who = o.organizerName ?? "the organizer";
      // No flyer — the listing is gone. For a recurring event the whole
      // series went, so say so explicitly.
      messages.push({
        body: o.wasRecurring
          ? `🗑️ Deleted the whole *${o.title}* series for ${who} — every upcoming date is off their page.`
          : `🗑️ Deleted *${o.title}* for ${who} — it's off their page.`,
      });
      continue;
    }

    if (r.toolName === "deleteSession") {
      const o = r.output;
      const who = o.organizerName ?? "the organizer";
      messages.push({
        body: `🗑️ Deleted *${o.title}* for ${who} — it's off their page.`,
      });
      continue;
    }
  }

  return messages;
}
