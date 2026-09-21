import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useRoute, Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { ProfileHeader } from "@/components/profile-header";
import { BookingSection } from "@/components/booking-section";
import { ProductsSection } from "@/components/products-section";
import { PhysicalProductsSection } from "@/components/physical-products-section";
import { GallerySection } from "@/components/gallery-section";
import { BlogSection } from "@/components/blog-section";
import { EventsSection } from "@/components/events-section";
import { ExpandableSection } from "@/components/expandable-section";
import { TestimonialsSection } from "@/components/testimonials-section";
import { FixedNavMenu } from "@/components/fixed-nav-menu";
import { Button } from "@/components/ui/button";
import type { Profile, BookingSession, DigitalProduct, BlogPost, Event, EventWithExtras } from "@shared/schema";
import { formatPrice } from "@shared/currencies";
// AI Profile (additive): a published Design Brief renders via BriefRenderer; any
// missing/invalid Brief or render error falls through to the classic layout below.
import { PageBriefSchema, type PageBrief } from "@shared/brief";
import { BriefRenderer } from "@/components/brief/BriefRenderer";
import { BriefBoundary } from "@/components/brief/BriefBoundary";
//aa
import { 
  Calendar, Download, Images, BookOpen, CalendarCheck, ShoppingBag, 
  Phone, Mail, MapPin, Clock, Settings, Link as LinkIcon, QrCode, 
  Share2, Quote, Star, ChevronUp, UserCircle, MessageCircle, 
  FileText, Video, Image, Package, Globe, Copy, Repeat
} from "lucide-react";
import { formatEventTimeForDisplay, getBrowserTimezone, formatTimezoneShort, isEventPast } from "@/lib/timezone-utils";
import { generateCoachShareMessage, shareCoachOnWhatsApp } from "@/lib/whatsapp-share";
import { SiWhatsapp } from "react-icons/si";

interface AuthUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
  username?: string;
}

interface GalleryImage {
  url: string;
  alt: string;
}

// Import custom social media icons (PNG)
import instagramIcon from "@assets/001-Instagram-social_1763698794306.png";
import facebookIcon from "@assets/002-facebook_1763698698530.png";
import twitterIcon from "@assets/003-twitter_1763698698530.png";
import tiktokIcon from "@assets/005-tiktok_1763698698530.png";
import youtubeIcon from "@assets/006-youtube_1763698698530.png";
import linkedinIcon from "@assets/007-linkedin_1763698698530.png";
import pinterestIcon from "@assets/008-pinterest logo_1763698794306.png";
import snapchatIcon from "@assets/012-snapchat_1763698794306.png";
import defaultProfileImage from "@assets/WhatsApp Image 2025-11-28 at 13.31.40_1764389051024.jpeg";
import riplekLogo1 from "@assets/Color_Variations_copy_9@144x-2_1775978761578.png";
import QRCodeLib from "qrcode";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { posthog } from "@/lib/posthog";

