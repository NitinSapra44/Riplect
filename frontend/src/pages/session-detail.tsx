import { useState, useEffect, useMemo } from "react";
import { linkifyText } from "@/lib/linkify";
import riplekLogo1 from "@assets/Color_Variations_copy_9@144x-2_1775978761578.png";
import { useRoute, Link, useLocation } from "wouter";
import { useSmartBack } from "@/hooks/use-smart-back";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Share2, Clock, DollarSign, ChevronLeft, ChevronRight, MapPin, Globe, UserCircle, CalendarIcon, User, Mail, Phone, CheckCircle2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BookingSession } from "@shared/schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { posthog } from "@/lib/posthog";
import defaultProfileImage from "@assets/WhatsApp Image 2025-11-28 at 13.31.40_1764389051024.jpeg";
import { formatPrice } from "@shared/currencies";
import { generateSessionShareMessage } from "@/lib/whatsapp-share";
import { getTimezoneLabel, getBrowserTimezone, formatTimezoneShort, formatTime24to12, convertTimeBetweenTimezones } from "@/lib/timezone-utils";

interface Profile {
  id: number;
  userId: string;
  username: string;
  displayName: string;
  title?: string;
  bio?: string;
  profileImageUrl?: string;
}

interface MentorAvailability {
  id: number;
  profileId: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
}

interface BlockedDate {
  id: number;
  profileId: number;
  blockedDate: string;
  reason?: string;
}

interface BookingFormData {
  name: string;
  email: string;
  phone: string;
  message: string;
  customQuestionAnswer: string;
}

