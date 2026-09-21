import { useState, useMemo, useRef, useEffect, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Calendar, Clock, AlertTriangle, CheckCircle2, XCircle,
  Ban, ChevronRight, CalendarDays, ShoppingBag, Package,
  CreditCard, RefreshCw, MapPin, Video, Upload
} from "lucide-react";
import { format, isAfter, isBefore, startOfDay, formatDistanceToNow } from "date-fns";
import { EventRegistrationsPanel, useUpcomingEventsCount, useEventGroupsData, computeNeedsActionReasons, type EventGroup } from "@/components/event-registrations-panel";
import { ProductPurchasesPanel, useProductPurchasesData, type ProductPurchase } from "@/components/product-purchases-panel";
import { formatPrice } from "@shared/currencies";

export interface BookingWithSession {
  id: number;
  sessionId: number;
  profileId: string;
  guestProfileId: number | null;
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  message?: string;
  customQuestionAnswer?: string;
  bookingDate: string;
  bookingTime: string;
  status: string;
  paymentStatus: string;
  paymentId?: string;
  totalAmount: string;
  confirmationCode: string;
  coachMessage?: string;
  meetingLink?: string;
  sessionMode?: string;
  cancelledBy?: string;
  cancellationReason?: string;
  cancelledAt?: string;
  rescheduledFrom?: string;
  rescheduledBy?: string;
  coachTimezone?: string;
  paymentMethodSelected?: string;
  paymentMethodsOffered?: any[];
  paymentInstruction?: string;
  paymentMarkedAt?: string;
  paymentConfirmedAt?: string;
  paymentProofUrl?: string;
  paymentReferenceText?: string;
  createdAt: string;
  updatedAt: string;
  session: {
    id: number;
    title: string;
    description?: string;
    duration: number;
    price: string;
    currency?: string;
  };
}

export function isNeedsAction(b: BookingWithSession): boolean {
  if (b.paymentStatus === "proof_uploaded") return true;
  if (b.status === "pending") return true;
  if (b.status === "confirmed" && b.rescheduledBy === "client") return true;
  return false;
}

