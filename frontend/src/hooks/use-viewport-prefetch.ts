import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";

/**
 * Viewport-driven prefetch with throttling + caps.
 *
 * A card registers itself + the query keys its detail page will need. When the
 * card stays in the viewport long enough (dwell), we warm those queries through
 * TanStack Query's cache, so navigating to the detail page is instant.
 *
 * Burst protection (the three knobs the feature was asked for):
 *  - dwellMs:        a card must stay visible this long before we prefetch, so
 *                    fast scrolling past dozens of cards triggers nothing.
 *  - maxConcurrent:  at most this many prefetch batches are in flight at once.
 *  - maxPrefetches:  hard ceiling on total prefetches for the page's lifetime;
 *                    once hit, the observer disconnects entirely.
 *
 * Cards dedupe by a stable `id`, so re-entering the viewport never re-fetches.
 */

export interface PrefetchSpec {
  /** One or more query keys to warm. Must match the detail page's keys exactly. */
  queryKeys: QueryKey[];
}

export interface ViewportPrefetchController {
  register: (el: Element, id: string, getSpec: () => PrefetchSpec) => void;
  unregister: (el: Element) => void;
}

interface Options {
  maxPrefetches?: number;
  dwellMs?: number;
  maxConcurrent?: number;
  rootMargin?: string;
}

export function useViewportPrefetch(options: Options = {}): ViewportPrefetchController {
  const {
    maxPrefetches = 20,
    dwellMs = 300,
    maxConcurrent = 3,
    rootMargin = "200px",
  } = options;

  const queryClient = useQueryClient();

  const state = useRef({
    observer: null as IntersectionObserver | null,
    specs: new Map<Element, { id: string; getSpec: () => PrefetchSpec }>(),
    timers: new Map<Element, ReturnType<typeof setTimeout>>(),
    done: new Set<string>(),
    count: 0,
    inFlight: 0,
    queue: [] as Array<() => Promise<void>>,
  });

  // Drain the queue while respecting the concurrency cap.
  const drain = useCallback(() => {
    const s = state.current;
    while (s.inFlight < maxConcurrent && s.queue.length > 0) {
      const task = s.queue.shift()!;
      s.inFlight++;
      task().finally(() => {
        s.inFlight--;
        drain();
      });
    }
  }, [maxConcurrent]);

  // Decide whether a now-dwelled card should be prefetched, then enqueue it.
  const schedule = useCallback(
    (el: Element) => {
      const s = state.current;
      if (s.count >= maxPrefetches) {
        s.observer?.disconnect();
        return;
      }
      const meta = s.specs.get(el);
      if (!meta || s.done.has(meta.id)) return;

      s.done.add(meta.id);
      s.count++;
      // Already warmed — no need to keep watching this element.
      s.observer?.unobserve(el);

      const spec = meta.getSpec();
      s.queue.push(async () => {
        await Promise.all(
          spec.queryKeys.map((queryKey) =>
            queryClient.prefetchQuery({ queryKey }).catch(() => {}),
          ),
        );
      });
      drain();

      if (s.count >= maxPrefetches) s.observer?.disconnect();
    },
    [maxPrefetches, queryClient, drain],
  );

  // Keep the observer's callback pointed at the latest schedule fn without
  // recreating the observer (which is built lazily, once).
  const scheduleRef = useRef(schedule);
  scheduleRef.current = schedule;

  const ensureObserver = useCallback(() => {
    const s = state.current;
    if (s.observer) return s.observer;
    s.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target;
          if (entry.isIntersecting) {
            // Start the dwell timer; ignore if one is already pending.
            if (s.timers.has(el)) continue;
            const t = setTimeout(() => {
              s.timers.delete(el);
              scheduleRef.current(el);
            }, dwellMs);
            s.timers.set(el, t);
          } else {
            // Left before dwell elapsed (fast scroll) — cancel.
            const t = s.timers.get(el);
            if (t) {
              clearTimeout(t);
              s.timers.delete(el);
            }
          }
        }
      },
      { rootMargin },
    );
    return s.observer;
  }, [dwellMs, rootMargin]);

  const register = useCallback(
    (el: Element, id: string, getSpec: () => PrefetchSpec) => {
      const s = state.current;
      if (s.done.has(id) || s.count >= maxPrefetches) return;
      s.specs.set(el, { id, getSpec });
      ensureObserver().observe(el);
    },
    [ensureObserver, maxPrefetches],
  );

  const unregister = useCallback((el: Element) => {
    const s = state.current;
    s.observer?.unobserve(el);
    s.specs.delete(el);
    const t = s.timers.get(el);
    if (t) {
      clearTimeout(t);
      s.timers.delete(el);
    }
  }, []);

  // Tear everything down on unmount.
  useEffect(() => {
    const s = state.current;
    return () => {
      s.observer?.disconnect();
      s.observer = null;
      s.timers.forEach((t) => clearTimeout(t));
      s.timers.clear();
      s.specs.clear();
    };
  }, []);

  return useMemo(() => ({ register, unregister }), [register, unregister]);
}

/**
 * Attaches a card element to a {@link ViewportPrefetchController}. Returns a ref
 * to spread onto the card's root element. `id` must be stable per card (used for
 * dedupe); `getSpec` may close over fresh values each render.
 */
export function usePrefetchInView<T extends HTMLElement = HTMLDivElement>(
  controller: ViewportPrefetchController,
  id: string,
  getSpec: () => PrefetchSpec,
) {
  const ref = useRef<T | null>(null);
  const specRef = useRef(getSpec);
  specRef.current = getSpec;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    controller.register(el, id, () => specRef.current());
    return () => controller.unregister(el);
  }, [controller, id]);

  return ref;
}
