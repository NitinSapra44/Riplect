import { useState, useEffect, lazy, Suspense, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Inbox } from "lucide-react";
import type { BookingWithSession } from "@/components/booking-inbox";
import { isNeedsAction } from "@/components/booking-inbox";
import { useEventNeedsActionCount } from "@/components/event-registrations-panel";
import { useProductPurchaseNeedsAttentionCount } from "@/components/product-purchases-panel";

const BookingInbox = lazy(() => import("@/components/booking-inbox").then(m => ({ default: m.BookingInbox })));
const BookingDetail = lazy(() => import("@/components/booking-detail").then(m => ({ default: m.BookingDetail })));

function PanelLoading() {
  return (
    <div className="flex items-center justify-center h-40">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#C96868]" />
    </div>
  );
}

interface BookingPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialBookingId?: number | null;
  navigateToBookingId?: number | null;
  navigateVersion?: number;
  notificationEventId?: number | null;
  notificationRegistrationId?: number | null;
  notificationEventVersion?: number;
}

export function BookingPanel({ open, onOpenChange, initialBookingId, navigateToBookingId, navigateVersion = 0, notificationEventId, notificationRegistrationId, notificationEventVersion = 0 }: BookingPanelProps) {
  const [selectedBooking, setSelectedBooking] = useState<BookingWithSession | null>(null);
  const deepLinkHandled = useRef(false);
  const handledVersion = useRef(0);

  const { data: allBookings = [] } = useQuery<BookingWithSession[]>({
    queryKey: ["/api/dashboard/bookings"],
    enabled: open || (!!navigateToBookingId && navigateVersion > 0),
  });

  // Deep-link: auto-navigate on first open (only once)
  useEffect(() => {
    if (open && initialBookingId && allBookings.length > 0 && !deepLinkHandled.current) {
      const target = allBookings.find(b => b.id === initialBookingId);
      if (target) {
        setSelectedBooking(target);
        deepLinkHandled.current = true;
      }
    }
  }, [open, initialBookingId, allBookings]);

  // Notification-triggered navigation
  useEffect(() => {
    if (!navigateToBookingId || navigateVersion <= 0 || navigateVersion === handledVersion.current) return;
    if (allBookings.length > 0) {
      const target = allBookings.find(b => b.id === navigateToBookingId);
      if (target) {
        handledVersion.current = navigateVersion;
        setSelectedBooking(target);
      }
    }
  }, [navigateToBookingId, navigateVersion, allBookings]);

  const handleBack = () => setSelectedBooking(null);

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      setSelectedBooking(null);
    }
    onOpenChange(isOpen);
  };

  const panelTitle = selectedBooking ? "Booking Details" : "Booking Inbox";

  const panelDesc = selectedBooking
    ? `${selectedBooking.session.title} with ${selectedBooking.clientName}`
    : "Manage your sessions, booking and products";

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg p-0 flex flex-col overflow-hidden"
        data-testid="booking-panel"
      >
        <SheetHeader className="px-4 py-3 border-b border-[#b66667]/15 flex-shrink-0 bg-gradient-to-r from-[#FDF6EE] to-white">
          <SheetTitle className="text-base font-semibold text-gray-900">
            {panelTitle}
          </SheetTitle>
          <SheetDescription className="text-xs text-gray-500">
            {panelDesc}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-hidden">
          <Suspense fallback={<PanelLoading />}>
            {selectedBooking ? (
              <BookingDetail booking={selectedBooking} onBack={handleBack} />
            ) : (
              <BookingInbox
                onSelectBooking={setSelectedBooking}
                notificationEventId={notificationEventId}
                notificationRegistrationId={notificationRegistrationId}
                notificationEventVersion={notificationEventVersion}
              />
            )}
          </Suspense>
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface BookingPanelTriggerProps {
  initialBookingId?: number | null;
}