function formatTime12h(time: string): string {
  if (!time) return time;
  const [hourStr, minStr = "00"] = time.split(":");
  const hour = parseInt(hourStr, 10);
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${hour12}:${minStr} ${period}`;
}

function isUpcomingBooking(b: BookingWithSession, now: Date): boolean {
  const bookingDate = new Date(b.bookingDate);
  if (!isAfter(bookingDate, now)) return false;
  if (b.paymentStatus === "proof_uploaded") return false;
  if (b.status === "confirmed" && b.rescheduledBy === "client") return false;
  if (b.status === "confirmed") return true;
  return false;
}

type InboxTab = "needs_action" | "sessions" | "events" | "products";

function StatusBadge({ status, paymentStatus: _paymentStatus }: { status: string; paymentStatus?: string }) {
  const styles: Record<string, string> = {
    pending: "bg-amber-50 text-amber-800 border border-amber-200",
    confirmed: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    completed: "bg-emerald-100 text-emerald-800 border border-emerald-300",
    cancelled: "bg-red-50 text-red-700 border border-red-200",
    declined: "bg-gray-100 text-gray-600 border border-gray-200",
    rescheduled: "bg-amber-50 text-amber-700 border border-amber-200",
  };
  const icons: Record<string, any> = {
    pending: Clock,
    confirmed: CheckCircle2,
    completed: CheckCircle2,
    cancelled: XCircle,
    declined: Ban,
  };
  const Icon = icons[status] || Clock;
  return (
    <Badge className={`${styles[status] || styles.pending} text-[10px] flex items-center gap-1 py-0.5`}>
      <Icon className="w-3 h-3" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

function ClientAvatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map(p => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const colors = [
    "bg-[#C96868]/15 text-[#C96868]",
    "bg-blue-100 text-blue-700",
    "bg-emerald-100 text-emerald-700",
    "bg-purple-100 text-purple-700",
    "bg-amber-100 text-amber-700",
  ];
  const color = colors[name.charCodeAt(0) % colors.length];

  return (
    <div className={`w-9 h-9 rounded-full ${color} flex items-center justify-center text-xs font-semibold flex-shrink-0`}>
      {initials}
    </div>
  );
}

interface SessionBookingCardProps {
  booking: BookingWithSession;
  onClick: () => void;
  isHighlighted: boolean;
}

function SessionBookingCard({ booking, onClick, isHighlighted }: SessionBookingCardProps) {
  const cardRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isHighlighted && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [isHighlighted]);

  const currency = booking.session.currency || "USD";
  const price = booking.session.price;
  const isFree = !price || price === "0" || price === "0.00";

  const paymentBadge = () => {
    if (booking.paymentStatus === "proof_uploaded")
      return <Badge className="bg-purple-50 text-purple-700 border border-purple-200 text-[10px] flex items-center gap-1"><Upload className="w-3 h-3" />Proof Submitted</Badge>;
    if (booking.paymentStatus === "requested")
      return <Badge className="bg-orange-50 text-orange-700 border border-orange-200 text-[10px] flex items-center gap-1"><CreditCard className="w-3 h-3" />Payment Requested</Badge>;
    if (booking.paymentStatus === "verified")
      return <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Verified</Badge>;
    return null;
  };

  const formattedDate = format(new Date(booking.bookingDate), "EEE, MMM d");

  return (
    <button
      ref={cardRef}
      onClick={onClick}
      className={`w-full text-left rounded-lg border transition-all group hover:shadow-sm ${
        isHighlighted
          ? "border-[#C96868]/50 bg-[#FDF6EE]/60 shadow-md ring-2 ring-[#C96868]/20"
          : "border-gray-100 bg-white hover:border-[#b66667]/20"
      }`}
      data-testid={`booking-card-${booking.id}`}
    >
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <ClientAvatar name={booking.clientName} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1.5">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-900 truncate">{booking.clientName}</p>
              <p className="text-[11px] text-gray-500 truncate">{booking.session.title}</p>
            </div>
            <StatusBadge status={booking.status} />
          </div>
          <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-1.5 text-[11px] text-gray-500">
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3 text-[#C96868]/50 flex-shrink-0" />
              {formattedDate}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-[#C96868]/50 flex-shrink-0" />
              {formatTime12h(booking.bookingTime)} · {booking.session.duration}min
            </span>
            {booking.sessionMode && (
              <span className="flex items-center gap-1">
                {booking.sessionMode === "online"
                  ? <Video className="w-3 h-3 text-[#C96868]/50 flex-shrink-0" />
                  : <MapPin className="w-3 h-3 text-[#C96868]/50 flex-shrink-0" />
                }
                {booking.sessionMode === "online" ? "Online" : "In-Person"}
              </span>
            )}
            <span className="flex items-center gap-1">
              <CreditCard className="w-3 h-3 text-[#C96868]/50 flex-shrink-0" />
              {isFree ? "Free" : formatPrice(price, currency)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
            {paymentBadge()}
            {booking.rescheduledFrom && (
              <Badge className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] flex items-center gap-1 py-0">
                <RefreshCw className="w-2.5 h-2.5" />Rescheduled
              </Badge>
            )}
            {booking.confirmationCode && (
              <span className="text-[10px] text-gray-400 font-mono">#{booking.confirmationCode}</span>
            )}
          </div>
        </div>
        <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-[#C96868] transition-colors flex-shrink-0 mt-1" />
      </div>
    </button>
  );
}

interface SessionsSectionProps {
  title: string;
  count: number;
  bookings: BookingWithSession[];
  onSelectBooking: (b: BookingWithSession) => void;
  highlightedBookingId: number | null;
  accentColor?: string;
  sectionRef?: RefObject<HTMLDivElement>;
}

function SessionsSection({ title, count, bookings, onSelectBooking, highlightedBookingId, accentColor = "text-gray-500", sectionRef }: SessionsSectionProps) {
  return (
    <div ref={sectionRef} className="scroll-mt-2">
      {bookings.length > 0 && (
        <div className="mb-1">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100">
            <span className={`text-xs font-semibold uppercase tracking-wider ${accentColor}`}>{title}</span>
            <span className="text-[10px] bg-gray-100 text-gray-500 rounded-full px-2 py-0.5 font-medium">{count}</span>
          </div>
          <div className="px-2.5 pt-2 pb-2 space-y-1.5">
            {bookings.map(booking => (
              <SessionBookingCard
                key={booking.id}
                booking={booking}
                onClick={() => onSelectBooking(booking)}
                isHighlighted={highlightedBookingId === booking.id}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FilterPills — generic reusable pill filter strip
// To use in another tab (e.g. Events or Products), define a FilterPillConfig[]
// for that tab's categories and render <FilterPills> above its scroll area.
// ---------------------------------------------------------------------------

export interface FilterPillConfig {
  key: string;
  label: string;
  count: number;
  /** Tailwind classes applied to the pill when it is the active selection */
  accentColor: string;
}

interface FilterPillsProps {
  filters: FilterPillConfig[];
  activeKey: string;
  onChange: (key: string) => void;
}

export function FilterPills({ filters, activeKey, onChange }: FilterPillsProps) {
  return (
    <div
      className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-0.5"
      data-testid="filter-pills"
    >
      {filters.map(({ key, label, count, accentColor }) => {
        const isActive = activeKey === key;
        const isEmpty = count === 0;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            data-testid={`filter-pill-${key}`}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium
              transition-all duration-150 whitespace-nowrap flex-shrink-0
              ${isActive
                ? `${accentColor} border-transparent shadow-sm`
                : isEmpty
                  ? "bg-transparent border-gray-100 text-gray-300"
                  : "bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700"
              }
            `}
          >
            {label}
            <span
              className={`
                text-[10px] rounded-full px-1.5 py-0.5 min-w-[18px] text-center font-bold leading-none
                ${isActive ? "bg-black/10" : isEmpty ? "bg-gray-100 text-gray-300" : "bg-gray-100 text-gray-500"}
              `}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------

