import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { waitForSupabase } from "@/lib/supabase";
import { Loader2, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { posthog } from "@/lib/posthog";

export default function AuthCallback() {
  const [, setLocation] = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Authenticating...");
  // One-shot guard so the redirect / analytics capture only fire once even if
  // both `onAuthStateChange` and the immediate `getSession()` resolve a
  // session in the same tick.
  const handledRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    const handleCallback = async () => {
      try {
        const supabase = await waitForSupabase();
        if (cancelled) return;

        if (!supabase) {
          setError("Authentication is not configured");
          return;
        }

        const handle = async (accessToken: string) => {
          if (handledRef.current) return;
          handledRef.current = true;
          setStatus("Checking profile...");
          await checkProfileAndRedirect(accessToken);
        };

        // 1. Listen for the state change (handles email-link/OAuth redirects).
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          async (event, session) => {
            if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session) {
              await handle(session.access_token);
            }
          },
        );
        unsubscribe = () => subscription.unsubscribe();

        // 2. Fallback: check for an already-resolved session.
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (session) {
          await handle(session.access_token);
          return;
        }

        // 3. If a PKCE ?code= param is present, explicitly exchange it.
        //    detectSessionInUrl handles this automatically in the background,
        //    but calling exchangeCodeForSession() directly ensures it completes
        //    reliably before the fallback timer fires — especially important for
        //    email-verification links which use the PKCE flow (no hash).
        const searchParams = new URLSearchParams(window.location.search);
        const codeParam = searchParams.get("code");
        const hasCodeParam = !!codeParam;
        if (codeParam && !handledRef.current) {
          try {
            const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(codeParam);
            if (cancelled) return;
            if (exchangeData?.session && !handledRef.current) {
              await handle(exchangeData.session.access_token);
              return;
            }
            if (exchangeError) {
              console.warn("[auth-callback] exchangeCodeForSession error:", exchangeError.message);
            }
          } catch (exchangeErr) {
            console.warn("[auth-callback] exchangeCodeForSession threw:", exchangeErr);
          }
        }

        // 4. Still no session: wait a moment for the listener to resolve
        //    any in-flight token exchange (e.g. URL hash for OAuth /
        //    email-link, or PKCE code exchange above). If still nothing
        //    after the timeout, surface a clear error and a route back to
        //    /auth — even when a hash or code param is present (silent
        //    token-exchange failures otherwise leave the user stranded on
        //    the spinner).
        const hasAuthData = !!window.location.hash || hasCodeParam;
        const hashTimeoutMs = hasAuthData ? 8000 : 2000;
        fallbackTimer = setTimeout(async () => {
          if (cancelled || handledRef.current) return;
          const { data } = await supabase.auth.getSession();
          if (cancelled || handledRef.current) return;
          if (data.session) {
            await handle(data.session.access_token);
          } else if (hasAuthData) {
            // We had auth data (hash or code) but never got a session — exchange failed.
            setError("We couldn't complete sign-in from that link. Please try again.");
          } else {
            setLocation("/auth");
          }
        }, hashTimeoutMs);
      } catch (err: any) {
        console.error("Callback error:", err);
        if (!cancelled) setError(err.message || "Authentication failed");
      }
    };

    handleCallback();

    return () => {
      cancelled = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      if (unsubscribe) unsubscribe();
    };
  }, [setLocation]);

  const checkProfileAndRedirect = async (accessToken: string) => {
    try {
      const response = await fetch("/api/dashboard/profile", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      // Check for saved return URL from before login
      const returnTo = sessionStorage.getItem("returnTo");
      sessionStorage.removeItem("returnTo");

      // Method/from attribution: set on /auth in `recordMethodPicked`.
      // Default to "unknown" rather than guessing — keeps analytics honest if
      // the storage was lost (back/refresh/multi-tab) or this callback was
      // hit by a flow that didn't set it (e.g. OAuth redirect from a fresh
      // tab).
      const authMethod = sessionStorage.getItem("auth_method") || "unknown";
      sessionStorage.removeItem("auth_method");
      const authFrom = sessionStorage.getItem("auth_from") || undefined;
      sessionStorage.removeItem("auth_from");

      const eventProps = { method: authMethod, ...(authFrom ? { from: authFrom } : {}) };

      if (response.ok) {
        const profile = await response.json();

        // Routing rules (in priority order):
        //  - WhatsApp-bot signups in mid-claim → /whatsapp-verify
        //    (dedicated single-page flow; supersedes /onboarding for
        //    these users — they already gave us name/title/etc. in
        //    chat).
        //  - Profile exists + onboardingCompleted !== false -> /dashboard
        //    (treats undefined/null as "completed" for legacy users).
        //  - Profile exists + onboardingCompleted === false -> /onboarding
        //    (e.g. phone-first email-completion path).
        //  - 404 (no profile row) -> /onboarding from welcome step.
        if (profile && profile.requiresWhatsappEmailVerification === true) {
          posthog.capture("coach_signed_up", { ...eventProps, claim_flow: "whatsapp" });
          window.location.href = "/whatsapp-verify";
        } else if (profile && profile.onboardingCompleted !== false) {
          posthog.capture("coach_logged_in", eventProps);
          window.location.href = returnTo || "/dashboard";
        } else {
          // Profile exists but onboarding incomplete (e.g. bot-created
          // creator claiming for the first time). Drop them at the contact
          // step so they immediately see their just-verified credential
          // pre-filled+locked (Task #152's ContactStep handles the lock).
          posthog.capture("coach_signed_up", eventProps);
          window.location.href = "/onboarding?step=contact";
        }
      } else if (response.status === 404) {
        // No profile yet — brand new user. Start from the welcome step.
        posthog.capture("coach_signed_up", eventProps);
        window.location.href = "/onboarding";
      } else {
        // Fallback for server errors: default to return URL or dashboard so
        // the user is not stranded on the spinner.
        window.location.href = returnTo || "/dashboard";
      }
    } catch (profileError) {
      console.error("Error checking profile:", profileError);
      // If the check fails, safer to send them to onboarding so they aren't lost.
      window.location.href = "/onboarding";
    }
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center py-12 px-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <AlertCircle className="w-12 h-12 text-destructive" />
              <h2 className="text-xl font-semibold">Authentication Error</h2>
              <p className="text-muted-foreground">{error}</p>
              <Button variant="outline" onClick={() => setLocation("/auth")}>
                Return to Login
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-[#b66667]" />
        <p className="text-muted-foreground">{status}</p>
      </div>
    </div>
  );
}
