// server/brief/enhance.ts
//
// The deterministic "design polish" pass. Runs AFTER normalizeBrief on generated
// (and seeded) Briefs. The AI does the creative art direction; this guarantees
// the structural cohesion that makes a page read as intentional even when the
// model was terse or the profile is sparse — so the FIRST generation needs no
// editing. It never invents content: it only sets layout direction (order,
// background rhythm, section headings/eyebrows) and ensures a closing action.
//
// Pure + idempotent: takes a valid PageBrief, returns a valid PageBrief.

import {
  type PageBrief,
  type Section,
  type SectionKind,
  type Background,
  DATA_SECTION_KINDS,
} from "@shared/brief";
import type { BriefBundle } from "./bundle";

/** Sensible section headings if the model didn't write connective copy. */
const DEFAULT_HEADING: Partial<Record<SectionKind, string>> = {
  sessions: "Work with me",
  events: "Upcoming events",
  products: "Resources & guides",
  physicalProducts: "Shop",
  blog: "Latest writing",
  gallery: "Gallery",
  testimonials: "What people say",
};

const DEFAULT_EYEBROW: Partial<Record<SectionKind, string>> = {
  sessions: "Offerings",
  events: "What's on",
  products: "Digital",
  physicalProducts: "Shop",
  blog: "Journal",
  gallery: "Gallery",
  testimonials: "Kind words",
};

const has = (a?: unknown[] | null) => Array.isArray(a) && a.length > 0;

export function polishBrief(brief: PageBrief, _bundle: BriefBundle): PageBrief {
  let sections = [...brief.sections];

  // 1) Structure: hero first, footer last (stable for everything between).
  const heroIdx = sections.findIndex((s) => s.kind === "hero");
  if (heroIdx > 0) {
    const [hero] = sections.splice(heroIdx, 1);
    sections.unshift(hero);
  }
  const footerIdx = sections.findIndex((s) => s.kind === "footer");
  if (footerIdx >= 0 && footerIdx !== sections.length - 1) {
    const [footer] = sections.splice(footerIdx, 1);
    sections.push(footer);
  }

  // 2) Section intros: ensure every data section has a heading + eyebrow so the
  //    branded SectionFrame never renders bare. Only FILLS gaps — never
  //    overwrites copy the AI wrote.
  sections = sections.map((s) => {
    if (!DATA_SECTION_KINDS.includes(s.kind)) return s;
    const copy = { ...(s.copy ?? {}) };
    if (!copy.headline?.trim() && DEFAULT_HEADING[s.kind]) copy.headline = DEFAULT_HEADING[s.kind];
    if (!copy.eyebrow?.trim() && DEFAULT_EYEBROW[s.kind]) copy.eyebrow = DEFAULT_EYEBROW[s.kind];
    return { ...s, copy };
  });

  // 3) Background rhythm: give the body a designed cadence. Walk the sections
  //    between hero and footer; for any content section still on the default
  //    "none", alternate none / surface so blocks visually separate. Respect any
  //    deliberate gradient/accent the AI chose.
  let toggle = false;
  sections = sections.map((s) => {
    if (s.kind === "hero" || s.kind === "footer") return s;
    const isContent = DATA_SECTION_KINDS.includes(s.kind) || s.kind === "about";
    if (!isContent) return s;
    let background: Background = s.background;
    if (background === "none") {
      background = toggle ? "surface" : "none";
    }
    toggle = !toggle;
    return { ...s, background };
  });

  // 4) Emphasis arc: hero leads.
  sections = sections.map((s) => (s.kind === "hero" ? { ...s, emphasis: "lead" } : s));

  return { ...brief, sections } satisfies PageBrief;
}

/** Convenience used by tests/fallbacks. */
export function hasAnyData(bundle: BriefBundle): boolean {
  return (
    has(bundle.sessions) ||
    has(bundle.events) ||
    has(bundle.products) ||
    has(bundle.physicalProducts) ||
    has(bundle.blogs) ||
    has(bundle.profile?.galleryImages) ||
    has(bundle.profile?.testimonials)
  );
}