export default function Profile() {
  const [activeTab, setActiveTab] = useState("home");
  const [qrCodeData, setQrCodeData] = useState<string>("");
  // If the Brief path errors at runtime, fall back to the classic layout.
  const [briefFailed, setBriefFailed] = useState(false);
  const [, params] = useRoute("/:username");
  const [, setLocation] = useLocation();
  const username = params?.username;
  const { user: rawUser, isAuthenticated, isLoading: authLoading } = useAuth();
  const user = rawUser as AuthUser | undefined;
  const openSectionRef = useRef<string | null>(null);
  const { toast } = useToast();
  
  // Contact form state
  const [contactForm, setContactForm] = useState({
    name: "",
    email: "",
    phone: "",
    subject: "",
    message: ""
  });
  
  const contactMutation = useMutation({
    mutationFn: async (data: typeof contactForm) => {
      const response = await apiRequest("POST", `/api/profiles/${profile?.id}/contact`, data);
      return response.json();
    },
    onSuccess: (data) => {
      posthog.capture('contact_form_submitted', { coach_username: username });
      toast({
        title: "Message Sent!",
        description: data.message || "Your message has been sent successfully.",
      });
      setContactForm({ name: "", email: "", phone: "", subject: "", message: "" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send message",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    }
  });
  
  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactForm.name || !contactForm.email || !contactForm.subject || !contactForm.message) {
      toast({
        title: "Please fill in all required fields",
        description: "Name, email, subject, and message are required.",
        variant: "destructive",
      });
      return;
    }
    contactMutation.mutate(contactForm);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: `${label} copied to clipboard.`,
    });
  };

  const { data: profile, isLoading, error } = useQuery({
    queryKey: ["/api/profiles", username],
    enabled: !!username,
  }) as { data: any, isLoading: boolean, error: any };

  // Track profile view once data loads
  useEffect(() => {
    if (profile && username) {
      posthog.capture('profile_viewed', {
        coach_username: username,
        is_own_profile: !!(user && profile.id === user.id),
      });
    }
  }, [profile?.id]);

  // Track tab changes
  useEffect(() => {
    if (profile && activeTab) {
      posthog.capture('profile_tab_changed', { tab: activeTab, coach_username: username });
    }
  }, [activeTab]);

  // Check if this is the user's own profile by comparing user ID with profile ID
  // Since we use Supabase auth UUID as profile's primary key, they should match
  const isOwnProfile = user && profile && user.id === profile.id;

  const { data: products = [] } = useQuery({
    queryKey: ["/api/profiles", username, "products"],
    enabled: !!username,
  }) as { data: any[] };

  const { data: physicalProducts = [] } = useQuery({
    queryKey: ["/api/profiles", username, "physical-products"],
    enabled: !!username,
  }) as { data: any[] };

  const { data: blogPosts = [] } = useQuery({
    queryKey: ["/api/profiles", username, "blog"],
    enabled: !!username,
  }) as { data: any[] };

  const { data: events = [] } = useQuery<EventWithExtras[]>({
    queryKey: ["/api/profiles", username, "events"],
    enabled: !!username,
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["/api/profiles", username, "sessions"],
    enabled: !!username,
  }) as { data: any[] };

  // Published Design Brief (404 when none → undefined). Validated before use, so
  // an invalid/absent Brief simply renders nothing here and the classic layout
  // below takes over.
  const { data: briefResp } = useQuery({
    queryKey: ["/api/profiles", username, "brief"],
    enabled: !!username,
    retry: false,
  }) as { data: any };

  const publishedBrief = useMemo<PageBrief | null>(() => {
    const raw = briefResp?.brief;
    if (!raw) return null;
    const parsed = PageBriefSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }, [briefResp]);

  // Get featured item for each content type, or fallback to latest
  const featuredBlogPost = useMemo(() => {
    if (blogPosts.length === 0) return null;
    const featured = blogPosts.find((post: any) => post.isFeatured);
    return featured || blogPosts[0]; // Fallback to first (latest) if none featured
  }, [blogPosts]);

  const featuredEvent = useMemo((): EventWithExtras | null => {
    if (events.length === 0) return null;
    const featured = events.find((event) => event.isFeatured);
    return featured || events[0]; // Fallback to first (latest) if none featured
  }, [events]);

  const featuredProduct = useMemo(() => {
    if (products.length === 0) return null;
    const featured = products.find((product: any) => product.isFeatured);
    return featured || products[0]; // Fallback to first (latest) if none featured
  }, [products]);

  // Handle hash navigation and auto-expand sections
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.substring(1); // Remove the '#'

      if (hash && ['home', 'contact'].includes(hash)) {
        setActiveTab(hash);
        // Clear the hash from URL after processing to prevent navigation issues
        window.history.replaceState(null, '', window.location.pathname);
      } else if (hash === 'bookings' && sessions.length > 0) {
        // If navigating to #bookings, ensure home tab is active
        if (activeTab !== 'home') setActiveTab('home');

        // Wait briefly for render, then expand and scroll
        setTimeout(() => {
          const sectionButton = document.querySelector('[data-section-id="bookings"]') as HTMLElement;
          if (sectionButton) {
            // Check if currently closed (based on data-state attribute from ExpandableSection)
            const isClosed = sectionButton.getAttribute('data-state') === 'closed';
            if (isClosed) {
              sectionButton.click();
            }
            // Scroll the section into view
            sectionButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 300);
        // Clear the hash from URL after processing
        window.history.replaceState(null, '', window.location.pathname);
      } else if (hash) {
        // For other section hashes (like events, products, etc.), also clear after processing
        setTimeout(() => {
          const sectionButton = document.querySelector(`[data-section-id="${hash}"]`) as HTMLElement;
          if (sectionButton) {
            const isClosed = sectionButton.getAttribute('data-state') === 'closed';
            if (isClosed) {
              sectionButton.click();
            }
            sectionButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          // Clear the hash from URL after processing
          window.history.replaceState(null, '', window.location.pathname);
        }, 300);
      }
    };

    // Check on mount and when sessions load
    handleHashChange();

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, [sessions, activeTab]);

  // Generate QR code when profile loads
  useEffect(() => {
    if (profile) {
      const profileUrl = `${window.location.origin}/${profile.username}`;
      QRCodeLib.toDataURL(profileUrl, {
        width: 200,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
      })
        .then(setQrCodeData)
        .catch(console.error);
    }
  }, [profile]);

  // Auto-close expandable sections on scroll
  useEffect(() => {
    const handleScroll = () => {
      const sections = document.querySelectorAll('[data-section-id]');
      sections.forEach(section => {
        const button = section as HTMLElement;
        const sectionId = button.getAttribute('data-section-id');
        const element = document.getElementById(sectionId!);
        if (element) {
          const rect = element.getBoundingClientRect();
          const isOpen = button.getAttribute('data-state') === 'open';

          if (isOpen && (rect.bottom < 0 || rect.top > window.innerHeight)) {
            button.click();
          }
        }
      });
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);


  if (isLoading) {
    return (
      <div className="min-h-screen">
        {/* Skeleton that matches profile layout to prevent CLS */}
        <div className="pt-24">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-0">
            <div className="flex flex-col items-center text-center">
              {/* Profile Picture Skeleton */}
              <div className="w-28 h-28 md:w-36 md:h-36 rounded-full bg-muted animate-pulse mb-4" />
              {/* Name Skeleton */}
              <div className="h-8 w-48 bg-muted animate-pulse rounded mb-2" />
              {/* Title Skeleton */}
              <div className="h-6 w-32 bg-muted animate-pulse rounded mb-4" />
              {/* Bio Skeleton */}
              <div className="h-4 w-64 bg-muted animate-pulse rounded mb-2" />
              <div className="h-4 w-56 bg-muted animate-pulse rounded" />
            </div>
          </div>
          {/* Content Skeleton */}
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 mt-4">
            <div className="space-y-6">
              <div className="h-16 bg-muted animate-pulse rounded-lg" />
              <div className="h-16 bg-muted animate-pulse rounded-lg" />
              <div className="h-16 bg-muted animate-pulse rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="pt-6">
            <div className="flex mb-4 gap-2">
              <AlertCircle className="h-8 w-8 text-red-500" />
              <h1 className="text-2xl font-bold text-gray-900">Profile Not Found</h1>
            </div>
            <p className="mt-4 text-sm text-gray-600">
              The profile you're looking for doesn't exist or has been deactivated.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── AI Profile: guarded branch ──────────────────────────────────────────
  // If a valid Brief is published (and hasn't errored), render the Brief-driven
  // page. Otherwise fall through to the classic layout, byte-for-byte unchanged.
  if (publishedBrief && !briefFailed) {
    return (
      <div className="min-h-screen relative">
        <Link href="/">
          <div className="absolute top-5 left-2 z-50 cursor-pointer overflow-hidden transition-opacity hover:opacity-80">
            <img src={riplekLogo1} alt="Riplect" className="h-9 ml-1" data-testid="img-header-logo" />
          </div>
        </Link>
        {!authLoading && isAuthenticated && isOwnProfile && (
          <Link href="/dashboard">
            <Button
              variant="ghost"
              className="absolute top-5 right-4 z-50 rounded-full border border-[#b66667] bg-white text-sm font-medium text-[#C96868]/90 transition-colors hover:bg-[#C96868]/90 hover:text-white"
              data-testid="button-dashboard"
            >
              Dashboard
            </Button>
          </Link>
        )}
        <BriefBoundary onError={() => setBriefFailed(true)}>
          <BriefRenderer username={profile.username} brief={publishedBrief} />
        </BriefBoundary>
      </div>
    );
  }

  // Build dynamic navigation sections based on available content
  const availableSections = [];

  if (sessions.length > 0) {
    availableSections.push({
      id: "bookings",
      label: "Sessions",
      icon: <Calendar className="w-6 h-6" />
    });
  }

  if (blogPosts.length > 0) {
    availableSections.push({
      id: "blog",
      label: "Insights",
      icon: <BookOpen className="w-6 h-6" />
    });
  }

  if (events.length > 0) {
    availableSections.push({
      id: "events",
      label: "Events",
      icon: <CalendarCheck className="w-6 h-6" />
    });
  }

  if (profile.homePageLinks && profile.homePageLinks.length > 0) {
    availableSections.push({
      id: "resources",
      label: "Links",
      icon: <LinkIcon className="w-6 h-6" />
    });
  }

  if (products.length > 0) {
    availableSections.push({
      id: "products",
      label: "Products",
      icon: <ShoppingBag className="w-6 h-6" />
    });
  }

  if (profile.galleryImages && profile.galleryImages.length > 0) {
    availableSections.push({
      id: "gallery",
      label: "Photo Gallery",
      icon: <Images className="w-6 h-6" />
    });
  }

  return (
    // Added 'relative' to the container so absolute positioning works relative to the page top
    <div className="min-h-screen relative bg-gradient-to-b from-[#FDF6EE]/50 to-white">
      {/* Riplect Logo (Top Left) - Using same logo as home page */}
      <Link href="/">
        {/* Added 'overflow-hidden' to mask the cropped area */}
        <div className="absolute top-5 left-2 z-50 cursor-pointer hover:opacity-80 transition-opacity overflow-hidden">
          <img 
            src={riplekLogo1} 
            alt="Riplect" 
            // Added '-ml-4' to pull the image left (cropping it)
            className="h-9 ml-1"
            data-testid="img-header-logo"
          />
        </div>
      </Link>
      {/* Dashboard Button (Top Right) - Changed to 'absolute' */}
      {!authLoading && isAuthenticated && isOwnProfile && (
        <Link href="/dashboard">
          <Button
            variant="ghost"
            className="absolute top-5 right-20 z-50 rounded-full bg-white text-[#C96868]/90 text-sm font-medium hover:bg-[#C96868]/90 hover:text-white transition-colors border border-[#b66667]"
            data-testid="button-dashboard"
          >
            Dashboard
          </Button>
        </Link>
      )}
      {/* Fixed Navigation Menu - Only show on home tab */}
      {activeTab === "home" && (
        <FixedNavMenu
          availableSections={availableSections}
          username={profile.username}
          displayName={profile.displayName || undefined}
          profileImageUrl={profile.profileImageUrl}
        />
      )}
      {/* Main Content Container - Pushed down by pt-24 to clear fixed elements */}
      <div className="pt-16">
        {/* Profile Header */}
        <ProfileHeader
          profile={profile}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        {/* Tab Content - Reduced top padding to 0 */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 mt-4">

          {/* Home Tab - All Features */}
          {activeTab === "home" && (
            <div className="space-y-6">

              {/* Featured Sessions with Booking Calendar */}
              {sessions.length > 0 && (() => {
                // Find the featured session or default to the first one if only one exists
                const featuredSession = sessions.find(s => s.isFeatured) || (sessions.length === 1 ? sessions[0] : null);

                const remainingSessions = sessions.filter(s => s.id !== featuredSession?.id);

                return featuredSession ? (
                  <ExpandableSection
                    id="bookings"
                    title="Sessions"
                    description="Schedule your personalized consultation"
                    icon={<Calendar className="w-5 h-5 text-primary" />}
                    iconBgColor="bg-primary bg-opacity-10"
                    defaultExpanded={false}
                    hideExpander={remainingSessions.length === 0}
                    previewContent={
                      <div className="p-4">
                        <div className="flex items-center mb-3">
                          <Calendar className="w-6 h-6 text-black mr-3" />
                          <h3 className="text-xl font-bold text-gray-900">Sessions</h3>
                        </div>
                        <div className="space-y-4">
                          <div
                            className="bg-white border border-gray-300 rounded-2xl overflow-hidden cursor-pointer hover:shadow-lg transition-shadow group"
                            onClick={() => setLocation(`/${username}/session/${featuredSession.id}`)}
                          >
                            {/* Session image */}
                            {featuredSession.images && featuredSession.images.length > 0 && (
                              <div className="w-full h-48 bg-gray-100">
                                <img
                                  src={featuredSession.images[0].url}
                                  alt={featuredSession.images[0].alt || featuredSession.title}
                                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                  data-testid="image-featured-session"
                                />
                              </div>
                            )}

                            <div className="p-4">
                              <div className="mb-2">
                                <h4 className="font-semibold text-gray-900 text-lg group-hover:text-primary transition-colors">{featuredSession.title}</h4>
                              </div>
                              {featuredSession.thumbnailDescription && (
                                <p className="text-gray-600 text-base mb-3 line-clamp-6">{featuredSession.thumbnailDescription}</p>
                              )}
                              <div className="flex justify-between items-center mt-2">
                                <span className="text-sm text-gray-500 flex items-center">
                                  <Clock className="w-4 h-4 mr-1" />
                                  {featuredSession.duration} min
                                </span>
                                <span className={`font-bold text-[#b66667] ${(featuredSession as any).isFree ? "text-sm" : "text-xl"}`}>
                                  {(featuredSession as any).isFree ? "Free" : formatPrice(featuredSession.price, (featuredSession as any).currency || "USD")}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    }
                  >
                    <BookingSection sessions={remainingSessions} profileId={profile.id} username={profile.username} displayName={profile.displayName || undefined} />
                  </ExpandableSection>
                ) : null;
              })()}

              {/* Featured Event with Full Events */}
              {featuredEvent && (() => {
                const remainingEvents = events.filter(e => e.id !== featuredEvent.id);
                return (
                <ExpandableSection
                  id="events"
                  title="Events & Workshops"
                  description="Upcoming workshops and group sessions"
                  icon={<CalendarCheck className="w-5 h-5 text-pink-600" />}
                  iconBgColor="bg-pink-100"
                  defaultExpanded={false}
                  hideExpander={remainingEvents.length === 0}
                  previewContent={
                    <div className="p-4">
                      <div className="flex items-center mb-3">
                        <CalendarCheck className="w-6 h-6 text-black mr-3" />
                        <h3 className="text-xl font-bold text-gray-900">Events</h3>
                      </div>
                      <div className="space-y-4">
                        <div
                          className="bg-white border border-gray-300 rounded-2xl overflow-hidden cursor-pointer hover:shadow-lg transition-shadow group flex flex-col"
                          onClick={() => setLocation(
                            featuredEvent.seriesId
                              ? `/${username}/event/${featuredEvent.seriesId}?asSeriesRoot=true`
                              : `/${username}/event/${featuredEvent.id}`
                          )}
                          data-testid="card-event-featured"
                        >
                          {featuredEvent.featuredImage && (
                            <div className="w-full h-48 bg-gray-100">
                              <img
                                src={featuredEvent.featuredImage}
                                alt={featuredEvent.title}
                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                              />
                            </div>
                          )}

                          <div className="p-4 flex flex-col flex-grow">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <h4 className="font-semibold text-gray-900 text-lg group-hover:text-primary transition-colors">{featuredEvent.title}</h4>
                              <span className="text-sm text-gray-500 whitespace-nowrap flex items-center">
                                <Calendar className="w-4 h-4 mr-1 text-gray-400" />
                                {featuredEvent.startAt
                                  ? new Date(featuredEvent.startAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                                  : "TBA"}
                              </span>
                            </div>

                            {/* Cadence badge for recurring series */}
                            {(featuredEvent.cadenceLabel || featuredEvent.isRecurring) && (
                              <div className="flex items-center gap-1.5 mb-2">
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-violet-600 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full">
                                  <Repeat className="w-2.5 h-2.5" />
                                  {featuredEvent.cadenceLabel || 'Recurring'}
                                </span>
                                {featuredEvent.upcomingCount != null && featuredEvent.upcomingCount > 0 && (
                                  <span className="text-[10px] font-medium text-gray-400">
                                    {featuredEvent.upcomingCount} upcoming
                                  </span>
                                )}
                              </div>
                            )}

                            {featuredEvent.thumbnailDescription && (
                              <p className="text-gray-600 text-base mb-3 line-clamp-6">{featuredEvent.thumbnailDescription}</p>
                            )}

                            <div className="space-y-2 mt-auto">
                              {featuredEvent.startAt && (() => {
                                const feTimezone = featuredEvent.timezone || "UTC";
                                const feStartAt = featuredEvent.startAt;
                                const feEndAt = featuredEvent.endAt;
                                const feDate = new Date(feStartAt).toISOString().split('T')[0];
                                const startD = new Date(feStartAt);
                                const startTimeStr = (startD.getHours() || startD.getMinutes())
                                  ? `${String(startD.getHours()).padStart(2, '0')}:${String(startD.getMinutes()).padStart(2, '0')}`
                                  : null;
                                const endD = feEndAt ? new Date(feEndAt) : null;
                                const endTimeStr = (endD && (endD.getHours() || endD.getMinutes()))
                                  ? `${String(endD.getHours()).padStart(2, '0')}:${String(endD.getMinutes()).padStart(2, '0')}`
                                  : null;
                                if (!startTimeStr) return null;
                                const ct = formatEventTimeForDisplay(startTimeStr, endTimeStr, feDate, feTimezone);
                                return (
                                  <div className="flex items-center text-sm text-gray-600">
                                    <Clock className="w-4 h-4 mr-2 text-gray-400" />
                                    <span>{ct.displayStart}{ct.displayEnd ? ` - ${ct.displayEnd}` : ''}</span>
                                    {ct.isConverted && (
                                      <span className="ml-1 text-xs text-gray-400">({formatTimezoneShort(ct.displayTimezone)})</span>
                                    )}
                                  </div>
                                );
                              })()}

                              <div className="flex items-center justify-between text-sm text-gray-600">
                                <div className="flex items-center">
                                  <MapPin className="w-4 h-4 mr-2 text-gray-400" />
                                  <span>
                                    {featuredEvent.mode === 'hybrid'
                                      ? "Online / In-person event"
                                      : featuredEvent.mode === 'online'
                                        ? "Online Event"
                                        : featuredEvent.mode === 'offline'
                                          ? `In-person ${featuredEvent.location ? `at ${featuredEvent.location}` : ""}`
                                          : "Event"
                                    }
                                  </span>
                                </div>
                                <span className={`font-bold text-[#b66667] ${featuredEvent.pricingType === 'free' ? "text-sm" : "text-xl"}`}>
                                  {featuredEvent.pricingType === 'free' ? "Free" : formatPrice(featuredEvent.price, featuredEvent.currency || "USD")}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  }
                >
                  <EventsSection events={remainingEvents} username={profile.username} creatorName={profile.displayName || ""} />
                </ExpandableSection>
                );
              })()}

              {/* Featured Blog Post with Full Blog */}
              {featuredBlogPost && (() => {
                const remainingBlogPosts = blogPosts.filter(p => p.id !== featuredBlogPost.id);
                return (
                <ExpandableSection
                  id="blog"
                  title="Blog"
                  description="Insights and tips for holistic wellness"
                  icon={<BookOpen className="w-5 h-5 text-warm" />}
                  iconBgColor="bg-warm bg-opacity-10"
                  defaultExpanded={false}
                  hideExpander={remainingBlogPosts.length === 0}
                  previewContent={
                    <div className="p-4">
                      <div className="flex items-center mb-3">
                        <BookOpen className="w-6 h-6 text-black mr-3" />
                        <h3 className="text-xl font-bold text-gray-900">Insights</h3>
                      </div>
                      <div className="space-y-4">
                        <div
                          className="bg-white border border-gray-200 rounded-2xl overflow-hidden cursor-pointer hover:shadow-lg transition-shadow group"
                          onClick={() => setLocation(`/${username}/blog/${featuredBlogPost.slug}`)}
                          data-testid="card-blog-featured"
                        >
                          {featuredBlogPost.imageUrl && (
                            <div className="w-full h-48 bg-gray-100 overflow-hidden">
                              <img 
                                src={featuredBlogPost.imageUrl} 
                                alt={featuredBlogPost.title}
                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                              />
                            </div>
                          )}
                          <div className="p-4">
                            <div className="flex items-center text-sm text-gray-500 mb-2">
                              <span>
                                {new Date(featuredBlogPost.createdAt!).toLocaleDateString('en-US', { 
                                  year: 'numeric', 
                                  month: 'long', 
                                  day: 'numeric' 
                                })}
                              </span>
                              {featuredBlogPost.readTime && (
                                <>
                                  <span className="mx-2">•</span>
                                  <span>{featuredBlogPost.readTime} min read</span>
                                </>
                              )}
                            </div>
                            <h4 className="text-lg font-semibold text-gray-900 mb-2 group-hover:text-primary transition-colors">{featuredBlogPost.title}</h4>
                            {(featuredBlogPost.thumbnailDescription || featuredBlogPost.excerpt) && (
                              <p className="text-gray-600 text-sm line-clamp-2">{featuredBlogPost.thumbnailDescription || featuredBlogPost.excerpt}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  }
                >
                  <BlogSection posts={remainingBlogPosts} />
                </ExpandableSection>
                );
              })()}

              {/* Links */}
              {profile.homePageLinks && profile.homePageLinks.length > 0 && (() => {
                const featuredLinks = profile.homePageLinks.slice(0, 2);
                const remainingLinks = profile.homePageLinks.slice(2);
                return (
                <ExpandableSection
                  id="resources"
                  title="Links"
                  description="Links to resources, guides, and tools"
                  icon={<LinkIcon className="w-5 h-5 text-indigo-600" />}
                  iconBgColor="bg-indigo-100"
                  defaultExpanded={false}
                  hideExpander={remainingLinks.length === 0}
                  previewContent={
                    <div className="p-6">
                      <div className="flex items-center mb-4">
                        <LinkIcon className="w-6 h-6 text-black mr-3" />
                        <h3 className="text-xl font-bold text-gray-900">Links</h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {featuredLinks.map((link: any, index: number) => (
                          <a
                            key={index}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-white border border-gray-300 rounded-2xl overflow-hidden cursor-pointer hover:shadow-lg transition-shadow group flex flex-col"
                            data-testid={`card-link-${index}`}
                          >
                            {link.imageUrl && (
                              <div className="w-full h-40 bg-gray-100">
                                <img
                                  src={link.imageUrl}
                                  alt={link.title}
                                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                />
                              </div>
                            )}
                            <div className="p-4 flex flex-col flex-grow">
                              <span className="inline-block px-2 py-1 text-xs font-medium bg-indigo-100 text-indigo-800 rounded-full mb-2 w-fit capitalize">
                                {link.type}
                              </span>
                              <h4 className="font-semibold text-gray-900 text-lg group-hover:text-primary transition-colors mb-1">
                                {link.title}
                              </h4>
                              <p className="text-gray-600 text-sm line-clamp-2">{link.description}</p>
                            </div>
                          </a>
                        ))}
                      </div>
                    </div>
                  }
                >
                  {/* Full Links List */}
                  <div className="p-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {remainingLinks.map((link: any, index: number) => (
                        <a
                          key={index}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-white border border-gray-200 rounded-xl overflow-hidden cursor-pointer hover:shadow-md transition-shadow group"
                          data-testid={`card-link-full-${index}`}
                        >
                          {link.imageUrl && (
                            <div className="w-full h-32 bg-gray-100">
                              <img
                                src={link.imageUrl}
                                alt={link.title}
                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                              />
                            </div>
                          )}
                          <div className="p-4">
                            <span className="inline-block px-2 py-0.5 text-xs font-medium bg-indigo-100 text-indigo-800 rounded-full mb-2 capitalize">
                              {link.type}
                            </span>
                            <h4 className="font-semibold text-gray-900 group-hover:text-primary transition-colors mb-1 line-clamp-1">
                              {link.title}
                            </h4>
                            <p className="text-gray-600 text-sm line-clamp-2">{link.description}</p>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                </ExpandableSection>
                );
              })()}

              {/* Featured Digital Product with Full Shop */}
              {featuredProduct && (() => {
                const remainingProducts = products.filter(p => p.id !== featuredProduct.id);
                return (
                <ExpandableSection
                  id="products"
                  title="Shop"
                  description="Guides, workbooks, and resources for your wellness journey"
                  icon={<Download className="w-5 h-5 text-secondary" />}
                  iconBgColor="bg-secondary bg-opacity-10"
                  defaultExpanded={false}
                  hideExpander={remainingProducts.length === 0}
                  previewContent={
                    <div className="p-4">
                      <div className="flex items-center mb-3">
                        <Download className="w-6 h-6 text-black mr-3" />
                        <h3 className="text-xl font-bold text-gray-900">Products</h3>
                      </div>
                      <div>
                        <div
                          className="bg-white rounded-2xl border border-gray-300 cursor-pointer hover:shadow-lg overflow-hidden"
                          data-testid="card-product-featured"
                        >
                          <div onClick={() => setLocation(`/${username}/product/${featuredProduct.id}`)}>
                            {featuredProduct.imageUrl && (
                              <div className="w-full h-48 bg-gray-100 overflow-hidden">
                                <img src={featuredProduct.imageUrl} alt={featuredProduct.title} className="w-full h-full object-cover" />
                              </div>
                            )}
                            <div className="p-4">
                              {(() => {
                                const productType = (featuredProduct as any).productType;
                                const typeConfig = productType === 'pdf' 
                                  ? { label: "PDF", Icon: FileText, color: "bg-red-100 text-red-700" }
                                  : productType === 'video'
                                  ? { label: "Video", Icon: Video, color: "bg-purple-100 text-purple-700" }
                                  : productType === 'image'
                                  ? { label: "Image", Icon: Image, color: "bg-blue-100 text-blue-700" }
                                  : { label: "Digital", Icon: Package, color: "bg-gray-100 text-gray-700" };
                                return (
                                  <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full mb-2 ${typeConfig.color}`}>
                                    <typeConfig.Icon className="w-3 h-3 mr-1" />
                                    {typeConfig.label}
                                  </span>
                                );
                              })()}
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-lg font-semibold text-gray-900 mb-1 hover:text-primary transition-colors">{featuredProduct.title}</h4>
                                  {(featuredProduct as any).thumbnailDescription && (
                                    <p className="text-gray-600 text-sm mb-1">
                                      {(featuredProduct as any).thumbnailDescription.substring(0, 100)}
                                      {(featuredProduct as any).thumbnailDescription.length > 100 && '...'}
                                    </p>
                                  )}
                                </div>
                                <div className="mt-2 sm:mt-0 sm:ml-4 flex flex-col items-end">
                                  <span className="text-xl font-bold text-primary">
                                    {(featuredProduct as any).isFree ? "Free" : formatPrice(featuredProduct.price, (featuredProduct as any).currency || "USD")}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="px-4 pb-4">
                            <Button 
                              className="w-full"
                              onClick={() => setLocation(`/${username}/product/${featuredProduct.id}`)}
                              data-testid="button-product-view-featured"
                            >
                              {(featuredProduct as any).isFree ? "Get Free" : "Buy Now"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  }
                >
                  <ProductsSection products={remainingProducts} />
                </ExpandableSection>
                );
              })()}

              {/* Photo Gallery */}
              {profile.galleryImages && profile.galleryImages.length > 0 && (
                <ExpandableSection
                  id="gallery"
                  title="Photo Gallery"
                  description="Behind the scenes and workshop moments"
                  icon={<Images className="w-5 h-5 text-accent" />}
                  iconBgColor="bg-accent bg-opacity-10"
                  previewContent={
                    <div className="p-6">
                      <div className="flex items-center mb-4">
                        <Images className="w-6 h-6 text-black mr-3" />
                        <h3 className="text-xl font-bold text-gray-900">Photo Gallery</h3>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {profile.galleryImages.slice(0, 6).map((image: GalleryImage, index: number) => (
                          <div key={index} className="relative aspect-square bg-muted rounded-lg overflow-hidden border border-gray-200">
                            <img
                              src={image.url}
                              alt={image.alt}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          </div>
                        ))}
                      </div>
                      {profile.galleryImages.length > 6 && (
                        <p className="text-purple-600 hover:text-purple-700 font-medium mt-4 text-sm">
                          Click to view all {profile.galleryImages.length} photos →
                        </p>
                      )}
                    </div>
                  }
                >
                  <GallerySection images={profile.galleryImages || []} />
                </ExpandableSection>
              )}

            </div>
          )}

          {/* Contact Tab */}
          {activeTab === "contact" && (
            <div className="space-y-8">
              {/* Contact Card */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">Contact Card</h2>
                {/* Profile Header */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center space-x-4">
                    <div className="relative">
                      <img
                        src={profile?.profileImageUrl || defaultProfileImage}
                        alt={profile?.displayName}
                        className="w-16 h-16 rounded-full object-cover border-2 border-primary shadow-sm"
                      />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900">{profile?.displayName}</h3>
                      {profile?.title && (
                        <p className="text-sm text-gray-600">{profile.title}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="icon"
                      onClick={() => {
                        // Presence equals visibility: any contact value that has been entered
                        // is intended to be public, so include it in share messages directly.
                        // Whitespace-only values are treated as empty so they don't render
                        // a useless contact link.
                        const phone = (profile?.contactInfo?.phone || profile?.contactInfo?.callToAction?.callNumber || '').trim() || null;
                        const whatsapp = (profile?.contactInfo?.whatsapp || profile?.contactInfo?.callToAction?.whatsAppNumber || '').trim() || null;
                        const email = (profile?.contactInfo?.email || profile?.contactInfo?.callToAction?.emailAddress || '').trim() || null;
                        const shareMessage = generateCoachShareMessage({
                          displayName: profile?.displayName || '',
                          title: profile?.title,
                          shortBio: profile?.shortBio,
                          username: profile?.username || '',
                          phone,
                          whatsapp,
                          email,
                        });
                        posthog.capture('profile_shared', { method: 'whatsapp', coach_username: username });
                        shareCoachOnWhatsApp({
                          displayName: profile?.displayName || '',
                          title: profile?.title,
                          shortBio: profile?.shortBio,
                          username: profile?.username || '',
                          phone,
                          whatsapp,
                          email,
                        });
                        if (navigator.share) {
                          posthog.capture('profile_shared', { method: 'native_share', coach_username: username });
                          navigator.share({
                            title: profile?.displayName,
                            text: shareMessage,
                            url: `${window.location.origin}/${profile?.username}`,
                          });
                        } else {
                          posthog.capture('profile_shared', { method: 'clipboard', coach_username: username });
                          navigator.clipboard.writeText(window.location.href);
                        }
                      }}
                      className="rounded-full bg-[#b66667] hover:bg-[#B85858] shadow-sm"
                      data-testid="button-share-coach"
                    >
                      <Share2 className="w-5 h-5 text-white" />
                    </Button>
                  </div>
                </div>
                {/* Contact Methods - Integrated with Call to Action */}
                {(() => {
                  // Presence equals visibility: a contact value that has been entered
                  // (in onboarding or the dashboard contact card) is meant to be public.
                  // The legacy showPhone / showWhatsApp / showEmail / showWebsite flags
                  // are intentionally ignored — only the value itself matters.
                  // Whitespace-only values are treated as empty so they don't render
                  // a useless contact link.
                  const phone = (profile?.contactInfo?.phone || profile?.contactInfo?.callToAction?.callNumber || '').trim() || undefined;
                  const whatsapp = (profile?.contactInfo?.whatsapp || profile?.contactInfo?.callToAction?.whatsAppNumber || '').trim() || undefined;
                  const email = (profile?.contactInfo?.email || profile?.contactInfo?.callToAction?.emailAddress || '').trim() || undefined;
                  const website = profile?.contactInfo?.website?.trim() || undefined;

                  // Location Logic
                  const loc = profile?.contactInfo?.location;
                  const showExactLocation = profile?.contactInfo?.showExactLocation ?? true;
                  const addressParts = loc ? [loc.address, loc.city, loc.state, loc.zipCode, loc.country].filter(Boolean) : [];
                  const displayAddress = addressParts.join(", ");
                  const hasLocation = loc && displayAddress && showExactLocation;

                  const hasVisibleContact = !!phone || !!whatsapp || !!email || !!website || hasLocation;

                  if (!hasVisibleContact) {
                    return (
                      <div className="text-center py-8">
                        <div className="bg-gray-50 rounded-lg p-8">
                          <p className="text-gray-600 text-lg mb-4">
                            Contact information will appear here once added by the profile owner.
                          </p>
                          <p className="text-gray-500">
                            Check back soon to get in touch with {profile?.displayName}!
                          </p>
                        </div>
                      </div>
                    );
                  }

              return (
                // Outer container with subtle branding border
                <div className="flex flex-col border border-[#b66667]/20 rounded-xl overflow-hidden mt-6 shadow-sm">
                  {phone && (
                    // CHANGED: border-b color to border-[#b66667]/20 to match outer border
                    (<div className="relative group flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors border-b border-[#b66667]/20 last:border-0">
                      {/* Call to Action Layer */}
                      <a
                        href={`tel:${phone.replace(/[^\d+]/g, '')}`}
                        className="absolute inset-0 z-0"
                        aria-label="Call"
                      />
                      {/* Icon in Branding Color */}
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[#b66667]/10 text-[#b66667] relative z-10 pointer-events-none">
                        <Phone className="w-5 h-5" />
                      </div>
                      {/* Content */}
                      <div className="flex-1 min-w-0 relative z-10 pointer-events-none">
                        <h3 className="font-semibold text-gray-900">Phone</h3>
                        <p className="text-sm text-gray-600 truncate">{phone}</p>
                      </div>
                      {/* Copy Button */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="relative z-20 h-8 w-8 text-gray-400 hover:bg-[#b66667] hover:text-white rounded-md transition-all duration-200"
                        onClick={(e) => {
                          e.stopPropagation();
                          copyToClipboard(phone, "Phone number");
                        }}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>)
                  )}
                  {whatsapp && (
                    // CHANGED: border-b color to border-[#b66667]/20
                    (<div className="relative group flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors border-b border-[#b66667]/20 last:border-0">
                      <a
                        href={`https://wa.me/${whatsapp.replace(/[^\d]/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="absolute inset-0 z-0"
                        aria-label="WhatsApp"
                      />
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[#b66667]/10 text-[#b66667] relative z-10 pointer-events-none">
                        <MessageCircle className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0 relative z-10 pointer-events-none">
                        <h3 className="font-semibold text-gray-900">WhatsApp</h3>
                        <p className="text-sm text-gray-600 truncate">{whatsapp}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="relative z-20 h-8 w-8 text-gray-400 hover:bg-[#b66667] hover:text-white rounded-md transition-all duration-200"
                        onClick={(e) => {
                          e.stopPropagation();
                          copyToClipboard(whatsapp, "WhatsApp number");
                        }}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>)
                  )}
                  {email && (
                    // CHANGED: border-b color to border-[#b66667]/20
                    (<div className="relative group flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors border-b border-[#b66667]/20 last:border-0">
                      <a
                        href={`mailto:${encodeURIComponent(email)}`}
                        className="absolute inset-0 z-0"
                        aria-label="Email"
                      />
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[#b66667]/10 text-[#b66667] relative z-10 pointer-events-none">
                        <Mail className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0 relative z-10 pointer-events-none">
                        <h3 className="font-semibold text-gray-900">Email</h3>
                        <p className="text-sm text-gray-600 truncate">{email}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="relative z-20 h-8 w-8 text-gray-400 hover:bg-[#b66667] hover:text-white rounded-md transition-all duration-200"
                        onClick={(e) => {
                          e.stopPropagation();
                          copyToClipboard(email, "Email address");
                        }}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>)
                  )}
                  {website && (
                    // CHANGED: border-b color to border-[#b66667]/20
                    (<div className="relative group flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors border-b border-[#b66667]/20 last:border-0">
                      <a
                        href={website.startsWith('http') ? website : `https://${website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="absolute inset-0 z-0"
                        aria-label="Website"
                      />
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[#b66667]/10 text-[#b66667] relative z-10 pointer-events-none">
                        <Globe className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0 relative z-10 pointer-events-none">
                        <h3 className="font-semibold text-gray-900">Website</h3>
                        <p className="text-sm text-gray-600 truncate">{website.replace(/^https?:\/\//, '')}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="relative z-20 h-8 w-8 text-gray-400 hover:bg-[#b66667] hover:text-white rounded-md transition-all duration-200"
                        onClick={(e) => {
                          e.stopPropagation();
                          copyToClipboard(website, "Website URL");
                        }}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>)
                  )}
                  {hasLocation && (
                    // CHANGED: border-b color to border-[#b66667]/20
                    (<div className="relative group flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors border-b border-[#b66667]/20 last:border-0">
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(displayAddress)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="absolute inset-0 z-0"
                        aria-label="Open Map"
                      />
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[#b66667]/10 text-[#b66667] relative z-10 pointer-events-none">
                        <MapPin className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0 relative z-10 pointer-events-none">
                        <h3 className="font-semibold text-gray-900">Address</h3>
                        <p className="text-sm text-gray-600 line-clamp-2">{displayAddress}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="relative z-20 h-8 w-8 text-gray-400 hover:bg-[#b66667] hover:text-white rounded-md transition-all duration-200"
                        onClick={(e) => {
                          e.stopPropagation();
                          copyToClipboard(displayAddress, "Address");
                        }}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>)
                  )}
                </div>
              );
                })()}

                {/* Social Media Links - PNG Icons */}
                {profile?.contactInfo?.socialMediaLinks && profile.contactInfo.socialMediaLinks.length > 0 && (
                  <div className="mt-8 pt-8 border-t border-gray-200">
                    <h3 className="font-semibold text-gray-900 mb-4 text-[15px]">Social Media</h3>
                    <div className="flex flex-wrap gap-3 justify-center">
                      {profile.contactInfo.socialMediaLinks.map((social: any, index: number) => {
                        const getSocialIconSrc = (platform: string) => {
                          switch (platform) {
                            case 'facebook':
                              return facebookIcon;
                            case 'twitter':
                              return twitterIcon;
                            case 'instagram':
                              return instagramIcon;
                            case 'linkedin':
                              return linkedinIcon;
                            case 'youtube':
                              return youtubeIcon;
                            case 'tiktok':
                              return tiktokIcon;
                            case 'snapchat':
                              return snapchatIcon;
                            case 'pinterest':
                              return pinterestIcon;
                            default:
                              return null;
                          }
                        };

                        const iconSrc = getSocialIconSrc(social.platform);

                        return (
                          <a
                            key={index}
                            href={social.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center w-10 h-10 hover:opacity-80 transition-opacity"
                            title={`Visit ${social.platform.charAt(0).toUpperCase() + social.platform.slice(1)}`}
                          >
                            {iconSrc ? (
                              <img src={iconSrc} alt={social.platform} className="w-10 h-10 object-contain" />
                            ) : (
                              <div className="w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center">
                                <LinkIcon className="w-[17px] h-[17px]" />
                              </div>
                            )}
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* QR Code Section - Below Social Media */}
                {qrCodeData && (
                  <div className="mt-8 pt-8 border-t border-gray-200 text-center">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Scan to Connect</h3>
                    <div className="inline-block p-4 bg-white rounded-lg border-2 border-gray-200 shadow-sm">
                      <img
                        src={qrCodeData}
                        alt="Profile QR Code"
                        className="w-32 h-32 mx-auto"
                      />
                    </div>
                    <p className="text-sm text-gray-600 mt-2">Scan with your phone camera</p>
                  </div>
                )}


                {/* Contact Links */}
                {profile?.contactInfo?.contactLinks && profile.contactInfo.contactLinks.length > 0 && (
                  <div className="mt-8 pt-8 border-t border-gray-200">
                    <h3 className="font-semibold text-gray-900 mb-4 text-[17px]">Links</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {profile.contactInfo.contactLinks.map((link: any, index: number) => (
                        <a
                          key={index}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors group"
                        >
                          <LinkIcon className="w-4 h-4 text-primary mr-3 group-hover:text-blue-600" />
                          <span className="text-gray-900 font-medium">{link.title}</span>
                          <span className="text-xs text-gray-500 ml-2 px-2 py-1 bg-white rounded">
                            {link.type}
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Quick Message Form */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
                <h2 className="font-bold text-gray-900 mb-6 text-[22px]">Send a Message</h2>
                <form onSubmit={handleContactSubmit}>
                  <div className="grid md:grid-cols-2 gap-6">
                    <input
                      type="text"
                      placeholder="Your Name *"
                      value={contactForm.name}
                      onChange={(e) => setContactForm(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                      data-testid="input-contact-name"
                      disabled={contactMutation.isPending}
                    />
                    <input
                      type="email"
                      placeholder="Your Email *"
                      value={contactForm.email}
                      onChange={(e) => setContactForm(prev => ({ ...prev, email: e.target.value }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                      data-testid="input-contact-email"
                      disabled={contactMutation.isPending}
                    />
                    <input
                      type="tel"
                      placeholder="Your Phone (Optional)"
                      value={contactForm.phone}
                      onChange={(e) => setContactForm(prev => ({ ...prev, phone: e.target.value }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                      data-testid="input-contact-phone"
                      disabled={contactMutation.isPending}
                    />
                    <input
                      type="text"
                      placeholder="Subject *"
                      value={contactForm.subject}
                      onChange={(e) => setContactForm(prev => ({ ...prev, subject: e.target.value }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                      data-testid="input-contact-subject"
                      disabled={contactMutation.isPending}
                    />
                  </div>
                  <textarea
                    placeholder="Your Message *"
                    value={contactForm.message}
                    onChange={(e) => setContactForm(prev => ({ ...prev, message: e.target.value }))}
                    rows={4}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent mt-6"
                    data-testid="input-contact-message"
                    disabled={contactMutation.isPending}
                  />
                  <Button 
                    type="submit" 
                    className="w-full bg-primary text-white mt-6"
                    disabled={contactMutation.isPending}
                    data-testid="button-send-message"
                  >
                    {contactMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Mail className="w-4 h-4 mr-2" />
                        Send Message
                      </>
                    )}
                  </Button>
                </form>
              </div>

              {/* Location Map - Only show if location data exists and showExactLocation is enabled */}
              {(() => {
                const loc = profile.contactInfo?.location;
                const showExact = profile.contactInfo?.showExactLocation ?? true;
                const googleApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
                
                if (!showExact || !loc || !googleApiKey) return null;
                
                // Build address for display
                const addressParts = [loc.address, loc.city, loc.state, loc.zipCode, loc.country].filter(Boolean);
                const displayAddress = addressParts.join(", ");
                
                // Build map query
                const mapQuery = loc.latitude && loc.longitude 
                  ? `${loc.latitude},${loc.longitude}`
                  : encodeURIComponent(displayAddress || "");
                
                if (!mapQuery) return null;
                
                const mapSrc = `https://www.google.com/maps/embed/v1/place?key=${googleApiKey}&q=${mapQuery}`;
                
                return (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="p-6 border-b border-gray-200">
                      <h2 className="text-2xl font-bold text-gray-900">Visit Our Location</h2>
                      <p className="text-gray-600 mt-2">{displayAddress || "Location available"}</p>
                    </div>
                    <div className="h-96 bg-gray-100 relative">
                      <iframe
                        src={mapSrc}
                        width="100%"
                        height="100%"
                        style={{ border: 0 }}
                        allowFullScreen
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                        className="rounded-b-xl"
                        title={`${profile.displayName} Location`}
                      ></iframe>
                    </div>
                  </div>
                );
              })()}

              {/* Quick Contact */}
              {(() => {
                // Presence equals visibility: a contact value that has been entered
                // is meant to be public. The legacy show* visibility flags are ignored.
                // Whitespace-only values are treated as empty so they don't render
                // a useless contact link.
                const phone = (profile?.contactInfo?.phone || profile?.contactInfo?.callToAction?.callNumber || '').trim() || undefined;
                const whatsapp = (profile?.contactInfo?.whatsapp || profile?.contactInfo?.callToAction?.whatsAppNumber || '').trim() || undefined;
                const email = (profile?.contactInfo?.email || profile?.contactInfo?.callToAction?.emailAddress || '').trim() || undefined;
                const website = profile?.contactInfo?.website?.trim() || undefined;

                const hasVisibleContact = !!phone || !!whatsapp || !!email || !!website;

                if (!hasVisibleContact) {
                  return null;
                }

                return (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
                    <h2 className="font-bold text-gray-900 mb-6 text-center text-[22px]">Quick Contact</h2>
                    <div className="flex flex-col items-center gap-3 max-w-sm mx-auto">
                      {phone && (
                        <Button
                          className="w-full bg-white text-[#b66667] border border-[#b66667] hover:bg-[#b66667] hover:text-white transition-colors"
                          onClick={() => window.open(`tel:${phone.replace(/[^\d+]/g, '')}`, '_self')}
                        >
                          <Phone className="w-4 h-4 mr-2" />
                          Call Now
                        </Button>
                      )}
                      {whatsapp && (
                        <Button
                          className="w-full bg-white text-[#b66667] border border-[#b66667] hover:bg-[#b66667] hover:text-white transition-colors"
                          onClick={() => window.open(`https://wa.me/${whatsapp.replace(/[^\d]/g, '')}`, '_blank')}
                          data-testid="button-whatsapp"
                        >
                          <MessageCircle className="w-4 h-4 mr-2" />
                          WhatsApp
                        </Button>
                      )}
                      {email && (
                        <Button
                          className="w-full bg-white text-[#b66667] border border-[#b66667] hover:bg-[#b66667] hover:text-white transition-colors"
                          onClick={() => window.open(`mailto:${email}`, '_self')}
                        >
                          <Mail className="w-4 h-4 mr-2" />
                          Send Email
                        </Button>
                      )}
                      {website && (
                        <Button
                          className="w-full bg-white text-[#b66667] border border-[#b66667] hover:bg-[#b66667] hover:text-white transition-colors"
                          onClick={() => window.open(website.startsWith('http') ? website : `https://${website}`, '_blank')}
                          data-testid="button-website"
                        >
                          <Globe className="w-4 h-4 mr-2" />
                          Visit Website
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

        </div>
      </div>
      {/* Footer */}
      <footer className="bg-white mt-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="pt-8 pb-12 border-t border-gray-100 text-center">
            <Link href="/">
               <img src={riplekLogo1} alt="Riplect" className="h-8 mx-auto mb-4 block" data-testid="img-footer-logo" />
            </Link>

            <p className="text-gray-500 mb-6 text-sm">Join Riplect.Where your creation begins to Ripple beyond you.</p>

            <Link href="/auth">
              <Button
                className="bg-gray-900 text-white hover:bg-gray-800 rounded-full px-8 font-medium"
              >
                <UserCircle className="w-4 h-4 mr-2" />
                Join Riplect
              </Button>
            </Link>

            <div className="mt-8 flex justify-center gap-6 text-xs text-gray-400">
              <Link href="/terms-of-service" className="hover:text-gray-600" data-testid="link-footer-terms">Terms of Service</Link>
              <Link href="/privacy-policy" className="hover:text-gray-600" data-testid="link-footer-privacy">Privacy Policy</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
      }