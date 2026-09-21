import type { PageBrief } from "@shared/brief";
import { useProfileBundle } from "@/hooks/useProfileBundle";
import { BrandProvider } from "./BrandProvider";
import { SectionRenderer, type EditorContext } from "./SectionRenderer";

/**
 * Renders a PageBrief into a live page by:
 *   1. fetching the creator's LIVE bundle once (shared cache with profile.tsx),
 *   2. writing the brand world to CSS variables (BrandProvider),
 *   3. mapping visible sections to blocks that reuse existing components.
 *
 * It binds to live data — content is never baked in — so new sessions/events and
 * a swapped profile photo appear automatically with no regeneration.
 */
export function BriefRenderer({
  username,
  brief,
  editor,
}: {
  username: string;
  brief: PageBrief;
  editor?: EditorContext;
}) {
  const bundle = useProfileBundle(username);

  if (bundle.isLoading && !bundle.profile) {
    return <BriefSkeleton />;
  }
  if (!bundle.profile) return null;

  const sections = (brief.sections ?? []).filter((s) => s.visible || !!editor);

  return (
    <BrandProvider brand={brief.brand} className="rk-page min-h-screen">
      {sections.map((section) => (
        <div key={section.id} className={section.visible ? "" : "opacity-40"}>
          <SectionRenderer
            section={section}
            bundle={bundle}
            brand={brief.brand}
            username={username}
            creatorName={bundle.profile?.displayName || ""}
            editor={editor}
          />
        </div>
      ))}
    </BrandProvider>
  );
}

function BriefSkeleton() {
  return (
    <div className="min-h-screen animate-pulse px-6 py-16">
      <div className="mx-auto max-w-3xl text-center">
        <div className="mx-auto mb-6 h-28 w-28 rounded-full bg-muted" />
        <div className="mx-auto mb-3 h-10 w-64 rounded bg-muted" />
        <div className="mx-auto h-5 w-80 rounded bg-muted" />
        <div className="mx-auto mt-8 flex justify-center gap-3">
          <div className="h-12 w-40 rounded-full bg-muted" />
          <div className="h-12 w-40 rounded-full bg-muted" />
        </div>
      </div>
      <div className="mx-auto mt-16 max-w-4xl space-y-4">
        <div className="h-32 rounded-2xl bg-muted" />
        <div className="h-32 rounded-2xl bg-muted" />
      </div>
    </div>
  );
}
