// server/brief/normalize.ts
//
// The safety gate. Runs on EVERY write path (PUT draft, publish, AI generate /
// regenerate). Guarantees a structurally valid PageBrief that can never render a
// broken page or a dead button — regardless of whether the input came from the
// editor or a model.
//
// Strategy: repair field-by-field against the closed enums in shared/brief.ts,
// rather than reject-on-first-error. Only if NOTHING valid remains do we throw,
// so the caller can fall back to briefFromProfile().

import { randomUUID } from "node:crypto";
import {
  BACKGROUNDS,
  BRIEF_SCHEMA_VERSION,
  CTA_PRESENTATIONS,
  CTA_STYLES,
  DEFAULT_BRAND,
  DEFAULT_PALETTE,
  EMPHASES,
  FONT_IDS,
  RADII,
  SCALES,
  SECTION_KINDS,
  SECTION_VARIANTS,
  SPACINGS,
  defaultVariant,
  isTransactionalAction,
  type Brand,
  type Cta,
  type CtaAction,
  type PageBrief,
  type Palette,
  type Section,
  type SectionKind,
} from "@shared/brief";
import type { BriefBundle } from "./bundle";

const MAX_SECTIONS = 20;
const MAX_CTAS = 4;
const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const oneOf = <T extends readonly string[]>(
  v: unknown,
  allowed: T,
  fallback: T[number],
): T[number] => (typeof v === "string" && allowed.includes(v) ? (v as T[number]) : fallback);

const str = (v: unknown, max: number): string | undefined => {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t.slice(0, max) : undefined;
};

function repairPalette(input: any): Palette {
  const p: any = { ...DEFAULT_PALETTE };
  for (const key of Object.keys(DEFAULT_PALETTE) as (keyof Palette)[]) {
    const v = input?.[key];
    p[key] = typeof v === "string" && HEX_RE.test(v) ? v : DEFAULT_PALETTE[key];
  }
  return p as Palette;
}

function repairBrand(input: any): Brand {
  if (!input || typeof input !== "object") return DEFAULT_BRAND;
  return {
    palette: repairPalette(input.palette),
    typography: {
      heading: oneOf(input.typography?.heading, FONT_IDS, DEFAULT_BRAND.typography.heading),
      body: oneOf(input.typography?.body, FONT_IDS, DEFAULT_BRAND.typography.body),
      scale: oneOf(input.typography?.scale, SCALES, "normal"),
    },
    radius: oneOf(input.radius, RADII, DEFAULT_BRAND.radius),
    spacing: oneOf(input.spacing, SPACINGS, DEFAULT_BRAND.spacing),
    mood: Array.isArray(input.mood)
      ? input.mood
          .filter((m: unknown) => typeof m === "string")
          .map((m: string) => m.slice(0, 40))
          .slice(0, 8)
      : undefined,
  };
}

/** Resolve a typed CTA action against live data; return null to drop it. */
function resolveAction(a: any, ctx: ResolveCtx): CtaAction | null {
  if (!a || typeof a !== "object" || typeof a.kind !== "string") return null;
  const kind = a.kind;
  switch (kind) {
    case "book":
      return ctx.sessionIds.has(Number(a.sessionId))
        ? { kind, sessionId: Number(a.sessionId) }
        : null;
    case "registerEvent":
      return ctx.eventIds.has(Number(a.eventId))
        ? { kind, eventId: Number(a.eventId) }
        : null;
    case "buyDigital":
      return ctx.digitalIds.has(Number(a.productId))
        ? { kind, productId: Number(a.productId) }
        : null;
    case "buyPhysical":
      return ctx.physicalIds.has(Number(a.productId))
        ? { kind, productId: Number(a.productId) }
        : null;
    case "contact":
      return { kind };
    case "whatsapp":
      return ctx.hasWhatsapp ? { kind } : null;
    case "social": {
      const platform = str(a.platform, 40);
      return platform && ctx.socialPlatforms.has(platform.toLowerCase())
        ? { kind, platform: platform.toLowerCase() }
        : null;
    }
    case "captureLead":
      return { kind, listId: str(a.listId, 80) };
    case "waitlist": {
      const sessionId = a.sessionId != null ? Number(a.sessionId) : undefined;
      const eventId = a.eventId != null ? Number(a.eventId) : undefined;
      // Keep only if it points at a resolvable entity (or neither — generic).
      if (sessionId != null && !ctx.sessionIds.has(sessionId)) return null;
      if (eventId != null && !ctx.eventIds.has(eventId)) return null;
      return { kind, sessionId, eventId };
    }
    default:
      return null;
  }
}

