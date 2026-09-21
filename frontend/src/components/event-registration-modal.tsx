import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { posthog } from "@/lib/posthog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  CheckCircle,
  X,
  AlertCircle,
  Download,
  ExternalLink,
} from "lucide-react";
import type { Event, EventWithExtras } from "@shared/schema";
import { format } from "date-fns";
import { formatPrice } from "@shared/currencies";

const registrationSchema = z.object({
  attendeeName: z.string().min(2, "Name must be at least 2 characters"),
  attendeeEmail: z.string().email("Please enter a valid email address"),
  attendeePhone: z.string().optional(),
  specialRequests: z.string().optional(),
});

type RegistrationData = z.infer<typeof registrationSchema>;

interface EventRegistrationModalProps {
  event: Event;
  creatorName: string;
  isOpen: boolean;
  onClose: () => void;
  instanceId?: number | null;
  instanceDate?: string | null;
  /** Full selected instance — used to generate accurate calendar artifacts */
  instance?: EventWithExtras | null;
}

function fmtIcsDt(dt: string | null | undefined): string {
  if (!dt) return "";
  const d = new Date(dt);
  const pad = (n: number) => String(n).padStart(2, "0");
  const base = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  if (d.getHours() === 0 && d.getMinutes() === 0) return base;
  return `${base}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
}

function getEventIcsDates(event: Event): { dtStart: string; dtEnd: string } {
  const startAt = event.startAt as unknown as string | null | undefined;
  const endAt = event.endAt as unknown as string | null | undefined;
  const dtStart = fmtIcsDt(startAt) || new Date().toISOString().split('T')[0].replace(/-/g, '');
  let dtEnd: string;
  if (endAt) {
    dtEnd = fmtIcsDt(endAt) || dtStart;
  } else if (startAt) {
    const sd = new Date(startAt);
    const ed = new Date(sd.getTime() + 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    dtEnd = `${ed.getFullYear()}${pad(ed.getMonth() + 1)}${pad(ed.getDate())}T${pad(ed.getHours())}${pad(ed.getMinutes())}00`;
  } else {
    dtEnd = dtStart;
  }
  return { dtStart, dtEnd };
}

function getEventMode(event: Event): { isOnline: boolean; isOffline: boolean } {
  const mode = event.mode as string | undefined;
  return {
    isOnline: mode === 'online' || mode === 'hybrid',
    isOffline: mode === 'offline' || mode === 'hybrid',
  };
}

function buildGoogleCalendarUrl(event: Event, confirmationCode: string): string {
  const { dtStart, dtEnd } = getEventIcsDates(event);
  const { isOnline } = getEventMode(event);

  const location = isOnline && event.meetingLink
    ? event.meetingLink
    : event.location || "";

  const description = [
    `Confirmation Code: ${confirmationCode}`,
    isOnline && !event.meetingLink ? "Meeting link will be sent before the event." : "",
  ].filter(Boolean).join("\n");

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${dtStart}/${dtEnd}`,
    details: description,
    location,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "");
}

