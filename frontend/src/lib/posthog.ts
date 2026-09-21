import posthogSdk, { type PostHog } from "posthog-js";
import { isAnalyticsAllowed } from "./analytics-environment";

const key = import.meta.env.VITE_POSTHOG_KEY;
const host = import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com";

const analyticsAllowed = isAnalyticsAllowed({
  isDevBuild: import.meta.env.DEV,
  mode: import.meta.env.MODE,
  hostname: typeof window === "undefined" ? undefined : window.location.hostname,
});

/**
 * This is intentionally false for Preview, even when a PostHog key is
 * configured in shared Replit environment variables. The shared variables
 * are also available to the Preview workflow, so the key alone cannot be
 * used as an enablement signal.
 */
export const isPostHogEnabled = analyticsAllowed && Boolean(key);

const disabledPostHog = {
  capture: () => undefined,
  identify: () => undefined,
  reset: () => undefined,
  setPersonProperties: () => undefined,
} as unknown as PostHog;

// Existing call sites import this facade. In Preview they receive no-op
// methods rather than the SDK methods, so events cannot queue or be sent
// before/without initialization.
export const posthog: PostHog = isPostHogEnabled ? posthogSdk : disabledPostHog;

export function initPostHog(): void {
  if (!isPostHogEnabled || posthogSdk.__loaded) return;

  posthogSdk.init(key, {
    api_host: host,
    autocapture: true,
    capture_exceptions: true,
    enable_recording_console_log: true,
    session_recording: {
      maskAllInputs: true,
    },
  });
}
