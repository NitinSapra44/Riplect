import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Bell, CheckCheck, Calendar, CreditCard, UserCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";
import type { CoachNotification } from "@shared/schema";

const INFORMATIONAL_TYPES = ["registration_cancelled", "cash_pending"] as const;

function parseBodyIfJson(body: string): Record<string, any> | null {
  if (!body || body[0] !== "{") return null;
  try { return JSON.parse(body); } catch { return null; }
}

function getDisplayContent(n: CoachNotification): { title: string; body: string } {
  const parsed = parseBodyIfJson(n.body);
  if (!parsed) return { title: n.title, body: n.body };
  const type = parsed.type ?? n.type;
  const name = parsed.clientName ?? parsed.client_name ?? "";
  const eventTitle = parsed.eventTitle ?? parsed.event_title ?? "";
  const sessionTitle = parsed.sessionTitle ?? parsed.session_title ?? "";
  const productTitle = parsed.productTitle ?? parsed.product_title ?? "";
  if (type === "cash_pending") {
    return {
      title: "New RSVP — Cash at Door",
      body: `${name} registered for ${eventTitle} and will pay cash at the event.`,
    };
  }
  if (type === "new_registration") {
    return {
      title: parsed.requiresPayment ? "New Event Registration — Payment Required" : "New Event Registration",
      body: parsed.requiresPayment
        ? `${name} registered for ${eventTitle}. Please confirm their payment.`
        : `${name} registered for ${eventTitle}.`,
    };
  }
  if (type === "payment_proof") {
    const item = sessionTitle || eventTitle || productTitle;
    return { title: "Payment Proof Received", body: `${name} submitted payment${item ? ` for ${item}` : ""}.` };
  }
  if (type === "new_booking") {
    return { title: "New Booking Request", body: `${name} booked ${sessionTitle}.` };
  }
  return { title: n.title, body: n.body };
}

function notifIcon(type: string) {
  if (type === "new_booking") return <Calendar className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />;
  if (type === "payment_proof") return <CreditCard className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />;
  if (type === "new_registration") return <UserCheck className="w-4 h-4 text-purple-500 flex-shrink-0 mt-0.5" />;
  if (type === "cash_pending") return <UserCheck className="w-4 h-4 text-purple-500 flex-shrink-0 mt-0.5" />;
  return <Bell className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />;
}

function parseNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseInt(v, 10);
  return NaN;
}

function getNavTarget(n: CoachNotification): { bookingId: number } | { eventId: number; registrationId: number } | null {
  const m = n.metadata;
  if (!m) return null;

  if (n.type === "new_registration" || n.type === "cash_pending") {
    const eventId = parseNum(m.eventId ?? m.event_id);
    const registrationId = parseNum(m.registrationId ?? m.registration_id);
    if (!isNaN(eventId) && eventId > 0 && !isNaN(registrationId) && registrationId > 0) {
      return { eventId, registrationId };
    }
  }

  if (n.type === "payment_proof") {
    const eventId = parseNum(m.eventId ?? m.event_id);
    const registrationId = parseNum(m.registrationId ?? m.registration_id);
    if (!isNaN(eventId) && eventId > 0 && !isNaN(registrationId) && registrationId > 0) {
      return { eventId, registrationId };
    }
    const bookingId = parseNum(m.bookingId ?? m.booking_id);
    if (!isNaN(bookingId) && bookingId > 0) return { bookingId };
  }

  if (n.type === "new_booking") {
    const bookingId = parseNum(m.bookingId ?? m.booking_id);
    if (!isNaN(bookingId) && bookingId > 0) return { bookingId };
  }

  return null;
}

export interface NotificationNavTarget {
  bookingId?: number;
  eventId?: number;
  registrationId?: number;
}

interface NotificationPanelProps {
  onNavigate?: (target: NotificationNavTarget) => void;
}

