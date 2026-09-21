# Riplek AI-Native Page Builder — Implementation Plan

**Companion to:** Riplek Product Feature Document v1.0 (March 2026)
**Scope of this document:** How to implement the genome-driven landing page system inside the *actual* Riplek codebase and schema. Architecture decisions, the genome data model, the binding/CTA bridge, the renderer, and a lean Phase-1 build plan.
**Status:** Implementation blueprint — no code changes proposed yet.

---

## 1. Where this fits in the current codebase

The current public page is `frontend/src/pages/profile.tsx` (~74 KB). It imports a fixed set of section components and renders them in a hardcoded order:

```
profile.tsx
 ├── ExpandableSection → BookingSection      (sessions)
 ├── ExpandableSection → EventsSection        (events)
 ├── ExpandableSection → BlogSection          (blog)
 ├── ExpandableSection → ProductsSection       (digital products)
 ├── PhysicalProductsSection
 ├── GallerySection
 └── TestimonialsSection
```

Data comes from the existing public API in `backend/routes.ts`:

| Endpoint | Returns |
| --- | --- |
| `GET /api/profiles/:username` | `profiles` row (incl. JSONB `socialLinks`, `contactInfo`, `testimonials`, `galleryImages`, bios) |
| `GET /api/profiles/:username/sessions` | `bookingSessions[]` |
| `GET /api/profiles/:username/sessions/:id` | one session (full `description`) |
| `GET /api/profiles/:username/events` | `events[]` |
| `GET /api/profiles/:username/blog` | `blogPosts[]` |
| `GET /api/profiles/:username/products` | `digitalProducts[]` |
| `GET /api/profiles/:username/physical-products` | `physicalProducts[]` |

**Key insight for implementation:** every binding the PFD wants already has a live endpoint. The genome system does **not** need new data-fetching infrastructure — it needs a layer that decides *which* data renders, *where*, and *how it looks*. That is the entire job of Phase 1.

The genome layer slots in cleanly:

```
                    ┌──────────────────────────────┐
   profile.tsx  →   │   GenomeRenderer (new)        │
   (becomes a       │   reads genome + live data    │
    thin host)      │   mounts existing components   │
                    └──────────────────────────────┘
                              │  reads
              ┌───────────────┼────────────────┐
              ▼               ▼                ▼
        page_genomes    existing /api/profiles/:username/* endpoints
         (new table)     (unchanged — BookingSection, EventsSection… reused)
```

The existing section components are kept and *reused* as the implementations behind CTA/section objects. We are not rewriting `BookingSection`; we are letting the genome decide whether/where/how it appears.

---

## 2. Architectural decisions (the PFD's open questions, resolved for Phase 1)

The PFD §5.2 lists seven open questions. Recommendations below, with the Phase-1 answer in bold.

### 2.1 Genome storage → **Dedicated `page_genomes` table** (recommended)

You asked me to decide this. Recommendation: **a dedicated `page_genomes` table, not a JSONB column on `profiles`.**

Reasoning specific to this codebase:

- **Draft vs. published is a first-class need.** The PFD's whole UX (AI generates → creator refines → publishes) requires a draft the visitor never sees. A column on `profiles` forces you to either render unpublished edits or bolt on a second column. A table makes `status: 'draft' | 'published'` natural.
- **Versioning / revert is in the vision (P-genome is "versionable, diffable, revertable").** Version history as rows is trivial in a dedicated table and impossible-to-clean in a single column.
- **`profiles` is already very wide** (40+ columns, six JSONB fields). Adding a large, frequently-rewritten JSONB genome to the same row hurts row size and means every genome save rewrites the whole profile row. Separation keeps profile reads (hot path) light.
- **Migration cost is low** — it's an additive table, no destructive change, consistent with the CLAUDE.md rule "never use destructive operations."

Proposed shape (illustrative — design artifact, not a migration to run yet):

