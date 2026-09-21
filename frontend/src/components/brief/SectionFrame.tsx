import type { ReactNode } from "react";
import type { Brand, Section } from "@shared/brief";
import { sectionHeadingClass } from "./theme";

/**
 * Branded section intro + container. This is the connective design tissue that
 * was missing: every data section now gets an eyebrow (kicker), a heading, an
 * optional subhead and an accent rule — all token-driven so they re-theme with
 * the brand. The actual content (cards/grid from the reused components) is the
 * children. Headings come from the Brief's section copy (written/grounded by the
 * AI), falling back to a sensible per-kind default so a section never reads as
 * bare even if the model omitted copy.
 */

const DEFAULT_HEADINGS: Partial<Record<Section["kind"], string>> = {
  sessions: "Work with me",
  events: "Upcoming events",
  products: "Resources & guides",
  physicalProducts: "Shop",
  blog: "Latest writing",
  gallery: "Gallery",
  testimonials: "What people say",
};

export function SectionFrame({
  section,
  brand,
  children,
}: {
  section: Section;
  brand: Brand;
  children: ReactNode;
}) {
  const eyebrow = section.copy?.eyebrow?.trim();
  const heading = section.copy?.headline?.trim() || DEFAULT_HEADINGS[section.kind];
  const subhead = section.copy?.tagline?.trim();
  const centered = section.align === "center";
  const hasIntro = !!(eyebrow || heading || subhead);

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6">
      {hasIntro && (
        <div className={`mb-8 ${centered ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}`}>
          {eyebrow && (
            <div
              className="mb-2 text-xs font-semibold uppercase tracking-[0.18em]"
              style={{ color: "var(--rk-primary)" }}
            >
              {eyebrow}
            </div>
          )}
          {heading && (
            <h2
              className={`font-bold ${sectionHeadingClass(brand.typography.scale)}`}
              style={{ fontFamily: "var(--rk-font-heading)", color: "var(--rk-text)" }}
            >
              {heading}
            </h2>
          )}
          {subhead && (
            <p className="mt-3 text-lg leading-relaxed" style={{ color: "var(--rk-muted)" }}>
              {subhead}
            </p>
          )}
          <div
            className={`mt-4 h-1 w-12 rounded-full ${centered ? "mx-auto" : ""}`}
            style={{ backgroundColor: "var(--rk-primary)" }}
          />
        </div>
      )}
      {children}
    </div>
  );
}
