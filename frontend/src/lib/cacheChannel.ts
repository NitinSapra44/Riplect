import type { QueryClient } from "@tanstack/react-query";
import { invalidate } from "./cacheInvalidation";

const CHANNEL_NAME = "riplect-cache-sync";

type CacheSyncEvent =
  | { type: "profile-updated" }
  | { type: "sessions-updated" }
  | { type: "availability-updated" }
  | { type: "events-updated" }
  | { type: "products-updated" }
  | { type: "blog-updated" }
  | { type: "locations-updated" }
  | { type: "tags-updated" }
  | { type: "bookings-updated" };

export function broadcast(event: CacheSyncEvent): void {
  try {
    const ch = new BroadcastChannel(CHANNEL_NAME);
    ch.postMessage(event);
    ch.close();
  } catch {}
}

export function listenForCacheSync(queryClient: QueryClient): () => void {
  try {
    const ch = new BroadcastChannel(CHANNEL_NAME);
    ch.onmessage = ({ data }: MessageEvent<CacheSyncEvent>) => {
      switch (data.type) {
        case "profile-updated":      invalidate.profile(queryClient); break;
        case "sessions-updated":     invalidate.sessions(queryClient); break;
        case "availability-updated": invalidate.availability(queryClient); break;
        case "events-updated":       invalidate.events(queryClient); break;
        case "products-updated":     invalidate.products(queryClient); break;
        case "blog-updated":         invalidate.blog(queryClient); break;
        case "locations-updated":    invalidate.locations(queryClient); break;
        case "tags-updated":         invalidate.tags(queryClient); break;
        case "bookings-updated":     invalidate.bookings(queryClient); break;
      }
    };
    return () => ch.close();
  } catch {
    return () => {};
  }
}
