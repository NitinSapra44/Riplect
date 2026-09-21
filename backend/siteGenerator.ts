/**
 * AI site generator (PROTOTYPE).
 *
 * Assembles a creator's live profile data (text + image URLs from storage)
 * into a prompt, asks Claude to produce a complete, self-contained, bespoke
 * landing-page website, and returns the HTML.
 *
 * Every CTA in the generated HTML links back to the canonical Riplek route so
 * bookings / purchases / registrations keep flowing through the platform.
 *
 * Env:
 *   ANTHROPIC_API_KEY  – required (read automatically by @ai-sdk/anthropic)
 *   SITE_GEN_MODEL     – optional model override (default below)
 */
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { storage as dbStorage } from "./storage";

// Current Claude Opus. Override with SITE_GEN_MODEL (e.g. a Sonnet model to
// cut cost/latency for the prototype).
const MODEL = process.env.SITE_GEN_MODEL || "claude-opus-4-8";
const MAX_OUTPUT_TOKENS = 16000;

// Caps so a creator with lots of data (e.g. a daily recurring class expanded
// into dozens of instances) can't flood the prompt. Recurring events that
// share a title are collapsed to the soonest instance before capping.
const MAX_EVENTS = 4;
const MAX_SESSIONS = 8;
const MAX_PRODUCTS = 8;
const MAX_BLOGS = 6;
const MAX_TESTIMONIALS = 6;
const MAX_GALLERY = 10;

export interface GenerateResult {
  html: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}

/** Pull everything we know about a creator from the existing storage layer. */
async function assembleContext(username: string) {
  const profile = await dbStorage.getProfileByUsername(username);
  if (!profile) return null;

  const [sessions, events, products, blogs] = await Promise.all([
    dbStorage.getBookingSessionsByProfileId(profile.id),
    dbStorage.getEventsByProfileId(profile.id),
    dbStorage.getDigitalProductsByProfileId(profile.id),
    dbStorage.getBlogPostsByProfileId(profile.id),
  ]);

  return { profile, sessions, events, products, blogs };
}

const money = (price: any, currency?: string | null, isFree?: boolean | null) =>
  isFree || Number(price) === 0 ? "Free" : `${currency || "USD"} ${price}`;

/**
 * Render the context into a compact, readable data block for the model.
 * All links are relative canonical Riplek routes (served same-origin).
 */
