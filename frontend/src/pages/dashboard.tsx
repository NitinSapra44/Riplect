import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useCallback, useMemo, useRef, lazy, Suspense } from "react";
import { posthog } from "@/lib/posthog";
import { useCoachNotifications } from "@/hooks/useCoachNotifications";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { useToast } from "@/hooks/use-toast";
import { useConfirmNavigation } from "@/hooks/use-unsaved-changes";
import { supabase, signOutCompletely } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { GuardedLink, useGuardedNavigation } from "@/components/guarded-link";
import { User, Calendar, Package, BookOpen, CalendarDays, ImageIcon, Mail, Wallet, Settings, MapPin, Link as LinkIcon, Bell, X, Sparkles } from "lucide-react";
import { NotificationPanel } from "@/components/notification-panel";
import { BookingSidebarItem } from "@/components/booking-panel";
import { ErrorBoundary } from "@/components/error-boundary";
import { ProfileForm } from "@/components/profile-form";
import { AI_PROFILE_ENABLED } from "@/lib/featureFlags";
import riplekLogo1 from "@assets/Color_Variations_copy_9@144x-2_1775978761578.png";

const CombinedSessionManagement = lazy(() =>
  import("@/components/combined-session-management").then(m => ({ default: m.CombinedSessionManagement }))
);
const BlogManagement = lazy(() =>
  import("@/components/blog-management").then(m => ({ default: m.BlogManagement }))
);
const DigitalProductsManagement = lazy(() =>
  import("@/components/digital-products-management").then(m => ({ default: m.DigitalProductsManagement }))
);
const EventsManagement = lazy(() =>
  import("@/components/events-management").then(m => ({ default: m.EventsManagement }))
);
const LinksManagement = lazy(() =>
  import("@/components/links-management").then(m => ({ default: m.LinksManagement }))
);
const GalleryManagement = lazy(() =>
  import("@/components/gallery-management").then(m => ({ default: m.GalleryManagement }))
);
const ContactManagement = lazy(() =>
  import("@/components/contact-management").then(m => ({ default: m.ContactManagement }))
);
const WalletManagement = lazy(() =>
  import("@/components/wallet-management").then(m => ({ default: m.WalletManagement }))
);
const ProfileSettings = lazy(() =>
  import("@/components/profile-settings").then(m => ({ default: m.ProfileSettings }))
);
const LocationsManagement = lazy(() =>
  import("@/components/locations-management").then(m => ({ default: m.LocationsManagement }))
);

function TabSkeleton() {
  return (
    <div className="flex items-center justify-center h-40">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}

function ContentSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
          <div className="h-40 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-40 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
        <div className="space-y-4">
          <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </div>
    </div>
  );
}

