// server/brief/generate.ts
//
// The AI "art director". Two clearly separated tiers, matched to effort/cost:
//   - generateBrief()  → Opus, full context. The wow moment + "redesign it all".
//   - editSection()    → cheap/fast model, scoped to ONE section. "make this
//                         warmer", "rework just this part".
// Direct edits (text/color/reorder/hide) never reach this file — they happen
// client-side for free.
//
// The model only ever decides DIRECTION (brand + arrangement + emphasis + typed
// CTAs). It never writes content: copy/prices/testimonials come from live data.
// Whatever the model returns is run through normalizeBrief(), so it is impossible
// for it to emit a broken page or a dead button.

import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import {
  ALIGNMENTS,
  BACKGROUNDS,
  BrandSchema,
  CTA_PRESENTATIONS,
  CTA_STYLES,
  CtaActionSchema,
  EMPHASES,
  SECTION_KINDS,
  type PageBrief,
  type Section,
} from "@shared/brief";
import { normalizeBrief } from "./normalize";
import { briefFromProfile } from "./fromProfile";
import { polishBrief } from "./enhance";
import type { BriefBundle } from "./bundle";

const GEN_MODEL = process.env.AI_PROFILE_GEN_MODEL || "claude-opus-4-8";
const EDIT_MODEL = process.env.AI_PROFILE_EDIT_MODEL || "claude-haiku-4-5-20251001";

/** Thrown when the model can't be called because the API key is unset. Routes
 *  map this to a clear 503 instead of an opaque 500. */
export class AiNotConfiguredError extends Error {
  statusCode = 503;
  constructor() {
    super("AI image/text generation is not configured: ANTHROPIC_API_KEY is missing.");
    this.name = "AiNotConfiguredError";
  }
}

function assertAiConfigured() {
  if (!process.env.ANTHROPIC_API_KEY) throw new AiNotConfiguredError();
}

/* --- schemas the model fills (no server-assigned ids) ------------------- */

const GenCtaSchema = z.object({
  action: CtaActionSchema,
  presentation: z.enum(CTA_PRESENTATIONS).optional(),
  style: z.enum(CTA_STYLES).optional(),
  label: z.string().max(60).optional(),
  liveBadge: z.boolean().optional(),
});

const GenSectionSchema = z.object({
  kind: z.enum(SECTION_KINDS),
  visible: z.boolean().optional(),
  variant: z.string(),
  background: z.enum(BACKGROUNDS).optional(),
  emphasis: z.enum(EMPHASES).optional(),
  align: z.enum(ALIGNMENTS).optional(),
  copy: z
    .object({
      eyebrow: z.string().max(60).optional(),
      headline: z.string().max(140).optional(),
      tagline: z.string().max(280).optional(),
    })
    .optional(),
  ctas: z.array(GenCtaSchema).max(4).optional(),
});

const GenBriefSchema = z.object({
  brand: BrandSchema,
  sections: z.array(GenSectionSchema).min(3).max(14),
});

/* --- grounding context -------------------------------------------------- */

const money = (price: any, currency?: string | null, isFree?: any) =>
  isFree || Number(price) === 0 ? "Free" : `${currency || "USD"} ${price}`;

/** Compact, readable summary of the creator's REAL data, incl. entity ids so
 *  the model can wire typed CTAs to actual sessions/events/products. */
