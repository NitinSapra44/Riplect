// shared/brief.ts
//
// The Design Brief — the single source of truth for the AI Profile feature.
//
// A Brief is a small JSON document that drives a creator's public page:
//   brand (colors / fonts / spacing) + an ordered list of sections bound to
//   LIVE data + typed CTA actions. It is NOT generated HTML and it does NOT
//   contain content (sessions, prices, testimonials). The renderer pulls all
//   real content live from the existing /api/profiles/:username/* endpoints.
//
// Everything here is a closed enum or a typed action, so neither the AI nor the
// creator can emit a broken page. This module is imported by:
//   - the deterministic builder (server/brief/fromProfile.ts)
//   - the safety gate          (server/brief/normalize.ts)
//   - the AI generator         (server/brief/generate.ts)
//   - the renderer + editor    (frontend/src/components/brief/*, site-studio.tsx)
//
// Keep it dependency-light: only `zod`. No DB, no React.

import { z } from "zod";

export const BRIEF_SCHEMA_VERSION = 1 as const;

/* -------------------------------------------------------------------------- */
/*  Fonts                                                                      */
/* -------------------------------------------------------------------------- */
// A curated, pairing-friendly font set. BrandProvider injects a Google Fonts
// <link> only for the chosen heading/body fonts. `family` is the CSS value the
// renderer writes into `--rk-font-*`; `google` is the Google Fonts family spec.

export interface FontDef {
  id: string;
  label: string;
  family: string; // CSS font-family stack
  google: string | null; // Google Fonts "family" query value, or null if system
  category: "sans" | "serif";
}

export const FONTS = {
  "plus-jakarta": {
    id: "plus-jakarta",
    label: "Plus Jakarta Sans",
    family: '"Plus Jakarta Sans", system-ui, -apple-system, sans-serif',
    google: "Plus+Jakarta+Sans:wght@400;500;600;700;800",
    category: "sans",
  },
  inter: {
    id: "inter",
    label: "Inter",
    family: '"Inter", system-ui, -apple-system, sans-serif',
    google: "Inter:wght@400;500;600;700;800",
    category: "sans",
  },
  "dm-sans": {
    id: "dm-sans",
    label: "DM Sans",
    family: '"DM Sans", system-ui, sans-serif',
    google: "DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700",
    category: "sans",
  },
  "space-grotesk": {
    id: "space-grotesk",
    label: "Space Grotesk",
    family: '"Space Grotesk", system-ui, sans-serif',
    google: "Space+Grotesk:wght@400;500;600;700",
    category: "sans",
  },
  sora: {
    id: "sora",
    label: "Sora",
    family: '"Sora", system-ui, sans-serif',
    google: "Sora:wght@400;500;600;700;800",
    category: "sans",
  },
  epilogue: {
    id: "epilogue",
    label: "Epilogue",
    family: '"Epilogue", system-ui, sans-serif',
    google: "Epilogue:wght@400;500;600;700;800",
    category: "sans",
  },
  fraunces: {
    id: "fraunces",
    label: "Fraunces",
    family: '"Fraunces", Georgia, serif',
    google: "Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700",
    category: "serif",
  },
  playfair: {
    id: "playfair",
    label: "Playfair Display",
    family: '"Playfair Display", Georgia, serif',
    google: "Playfair+Display:wght@400;500;600;700;800",
    category: "serif",
  },
  lora: {
    id: "lora",
    label: "Lora",
    family: '"Lora", Georgia, serif',
    google: "Lora:wght@400;500;600;700",
    category: "serif",
  },
  spectral: {
    id: "spectral",
    label: "Spectral",
    family: '"Spectral", Georgia, serif',
    google: "Spectral:wght@400;500;600;700",
    category: "serif",
  },
  "ibm-plex-serif": {
    id: "ibm-plex-serif",
    label: "IBM Plex Serif",
    family: '"IBM Plex Serif", Georgia, serif',
    google: "IBM+Plex+Serif:wght@400;500;600;700",
    category: "serif",
  },
} as const satisfies Record<string, FontDef>;

export type FontId = keyof typeof FONTS;
export const FONT_IDS = Object.keys(FONTS) as [FontId, ...FontId[]];
export const DEFAULT_HEADING_FONT: FontId = "plus-jakarta";
export const DEFAULT_BODY_FONT: FontId = "plus-jakarta";

