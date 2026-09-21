import { useState, useEffect, useRef, useMemo } from "react";
import { linkifyText } from "@/lib/linkify";
import riplekLogo1 from "@assets/Color_Variations_copy_9@144x-2_1775978761578.png";
import { useRoute, useSearch, Link } from "wouter";
import { useSmartBack } from "@/hooks/use-smart-back";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Share2, Calendar, Clock, MapPin, Users, DollarSign, Globe, UserCircle, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Play, Repeat, Phone, Mail, Download } from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { DayPicker } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { format } from "date-fns";
import { EventRegistrationModal } from "@/components/event-registration-modal";
import { useToast } from "@/hooks/use-toast";
import { posthog } from "@/lib/posthog";
import defaultProfileImage from "@assets/WhatsApp Image 2025-11-28 at 13.31.40_1764389051024.jpeg";
import { formatPrice } from "@shared/currencies";
import type { EventWithExtras } from "@shared/schema";
import { generateEventShareMessage } from "@/lib/whatsapp-share";
import { getTimezoneLabel, formatEventTimeForDisplay, getBrowserTimezone, formatTimezoneShort } from "@/lib/timezone-utils";
import { apiRequest } from "@/lib/queryClient";
import { buildEventUrl, generateEventQrDataUrl, downloadQrImage } from "@/lib/event-qr";

interface Profile {
  id: number;
  userId: string;
  username: string;
  displayName: string;
  title?: string;
  bio?: string;
  profileImageUrl?: string;
  contactInfo?: {
    phone?: string;
    showPhone?: boolean;
    whatsapp?: string;
    showWhatsApp?: boolean;
    email?: string;
    showEmail?: boolean;
    callToAction?: {
      enableCall?: boolean;
      callNumber?: string;
      enableWhatsApp?: boolean;
      whatsAppNumber?: string;
      enableEmail?: boolean;
      emailAddress?: string;
    };
  };
}

interface MediaItem {
  type: 'image' | 'video';
  url: string;
  alt?: string;
}