function groundingContext(bundle: BriefBundle): string {
  const p = bundle.profile;
  const lines: string[] = [];
  lines.push(`NAME: ${p.displayName || p.username}`);
  if (p.title) lines.push(`TITLE: ${p.title}`);
  const bio = p.shortBio || p.longBio || p.bio;
  if (bio) lines.push(`BIO: ${String(bio).slice(0, 600)}`);

  const social = Object.entries(p.socialLinks ?? {})
    .filter(([, v]) => !!v)
    .map(([k]) => k);
  for (const s of p.contactInfo?.socialMediaLinks ?? []) social.push(String(s.platform));
  if (social.length) lines.push(`SOCIAL: ${Array.from(new Set(social)).join(", ")}`);

  const contacts: string[] = [];
  if (p.contactInfo?.whatsapp || p.socialLinks?.whatsapp) contacts.push("whatsapp");
  if (p.contactInfo?.email) contacts.push("email");
  if (p.contactInfo?.phone) contacts.push("phone");
  if (contacts.length) lines.push(`CONTACT METHODS: ${contacts.join(", ")}`);

  if (bundle.sessions.length) {
    lines.push(`\nSESSIONS (kind "book", use sessionId):`);
    for (const s of bundle.sessions.slice(0, 10))
      lines.push(`  - id ${(s as any).id}: "${(s as any).title}" — ${money((s as any).price, (s as any).currency, (s as any).isFree)}`);
  }
  if (bundle.events.length) {
    lines.push(`\nEVENTS (kind "registerEvent", use eventId):`);
    for (const e of bundle.events.slice(0, 10))
      lines.push(`  - id ${(e as any).id}: "${(e as any).title}" — ${money((e as any).price, (e as any).currency, (e as any).pricingType === "free")}`);
  }
  if (bundle.products.length) {
    lines.push(`\nDIGITAL PRODUCTS (kind "buyDigital", use productId):`);
    for (const d of bundle.products.slice(0, 10))
      lines.push(`  - id ${(d as any).id}: "${(d as any).title}" — ${money((d as any).price, (d as any).currency, (d as any).isFree)}`);
  }
  if (bundle.physicalProducts.length) {
    lines.push(`\nPHYSICAL PRODUCTS (kind "buyPhysical", use productId):`);
    for (const d of bundle.physicalProducts.slice(0, 10))
      lines.push(`  - id ${(d as any).id}: "${(d as any).title}" — ${money((d as any).price, (d as any).currency)}`);
  }
  if (bundle.blogs.length) lines.push(`\nBLOG POSTS: ${bundle.blogs.length} (kind "blog")`);
  if (p.galleryImages?.length) lines.push(`GALLERY IMAGES: ${p.galleryImages.length} (kind "gallery")`);
  if (p.testimonials?.length) lines.push(`TESTIMONIALS: ${p.testimonials.length} (kind "testimonials")`);

  return lines.join("\n");
}

const SYSTEM_PROMPT = `You are an award-winning brand & web art director designing a creator's public profile page. Your output is a Design Brief — a brand world + an ORDERED list of sections + typed CTA actions. A platform renderer turns it into the real page using the creator's LIVE data. You never write website code or real content.

THINK LIKE A DESIGNER FIRST. Silently commit to ONE cohesive art-direction archetype that fits THIS person and craft, then make every field express it. Reference archetypes (don't just copy):
- Warm Editorial — serif headings (fraunces/playfair/lora), airy spacing, cream/sand surfaces, calm and human.
- Bold Modern — grotesk/sora/space-grotesk headings, high-contrast palette, tight confident spacing.
- Quiet Luxe — restrained neutrals + one refined accent, spacious, small-caps eyebrows, slight radius.
- Vibrant Creator — saturated primary+accent, rounded radius, energetic background rhythm.
A grief coach and a startup mentor must feel like DIFFERENT WORLDS.

HARD RULES (safety — violating these breaks the page):
- Use ONLY section kinds the creator has data for. Always allowed: hero, about, cta, contact, footer. Data sections (sessions, events, products, physicalProducts, blog, gallery, testimonials) ONLY if present in the data below.
- NEVER invent prices, testimonials, names, dates, or facts. The ONLY text you write is short connective copy: copy.eyebrow (2-4 word kicker), copy.headline (a section title), copy.tagline (one supporting line). Ground every word in who this person is.
- Wire CTAs as typed actions to the REAL ids given (book→sessionId, registerEvent→eventId, buyDigital/buyPhysical→productId). Add a low-friction CTA (whatsapp/contact) ONLY if that method exists.

MAKE IT FEEL DESIGNED (the quality bar — this is what matters most):
- HERO: choose a treatment via variant — "feature" (full-bleed photo) only if a strong profile image is implied; otherwise "spotlight", "split", or "centered". Give it an eyebrow, a punchy headline, a one-line tagline, and 1-2 CTAs (a primary action + a low-friction one).
- EVERY data section: write copy.eyebrow + copy.headline + copy.tagline, and pick a variant deliberately for meaning — e.g. testimonials "quote" for intimacy, products "showcase" to feature a flagship, events "agenda" for a schedule, gallery "masonry" for a portfolio feel.
- RHYTHM: alternate section backgrounds across the page (none / surface, with an occasional "gradient" or "accent" for one feature moment). Pick exactly ONE lead section (emphasis "lead"); make closers "quiet".
- CLOSE STRONG: add a "cta" section (variant "band") near the end that restates the primary action, then "contact", then "footer".
- BRAND: 6 hex colors with strong, accessible contrast (body text must be readable on background; primary must be readable when used as a button). Choose a heading/body font pairing from the set that matches the archetype.

Be decisive. Output strictly matches the provided schema.`;

