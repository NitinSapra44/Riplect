import { useEffect, useState, useCallback } from "react";
import { waitForSupabase, isSupabaseConfigured, getSupabaseClient } from "@/lib/supabase";
import type { User, Session } from "@supabase/supabase-js";
import { posthog } from "@/lib/posthog";
import { queryClient } from "@/lib/queryClient";

interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  onboardingCompleted: boolean | null; // null = unknown/loading, false = not completed, true = completed
  hasProfile: boolean | null; // null = unknown/loading
  /** True iff the signed-in user was created via the WhatsApp bot
   *  (source_channel='whatsapp') and has not yet completed the
   *  /whatsapp-verify flow (email_verified_at IS NULL OR
   *  onboarding_completed = false). Null while loading. */
  requiresWhatsappEmailVerification: boolean | null;
  refreshOnboardingStatus: () => Promise<void>;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null);
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [requiresWhatsappEmailVerification, setRequiresWhatsappEmailVerification] =
    useState<boolean | null>(null);

  // Function to fetch profile and check onboarding status.
  // bypassCache=true forces a network call even when the TanStack Query cache
  // already has data (used by refreshOnboardingStatus after profile changes).
  const fetchOnboardingStatus = useCallback(async (accessToken: string, bypassCache = false) => {
    // Cache-first: if TanStack Query already has fresh profile data, derive
    // the routing flags from it and skip the extra network round-trip.
    if (!bypassCache) {
      const cached = queryClient.getQueryData<Record<string, any>>(["/api/dashboard/profile"]);
      if (cached) {
        setHasProfile(true);
        setOnboardingCompleted(cached.onboardingCompleted !== false);
        setRequiresWhatsappEmailVerification(
          typeof cached.requiresWhatsappEmailVerification === "boolean"
            ? cached.requiresWhatsappEmailVerification
            : ((["whatsapp", "whatsapp_cm"].includes((cached.sourceChannel ?? "").toLowerCase()))
                && (!cached.emailVerifiedAt
                    || cached.onboardingCompleted === false)),
        );
        return;
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch("/api/dashboard/profile", {
        headers: {
          "Authorization": `Bearer ${accessToken}`
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const profile = await response.json();
        if (profile) {
          setHasProfile(true);
          // Treat undefined/null as completed (existing users before onboarding was added)
          // Only explicitly false means onboarding not completed
          setOnboardingCompleted(profile.onboardingCompleted !== false);
          // Prefer the server-derived flag when present so client and
          // server agree on a single rule; fall back to a local derive
          // for older deployments that haven't shipped it yet.
          setRequiresWhatsappEmailVerification(
            typeof profile.requiresWhatsappEmailVerification === "boolean"
              ? profile.requiresWhatsappEmailVerification
              : ((["whatsapp", "whatsapp_cm"].includes((profile.sourceChannel ?? "").toLowerCase()))
                  && (!profile.emailVerifiedAt
                      || profile.onboardingCompleted === false)),
          );
        } else {
          // Response OK but no profile data - new user needs onboarding
          setHasProfile(false);
          setOnboardingCompleted(false);
          setRequiresWhatsappEmailVerification(false);
        }
      } else if (response.status === 404) {
        // No profile exists yet - new user needs onboarding.
        setHasProfile(false);
        setOnboardingCompleted(false);
        setRequiresWhatsappEmailVerification(false);
      } else {
        // Other error (401/500/etc.) — non-authoritative. Don't force
        // `requiresWhatsappEmailVerification = false`, because doing so
        // bounces magic-link users off /whatsapp-verify to /dashboard on
        // any transient blip. Leave the flag as null (unknown) so the
        // verify page keeps waiting / retrying instead of misrouting.
        console.warn("Non-critical error fetching profile:", response.status);
        setOnboardingCompleted(true);
        setHasProfile(null);
        // Intentionally do NOT touch setRequiresWhatsappEmailVerification.
      }
    } catch (error) {
      clearTimeout(timeoutId);
      console.error("Error fetching profile for onboarding status:", error);
      // On network error or timeout, same reasoning: don't flip the
      // whatsapp-verify flag on a transient failure.
      setOnboardingCompleted(true);
      setHasProfile(null);
      // Intentionally do NOT touch setRequiresWhatsappEmailVerification.
    }
  }, []);

  // Refresh function that can be called externally (e.g., after onboarding completes).
  // Always bypasses the cache since the profile was just mutated.
  const refreshOnboardingStatus = useCallback(async () => {
    if (session?.access_token) {
      await fetchOnboardingStatus(session.access_token, true);
    }
  }, [session, fetchOnboardingStatus]);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | null = null;

    const initAuth = async () => {
      const supabase = await waitForSupabase();
      
      if (!mounted) return;
      
      if (!supabase) {
        setIsLoading(false);
        return;
      }

      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (mounted) {
          if (error) {
            console.error("Error getting session:", error);
          }
          setSession(session);
          setUser(session?.user ?? null);
          
          // Fetch onboarding status if user is authenticated
          if (session?.access_token) {
            await fetchOnboardingStatus(session.access_token);
          }
          
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Session fetch error:", error);
        if (mounted) {
          setIsLoading(false);
        }
      }

      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (mounted) {
            setSession(session);
            setUser(session?.user ?? null);
            
            // Fetch onboarding status on auth state change
            if (session?.access_token) {
              await fetchOnboardingStatus(session.access_token);
              // Identify user in PostHog on sign in
              if (session.user) {
                const meta = session.user.user_metadata || {};
                const name = meta.full_name || [meta.first_name, meta.last_name].filter(Boolean).join(' ') || undefined;
                const provider = session.user.app_metadata?.provider || 'email';
                const signup_method = provider === 'google' ? 'google' : (session.user.phone ? 'phone' : 'email');
                posthog.identify(session.user.id, {
                  ...(name ? { name } : {}),
                  ...(session.user.email ? { email: session.user.email } : {}),
                  signup_method,
                });
              }
            } else {
              // User logged out - reset onboarding status
              setOnboardingCompleted(null);
              setHasProfile(null);
              setRequiresWhatsappEmailVerification(null);
              posthog.reset();
            }
            
            setIsLoading(false);
          }
        }
      );

      unsubscribe = () => subscription.unsubscribe();
    };

    initAuth();

    return () => {
      mounted = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  return {
    user,
    session,
    isLoading,
    isAuthenticated: !!session,
    onboardingCompleted,
    hasProfile,
    requiresWhatsappEmailVerification,
    refreshOnboardingStatus,
  };
}
