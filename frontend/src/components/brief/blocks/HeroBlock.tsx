import type { Brand, Section } from "@shared/brief";
import type { ProfileBundle } from "@/hooks/useProfileBundle";
import { CtaButton } from "../CtaButton";
import { heroHeadingClass } from "../theme";

/**
 * Hero — the only place (besides about/contact) where the Brief carries short
 * connective copy. Headline/tagline fall back to the creator's REAL profile
 * fields, so nothing is ever invented.
 */
export function HeroBlock({
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
  const profile = bundle.profile;
  const headline = section.copy?.headline?.trim() || profile?.displayName || username;
  const tagline = section.copy?.tagline?.trim() || profile?.title || profile?.shortBio || "";
  const eyebrow = section.copy?.eyebrow?.trim();
  const image = profile?.profileImageUrl;
  const ctas = section.ctas ?? [];
  const variant = section.variant;

  const headingStyle = { fontFamily: "var(--rk-font-heading)", color: "var(--rk-text)" } as const;
  const ctaRow = ctas.length > 0 && (
    <div className={`flex flex-wrap gap-3 ${variant === "split" ? "" : "justify-center"}`}>
      {ctas.map((c) => (
        <CtaButton key={c.id} cta={c} bundle={bundle} username={username} creatorName={creatorName} />
      ))}
    </div>
  );
  const eyebrowEl = (cls = "") =>
    eyebrow ? (
      <div
        className={`mb-3 text-xs font-semibold uppercase tracking-[0.2em] ${cls}`}
        style={{ color: "var(--rk-primary)" }}
      >
        {eyebrow}
      </div>
    ) : null;

  // "feature" — full-bleed image background with a dark overlay. The most
  // editorial, "designed" hero; falls back to spotlight if there's no image.
  if (variant === "feature" && image) {
    return (
      <div
        className="relative mx-auto max-w-5xl overflow-hidden px-6 py-24 text-center sm:py-32"
        style={{ borderRadius: "calc(var(--rk-radius) * 1.25)" }}
      >
        <img src={image} alt={headline} className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.35), rgba(0,0,0,0.65))" }} />
        <div className="relative">
          {eyebrowEl("text-white/80")}
          <h1 className={`font-extrabold leading-[1.05] text-white ${heroHeadingClass(brand.typography.scale)}`} style={{ fontFamily: "var(--rk-font-heading)" }}>
            {headline}
          </h1>
          {tagline && <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-white/85">{tagline}</p>}
          <div className="mt-8">{ctaRow}</div>
        </div>
      </div>
    );
  }

  if (variant === "split") {
    return (
      <div className="mx-auto grid max-w-5xl grid-cols-1 items-center gap-10 px-6 md:grid-cols-2">
        <div className="space-y-5">
          {eyebrowEl()}
          <h1 className={`font-extrabold leading-[1.05] ${heroHeadingClass(brand.typography.scale)}`} style={headingStyle}>
            {headline}
          </h1>
          {tagline && (
            <p className="text-lg leading-relaxed" style={{ color: "var(--rk-muted)" }}>
              {tagline}
            </p>
          )}
          {ctaRow}
        </div>
        {image && (
          <div className="order-first md:order-last">
            <img
              src={image}
              alt={headline}
              className="mx-auto aspect-square w-full max-w-sm object-cover shadow-xl"
              style={{ borderRadius: "var(--rk-radius)" }}
            />
          </div>
        )}
      </div>
    );
  }

  if (variant === "spotlight") {
    return (
      <div
        className="mx-auto max-w-4xl px-6 py-14 text-center"
        style={{
          background: "linear-gradient(160deg, var(--rk-primary-soft), var(--rk-accent-soft))",
          borderRadius: "calc(var(--rk-radius) * 1.5)",
        }}
      >
        {image && (
          <img
            src={image}
            alt={headline}
            className="mx-auto mb-6 h-28 w-28 rounded-full object-cover shadow-lg ring-4 ring-white/70"
          />
        )}
        {eyebrowEl()}
        <h1 className={`font-extrabold leading-[1.05] ${heroHeadingClass(brand.typography.scale)}`} style={headingStyle}>
          {headline}
        </h1>
        {tagline && (
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed" style={{ color: "var(--rk-muted)" }}>
            {tagline}
          </p>
        )}
        <div className="mt-8">{ctaRow}</div>
      </div>
    );
  }

  // centered (default) & minimal
  return (
    <div className="mx-auto max-w-3xl px-6 text-center">
      {variant !== "minimal" && image && (
        <img
          src={image}
          alt={headline}
          className="mx-auto mb-6 h-28 w-28 rounded-full object-cover shadow-lg md:h-32 md:w-32"
          style={{ outline: "3px solid var(--rk-primary-soft)" }}
        />
      )}
      {eyebrowEl()}
      <h1 className={`font-extrabold leading-[1.05] ${heroHeadingClass(brand.typography.scale)}`} style={headingStyle}>
        {headline}
      </h1>
      {tagline && (
        <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed" style={{ color: "var(--rk-muted)" }}>
          {tagline}
        </p>
      )}
      <div className="mt-8">{ctaRow}</div>
    </div>
  );
}