interface SessionsViewProps {
  bookings: BookingWithSession[];
  isLoading: boolean;
  onSelectBooking: (b: BookingWithSession) => void;
  highlightedBookingId: number | null;
}

function SessionsView({ bookings, isLoading, onSelectBooking, highlightedBookingId }: SessionsViewProps) {
  const now = startOfDay(new Date());
  const [activeFilter, setActiveFilter] = useState("all");

  // Ref to the ScrollArea root — used to locate the Radix viewport element for IntersectionObserver
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Section scroll-anchor refs
  const pendingRef   = useRef<HTMLDivElement>(null);
  const upcomingRef  = useRef<HTMLDivElement>(null);
  const pastRef      = useRef<HTMLDivElement>(null);
  const cancelledRef = useRef<HTMLDivElement>(null);

  const upcoming = useMemo(() =>
    bookings
      .filter(b => b.status === "confirmed" && isAfter(new Date(b.bookingDate), now) && b.rescheduledBy !== "client")
      .sort((a, b) => new Date(a.bookingDate).getTime() - new Date(b.bookingDate).getTime()),
    [bookings, now]
  );

  const past = useMemo(() =>
    bookings
      .filter(b =>
        b.status === "completed" ||
        (b.status === "confirmed" && isBefore(new Date(b.bookingDate), now))
      )
      .sort((a, b) => new Date(b.bookingDate).getTime() - new Date(a.bookingDate).getTime()),
    [bookings, now]
  );

  const cancelled = useMemo(() =>
    bookings
      .filter(b => b.status === "cancelled" || b.status === "declined")
      .sort((a, b) => new Date(b.bookingDate).getTime() - new Date(a.bookingDate).getTime()),
    [bookings, now]
  );

  const pending = useMemo(() =>
    bookings
      .filter(b => b.status === "pending" || (b.status === "confirmed" && b.rescheduledBy === "client"))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [bookings]
  );

  // True reschedule requests only (client-initiated, regardless of booking status)
  const reschedules = useMemo(() =>
    bookings
      .filter(b => b.rescheduledBy === "client")
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [bookings]
  );

  // Scroll-spy: update active pill based on which section is near the top of the scroll viewport.
  // Must use the Radix scroll viewport as the IntersectionObserver root — sections scroll
  // inside that container, not the browser viewport, so the default root won't fire correctly.
  useEffect(() => {
    if (!scrollAreaRef.current) return;
    const viewport = scrollAreaRef.current.querySelector(
      "[data-radix-scroll-area-viewport]"
    ) as HTMLElement | null;
    if (!viewport) return;

    const pairs = [
      { ref: pendingRef,   key: "all"       },
      { ref: upcomingRef,  key: "upcoming"  },
      { ref: pastRef,      key: "past"      },
      { ref: cancelledRef, key: "cancelled" },
    ];

    const observers: IntersectionObserver[] = [];

    pairs.forEach(({ ref, key }) => {
      if (!ref.current) return;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActiveFilter(key);
        },
        { root: viewport, threshold: 0, rootMargin: "-10% 0px -80% 0px" }
      );
      obs.observe(ref.current);
      observers.push(obs);
    });

    return () => observers.forEach(o => o.disconnect());
  }, []);

  // Pill click: scroll to the section
  const handlePillClick = (key: string) => {
    setActiveFilter(key);
    const map: Record<string, RefObject<HTMLDivElement>> = {
      all:        pendingRef,
      reschedule: pendingRef,
      upcoming:   upcomingRef,
      past:       pastRef,
      cancelled:  cancelledRef,
    };
    map[key]?.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Session filter pill definitions.
  // To extend to Events / Products, create a similar config array in those panels
  // and render <FilterPills filters={...} activeKey={...} onChange={...} />.
  const sessionFilters: FilterPillConfig[] = [
    {
      key: "all",
      label: "All",
      count: bookings.length,
      accentColor: "bg-[#C96868]/10 text-[#C96868]",
    },
    {
      key: "upcoming",
      label: "Upcoming",
      count: upcoming.length,
      accentColor: "bg-emerald-100 text-emerald-700",
    },
    {
      key: "past",
      label: "Past",
      count: past.length,
      accentColor: "bg-gray-100 text-gray-600",
    },
    {
      key: "cancelled",
      label: "Cancelled",
      count: cancelled.length,
      accentColor: "bg-red-100 text-red-600",
    },
    {
      key: "reschedule",
      label: "Reschedule",
      count: reschedules.length,
      accentColor: "bg-amber-100 text-amber-700",
    },
  ];

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-xl border p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="w-9 h-9 rounded-full" />
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
            <Skeleton className="h-16 rounded-lg" />
          </div>
        ))}
      </div>
    );
  }

  if (bookings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <Calendar className="w-10 h-10 text-[#C96868]/20 mb-3" />
        <p className="text-sm text-gray-500 text-center">No sessions yet</p>
        <p className="text-xs text-gray-400 text-center mt-1">Bookings will appear here when clients request sessions</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 bg-white/95 backdrop-blur-sm px-2.5 pt-2 pb-1.5 border-b border-gray-100">
        <FilterPills
          filters={sessionFilters}
          activeKey={activeFilter}
          onChange={handlePillClick}
        />
      </div>

      <ScrollArea ref={scrollAreaRef} className="flex-1 min-h-0">
        <SessionsSection
          sectionRef={pendingRef}
          title="Pending / Reschedule"
          count={pending.length}
          bookings={pending}
          onSelectBooking={onSelectBooking}
          highlightedBookingId={highlightedBookingId}
          accentColor="text-amber-600"
        />
        <SessionsSection
          sectionRef={upcomingRef}
          title="Upcoming"
          count={upcoming.length}
          bookings={upcoming}
          onSelectBooking={onSelectBooking}
          highlightedBookingId={highlightedBookingId}
          accentColor="text-emerald-600"
        />
        <SessionsSection
          sectionRef={pastRef}
          title="Past"
          count={past.length}
          bookings={past}
          onSelectBooking={onSelectBooking}
          highlightedBookingId={highlightedBookingId}
          accentColor="text-gray-400"
        />
        <SessionsSection
          sectionRef={cancelledRef}
          title="Cancelled & Declined"
          count={cancelled.length}
          bookings={cancelled}
          onSelectBooking={onSelectBooking}
          highlightedBookingId={highlightedBookingId}
          accentColor="text-red-400"
        />
        <div className="h-4"></div>
      </ScrollArea>
    </div>
  );
}