function SidebarSkeleton() {
  return (
    <div className="lg:w-64 flex-shrink-0 space-y-4 animate-pulse">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="bg-white dark:bg-card rounded-lg shadow-sm border border-gray-200 dark:border-border p-4">
          <div className="space-y-2">
            {Array.from({ length: i === 1 ? 1 : i === 2 ? 5 : 3 }).map((_, j) => (
              <div key={j} className="h-9 bg-gray-200 dark:bg-gray-700 rounded-md" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const NOTIF_BANNER_KEY = "riplect_notifications_permission";

export default function Dashboard() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();

  // Notification-triggered booking navigation — version nonce ensures same booking ID re-triggers
  const [notificationNav, setNotificationNav] = useState<{ id: number; version: number } | null>(null);
  // Notification-triggered event registration navigation — opens booking inbox on Events tab
  const [notificationEventNav, setNotificationEventNav] = useState<{ eventId: number; registrationId: number; version: number } | null>(null);

  // In-app real-time notifications for new bookings and event registrations
  useCoachNotifications({
    isAuthenticated,
    onOpenBooking: (bookingId) =>
      setNotificationNav(prev => ({ id: bookingId, version: (prev?.version ?? 0) + 1 })),
    onOpenEventRegistration: (eventId, registrationId) =>
      setNotificationEventNav(prev => ({ eventId, registrationId, version: (prev?.version ?? 0) + 1 })),
  });

  // Web Push subscription (works even when tab is closed)
  const { requestAndSubscribe } = usePushSubscription({ isAuthenticated });

  // Notification permission banner state
  const [showNotifBanner, setShowNotifBanner] = useState(() => {
    if (typeof Notification === "undefined") return false;
    if (Notification.permission !== "default") return false;
    return localStorage.getItem(NOTIF_BANNER_KEY) !== "dismissed";
  });

  const handleAllowNotifications = useCallback(() => {
    requestAndSubscribe().then((permission) => {
      localStorage.setItem(NOTIF_BANNER_KEY, permission === "granted" ? "granted" : "dismissed");
      setShowNotifBanner(false);
    });
  }, [requestAndSubscribe]);

  const handleDismissNotifBanner = useCallback(() => {
    localStorage.setItem(NOTIF_BANNER_KEY, "dismissed");
    setShowNotifBanner(false);
  }, []);

  const { confirmNavigation } = useConfirmNavigation();
  const { guardedAction } = useGuardedNavigation();

  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const rawInitialTab = urlParams.get('tab') || "profile";
  // Map legacy/email-link tab aliases to actual dashboard tab names so coach
  // CTAs (e.g. ?tab=bookings, ?tab=payments) land on a real content area.
  const TAB_ALIASES: Record<string, string> = { payments: 'wallet', bookings: 'sessions' };
  // When an event registration deep-link is present (?tab=events&eventId=X&registrationId=Y),
  // do NOT switch the main dashboard to the Events tab. The Booking Inbox panel opens
  // automatically (via notificationEventNav) and is the canonical destination for these links.
  const _eventIdRaw = urlParams.get('eventId');
  const _registrationIdRaw = urlParams.get('registrationId');
  const _isEventDeepLink = !!(
    rawInitialTab === 'events' &&
    _eventIdRaw && Number(_eventIdRaw) > 0 &&
    _registrationIdRaw && Number(_registrationIdRaw) > 0
  );
  const initialTab = _isEventDeepLink ? 'profile' : (TAB_ALIASES[rawInitialTab] ?? rawInitialTab);
  const rawBookingId = urlParams.get('bookingId') ? Number(urlParams.get('bookingId')) : null;
  const initialBookingId = rawBookingId && Number.isInteger(rawBookingId) && rawBookingId > 0 ? rawBookingId : null;

  const [activeTab, setActiveTab] = useState(initialTab);
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(() => new Set([initialTab]));
  const contentRef = useRef<HTMLDivElement>(null);

  function handleNotificationNav({ bookingId, eventId, registrationId }: { bookingId?: number; eventId?: number; registrationId?: number }) {
    if (bookingId) {
      setNotificationNav(prev => ({ id: bookingId, version: (prev?.version ?? 0) + 1 }));
    } else if (eventId && registrationId) {
      setNotificationEventNav(prev => ({ eventId, registrationId, version: (prev?.version ?? 0) + 1 }));
    }
  }

  // On mount, honor email deep-links: ?tab=events&eventId=&registrationId= or
  // ?tab=products&productId=&purchaseId=. This makes coach email CTAs open the
  // correct tab and (for events) flag the matching registration for highlight.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const eventIdRaw = params.get('eventId');
    const registrationIdRaw = params.get('registrationId');
    const productIdRaw = params.get('productId');
    const purchaseIdRaw = params.get('purchaseId');

    if (eventIdRaw && registrationIdRaw) {
      const eventId = Number(eventIdRaw);
      const registrationId = Number(registrationIdRaw);
      if (Number.isInteger(eventId) && eventId > 0 && Number.isInteger(registrationId) && registrationId > 0) {
        setNotificationEventNav(prev => ({ eventId, registrationId, version: (prev?.version ?? 0) + 1 }));
      }
    } else if (productIdRaw || purchaseIdRaw) {
      // Just open the products tab; granular highlighting is handled by the tab
      // when it reads its own URL params.
      setActiveTab('products');
      setVisitedTabs(prev => {
        const next = new Set(prev);
        next.add('products');
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Set to true when the user clicks Logout so the unauthenticated-fallback
  // effect below doesn't fire a competing redirect to /api/login while we're
  // already navigating home.
  const isLoggingOutRef = useRef(false);

  useEffect(() => {
    if (isLoggingOutRef.current) return;
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      const t = setTimeout(() => {
        if (isLoggingOutRef.current) return;
        window.location.href = "/api/login";
      }, 500);
      return () => clearTimeout(t);
    }
  }, [isAuthenticated, isLoading, toast]);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["/api/dashboard/profile"],
    enabled: isAuthenticated,
  }) as { data: any, isLoading: boolean };

  // Note: onboarding/auth redirects are handled by <RequireOnboardingComplete>
  // wrapping this route in App.tsx. We intentionally do NOT add a secondary
  // window.location redirect here — it caused a race during logout where the
  // cleared query cache made `profile` undefined while `isAuthenticated` had
  // not yet flipped to false, sending users to /onboarding instead of home.

  // Sync active tab when user presses browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const rawTab = params.get('tab') || 'profile';
      const tab = TAB_ALIASES[rawTab] ?? rawTab;
      setActiveTab(tab);
      setVisitedTabs(prev => {
        const next = new Set(prev);
        next.add(tab);
        return next;
      });
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    posthog.capture('dashboard_tab_viewed', { tab_name: activeTab });
  }, [activeTab]);

  const handleTabChange = useCallback((newTab: string) => {
    confirmNavigation(() => {
      setActiveTab(newTab);
      setVisitedTabs(prev => {
        const next = new Set(prev);
        next.add(newTab);
        return next;
      });
      const params = new URLSearchParams(window.location.search);
      params.set('tab', newTab);
      window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
      setTimeout(() => {
        if (contentRef.current) {
          const top = contentRef.current.getBoundingClientRect().top + window.scrollY;
          window.scrollTo({ top: top + 400, behavior: "smooth" });
        }
      }, 150);
    });
  }, [confirmNavigation]);

  const handleLogout = useCallback(() => {
    guardedAction(async () => {
      // Suppress the unauthenticated-fallback redirect to /api/login that
      // would otherwise race with our home navigation below.
      isLoggingOutRef.current = true;
      // signOutCompletely uses scope: 'local' (no network round-trip) and
      // also explicitly purges sb-*-auth-token entries from storage, so
      // the hard-navigation below cannot leave a stale session behind.
      await signOutCompletely();
      // Hard-navigate immediately. The full page reload wipes the query
      // cache for us, and using replace() prevents the back button from
      // returning the user to a now-unauthenticated dashboard.
      window.location.replace('/');
    });
  }, [guardedAction]);

  // Only block render during auth check (instant); profile loading is handled inline
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen relative bg-gradient-to-b from-[#FDF6EE]/50 to-white">
      {/* Floating Logo (Top Left) */}
      <GuardedLink href="/" data-testid="link-home">
        <div className="absolute top-4 left-2 z-50 cursor-pointer hover:opacity-80 transition-opacity overflow-hidden">
          <img
            src={riplekLogo1}
            alt="Riplect"
            className="h-11 ml-1"
            data-testid="img-header-logo"
          />
        </div>
      </GuardedLink>

      {/* Floating Buttons (Top Right) */}
      <div className="absolute top-4 right-4 z-50 flex items-center gap-2 h-11">
        {isAuthenticated && <NotificationPanel onNavigate={handleNotificationNav} />}
        {AI_PROFILE_ENABLED && (
          <GuardedLink href="/studio" data-testid="link-site-studio">
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full bg-white text-[#C96868]/90 text-sm font-medium hover:bg-[#C96868]/90 hover:text-white transition-colors border border-[#b66667]"
            >
              <Sparkles className="w-4 h-4 mr-1.5" />
              AI Studio
            </Button>
          </GuardedLink>
        )}
        {profile?.username && (
          <GuardedLink href={`/${profile.username}`} data-testid="link-view-profile">
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full bg-white text-[#C96868]/90 text-sm font-medium hover:bg-[#C96868]/90 hover:text-white transition-colors border border-[#b66667]"
            >
              View Profile
            </Button>
          </GuardedLink>
        )}
        <Button
          onClick={handleLogout}
          variant="ghost"
          size="sm"
          className="rounded-full text-gray-600 text-sm font-medium hover:text-gray-900 hover:bg-gray-100 transition-colors"
          data-testid="button-logout"
        >
          Logout
        </Button>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard</h1>
          <p className="text-gray-600">Manage your profile and content</p>
        </div>

        {/* Dashboard Layout with Sidebar */}
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar Navigation — show skeleton while profile loads */}
          {profileLoading ? <SidebarSkeleton /> : <div className="lg:w-64 flex-shrink-0 space-y-4">

            {/* Notification permission banner */}
            {showNotifBanner && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 flex items-start gap-2" data-testid="notif-permission-banner">
                <Bell className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-amber-800 font-medium leading-snug">Enable desktop notifications</p>
                  <p className="text-[11px] text-amber-700 mt-0.5 leading-snug">Get alerted when new bookings arrive</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[11px] px-2 py-0 border-amber-400 text-amber-800 hover:bg-amber-100"
                      onClick={handleAllowNotifications}
                      data-testid="button-allow-notifications"
                    >
                      Allow
                    </Button>
                    <button
                      className="text-[11px] text-amber-600 hover:text-amber-800 underline"
                      onClick={handleDismissNotifBanner}
                      data-testid="button-dismiss-notifications"
                    >
                      Not now
                    </button>
                  </div>
                </div>
                <button
                  onClick={handleDismissNotifBanner}
                  className="text-amber-500 hover:text-amber-700 flex-shrink-0"
                  data-testid="button-close-notif-banner"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Bookings */}
            <div className="bg-white dark:bg-card rounded-lg shadow-sm border border-gray-200 dark:border-border p-4">
              <nav className="space-y-2">
                <BookingSidebarItem
                  initialBookingId={initialBookingId}
                  notificationBookingId={notificationNav?.id ?? null}
                  notificationVersion={notificationNav?.version ?? 0}
                  notificationEventId={notificationEventNav?.eventId ?? null}
                  notificationRegistrationId={notificationEventNav?.registrationId ?? null}
                  notificationEventVersion={notificationEventNav?.version ?? 0}
                />
              </nav>
            </div>

            {/* Content */}
            <div className="bg-white dark:bg-card rounded-lg shadow-sm border border-gray-200 dark:border-border p-4">
              <nav className="space-y-2">
                <button
                  onClick={() => handleTabChange("sessions")}
                  className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    activeTab === "sessions"
                      ? "bg-primary text-white"
                      : "text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                  data-testid="tab-sessions"
                >
                  <Calendar className="w-5 h-5 mr-3" />
                  Sessions
                </button>

                <button
                  onClick={() => handleTabChange("events")}
                  className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    activeTab === "events"
                      ? "bg-primary text-white"
                      : "text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                  data-testid="tab-events"
                >
                  <CalendarDays className="w-5 h-5 mr-3" />
                  Events
                </button>

                <button
                  onClick={() => handleTabChange("blog")}
                  className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    activeTab === "blog"
                      ? "bg-primary text-white"
                      : "text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                  data-testid="tab-blog"
                >
                  <BookOpen className="w-5 h-5 mr-3" />
                  Blog Posts
                </button>

                <button
                  onClick={() => handleTabChange("products")}
                  className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    activeTab === "products"
                      ? "bg-primary text-white"
                      : "text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                  data-testid="tab-products"
                >
                  <Package className="w-5 h-5 mr-3" />
                  Digital Products
                </button>

                <button
                  onClick={() => handleTabChange("gallery")}
                  className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    activeTab === "gallery"
                      ? "bg-primary text-white"
                      : "text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                  data-testid="tab-gallery"
                >
                  <ImageIcon className="w-5 h-5 mr-3" />
                  Gallery
                </button>
              </nav>
            </div>

            {/* Profile */}
            <div className="bg-white dark:bg-card rounded-lg shadow-sm border border-gray-200 dark:border-border p-4">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 px-3">Profile</p>
              <nav className="space-y-2">
                <button
                  onClick={() => handleTabChange("profile")}
                  className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    activeTab === "profile"
                      ? "bg-primary text-white"
                      : "text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                  data-testid="tab-profile"
                >
                  <User className="w-5 h-5 mr-3" />
                  Profile Page
                </button>

                <button
                  onClick={() => handleTabChange("contact")}
                  className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    activeTab === "contact"
                      ? "bg-primary text-white"
                      : "text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                  data-testid="tab-contact"
                >
                  <Mail className="w-5 h-5 mr-3" />
                  Contact Card
                </button>

                <button
                  onClick={() => handleTabChange("links")}
                  className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    activeTab === "links"
                      ? "bg-primary text-white"
                      : "text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                  data-testid="tab-links"
                >
                  <LinkIcon className="w-5 h-5 mr-3" />
                  Custom Links
                </button>
              </nav>
            </div>

            {/* Account */}
            <div className="bg-white dark:bg-card rounded-lg shadow-sm border border-gray-200 dark:border-border p-4">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 px-3">Account</p>
              <nav className="space-y-2">
                <button
                  onClick={() => handleTabChange("settings")}
                  className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    activeTab === "settings"
                      ? "bg-primary text-white"
                      : "text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                  data-testid="tab-settings"
                >
                  <Settings className="w-5 h-5 mr-3" />
                  Profile Settings
                </button>

                <button
                  onClick={() => handleTabChange("locations")}
                  className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    activeTab === "locations"
                      ? "bg-primary text-white"
                      : "text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                  data-testid="tab-locations"
                >
                  <MapPin className="w-5 h-5 mr-3" />
                  Locations
                </button>

                <button
                  onClick={() => handleTabChange("wallet")}
                  className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    activeTab === "wallet"
                      ? "bg-primary text-white"
                      : "text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                  data-testid="tab-wallet"
                >
                  <Wallet className="w-5 h-5 mr-3" />
                  Payments and Earnings
                </button>
              </nav>
            </div>
          </div>}

          {/* Main Content Area */}
          <div className="flex-1" ref={contentRef}>

            {/* Show content skeleton while profile is loading */}
            {profileLoading ? (
              <ContentSkeleton />
            ) : (
              <>
                {/* Profile tab — keep-mounted, no lazy load (default tab) */}
                {visitedTabs.has("profile") && (
                  <div className={activeTab === "profile" ? "" : "hidden"}>
                    <ErrorBoundary>
                      <ProfileForm profile={profile} />
                    </ErrorBoundary>
                  </div>
                )}

                {/* Sessions tab */}
                {visitedTabs.has("sessions") && (
                  <div className={activeTab === "sessions" ? "" : "hidden"}>
                    <ErrorBoundary>
                      <Suspense fallback={<TabSkeleton />}>
                        <CombinedSessionManagement />
                      </Suspense>
                    </ErrorBoundary>
                  </div>
                )}

                {/* Products tab */}
                {visitedTabs.has("products") && (
                  <div className={activeTab === "products" ? "" : "hidden"}>
                    <ErrorBoundary>
                      <Suspense fallback={<TabSkeleton />}>
                        <DigitalProductsManagement />
                      </Suspense>
                    </ErrorBoundary>
                  </div>
                )}

                {/* Events tab */}
                {visitedTabs.has("events") && (
                  <div className={activeTab === "events" ? "" : "hidden"}>
                    <ErrorBoundary>
                      <Suspense fallback={<TabSkeleton />}>
                        <EventsManagement
                          username={profile?.username}
                        />
                      </Suspense>
                    </ErrorBoundary>
                  </div>
                )}

                {/* Blog tab */}
                {visitedTabs.has("blog") && (
                  <div className={activeTab === "blog" ? "" : "hidden"}>
                    <ErrorBoundary>
                      <Suspense fallback={<TabSkeleton />}>
                        <BlogManagement />
                      </Suspense>
                    </ErrorBoundary>
                  </div>
                )}

                {/* Links tab */}
                {visitedTabs.has("links") && (
                  <div className={activeTab === "links" ? "" : "hidden"}>
                    <ErrorBoundary>
                      <Suspense fallback={<TabSkeleton />}>
                        <LinksManagement />
                      </Suspense>
                    </ErrorBoundary>
                  </div>
                )}

                {/* Gallery tab */}
                {visitedTabs.has("gallery") && (
                  <div className={activeTab === "gallery" ? "" : "hidden"}>
                    <ErrorBoundary>
                      <Suspense fallback={<TabSkeleton />}>
                        <GalleryManagement />
                      </Suspense>
                    </ErrorBoundary>
                  </div>
                )}

                {/* Contact tab */}
                {visitedTabs.has("contact") && (
                  <div className={activeTab === "contact" ? "" : "hidden"}>
                    <ErrorBoundary>
                      <Suspense fallback={<TabSkeleton />}>
                        <ContactManagement />
                      </Suspense>
                    </ErrorBoundary>
                  </div>
                )}

                {/* Locations tab */}
                {visitedTabs.has("locations") && (
                  <div className={activeTab === "locations" ? "" : "hidden"}>
                    <ErrorBoundary>
                      <Suspense fallback={<TabSkeleton />}>
                        <LocationsManagement />
                      </Suspense>
                    </ErrorBoundary>
                  </div>
                )}

                {/* Wallet tab */}
                {visitedTabs.has("wallet") && (
                  <div className={activeTab === "wallet" ? "" : "hidden"}>
                    <ErrorBoundary>
                      <Suspense fallback={<TabSkeleton />}>
                        <WalletManagement />
                      </Suspense>
                    </ErrorBoundary>
                  </div>
                )}

                {/* Settings tab */}
                {visitedTabs.has("settings") && (
                  <div className={activeTab === "settings" ? "" : "hidden"}>
                    <ErrorBoundary>
                      <Suspense fallback={<TabSkeleton />}>
                        <ProfileSettings />
                      </Suspense>
                    </ErrorBoundary>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
