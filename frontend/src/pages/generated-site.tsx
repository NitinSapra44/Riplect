import type { CSSProperties } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";

/**
 * Public viewer for a creator's AI-generated website (PROTOTYPE).
 * Route: /site/:username
 *
 * The generated HTML is rendered inside a sandboxed iframe so its CSS/JS is
 * fully isolated from the Riplek app. CTAs inside the HTML use target="_top",
 * so they escape the frame and navigate to the real Riplek booking/purchase
 * routes (allowed via allow-top-navigation-by-user-activation).
 */
export default function GeneratedSite() {
  const params = useParams();
  const username = (params as any).username as string;

  const { data, isLoading, isError } = useQuery<{ html: string }>({
    queryKey: [`/api/profiles/${username}/site`],
    queryFn: async () => {
      const res = await fetch(`/api/profiles/${username}/site`);
      if (!res.ok) throw new Error("not_found");
      return res.json();
    },
    retry: false,
  });

  if (isLoading) {
    return (
      <div style={centered}>
        <p style={{ color: "#666", fontFamily: "system-ui, sans-serif" }}>Loading…</p>
      </div>
    );
  }

  if (isError || !data?.html) {
    return (
      <div style={centered}>
        <div style={{ textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>No website yet</h1>
          <p style={{ color: "#666", marginBottom: 16 }}>
            This creator hasn't generated their website.
          </p>
          <Link href={`/${username}`} style={{ color: "#2563eb" }}>
            View their profile →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <iframe
      title={`${username} — website`}
      srcDoc={data.html}
      sandbox="allow-scripts allow-popups allow-top-navigation-by-user-activation allow-forms"
      style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", border: "none" }}
    />
  );
}

const centered: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "100vh",
};
