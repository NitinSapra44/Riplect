/**
 * Decide whether an email domain is "Google managed" — i.e. either a
 * consumer Gmail account or a Google Workspace domain.
 *
 * Two complementary mechanisms are used, both cached:
 *
 *  1. **Google OIDC discovery** (`accounts.google.com/.well-known/
 *     openid-configuration`). Fetched once at first use and cached in
 *     process. The result tells us Google's OIDC service is reachable
 *     and gives us its issuer + jwks_uri, which the route handler uses
 *     to verify Google ID tokens. Without this fetch we'd be relying
 *     on hard-coded Google endpoints; treating the discovery doc as
 *     the source of truth is the OIDC-spec-correct way to do it. We
 *     refuse to classify any domain as Google-managed if the discovery
 *     fetch fails (security default: prefer the email-link path).
 *
 *  2. **Per-domain MX lookup**. Workspace-hosted domains route mail to
 *     `aspmx.l.google.com` (and friends). This is the only practical
 *     per-domain signal — Google does not expose a per-domain OIDC
 *     discovery endpoint, and the Workspace Admin SDK requires admin
 *     auth on the target tenant. The per-domain MX result is cached
 *     in-process for an hour to avoid hammering DNS.
 *
 * The exported function returns `true` only when **both** signals
 * agree (Google's OIDC is reachable AND the domain's MX is Google-hosted),
 * so a transient OIDC outage will degrade safely to the email-link path.
 */
import { promises as dns } from "node:dns";

const ALWAYS_GOOGLE = new Set(["gmail.com", "googlemail.com", "google.com"]);

const GOOGLE_MX_PATTERN =
  /(^|\.)(google\.com|googlemail\.com|aspmx\.l\.google\.com|gsuite\.com|googlemail\.l\.google\.com)$/i;

const PER_DOMAIN_TTL_MS = 60 * 60 * 1000; // 1 hour
const OIDC_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const perDomainCache = new Map<string, { isGoogle: boolean; expiresAt: number }>();

interface GoogleOidcConfig {
  issuer: string;
  jwksUri: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  expiresAt: number;
}

let oidcCache: GoogleOidcConfig | null = null;
let oidcInflight: Promise<GoogleOidcConfig | null> | null = null;

const GOOGLE_OIDC_DISCOVERY_URL = "https://accounts.google.com/.well-known/openid-configuration";
const EXPECTED_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

async function fetchOidcDiscovery(): Promise<GoogleOidcConfig | null> {
  try {
    const res = await fetch(GOOGLE_OIDC_DISCOVERY_URL, {
      // 5s budget so a slow network doesn't block onboarding.
      signal: AbortSignal.timeout(5000),
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as Record<string, unknown>;
    const issuer = String(body.issuer ?? "");
    const jwksUri = String(body.jwks_uri ?? "");
    if (!EXPECTED_ISSUERS.has(issuer) || !jwksUri.startsWith("https://")) {
      return null;
    }
    return {
      issuer,
      jwksUri,
      authorizationEndpoint: typeof body.authorization_endpoint === "string" ? body.authorization_endpoint : undefined,
      tokenEndpoint: typeof body.token_endpoint === "string" ? body.token_endpoint : undefined,
      expiresAt: Date.now() + OIDC_TTL_MS,
    };
  } catch {
    return null;
  }
}

/**
 * Returns Google's OIDC discovery config (cached). Returns `null` when
 * Google's OIDC service is unreachable AND we don't have a recent enough
 * cached value — callers should treat null as "Google sign-in is not
 * currently available" and fall back to the email-link path.
 *
 * On refresh failure we permit a *bounded* stale read (`STALE_GRACE_MS`)
 * to ride out brief network blips, but anything older is treated as
 * unavailable so a multi-day outage cannot silently leave the system
 * eligibility-positive.
 */
const STALE_GRACE_MS = 60 * 60 * 1000; // 1h beyond expiry
export async function getGoogleOidcConfig(): Promise<GoogleOidcConfig | null> {
  if (oidcCache && oidcCache.expiresAt > Date.now()) return oidcCache;
  if (oidcInflight) return oidcInflight;
  oidcInflight = (async () => {
    const fresh = await fetchOidcDiscovery();
    if (fresh) {
      oidcCache = fresh;
      return fresh;
    }
    // Refresh failed: serve cached config only if within the stale
    // grace window. Beyond that, return null so eligibility decisions
    // safely degrade to the email-link path.
    if (oidcCache && oidcCache.expiresAt + STALE_GRACE_MS > Date.now()) {
      return oidcCache;
    }
    return null;
  })().finally(() => {
    oidcInflight = null;
  });
  return oidcInflight;
}

async function isMxGoogleHosted(domain: string): Promise<boolean> {
  const cached = perDomainCache.get(domain);
  if (cached && cached.expiresAt > Date.now()) return cached.isGoogle;

  let isGoogle = false;
  try {
    const records = await dns.resolveMx(domain);
    isGoogle = records.some((r) => GOOGLE_MX_PATTERN.test(r.exchange.toLowerCase()));
  } catch {
    isGoogle = false;
  }

  perDomainCache.set(domain, { isGoogle, expiresAt: Date.now() + PER_DOMAIN_TTL_MS });
  return isGoogle;
}

/**
 * Returns `true` only when:
 *   - the domain is a known Google consumer domain (gmail.com, etc.), or
 *   - Google's OIDC discovery doc was reachable AND the domain's MX
 *     records point at Google.
 *
 * This conservative AND of the two signals means a transient OIDC
 * outage degrades safely to the email-link path (no false-positive
 * "use Google" recommendation we can't honor).
 */
export async function isGoogleManagedDomain(email: string): Promise<boolean> {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1).toLowerCase().trim();
  if (!domain) return false;
  if (ALWAYS_GOOGLE.has(domain)) {
    // Even for gmail.com, require Google's OIDC to be reachable so we
    // never recommend a flow we can't complete.
    const cfg = await getGoogleOidcConfig();
    return cfg !== null;
  }

  const [cfg, mxIsGoogle] = await Promise.all([getGoogleOidcConfig(), isMxGoogleHosted(domain)]);
  return cfg !== null && mxIsGoogle;
}