function repairCtas(input: any, ctx: ResolveCtx): Cta[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const out: Cta[] = [];
  for (const raw of input) {
    const action = resolveAction(raw?.action, ctx);
    if (!action) continue; // drop unresolvable / dead CTAs
    out.push({
      id: typeof raw?.id === "string" && raw.id ? raw.id : randomUUID(),
      action,
      presentation: oneOf(raw?.presentation, CTA_PRESENTATIONS, "modal"),
      style: oneOf(raw?.style, CTA_STYLES, "filled"),
      label: str(raw?.label, 60),
      liveBadge: raw?.liveBadge === true ? true : undefined,
    });
    if (out.length >= MAX_CTAS) break;
  }
  return out.length ? out : undefined;
}

function repairSection(input: any, ctx: ResolveCtx): Section | null {
  const kind = input?.kind;
  if (typeof kind !== "string" || !SECTION_KINDS.includes(kind as SectionKind)) return null;
  const k = kind as SectionKind;
  const allowedVariants = SECTION_VARIANTS[k];
  const variant =
    typeof input.variant === "string" && allowedVariants.includes(input.variant)
      ? input.variant
      : defaultVariant(k);

  // Every section can carry a short connective intro (eyebrow/headline/tagline).
  // This is branded section copy ("What I offer"), never invented content —
  // prices/testimonials/names still come from live data at render time.
  let copy: Section["copy"];
  if (input.copy && typeof input.copy === "object") {
    const eyebrow = str(input.copy.eyebrow, 60);
    const headline = str(input.copy.headline, 140);
    const tagline = str(input.copy.tagline, 280);
    if (eyebrow || headline || tagline) copy = { eyebrow, headline, tagline };
  }

  const align =
    input.align === "left" || input.align === "center" ? input.align : undefined;

  return {
    id: typeof input.id === "string" && input.id ? input.id : randomUUID(),
    kind: k,
    visible: input.visible !== false,
    variant,
    background: oneOf(input.background, BACKGROUNDS, "none"),
    emphasis: oneOf(input.emphasis, EMPHASES, "normal"),
    align,
    copy,
    ctas: repairCtas(input.ctas, ctx),
  };
}

interface ResolveCtx {
  sessionIds: Set<number>;
  eventIds: Set<number>;
  digitalIds: Set<number>;
  physicalIds: Set<number>;
  hasWhatsapp: boolean;
  socialPlatforms: Set<string>;
}

function buildCtx(bundle: BriefBundle): ResolveCtx {
  const p = bundle.profile;
  const whatsapp =
    p.contactInfo?.whatsapp ||
    p.socialLinks?.whatsapp ||
    p.contactInfo?.callToAction?.whatsAppNumber ||
    "";
  const socialPlatforms = new Set<string>();
  for (const s of p.contactInfo?.socialMediaLinks ?? []) {
    if (s?.platform) socialPlatforms.add(String(s.platform).toLowerCase());
  }
  for (const key of ["instagram", "youtube", "linkedin"] as const) {
    if (p.socialLinks?.[key]) socialPlatforms.add(key);
  }
  return {
    sessionIds: new Set(bundle.sessions.map((s: any) => s.id)),
    eventIds: new Set(bundle.events.map((e: any) => e.id)),
    digitalIds: new Set(bundle.products.map((d: any) => d.id)),
    physicalIds: new Set(bundle.physicalProducts.map((d: any) => d.id)),
    hasWhatsapp: !!whatsapp.trim(),
    socialPlatforms,
  };
}

/**
 * Normalize + validate any Brief-shaped input into a guaranteed-safe PageBrief.
 * Throws only if no valid section survives (caller should fall back to
 * briefFromProfile()).
 */
export function normalizeBrief(input: unknown, bundle: BriefBundle): PageBrief {
  const obj = (input ?? {}) as any;
  const ctx = buildCtx(bundle);

  const brand = repairBrand(obj.brand);

  const rawSections = Array.isArray(obj.sections) ? obj.sections : [];
  const sections: Section[] = [];
  const seenIds = new Set<string>();
  for (const raw of rawSections) {
    const s = repairSection(raw, ctx);
    if (!s) continue;
    if (seenIds.has(s.id)) s.id = randomUUID();
    seenIds.add(s.id);
    sections.push(s);
    if (sections.length >= MAX_SECTIONS) break;
  }

  if (sections.length === 0) {
    throw new Error("Brief has no valid sections");
  }

  return {
    schemaVersion: BRIEF_SCHEMA_VERSION,
    brand,
    sections,
  };
}