/* -------------------------------------------------------------------------- */
/*  Section kinds & per-kind variants                                          */
/* -------------------------------------------------------------------------- */
// Sections name Riplek content types — not generic marketing blocks. Each kind
// has a small, closed set of named layout variants. Variety x palette = pages
// that read as different worlds, while every class stays precompiled by Tailwind.

export const SECTION_KINDS = [
  "hero",
  "about",
  "sessions",
  "events",
  "products",
  "physicalProducts",
  "blog",
  "gallery",
  "testimonials",
  "cta",
  "contact",
  "footer",
] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];

export const SECTION_VARIANTS: Record<SectionKind, readonly string[]> = {
  hero: ["centered", "split", "minimal", "spotlight", "feature"],
  about: ["text", "imageLeft", "imageRight", "quote"],
  sessions: ["cards", "list", "spotlight"],
  events: ["cards", "list", "agenda"],
  products: ["grid", "list", "showcase"],
  physicalProducts: ["grid", "list"],
  blog: ["cards", "list", "feature"],
  gallery: ["grid", "masonry", "strip"],
  testimonials: ["cards", "carousel", "quote"],
  cta: ["band", "split", "minimal"],
  contact: ["card", "split", "minimal"],
  footer: ["simple", "centered"],
} as const;

/** Sections that carry writable connective copy (headline/tagline/eyebrow).
 *  Every section can now hold a short branded intro; data sections use it as a
 *  section header ("What I offer"), never as invented content. */
export const COPY_SECTION_KINDS: SectionKind[] = [...SECTION_KINDS];

/** Section kinds that bind to list data and self-hide when their data is empty. */
export const DATA_SECTION_KINDS: SectionKind[] = [
  "sessions",
  "events",
  "products",
  "physicalProducts",
  "blog",
  "gallery",
  "testimonials",
];

export const defaultVariant = (kind: SectionKind): string =>
  SECTION_VARIANTS[kind][0];

/* -------------------------------------------------------------------------- */
/*  Enums                                                                       */
/* -------------------------------------------------------------------------- */

export const BACKGROUNDS = ["none", "surface", "accent", "gradient"] as const;
export const EMPHASES = ["lead", "normal", "quiet"] as const;
export const SCALES = ["compact", "normal", "spacious"] as const;
export const RADII = ["none", "slight", "rounded", "full"] as const;
export const SPACINGS = ["tight", "normal", "airy"] as const;
export const CTA_PRESENTATIONS = ["inline", "modal", "navigate"] as const;
export const CTA_STYLES = ["filled", "outlined", "ghost", "link"] as const;

export type Background = (typeof BACKGROUNDS)[number];
export type Emphasis = (typeof EMPHASES)[number];
export type Scale = (typeof SCALES)[number];
export type Radius = (typeof RADII)[number];
export type Spacing = (typeof SPACINGS)[number];
export type CtaPresentation = (typeof CTA_PRESENTATIONS)[number];
export type CtaStyle = (typeof CTA_STYLES)[number];

/* -------------------------------------------------------------------------- */
/*  Typed CTA actions                                                           */
/* -------------------------------------------------------------------------- */
// A CTA is a typed action + a presentation mode — never a raw href. The action
// says what it DOES; the presentation says where the (existing) flow renders.
// The validator drops any transactional action whose entity doesn't resolve, so
// there are never dead buttons.

export const CtaActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("book"), sessionId: z.number().int() }),
  z.object({ kind: z.literal("registerEvent"), eventId: z.number().int() }),
  z.object({ kind: z.literal("buyDigital"), productId: z.number().int() }),
  z.object({ kind: z.literal("buyPhysical"), productId: z.number().int() }),
  z.object({ kind: z.literal("contact") }),
  z.object({ kind: z.literal("whatsapp") }),
  z.object({ kind: z.literal("social"), platform: z.string().min(1).max(40) }),
  z.object({ kind: z.literal("captureLead"), listId: z.string().max(80).optional() }),
  z.object({
    kind: z.literal("waitlist"),
    sessionId: z.number().int().optional(),
    eventId: z.number().int().optional(),
  }),
]);
export type CtaAction = z.infer<typeof CtaActionSchema>;
export type CtaActionKind = CtaAction["kind"];

