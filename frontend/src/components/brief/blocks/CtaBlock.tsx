import type { Brand, Section } from "@shared/brief";
import type { ProfileBundle } from "@/hooks/useProfileBundle";
import { CtaButton } from "../CtaButton";
import { sectionHeadingClass } from "../theme";

/**
 * A branded call-to-action banner — connective, editorial rhythm and a strong
 * closer. It carries no invented content: the heading/subhead are short
 * connective copy from the Brief, and the buttons are typed CTAs resolved
 * against live data (so they're never dead). Three variants:
 *   - band:    a full primary→accent gradient panel (the marquee closer)
 *   - split:   heading on the left, buttons on the right
 *   - minimal: quiet centered text + buttons, no panel
 */
export function CtaBlock({
  section,
  bundle,
  brand,
  username,
  creatorName,
}: {
  section: Section;
  bundle: ProfileBundle;
  brand: Brand;
  username: string;
  creatorName: string;
}) {
  const eyebrow = section.copy?.eyebrow?.trim();
  const heading = section.copy?.headline?.trim() || "Ready when you are";
  const tagline = section.copy?.tagline?.trim();
  const ctas = section.ctas ?? [];
  const variant = section.variant;

  if (ctas.length === 0 && !tagline && !eyebrow) {
    // Nothing actionable to show — don't render an empty banner.
    if (section.copy?.headline == null) return null;
  }

  const headingEl = (
    <h2
      className={`font-bold ${sectionHeadingClass(brand.typography.scale)}`}
      style={{ fontFamily: "var(--rk-font-heading)" }}
    >
      {heading}
    </h2>
  );

  const ctaButtons = (justify: string) =>
    ctas.length > 0 && (
      <div className={`flex flex-wrap gap-3 ${justify}`}>
        {ctas.map((c) => (
          <CtaButton key={c.id} cta={c} bundle={bundle} username={username} creatorName={creatorName} />
        ))}
      </div>
    );

  if (variant === "minimal") {
    return (
      <div className="mx-auto max-w-3xl px-6 text-center" style={{ color: "var(--rk-text)" }}>
        {eyebrow && (
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--rk-primary)" }}>
            {eyebrow}
          </div>
        )}
        {headingEl}
        {tagline && (
          <p className="mx-auto mt-3 max-w-xl text-lg" style={{ color: "var(--rk-muted)" }}>
            {tagline}
          </p>
        )}
        <div className="mt-6 flex justify-center">{ctaButtons("justify-center")}</div>
      </div>
    );
  }

  if (variant === "split") {
    return (
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div
          className="flex flex-col items-start justify-between gap-6 p-8 sm:flex-row sm:items-center"
          style={{
            background: "linear-gradient(135deg, var(--rk-primary-soft), var(--rk-accent-soft))",
            borderRadius: "calc(var(--rk-radius) * 1.25)",
            color: "var(--rk-text)",
          }}
        >
          <div>
            {eyebrow && (
              <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--rk-primary)" }}>
                {eyebrow}
              </div>
            )}
            {headingEl}
            {tagline && (
              <p className="mt-2 text-base" style={{ color: "var(--rk-muted)" }}>
                {tagline}
              </p>
            )}
          </div>
          <div className="shrink-0">{ctaButtons("")}</div>
        </div>
      </div>
    );
  }

  // "band" (default) — the marquee soft-gradient closer panel. A soft (not solid)
  // background keeps the brand-colored CTAs readable on top.
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6">
      <div
        className="px-6 py-14 text-center sm:px-10"
        style={{
          background: "linear-gradient(135deg, var(--rk-primary-soft), var(--rk-accent-soft))",
          borderRadius: "calc(var(--rk-radius) * 1.25)",
          color: "var(--rk-text)",
        }}
      >
        {eyebrow && (
          <div
            className="mb-2 text-xs font-semibold uppercase tracking-[0.18em]"
            style={{ color: "var(--rk-primary)" }}
          >
            {eyebrow}
          </div>
        )}
        <h2
          className={`font-extrabold ${sectionHeadingClass(brand.typography.scale)}`}
          style={{ fontFamily: "var(--rk-font-heading)", color: "var(--rk-text)" }}
        >
          {heading}
        </h2>
        {tagline && (
          <p className="mx-auto mt-3 max-w-xl text-lg" style={{ color: "var(--rk-muted)" }}>
            {tagline}
          </p>
        )}
        <div className="mt-8 flex justify-center">{ctaButtons("justify-center")}</div>
      </div>
    </div>
  );
}
