import { useState } from "react";
import { useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CalendarDays, CheckCircle, AlertCircle, XCircle } from "lucide-react";
import { format } from "date-fns";

export default function CancelRegistration() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const token = params.get("token");
  const [cancelled, setCancelled] = useState(false);

  const { data, isLoading, isError } = useQuery<{
    registration: {
      id: number;
      clientName: string;
      clientEmail: string;
      status: string;
      confirmationCode: string;
    };
    event: {
      title: string;
      startAt?: string | null;
      endAt?: string | null;
      date?: string | null;
      startTime?: string | null;
      location: string | null;
    } | null;
  }>({
    queryKey: ["/api/events/cancel-registration", token],
    queryFn: () =>
      fetch(`/api/events/cancel-registration?token=${encodeURIComponent(token || "")}`)
        .then(r => {
          if (!r.ok) throw new Error("Registration not found");
          return r.json();
        }),
    enabled: !!token,
    retry: false,
  });

  const cancelMutation = useMutation({
    mutationFn: () => {
      const regId = data?.registration?.id;
      if (!regId) return Promise.reject(new Error("Registration ID not found"));
      return apiRequest("POST", `/api/event-registrations/${regId}/cancel-by-token`, { token });
    },
    onSuccess: () => setCancelled(true),
  });

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <AlertCircle className="w-10 h-10 text-amber-500 mb-2" />
            <CardTitle>Invalid Link</CardTitle>
            <CardDescription>This cancellation link is invalid or has expired.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#C96868]" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <AlertCircle className="w-10 h-10 text-red-500 mb-2" />
            <CardTitle>Registration Not Found</CardTitle>
            <CardDescription>
              We couldn't find your registration. The link may have expired or already been used.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const { registration, event } = data;
  const eventDate = event?.startAt ? new Date(event.startAt) : (event?.date ? new Date(event.date) : null);
  const alreadyCancelled = registration.status === "cancelled";

  if (cancelled || alreadyCancelled) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
              <XCircle className="w-8 h-8 text-gray-500" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Registration Cancelled</h2>
              <p className="text-gray-600 mt-2">
                {alreadyCancelled && !cancelled
                  ? "This registration has already been cancelled."
                  : `Your registration for ${event?.title || "this event"} has been cancelled.`}
              </p>
            </div>
            <p className="text-sm text-gray-500">You'll receive a confirmation email shortly.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle>Cancel Registration</CardTitle>
          <CardDescription>
            Are you sure you want to cancel your registration?
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-gray-50 border rounded-lg p-4 space-y-2 text-sm">
            <p className="font-medium text-gray-900">{event?.title || "Event"}</p>
            {eventDate && (
              <div className="flex items-center gap-2 text-gray-600">
                <CalendarDays className="w-4 h-4" />
                <span>{format(eventDate, "EEEE, MMMM d, yyyy")}</span>
              </div>
            )}
            {event?.startAt ? (() => {
              const sd = new Date(event.startAt);
              if (!sd.getHours() && !sd.getMinutes()) return null;
              return <p className="text-gray-600">Time: {sd.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</p>;
            })() : event?.startTime ? (
              <p className="text-gray-600">Time: {event.startTime}</p>
            ) : null}
            {event?.location && (
              <p className="text-gray-600">Location: {event.location}</p>
            )}
            <div className="border-t pt-2 mt-2">
              <p className="text-gray-700">Registrant: <strong>{registration.clientName}</strong></p>
              <p className="text-gray-500 text-xs">{registration.clientEmail}</p>
            </div>
          </div>

          {cancelMutation.isError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              Failed to cancel registration. Please try again.
            </div>
          )}

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => history.back()}
              data-testid="button-keep-registration"
            >
              Keep Registration
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              data-testid="button-confirm-cancel"
            >
              {cancelMutation.isPending ? (
                <div className="flex items-center gap-2">
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  Cancelling...
                </div>
              ) : (
                "Yes, Cancel"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
