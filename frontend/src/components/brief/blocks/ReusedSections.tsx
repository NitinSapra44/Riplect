import type { Section, SectionKind } from "@shared/brief";
import type { ProfileBundle } from "@/hooks/useProfileBundle";

// Reuse the EXISTING section components, mounted as-is. We never modify their
// files; the Brief only decides whether/where they appear and themes the chrome
// around them via CSS variables. Each returns null when its data is empty, so
// "the page is the data" stays safe and a newly-added category appears live.
import { BookingSection } from "@/components/booking-section";
import { EventsSection } from "@/components/events-section";
import { ProductsSection } from "@/components/products-section";
import { PhysicalProductsSection } from "@/components/physical-products-section";
import { BlogSection } from "@/components/blog-section";
import { GallerySection } from "@/components/gallery-section";
import { TestimonialsSection } from "@/components/testimonials-section";

const has = (a?: any[] | null) => Array.isArray(a) && a.length > 0;

export function isReusedKind(kind: SectionKind): boolean {
  return [
    "sessions",
    "events",
    "products",
    "physicalProducts",
    "blog",
    "gallery",
    "testimonials",
  ].includes(kind);
}

/** Returns true if a reused section currently has data (used to self-hide). */
export function reusedHasData(kind: SectionKind, bundle: ProfileBundle): boolean {
  switch (kind) {
    case "sessions":
      return has(bundle.sessions);
    case "events":
      return has(bundle.events);
    case "products":
      return has(bundle.products);
    case "physicalProducts":
      return has(bundle.physicalProducts);
    case "blog":
      return has(bundle.blogs);
    case "gallery":
      return has(bundle.profile?.galleryImages);
    case "testimonials":
      return has(bundle.profile?.testimonials);
    default:
      return false;
  }
}

export function ReusedSectionBlock({
  section,
  bundle,
}: {
  section: Section;
  bundle: ProfileBundle;
}) {
  const { profile } = bundle;
  // The Brief's chosen layout variant — finally wired into the real components,
  // which each accept an optional `variant` that re-arranges the SAME card markup.
  const v = section.variant;
  const inner = (() => {
    switch (section.kind) {
      case "sessions":
        // Booking keeps its calendar/dialog flow; it re-themes via the scoped
        // .rk-page token + rescue layer rather than a variant prop.
        return has(bundle.sessions) ? (
          <BookingSection
            sessions={bundle.sessions as any}
            profileId={profile!.id}
            username={profile!.username}
            displayName={profile!.displayName || undefined}
          />
        ) : null;
      case "events":
        return has(bundle.events) ? (
          <EventsSection
            events={bundle.events as any}
            username={profile!.username}
            creatorName={profile!.displayName || ""}
            variant={v}
          />
        ) : null;
      case "products":
        return has(bundle.products) ? (
          <ProductsSection products={bundle.products as any} username={profile!.username} variant={v} />
        ) : null;
      case "physicalProducts":
        return has(bundle.physicalProducts) ? (
          <PhysicalProductsSection products={bundle.physicalProducts as any} variant={v} />
        ) : null;
      case "blog":
        return has(bundle.blogs) ? <BlogSection posts={bundle.blogs as any} variant={v} /> : null;
      case "gallery":
        return has(profile?.galleryImages) ? (
          <GallerySection images={profile!.galleryImages || []} variant={v} />
        ) : null;
      case "testimonials":
        return has(profile?.testimonials) ? (
          <TestimonialsSection testimonials={profile!.testimonials as any} variant={v} />
        ) : null;
      default:
        return null;
    }
  })();

  return inner;
}
