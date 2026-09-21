// Resolve the canonical absolute base URL for outbound links (emails, share
// messages, OAuth/Supabase redirects, agent-generated URLs, etc.).
//
// Resolution order:
//   1. PUBLIC_APP_URL  — canonical production URL (e.g. https://riplect.com)
//   2. APP_URL         — explicit override (used by some local dev setups)
//   3. REPLIT_DOMAINS  — derived only when NODE_ENV !== 'production' so the
//                        live deployment never falls back to a Replit subdomain
//   4. http://localhost:5000 — final dev fallback
//
// Single source of truth shared by `server/email/links.ts`, `server/routes.ts`,
// and the agent tools so outbound URLs always agree.
function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export function getAppBaseUrl(): string {
  if (process.env.PUBLIC_APP_URL) {
    return stripTrailingSlash(process.env.PUBLIC_APP_URL);
  }
  if (process.env.APP_URL) {
    return stripTrailingSlash(process.env.APP_URL);
  }
  if (process.env.NODE_ENV !== 'production' && process.env.REPLIT_DOMAINS) {
    return `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`;
  }
  return 'http://localhost:5000';
}

// Eagerly evaluated for backwards compatibility with modules that imported
// the constant. Prefer `getAppBaseUrl()` in new code.
export const APP_URL = getAppBaseUrl();

// Production Supabase-hosted Riplect horizontal mark — single source of
// truth for every transactional email. Permanent URL, identical across
// dev/staging/production environments and immune to image-blocking quirks
// in some email clients (image is loaded over HTTPS from a public CDN).
// Tightly-cropped white Riplect wordmark, designed to sit on the brand band.
export const LOGO_URL =
  "https://psrccktleltdthwzdtfx.supabase.co/storage/v1/object/public/public_assets/Branding/Cropped-Color%20Variations%20copy%204%40144x-2.png";

// Tagline shown below the logo on every email, mirroring the home page.
export const BRAND_TAGLINE = "Conscious Collective";

// Address for unsubscribe / email preference requests rendered in the footer.
export const UNSUBSCRIBE_EMAIL = "support@riplect.com";

// Brand palette — Direction C (Bold & Branded) using Riplect brand colours.
// Primary: dusty rose #b66667 · Cream: #FDF6EE · Dark accent: #171a21
export const BRAND = {
  primary: "#b66667",
  primarySoft: "rgba(182, 102, 103, 0.12)",
  primarySofter: "rgba(182, 102, 103, 0.06)",
  primaryBorder: "rgba(182, 102, 103, 0.18)",
  cream: "#FDF6EE",
  pageBg: "#F4F1EC",
  white: "#FFFFFF",
  ink: "#171a21",
  inkSoft: "rgba(23, 26, 33, 0.65)",
  inkSofter: "rgba(23, 26, 33, 0.45)",
  // Warm deep mulberry — a softer, refined alternative to pure black for
  // headlines and detail values. Sits comfortably between #171a21 (too cold)
  // and #b66667 (too bright).
  headline: "#5C3B3D",
  rule: "#ECE6DC",
  footerBg: "#171a21",
  footerText: "rgba(253, 246, 238, 0.6)",
  footerHeading: "rgba(253, 246, 238, 0.85)",
} as const;

// Display sans for headlines (Bold & Branded). Falls back to system sans
// so the email always renders cleanly even if Google Fonts is blocked.
export const DISPLAY_STACK =
  "'Space Grotesk', 'Helvetica Neue', Helvetica, Arial, sans-serif";
export const SANS_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
// Kept for backwards compatibility with any legacy import sites.
export const SERIF_STACK = DISPLAY_STACK;

export function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function sanitizeUrl(url: string | null | undefined): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    return escapeHtml(trimmed);
  }
  return '';
}
