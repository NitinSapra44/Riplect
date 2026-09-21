import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { PageLoading } from "@/components/page-loading";

interface OnboardingGuardProps {
  children: React.ReactNode;
}

function useAuthGuard({ requireAuth = false }: { requireAuth?: boolean } = {}) {
  const { isAuthenticated, isLoading, onboardingCompleted, requiresWhatsappEmailVerification } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading) return;

    if (requireAuth && !isAuthenticated) {
      const currentUrl = window.location.pathname + window.location.search;
      if (currentUrl && currentUrl !== "/auth" && currentUrl !== "/") {
        sessionStorage.setItem("returnTo", currentUrl);
      }
      setLocation("/auth");
      return;
    }

    if (isAuthenticated) {
      // WhatsApp-bot users in mid-claim get their dedicated single-page
      // flow rather than the 5-step onboarding wizard. Checked first
      // because such users also have onboardingCompleted === false.
      if (requiresWhatsappEmailVerification === true) {
        if (window.location.pathname !== "/whatsapp-verify") {
          setLocation("/whatsapp-verify");
        }
        return;
      }
      if (onboardingCompleted === false) {
        setLocation("/onboarding");
      }
    }
  }, [isAuthenticated, isLoading, onboardingCompleted, requiresWhatsappEmailVerification, setLocation, requireAuth]);

  return { isAuthenticated, isLoading, onboardingCompleted, requiresWhatsappEmailVerification };
}

export function OnboardingGuard({ children }: OnboardingGuardProps) {
  const { isAuthenticated, isLoading, onboardingCompleted, requiresWhatsappEmailVerification } = useAuthGuard();

  if (isLoading) {
    return <PageLoading />;
  }

  if (isAuthenticated && (onboardingCompleted === false || requiresWhatsappEmailVerification === true)) {
    return <PageLoading />;
  }

  return <>{children}</>;
}

export function RequireOnboardingComplete({ children }: OnboardingGuardProps) {
  const { isAuthenticated, isLoading, onboardingCompleted, requiresWhatsappEmailVerification } = useAuthGuard({ requireAuth: true });

  if (isLoading) {
    return <PageLoading />;
  }

  if (!isAuthenticated || onboardingCompleted === false || requiresWhatsappEmailVerification === true) {
    return <PageLoading />;
  }

  return <>{children}</>;
}
