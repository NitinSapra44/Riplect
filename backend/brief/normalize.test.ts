import { describe, it, expect } from "vitest";
import { PageBriefSchema, DATA_SECTION_KINDS } from "@shared/brief";
import { briefFromProfile } from "./fromProfile";
import { normalizeBrief } from "./normalize";
import { polishBrief } from "./enhance";
import type { BriefBundle } from "./bundle";

// A hand-built bundle — these tests never touch the DB.
function makeBundle(overrides: Partial<BriefBundle> = {}): BriefBundle {
  return {
    profile: {
      id: "p1",
      username: "jane",
      displayName: "Jane Rivers",
      title: "Mindset Coach",
      shortBio: "I help founders find calm.",
      longBio: "",
      contactInfo: { whatsapp: "+15550001111", email: "jane@example.com" },
      socialLinks: { instagram: "https://instagram.com/jane" },
      galleryImages: [{ url: "x", alt: "y" }],
      testimonials: [{ clientName: "Sam", content: "Great" }],
    } as any,
    sessions: [{ id: 1, title: "1:1 Session", isFeatured: false }] as any,
    events: [{ id: 10, title: "Workshop" }] as any,
    products: [{ id: 100, title: "Guide", isFree: false, price: "9", currency: "USD" }] as any,
    physicalProducts: [] as any,
    blogs: [] as any,
    ...overrides,
  };
}

describe("briefFromProfile", () => {
  it("produces a schema-valid Brief that mirrors available data", () => {
    const brief = briefFromProfile(makeBundle());
    expect(PageBriefSchema.safeParse(brief).success).toBe(true);
    const kinds = brief.sections.map((s) => s.kind);
    expect(kinds[0]).toBe("hero");
    expect(kinds).toContain("sessions");
    expect(kinds).toContain("events");
    expect(kinds).toContain("products");
    expect(kinds).toContain("gallery");
    expect(kinds).toContain("testimonials");
    expect(kinds).toContain("contact");
    expect(kinds.at(-1)).toBe("footer");
    // No data section is emitted for a category with no data.
    expect(kinds).not.toContain("physicalProducts");
  });

  it("includes a hero book CTA wired to a real session id", () => {
    const brief = briefFromProfile(makeBundle());
    const hero = brief.sections.find((s) => s.kind === "hero")!;
    const book = hero.ctas?.find((c) => c.action.kind === "book");
    expect(book).toBeTruthy();
    expect((book!.action as any).sessionId).toBe(1);
  });
});

