import { useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { ToastAction } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase";

interface BookingNotificationEvent {
  type: "new_booking" | "payment_proof";
  bookingId: number;
  clientName: string;
  sessionTitle: string;
  bookingDate: string;
  bookingTime: string;
  confirmationCode: string;
}

interface RegistrationNotificationEvent {
  type: "new_registration";
  registrationId: number;
  eventId?: number;
  clientName: string;
  eventTitle: string;
  confirmationCode: string;
  requiresPayment: boolean;
}

interface CashPendingNotificationEvent {
  type: "cash_pending";
  registrationId: number;
  eventId?: number;
  clientName: string;
  eventTitle: string;
}

interface RegistrationCancelledNotificationEvent {
  type: "registration_cancelled";
  registrationId: number;
  clientName: string;
  eventTitle: string;
}

type CoachNotificationEvent =
  | BookingNotificationEvent
  | RegistrationNotificationEvent
  | CashPendingNotificationEvent
  | RegistrationCancelledNotificationEvent;

interface UseCoachNotificationsOptions {
  isAuthenticated: boolean;
  onOpenBooking?: (bookingId: number) => void;
  onOpenEventRegistration?: (eventId: number, registrationId: number) => void;
}

export function useCoachNotifications({
  isAuthenticated,
  onOpenBooking,
  onOpenEventRegistration,
}: UseCoachNotificationsOptions) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const onOpenBookingRef = useRef(onOpenBooking);
  const onOpenEventRegistrationRef = useRef(onOpenEventRegistration);
  const toastRef = useRef(toast);
  const queryClientRef = useRef(queryClient);

  useEffect(() => { onOpenBookingRef.current = onOpenBooking; }, [onOpenBooking]);
  useEffect(() => { onOpenEventRegistrationRef.current = onOpenEventRegistration; }, [onOpenEventRegistration]);
  useEffect(() => { toastRef.current = toast; }, [toast]);
  useEffect(() => { queryClientRef.current = queryClient; }, [queryClient]);

  useEffect(() => {
    if (!isAuthenticated) return;

    let stopped = false;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let abortController = new AbortController();

    const handleEvent = (data: CoachNotificationEvent) => {
      queryClientRef.current.invalidateQueries({ queryKey: ["/api/notifications"] });

      if (data.type === "registration_cancelled") {
        const title = "Event Registration Cancelled";
        const body = `${data.clientName} cancelled their registration for ${data.eventTitle}.`;

        let dismissToast: (() => void) | null = null;
        const { dismiss } = toastRef.current({
          title,
          description: body,
          duration: Infinity,
          className: "cursor-pointer",
          onClick: () => { dismissToast?.(); },
        });
        dismissToast = dismiss;

        queryClientRef.current.invalidateQueries({ queryKey: ["/api/dashboard/events"] });

        if (typeof Notification !== "undefined" && Notification.permission === "granted" && !document.hasFocus()) {
          new Notification(`${title} — Riplect`, { body, icon: "/favicon.ico" });
        }
        return;
      }

      if (data.type === "cash_pending") {
        const title = "New RSVP — Cash at Door";
        const body = `${data.clientName} registered for ${data.eventTitle} and will pay cash at the event.`;
        const eventId = data.eventId;
        const registrationId = data.registrationId;
        const canNavigate = !!(eventId && registrationId && onOpenEventRegistrationRef.current);

        let dismissToast: (() => void) | null = null;
        const { dismiss } = toastRef.current({
          title,
          description: body,
          duration: Infinity,
          className: "cursor-pointer",
          onClick: () => { dismissToast?.(); },
          action: canNavigate ? (
            <ToastAction
              altText="View registration"
              onClick={(e) => {
                e.stopPropagation();
                onOpenEventRegistrationRef.current?.(eventId!, registrationId!);
              }}
            >
              View
            </ToastAction>
          ) : undefined,
        });
        dismissToast = dismiss;

        queryClientRef.current.invalidateQueries({ queryKey: ["/api/dashboard/events"] });

        if (typeof Notification !== "undefined" && Notification.permission === "granted" && !document.hasFocus()) {
          new Notification(`${title} — Riplect`, { body, icon: "/favicon.ico" });
        }
        return;
      }

      if (data.type === "new_registration") {
        const title = data.requiresPayment
          ? "New Event Registration — Payment Required"
          : "New Event Registration";
        const body = data.requiresPayment
          ? `${data.clientName} registered for ${data.eventTitle}. Please confirm their payment.`
          : `${data.clientName} registered for ${data.eventTitle}.`;

        const eventId = data.eventId;
        const registrationId = data.registrationId;
        const canNavigate = !!(eventId && registrationId && onOpenEventRegistrationRef.current);

        let dismissToast: (() => void) | null = null;
        const { dismiss } = toastRef.current({
          title,
          description: body,
          duration: Infinity,
          className: "cursor-pointer",
          onClick: () => { dismissToast?.(); },
          action: canNavigate ? (
            <ToastAction
              altText="View registration"
              onClick={(e) => {
                e.stopPropagation();
                onOpenEventRegistrationRef.current?.(eventId!, registrationId!);
              }}
            >
              View
            </ToastAction>
          ) : undefined,
        });
        dismissToast = dismiss;

        queryClientRef.current.invalidateQueries({ queryKey: ["/api/dashboard/events"] });

        if (typeof Notification !== "undefined" && Notification.permission === "granted" && !document.hasFocus()) {
          new Notification(`${title} — Riplect`, { body, icon: "/favicon.ico" });
        }
        return;
      }

      if (data.type !== "new_booking" && data.type !== "payment_proof") return;

      const isPayment = data.type === "payment_proof";
      const title = isPayment ? "Payment Proof Received" : "New Booking Request";
      const body = isPayment
        ? `${data.clientName} submitted payment for ${data.sessionTitle}`
        : `${data.clientName} booked ${data.sessionTitle} on ${data.bookingDate} at ${data.bookingTime}`;

      const bookingId = data.bookingId;

      let dismissToast: (() => void) | null = null;

      const { dismiss } = toastRef.current({
        title,
        description: body,
        duration: Infinity,
        className: "cursor-pointer",
        onClick: () => {
          onOpenBookingRef.current?.(bookingId);
          dismissToast?.();
        },
        action: onOpenBookingRef.current ? (
          <ToastAction
            altText="View booking"
            onClick={(e) => {
              e.stopPropagation();
              onOpenBookingRef.current?.(bookingId);
            }}
          >
            View
          </ToastAction>
        ) : undefined,
      });
      dismissToast = dismiss;

      queryClientRef.current.invalidateQueries({ queryKey: ["/api/dashboard/bookings"] });

      if (typeof Notification !== "undefined" && Notification.permission === "granted" && !document.hasFocus()) {
        new Notification(`${title} — Riplect`, { body, icon: "/favicon.ico" });
      }
    };

    const connect = async () => {
      if (stopped) return;

      try {
        const sessionData = await supabase.auth.getSession();
        const token = sessionData.data.session?.access_token;
        if (!token) {
          if (!stopped) retryTimeout = setTimeout(connect, 5000);
          return;
        }
        if (stopped) return;

        const response = await fetch("/api/notifications/stream", {
          headers: { Authorization: `Bearer ${token}` },
          signal: abortController.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`SSE error: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!stopped) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6)) as CoachNotificationEvent;
                handleEvent(data);
              } catch {
                // Ignore parse errors (heartbeat/comment lines)
              }
            }
          }
        }

        if (!stopped) {
          retryTimeout = setTimeout(connect, 5000);
        }
      } catch (err: unknown) {
        const isAbort = err instanceof Error && err.name === "AbortError";
        if (isAbort || stopped) return;
        retryTimeout = setTimeout(connect, 5000);
      }
    };

    connect();

    return () => {
      stopped = true;
      abortController.abort();
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [isAuthenticated]);
}