interface NeedsActionItem {
  id: string;
  source: "session" | "event" | "product";
  sourceLabel: string;
  urgency: "high" | "medium";
  actionTitle: string;
  name: string;
  detailLine: string;
  contextLine?: string;
  timestamp: Date | null;
  targetTab: "sessions" | "events" | "products";
  booking?: BookingWithSession;
  targetEventId?: number;
  targetPurchaseId?: number;
}

function buildNeedsActionItems(
  bookings: BookingWithSession[],
  eventGroups: EventGroup[],
  purchases: ProductPurchase[]
): NeedsActionItem[] {
  const items: NeedsActionItem[] = [];
  const now = new Date();

  // Session items
  for (const b of bookings) {
    const currency = b.session.currency || "USD";
    const price = b.session.price;
    const priceStr = (!price || price === "0" || price === "0.00") ? "Free" : formatPrice(price, currency);
    const dateStr = format(new Date(b.bookingDate), "MMM d");
    const contextLine = `${dateStr} · ${formatTime12h(b.bookingTime)} · ${priceStr}`;

    if (b.paymentStatus === "proof_uploaded") {
      items.push({
        id: `session-proof-${b.id}`,
        source: "session",
        sourceLabel: "Session",
        urgency: "high",
        actionTitle: "Payment proof submitted",
        name: b.clientName,
        detailLine: b.session.title,
        contextLine,
        timestamp: b.paymentMarkedAt ? new Date(b.paymentMarkedAt) : new Date(b.updatedAt),
        targetTab: "sessions",
        booking: b,
      });
    } else if (b.status === "pending" && b.rescheduledBy === "client") {
      items.push({
        id: `session-reschedule-${b.id}`,
        source: "session",
        sourceLabel: "Session",
        urgency: "medium",
        actionTitle: "Reschedule request",
        name: b.clientName,
        detailLine: b.session.title,
        contextLine,
        timestamp: new Date(b.updatedAt),
        targetTab: "sessions",
        booking: b,
      });
    } else if (b.status === "confirmed" && b.rescheduledBy === "client") {
      items.push({
        id: `session-reschedule-confirmed-${b.id}`,
        source: "session",
        sourceLabel: "Session",
        urgency: "medium",
        actionTitle: "Reschedule request",
        name: b.clientName,
        detailLine: b.session.title,
        contextLine,
        timestamp: new Date(b.updatedAt),
        targetTab: "sessions",
        booking: b,
      });
    } else if (b.status === "pending") {
      items.push({
        id: `session-pending-${b.id}`,
        source: "session",
        sourceLabel: "Session",
        urgency: "medium",
        actionTitle: "New booking request",
        name: b.clientName,
        detailLine: b.session.title,
        contextLine,
        timestamp: new Date(b.createdAt),
        targetTab: "sessions",
        booking: b,
      });
    }
  }

  // Event items — individual proof_uploaded cards first
  for (const group of eventGroups) {
    const { event, registrations } = group;
    const eventDate = event.startAt ? new Date(event.startAt) : null;
    const dateStr = eventDate ? format(eventDate, "MMM d") : "";
    const evD = eventDate;
    const timeStr = evD && (evD.getHours() || evD.getMinutes()) ? evD.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : "";
    const contextLine = [dateStr, timeStr].filter(Boolean).join(" · ");

    // Individual proof_uploaded registrant cards (high urgency, like sessions)
    const proofRegs = registrations.filter(r => r.status === "confirmed" && r.paymentStatus === "proof_uploaded");
    for (const reg of proofRegs) {
      items.push({
        id: `event-proof-${reg.id}`,
        source: "event",
        sourceLabel: "Event",
        urgency: "high",
        actionTitle: "Payment proof submitted",
        name: reg.clientName,
        detailLine: event.title,
        contextLine,
        timestamp: reg.paymentMarkedAt ? new Date(reg.paymentMarkedAt) : (reg.updatedAt ? new Date(reg.updatedAt) : (reg.createdAt ? new Date(reg.createdAt) : null)),
        targetTab: "events",
        targetEventId: event.id,
      });
    }

    // Event-level card for non-proof, non-unpaid reasons (e.g. missing meeting link)
    const nonProofReasons = computeNeedsActionReasons(group).filter(r => !r.includes("proof pending") && !r.includes("unpaid"));
    if (nonProofReasons.length === 0) continue;

    const confirmedRegs = registrations.filter(r => r.status === "confirmed");
    const unpaidRegs = confirmedRegs.filter(r => r.paymentStatus === "pending");
    const hasMissingLink = nonProofReasons.some(r => r.includes("meeting link"));

    let cardName: string;
    let detailLine: string;

    const primaryRegistrants = unpaidRegs.length > 0 ? unpaidRegs : confirmedRegs;
    if (primaryRegistrants.length > 0) {
      const first = primaryRegistrants[0].clientName;
      cardName = primaryRegistrants.length === 1
        ? first
        : `${first} +${primaryRegistrants.length - 1} other${primaryRegistrants.length - 1 !== 1 ? "s" : ""}`;
      detailLine = event.title;
    } else {
      cardName = event.title;
      detailLine = "No confirmed registrants";
    }

    const mostRecentReg = confirmedRegs.length > 0 ? confirmedRegs[0] : null;
    const recentTimestamp = mostRecentReg
      ? (mostRecentReg.updatedAt ? new Date(mostRecentReg.updatedAt) : (mostRecentReg.createdAt ? new Date(mostRecentReg.createdAt) : null))
      : null;

    items.push({
      id: `event-${event.id}`,
      source: "event",
      sourceLabel: "Event",
      urgency: hasMissingLink ? "high" : "medium",
      actionTitle: nonProofReasons.join(", "),
      name: cardName,
      detailLine,
      contextLine,
      timestamp: recentTimestamp,
      targetTab: "events",
      targetEventId: event.id,
    });
  }

  // Product items — proof_uploaded (high urgency) + pending (medium urgency)
  const proofUploadedPurchases = purchases.filter(p => p.status === "proof_uploaded");
  for (const purchase of proofUploadedPurchases) {
    items.push({
      id: `product-proof-${purchase.id}`,
      source: "product",
      sourceLabel: "Product",
      urgency: "high",
      actionTitle: "Payment proof submitted",
      name: purchase.buyerName || purchase.email,
      detailLine: purchase.productTitle,
      contextLine: formatPrice(purchase.amount, purchase.currency || "USD"),
      timestamp: purchase.paymentMarkedAt ? new Date(purchase.paymentMarkedAt) : (purchase.createdAt ? new Date(purchase.createdAt) : null),
      targetTab: "products",
      targetPurchaseId: purchase.id,
    });
  }

  const pendingPurchases = purchases.filter(p => p.status === "pending");
  for (const purchase of pendingPurchases) {
    items.push({
      id: `product-${purchase.id}`,
      source: "product",
      sourceLabel: "Product",
      urgency: "medium",
      actionTitle: "Verify payment",
      name: purchase.buyerName || purchase.email,
      detailLine: purchase.productTitle,
      contextLine: formatPrice(purchase.amount, purchase.currency || "USD"),
      timestamp: purchase.createdAt ? new Date(purchase.createdAt) : null,
      targetTab: "products",
      targetPurchaseId: purchase.id,
    });
  }

  // Sort by timestamp descending (most recent first)
  return items.sort((a, b) => {
    const tA = a.timestamp ? a.timestamp.getTime() : 0;
    const tB = b.timestamp ? b.timestamp.getTime() : 0;
    return tB - tA;
  });
}