export function BookingPanelTrigger({ initialBookingId }: BookingPanelTriggerProps = {}) {
  const [open, setOpen] = useState(false);
  const autoOpened = useRef(false);

  const { data: bookings = [] } = useQuery<BookingWithSession[]>({
    queryKey: ["/api/dashboard/bookings"],
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    if (initialBookingId && !autoOpened.current) {
      setOpen(true);
      autoOpened.current = true;
    }
  }, [initialBookingId]);

  const eventNeedsAttention = useEventNeedsActionCount();
  const productNeedsAttention = useProductPurchaseNeedsAttentionCount();

  const needsActionCount = useMemo(() => {
    return bookings.filter(isNeedsAction).length + eventNeedsAttention + productNeedsAttention;
  }, [bookings, eventNeedsAttention, productNeedsAttention]);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="rounded-full relative bg-white text-[#C96868]/90 text-sm font-medium hover:bg-[#C96868]/90 hover:text-white transition-colors border border-[#b66667]"
        data-testid="button-open-bookings"
      >
        <Inbox className="w-4 h-4 mr-1.5" />
        Bookings
        {needsActionCount > 0 && (
          <Badge className="absolute -top-2 -right-2 h-5 min-w-[20px] px-1 text-[10px] bg-[#C96868] text-white border-0 rounded-full flex items-center justify-center">
            {needsActionCount}
          </Badge>
        )}
      </Button>
      <BookingPanel open={open} onOpenChange={setOpen} initialBookingId={initialBookingId} />
    </>
  );
}

interface BookingSidebarItemProps {
  initialBookingId?: number | null;
  notificationBookingId?: number | null;
  notificationVersion?: number;
  notificationEventId?: number | null;
  notificationRegistrationId?: number | null;
  notificationEventVersion?: number;
}

export function BookingSidebarItem({ initialBookingId, notificationBookingId, notificationVersion = 0, notificationEventId, notificationRegistrationId, notificationEventVersion = 0 }: BookingSidebarItemProps = {}) {
  const [open, setOpen] = useState(false);
  const autoOpened = useRef(false);

  const { data: bookings = [] } = useQuery<BookingWithSession[]>({
    queryKey: ["/api/dashboard/bookings"],
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    if (initialBookingId && !autoOpened.current) {
      setOpen(true);
      autoOpened.current = true;
    }
  }, [initialBookingId]);

  // Open the panel whenever a new booking notification arrives
  useEffect(() => {
    if (notificationVersion > 0 && notificationBookingId) {
      setOpen(true);
    }
  }, [notificationVersion]);

  // Open the panel whenever a new event registration notification arrives
  useEffect(() => {
    if (notificationEventVersion > 0 && notificationEventId) {
      setOpen(true);
    }
  }, [notificationEventVersion]);

  const eventNeedsAttention = useEventNeedsActionCount();
  const productNeedsAttention = useProductPurchaseNeedsAttentionCount();

  const needsActionCount = useMemo(() => {
    return bookings.filter(isNeedsAction).length + eventNeedsAttention + productNeedsAttention;
  }, [bookings, eventNeedsAttention, productNeedsAttention]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
        data-testid="button-open-bookings"
      >
        <Inbox className="w-5 h-5 mr-3 flex-shrink-0" />
        <span className="flex-1 text-left">Bookings</span>
        {needsActionCount > 0 && (
          <Badge className="ml-auto h-5 min-w-[20px] px-1.5 text-[10px] bg-[#C96868] text-white border-0 rounded-full flex items-center justify-center">
            {needsActionCount}
          </Badge>
        )}
      </button>
      <BookingPanel
        open={open}
        onOpenChange={setOpen}
        initialBookingId={initialBookingId}
        navigateToBookingId={notificationBookingId}
        navigateVersion={notificationVersion}
        notificationEventId={notificationEventId}
        notificationRegistrationId={notificationRegistrationId}
        notificationEventVersion={notificationEventVersion}
      />
    </>
  );
}
