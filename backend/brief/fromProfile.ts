// server/brief/fromProfile.ts
//
// Deterministic, no-AI builder: expresses (roughly) TODAY'S profile layout as a
// PageBrief. This serves two roles:
//   1. Migration / onboarding seed — every existing creator gets a valid Brief
//      instantly, so the editor and renderer always have something to work with.
//   2. Render-time safety fallback — if a published Brief is ever invalid, the
//      renderer falls back to this, which mirrors what visitors already see.
//
// Adoption risk is zero: until a creator explicitly publishes, this is only used
// as a draft/seed, and the public page keeps rendering exactly as it does today.

import { randomUUID } from "node:crypto";
import {
  BRIEF_SCHEMA_VERSION,
  DEFAULT_BRAND,
  defaultCtaLabel,
  defaultVariant,
  type Cta,
  type CtaAction,
  type PageBrief,
  type Section,
  type SectionKind,
} from "@shared/brief";
import type { BriefBundle } from "./bundle";

const has = (arr?: unknown[] | null) => Array.isArray(arr) && arr.length > 0;

function pickId<T extends { id: number; isFeatured?: boolean | null }>(
  rows: T[],
): number | null {
  if (!rows.length) return null;
  const featured = rows.find((r) => r.isFeatured);
  return (featured ?? rows[0]).id;
}

/** Choose the single most valuable primary action for the hero. */
function primaryAction(bundle: BriefBundle): CtaAction | null {
  const s = pickId(bundle.sessions as any);
  if (s != null) return { kind: "book", sessionId: s };
  const e = pickId(bundle.events as any);
  if (e != null) return { kind: "registerEvent", eventId: e };
  const p = pickId(bundle.products as any);
  if (p != null) return { kind: "buyDigital", productId: p };
  const pp = pickId(bundle.physicalProducts as any);
  if (pp != null) return { kind: "buyPhysical", productId: pp };
  return { kind: "contact" };
}

function cta(action: CtaAction, style: Cta["style"], liveBadge = false): Cta {
  return {
    id: randomUUID(),
    action,
    presentation: "modal",
    style,
    label: defaultCtaLabel(action),
    liveBadge,
  };
}

export function briefFromProfile(bundle: BriefBundle): PageBrief {
  const { profile } = bundle;
  const sections: Section[] = [];

  const push = (
    kind: SectionKind,
    opts: Partial<Omit<Section, "id" | "kind">> = {},
  ) => {
    sections.push({
      id: randomUUID(),
      kind,
      visible: opts.visible ?? true,
      variant: opts.variant ?? defaultVariant(kind),
      background: opts.background ?? "none",
      emphasis: opts.emphasis ?? "normal",
      copy: opts.copy,
      ctas: opts.ctas,
    });
  };

  // Hero — always present. Headline = name; tagline = title/short bio.
  const whatsapp = (
    profile.contactInfo?.whatsapp ||
    profile.socialLinks?.whatsapp ||
    profile.contactInfo?.callToAction?.whatsAppNumber ||
    ""
  ).trim();
  const heroCtas: Cta[] = [];
  const primary = primaryAction(bundle);
  if (primary) heroCtas.push(cta(primary, "filled", true));
  if (whatsapp) heroCtas.push(cta({ kind: "whatsapp" }, "outlined"));

  push("hero", {
    variant: "centered",
    emphasis: "lead",
    copy: {
      headline: profile.displayName || profile.username,
      tagline: profile.title || profile.shortBio || undefined,
    },
    ctas: heroCtas,
  });

  // About — only if there's a real bio to anchor it.
  const aboutText = profile.longBio || profile.shortBio || profile.bio;
  if (aboutText && aboutText.trim()) {
    push("about", {
      variant: profile.longBioImageUrl || profile.shortBioImageUrl ? "imageLeft" : "text",
      background: "surface",
    });
  }

  // Data sections — included only when the underlying data exists today.
  if (has(bundle.sessions)) push("sessions", { variant: "cards" });
  if (has(bundle.events)) push("events", { variant: "cards" });
  if (has(bundle.products)) push("products", { variant: "grid" });
  if (has(bundle.physicalProducts)) push("physicalProducts", { variant: "grid" });
  if (has(bundle.blogs)) push("blog", { variant: "cards", background: "surface" });
  if (has(profile.galleryImages)) push("gallery", { variant: "grid" });
  if (has(profile.testimonials)) push("testimonials", { variant: "cards", background: "surface" });

  // Contact — always present (the contact form + links always work).
  const contactCtas: Cta[] = [];
  if (whatsapp) contactCtas.push(cta({ kind: "whatsapp" }, "filled"));
  contactCtas.push(cta({ kind: "contact" }, whatsapp ? "outlined" : "filled"));
  push("contact", { variant: "card", background: "surface", ctas: contactCtas });

  // Footer — always present.
  push("footer", { variant: "simple" });

  return {
    schemaVersion: BRIEF_SCHEMA_VERSION,
    brand: DEFAULT_BRAND,
    sections,
  };
}
