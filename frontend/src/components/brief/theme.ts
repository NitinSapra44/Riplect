// client/src/components/brief/theme.ts
//
// Pure helpers that translate the Brief's closed enums into a FIXED set of
// CSS-variable values and Tailwind class strings. No runtime CSS generation —
// every class here is a literal Tailwind class that already exists in the build.
//
// The headline promise ("pick one color → the whole page re-themes") works
// because BrandProvider writes these variables onto a scoped wrapper, and both
// the new blocks (via --rk-*) and the reused shadcn components (via --primary /
// --accent) read from them.

import type { CSSProperties } from "react";
import {
  FONTS,
  type Brand,
  type CtaStyle,
  type Emphasis,
  type FontId,
  type Radius,
  type Scale,
  type Spacing,
  type Background,
} from "@shared/brief";

/* --- color math -------------------------------------------------------- */

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Relative luminance → pick black or white text that stays readable. */
export function readableOn(hex: string): string {
  try {
    const [r, g, b] = hexToRgb(hex).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return L > 0.45 ? "#16130f" : "#ffffff";
  } catch {
    return "#ffffff";
  }
}

/** Translucent version of a hex color (for soft accent backgrounds). */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* --- fonts -------------------------------------------------------------- */

export const fontFamily = (id: FontId): string => FONTS[id]?.family ?? FONTS["plus-jakarta"].family;

/** Build a single Google Fonts stylesheet href for the chosen fonts. */
export function googleFontsHref(ids: FontId[]): string | null {
  const families = Array.from(new Set(ids)).flatMap((id) => {
    const g = FONTS[id]?.google;
    return g ? [g] : [];
  });
  if (!families.length) return null;
  return `https://fonts.googleapis.com/css2?${families
    .map((f) => `family=${f}`)
    .join("&")}&display=swap`;
}

/* --- radius / spacing --------------------------------------------------- */

const RADIUS_PX: Record<Radius, string> = {
  none: "0px",
  slight: "8px",
  rounded: "16px",
  full: "28px",
};
export const radiusValue = (r: Radius) => RADIUS_PX[r];

/* --- brand → CSS variables --------------------------------------------- */

/**
 * Produce the inline style object BrandProvider sets on its wrapper. Writes both
 * the feature's own --rk-* tokens AND a scoped override of the shadcn color
 * variables (--primary / --secondary / --accent + foregrounds), which are stored
 * as raw hex in this codebase — so reused components re-theme too.
 */
export function brandToCssVars(brand: Brand): CSSProperties {
  const p = brand.palette;
  const primaryFg = readableOn(p.primary);
  const accentFg = readableOn(p.accent);
  const border = withAlpha(p.text, 0.1);
  return {
    // feature tokens (new blocks)
    ["--rk-bg" as any]: p.background,
    ["--rk-surface" as any]: p.surface,
    ["--rk-text" as any]: p.text,
    ["--rk-muted" as any]: p.muted,
    ["--rk-primary" as any]: p.primary,
    ["--rk-primary-fg" as any]: primaryFg,
    ["--rk-accent" as any]: p.accent,
    ["--rk-accent-fg" as any]: accentFg,
    ["--rk-accent-soft" as any]: withAlpha(p.accent, 0.12),
    ["--rk-primary-soft" as any]: withAlpha(p.primary, 0.1),
    ["--rk-border" as any]: border,
    ["--rk-radius" as any]: radiusValue(brand.radius),
    ["--rk-font-heading" as any]: fontFamily(brand.typography.heading),
    ["--rk-font-body" as any]: fontFamily(brand.typography.body),
    // Scoped override of the FULL shadcn token set (these are wired to Tailwind
    // utilities like bg-card / bg-muted / border-border / rounded-lg). Because the
    // existing section components are tokenized (W3), this re-themes them inside the
    // Brief subtree while the classic profile — outside .rk-root — keeps the
    // defaults from index.css. Portaled dialogs/popovers render outside this scope
    // and are intentionally left on the default theme.
    ["--background" as any]: p.background,
    ["--foreground" as any]: p.text,
    ["--card" as any]: p.surface,
    ["--card-foreground" as any]: p.text,
    ["--popover" as any]: p.background,
    ["--popover-foreground" as any]: p.text,
    ["--muted" as any]: p.surface,
    ["--muted-foreground" as any]: p.muted,
    ["--border" as any]: border,
    ["--input" as any]: border,
    ["--ring" as any]: p.primary,
    ["--radius" as any]: radiusValue(brand.radius),
    ["--primary" as any]: p.primary,
    ["--primary-foreground" as any]: primaryFg,
    ["--secondary" as any]: p.accent,
    ["--secondary-foreground" as any]: accentFg,
    ["--accent" as any]: p.accent,
    ["--accent-foreground" as any]: accentFg,
    color: p.text,
    backgroundColor: p.background,
    fontFamily: fontFamily(brand.typography.body),
  };
}