function generateIcsContent(event: Event, confirmationCode: string): string {
  const { dtStart, dtEnd } = getEventIcsDates(event);
  const { isOnline } = getEventMode(event);

  const location = isOnline && event.meetingLink
    ? event.meetingLink
    : event.location || "";

  const descriptionParts = [
    `Confirmation Code: ${confirmationCode}`,
    isOnline && !event.meetingLink ? "Meeting link will be sent before the event." : "",
  ].filter(Boolean);

  const now = new Date();
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const nowBase = `${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}`;
  const dtstamp = `${nowBase}T${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}Z`;

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Riplect//Event Registration//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${confirmationCode}@riplek.com`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    location ? `LOCATION:${escapeIcsText(location)}` : "",
    descriptionParts.length > 0 ? `DESCRIPTION:${escapeIcsText(descriptionParts.join("\n"))}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
}

function downloadIcs(event: Event, confirmationCode: string) {
  const content = generateIcsContent(event, confirmationCode);
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${event.title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function EventRegistrationModal({
  event,
  creatorName,
  isOpen,
  onClose,
  instanceId,
  instanceDate,
  instance,
}: EventRegistrationModalProps) {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<"details" | "success">("details");
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => crypto.randomUUID());
  // Build an effective event for calendar artifacts that uses the selected instance's timing
  // and any per-instance overrides (title, location, meetingLink)
  const effectiveEvent: Event = instance
    ? {
        ...event,
        startAt: instance.startAt ?? event.startAt,
        endAt: instance.endAt ?? event.endAt,
        title: instance.title ?? event.title,
        location: instance.location ?? event.location,
        meetingLink: instance.meetingLink ?? event.meetingLink,
      }
    : event;
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmedEmail, setConfirmedEmail] = useState("");
  const [confirmationCode, setConfirmationCode] = useState("");
  const [guestAccessToken, setGuestAccessToken] = useState<string | null>(null);
  const [registrationId, setRegistrationId] = useState<number | null>(null);

  const requiresPayment = !!event.requiresPayment;
  const paymentInstructions = event.paymentInstructions;

  const form = useForm<RegistrationData>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      attendeeName: "",
      attendeeEmail: "",
      attendeePhone: "",
      specialRequests: "",
    },
  });

  const onSubmit = async (data: RegistrationData) => {
    // Determine if this is a paid event using the same heuristic as the server.
    // For paid events, we navigate to /complete-payment WITHOUT creating a
    // registration yet — the registration is created atomically when the guest
    // submits their payment.
    const pricingTypeRaw = ((event.pricingType as string) || '').toLowerCase().trim();
    const isExplicitlyFreeOrDonation = pricingTypeRaw === 'free' || pricingTypeRaw === 'donation';
    const priceNum = parseFloat((event.price as unknown as string) || '0');
    const isPaidEvent = !isExplicitlyFreeOrDonation && priceNum > 0;

    if (isPaidEvent) {
      const pendingData = {
        registrationData: {
          attendeeName: data.attendeeName,
          attendeeEmail: data.attendeeEmail,
          attendeePhone: data.attendeePhone || '',
          specialRequests: data.specialRequests || '',
          eventId: event.id,
          instanceId: instanceId ?? null,
        },
        eventData: {
          id: event.id,
          title: effectiveEvent.title as string,
          startAt: (effectiveEvent.startAt as unknown as string) || null,
          endAt: (effectiveEvent.endAt as unknown as string) || null,
          location: effectiveEvent.location || null,
          price: event.price as unknown as string,
          currency: event.currency || 'USD',
          pricingType: (event.pricingType as string) || null,
          paymentInstructions: (event.paymentInstructions as string) || null,
          returnPath: window.location.pathname + window.location.search,
        },
      };
      posthog.capture('event_registration_started_paid', {
        event_id: event.id,
        event_title: event.title,
      });
      // Use wouter navigation state so the data lives only in the current history
      // entry and is not accessible after a fresh /complete-payment visit.
      navigate('/complete-payment', { state: pendingData });
      onClose();
      return;
    }

    // Free / donation: create registration immediately
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const res = await apiRequest("POST", `/api/events/${event.id}/register`, {
        attendeeName: data.attendeeName,
        attendeeEmail: data.attendeeEmail,
        attendeePhone: data.attendeePhone || "",
        specialRequests: data.specialRequests || "",
        idempotencyKey,
        ...(instanceId ? { instanceId } : {}),
      });
      const result = await res.json();
      posthog.capture('event_registered', {
        event_id: event.id,
        event_title: event.title,
      });
      setConfirmedEmail(data.attendeeEmail);
      setConfirmationCode(result?.registration?.confirmationCode || "");
      const token = result?.guestAccessToken || null;
      const regId = result?.registration?.id || null;
      setGuestAccessToken(token);
      setRegistrationId(regId);
      setStep("success");
    } catch (error: any) {
      const msg = error?.message || "Registration failed. Please try again.";
      setErrorMessage(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    setStep("details");
    setErrorMessage(null);
    setConfirmationCode("");
    setGuestAccessToken(null);
    setRegistrationId(null);
    setIdempotencyKey(crypto.randomUUID());
    form.reset();
    onClose();
  };

  // Use effectiveEvent (instance-merged) for all display fields so per-instance
  // overrides (time, location, title) are shown correctly in the modal header.
  const evStartAt = (effectiveEvent.startAt as unknown as string | null | undefined) || instanceDate;
  const evEndAt = effectiveEvent.endAt as unknown as string | null | undefined;
  const eventDate = evStartAt ? new Date(evStartAt) : new Date();
  const evPricingType = event.pricingType as string | undefined;

  const evStartTimeStr = (() => {
    if (!evStartAt) return null;
    const d = new Date(evStartAt);
    if (d.getHours() === 0 && d.getMinutes() === 0) return null;
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  })();
  const evEndTimeStr = (() => {
    if (!evEndAt) return null;
    const d = new Date(evEndAt);
    if (d.getHours() === 0 && d.getMinutes() === 0) return null;
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  })();

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl">
                {step === "details" ? "Register for Event" : "Registration Confirmed!"}
              </DialogTitle>
              <DialogDescription>
                {step === "details"
                  ? "Please provide your details to register for this event"
                  : "You're all set! Check your email for confirmation details"}
              </DialogDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        {/* Event Summary */}
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 mb-2">{effectiveEvent.title}</h3>
                <div className="space-y-1 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span>{format(eventDate, "EEEE, MMMM d, yyyy")}</span>
                  </div>
                  {evStartTimeStr && (
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      <span>{evStartTimeStr}{evEndTimeStr ? ` - ${evEndTimeStr}` : ''}</span>
                    </div>
                  )}
                  {effectiveEvent.location && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      <span>{effectiveEvent.location}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Hosted by {creatorName}</span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-primary">
                  {evPricingType === 'free' ? "Free" : evPricingType === 'donation' ? "Donation" : formatPrice(event.price, event.currency || "USD")}
                </div>
                {event.maxAttendees && (
                  <div className="text-xs text-gray-500 flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    Max {event.maxAttendees} attendees
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Error message */}
        {errorMessage && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-red-700 text-sm">{errorMessage}</p>
          </div>
        )}

        {/* Registration Form */}
        {step === "details" && (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="attendeeName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Your full name"
                          data-testid="input-attendee-name"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="attendeeEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="your.email@example.com"
                          type="email"
                          data-testid="input-attendee-email"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="attendeePhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="+1 (555) 123-4567"
                        type="tel"
                        data-testid="input-attendee-phone"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="specialRequests"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes or Special Requests (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Any accessibility needs, questions, or special requests..."
                        className="min-h-[80px]"
                        data-testid="input-special-requests"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-between pt-4">
                <Button type="button" variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isProcessing}
                  data-testid="button-register"
                >
                  {isProcessing ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                      Registering...
                    </div>
                  ) : (
                    "Proceed"
                  )}
                </Button>
              </div>
            </form>
          </Form>
        )}

        {/* Success Step */}
        {step === "success" && (
          <div className="text-center space-y-5">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>

            <div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Registration Confirmed!
              </h3>
              <p className="text-gray-600">
                You're all set for <strong>{event.title}</strong>
              </p>
            </div>

            <Card className="bg-green-50 border-green-200">
              <CardContent className="p-4 text-left">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Event Date:</span>
                    <span className="font-medium">{format(eventDate, "MMMM d, yyyy")}</span>
                  </div>
                  {evStartTimeStr && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Time:</span>
                      <span className="font-medium">{evStartTimeStr}{evEndTimeStr ? ` – ${evEndTimeStr}` : ''}</span>
                    </div>
                  )}
                  {confirmationCode && (
                    <div className="flex justify-between items-center pt-1 border-t border-green-200 mt-1">
                      <span className="text-gray-600">Confirmation Code:</span>
                      <span
                        className="font-mono font-bold text-[#C96868] tracking-widest"
                        data-testid="text-confirmation-code"
                      >
                        {confirmationCode}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Add to Calendar */}
            <div className="flex gap-3">
              <a
                href={confirmationCode ? buildGoogleCalendarUrl(effectiveEvent, confirmationCode) : "#"}
                target={confirmationCode ? "_blank" : undefined}
                rel="noopener noreferrer"
                className="flex-1"
                data-testid="link-add-to-google-calendar"
                aria-disabled={!confirmationCode}
                onClick={!confirmationCode ? (e) => e.preventDefault() : undefined}
              >
                <Button variant="outline" className="w-full gap-2" disabled={!confirmationCode}>
                  <ExternalLink className="w-4 h-4" />
                  Google Calendar
                </Button>
              </a>
              <Button
                variant="outline"
                className="flex-1 gap-2"
                onClick={() => downloadIcs(effectiveEvent, confirmationCode)}
                disabled={!confirmationCode}
                data-testid="button-download-ics"
              >
                <Download className="w-4 h-4" />
                Download .ics
              </Button>
            </div>

            {/*
              The amber "Payment Required" banner used to live here, gated on
              `event.requiresPayment`. That made it possible to show a
              payment-required prompt on the success step in the exact case
              where the server had already decided not to send the guest to
              the payment screen (e.g. no enabled payment methods). The flow
              is now: if the server requires payment, we redirect to
              /complete-payment before this step ever renders. If we did
              reach this step, the email + Manage Registration link below
              are sufficient.
            */}

            {guestAccessToken && registrationId ? (
              <a
                href={`/guest/${guestAccessToken}?registration=${registrationId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full"
              >
                <Button
                  variant="outline"
                  className="w-full gap-2 border-[#C96868] text-[#C96868] hover:bg-red-50"
                  data-testid="button-manage-registration"
                >
                  <ExternalLink className="w-4 h-4" />
                  Manage Registration
                </Button>
              </a>
            ) : (
              <p className="text-xs text-center text-gray-500" data-testid="text-registration-portal-fallback">
                Check your email for a link to manage your registration.
              </p>
            )}

            <div className="space-y-2 text-sm text-gray-600">
              <p>
                A confirmation email has been sent to <strong>{confirmedEmail}</strong>
              </p>
              <p>
                Questions? Contact {creatorName} directly through their profile.
              </p>
            </div>

            <Button
              onClick={handleClose}
              className="w-full"
              data-testid="button-close-success"
            >
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