function NeedsActionCard({
  item,
  onNavigate,
  onSelectBooking,
}: {
  item: NeedsActionItem;
  onNavigate: (tab: "sessions" | "events" | "products", eventId?: number, purchaseId?: number, bookingId?: number) => void;
  onSelectBooking: (booking: BookingWithSession) => void;
}) {
  const sourceIcon = {
    session: Calendar,
    event: CalendarDays,
    product: Package,
  }[item.source];
  const SourceIcon = sourceIcon;

  const cardBgColors = {
    session: "bg-[#C96868]/[0.04]",
    event: "bg-[#3B82F6]/[0.04]",
    product: "bg-[#F59E0B]/[0.04]",
  }[item.source];

  const sourcePillColors = {
    session: "bg-[#C96868]/10 text-[#C96868]",
    event: "bg-blue-100 text-blue-600",
    product: "bg-amber-100 text-amber-600",
  }[item.source];

  const iconColors = {
    session: "text-[#C96868]",
    event: "text-blue-600",
    product: "text-amber-600",
  }[item.source];

  const handleClick = () => {
    if (item.source === "session" && item.booking) {
      onSelectBooking(item.booking);
      return;
    } else if (item.source === "event") {
      onNavigate("events", item.targetEventId, undefined);
    } else if (item.source === "product") {
      onNavigate("products", undefined, item.targetPurchaseId);
    }
  };

  const timeAgo = item.timestamp
    ? formatDistanceToNow(item.timestamp, { addSuffix: true })
    : null;

  return (
    <button
      onClick={handleClick}
      className={`w-full text-left rounded-lg border border-gray-100 px-3 py-2.5 hover:shadow-sm transition-all group ${cardBgColors}`}
      data-testid={`needs-action-card-${item.id}`}
    >
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 bg-white/60">
          <SourceIcon className={`w-3.5 h-3.5 ${iconColors}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`text-[9px] font-semibold uppercase tracking-wider rounded px-1 py-px ${sourcePillColors}`}>
              {item.sourceLabel}
            </span>
            {timeAgo && (
              <span className="text-[10px] text-gray-400 truncate">{timeAgo}</span>
            )}
          </div>
          <p className="text-xs font-semibold text-gray-900 leading-snug truncate mt-0.5">{item.actionTitle}</p>
          <p className="text-[11px] text-gray-500 truncate">{item.name}</p>
          <p className="text-[11px] text-gray-400 truncate">{item.detailLine}</p>
        </div>
        <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-[#C96868] transition-colors flex-shrink-0" />
      </div>
    </button>
  );
}

function NeedsActionView({
  bookings,
  isLoadingBookings,
  onNavigate,
  onSelectBooking,
}: {
  bookings: BookingWithSession[];
  isLoadingBookings: boolean;
  onNavigate: (tab: "sessions" | "events" | "products", eventId?: number, purchaseId?: number, bookingId?: number) => void;
  onSelectBooking: (booking: BookingWithSession) => void;
}) {
  const { data: eventData, isLoading: isLoadingEvents } = useEventGroupsData();
  const { data: purchasesData, isLoading: isLoadingPurchases } = useProductPurchasesData();
  const purchases = purchasesData ?? [];

  const eventGroups = eventData?.eventGroups ?? [];

  const items = useMemo(
    () => buildNeedsActionItems(bookings, eventGroups, purchases),
    [bookings, eventGroups, purchases]
  );

  if (isLoadingBookings || isLoadingEvents || isLoadingPurchases) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-xl border p-4 space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mb-3">
          <CheckCircle2 className="w-7 h-7 text-emerald-400" />
        </div>
        <p className="text-sm font-medium text-gray-700 text-center">All caught up!</p>
        <p className="text-xs text-gray-400 text-center mt-1">No pending actions across sessions, events, or products</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-2.5 space-y-1.5">
        <div className="px-1 mb-1">
          <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider">
            {items.length} item{items.length !== 1 ? "s" : ""} require attention
          </p>
          {(() => {
            const sessionCount = items.filter(i => i.source === "session").length;
            const eventCount = items.filter(i => i.source === "event").length;
            const productCount = items.filter(i => i.source === "product").length;
            const parts = [
              sessionCount > 0 ? `${sessionCount} session${sessionCount !== 1 ? "s" : ""}` : null,
              eventCount > 0 ? `${eventCount} event${eventCount !== 1 ? "s" : ""}` : null,
              productCount > 0 ? `${productCount} product${productCount !== 1 ? "s" : ""}` : null,
            ].filter(Boolean);
            if (parts.length <= 1) return null;
            return (
              <p className="text-[10px] text-gray-400 mt-0.5">{parts.join(" · ")}</p>
            );
          })()}
        </div>
        {items.map(item => (
          <NeedsActionCard
            key={item.id}
            item={item}
            onNavigate={onNavigate}
            onSelectBooking={onSelectBooking}
          />
        ))}
      </div>
      <div className="h-4" />
    </ScrollArea>
  );
}

interface TabConfig {
  key: InboxTab;
  label: string;
  icon: any;
  count: number;
  showBadge: boolean;
}

interface BookingInboxProps {
  onSelectBooking: (booking: BookingWithSession) => void;
  notificationEventId?: number | null;
  notificationRegistrationId?: number | null;
  notificationEventVersion?: number;
}

export function BookingInbox({ onSelectBooking, notificationEventId, notificationRegistrationId, notificationEventVersion = 0 }: BookingInboxProps) {
  const [activeTab, setActiveTab] = useState<InboxTab>("needs_action");
  const [highlightedBookingId, setHighlightedBookingId] = useState<number | null>(null);
  const [highlightedEventId, setHighlightedEventId] = useState<number | null>(null);
  const [highlightedRegistrationId, setHighlightedRegistrationId] = useState<number | null>(null);
  const [highlightedPurchaseId, setHighlightedPurchaseId] = useState<number | null>(null);

  const handledEventVersion = useRef(0);

  useEffect(() => {
    if (notificationEventVersion <= 0 || notificationEventVersion === handledEventVersion.current) return;
    if (notificationEventId) {
      handledEventVersion.current = notificationEventVersion;
      setActiveTab("events");
      setHighlightedEventId(notificationEventId);
      setHighlightedBookingId(null);
      setHighlightedPurchaseId(null);
      if (notificationRegistrationId) {
        setHighlightedRegistrationId(notificationRegistrationId);
      }
    }
  }, [notificationEventId, notificationRegistrationId, notificationEventVersion]);

  const { data: bookings = [], isLoading } = useQuery<BookingWithSession[]>({
    queryKey: ["/api/dashboard/bookings"],
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false,
  });

  const { data: eventData } = useEventGroupsData();
  const { data: purchases = [] } = useProductPurchasesData();
  const upcomingEventsCount = useUpcomingEventsCount();

  const now = startOfDay(new Date());

  const needsActionCount = useMemo(() => {
    const sessionCount = bookings.filter(isNeedsAction).length;
    const eventGroups = eventData?.eventGroups ?? [];
    // Count individual proof_uploaded registrants + event-level non-proof items
    let eventCount = 0;
    for (const group of eventGroups) {
      const proofRegs = group.registrations.filter(r => r.status === "confirmed" && r.paymentStatus === "proof_uploaded");
      eventCount += proofRegs.length;
      const nonProofReasons = computeNeedsActionReasons(group).filter(r => !r.includes("proof pending") && !r.includes("unpaid"));
      if (nonProofReasons.length > 0) eventCount += 1;
    }
    const productCount = purchases.filter(p => p.status === "pending" || p.status === "proof_uploaded").length;
    return sessionCount + eventCount + productCount;
  }, [bookings, eventData, purchases]);

  const upcomingSessionsCount = useMemo(
    () => bookings.filter(b =>
      b.status === "pending" ||
      (b.status === "confirmed" && b.rescheduledBy === "client") ||
      (b.status === "confirmed" && isAfter(new Date(b.bookingDate), now))
    ).length,
    [bookings, now]
  );

  const pendingProductsCount = useMemo(
    () => purchases.filter(p => p.status === "pending" || p.status === "proof_uploaded").length,
    [purchases]
  );

  const tabs: TabConfig[] = [
    {
      key: "needs_action",
      label: "Needs Action",
      icon: AlertTriangle,
      count: needsActionCount,
      showBadge: true,
    },
    {
      key: "sessions",
      label: "Sessions",
      icon: Calendar,
      count: upcomingSessionsCount,
      showBadge: true,
    },
    {
      key: "events",
      label: "Events",
      icon: CalendarDays,
      count: upcomingEventsCount,
      showBadge: true,
    },
    {
      key: "products",
      label: "Products",
      icon: ShoppingBag,
      count: pendingProductsCount,
      showBadge: pendingProductsCount > 0,
    },
  ];

  const handleNavigateFromNeedsAction = (
    tab: "sessions" | "events" | "products",
    eventId?: number,
    purchaseId?: number,
    bookingId?: number
  ) => {
    setActiveTab(tab);
    setHighlightedBookingId(bookingId ?? null);
    setHighlightedEventId(eventId ?? null);
    setHighlightedPurchaseId(purchaseId ?? null);
  };

  const handleTabChange = (tab: InboxTab) => {
    setActiveTab(tab);
    if (tab !== "sessions") setHighlightedBookingId(null);
    if (tab !== "events") { setHighlightedEventId(null); setHighlightedRegistrationId(null); }
    if (tab !== "products") setHighlightedPurchaseId(null);
  };

  return (
    <div className="flex flex-col h-full" data-testid="booking-inbox">
      {/* Tab Bar */}
      <div className="flex items-center gap-0.5 px-2 py-2 border-b border-gray-100 bg-white flex-shrink-0 overflow-x-auto scrollbar-hide">
        {tabs.map(({ key, label, icon: Icon, count, showBadge }) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              onClick={() => handleTabChange(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 ${
                isActive
                  ? "bg-[#C96868] text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"
              }`}
              data-testid={`tab-${key}`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
              {showBadge && (
                <span className={`text-[10px] rounded-full px-1.5 py-0.5 min-w-[18px] text-center font-bold leading-none ${
                  isActive
                    ? "bg-white/20 text-white"
                    : count > 0
                      ? "bg-[#C96868]/10 text-[#C96868]"
                      : "bg-gray-100 text-gray-400"
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "needs_action" && (
          <NeedsActionView
            bookings={bookings}
            isLoadingBookings={isLoading}
            onNavigate={handleNavigateFromNeedsAction}
            onSelectBooking={onSelectBooking}
          />
        )}

        {activeTab === "sessions" && (
          <SessionsView
            bookings={bookings}
            isLoading={isLoading}
            onSelectBooking={onSelectBooking}
            highlightedBookingId={highlightedBookingId}
          />
        )}

        {activeTab === "events" && (
          <div className="h-full overflow-hidden">
            <EventRegistrationsPanel
              highlightedEventId={highlightedEventId}
              highlightedRegistrationId={highlightedRegistrationId}
            />
          </div>
        )}

        {activeTab === "products" && (
          <div className="h-full overflow-hidden">
            <ProductPurchasesPanel highlightedPurchaseId={highlightedPurchaseId} />
          </div>
        )}
      </div>
    </div>
  );
}

export { StatusBadge };
