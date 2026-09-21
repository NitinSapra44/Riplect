import { Switch, Route, useLocation } from "wouter";
import { Suspense, lazy, useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { listenForCacheSync } from "@/lib/cacheChannel";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UnsavedChangesProvider } from "@/hooks/use-unsaved-changes";
import { PageLoading } from "@/components/page-loading";
import { OnboardingGuard, RequireOnboardingComplete } from "@/components/onboarding-guard";
import { initPostHog, isPostHogEnabled, posthog } from "@/lib/posthog";
import { PostHogProvider } from "posthog-js/react";
import { ErrorBoundary } from "@/components/error-boundary";

const Home = lazy(() => import("@/pages/home"));
const Profile = lazy(() => import("@/pages/profile"));
const Dashboard = lazy(() => import("@/pages/dashboard"));
const Contact = lazy(() => import("@/pages/contact"));
const BlogPost = lazy(() => import("@/pages/blog-post"));
const ProductDetail = lazy(() => import("@/pages/product-detail"));
const EventDetail = lazy(() => import("@/pages/event-detail"));
const SessionDetail = lazy(() => import("@/pages/session-detail"));
const Auth = lazy(() => import("@/pages/auth"));
const AuthCallback = lazy(() => import("@/pages/auth-callback"));
const AuthResetPassword = lazy(() => import("@/pages/auth-reset-password"));
const VerifyEmailAndSetPassword = lazy(() => import("@/pages/verify-email-and-set-password"));
const Onboarding = lazy(() => import("@/pages/onboarding"));
const WhatsappVerify = lazy(() => import("@/pages/whatsapp-verify"));
const NotFound = lazy(() => import("@/pages/not-found"));
const About = lazy(() => import("@/pages/about"));
const TermsOfService = lazy(() => import("@/pages/terms-of-service"));
const PrivacyPolicy = lazy(() => import("@/pages/privacy-policy"));
const GuestPortal = lazy(() => import("@/pages/guest-portal"));
const CancelRegistration = lazy(() => import("@/pages/cancel-registration"));
const CompletePayment = lazy(() => import("@/pages/complete-payment"));
const SiteStudio = lazy(() => import("@/pages/site-studio"));
const GeneratedSite = lazy(() => import("@/pages/generated-site"));

function ProtectedDashboard() {
  return (
    <RequireOnboardingComplete>
      <Dashboard />
    </RequireOnboardingComplete>
  );
}

function GuardedHome() {
  return (
    <OnboardingGuard>
      <Home />
    </OnboardingGuard>
  );
}

function PageViewTracker() {
  const [location] = useLocation();
  useEffect(() => {
    posthog.capture('$pageview', { $current_url: window.location.href });
  }, [location]);
  return null;
}

function Router() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoading />}>
        <Switch>
          <Route path="/" component={GuardedHome} />
          <Route path="/auth" component={Auth} />
          <Route path="/claim" component={Auth} />
          <Route path="/auth/callback" component={AuthCallback} />
          <Route path="/auth/reset-password" component={AuthResetPassword} />
          <Route path="/verify-email-and-set-password" component={VerifyEmailAndSetPassword} />
          <Route path="/onboarding" component={Onboarding} />
          <Route path="/whatsapp-verify" component={WhatsappVerify} />
          <Route path="/dashboard" component={ProtectedDashboard} />
          <Route path="/contact" component={Contact} />
          <Route path="/about" component={About} />
          <Route path="/terms-of-service" component={TermsOfService} />
          <Route path="/privacy-policy" component={PrivacyPolicy} />
          <Route path="/guest/:accessToken" component={GuestPortal} />
          <Route path="/cancel-registration" component={CancelRegistration} />
          <Route path="/complete-payment" component={CompletePayment} />
          <Route path="/studio" component={SiteStudio} />
          <Route path="/site/:username" component={GeneratedSite} />
          <Route path="/:username/blog/:slug" component={BlogPost} />
          <Route path="/:username/product/:productId" component={ProductDetail} />
          <Route path="/:username/event/:eventId" component={EventDetail} />
          <Route path="/:username/session/:sessionId" component={SessionDetail} />
          <Route path="/:username" component={Profile} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </ErrorBoundary>
  );
}

function App() {
  useEffect(() => {
    initPostHog();
    const cleanup = listenForCacheSync(queryClient);
    return cleanup;
  }, []);

  const app = (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <UnsavedChangesProvider>
          <main>
            <Toaster />
            <PageViewTracker />
            <Router />
          </main>
        </UnsavedChangesProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );

  return isPostHogEnabled ? (
    <PostHogProvider client={posthog}>{app}</PostHogProvider>
  ) : (
    app
  );
}

export default App;
