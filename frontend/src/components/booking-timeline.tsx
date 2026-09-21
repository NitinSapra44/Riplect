import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  CalendarPlus, CheckCircle2, XCircle, Clock, RefreshCw,
  MessageSquare, Mail, Ban, CircleDot, CreditCard
} from "lucide-react";
import { formatTimezoneShort } from "@/lib/timezone-utils";
import { apiRequest } from "@/lib/queryClient";

interface BookingEvent {
  id: number;
  bookingId: number;
  eventType: string;
  actorType: string;
  message: string | null;
  metadata: Record<string, any> | null;
  createdAt: string;
}

const eventConfig: Record<string, { label: string; icon: any; color: string; bgColor: string }> = {
  booking_created: { label: "Booking Requested", icon: CalendarPlus, color: "text-[#C96868]", bgColor: "bg-[#C96868]/10" },
  payment_completed: { label: "Payment Completed", icon: CreditCard, color: "text-emerald-600", bgColor: "bg-emerald-50" },
  confirmed_by_coach: { label: "Confirmed by Coach", icon: CheckCircle2, color: "text-emerald-600", bgColor: "bg-emerald-50" },
  declined_by_coach: { label: "Declined by Coach", icon: Ban, color: "text-red-500", bgColor: "bg-red-50" },
  cancelled_by_coach: { label: "Cancelled by Coach", icon: XCircle, color: "text-red-500", bgColor: "bg-red-50" },
  cancelled_by_guest: { label: "Cancelled by Guest", icon: XCircle, color: "text-orange-500", bgColor: "bg-orange-50" },
  rescheduled_by_coach: { label: "Rescheduled by Coach", icon: RefreshCw, color: "text-amber-600", bgColor: "bg-amber-50" },
  rescheduled_by_guest: { label: "Rescheduled by Guest", icon: RefreshCw, color: "text-amber-600", bgColor: "bg-amber-50" },
  session_completed: { label: "Session Completed", icon: CheckCircle2, color: "text-emerald-700", bgColor: "bg-emerald-100" },
  message_sent: { label: "Message Sent", icon: MessageSquare, color: "text-[#C96868]", bgColor: "bg-[#C96868]/10" },
  email_sent: { label: "Email Notification Sent", icon: Mail, color: "text-gray-400", bgColor: "bg-gray-100" },
};

function TimelineItem({ event, isLast, coachTimezone }: { event: BookingEvent; isLast: boolean; coachTimezone?: string }) {
  const config = eventConfig[event.eventType] || {
    label: event.eventType.replace(/_/g, " "),
    icon: CircleDot,
    color: "text-gray-400",
    bgColor: "bg-gray-100",
  };
  const Icon = config.icon;

  return (
    <div className="flex gap-3 relative" data-testid={`timeline-event-${event.id}`}>
      <div className="flex flex-col items-center">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${config.bgColor} ${config.color}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        {!isLast && <div className="w-px flex-1 bg-[#b66667]/15 min-h-[16px]" />}
      </div>
      <div className="pb-4 flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">{config.label}</p>
        {event.message && event.eventType !== 'email_sent' && (
          <p className="text-xs text-gray-500 mt-0.5 break-words">{event.message}</p>
        )}
        {event.metadata?.newDate && (
          <p className="text-xs text-gray-500 mt-0.5">
            New time: {format(new Date(event.metadata.newDate), "MMM dd, yyyy")} at {event.metadata.newTime}
            {coachTimezone && <span className="text-gray-400"> ({formatTimezoneShort(coachTimezone)})</span>}
          </p>
        )}
        <p className="text-xs text-gray-400 mt-1">
          {format(new Date(event.createdAt), "MMM dd, yyyy 'at' h:mm a")}
        </p>
      </div>
    </div>
  );
}

interface BookingTimelineProps {
  bookingId: number;
  apiPrefix?: string;
  coachTimezone?: string;
}

export function BookingTimeline({ bookingId, apiPrefix = "/api/dashboard", coachTimezone }: BookingTimelineProps) {
  const { data: events = [], isLoading } = useQuery<BookingEvent[]>({
    queryKey: [apiPrefix, "bookings", bookingId, "events"],
    queryFn: async () => {
      const res = await apiRequest("GET", `${apiPrefix}/bookings/${bookingId}/events`);
      return res.json();
    },
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false,
  });

  if (isLoading) {
    return (
      <div className="space-y-3 py-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-[#C96868]/10 animate-pulse flex-shrink-0" />
            <div className="space-y-1.5 flex-1">
              <div className="h-3 w-28 bg-gray-100 animate-pulse rounded" />
              <div className="h-2 w-40 bg-gray-100 animate-pulse rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="py-4 text-center">
        <Clock className="w-6 h-6 mx-auto text-[#C96868]/30 mb-2" />
        <p className="text-xs text-gray-400">No timeline events yet</p>
      </div>
    );
  }

  return (
    <div className="py-2" data-testid="booking-timeline">
      {events.map((event, index) => (
        <TimelineItem key={event.id} event={event} isLast={index === events.length - 1} coachTimezone={coachTimezone} />
      ))}
    </div>
  );
}