function buildDataBlock(ctx: NonNullable<Awaited<ReturnType<typeof assembleContext>>>): string {
  const { profile, sessions, events, products, blogs } = ctx;
  const u = profile.username;
  const lines: string[] = [];

  lines.push(`USERNAME: ${u}`);
  lines.push(`PROFILE_URL (home / all CTAs fall back here): /${u}`);
  lines.push("");
  lines.push("=== CREATOR ===");
  lines.push(`Display name: ${profile.displayName || ""}`);
  if (profile.title) lines.push(`Title / role: ${profile.title}`);
  if (profile.shortBio) lines.push(`Short bio: ${profile.shortBio}`);
  if (profile.longBio) lines.push(`Long bio: ${profile.longBio}`);
  else if (profile.bio) lines.push(`Bio: ${profile.bio}`);
  if (profile.profileImageUrl) lines.push(`Profile image URL: ${profile.profileImageUrl}`);
  if (profile.shortBioImageUrl) lines.push(`Bio image URL: ${profile.shortBioImageUrl}`);
  if (profile.longBioImageUrl) lines.push(`Secondary bio image URL: ${profile.longBioImageUrl}`);

  const contact = (profile.contactInfo as any) || {};
  const social = (profile.socialLinks as any) || {};
  const contactBits: string[] = [];
  if (contact.showEmail && contact.email) contactBits.push(`email=${contact.email}`);
  if (contact.showWhatsApp && contact.whatsapp) contactBits.push(`whatsapp=${contact.whatsapp}`);
  if (contact.showPhone && contact.phone) contactBits.push(`phone=${contact.phone}`);
  const loc = contact.location || {};
  const locStr = [loc.city, loc.state, loc.country].filter(Boolean).join(", ");
  if (locStr) contactBits.push(`location=${locStr}`);
  if (contactBits.length) lines.push(`Contact: ${contactBits.join(" | ")}`);
  const socials = Object.entries(social)
    .filter(([, v]) => !!v)
    .map(([k, v]) => `${k}=${v}`);
  if (socials.length) lines.push(`Social links: ${socials.join(" | ")}`);

  const testimonials = (profile.testimonials as any[]) || [];
  if (testimonials.length) {
    lines.push("");
    lines.push("=== TESTIMONIALS ===");
    testimonials.slice(0, MAX_TESTIMONIALS).forEach((t) =>
      lines.push(`- "${t.content}" — ${t.clientName}${t.clientTitle ? `, ${t.clientTitle}` : ""}${t.rating ? ` (${t.rating}/5)` : ""}`),
    );
  }

  if (sessions.length) {
    lines.push("");
    lines.push("=== SESSIONS / OFFERINGS (link each Book button to its URL) ===");
    sessions.slice(0, MAX_SESSIONS).forEach((s: any) => {
      const img = Array.isArray(s.images) && s.images[0]?.url ? s.images[0].url : "";
      const mode = [s.isOnline ? "Online" : null, s.isOffline ? "In-person" : null].filter(Boolean).join(" / ");
      lines.push(
        `- ${s.title} | ${s.duration} min | ${money(s.price, s.currency, s.isFree)} | ${mode}` +
          `${s.thumbnailDescription ? ` | ${s.thumbnailDescription}` : ""}` +
          `${img ? ` | image=${img}` : ""} | URL=/${u}/session/${s.id}`,
      );
    });
  }

  const now = Date.now();
  // Collapse recurring instances that share a title (keep the soonest of each),
  // then cap — otherwise a daily class floods the prompt with identical events.
  const seenEventTitles = new Set<string>();
  const upcoming = events
    .filter((e: any) => !e.startAt || new Date(e.startAt).getTime() >= now - 86400000)
    .sort((a: any, b: any) => new Date(a.startAt || 0).getTime() - new Date(b.startAt || 0).getTime())
    .filter((e: any) => {
      const key = (e.title || "").trim().toLowerCase();
      if (seenEventTitles.has(key)) return false;
      seenEventTitles.add(key);
      return true;
    })
    .slice(0, MAX_EVENTS);
  if (upcoming.length) {
    lines.push("");
    lines.push("=== EVENTS (link each Register button to its URL) ===");
    upcoming.forEach((e: any) => {
      lines.push(
        `- ${e.title} | ${e.startAt ? new Date(e.startAt).toISOString() : "TBD"} | ${e.mode || ""} | ${money(e.price, e.currency, e.pricingType === "free")}` +
          `${e.featuredImage ? ` | image=${e.featuredImage}` : ""} | URL=/${u}/event/${e.id}`,
      );
    });
  }

  const activeProducts = products.filter((p: any) => p.isActive !== false);
  if (activeProducts.length) {
    lines.push("");
    lines.push("=== PRODUCTS (link each button to its URL) ===");
    activeProducts.slice(0, MAX_PRODUCTS).forEach((p: any) => {
      lines.push(
        `- ${p.title} | ${p.productType || "digital"} | ${money(p.price, p.currency, p.isFree)}` +
          `${p.thumbnailDescription ? ` | ${p.thumbnailDescription}` : ""}` +
          `${p.imageUrl ? ` | image=${p.imageUrl}` : ""} | URL=/${u}/product/${p.id}`,
      );
    });
  }

  const publishedBlogs = blogs.filter((b: any) => b.isPublished);
  if (publishedBlogs.length) {
    lines.push("");
    lines.push("=== BLOG POSTS (link each to its URL) ===");
    publishedBlogs.slice(0, MAX_BLOGS).forEach((b: any) =>
      lines.push(`- ${b.title}${b.excerpt ? ` | ${b.excerpt}` : ""}${b.imageUrl ? ` | image=${b.imageUrl}` : ""} | URL=/${u}/blog/${b.slug}`),
    );
  }

  const gallery = (profile.galleryImages as any[]) || [];
  if (gallery.length) {
    lines.push("");
    lines.push("=== GALLERY IMAGE URLS ===");
    gallery.slice(0, MAX_GALLERY).forEach((g) => lines.push(`- ${g.url}${g.alt ? ` (${g.alt})` : ""}`));
  }

  return lines.join("\n");
}