/** Actions that move money / register a person and must resolve to a real entity. */
export const TRANSACTIONAL_KINDS: CtaActionKind[] = [
  "book",
  "registerEvent",
  "buyDigital",
  "buyPhysical",
];

export const isTransactionalAction = (a: CtaAction): boolean =>
  TRANSACTIONAL_KINDS.includes(a.kind);

export const CtaSchema = z.object({
  id: z.string(),
  action: CtaActionSchema,
  presentation: z.enum(CTA_PRESENTATIONS).default("modal"),
  style: z.enum(CTA_STYLES).default("filled"),
  label: z.string().max(60).optional(),
  liveBadge: z.boolean().optional(),
});
export type Cta = z.infer<typeof CtaSchema>;

/** Smart default label per action kind (used when `label` is unset). */
export function defaultCtaLabel(action: CtaAction): string {
  switch (action.kind) {
    case "book":
      return "Book a session";
    case "registerEvent":
      return "Register";
    case "buyDigital":
      return "Get it";
    case "buyPhysical":
      return "Buy now";
    case "contact":
      return "Get in touch";
    case "whatsapp":
      return "Message on WhatsApp";
    case "social":
      return `Follow on ${action.platform}`;
    case "captureLead":
      return "Stay in the loop";
    case "waitlist":
      return "Join the waitlist";
    default:
      return "Learn more";
  }
}

/* -------------------------------------------------------------------------- */
/*  Brand                                                                       */
/* -------------------------------------------------------------------------- */

const hex = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "must be a hex color");

export const PaletteSchema = z.object({
  background: hex,
  surface: hex,
  text: hex,
  muted: hex,
  primary: hex,
  accent: hex,
});
export type Palette = z.infer<typeof PaletteSchema>;

export const BrandSchema = z.object({
  palette: PaletteSchema,
  typography: z.object({
    heading: z.enum(FONT_IDS),
    body: z.enum(FONT_IDS),
    scale: z.enum(SCALES).default("normal"),
  }),
  radius: z.enum(RADII).default("rounded"),
  spacing: z.enum(SPACINGS).default("normal"),
  mood: z.array(z.string().max(40)).max(8).optional(),
});
export type Brand = z.infer<typeof BrandSchema>;

/* -------------------------------------------------------------------------- */
/*  Section & PageBrief                                                          */
/* -------------------------------------------------------------------------- */

export const ALIGNMENTS = ["left", "center"] as const;
export type Alignment = (typeof ALIGNMENTS)[number];

export const SectionSchema = z.object({
  id: z.string(),
  kind: z.enum(SECTION_KINDS),
  visible: z.boolean().default(true),
  variant: z.string(),
  background: z.enum(BACKGROUNDS).default("none"),
  emphasis: z.enum(EMPHASES).default("normal"),
  align: z.enum(ALIGNMENTS).optional(),
  copy: z
    .object({
      // `eyebrow` = a short kicker above the heading (e.g. "OFFERINGS").
      // `headline` = the section title. `tagline` = a one-line subhead.
      eyebrow: z.string().max(60).optional(),
      headline: z.string().max(140).optional(),
      tagline: z.string().max(280).optional(),
    })
    .optional(),
  ctas: z.array(CtaSchema).max(4).optional(),
});
export type Section = z.infer<typeof SectionSchema>;

export const PageBriefSchema = z.object({
  schemaVersion: z.literal(BRIEF_SCHEMA_VERSION),
  brand: BrandSchema,
  sections: z.array(SectionSchema).min(1).max(20),
});
export type PageBrief = z.infer<typeof PageBriefSchema>;

/* -------------------------------------------------------------------------- */
/*  Safe defaults (used by the normalizer to repair invalid fields)             */
/* -------------------------------------------------------------------------- */

export const DEFAULT_PALETTE: Palette = {
  background: "#ffffff",
  surface: "#faf6f1",
  text: "#1a1614",
  muted: "#6b6661",
  primary: "#b66667",
  accent: "#c98a6a",
};

export const DEFAULT_BRAND: Brand = {
  palette: DEFAULT_PALETTE,
  typography: { heading: DEFAULT_HEADING_FONT, body: DEFAULT_BODY_FONT, scale: "normal" },
  radius: "rounded",
  spacing: "normal",
};
