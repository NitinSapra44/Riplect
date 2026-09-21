export type AnalyticsRuntime = "preview" | "production" | "unknown";

export interface AnalyticsEnvironmentInput {
  isDevBuild: boolean;
  mode: string;
  hostname?: string;
}

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);
const PREVIEW_HOST_SUFFIXES = [".replit.dev", ".repl.co"];

function normalizeHostname(hostname?: string): string | undefined {
  if (!hostname) return undefined;

  return hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .split(":")[0];
}

/**
 * Replit Preview normally runs through Vite's development server, but a
 * preview can also be opened from a Replit development hostname after a
 * production-mode build. Check both signals so analytics cannot be enabled
 * accidentally in either form of Preview.
 */
export function getAnalyticsRuntime({
  isDevBuild,
  mode,
  hostname,
}: AnalyticsEnvironmentInput): AnalyticsRuntime {
  const normalizedHostname = normalizeHostname(hostname);

  if (
    isDevBuild ||
    mode === "development" ||
    (normalizedHostname &&
      (LOCAL_HOSTNAMES.has(normalizedHostname) ||
        PREVIEW_HOST_SUFFIXES.some(
          (suffix) =>
            normalizedHostname === suffix.slice(1) ||
            normalizedHostname.endsWith(suffix),
        )))
  ) {
    return "preview";
  }

  if (mode === "production" && normalizedHostname) {
    return "production";
  }

  // Unknown environments stay disabled by the analytics policy.
  return "unknown";
}

export function isAnalyticsAllowed(environment: AnalyticsEnvironmentInput): boolean {
  return getAnalyticsRuntime(environment) === "production";
}