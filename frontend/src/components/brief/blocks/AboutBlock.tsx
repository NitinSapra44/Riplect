import type { Brand, Section } from "@shared/brief";
import type { ProfileBundle } from "@/hooks/useProfileBundle";
import { sectionHeadingClass } from "../theme";

/** About — connective narrative anchored on the creator's real bio. Self-hides
 *  when there is no bio to show. */
export function AboutBlock({
  section,
  bundle,
  brand,
}: {
  section: Section;
  bundle: ProfileBundle;
  brand: Brand;
}) {
  const profile = bundle.profile;
  const body = (profile?.longBio || profile?.shortBio || profile?.bio || "").trim();
  if (!body) return null;

  const image =
    profile?.longBioImageUrl || profile?.shortBioImageUrl || profile?.profileImageUrl || null;
  const heading = section.copy?.headline?.trim() || "About";
  const variant = section.variant;

  const Title = (
    <h2
      className={`mb-4 font-bold ${sectionHeadingClass(brand.typography.scale)}`}
      style={{ fontFamily: "var(--rk-font-heading)", color: "var(--rk-text)" }}
    >
      {heading}
    </h2>
  );
  const Body = (
    <div className="space-y-4 whitespace-pre-line text-[17px] leading-relaxed" style={{ color: "var(--rk-muted)" }}>
      {body}
    </div>
  );

  if (variant === "quote") {
    return (
      <div className="mx-auto max-w-3xl px-6 text-center">
        <div
          className="text-2xl font-medium leading-snug sm:text-3xl"
          style={{ fontFamily: "var(--rk-font-heading)", color: "var(--rk-text)" }}
        >
          <span style={{ color: "var(--rk-primary)" }}>“</span>
          {section.copy?.tagline?.trim() || body.slice(0, 240)}
          <span style={{ color: "var(--rk-primary)" }}>”</span>
        </div>
        {profile?.displayName && (
          <p className="mt-5 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--rk-muted)" }}>
            {profile.displayName}
          </p>
        )}
      </div>
    );
  }

  if ((variant === "imageLeft" || variant === "imageRight") && image) {
    return (
      <div className="mx-auto grid max-w-5xl grid-cols-1 items-center gap-10 px-6 md:grid-cols-2">
        <div className={variant === "imageRight" ? "md:order-last" : ""}>
          <img
            src={image}
            alt={heading}
            className="aspect-[4/5] w-full object-cover shadow-lg"
            style={{ borderRadius: "var(--rk-radius)" }}
          />
        </div>
        <div>
          {Title}
          {Body}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6">
      {Title}
      {Body}
    </div>
  );
}