describe("normalizeBrief", () => {
  it("repairs invalid enums and palette into a valid Brief", () => {
    const bundle = makeBundle();
    const garbage = {
      schemaVersion: 1,
      brand: {
        palette: { background: "not-a-color", surface: "#fff", text: "#000", muted: "zzz", primary: "#b66667", accent: "#c98a6a" },
        typography: { heading: "comic-sans", body: "inter", scale: "weird" },
        radius: "banana",
        spacing: "loose",
      },
      sections: [
        { kind: "hero", variant: "no-such-variant", background: "rainbow", emphasis: "shout", visible: true },
        { kind: "not-a-real-kind", variant: "x" }, // dropped
      ],
    };
    const out = normalizeBrief(garbage, bundle);
    expect(PageBriefSchema.safeParse(out).success).toBe(true);
    expect(out.brand.palette.background).toBe("#ffffff"); // repaired
    expect(out.brand.radius).toBe("rounded"); // default
    const hero = out.sections.find((s) => s.kind === "hero")!;
    expect(hero.variant).toBe("centered"); // first allowed variant
    expect(out.sections.find((s) => (s.kind as string) === "not-a-real-kind")).toBeUndefined();
  });

  it("drops transactional CTAs whose entity does not resolve, keeps valid ones", () => {
    const bundle = makeBundle();
    const input = {
      schemaVersion: 1,
      brand: undefined,
      sections: [
        {
          kind: "hero",
          variant: "centered",
          ctas: [
            { id: "a", action: { kind: "book", sessionId: 1 } }, // keep
            { id: "b", action: { kind: "book", sessionId: 999 } }, // drop (no such session)
            { id: "c", action: { kind: "buyDigital", productId: 100 } }, // keep
            { id: "d", action: { kind: "registerEvent", eventId: 555 } }, // drop
          ],
        },
      ],
    };
    const out = normalizeBrief(input, bundle);
    const ctas = out.sections[0].ctas ?? [];
    const kinds = ctas.map((c) => `${c.action.kind}:${(c.action as any).sessionId ?? (c.action as any).productId}`);
    expect(kinds).toContain("book:1");
    expect(kinds).toContain("buyDigital:100");
    expect(kinds).not.toContain("book:999");
    expect(ctas).toHaveLength(2);
  });

  it("drops a whatsapp CTA when the profile has no whatsapp number", () => {
    const bundle = makeBundle({ profile: { id: "p1", username: "x", displayName: "X", contactInfo: {}, socialLinks: {} } as any });
    const out = normalizeBrief(
      { schemaVersion: 1, sections: [{ kind: "hero", variant: "centered", ctas: [{ id: "w", action: { kind: "whatsapp" } }] }] },
      bundle,
    );
    expect(out.sections[0].ctas ?? []).toHaveLength(0);
  });

  it("throws when no valid section survives (caller falls back)", () => {
    expect(() => normalizeBrief({ sections: [{ kind: "bogus" }] }, makeBundle())).toThrow();
    expect(() => normalizeBrief({ sections: [] }, makeBundle())).toThrow();
  });

  it("preserves new fields: eyebrow on a data section, align, cta kind, gradient bg", () => {
    const bundle = makeBundle();
    const out = normalizeBrief(
      {
        schemaVersion: 1,
        sections: [
          { kind: "hero", variant: "centered" },
          {
            kind: "events",
            variant: "agenda",
            background: "gradient",
            align: "center",
            copy: { eyebrow: "What's on", headline: "Upcoming", tagline: "Join me live" },
          },
          {
            kind: "cta",
            variant: "band",
            copy: { headline: "Ready?" },
            ctas: [{ id: "x", action: { kind: "book", sessionId: 1 } }],
          },
        ],
      },
      bundle,
    );
    expect(PageBriefSchema.safeParse(out).success).toBe(true);
    const events = out.sections.find((s) => s.kind === "events")!;
    expect(events.copy?.eyebrow).toBe("What's on");
    expect(events.align).toBe("center");
    expect(events.background).toBe("gradient");
    const cta = out.sections.find((s) => s.kind === "cta")!;
    expect(cta.variant).toBe("band");
    expect(cta.ctas?.[0]?.action.kind).toBe("book");
  });
});

describe("polishBrief", () => {
  it("forces hero first, footer last, and makes hero the lead", () => {
    const bundle = makeBundle();
    const brief = normalizeBrief(
      {
        schemaVersion: 1,
        sections: [
          { kind: "footer", variant: "simple" },
          { kind: "events", variant: "cards" },
          { kind: "hero", variant: "centered" },
        ],
      },
      bundle,
    );
    const out = polishBrief(brief, bundle);
    expect(out.sections[0].kind).toBe("hero");
    expect(out.sections.at(-1)!.kind).toBe("footer");
    expect(out.sections[0].emphasis).toBe("lead");
    expect(PageBriefSchema.safeParse(out).success).toBe(true);
  });

  it("fills missing section intros on data sections without overwriting authored copy", () => {
    const bundle = makeBundle();
    const brief = normalizeBrief(
      {
        schemaVersion: 1,
        sections: [
          { kind: "hero", variant: "centered" },
          { kind: "events", variant: "cards" }, // no copy → filled
          { kind: "products", variant: "grid", copy: { headline: "My shop" } }, // kept
        ],
      },
      bundle,
    );
    const out = polishBrief(brief, bundle);
    const events = out.sections.find((s) => s.kind === "events")!;
    const products = out.sections.find((s) => s.kind === "products")!;
    expect(events.copy?.headline?.length).toBeGreaterThan(0);
    expect(events.copy?.eyebrow?.length).toBeGreaterThan(0);
    expect(products.copy?.headline).toBe("My shop"); // not overwritten
  });

  it("creates a background rhythm across content sections", () => {
    const bundle = makeBundle();
    const brief = normalizeBrief(
      {
        schemaVersion: 1,
        sections: [
          { kind: "hero", variant: "centered" },
          { kind: "events", variant: "cards" },
          { kind: "products", variant: "grid" },
          { kind: "testimonials", variant: "cards" },
          { kind: "footer", variant: "simple" },
        ],
      },
      bundle,
    );
    const out = polishBrief(brief, bundle);
    const contentBgs = out.sections
      .filter((s) => DATA_SECTION_KINDS.includes(s.kind))
      .map((s) => s.background);
    // At least one content section is lifted onto a surface for separation.
    expect(contentBgs.some((b) => b === "surface")).toBe(true);
  });
});