export default function SessionDetail() {
  const [, params] = useRoute("/:username/session/:sessionId");
  const username = params?.username;
  const sessionId = params?.sessionId;
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const goBack = useSmartBack(`/${username}#bookings`);

  // Booking State
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [selectedMode, setSelectedMode] = useState<"online" | "offline">("online");
  const [bookingData, setBookingData] = useState<BookingFormData>({
    name: "",
    email: "",
    phone: "",
    message: "",
    customQuestionAnswer: ""
  });
  const [isBookingDialogOpen, setIsBookingDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState<{
    confirmationCode: string;
    guestAccessToken: string;
    bookingId: number;
    date: string;
    time: string;
    sessionTitle: string;
  } | null>(null);

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Fetch profile
  const { data: profile, isLoading: profileLoading } = useQuery<Profile>({
    queryKey: [`/api/profiles/${username}`],
  });

  // Fetch session
  const { data: session, isLoading: sessionLoading } = useQuery<BookingSession>({
    queryKey: [`/api/profiles/${username}/sessions/${sessionId}`],
  });

  // Track session viewed
  useEffect(() => {
    if (session && username) {
      posthog.capture('session_viewed', {
        session_id: session.id,
        session_title: session.title,
        coach_username: username,
        is_free: session.isFree ?? false,
      });
    }
  }, [session?.id]);

  // Fetch availability
  const { data: availabilityData } = useQuery<{ availability: MentorAvailability[], blockedDates: BlockedDate[], timezone?: string }>({
    queryKey: ['/api/profiles', username, 'availability'],
    queryFn: async () => {
      if (!username) return { availability: [], blockedDates: [] };
      const response = await fetch(`/api/profiles/${username}/availability`);
      if (!response.ok) {
        throw new Error('Failed to fetch availability');
      }
      return response.json();
    },
    enabled: !!username
  });

  const availability = availabilityData?.availability || [];
  const blockedDates = availabilityData?.blockedDates || [];
  const profileTimezone = availabilityData?.timezone || "Asia/Kolkata";

  const visitorTimezone = getBrowserTimezone();
  const isDifferentTimezone = profileTimezone !== visitorTimezone;

  const hasAvailabilityConfigured = availability.length > 0;

  const timeSlots = useMemo(() => {
    if (!selectedDate || !hasAvailabilityConfigured) {
      return [];
    }

    const dayOfWeek = selectedDate.getDay();
    const dayAvailability = availability.filter(a => a.dayOfWeek === dayOfWeek && a.isActive);

    if (dayAvailability.length === 0) return [];

    const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
    const slots: { coachTime24: string; displayTime: string; dateChanged: boolean }[] = [];

    dayAvailability.forEach(avail => {
      const [startHour, startMin] = avail.startTime.split(':').map(Number);
      const [endHour, endMin] = avail.endTime.split(':').map(Number);
      let currentHour = startHour;
      let currentMin = startMin;

      while (currentHour < endHour || (currentHour === endHour && currentMin < endMin)) {
        const time24 = `${currentHour.toString().padStart(2, '0')}:${currentMin.toString().padStart(2, '0')}`;

        if (isDifferentTimezone) {
          const converted = convertTimeBetweenTimezones(time24, dateStr, profileTimezone, visitorTimezone);
          slots.push({ coachTime24: time24, displayTime: formatTime24to12(converted.time), dateChanged: converted.dateChanged });
        } else {
          slots.push({ coachTime24: time24, displayTime: formatTime24to12(time24), dateChanged: false });
        }

        currentMin += 60;
        if (currentMin >= 60) {
          currentMin = 0;
          currentHour += 1;
        }
      }
    });
    return slots;
  }, [selectedDate, availability, hasAvailabilityConfigured, profileTimezone, visitorTimezone, isDifferentTimezone]);

  const queryClient = useQueryClient();

  const selectedDateStr = selectedDate
    ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`
    : null;

  const { data: bookedSlotsData, isFetching: isSlotsFetching } = useQuery<{ bookingDate: string; bookingTime: string }[]>({
    queryKey: ['/api/sessions', session?.id, 'booked-slots', selectedDateStr],
    queryFn: async () => {
      const response = await fetch(`/api/sessions/${session!.id}/booked-slots?date=${selectedDateStr}`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!session && !!selectedDateStr,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: true,
  });

  const bookedTimes = new Set(
    (bookedSlotsData || [])
      .filter(s => s.bookingDate === selectedDateStr)
      .map(s => s.bookingTime)
  );

  const availableSlots = useMemo(
    () => timeSlots.filter(slot => !bookedTimes.has(slot.coachTime24)),
    [timeSlots, bookedSlotsData, selectedDateStr] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const isDateDisabled = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) return true;

    // Use local date components for calendar date to avoid UTC off-by-one in non-UTC timezones
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    // Slice the first 10 chars of the stored date string to get YYYY-MM-DD without any Date re-parsing
    const isBlocked = blockedDates.some(blocked => {
      const blockedDateStr = String(blocked.blockedDate).slice(0, 10);
      return blockedDateStr === dateStr;
    });
    if (isBlocked) return true;

    if (!hasAvailabilityConfigured) return true;

    const dayOfWeek = date.getDay();
    const hasAvailabilityForDay = availability.some(a => a.dayOfWeek === dayOfWeek && a.isActive);
    if (!hasAvailabilityForDay) return true;

    // Legacy check if session has specific availableDays
    if (session && session.availableDays) {
        const dayOfWeek = date.getDay();
        return !session.availableDays.includes(dayOfWeek);
    }

    return false;
  };

  // --- Handlers ---

  const openBookingDialog = () => {
    if (!session) return;
    // Invalidate cached booked-slots so re-opening always shows fresh data
    queryClient.invalidateQueries({
      queryKey: ['/api/sessions', session.id, 'booked-slots'],
    });
    setSelectedDate(undefined);
    setSelectedTime("");
    if (session.isOnline && !session.isOffline) {
      setSelectedMode("online");
    } else if (session.isOffline && !session.isOnline) {
      setSelectedMode("offline");
    } else {
      setSelectedMode("online");
    }
    posthog.capture('booking_dialog_opened', {
      session_id: session?.id,
      session_title: session?.title,
      coach_username: username,
    });
    setIsBookingDialogOpen(true);
  };

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !selectedDate || !selectedTime || !profile) {
      toast({ title: "Error", description: "Missing required information.", variant: "destructive" });
      return;
    }
    if (!bookingData.name || !bookingData.email) {
      toast({ title: "Missing Information", description: "Please fill in your name and email.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const coachTime12h = formatTime24to12(selectedTime);
      const bookingRequest = {
        sessionId: session.id,
        profileId: profile.id,
        clientName: bookingData.name,
        clientEmail: bookingData.email,
        clientPhone: bookingData.phone,
        customQuestionAnswer: bookingData.customQuestionAnswer,
        message: bookingData.message,
        bookingDate: selectedDateStr,
        bookingTime: coachTime12h,
        totalAmount: session.price,
        paymentStatus: "pending"
      };

      const response = await apiRequest("POST", "/api/bookings", bookingRequest);
      const result = await response.json();

      if (result.success) {
        const displaySlot = timeSlots.find(s => s.coachTime24 === selectedTime);
        posthog.capture('booking_submitted', {
          session_id: session.id,
          session_title: session.title,
          coach_username: username,
          booking_date: selectedDateStr,
          is_free: session.isFree ?? false,
        });
        toast({
          title: "Booking Request Sent",
          description: `Your request for ${session.title} on ${selectedDate.toLocaleDateString()} at ${displaySlot?.displayTime || coachTime12h} has been submitted and is awaiting confirmation.`,
        });
        // Invalidate all booked-slots cache entries for this session (prefix key, no date segment)
        await queryClient.invalidateQueries({
          queryKey: ['/api/sessions', session.id, 'booked-slots'],
        });
        setBookingSuccess({
          confirmationCode: result.confirmationCode,
          guestAccessToken: result.guestAccessToken,
          bookingId: result.booking.id,
          date: selectedDate.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
          time: displaySlot?.displayTime || coachTime12h,
          sessionTitle: session.title,
        });
        setBookingData({ name: "", email: "", phone: "", message: "", customQuestionAnswer: "" });
      } else {
        throw new Error("Booking creation failed");
      }
    } catch (error) {
      toast({ title: "Booking Failed", description: "There was an error completing your booking.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleShare = () => {
    if (!session || !username) return;
    
    const shareMessage = generateSessionShareMessage({
      title: session.title,
      thumbnailDescription: session.thumbnailDescription,
      duration: session.duration,
      price: session.price,
      isFree: session.isFree ?? false,
      currency: session.currency ?? undefined,
      username: username,
      sessionId: session.id
    });
    
    if (navigator.share) {
      posthog.capture('session_shared', { method: 'native_share', session_id: session.id, coach_username: username });
      navigator.share({
        title: session.title,
        text: shareMessage,
        url: window.location.href,
      });
    } else {
      posthog.capture('session_shared', { method: 'clipboard', session_id: session.id, coach_username: username });
      navigator.clipboard.writeText(shareMessage);
      toast({ description: "Session details copied to clipboard" });
    }
  };

  const nextImage = () => {
    if (session?.images && session.images.length > 0) {
      setCurrentImageIndex((prev) => (prev + 1) % (session.images?.length || 1));
    }
  };

  const previousImage = () => {
    if (session?.images && session.images.length > 0) {
      setCurrentImageIndex((prev) => (prev - 1 + (session.images?.length || 1)) % (session.images?.length || 1));
    }
  };

  if (profileLoading || sessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!profile || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center py-8">
          <Clock className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">Session not found</h3>
          <p className="mt-2 text-sm text-gray-500">
            The session you're looking for doesn't exist or has been removed.
          </p>
          <Button className="mt-4" onClick={goBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Profile
          </Button>
        </div>
      </div>
    );
  }

  const hasImages = session.images && session.images.length > 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* No Top Navigation Bar */}

      <main className="max-w-3xl mx-auto pb-12">
        {/* Image Carousel Area with Overlay Buttons */}
        <div className="relative w-full bg-gray-200">
          {/* Back and Share Buttons - Top Corners */}
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

          {/* Hero image */}
          <div className="aspect-video w-full overflow-hidden relative">
            {hasImages ? (
              <>
                <img
                  src={session.images![currentImageIndex]?.url || ''}
                  alt={session.images![currentImageIndex]?.alt || session.title}
                  className="w-full h-full object-cover"
                />
                {session.images!.length > 1 && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={previousImage}
                      className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-white/50 hover:bg-white/80 text-gray-900 rounded-full"
                    >
                      <ChevronLeft className="w-6 h-6" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={nextImage}
                      className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-white/50 hover:bg-white/80 text-gray-900 rounded-full"
                    >
                      <ChevronRight className="w-6 h-6" />
                    </Button>
                    <div className="absolute bottom-4 right-4 bg-black/60 text-white px-3 py-1 rounded-full text-xs">
                      {currentImageIndex + 1} / {session.images!.length}
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gray-200 text-gray-400">
                <Clock className="w-16 h-16" />
              </div>
            )}
          </div>
        </div>

        {/* Content Card */}
        <div className="relative -mt-6 rounded-t-3xl bg-white px-6 py-8 shadow-sm">

          {/* Row 1: Book Session Badge */}
          <div className="flex items-center mb-3">
            <Badge variant="secondary" className="bg-green-100 text-green-800">
              Book Session
            </Badge>
          </div>

          {/* Row 2: Online/Offline Badge + Session Duration */}
          <div className="flex items-center justify-between mb-4">
            <div>
              {(session as any).isOnline && (session as any).isOffline ? (
                <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                  <Globe className="w-3 h-3 mr-1" />
                  Hybrid Session
                </Badge>
              ) : (session as any).isOnline ? (
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                  <Globe className="w-3 h-3 mr-1" />
                  Online Session
                </Badge>
              ) : (session as any).isOffline ? (
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                  <MapPin className="w-3 h-3 mr-1" />
                  In-Person Session
                </Badge>
              ) : null}
            </div>
            <span className="text-sm text-gray-500">
              {session.duration} min
            </span>
          </div>

          {/* Title */}
          <h1 className="text-3xl font-bold text-gray-900 mb-3">
            {session.title}
          </h1>

          {/* Thumbnail Description */}
          {session.thumbnailDescription && (
            <p className="text-lg text-gray-600 mb-6 leading-snug">
              {session.thumbnailDescription}
            </p>
          )}

          {/* Coach Profile */}
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

          {/* Full Description */}
          {session.description && (
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">About this session</h3>
              <div className="prose prose-gray max-w-none text-gray-600">
                <p className="whitespace-pre-wrap leading-relaxed">{linkifyText(session.description)}</p>
              </div>
            </div>
          )}

          {/* Key Details - Restyled to match Events Detail Page */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Details</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-[#b66667]" />
                  <div>
                    <p className="font-medium text-gray-900">Duration</p>
                    <p className="text-gray-600">{session.duration} min</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <DollarSign className="w-5 h-5 text-[#b66667]" />
                  <div>
                    <p className="font-medium text-gray-900">Price</p>
                    <p className={`${(session as any).isFree ? "text-sm text-gray-600" : "text-gray-600"}`}>
                      {(session as any).isFree ? "Free" : formatPrice(session.price, (session as any).currency || "USD")}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {(session as any).isOnline && (
                  <div className="flex items-center gap-3">
                    <Globe className="w-5 h-5 text-[#b66667]" />
                    <div>
                      <p className="font-medium text-gray-900">Online Session</p>
                    </div>
                  </div>
                )}

                {(session as any).isOffline && (
                  <div className="flex items-start gap-3 min-w-0">
                    <MapPin className="w-5 h-5 text-[#b66667] flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <span className="font-medium text-gray-900 block">In-Person Session</span>
                      {/* Always show city, state, country for offline sessions */}
                      {(session as any).locationCity && (
                        <span className="text-sm text-gray-600 block mt-0.5">
                          {[(session as any).locationCity, (session as any).locationState, (session as any).locationCountry].filter(Boolean).join(", ")}
                        </span>
                      )}
                      {/* Show location name if enabled */}
                      {(session as any).showLocationName !== false && (session as any).locationName && (
                        <span className="text-sm text-gray-600 block mt-0.5">{(session as any).locationName}</span>
                      )}
                      {/* Show street address if enabled */}
                      {(session as any).showStreetAddress === true && (session as any).locationAddress && (
                        <span className="text-sm text-gray-600 block mt-0.5">{(session as any).locationAddress}</span>
                      )}
                      {/* Show map link if enabled */}
                      {(session as any).showMapLocation === true && (session as any).locationUrl ? (
                        <a
                          href={(session as any).locationUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm underline text-[#b66667] hover:text-[#b85858] block break-words mt-1"
                        >
                          View on Map
                        </a>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Client Testimonials Section */}
            {session.testimonials && (
              <div className="mt-8 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Client Testimonials</h3>
                <p className="text-gray-700 whitespace-pre-wrap" data-testid="text-session-testimonials">
                  {session.testimonials}
                </p>
              </div>
            )}
          </div>

          {/* Action Buttons - Added gap for spacing */}
          <div className="flex flex-col gap-6 mt-8">
            {/* Book Now Button: Click triggers modal */}
            <Button 
              size="lg" 
              onClick={openBookingDialog}
              className="w-full bg-[#b66667] text-white hover:bg-[#b85858] h-14 text-lg font-bold rounded-2xl shadow-md"
            >
              Book Now
            </Button>

            {/* View All Sessions Button */}
            <Link href={`/${username}#bookings`}>
              <Button 
                variant="outline"
                size="lg" 
                className="w-full border-[#b66667] text-[#b66667] hover:bg-red-50 h-12 font-semibold rounded-2xl"
              >
                View All Sessions
              </Button>
            </Link>
          </div>

          {/* Footer Area */}
          <div className="mt-12 pt-8 border-t border-gray-100 text-center">
            <Link href="/">
               <img src={riplekLogo1} alt="Riplect" className="h-8 mx-auto mb-4 block" data-testid="img-footer-logo" />
            </Link>

            <p className="text-gray-500 mb-6 text-sm">
              Join thousands of creators who are building their business with Riplect.
            </p>

            <Link href="/auth">
              <Button
                className="bg-gray-900 text-white hover:bg-gray-800 rounded-full px-8 font-medium"
              >
                <UserCircle className="w-4 h-4 mr-2" />
                Join Riplect
              </Button>
            </Link>

            <div className="mt-8 flex justify-center gap-6 text-xs text-gray-400">
              <a href="#" className="hover:text-gray-600">Terms of Service</a>
              <a href="#" className="hover:text-gray-600">Privacy Policy</a>
            </div>
          </div>
        </div>
      </main>

      {/* Booking Dialog - Ported from BookingSection */}
      <Dialog open={isBookingDialogOpen} onOpenChange={(open) => {
        setIsBookingDialogOpen(open);
        if (!open) setBookingSuccess(null);
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {bookingSuccess ? (
            <div className="flex flex-col items-center text-center py-6 space-y-5">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="w-9 h-9 text-green-600" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-gray-900" data-testid="text-booking-success-title">Booking Request Sent</h2>
                <p className="text-sm text-gray-500">Your request is awaiting confirmation from the coach.</p>
              </div>

              <div className="bg-gray-50 border rounded-lg p-4 w-full max-w-sm space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Session</span>
                  <span className="font-medium text-gray-900" data-testid="text-success-session">{bookingSuccess.sessionTitle}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Date</span>
                  <span className="font-medium text-gray-900" data-testid="text-success-date">{bookingSuccess.date}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Time</span>
                  <span className="font-medium text-gray-900" data-testid="text-success-time">{bookingSuccess.time}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-gray-500">Confirmation Code</span>
                  <span className="font-mono font-semibold text-primary" data-testid="text-success-confirmation-code">{bookingSuccess.confirmationCode}</span>
                </div>
              </div>

              <p className="text-xs text-gray-500 max-w-sm">
                A booking request has been sent to your email. Please await confirmation of your booking and payment instructions from the coach.
              </p>
              <p className="text-xs text-gray-500 max-w-sm">
                You can view your booking details and manage your sessions in the guest portal.
              </p>

              <div className="flex gap-3 w-full max-w-sm">
                {bookingSuccess.guestAccessToken ? (
                  <a
                    href={`/guest/${bookingSuccess.guestAccessToken}?booking=${bookingSuccess.bookingId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1"
                  >
                    <Button
                      variant="outline"
                      className="w-full gap-2"
                      data-testid="button-manage-booking"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Manage Your Booking
                    </Button>
                  </a>
                ) : (
                  <p className="flex-1 text-xs text-gray-500 text-center self-center" data-testid="text-portal-fallback">
                    Check your email for a link to manage your booking.
                  </p>
                )}
                <Button
                  className="flex-1 bg-primary text-white"
                  onClick={() => {
                    setIsBookingDialogOpen(false);
                    setBookingSuccess(null);
                  }}
                  data-testid="button-success-close"
                >
                  Close
                </Button>
              </div>
            </div>
          ) : (
          <>
          <DialogHeader>
            <DialogTitle className="text-xl">
              Book Your {session.title} Session
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleBookingSubmit} className="space-y-6">
            {/* Session Summary */}
            <div className="p-4 rounded-lg border border-blue-200 bg-[#eeeeee]">
              <h3 className="font-semibold text-gray-900 mb-2">{session.title}</h3>
              <div className="flex justify-between items-center text-sm text-gray-600">
                <span>{session.duration} minutes</span>
                <span className={`font-semibold text-primary ${(session as any).isFree ? "text-xs" : ""}`}>
                  {(session as any).isFree ? "Free" : formatPrice(session.price, (session as any).currency || "USD")}
                </span>
              </div>
            </div>

            {/* Session Mode Selection */}
            <div>
              <Label className="text-base font-medium mb-2 block">Session Mode</Label>
              {session.isOnline && session.isOffline ? (
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedMode("online")}
                    className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-medium transition-colors ${
                      selectedMode === "online"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-gray-300 bg-white hover:bg-gray-50"
                    }`}
                  >
                    Online Session
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedMode("offline")}
                    className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-medium transition-colors ${
                      selectedMode === "offline"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-gray-300 bg-white hover:bg-gray-50"
                    }`}
                  >
                    Offline Session
                  </button>
                </div>
              ) : session.isOffline && !session.isOnline ? (
                <div className="bg-gray-100 p-3 rounded-lg border border-gray-300">
                  <p className="text-sm text-gray-700 font-medium">Offline Session</p>
                  <div className="mt-1 space-y-0.5">
                    {/* Show location name if enabled */}
                    {(session as any).showLocationName !== false && (session as any).locationName && (
                      <p className="text-xs text-gray-600">{(session as any).locationName}</p>
                    )}
                    {/* Show street address if enabled */}
                    {(session as any).showStreetAddress === true && (session as any).locationAddress && (
                      <p className="text-xs text-gray-600">{(session as any).locationAddress}</p>
                    )}
                    {/* Always show city, state, country for offline sessions */}
                    {((session as any).locationCity || (session as any).locationState || (session as any).locationCountry) && (
                      <p className="text-xs text-gray-600">
                        {[(session as any).locationCity, (session as any).locationState, (session as any).locationCountry].filter(Boolean).join(", ")}
                      </p>
                    )}
                    {/* Show map link only if enabled */}
                    {(session as any).showMapLocation === true && session.locationUrl && (
                      <p className="text-xs mt-1">
                        <a href={session.locationUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">View on Map</a>
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-gray-100 p-3 rounded-lg border border-gray-300">
                  <p className="text-sm text-gray-700 font-medium">Online Session</p>
                </div>
              )}
            </div>

            {/* Date Selection */}
            <div>
              <Label className="text-base font-medium">Select Date</Label>
              <div className="mt-2">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => { setSelectedDate(date); setSelectedTime(""); }}
                  disabled={isDateDisabled}
                  className="rounded-md border"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Only dates marked as available by the coach can be selected.
              </p>
            </div>

            {!hasAvailabilityConfigured && (
              <div className="p-4 rounded-lg border border-amber-200 bg-amber-50" data-testid="text-no-availability">
                <p className="text-sm text-amber-800 font-medium">No availability set</p>
                <p className="text-xs text-amber-600 mt-1">The coach has not configured their availability yet. Booking is currently unavailable.</p>
              </div>
            )}

            {selectedDate && hasAvailabilityConfigured && (
              <div>
                <Label className="text-base font-medium">Select Time</Label>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-2">
                  <Globe className="w-3.5 h-3.5" />
                  {isDifferentTimezone ? (
                    <span>Times shown in {formatTimezoneShort(visitorTimezone)}</span>
                  ) : (
                    <span>Timezone: {formatTimezoneShort(profileTimezone)}</span>
                  )}
                </div>
                {isSlotsFetching ? (
                  <div className="grid grid-cols-3 gap-2 mt-2" data-testid="skeleton-time-slots">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <div key={i} className="h-9 rounded-lg bg-gray-100 animate-pulse" />
                    ))}
                  </div>
                ) : availableSlots.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {availableSlots.map((slot) => (
                      <button
                        key={slot.coachTime24}
                        type="button"
                        onClick={() => setSelectedTime(slot.coachTime24)}
                        data-testid={`button-time-slot-${slot.coachTime24}`}
                        className={`py-2 px-3 rounded-lg text-sm border transition-colors ${
                          selectedTime === slot.coachTime24
                            ? "bg-primary text-white border-primary"
                            : "bg-gray-50 border-gray-300 hover:bg-gray-100"
                        }`}
                      >
                        {slot.displayTime}
                        {slot.dateChanged && <span className="text-[10px] ml-0.5 opacity-70">+1d</span>}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 mt-2" data-testid="text-no-slots-for-day">No available time slots for this day.</p>
                )}
              </div>
            )}

            {/* Contact Information */}
            {selectedTime && (
              <div className="space-y-4">
                <h3 className="font-medium text-gray-900">Your Information</h3>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">Full Name *</Label>
                    <div className="relative mt-1">
                      <Input
                        id="name"
                        type="text"
                        value={bookingData.name}
                        onChange={(e) => setBookingData({ ...bookingData, name: e.target.value })}
                        placeholder="Your full name"
                        className="pl-10"
                        required
                      />
                      <User className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="email">Email Address *</Label>
                    <div className="relative mt-1">
                      <Input
                        id="email"
                        type="email"
                        value={bookingData.email}
                        onChange={(e) => setBookingData({ ...bookingData, email: e.target.value })}
                        placeholder="your.email@example.com"
                        className="pl-10"
                        required
                      />
                      <Mail className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                    </div>
                  </div>
                </div>

                <div>
                  <Label htmlFor="phone">Phone Number (Optional)</Label>
                  <div className="relative mt-1">
                    <Input
                      id="phone"
                      type="tel"
                      value={bookingData.phone}
                      onChange={(e) => setBookingData({ ...bookingData, phone: e.target.value })}
                      placeholder="+1 (555) 123-4567"
                      className="pl-10"
                    />
                    <Phone className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                  </div>
                </div>

                

                {/* Custom Question Field */}
                {session.customQuestion && (
                  <div>
                    <Label htmlFor="custom-question">{session.customQuestion}</Label>
                    <Textarea
                      id="custom-question"
                      data-testid="input-custom-question-answer"
                      value={bookingData.customQuestionAnswer}
                      onChange={(e) => setBookingData({ ...bookingData, customQuestionAnswer: e.target.value })}
                      placeholder="Your answer..."
                      rows={3}
                      className="mt-1"
                    />
                  </div>
                )}

                <div>
                  <Label htmlFor="message">Message (Optional)</Label>
                  <Textarea
                    id="message"
                    value={bookingData.message}
                    onChange={(e) => setBookingData({ ...bookingData, message: e.target.value })}
                    placeholder="Tell us about your goals or any specific topics you'd like to discuss..."
                    rows={3}
                    className="mt-1"
                  />
                </div>

                {/* Booking Summary */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-2">Booking Summary</h4>
                  <div className="space-y-1 text-sm text-gray-600">
                    <div className="flex justify-between">
                      <span>Session:</span>
                      <span>{session.title}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Date:</span>
                      <span>{selectedDate?.toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Time:</span>
                      <span>{selectedTime}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Duration:</span>
                      <span>{session.duration} minutes</span>
                    </div>
                    <div className="flex justify-between font-semibold text-gray-900 pt-2 border-t">
                      <span>Total:</span>
                      <span className={`${(session as any).isFree ? "text-sm" : ""}`}>
                        {(session as any).isFree ? "Free" : formatPrice(session.price, (session as any).currency || "USD")}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Submit Button */}
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsBookingDialogOpen(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 bg-primary text-white hover:bg-blue-600"
                  >
                    {isSubmitting ? "Booking..." : "Confirm Booking"}
                  </Button>
                </div>

                <p className="text-xs text-gray-500 text-center">
                  You will receive a confirmation email with session details and payment instructions.
                </p>
              </div>
            )}
          </form>
          </>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}