/* --- enum → class maps -------------------------------------------------- */

const SECTION_PADDING: Record<Spacing, string> = {
  tight: "py-8 sm:py-10",
  normal: "py-12 sm:py-16",
  airy: "py-16 sm:py-24",
};
export const sectionPaddingClass = (s: Spacing) => SECTION_PADDING[s];

const EMPHASIS_PADDING: Record<Emphasis, string> = {
  lead: "py-4 sm:py-8",
  normal: "",
  quiet: "opacity-90",
};
export const emphasisClass = (e: Emphasis) => EMPHASIS_PADDING[e];

const HEADING_SCALE: Record<Scale, string> = {
  compact: "text-3xl sm:text-4xl",
  normal: "text-4xl sm:text-5xl",
  spacious: "text-5xl sm:text-6xl",
};
export const heroHeadingClass = (s: Scale) => HEADING_SCALE[s];

const SECTION_HEADING_SCALE: Record<Scale, string> = {
  compact: "text-2xl sm:text-3xl",
  normal: "text-3xl sm:text-4xl",
  spacious: "text-4xl sm:text-5xl",
};
export const sectionHeadingClass = (s: Scale) => SECTION_HEADING_SCALE[s];

/** Inline style for a section background option. */
export function backgroundStyle(bg: Background): CSSProperties {
  switch (bg) {
    case "surface":
      return { backgroundColor: "var(--rk-surface)" };
    case "accent":
      return { backgroundColor: "var(--rk-accent-soft)" };
    case "gradient":
      return {
        backgroundImage:
          "linear-gradient(160deg, var(--rk-primary-soft), var(--rk-accent-soft))",
      };
    default:
      return {};
  }
}

/* --- CTA styles --------------------------------------------------------- */

/**
 * Pure-className CTA styling (no inline style) for cases where we can only pass a
 * className through to an existing component (e.g. EventQuickRegister). Uses
 * Tailwind arbitrary-value classes that read the brand CSS variables. These class
 * literals are present in source, so the JIT compiler emits them.
 */
export function ctaClassName(style: CtaStyle): string {
  const base =
    "inline-flex items-center justify-center gap-2 font-semibold transition-all duration-200 active:scale-[0.98]";
  switch (style) {
    case "filled":
      return `${base} px-6 py-3 text-[15px] rounded-[var(--rk-radius)] bg-[var(--rk-primary)] text-[var(--rk-primary-fg)] shadow-sm hover:shadow-md hover:-translate-y-0.5`;
    case "outlined":
      return `${base} px-6 py-3 text-[15px] rounded-[var(--rk-radius)] border-2 border-[var(--rk-primary)] text-[var(--rk-primary)] hover:bg-[var(--rk-primary-soft)]`;
    case "ghost":
      return `${base} px-5 py-2.5 text-[15px] rounded-[var(--rk-radius)] text-[var(--rk-primary)] hover:bg-[var(--rk-primary-soft)]`;
    case "link":
      return `${base} px-1 py-1 text-[15px] text-[var(--rk-primary)] underline underline-offset-4 hover:opacity-70`;
    default:
      return base;
  }
}

/** Returns { className, style } for a CTA trigger of a given style. */
export function ctaVisual(style: CtaStyle): { className: string; style: CSSProperties } {
  const base =
    "inline-flex items-center justify-center gap-2 font-semibold transition-all duration-200 active:scale-[0.98] disabled:opacity-60";
  switch (style) {
    case "filled":
      return {
        className: `${base} px-6 py-3 text-[15px] shadow-sm hover:shadow-md hover:-translate-y-0.5`,
        style: {
          backgroundColor: "var(--rk-primary)",
          color: "var(--rk-primary-fg)",
          borderRadius: "var(--rk-radius)",
        },
      };
    case "outlined":
      return {
        className: `${base} px-6 py-3 text-[15px] border-2 hover:bg-[var(--rk-primary-soft)]`,
        style: {
          borderColor: "var(--rk-primary)",
          color: "var(--rk-primary)",
          borderRadius: "var(--rk-radius)",
        },
      };
    case "ghost":
      return {
        className: `${base} px-5 py-2.5 text-[15px] hover:bg-[var(--rk-primary-soft)]`,
        style: { color: "var(--rk-primary)", borderRadius: "var(--rk-radius)" },
      };
    case "link":
      return {
        className: `${base} px-1 py-1 text-[15px] underline underline-offset-4 hover:opacity-70`,
        style: { color: "var(--rk-primary)" },
      };
    default:
      return { className: base, style: {} };
  }
}
