// server/brief/bundle.ts
//
// Assembles a creator's LIVE content from the existing storage layer. This is
// the same data the public profile page reads — it is never copied into the
// Brief. Used by:
//   - briefFromProfile()  (to decide which sections to include)
//   - normalizeBrief()     (to resolve typed CTAs against real entities)
//   - the AI generator     (as grounding context)
//   - ogTags               (to enrich SEO from a published Brief)

import { storage as dbStorage } from "../storage";
import type {
  Profile,
  BookingSession,
  Event,
  DigitalProduct,
  PhysicalProduct,
  BlogPost,
} from "@shared/schema";

export interface BriefBundle {
  profile: Profile;
  sessions: BookingSession[];
  events: Event[];
  products: DigitalProduct[];
  physicalProducts: PhysicalProduct[];
  blogs: BlogPost[];
}

export async function assembleBundle(profile: Profile): Promise<BriefBundle> {
  const [sessions, events, products, physicalProducts, blogs] = await Promise.all([
    safe(dbStorage.getBookingSessionsByProfileId(profile.id)),
    safe(dbStorage.getEventsByProfileId(profile.id)),
    safe(dbStorage.getDigitalProductsByProfileId(profile.id)),
    safe(dbStorage.getPhysicalProductsByProfileId(profile.id)),
    safe(dbStorage.getBlogPostsByProfileId(profile.id)),
  ]);
  return { profile, sessions, events, products, physicalProducts, blogs };
}

export async function assembleBundleByUsername(
  username: string,
): Promise<BriefBundle | null> {
  const profile = await dbStorage.getProfileByUsername(username);
  if (!profile) return null;
  return assembleBundle(profile);
}

/** Never let one empty/failed list break the whole bundle. */
async function safe<T>(p: Promise<T[]>): Promise<T[]> {
  try {
    return (await p) ?? [];
  } catch {
    return [];
  }
}