const SYSTEM_PROMPT = `You are an elite brand and web designer who hand-crafts a unique, beautiful, single-page marketing website for one independent creator (coach, healer, mentor, freelancer) on the Riplek platform.

OUTPUT
- Return ONE complete HTML document and NOTHING else. Start with <!DOCTYPE html>. No markdown, no code fences, no commentary before or after.
- Fully self-contained: all CSS in a single <style> tag; only minimal, optional vanilla JS inline (e.g. scroll reveal). No frameworks, no build step.
- You MAY load fonts from Google Fonts (fonts.googleapis.com) via <link>. No other external resources or scripts.

DESIGN
- Make it genuinely bespoke and reflect WHO this person is and WHAT they do. Derive a palette, type system, and layout mood from their field and language (e.g. wellness/healing => calm, earthy, spacious, serif accents; business/career => confident, modern, crisp). Two different creators must never look the same.
- Strong, distinctive hero. Then a logical flow of sections — about/approach, offerings/sessions, events, products, testimonials, and contact — INCLUDING ONLY sections that have data. Never render an empty section.
- Use the provided image URLs as real <img src> with descriptive alt text. If a section has no image, design with type, color, and whitespace instead — never use placeholder-image services or invent image URLs.
- Polished and modern: thoughtful spacing, hierarchy, micro-interactions on hover, tasteful motion. Mobile-first and fully responsive. Respect prefers-reduced-motion.
- Accessible: semantic landmarks (header/main/section/footer), sufficient contrast, visible focus states, alt text on every image.

CONTENT RULES
- Use ONLY the facts provided. Do NOT invent testimonials, credentials, prices, statistics, or contact details. You may write light connective/marketing copy, but never fabricate claims.
- Keep all real prices, durations, and names exactly as given.

CRITICAL — CALL TO ACTION LINKS
- Every actionable element (Book, Buy, Download, Register, Read, Contact, View profile) MUST be an <a> whose href is the exact canonical URL given for that item (relative paths like /username/session/123). Never invent or alter these URLs, and never wire buttons to external services.
- Add target="_top" to EVERY such <a> so it navigates the top window (the page is shown inside a preview frame).
- Generic "work with me" / hero CTAs with no specific item should link to the PROFILE_URL.
- End with a small footer: "Powered by Riplek" linking (target="_top") to the PROFILE_URL.`;

function stripFences(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```[a-zA-Z]*\s*\n/, "").replace(/\n?```\s*$/, "");
  }
  const idx = t.indexOf("<!DOCTYPE");
  if (idx > 0) t = t.slice(idx);
  return t.trim();
}

/** Generate (or regenerate) the website HTML for a username. */
export async function generateSiteHtml(username: string, styleHint?: string): Promise<GenerateResult> {
  const ctx = await assembleContext(username);
  if (!ctx) throw new Error("Profile not found");

  const dataBlock = buildDataBlock(ctx);
  const userPrompt =
    `Create the website for this creator using ONLY the data below.\n\n` +
    (styleHint ? `Creator's style preference (honor it): ${styleHint}\n\n` : "") +
    `--- CREATOR DATA ---\n${dataBlock}\n--- END DATA ---`;

  const result = await generateText({
    model: anthropic(MODEL),
    system: SYSTEM_PROMPT,
    prompt: userPrompt,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  });

  const html = stripFences(result.text || "");
  if (!html.toLowerCase().includes("<!doctype") && !html.toLowerCase().includes("<html")) {
    throw new Error("Model did not return valid HTML");
  }

  return {
    html,
    model: MODEL,
    inputTokens: (result.usage as any)?.inputTokens,
    outputTokens: (result.usage as any)?.outputTokens,
  };
}