/** Full generation (Opus). Returns a safe, normalized PageBrief + token usage. */
export async function generateBrief(
  bundle: BriefBundle,
  styleHint?: string,
): Promise<{ brief: PageBrief; model: string; inputTokens?: number; outputTokens?: number }> {
  const prompt =
    `Design the Brief for this creator using ONLY the data below.\n\n` +
    (styleHint ? `Creator's stated preference (honor it): ${styleHint}\n\n` : "") +
    `--- CREATOR DATA ---\n${groundingContext(bundle)}\n--- END DATA ---`;

  assertAiConfigured();

  const { object, usage } = await generateObject({
    model: anthropic(GEN_MODEL),
    schema: GenBriefSchema,
    system: SYSTEM_PROMPT,
    prompt,
    maxOutputTokens: 6000,
  });

  // The normalizer assigns stable ids, enforces enums, and drops any CTA whose
  // entity doesn't resolve. The polish pass then guarantees structural cohesion
  // (order, background rhythm, section intros) so the FIRST result needs no
  // editing. If the model produced nothing usable, fall back to the deterministic
  // builder (also polished).
  let brief: PageBrief;
  try {
    brief = polishBrief(normalizeBrief(object, bundle), bundle);
  } catch {
    brief = polishBrief(briefFromProfile(bundle), bundle);
  }
  return {
    brief,
    model: GEN_MODEL,
    inputTokens: (usage as any)?.inputTokens,
    outputTokens: (usage as any)?.outputTokens,
  };
}

const EDIT_SYSTEM = `You are a brand art director making a SCOPED edit to ONE section of an existing Design Brief, following the creator's instruction. Keep everything that isn't relevant unchanged. Do not invent content — only adjust direction (variant, emphasis, background, short connective copy, CTA styling). Output strictly matches the schema for a single section.`;

/** Scoped edit of a single section (cheap/fast model). Returns the updated,
 *  normalized full Brief. */
export async function editSection(
  bundle: BriefBundle,
  current: PageBrief,
  sectionId: string,
  instruction: string,
): Promise<{ brief: PageBrief; model: string }> {
  assertAiConfigured();

  const target = current.sections.find((s) => s.id === sectionId);
  if (!target) throw new Error("Section not found");

  const { object } = await generateObject({
    model: anthropic(EDIT_MODEL),
    schema: GenSectionSchema,
    system: EDIT_SYSTEM,
    prompt:
      `Instruction: ${instruction}\n\n` +
      `Current section (kind "${target.kind}", variant "${target.variant}"):\n` +
      `${JSON.stringify({ variant: target.variant, background: target.background, emphasis: target.emphasis, copy: target.copy }, null, 2)}\n\n` +
      `Allowed variants for "${target.kind}" are limited; pick a sensible one. Brief context: this is a ${current.sections.length}-section page.`,
    maxOutputTokens: 800,
  });

  // Merge the edited fields back onto the existing section (preserve id + ctas
  // unless the model returned new ones), then re-normalize the whole Brief.
  const merged: Section = {
    ...target,
    variant: (object as any).variant ?? target.variant,
    background: (object as any).background ?? target.background,
    emphasis: (object as any).emphasis ?? target.emphasis,
    align: (object as any).align ?? target.align,
    copy: (object as any).copy ?? target.copy,
    ctas: (object as any).ctas ?? target.ctas,
  };
  const nextSections = current.sections.map((s) => (s.id === sectionId ? merged : s));
  const brief = normalizeBrief({ ...current, sections: nextSections }, bundle);
  return { brief, model: EDIT_MODEL };
}
