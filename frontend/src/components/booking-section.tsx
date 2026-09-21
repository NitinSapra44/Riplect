// Riplect_v1-Deep_design-3/client/src/components/booking-section.tsx
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { BookingSession } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CalendarIcon, Clock, User, Mail, Phone, Info, Globe } from "lucide-react";
import { Link, useLocation } from "wouter";
import { formatPrice } from "@shared/currencies";
import { getBrowserTimezone, formatTimezoneShort, formatTime24to12, convertTimeBetweenTimezones, formatTime12to24 } from "@/lib/timezone-utils";

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

interface BookingSectionProps {
  sessions: BookingSession[];
  profileId: string;
  username: string;
  displayName?: string;
}

interface BookingFormData {
  name: string;
  email: string;
  phone: string;
  message: string;
  customQuestionAnswer: string;
}

export function BookingSection({ sessions, profileId, username, displayName }: BookingSectionProps) {
  const [selectedSession, setSelectedSession] = useState<BookingSession | null>(null);
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
  const [bookingIdempotencyKey, setBookingIdempotencyKey] = useState<string>(() => crypto.randomUUID());
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  // Fetch availability and blocked dates for this profile
  const { data: availabilityData } = useQuery<{ availability: MentorAvailability[], blockedDates: BlockedDate[], timezone?: string }>({
    queryKey: ['/api/profiles', username, 'availability'],
    queryFn: async () => {
      const response = await fetch(`/api/profiles/${username}/availability`);
      if (!response.ok) {
        throw new Error('Failed to fetch availability');
      }
      return response.json();
    }
  });

  const availability = availabilityData?.availability || [];
  const blockedDates = availabilityData?.blockedDates || [];
  const profileTimezone = availabilityData?.timezone || "Asia/Kolkata";

  // Derive date string for booked-slots query
  const selectedDateStr = selectedDate
    ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`
    : null;

  // Fetch already-booked time slots for the selected session + date
  const { data: bookedSlotsData, isFetching: isSlotsFetching } = useQuery<{ bookingDate: string; bookingTime: string }[]>({
    queryKey: ['/api/sessions', selectedSession?.id, 'booked-slots', selectedDateStr],
    queryFn: async () => {
      const response = await fetch(`/api/sessions/${selectedSession!.id}/booked-slots?date=${selectedDateStr}`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!selectedSession && !!selectedDateStr,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: true,
  });

  const visitorTimezone = getBrowserTimezone();
  const isDifferentTimezone = profileTimezone !== visitorTimezone;

  const timeSlots = useMemo(() => {
    if (!selectedDate || availability.length === 0) {
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
  }, [selectedDate, availability, profileTimezone, visitorTimezone, isDifferentTimezone]);

  // Extract just the times (already 24h normalised by backend) for quick Set lookup
  const bookedTimes = new Set(
    (bookedSlotsData || [])
      .filter(s => s.bookingDate === selectedDateStr)
      .map(s => s.bookingTime)
  );

  const availableSlots = useMemo(
    () => timeSlots.filter(slot => !bookedTimes.has(slot.coachTime24)),
    [timeSlots, bookedSlotsData, selectedDateStr] // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (sessions.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-600 mb-4">No booking sessions are currently available.</p>
        <p className="text-sm text-gray-500">Check back later for new availability.</p>
      </div>
    );
  }

  const handleSessionSelect = (session: BookingSession) => {
    // Invalidate all cached booked-slots for this session so re-opens always fetch fresh data
    queryClient.invalidateQueries({
      queryKey: ['/api/sessions', session.id, 'booked-slots'],
    });
    setSelectedSession(session);
    setSelectedDate(undefined);
    setSelectedTime("");
    setBookingIdempotencyKey(crypto.randomUUID());
    // Set default mode based on session availability
    if (session.isOnline && !session.isOffline) {
      setSelectedMode("online");
    } else if (session.isOffline && !session.isOnline) {
      setSelectedMode("offline");
    } else {
      setSelectedMode("online"); // Default to online if both available
    }
    setIsBookingDialogOpen(true);
  };

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedSession || !selectedDate || !selectedTime) {
      toast({
        title: "Missing Information",
        description: "Please select a date and time for your session.",
        variant: "destructive",
      });
      return;
    }

    if (!bookingData.name || !bookingData.email) {
      toast({
        title: "Missing Information",
        description: "Please fill in your name and email.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const coachTime12h = formatTime24to12(selectedTime);
      const bookingRequest = {
        sessionId: selectedSession.id,
        profileId: profileId,
        clientName: bookingData.name,
        clientEmail: bookingData.email,
        clientPhone: bookingData.phone,
        message: bookingData.message,
        customQuestionAnswer: bookingData.customQuestionAnswer,
        bookingDate: selectedDateStr,
        bookingTime: coachTime12h,
        totalAmount: selectedSession.price,
        paymentStatus: "pending",
        idempotencyKey: bookingIdempotencyKey,
      };

      const response = await apiRequest("POST", "/api/bookings", bookingRequest);
      const result = await response.json();

      if (result.success) {
        const displaySlot = timeSlots.find(s => s.coachTime24 === selectedTime);
        const coachLabel = displayName || username;
        toast({
          title: "Booking Request Sent",
          description: `Your request for ${selectedSession.title} on ${selectedDate.toLocaleDateString()} at ${displaySlot?.displayTime || coachTime12h} has been submitted. You'll be notified once ${coachLabel} confirms your session. Confirmation code: ${result.confirmationCode}.`,
        });

        // Invalidate all booked-slots cache entries for this session (prefix key, no date segment)
        await queryClient.invalidateQueries({
          queryKey: ['/api/sessions', selectedSession.id, 'booked-slots'],
        });

        setBookingData({ name: "", email: "", phone: "", message: "", customQuestionAnswer: "" });
        setSelectedSession(null);
        setSelectedDate(undefined);
        setSelectedTime("");
        setBookingIdempotencyKey(crypto.randomUUID());
        setIsBookingDialogOpen(false);
      } else {
        throw new Error("Booking creation failed");
      }
    } catch (error) {
      toast({
        title: "Booking Failed",
        description: "There was an error completing your booking. Please contact support.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };


  const isDateDisabled = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Disable past dates
    if (date < today) {
      return true;
    }

    // Use local date components for calendar date to avoid UTC off-by-one in non-UTC timezones
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    // Slice the first 10 chars of the stored date string to get YYYY-MM-DD without any Date re-parsing
    const isBlocked = blockedDates.some(blocked => {
      const blockedDateStr = String(blocked.blockedDate).slice(0, 10);
      return blockedDateStr === dateStr;
    });

    if (isBlocked) {
      return true;
    }

    // If no availability is set at all, disable all dates
    if (availability.length === 0) {
      return true;
    }

    // Check if there's availability for this day of week
    const dayOfWeek = date.getDay();
    const hasAvailability = availability.some(a => a.dayOfWeek === dayOfWeek && a.isActive);
    if (!hasAvailability) {
      return true;
    }

    // Check if the day of the week is available for the selected session (legacy support)
    if (selectedSession && selectedSession.availableDays) {
      return !selectedSession.availableDays.includes(dayOfWeek);
    }

    return false;
  };

  // Get available days from mentor availability
  const availableDays = useMemo(() => {
    const days = new Set<number>();
    availability.forEach(avail => {
      if (avail.isActive) {
        days.add(avail.dayOfWeek);
      }
    });
    return days;
  }, [availability]);

  return (
    <div className="space-y-6">
      {/* Available Sessions */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-medium text-gray-900">Available Sessions</h4>
          <div className="flex gap-1.5" data-testid="day-availability-indicator">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
              <span
                key={index}
                className={`w-6 h-6 flex items-center justify-center text-xs font-medium rounded-full ${
                  availableDays.has(index)
                    ? 'bg-brand-red text-white'
                    : 'bg-gray-200 text-gray-400'
                }`}
                data-testid={`day-indicator-${index}`}
              >
                {day}
              </span>
            ))}
          </div>
        </div>
        <div className="grid gap-4">
          {sessions.map((session) => (
            <Card 
              key={session.id} 
              className="bg-white border-none shadow-md rounded-2xl overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => setLocation(`/${username}/session/${session.id}`)}
            >
              <CardContent className="p-0">
                {/* Session Image */}
                {session.images && session.images.length > 0 && (
                  <div className="w-full h-48 bg-muted">
                    <img
                      src={session.images[0].url}
                      alt={session.images[0].alt || session.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      decoding="async"
                      width={400}
                      height={192}
                      data-testid={`session-image-${session.id}`}
                    />
                  </div>
                )}

                <div className="p-4">
                  {/* Title Row (No duration here) */}
                  <div className="mb-2">
                    <h5 className="font-semibold text-gray-900 text-base pr-4">{session.title}</h5>
                  </div>

                  {/* Thumbnail Description */}
                  {session.thumbnailDescription && (
                    <p className="text-gray-600 text-base mb-3">{session.thumbnailDescription}</p>
                  )}

                  {/* Bottom Row: Duration (Left) and Price (Right) */}
                  <div className="flex justify-between items-center mb-2 mt-3">
                    <div className="flex items-center text-gray-500">
                      <Clock className="w-4 h-4 mr-1" />
                      <span className="text-sm">{session.duration} min</span>
                    </div>
                    <span className={`font-bold text-brand-red ${(session as any).isFree ? "text-sm" : "text-lg"}`}>
                      {(session as any).isFree ? "Free" : formatPrice(session.price, (session as any).currency || "USD")}
                    </span>
                  </div>

                  <div className="flex gap-2 mt-2">
                    <Link href={`/${username}/session/${session.id}`} className="flex-1">
                      <Button 
                        variant="outline"
                        className="w-full border-gray-300 hover:bg-gray-50 transition-colors font-medium rounded-xl"
                        data-testid={`button-view-details-${session.id}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Info className="w-4 h-4 mr-2" />
                        View Details
                      </Button>
                    </Link>
                    <Button 
                      onClick={(e) => { e.stopPropagation(); handleSessionSelect(session); }}
                      className="flex-1 bg-brand-red text-white hover:bg-brand-red/90 transition-colors font-medium rounded-xl"
                      data-testid={`button-book-${session.id}`}
                    >
                      <CalendarIcon className="w-4 h-4 mr-2" />
                      Book Now
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
      {/* Booking Dialog */}
      <Dialog open={isBookingDialogOpen} onOpenChange={setIsBookingDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">
              Book Your {selectedSession?.title} Session
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleBookingSubmit} className="space-y-6">
            {/* Session Summary */}
            {selectedSession && (
              <div className="p-4 rounded-lg border border-blue-200 bg-[#eeeeee]">
                <h3 className="font-semibold text-gray-900 mb-2">{selectedSession.title}</h3>
                <div className="flex justify-between items-center text-sm text-gray-600">
                  <span>{selectedSession.duration} minutes</span>
                  <span className="font-semibold text-primary">{formatPrice(selectedSession.price, (selectedSession as any).currency || "USD")}</span>
                </div>
              </div>
            )}

            {/* Session Mode Selection */}
            {selectedSession && (
              <div>
                <Label className="text-base font-medium mb-2 block">Session Mode</Label>
                {selectedSession.isOnline && selectedSession.isOffline ? (
                  // Both modes available - show selection
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedMode("online")}
                      data-testid="button-mode-online"
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
                      data-testid="button-mode-offline"
                      className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-medium transition-colors ${
                        selectedMode === "offline"
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-gray-300 bg-white hover:bg-gray-50"
                      }`}
                    >
                      Offline Session
                    </button>
                  </div>
                ) : selectedSession.isOffline && !selectedSession.isOnline ? (
                  // Only offline available
                  <div className="bg-gray-100 p-3 rounded-lg border border-gray-300">
                    <p className="text-sm text-gray-700 font-medium" data-testid="text-offline-only">
                      Offline Session
                    </p>
                    {selectedSession.locationUrl && (
                      <p className="text-xs text-gray-600 mt-1">
                        Location: <a href={selectedSession.locationUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{selectedSession.locationUrl}</a>
                      </p>
                    )}
                  </div>
                ) : (
                  // Only online available (default)
                  <div className="bg-gray-100 p-3 rounded-lg border border-gray-300">
                    <p className="text-sm text-gray-700 font-medium" data-testid="text-online-only">
                      Online Session
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Date Selection */}
            <div>
              <Label className="text-base font-medium">Select Date</Label>
              {availability.length === 0 && (
                <div className="mt-2 p-4 bg-amber-50 border border-amber-200 rounded-lg text-center" data-testid="banner-no-availability">
                  <p className="text-sm font-medium text-amber-800">No availability set</p>
                  <p className="text-xs text-amber-600 mt-1">This coach hasn't configured their booking availability yet. Please check back later or contact them directly.</p>
                </div>
              )}
              <div className="mt-2">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => { setSelectedDate(date); setSelectedTime(""); }}
                  disabled={isDateDisabled}
                  className="rounded-md border"
                />
              </div>
              {availability.length > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  Only dates marked as available by the coach can be selected.
                </p>
              )}
            </div>

            {/* Time Selection */}
            {selectedDate && (
              <div>
                <Label className="text-base font-medium">Select Time</Label>
                <div className="flex items-center gap-1.5 text-sm text-gray-600 mb-2" data-testid="text-timezone-info">
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

                {/* Custom Question from Coach */}
                {selectedSession?.customQuestion && (
                  <div>
                    <Label htmlFor="customQuestionAnswer">{selectedSession.customQuestion}</Label>
                    <Textarea
                      id="customQuestionAnswer"
                      value={bookingData.customQuestionAnswer}
                      onChange={(e) => setBookingData({ ...bookingData, customQuestionAnswer: e.target.value })}
                      placeholder="Your answer..."
                      rows={3}
                      className="mt-1"
                      data-testid="textarea-custom-answer"
                    />
                  </div>
                )}

                {/* Booking Summary */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-2">Booking Summary</h4>
                  <div className="space-y-1 text-sm text-gray-600">
                    <div className="flex justify-between">
                      <span>Session:</span>
                      <span>{selectedSession?.title}</span>
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
                      <span>{selectedSession?.duration} minutes</span>
                    </div>
                    <div className="flex justify-between font-semibold text-gray-900 pt-2 border-t">
                      <span>Total:</span>
                      <span>{formatPrice(selectedSession?.price || "0", (selectedSession as any)?.currency || "USD")}</span>
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
        </DialogContent>
      </Dialog>
    </div>
  );
}