export function NotificationPanel({ onNavigate }: NotificationPanelProps) {
  const [open, setOpen] = useState(false);
  const autoMarkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: notifications = [], isLoading } = useQuery<CoachNotification[]>({
    queryKey: ["/api/notifications"],
    refetchInterval: false,
    staleTime: 10000,
  });

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const markReadMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("PATCH", `/api/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", "/api/notifications/mark-all-read"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const markByTypeMutation = useMutation({
    mutationFn: (types: string[]) =>
      apiRequest("PATCH", "/api/notifications/mark-by-type", { types }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  useEffect(() => {
    if (open) {
      const hasUnreadInformational = notifications.some(
        (n) => !n.isRead && (INFORMATIONAL_TYPES as readonly string[]).includes(n.type),
      );
      if (hasUnreadInformational) {
        autoMarkTimerRef.current = setTimeout(() => {
          markByTypeMutation.mutate([...INFORMATIONAL_TYPES]);
        }, 2000);
      }
    } else {
      if (autoMarkTimerRef.current) {
        clearTimeout(autoMarkTimerRef.current);
        autoMarkTimerRef.current = null;
      }
    }
    return () => {
      if (autoMarkTimerRef.current) {
        clearTimeout(autoMarkTimerRef.current);
        autoMarkTimerRef.current = null;
      }
    };
  }, [open, notifications]);

  function handleItemClick(n: CoachNotification) {
    const target = getNavTarget(n);
    if (!target) return;
    if (!n.isRead) markReadMutation.mutate(n.id);
    setOpen(false);
    onNavigate?.(target);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-full w-9 h-9 text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
          data-testid="button-notification-bell"
          aria-label="Notifications"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-4 h-4 text-[10px] font-bold bg-red-500 text-white rounded-full leading-none"
              data-testid="badge-unread-count"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-80 p-0 shadow-xl border border-gray-200 dark:border-border"
        data-testid="notification-panel"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-border">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Notifications</h3>
            {unreadCount > 0 && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {unreadCount} unread
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-gray-500 hover:text-gray-900 px-2"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
              data-testid="button-mark-all-read"
            >
              <CheckCheck className="w-3.5 h-3.5 mr-1" />
              Mark all read
            </Button>
          )}
        </div>

        {/* Notification list */}
        <div className="max-h-96 overflow-y-auto divide-y divide-gray-50 dark:divide-border">
          {isLoading ? (
            <div className="py-8 text-center text-sm text-gray-400">Loading…</div>
          ) : notifications.length === 0 ? (
            <div className="py-10 text-center" data-testid="text-no-notifications">
              <Bell className="w-8 h-8 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No notifications yet</p>
            </div>
          ) : (
            notifications.map((n) => {
              const navTarget = getNavTarget(n);
              const isClickable = !!navTarget && !!onNavigate;
              const { title: displayTitle, body: displayBody } = getDisplayContent(n);
              return (
                <div
                  key={n.id}
                  role={isClickable ? "button" : undefined}
                  tabIndex={isClickable ? 0 : undefined}
                  onClick={isClickable ? () => handleItemClick(n) : undefined}
                  onKeyDown={isClickable ? (e) => e.key === "Enter" && handleItemClick(n) : undefined}
                  className={[
                    "flex items-start gap-3 px-4 py-3 transition-colors group",
                    !n.isRead ? "bg-blue-50/60 dark:bg-blue-950/20" : "",
                    isClickable
                      ? "cursor-pointer hover:bg-gray-100 dark:hover:bg-muted/50"
                      : "cursor-default hover:bg-gray-50 dark:hover:bg-muted/30",
                  ].join(" ")}
                  data-testid={`notification-item-${n.id}`}
                >
                  {notifIcon(n.type)}
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-medium leading-snug ${!n.isRead ? "text-gray-900 dark:text-white" : "text-gray-600 dark:text-gray-300"}`}>
                      {displayTitle}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug line-clamp-2">
                      {displayBody}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-1">
                      {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                    </p>
                    {isClickable && (
                      <p className="text-[10px] text-primary/70 mt-0.5 font-medium">
                        Click to view →
                      </p>
                    )}
                  </div>
                  {!n.isRead && (
                    <button
                      className="opacity-0 group-hover:opacity-100 flex-shrink-0 text-gray-300 hover:text-gray-600 transition-opacity mt-0.5"
                      onClick={(e) => {
                        e.stopPropagation();
                        markReadMutation.mutate(n.id);
                      }}
                      aria-label="Mark as read"
                      data-testid={`button-mark-read-${n.id}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