function MediaCarousel({ featuredImage, mediaItems, title }: {
  featuredImage?: string | null;
  mediaItems?: MediaItem[] | null;
  title: string;
}) {
  const images: MediaItem[] = [];

  if (featuredImage) {
    images.push({ type: 'image', url: featuredImage, alt: title });
  }
  if (mediaItems) {
    images.push(...mediaItems.filter(m => m.type === 'image'));
  }

  const [currentIndex, setCurrentIndex] = useState(0);
  const goTo = (index: number) => setCurrentIndex(Math.max(0, Math.min(index, images.length - 1)));

  const touchStartX = useRef<number | null>(null);
  const touchCurrentX = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchCurrentX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchCurrentX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (touchStartX.current === null || touchCurrentX.current === null) return;
    const delta = touchCurrentX.current - touchStartX.current;
    if (Math.abs(delta) >= 50) {
      if (delta < 0) {
        goTo(currentIndex + 1);
      } else {
        goTo(currentIndex - 1);
      }
    }
    touchStartX.current = null;
    touchCurrentX.current = null;
  };

  if (images.length === 0) {
    return (
      <div className="aspect-[3/2] w-full flex items-center justify-center bg-gray-200 text-gray-400">
        <Calendar className="w-16 h-16" />
      </div>
    );
  }

  return (
    <div>
      {/* Image Carousel */}
      <div className="relative w-full">
        <div
          className="aspect-[3/2] w-full overflow-hidden relative bg-gray-900"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <img
            key={images[currentIndex].url}
            src={images[currentIndex].url}
            alt={images[currentIndex].alt || title}
            className="w-full h-full object-cover transition-opacity duration-300"
          />
        </div>

        {images.length > 1 && (
          <>
            <button
              onClick={() => goTo(currentIndex - 1)}
              disabled={currentIndex === 0}
              className="absolute left-3 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-all disabled:opacity-0"
              aria-label="Previous image"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => goTo(currentIndex + 1)}
              disabled={currentIndex === images.length - 1}
              className="absolute right-3 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-all disabled:opacity-0"
              aria-label="Next image"
            >
              <ChevronRight className="w-5 h-5" />
            </button>

            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex gap-1.5">
              {images.map((_, i) => (
                <button
                  key={i}
                  onClick={() => goTo(i)}
                  className={`rounded-full transition-all ${i === currentIndex ? 'w-5 h-2 bg-white' : 'w-2 h-2 bg-white/50'}`}
                  aria-label={`Go to image ${i + 1}`}
                />
              ))}
            </div>

            <div className="absolute bottom-3 right-4 z-10 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full">
              {currentIndex + 1} / {images.length}
            </div>
          </>
        )}
      </div>

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div className="flex gap-1.5 px-2 py-2 bg-gray-900 overflow-x-auto scrollbar-hide">
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className={`flex-shrink-0 w-16 h-12 rounded overflow-hidden border-2 transition-all ${i === currentIndex ? 'border-white' : 'border-transparent opacity-60 hover:opacity-90'}`}
            >
              <img src={img.url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function VideoGallery({ mediaItems }: { mediaItems?: MediaItem[] | null }) {
  const videos = mediaItems?.filter(m => m.type === 'video') || [];
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (videos.length === 0) return null;

  return (
    <div className="mb-8 space-y-3">
      {videos.map((video, i) => (
        <div
          key={i}
          className="relative rounded-xl overflow-hidden bg-gray-950 aspect-video"
        >
          {activeIndex === i ? (
            <video
              src={video.url}
              className="w-full h-full object-contain"
              controls
              playsInline
              autoPlay
            />
          ) : (
            <div
              className="relative w-full h-full cursor-pointer group"
              onClick={() => setActiveIndex(i)}
            >
              <video
                src={video.url}
                className="w-full h-full object-cover opacity-70 group-hover:opacity-90 transition-opacity duration-300"
                muted
                playsInline
                preload="metadata"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-white/20 backdrop-blur-sm group-hover:bg-white/30 transition-all duration-300 rounded-full p-5 shadow-xl group-hover:scale-110 transform">
                  <Play className="w-8 h-8 text-white fill-white" />
                </div>
              </div>
              <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ORDINALS = ['', '1st', '2nd', '3rd', '4th', '5th'];

function getRecurringCadenceLabel(pattern: EventWithExtras['seriesPattern']): string | null {
  if (!pattern) return null;
  // New canonical pattern format
  if (pattern.type === 'weekly') {
    const dayNames = ([...(pattern.weekdays || [])] as number[]).sort((a, b) => a - b).map(d => WEEKDAY_SHORT[d]).join(' & ');
    if (pattern.intervalWeeks === 2) return `Every other ${dayNames}`;
    if (pattern.intervalWeeks > 2) return `Every ${pattern.intervalWeeks} weeks on ${dayNames}`;
    return `Every ${dayNames}`;
  }
  if (pattern.type === 'monthly_nth') {
    return `${ORDINALS[pattern.nth] || 'Nth'} ${WEEKDAY_NAMES[pattern.weekday]} of each month`;
  }
  if (pattern.type === 'monthly_date') {
    const d = pattern.dayOfMonth;
    const suffix = d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th';
    return `${d}${suffix} of each month`;
  }
  if (pattern.type === 'custom') return 'Custom dates';
  return null;
}

interface InstanceWithCounts extends EventWithExtras {
  registrationCount: number;
  isFull: boolean;
}

export default function EventDetail() {
  const [, params] = useRoute("/:username/event/:eventId");
  const username = params?.username;
  const eventId = params?.eventId;
  const searchStr = useSearch();
  const searchParams = new URLSearchParams(searchStr);
  const asSeriesRoot = searchParams.get('asSeriesRoot') === 'true';
  const [isRegistrationModalOpen, setIsRegistrationModalOpen] = useState(false);
  const [selectedInstanceId, setSelectedInstanceId] = useState<number | null>(null);
  const [instancesLimit, setInstancesLimit] = useState(6);
  const { toast } = useToast();
  const goBack = useSmartBack(`/${username}#events`);

  // Contact widget state
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [senderModalOpen, setSenderModalOpen] = useState(false);
  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [senderPhone, setSenderPhone] = useState("");

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Fetch profile
  const { data: profile, isLoading: profileLoading } = useQuery<Profile>({
    queryKey: [`/api/profiles/${username}`],
  });

  // Build the event API URL — include ?asSeriesRoot=true when navigating from a series card
  const eventApiUrl = asSeriesRoot
    ? `/api/profiles/${username}/events/${eventId}?asSeriesRoot=true`
    : `/api/profiles/${username}/events/${eventId}`;

  // Fetch event
  const { data: event, isLoading: eventLoading } = useQuery<EventWithExtras>({
    queryKey: [eventApiUrl],
  });

  const isSeriesEvent = !!(event?.isRecurring) || !!(event?.seriesId);

  // Fetch instances for series events
  // Pass ?asSeriesRoot=true when navigating via series-root URL so the server
  // resolves eventId as a series ID (avoiding event.id / event_series.id collisions)
  // Pass limit so TanStack Query refetches when instancesLimit grows (true pagination)
  const instancesBaseUrl = `/api/profiles/${username}/events/${eventId}/instances`;
  const instancesUrl = `${instancesBaseUrl}?${asSeriesRoot ? 'asSeriesRoot=true&' : ''}limit=${instancesLimit}`;
  const { data: instancesData, isFetching: instancesFetching } = useQuery<{ instances: InstanceWithCounts[]; upcomingCount: number; total: number }>({
    queryKey: [instancesUrl],
    enabled: !!username && !!eventId && isSeriesEvent,
  });

  const instances = instancesData?.instances || [];
  const instancesTotal = instancesData?.total ?? instances.length;
  // Server returns exactly `instancesLimit` entries — no local slicing needed
  const visibleInstances = instances;
  const selectedInstance = instances.find(i => i.id === selectedInstanceId) || null;

  // Calendar month view state
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => new Date());

  // Group loaded instances by calendar date for the mini-calendar
  const instancesByDate = useMemo(() => {
    const map = new Map<string, InstanceWithCounts[]>();
    for (const inst of instances) {
      if (!inst.startAt) continue;
      const key = format(new Date(inst.startAt), 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(inst);
    }
    return map;
  }, [instances]);

  const now = useMemo(() => new Date(), []);

  const sessionDates = useMemo<Date[]>(() => {
    const dates: Date[] = [];
    for (const [key, insts] of instancesByDate) {
      const hasAvailable = insts.some(i => !i.isCancelled && !i.isFull && new Date(i.startAt!) >= now);
      if (hasAvailable) dates.push(new Date(key));
    }
    return dates;
  }, [instancesByDate, now]);

  const unavailableDates = useMemo<Date[]>(() => {
    const dates: Date[] = [];
    for (const [key, insts] of instancesByDate) {
      const hasAvailable = insts.some(i => !i.isCancelled && !i.isFull && new Date(i.startAt!) >= now);
      if (!hasAvailable) dates.push(new Date(key));
    }
    return dates;
  }, [instancesByDate, now]);

  // Keep calendar month in sync with selected instance
  useEffect(() => {
    if (selectedInstance?.startAt) {
      setCalendarMonth(new Date(selectedInstance.startAt));
    }
  }, [selectedInstanceId]);

  // Initialize calendar month to first upcoming instance month
  useEffect(() => {
    if (instances.length > 0) {
      const first = instances.find(i => i.startAt && new Date(i.startAt) >= now);
      if (first?.startAt) setCalendarMonth(new Date(first.startAt));
      else if (instances[0]?.startAt) setCalendarMonth(new Date(instances[0].startAt));
    }
  }, [instances, now]);

  // Auto-preselect the current event if it is itself an instance in the series
  const currentEventNumId = event?.id;
  useEffect(() => {
    if (!instances.length || selectedInstanceId !== null) return;
    const currentNumericId = currentEventNumId ? Number(currentEventNumId) : null;
    if (!currentNumericId) return;
    const match = instances.find(i => i.id === currentNumericId);
    if (match && !match.isCancelled) {
      setSelectedInstanceId(match.id);
    } else {
      // Pre-select the first available upcoming instance
      const firstAvailable = instances.find(
        i => !i.isCancelled && new Date(i.startAt!) >= new Date()
      );
      if (firstAvailable) setSelectedInstanceId(firstAvailable.id);
    }
  }, [instances.length, currentEventNumId]);

  // Track event viewed
  useEffect(() => {
    if (event && username) {
      posthog.capture('event_viewed', {
        event_id: event.id,
        event_title: event.title,
        coach_username: username,
        is_free: event.pricingType === 'free',
      });
    }
  }, [event?.id]);

  // Generate QR code for this event page. Runs whenever we have a loaded
  // event + a username from the route — covers standalone events, recurring
  // series instances, and signed-out viewers (no auth needed to render).
  useEffect(() => {
    if (!event?.id || !username) return;
    let active = true;
    setQrDataUrl(null);
    const eventUrl = buildEventUrl(username, event.id);
    generateEventQrDataUrl(eventUrl)
      .then((dataUrl) => {
        if (active) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (active) setQrDataUrl(null);
      });
    return () => {
      active = false;
    };
  }, [event?.id, username]);

  // Contact mutation
  const contactMutation = useMutation({
    mutationFn: async (data: { name: string; email: string; phone?: string; message: string; subject: string }) => {
      const response = await apiRequest("POST", `/api/profiles/${profile?.id}/contact`, data);
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Message Sent!",
        description: data?.message || "Your message has been sent successfully.",
      });
      setSenderModalOpen(false);
      setMessageText("");
      setSenderName("");
      setSenderEmail("");
      setSenderPhone("");
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send message",
        description: error?.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const handleSendMessage = () => {
    if (!senderName.trim() || !senderEmail.trim()) return;
    const evDate = evStartAt ? new Date(evStartAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    const subject = `[${event?.title || ''}]${evDate ? ` – ${evDate}` : ''}`;
    contactMutation.mutate({ name: senderName, email: senderEmail, phone: senderPhone || undefined, message: messageText, subject });
  };

  const handleDownloadQr = async () => {
    const url = event?.qrCodeUrl || qrDataUrl;
    if (!url) return;
    await downloadQrImage(url, event?.title);
  };

  const eventTimezone = event?.timezone || "UTC";
  const visitorTimezone = getBrowserTimezone();
  const evStartAt = event?.startAt as unknown as string | null | undefined;
  const evEndAt = event?.endAt as unknown as string | null | undefined;
  const evMode = event?.mode || 'online';
  const evLocVis = (event?.locationVisibility || {}) as {
    showLocationName?: boolean;
    showStreetAddress?: boolean;
    showMapLocation?: boolean;
  };
  const evIsOnline = evMode === 'online' || evMode === 'hybrid';
  const evIsOffline = evMode === 'offline' || evMode === 'hybrid';

  // Derive legacy-style startTime/endTime strings for formatEventTimeForDisplay
  const deriveTimeStr = (dt: string | null | undefined) => {
    if (!dt) return undefined;
    const d = new Date(dt);
    if (d.getHours() === 0 && d.getMinutes() === 0) return undefined;
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const evStartTimeStr = deriveTimeStr(evStartAt) ?? null;
  const evEndTimeStr = deriveTimeStr(evEndAt) ?? null;
  const eventDateStr = evStartAt ? new Date(evStartAt).toISOString().split('T')[0] : '';
  const convertedTime = event ? formatEventTimeForDisplay(
    evStartTimeStr,
    evEndTimeStr,
    eventDateStr,
    eventTimezone,
    visitorTimezone
  ) : null;

  const handleShare = () => {
    if (!event || !username) return;
    
    const shareMessage = generateEventShareMessage({
      title: event.title,
      thumbnailDescription: event.thumbnailDescription,
      startAt: evStartAt,
      endAt: evEndAt,
      price: event.price,
      pricingType: (event.pricingType || 'paid') as 'paid' | 'free' | 'donation',
      currency: event.currency ?? undefined,
      location: event.location,
      isOnline: evIsOnline,
      username: username,
      eventId: event.id
    });
    
    if (navigator.share) {
      posthog.capture('event_shared', { method: 'native_share', event_id: event.id, coach_username: username });
      navigator.share({
        title: event.title,
        text: shareMessage,
        url: window.location.href,
      });
    } else {
      posthog.capture('event_shared', { method: 'clipboard', event_id: event.id, coach_username: username });
      navigator.clipboard.writeText(shareMessage);
      toast({ description: "Event details copied to clipboard" });
    }
  };

  const addToGoogleCalendar = () => {
    if (!event) return;

    const pad2 = (n: number) => String(n).padStart(2, '0');
    const fmtDt = (dt: string | null | undefined, fallbackDate: string) => {
      if (!dt) return fallbackDate.replace(/-/g, '');
      const d = new Date(dt);
      const base = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
      if (d.getHours() === 0 && d.getMinutes() === 0) return base;
      return `${base}T${pad2(d.getHours())}${pad2(d.getMinutes())}00`;
    };
    const dateStrBase = evStartAt ? new Date(evStartAt).toISOString().split('T')[0] : '';
    const startDateTime = fmtDt(evStartAt, dateStrBase);
    let endDateTime: string;
    if (evEndAt) {
      endDateTime = fmtDt(evEndAt, dateStrBase);
    } else if (evStartAt) {
      const sd = new Date(evStartAt);
      const ed = new Date(sd.getTime() + 60 * 60 * 1000);
      endDateTime = `${ed.getFullYear()}${pad2(ed.getMonth() + 1)}${pad2(ed.getDate())}T${pad2(ed.getHours())}${pad2(ed.getMinutes())}00`;
    } else {
      endDateTime = startDateTime;
    }

    const details = encodeURIComponent(event.description || "");
    const locationParts: string[] = [];
    if (evLocVis.showLocationName !== false && event.location) {
      locationParts.push(event.location);
    }
    if (evLocVis.showStreetAddress === true && event.locationAddress) {
      locationParts.push(event.locationAddress);
    }
    const cityStateCountry = [event.locationCity, event.locationState, event.locationCountry].filter(Boolean).join(", ");
    if (cityStateCountry && evIsOffline) {
      locationParts.push(cityStateCountry);
    }
    const location = encodeURIComponent(locationParts.length > 0 ? locationParts.join(", ") : (evIsOnline ? "Online" : ""));
    const title = encodeURIComponent(event.title);

    const ctz = encodeURIComponent(eventTimezone);
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startDateTime}/${endDateTime}&details=${details}&location=${location}&ctz=${ctz}`;
    window.open(url, '_blank');
  };

  if (profileLoading || eventLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!profile || !event) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center py-8">
          <Calendar className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">Event not found</h3>
          <p className="mt-2 text-sm text-gray-500">
            The event you're looking for doesn't exist or has been removed.
          </p>
          <Button className="mt-4" onClick={goBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Profile
          </Button>
        </div>
      </div>
    );
  }

  const eventDate = evStartAt ? new Date(evStartAt) : new Date();
  const currentDate = new Date();
  const eventDateEndOfDay = new Date(eventDate);
  eventDateEndOfDay.setHours(23, 59, 59, 999);
  const currentDateStartOfDay = new Date(currentDate);
  currentDateStartOfDay.setHours(0, 0, 0, 0);
  // For series events, consider it upcoming if any instance is in the future
  const seriesHasUpcoming = isSeriesEvent && instances.some(
    i => !i.isCancelled && new Date(i.startAt!) >= currentDateStartOfDay
  );
  const isUpcoming = seriesHasUpcoming || eventDateEndOfDay >= currentDateStartOfDay;

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-3xl mx-auto pb-12">
        {/* Media Area */}
        <div className="relative w-full">
          <div className="absolute top-4 left-4 z-20">
            <Button variant="secondary" size="icon" className="rounded-full bg-white/90 hover:bg-white shadow-sm" onClick={goBack}>
              <ArrowLeft className="w-5 h-5 text-gray-700" />
            </Button>
          </div>
          <div className="absolute top-4 right-4 z-20 flex gap-2">
            <Button variant="secondary" size="icon" onClick={handleShare} className="rounded-full bg-white/90 hover:bg-white shadow-sm">
              <Share2 className="w-5 h-5 text-gray-700" />
            </Button>
          </div>

          <MediaCarousel
            featuredImage={event.featuredImage}
            mediaItems={event.mediaItems}
            title={event.title}
          />
        </div>

        {/* Content Card */}
        <div className="relative -mt-6 rounded-t-3xl bg-white px-6 py-4 shadow-sm">

          {/* Row 1: Upcoming/Past Event badge + Date */}
          <div className="flex items-center justify-between mb-3" data-testid="event-header-row">
            <Badge variant="secondary" className={`${isUpcoming ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
              {isUpcoming ? 'Upcoming Event' : 'Past Event'}
            </Badge>
            <span className="text-sm text-gray-500">
              {evStartAt ? new Date(evStartAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : ''}
            </span>
          </div>

          {/* Row 2: Online/Offline Event Indicator + Add to Calendar */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex flex-wrap items-center gap-2">
              {evMode === 'hybrid' ? (
                <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                  <Globe className="w-3 h-3 mr-1" />
                  Hybrid Event
                </Badge>
              ) : evMode === 'online' ? (
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                  <Globe className="w-3 h-3 mr-1" />
                  Online Event
                </Badge>
              ) : evMode === 'offline' ? (
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                  <MapPin className="w-3 h-3 mr-1" />
                  In-Person Event
                </Badge>
              ) : null}
              {(event.isRecurring || event.seriesId) && (() => {
                // Prefer server-provided cadenceLabel, fall back to local computation from seriesPattern
                const cadence = event.cadenceLabel || getRecurringCadenceLabel(event.seriesPattern);
                const upcomingCount = event.upcomingCount;
                return (
                  <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200" data-testid="badge-recurring-cadence">
                    <Repeat className="w-3 h-3 mr-1" />
                    {cadence
                      ? upcomingCount != null ? `${cadence} · ${upcomingCount} upcoming` : cadence
                      : 'Recurring Series'}
                  </Badge>
                );
              })()}
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={addToGoogleCalendar}
              className="text-xs"
            >
              <CalendarIcon className="w-3 h-3 mr-2" />
              Add to Calendar
            </Button>
          </div>

          <h1 className="text-3xl font-bold text-gray-900 mb-3">
            {event.title}
          </h1>

          {event.thumbnailDescription && (
            <p className="text-lg text-gray-600 mb-6 leading-snug">
              {event.thumbnailDescription}
            </p>
          )}

          {/* Host Profile */}
          <Link href={`/${username}`}>
            <div className="flex items-center gap-4 mb-8 p-4 bg-gray-50 rounded-xl border border-gray-100 cursor-pointer hover:bg-gray-100 transition-colors">
              <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-white shadow-sm flex-shrink-0">
                <img
                  src={profile.profileImageUrl || defaultProfileImage}
                  alt={profile.displayName}
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Hosted by</p>
                <h3 className="font-bold text-gray-900">{profile.displayName}</h3>
                {profile.title && (
                  <p className="text-sm text-gray-600">{profile.title}</p>
                )}
              </div>
            </div>
          </Link>

          {/* Videos */}
          <VideoGallery mediaItems={event.mediaItems} />

          {/* Description */}
          {event.description && (
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">About this event</h3>
              <div className="prose prose-gray max-w-none text-gray-600">
                <p className="whitespace-pre-wrap leading-relaxed">{linkifyText(event.description)}</p>
              </div>
            </div>
          )}

          {/* Details Grid */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Details</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-[#b66667]" />
                  <div>
                    <p className="font-medium text-gray-900">Date</p>
                    <p className="text-gray-600">{format(eventDate, "EEEE, MMMM dd, yyyy")}</p>
                  </div>
                </div>

                {evStartTimeStr && convertedTime && (
                  <div className="flex items-center gap-3">
                    <Clock className="w-5 h-5 text-[#b66667]" />
                    <div>
                      <p className="font-medium text-gray-900">Time</p>
                      <p className="text-gray-600">
                        {convertedTime.displayStart} {convertedTime.displayEnd ? `- ${convertedTime.displayEnd}` : ''}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {convertedTime.isConverted ? (
                          <>{formatTimezoneShort(visitorTimezone)}</>
                        ) : (
                          <>{formatTimezoneShort(eventTimezone)}</>
                        )}
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <DollarSign className="w-5 h-5 text-[#b66667]" />
                  <div>
                    <p className="font-medium text-gray-900">Price</p>
                    {event.pricingType === 'free' ? (
                      <p className="text-sm text-gray-600">Free</p>
                    ) : event.pricingType === 'donation' ? (
                      <div>
                        <p className="text-sm text-gray-600">Donation</p>
                        {event.donationNote && <p className="text-xs text-muted-foreground">{event.donationNote}</p>}
                      </div>
                    ) : (
                      <p className="text-gray-600">{formatPrice(event.price, event.currency || "USD")}</p>
                    )}
                  </div>
                </div>
              </div>

                            <div className="space-y-4">
                              {evIsOnline && (
                                <div className="flex items-center gap-3">
                                  <Globe className="w-5 h-5 text-[#b66667]" />
                                  <div>
                                    <p className="font-medium text-gray-900">Online Event</p>
                                  </div>
                                </div>
                              )}

                              {evIsOffline && (
                                <div className="flex items-start gap-3 min-w-0">
                                  <MapPin className="w-5 h-5 text-[#b66667] flex-shrink-0 mt-0.5" />
                                  <div className="min-w-0 flex-1 overflow-hidden">
                                    <span className="font-medium text-gray-900 block">In-Person Event</span>
                                    {/* Show location name if enabled */}
                                    {evLocVis.showLocationName !== false && event.location && (
                                      <span className="text-sm text-gray-600 block mt-0.5 break-words">{event.location}</span>
                                    )}
                                    {/* Show street address if enabled */}
                                    {evLocVis.showStreetAddress === true && event.locationAddress && (
                                      <span className="text-sm text-gray-600 block mt-0.5">{event.locationAddress}</span>
                                    )}
                                    {/* Always show city, state, country for offline events */}
                                    {(event.locationCity || event.locationState || event.locationCountry) && (
                                      <span className="text-sm text-gray-600 block mt-0.5">
                                        {[event.locationCity, event.locationState, event.locationCountry].filter(Boolean).join(", ")}
                                      </span>
                                    )}
                                    {/* Show map link if enabled */}
                                    {evLocVis.showMapLocation === true && event.locationUrl ? (
                                      <a
                                        href={event.locationUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-sm underline text-[#b66667] hover:text-[#b85858] block mt-1"
                                      >
                                        View on Map
                                      </a>
                                    ) : null}
                                  </div>
                                </div>
                              )}

                              {event.maxAttendees && (
                                  <div className="flex items-center gap-3">
                                    <Users className="w-5 h-5 text-[#b66667]" />
                                    <div>
                                      <p className="font-medium text-gray-900">Capacity</p>
                                      <p className="text-gray-600">{event.maxAttendees} people</p>
                                    </div>
                                  </div>
                                )}
                            </div>
                          </div>


            {/* Testimonials */}
            {event.testimonials && (
              <div className="mt-8 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Client Testimonials</h3>
                <p className="text-gray-700 whitespace-pre-wrap">
                  {event.testimonials}
                </p>
              </div>
            )}
          </div>

          {/* Date Picker — Series Events */}
          {isSeriesEvent && instances.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-[#b66667]" />
                Choose a Date
              </h2>

              {/* Mini month calendar */}
              <div className="mb-5 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden" data-testid="series-mini-calendar">
                <style>{`
                  .event-cal .rdp-months { display: flex; justify-content: center; }
                  .event-cal .rdp-caption { display: flex; justify-content: center; align-items: center; padding: 0.5rem 0; position: relative; }
                  .event-cal .rdp-caption_label { font-size: 0.9rem; font-weight: 600; color: #111827; }
                  .event-cal .rdp-nav { display: flex; align-items: center; gap: 0.25rem; position: absolute; right: 0; }
                  .event-cal .rdp-nav_button { display: flex; align-items: center; justify-content: center; width: 2rem; height: 2rem; border-radius: 9999px; border: 1px solid #e5e7eb; background: white; cursor: pointer; color: #6b7280; transition: background 0.15s, color 0.15s; }
                  .event-cal .rdp-nav_button:hover { background: #fdf2f2; color: #b66667; border-color: #b66667; }
                  .event-cal .rdp-nav_button_previous { position: absolute; left: 0; }
                  .event-cal .rdp-nav_button_next { position: absolute; right: 0; }
                  .event-cal .rdp-table { width: 100%; border-collapse: collapse; }
                  .event-cal .rdp-head_cell { text-align: center; font-size: 0.7rem; font-weight: 500; color: #9ca3af; padding-bottom: 0.35rem; }
                  .event-cal .rdp-cell { text-align: center; padding: 0.1rem; }
                  .event-cal .rdp-day { width: 2.25rem; height: 2.25rem; border-radius: 9999px; font-size: 0.8rem; color: #374151; border: none; background: transparent; cursor: default; display: inline-flex; align-items: center; justify-content: center; transition: background 0.15s, color 0.15s; }
                  .event-cal .rdp-day_outside { color: #d1d5db; }
                  .event-cal .rdp-day_disabled { color: #e5e7eb; }
                  .event-cal .rdp-day_today { font-weight: 700; color: #b66667; }
                  .event-cal .rdp-day.day-session { background: #fdf2f2; color: #b66667; font-weight: 600; cursor: pointer; position: relative; }
                  .event-cal .rdp-day.day-session::after { content: ''; position: absolute; bottom: 3px; left: 50%; transform: translateX(-50%); width: 4px; height: 4px; border-radius: 9999px; background: #b66667; }
                  .event-cal .rdp-day.day-session:hover { background: #b66667; color: white; }
                  .event-cal .rdp-day.day-session:hover::after { background: white; }
                  .event-cal .rdp-day.day-unavailable { color: #d1d5db; cursor: default; }
                  .event-cal .rdp-day.day-selected { background: #b66667 !important; color: white !important; font-weight: 700; cursor: pointer; }
                  .event-cal .rdp-day.day-selected::after { background: white !important; }
                `}</style>
                <DayPicker
                  className="event-cal p-4"
                  mode="single"
                  month={calendarMonth}
                  onMonthChange={setCalendarMonth}
                  selected={selectedInstance?.startAt ? new Date(selectedInstance.startAt) : undefined}
                  onDayClick={(day) => {
                    const key = format(day, 'yyyy-MM-dd');
                    const dayInstances = instancesByDate.get(key) || [];
                    const available = dayInstances.find(i => !i.isCancelled && !i.isFull && new Date(i.startAt!) >= now);
                    if (available) {
                      setSelectedInstanceId(prev => prev === available.id ? null : available.id);
                    }
                  }}
                  modifiers={{
                    'day-session': sessionDates,
                    'day-unavailable': unavailableDates,
                    'day-selected': selectedInstance?.startAt ? [new Date(selectedInstance.startAt)] : [],
                  }}
                  modifiersClassNames={{
                    'day-session': 'day-session',
                    'day-unavailable': 'day-unavailable',
                    'day-selected': 'day-selected',
                  }}
                  showOutsideDays
                  components={{
                    IconLeft: () => <ChevronLeft className="w-4 h-4" />,
                    IconRight: () => <ChevronRight className="w-4 h-4" />,
                  }}
                />
                <div className="px-4 pb-3 flex items-center gap-4 text-xs text-gray-500 border-t border-gray-100 pt-2">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-[#b66667]" />
                    Available
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-gray-200" />
                    Unavailable
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {visibleInstances.map((inst) => {
                  const instDate = inst.startAt ? new Date(inst.startAt) : null;
                  const isSelected = selectedInstanceId === inst.id;
                  const isInstanceCancelled = inst.isCancelled;
                  const isInstanceFull = inst.isFull;
                  const isPast = instDate ? instDate < new Date() : false;
                  const spotsLeft = inst.maxAttendees != null
                    ? Math.max(0, inst.maxAttendees - inst.registrationCount)
                    : null;

                  const isSelectable = !isInstanceCancelled && !isInstanceFull && !isPast;

                  return (
                    <button
                      key={inst.id}
                      type="button"
                      data-testid={`btn-instance-${inst.id}`}
                      disabled={!isSelectable}
                      onClick={() => isSelectable && setSelectedInstanceId(isSelected ? null : inst.id)}
                      className={`text-left p-4 rounded-2xl border transition-all duration-200 ${
                        isSelected
                          ? 'border-[#b66667] bg-[#b66667]/5 ring-2 ring-[#b66667]/20'
                          : isSelectable
                          ? 'border-gray-200 bg-white hover:border-[#b66667]/50 hover:bg-gray-50 cursor-pointer'
                          : 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed'
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">
                            {instDate ? format(instDate, "EEE, MMM d") : "—"}
                          </p>
                          <p className="text-gray-500 text-xs mt-0.5">
                            {instDate && instDate.getHours() !== 0
                              ? instDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                              : 'Time TBA'}
                            {inst.endAt && new Date(inst.endAt).getHours() !== 0
                              ? ` – ${new Date(inst.endAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
                              : ''}
                          </p>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          {isInstanceCancelled ? (
                            <span className="text-xs font-medium text-red-500 bg-red-50 px-2 py-0.5 rounded-full">Cancelled</span>
                          ) : isInstanceFull ? (
                            <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Full</span>
                          ) : spotsLeft !== null && spotsLeft <= 5 ? (
                            <span className="text-xs font-medium text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">{spotsLeft} left</span>
                          ) : (
                            <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Open</span>
                          )}
                        </div>
                      </div>
                      {isSelected && (
                        <div className="mt-2 flex items-center gap-1 text-[#b66667] text-xs font-medium">
                          <ChevronRight className="w-3 h-3" />
                          Selected
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              {instancesTotal > instancesLimit && (
                <button
                  type="button"
                  onClick={() => setInstancesLimit(prev => Math.min(prev + 6, instancesTotal))}
                  disabled={instancesFetching}
                  className="mt-3 w-full text-center text-sm text-[#b66667] font-medium hover:underline disabled:opacity-50"
                  data-testid="btn-show-more-dates"
                >
                  {instancesFetching ? 'Loading...' : `Show ${Math.min(6, instancesTotal - instancesLimit)} more dates ↓`}
                </button>
              )}
            </div>
          )}

          {/* Actions */}
          {isUpcoming && (
            <div className="flex flex-col gap-6 mt-8">
                <Button 
                  size="lg" 
                  disabled={isSeriesEvent && !selectedInstanceId}
                  onClick={() => {
                    if (isSeriesEvent && !selectedInstanceId) return;
                    posthog.capture('event_registration_opened', {
                      event_id: event?.id,
                      event_title: event?.title,
                      coach_username: username,
                    });
                    setIsRegistrationModalOpen(true);
                  }}
                  className="w-full bg-[#b66667] text-white hover:bg-[#b85858] h-14 text-lg font-bold rounded-2xl shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSeriesEvent
                    ? selectedInstanceId
                      ? `Register for ${selectedInstance?.startAt ? format(new Date(selectedInstance.startAt), "MMM d") : 'Selected Date'}`
                      : 'Select a date to register'
                    : 'Register Now'}
                </Button>

                {/* Contact Widget */}
                {(() => {
                  // Presence equals visibility — any contact value entered by the
                  // coach is meant to be public, regardless of the legacy show* flags.
                  // Whitespace-only values are treated as empty so they don't render
                  // a useless contact link.
                  const phone = (profile.contactInfo?.phone || profile.contactInfo?.callToAction?.callNumber || '').trim() || undefined;
                  const whatsapp = (profile.contactInfo?.whatsapp || profile.contactInfo?.callToAction?.whatsAppNumber || '').trim() || undefined;
                  const email = (profile.contactInfo?.email || profile.contactInfo?.callToAction?.emailAddress || '').trim() || undefined;
                  const cleanPhone = (n?: string) => n?.replace(/[^+\d]/g, '') || '';
                  const cleanWa = (n?: string) => n?.replace(/[^\d]/g, '') || '';
                  const displayQr = event.qrCodeUrl || qrDataUrl;
                  const eventPublicUrl = username ? buildEventUrl(username, event.id) : null;

                  return (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                      {/* Part 1: Send a message */}
                      <div className="p-5 border-b border-gray-100 text-center">
                        <h3 className="text-base font-semibold text-gray-900 mb-3">Send a message</h3>
                        <Textarea
                          placeholder="Write your message…"
                          className="resize-none mb-3 text-sm text-left"
                          rows={3}
                          value={messageText}
                          onChange={(e) => setMessageText(e.target.value)}
                          data-testid="textarea-event-message"
                        />
                        <Button
                          onClick={() => {
                            if (!messageText.trim()) {
                              toast({ description: "Please write a message first.", variant: "destructive" });
                              return;
                            }
                            setSenderModalOpen(true);
                          }}
                          className="bg-[#b66667] text-white hover:bg-[#b85858] w-full font-semibold rounded-xl"
                          data-testid="button-send-message"
                        >
                          Send Message →
                        </Button>
                      </div>

                      {/* Part 2: Event QR code — always rendered when we have a public URL,
                          with explicit fallback states so the section never silently disappears */}
                      {eventPublicUrl && (
                        <div className="p-5 border-b border-gray-100 flex flex-col items-center text-center" data-testid="section-event-qr">
                          {displayQr ? (
                            <>
                              <div className="inline-block bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
                                <img
                                  src={displayQr}
                                  alt="Event QR code"
                                  className="w-40 h-40 block"
                                  data-testid="img-event-qr"
                                />
                              </div>
                              <p className="text-xs text-gray-500 mt-2">Scan to share this event</p>
                              <p
                                className="text-[11px] text-gray-400 break-all px-2 mt-1 max-w-[18rem]"
                                data-testid="text-event-qr-url"
                              >
                                {eventPublicUrl}
                              </p>
                              <div className="mt-3 flex items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={handleDownloadQr}
                                  data-testid="button-download-qr"
                                  className="inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 px-2.5 py-1.5 rounded-md border border-gray-200 hover:bg-gray-50 transition-colors"
                                  aria-label="Download QR code"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  Download
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      await navigator.clipboard.writeText(eventPublicUrl);
                                      toast({ description: "Event link copied to clipboard" });
                                    } catch {
                                      toast({ description: "Could not copy link. Please copy it manually.", variant: "destructive" });
                                    }
                                  }}
                                  data-testid="button-copy-event-qr-link"
                                  className="inline-flex items-center text-xs text-gray-600 hover:text-gray-900 px-2.5 py-1.5 rounded-md border border-gray-200 hover:bg-gray-50 transition-colors"
                                  aria-label="Copy event link"
                                >
                                  Copy link
                                </button>
                              </div>
                            </>
                          ) : (
                            <div className="w-full flex flex-col items-center" data-testid="event-qr-fallback">
                              <div className="inline-block bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
                                <div className="w-40 h-40 bg-gray-50 flex items-center justify-center text-xs text-gray-400">
                                  Generating QR…
                                </div>
                              </div>
                              <p
                                className="text-[11px] text-gray-400 break-all px-2 mt-2 max-w-[18rem] text-center"
                                data-testid="text-event-qr-url"
                              >
                                {eventPublicUrl}
                              </p>
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(eventPublicUrl);
                                    toast({ description: "Event link copied to clipboard" });
                                  } catch {
                                    toast({ description: "Could not copy link. Please copy it manually.", variant: "destructive" });
                                  }
                                }}
                                className="mt-2 text-xs text-[#b66667] hover:underline"
                                data-testid="button-event-qr-copy-link"
                              >
                                Copy event link instead
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Part 3: Direct contact icons */}
                      <div className="p-5 text-center">
                        <h3 className="text-base font-semibold text-gray-900 mb-3">Contact {profile.displayName}</h3>
                        {phone || whatsapp || email ? (
                          <div className="flex items-center justify-center gap-3">
                            {phone && (
                              <a
                                href={`tel:${cleanPhone(phone)}`}
                                data-testid="link-contact-phone"
                                className="w-11 h-11 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center hover:bg-gray-100 transition-colors"
                                aria-label="Call"
                              >
                                <Phone className="w-5 h-5 text-[#b66667]" />
                              </a>
                            )}
                            {whatsapp && (
                              <a
                                href={`https://wa.me/${cleanWa(whatsapp)}`}
                                target="_blank"
                                rel="noreferrer"
                                data-testid="link-contact-whatsapp"
                                className="w-11 h-11 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center hover:bg-gray-100 transition-colors"
                                aria-label="WhatsApp"
                              >
                                <SiWhatsapp className="w-5 h-5 text-[#25D366]" />
                              </a>
                            )}
                            {email && (
                              <a
                                href={`mailto:${email}`}
                                data-testid="link-contact-email"
                                className="w-11 h-11 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center hover:bg-gray-100 transition-colors"
                                aria-label="Email"
                              >
                                <Mail className="w-5 h-5 text-[#b66667]" />
                              </a>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500">Contact details are not publicly listed for this event.</p>
                        )}
                      </div>
                    </div>
                  );
                })()}

                <Link href={`/${username}#events`}>
                    <Button 
                        variant="outline"
                        size="lg" 
                        className="w-full border-[#b66667] text-[#b66667] hover:bg-red-50 h-12 font-semibold rounded-2xl"
                    >
                        View All Events
                    </Button>
                </Link>
            </div>
          )}

          {/* Footer */}
          <div className="mt-12 pt-8 border-t border-gray-100 text-center">
            <Link href="/">
               <img src={riplekLogo1} alt="Riplect" className="h-8 mx-auto mb-4 block" data-testid="img-footer-logo" />
            </Link>
            <p className="text-gray-500 mb-6 text-sm">
              Join thousands of creators who are building their business with Riplect.
            </p>
            <Link href="/auth">
              <Button className="bg-gray-900 text-white hover:bg-gray-800 rounded-full px-8 font-medium">
                <UserCircle className="w-4 h-4 mr-2" />
                Join Riplect
              </Button>
            </Link>
          </div>

        </div>

        {/* Registration Modal */}
        {event && profile && (
          <EventRegistrationModal
            event={event}
            creatorName={profile.displayName}
            isOpen={isRegistrationModalOpen}
            onClose={() => setIsRegistrationModalOpen(false)}
            instanceId={selectedInstanceId}
            instanceDate={selectedInstance?.startAt as string | null | undefined}
            instance={selectedInstance}
          />
        )}

        {/* Sender Details Modal */}
        <Dialog open={senderModalOpen} onOpenChange={setSenderModalOpen}>
          <DialogContent className="max-w-sm mx-auto" data-testid="dialog-sender-details">
            <DialogHeader>
              <DialogTitle>Your details</DialogTitle>
              <DialogDescription>Tell us who you are so the coach can get back to you.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Name *</label>
                <Input
                  placeholder="Your name"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  data-testid="input-sender-name"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Email *</label>
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={senderEmail}
                  onChange={(e) => setSenderEmail(e.target.value)}
                  data-testid="input-sender-email"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Phone (optional)</label>
                <Input
                  type="tel"
                  placeholder="+1 234 567 8900"
                  value={senderPhone}
                  onChange={(e) => setSenderPhone(e.target.value)}
                  data-testid="input-sender-phone"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setSenderModalOpen(false)}
                disabled={contactMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSendMessage}
                disabled={contactMutation.isPending || !senderName.trim() || !senderEmail.trim()}
                className="bg-[#b66667] text-white hover:bg-[#b85858]"
                data-testid="button-confirm-send"
              >
                {contactMutation.isPending ? "Sending…" : "Send"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}