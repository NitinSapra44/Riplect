import { useQuery } from "@tanstack/react-query";
import type {
  Profile,
  BookingSession,
  DigitalProduct,
  PhysicalProduct,
  BlogPost,
  EventWithExtras,
} from "@shared/schema";

/**
 * The same live-data bundle that profile.tsx already fetches, extracted into one
 * reusable hook. Uses the identical query keys, so TanStack Query dedupes and
 * shares the cache with the existing profile page (no extra network calls).
 *
 * The renderer binds to THIS — it never bakes content into the Brief, so a new
 * session / event / swapped photo shows up live with no regeneration.
 */
export interface ProfileBundle {
  profile: any | undefined;
  sessions: BookingSession[];
  events: EventWithExtras[];
  products: DigitalProduct[];
  physicalProducts: PhysicalProduct[];
  blogs: BlogPost[];
  isLoading: boolean;
  error: unknown;
}

export function useProfileBundle(username: string | undefined): ProfileBundle {
  const enabled = !!username;

  const { data: profile, isLoading, error } = useQuery({
    queryKey: ["/api/profiles", username],
    enabled,
  }) as { data: Profile | undefined; isLoading: boolean; error: unknown };

  const { data: products = [] } = useQuery({
    queryKey: ["/api/profiles", username, "products"],
    enabled,
  }) as { data: DigitalProduct[] };

  const { data: physicalProducts = [] } = useQuery({
    queryKey: ["/api/profiles", username, "physical-products"],
    enabled,
  }) as { data: PhysicalProduct[] };

  const { data: blogs = [] } = useQuery({
    queryKey: ["/api/profiles", username, "blog"],
    enabled,
  }) as { data: BlogPost[] };

  const { data: events = [] } = useQuery<EventWithExtras[]>({
    queryKey: ["/api/profiles", username, "events"],
    enabled,
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["/api/profiles", username, "sessions"],
    enabled,
  }) as { data: BookingSession[] };

  return { profile, sessions, events, products, physicalProducts, blogs, isLoading, error };
}
