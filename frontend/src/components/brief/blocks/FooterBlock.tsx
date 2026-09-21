import { Link } from "wouter";
import type { Section } from "@shared/brief";
import type { ProfileBundle } from "@/hooks/useProfileBundle";

/** Footer — minimal, branded sign-off. Keeps the platform's "Join Riplect"
 *  attribution without duplicating the heavy profile footer. */
export function FooterBlock({ section, bundle }: { section: Section; bundle: ProfileBundle }) {
  const name = bundle.profile?.displayName || bundle.profile?.username || "";
  const tagline = section.copy?.tagline?.trim();
  const year = new Date().getFullYear();

  return (
    <div className="mx-auto max-w-3xl px-6 text-center">
      <div
        className="text-xl font-bold"
        style={{ fontFamily: "var(--rk-font-heading)", color: "var(--rk-text)" }}
      >
        {name}
      </div>
      {tagline && (
        <p className="mt-2 text-sm" style={{ color: "var(--rk-muted)" }}>
          {tagline}
        </p>
      )}
      <p className="mt-6 text-xs" style={{ color: "var(--rk-muted)" }}>
        © {year} {name}
        {" · "}
        <Link href="/" className="underline-offset-2 hover:underline">
          Made with Riplect
        </Link>
      </p>
    </div>
  );
}