```ts
// shared/schema.ts (proposed addition)
export const pageGenomes = pgTable("page_genomes", {
  id: serial("id").primaryKey(),
  profileId: text("profile_id").notNull().references(() => profiles.id),
  status: varchar("status", { length: 12 }).notNull().default("draft"), // 'draft' | 'published'
  version: integer("version").notNull().default(1),
  genome: jsonb("genome").$type<PageGenome>().notNull(),
  schemaVersion: integer("schema_version").notNull().default(1), // for future genome migrations
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  // one live draft + one live published per profile; history kept as extra rows
  profileStatusIdx: index("page_genomes_profile_status_idx").on(t.profileId, t.status),
}));
```

Phase-1 simplification: keep exactly **two** active rows per profile (one `draft`, one `published`). Defer the full version-history table until Phase 2 — but the table shape above already supports it without a breaking change.

### 2.2 Rendering strategy → **Client-side React for Phase 1; SSR/edge as a Phase 2+ upgrade**

The app is a Vite SPA today; the public profile already renders client-side. Phase 1 should **not** change the rendering paradigm — the genome renderer is just a smarter client component reading the same TanStack Query data. This is the lowest-risk path and ships fastest.

SEO note (the real cost of CSR): the profile page is a marketing surface, so SEO matters. You already mitigate this — `backend/ogTags.ts` injects OpenGraph tags server-side. For Phase 1, extend that pattern (server-rendered `<title>`, meta description, OG image from the genome's hero) so link previews and crawlers get the essentials, while the body hydrates on the client. Promote to full SSR/edge streaming in Phase 2+ once the genome shape is stable. Flagged as a **deliberate deferral**, not an oversight.

### 2.3 Migration path → **Auto-generate a genome from the existing profile, opt-in publish**

Do not force creators onto the new system. On first entry to the builder, run a deterministic "genome from profile" function (no AI needed) that produces a genome equivalent to today's fixed layout, ordered by what data exists. The creator previews it, edits, and explicitly publishes. Until they publish, visitors see the current `profile.tsx` output. This de-risks adoption and gives you a clean A/B surface.

This function is also the safety net: if a genome ever fails validation at render time, the renderer falls back to the auto-generated layout.

### 2.4 Mobile layout → **Auto-derived from the desktop genome in Phase 1**

The property framework (size presets, section types) is already responsive-friendly. Phase 1 derives mobile from desktop (sections stack, `Feature` media → full-width, multi-column → single column). A separate mobile genome is a Phase 3 concern, tied to editorial layouts.

### 2.5 Template sharing, AI model, Phase-3 timing

- **Template sharing:** out of scope for Phase 1. The genome being pure JSON makes this a natural later feature (export a genome with bindings stripped to placeholders). Note it; don't build it.
- **AI model:** Phase 1 ships **without** the AI conversation engine (see §7). When added (Phase 1.5/2), use the Claude API constrained to emit genome JSON validated against the same schema the manual editor uses — satisfying PFD principle P4 ("AI and human speak the same language").
- **Phase-3 editorial / Pretext layouts:** deferred. Phase 1 uses CSS fl/grid layouts only.

---

## 3. The Genome data model

The genome is one JSON document per page with three parts mirroring the PFD: `brand`, `sections`, and (embedded in CTA objects) toolkit bindings.

### 3.1 Top-level shape

```ts
// shared/genome.ts (proposed)
export interface PageGenome {
  schemaVersion: 1;
  brand: Brand;
  sections: Section[];
}

export interface Brand {
  palette: {
    primary: string;   // hex
    secondary: string;
    accent: string;
    muted: string;
    background: string;
    surface: string;
  };
  typography: {
    headingFont: FontId;   // from curated ~18-font set
    bodyFont: FontId;
    baseScale: "compact" | "normal" | "spacious";
  };
  radius: "none" | "slight" | "rounded" | "full";
  spacing: "tight" | "normal" | "airy";
  mood?: string[];         // freeform tags from AI conversation, e.g. ["calm","editorial"]
}

export interface Section {
  id: string;                  // stable uuid, used for reorder/diff
  type: SectionLayout;         // "hero" | "split" | "grid" | "stack" | "editorial" | "freeform"
  visible: boolean;
  background?: "none" | "surface" | "accent";
  objects: PageObject[];
}

export type PageObject = TextObject | MediaObject | CtaObject;
```

### 3.2 The three object types

Each object carries a `dataBinding` (a pointer into live data) plus a bounded `props` block. The `props` enums map **directly** to the PFD §1.3 property framework, so the manual editor and the AI both produce the same structures.

```ts
interface BaseObject {
  id: string;
  dataBinding: string | null;  // e.g. "profile.shortBio", "sessions[0].title"; null = static label
  staticValue?: string;        // used when dataBinding is null (e.g. a CTA label, a heading)
}

export interface TextObject extends BaseObject {
  kind: "text";
  props: {
    fontFamily: FontId;
    size: "xs" | "s" | "m" | "l" | "xl" | "2xl" | "3xl";
    weight: "normal" | "medium" | "semibold" | "bold";
    align: "left" | "center" | "right";
    color: "primary" | "secondary" | "accent" | "muted" | "custom";
    customColor?: string;
    lineHeight: "compact" | "normal" | "relaxed";
    expandable?: { enabled: boolean; deeperBinding: string }; // "read more" → e.g. sessions[0].description
  };
}

export interface MediaObject extends BaseObject {
  kind: "media";
  props: {
    size: "compact" | "standard" | "feature";
    shape: "square" | "landscape" | "portrait" | "circle";
    radius: "none" | "slight" | "rounded" | "full";
    overlay: "none" | "gradient" | "dark";
    position: "inline" | "floating";
  };
}

export interface CtaObject extends BaseObject {
  kind: "cta";
  toolkit: ToolkitBinding;     // what it DOES (platform-controlled) — see §5
  props: {
    variant: "filled" | "outlined" | "ghost" | "link";
    size: "small" | "medium" | "large";
    label: string;             // smart default per CTA type
    icon?: "calendar" | "ticket" | "bag" | "arrow" | "mail" | "link" | "download";
    color: "primary" | "secondary" | "accent" | "custom";
    customColor?: string;
    width: "fit" | "full";
  };
}
```

This is the literal expression of PFD principle P2 ("Freedom within a framework"): every visual choice is a closed enum, so neither AI nor creator can emit a broken layout.

### 3.3 Example: a hero section genome (real Riplek bindings)

```json
{
  "id": "sec_hero",
  "type": "hero",
  "visible": true,
  "objects": [
    { "id": "o1", "kind": "media", "dataBinding": "profile.profileImageUrl",
      "props": { "size": "feature", "shape": "circle", "radius": "full", "overlay": "none", "position": "inline" } },
    { "id": "o2", "kind": "text", "dataBinding": "profile.displayName",
      "props": { "fontFamily": "fraunces", "size": "3xl", "weight": "bold", "align": "center", "color": "primary", "lineHeight": "compact" } },
    { "id": "o3", "kind": "text", "dataBinding": "profile.shortBio",
      "props": { "fontFamily": "inter", "size": "m", "weight": "normal", "align": "center", "color": "muted", "lineHeight": "relaxed",
                 "expandable": { "enabled": true, "deeperBinding": "profile.longBio" } } },
    { "id": "o4", "kind": "cta", "dataBinding": "sessions[0].id",
      "toolkit": { "system": "booking", "entityRef": "sessions[0].id" },
      "props": { "variant": "filled", "size": "large", "label": "Book a session", "icon": "calendar", "color": "primary", "width": "fit" } }
  ]
}
```

---

## 4. Data binding system

A binding is a string path resolved at render time against data already loaded by the existing endpoints. **One correction vs. the PFD:** the binding table in PFD §4.4 lists `events[n].date`, but the real column is `events.startAt` (and there's no `events.date`). The table below is reconciled with the actual schema in `shared/schema.ts`.

| Binding expression | Source field (verified) | Endpoint |
| --- | --- | --- |
| `profile.displayName` | `profiles.displayName` | `/api/profiles/:username` |
| `profile.shortBio` / `profile.longBio` / `profile.bio` | `profiles.shortBio` / `longBio` / `bio` | same |
| `profile.profileImageUrl` | `profiles.profileImageUrl` | same |
| `profile.shortBioImageUrl` / `longBioImageUrl` | `profiles.shortBioImageUrl` / `longBioImageUrl` | same |
| `profile.testimonials[n].content` | `profiles.testimonials` (JSONB) | same |
| `profile.socialLinks.instagram` | `profiles.socialLinks` (JSONB) | same |
| `profile.contactInfo.*` | `profiles.contactInfo` (JSONB) | same |
| `profile.galleryImages[n].url` | `profiles.galleryImages` (JSONB) | same |
| `sessions[n].title` / `.thumbnailDescription` / `.price` / `.currency` / `.duration` | `bookingSessions.*` | `/api/profiles/:username/sessions` |
| `sessions[n].description` (deep / "read more") | `bookingSessions.description` | `/api/profiles/:username/sessions/:id` |
| `sessions[n].images[0].url` | `bookingSessions.images` (JSONB) | `/sessions` |
| `events[n].title` / `.startAt` / `.featuredImage` / `.price` | `events.*` (**`startAt`**, not `date`) | `/api/profiles/:username/events` |
| `blogs[n].title` / `.excerpt` / `.imageUrl` | `blogPosts.*` | `/api/profiles/:username/blog` |
| `products[n].title` / `.imageUrl` / `.price` | `digitalProducts.*` | `/api/profiles/:username/products` |
| `physicalProducts[n].title` / `.imageUrl` | `physicalProducts.*` | `/api/profiles/:username/physical-products` |

### 4.1 Resolver design

```ts
// frontend/src/lib/binding-resolver.ts (proposed)
type BindingContext = {
  profile: Profile;
  sessions: BookingSession[];
  events: Event[];
  blogs: BlogPost[];
  products: DigitalProduct[];
  physicalProducts: PhysicalProduct[];
};

function resolve(binding: string, ctx: BindingContext): unknown {
  // "sessions[0].images[0].url" → walk ctx by tokens, array-index aware.
  // Returns undefined for missing data → object self-hides (see §6.2).
}
```

Implementation notes:
- The resolver is **pure** and synchronous — all data is already in the React Query cache when the renderer runs. No new network calls per binding.
- Parse paths into tokens once (`sessions`, `[0]`, `images`, `[0]`, `url`) and memoize per genome.
- Use the existing query keys; the renderer fetches the full bundle once (`useProfileBundle(username)`), exactly as `profile.tsx` already does today.

---

## 5. The CTA toolkit bridge

This is the platform moat (PFD P3: "Visual is custom, behavior is uniform"). A `CtaObject` never renders a raw button that does something arbitrary — it resolves its `toolkit.system` and mounts the **existing** Riplek component. Mapping to the components that actually exist in `frontend/src/components`:

| `toolkit.system` | Mounts (existing component) | Notes |
| --- | --- | --- |
| `booking` | `BookingSection` (`booking-section.tsx`) | Already takes `sessions`, `profileId`, `username`, `displayName` |
| `event` | `EventRegistrationModal` (`event-registration-modal.tsx`) / `EventQuickRegister` | Triggered from an `EventCTA`; entity = `events[n].id` |
| `product_digital` | `DigitalProductPaymentModal` / `FreeProductDownloadModal` | Choose by `digitalProducts[n].isFree` |
| `product_physical` | `physical-products-section.tsx` purchase flow | entity = `physicalProducts[n].id` |
| `blog` | Wouter navigation to `blog-post` route | internal routing only |
| `contact` | `contact-management` public form / `emailService` | uses `profiles.contactInfo` |
| `social` | external link from `profiles.socialLinks` | navigation only, `rel="noopener"` |

Bridge contract:

```ts
// frontend/src/components/genome/cta-bridge.tsx (proposed)
function CtaBridge({ object, ctx }: { object: CtaObject; ctx: BindingContext }) {
  const entity = resolve(object.toolkit.entityRef, ctx);
  // Render a styled trigger (from object.props) that opens the platform component.
  // The TRIGGER is themed by the genome; the FLOW is the existing Riplek component, untouched.
}
```

Key principle: the genome controls the **trigger's** appearance (`props`); the platform owns the **flow**. The booking/payment/registration logic, emails, guest portal, and Stripe coordination are never reimplemented — they're mounted as-is. This is what keeps the unified guest portal and platform analytics intact (PFD §2.3).

---

## 6. The renderer

### 6.1 Component tree

```
<GenomeRenderer username genome>          // top-level; fetches the data bundle once
  <BrandProvider brand>                    // injects CSS variables (palette, fonts, radius)
    {sections.map(s =>
      <SectionRenderer section>            // picks layout by section.type
        {objects.map(o =>
          <ObjectRenderer object ctx>      // switch on o.kind
            <TextRenderer/> | <MediaRenderer/> | <CtaBridge/>
        )}
      </SectionRenderer>
    )}
  </BrandProvider>
</GenomeRenderer>
```

### 6.2 Three rules that make it robust

1. **Brand → CSS variables.** `BrandProvider` writes `--rk-primary`, `--rk-font-heading`, `--rk-radius`, etc. Every object reads tokens, never hardcoded values. One brand change restyles the whole page (PFD Design Layer).
2. **Missing data self-hides.** If `resolve()` returns `undefined`/empty, the object renders nothing (and an empty section collapses). This is how "the page IS the data" (P1) stays safe — a creator with no events simply has no events section, automatically.
3. **Props → a closed style map.** Each enum value maps to a fixed Tailwind class set (e.g. `size: "3xl"` → `text-5xl`). No dynamic class generation, no arbitrary CSS. Guarantees PFD P6 ("verified by construction") and stays within Tailwind's precompiled classes (matches your `tailwind.config.ts`).

### 6.3 Relationship to `profile.tsx`

`profile.tsx` becomes a thin host: fetch the published genome → if present, render `<GenomeRenderer>`; if absent or invalid, render today's fixed layout (the fallback path). No existing section component is deleted in Phase 1 — they're reused both as the fallback and behind the CTA bridge.

---

## 7. Lean Phase 1 — concrete scope

**Goal:** prove the genome model end-to-end with the *current* visual sections, no AI, no editorial layouts. A creator can generate a genome from their existing data, tweak basic properties, publish, and visitors see a data-driven page.

### In scope

1. **`shared/genome.ts`** — the TypeScript types in §3 (single source of truth for FE + validation).
2. **`page_genomes` table** + Drizzle schema + `db:push` (additive, non-destructive).
3. **`genomeFromProfile(profile, data)`** — deterministic generator producing today's layout as a genome (the migration + fallback function, §2.3).
4. **Binding resolver** (`frontend/src/lib/binding-resolver.ts`, §4).
5. **GenomeRenderer + Section/Object renderers** (§6) supporting `hero`, `stack`, `grid` layouts (enough for the current page; defer `split`/`editorial`/`freeform`).
6. **CTA bridge** for `booking`, `event`, `product_digital`, `blog`, `contact`, `social` (the systems already on the page).
7. **Minimal manual property editor** — select an object in a preview, edit its `props` (font, size, weight, align, color, radius, etc.) and brand palette/fonts. Reorder + show/hide sections. No add-arbitrary-object yet.
8. **Draft/publish** — save draft, preview, publish; `profile.tsx` reads published genome with fallback.
9. **Genome validator** — runs before save/publish: bindings exist, enum values in range, every CTA references a valid entity. Reject invalid genomes (P6).

### Explicitly deferred (later phases)

- AI conversation engine (Phase 1.5 / 2) — add once the genome schema is frozen.
- Add/remove arbitrary objects + section palette, full reorder-within-section (Phase 2).
- `split` / `editorial` / `freeform` layouts + Pretext text measurement (Phase 3).
- Version history rows, template sharing, A/B + analytics-driven optimization (Phase 2–4).
- SSR/edge rendering (Phase 2+; OG tags cover Phase-1 SEO).
- Separate mobile genome (Phase 3; auto-derive for now).

### Suggested build order (dependency-aware)

```
genome.ts types
   → page_genomes table + storage methods (backend/storage.ts)
   → genomeFromProfile()  ──┐
   → binding-resolver       ├─→ GenomeRenderer + renderers → CTA bridge
   → validator              ┘
   → draft/publish API (/api/dashboard/genome, /api/profiles/:username/genome)
   → minimal property editor (dashboard)
   → wire profile.tsx fallback + OG tags
```

New endpoints needed (small, additive): `GET/PUT /api/dashboard/genome` (creator draft, `isAuthenticated`), `POST /api/dashboard/genome/publish`, and `GET /api/profiles/:username/genome` (public, published only). Everything else reuses existing routes.

---

## 8. Phased roadmap (full vision)

| Phase | Name | Adds | Outcome |
| --- | --- | --- | --- |
| **1** | Genome foundation | Table, types, resolver, renderer (hero/stack/grid), CTA bridge, basic editor, draft/publish, validator | Data-driven page; creators tweak properties; safe fallback. *(this doc's focus)* |
| **1.5** | AI generation | Claude API → genome JSON, validated against §3 schema; brand-extraction conversation | Creator describes a vibe; AI emits a genome they can still hand-edit (P4). |
| **2** | Section composition | Add/remove objects, section palette, full reorder, `split` layout, full CTA coverage incl. physical products | Genuine layout differentiation between creators. |
| **3** | Editorial layouts | Pretext-style canvas text measurement, `editorial`/`freeform`, text wrap around media, separate mobile genome | Magazine-quality, flagship design. |
| **4** | AI optimization | Per-genome conversion analytics, AI layout suggestions, A/B genome testing | Self-optimizing pages. |

---

## 9. Risks & guardrails

- **Genome schema churn.** Until §3 is frozen, AI + editor + renderer can drift. Mitigation: `schemaVersion` field from day one; a single `shared/genome.ts` imported everywhere; the validator as the gate.
- **Performance.** One data bundle per page (already how `profile.tsx` works); resolver is pure/memoized; styles are static Tailwind class maps — no runtime CSS generation. Watch genome size; cap sections/objects per page in the validator.
- **SEO during CSR phase.** Covered by extending `backend/ogTags.ts` with genome-derived title/description/OG image. Full SSR is the Phase-2 fix, consciously deferred.
- **Adoption disruption.** Opt-in publish + auto-fallback means zero forced migration; existing pages keep working until a creator publishes a genome.
- **Moat integrity.** The CTA bridge must *only* mount platform components — never allow a `toolkit` that points to an external URL for transactional actions (PFD §5.1). Enforce in the validator: `booking`/`event`/`product_*` systems require a resolvable internal `entityRef`.

---

## 10. Decisions summary

| Open question (PFD §5.2) | Phase-1 decision |
| --- | --- |
| Rendering strategy | Client-side React now; OG tags for SEO; SSR/edge in Phase 2+ |
| AI model | None in Phase 1; Claude API → validated genome JSON in Phase 1.5 |
| Genome storage | **Dedicated `page_genomes` table**, draft+published rows, version-ready |
| Mobile layout | Auto-derived from desktop genome |
| Migration path | Auto-generate genome from existing profile; opt-in publish; auto-fallback |
| Template sharing | Deferred (JSON makes it natural later) |
| Phase-3 timing | Editorial layouts deferred to Phase 3 |

---

*This plan deliberately reuses every existing endpoint and section component. Phase 1 adds one table, one types file, one resolver, one renderer, and a small editor — and changes `profile.tsx` from a fixed layout into a genome host with a safe fallback. Nothing in the current booking/payment/guest-portal stack is rewritten.*
