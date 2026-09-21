import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Users, 
  DollarSign, 
  Calendar, 
  Mail, 
  Phone, 
  CheckCircle, 
  XCircle, 
  Clock,
  Coins,
} from "lucide-react";
import type { EventRegistration } from "@shared/schema";
import { formatPrice } from "@shared/currencies";

interface EventRegistrationsData {
  registrations: EventRegistration[];
  totalAmount: number;
  totalRegistrations: number;
}

interface EventRegistrationsProps {
  eventId: number;
  eventTitle: string;
  isOpen: boolean;
  onClose: () => void;
  highlightRegistrationId?: number | null;
}

export function EventRegistrations({ eventId, eventTitle, isOpen, onClose, highlightRegistrationId }: EventRegistrationsProps) {
  const highlightRef = useRef<HTMLDivElement | null>(null);
  const [dimmedHighlight, setDimmedHighlight] = useState(false);
  const { data, isLoading, error } = useQuery<EventRegistrationsData>({
    queryKey: ["/api/dashboard/events", eventId, "registrations"],
    enabled: isOpen && !!eventId,
  });

  // Scroll to the highlighted registration once data is loaded
  useEffect(() => {
    if (!highlightRegistrationId || !data) return;
    setDimmedHighlight(false);
    let timerId: ReturnType<typeof setTimeout> | null = null;
    const frame = requestAnimationFrame(() => {
      highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      // Fade the ring out after 2.5 s so it doesn't distract forever
      timerId = setTimeout(() => setDimmedHighlight(true), 2500);
    });
    return () => {
      cancelAnimationFrame(frame);
      if (timerId !== null) clearTimeout(timerId);
    };
  }, [highlightRegistrationId, data]);

  const getPaymentStatusIcon = (status: string) => {
    switch (status) {
      case "paid":
      case "verified":
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case "failed":
        return <XCircle className="w-4 h-4 text-red-600" />;
      case "cash_pending":
        return <Coins className="w-4 h-4 text-amber-700" />;
      default:
        return <Clock className="w-4 h-4 text-yellow-600" />;
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case "paid":
      case "verified":
        return "bg-green-100 text-green-800";
      case "failed":
        return "bg-red-100 text-red-800";
      case "cash_pending":
        return "bg-amber-100 text-amber-800";
      default:
        return "bg-yellow-100 text-yellow-800";
    }
  };

  const getPaymentStatusLabel = (status: string) => {
    if (status === "cash_pending") return "Cash — to collect";
    if (status === "proof_uploaded") return "Proof uploaded";
    return status.replace(/_/g, " ");
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Event Registrations - {eventTitle}
          </DialogTitle>
          <DialogDescription>
            View all registrations and payments for this event
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        )}

        {error && (
          <div className="text-center py-8">
            <p className="text-red-600">Failed to load registrations. Please try again.</p>
          </div>
        )}

        {data && (
          <div className="space-y-6">
            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="flex items-center p-6">
                  <div className="flex items-center space-x-3">
                    <Users className="w-8 h-8 text-blue-600" />
                    <div>
                      <p className="text-2xl font-bold text-gray-900">{data.totalRegistrations}</p>
                      <p className="text-sm text-gray-600">Total Registrations</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="flex items-center p-6">
                  <div className="flex items-center space-x-3">
                    <CheckCircle className="w-8 h-8 text-green-600" />
                    <div>
                      <p className="text-2xl font-bold text-gray-900">
                        {data.registrations.filter(r => r.paymentStatus === 'paid').length}
                      </p>
                      <p className="text-sm text-gray-600">Paid Registrations</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="flex items-center p-6">
                  <div className="flex items-center space-x-3">
                    <DollarSign className="w-8 h-8 text-green-600" />
                    <div>
                      <p className="text-2xl font-bold text-gray-900">{formatPrice(data.totalAmount.toFixed(2), "USD")}</p>
                      <p className="text-sm text-gray-600">Total Amount Collected</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Registrations List */}
            {data.registrations.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Users className="h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No registrations yet</h3>
                  <p className="text-gray-500 text-center">
                    When people register for your event, their information will appear here.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Registered Attendees
                </h3>
                <div className="grid gap-4">
                  {data.registrations.map((registration) => {
                    const isHighlighted = highlightRegistrationId === registration.id;
                    return (
                    <Card
                      key={registration.id}
                      ref={isHighlighted ? highlightRef : null}
                      className={isHighlighted && !dimmedHighlight
                        ? "ring-2 ring-primary transition-all duration-700"
                        : "transition-all duration-700"}
                      data-testid={`registration-card-${registration.id}`}
                    >
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between">
                          <div className="space-y-3">
                            <div>
                              <h4 className="text-lg font-semibold text-gray-900">{registration.clientName}</h4>
                              <p className="text-sm text-gray-600">
                                Registered on {format(new Date(registration.createdAt!), "MMM dd, yyyy 'at' h:mm a")}
                              </p>
                            </div>
                            
                            <div className="flex flex-col space-y-2">
                              {registration.clientEmail && (
                                <div className="flex items-center space-x-2 text-sm text-gray-600">
                                  <Mail className="w-4 h-4" />
                                  <span>{registration.clientEmail}</span>
                                </div>
                              )}
                              {registration.clientPhone && (
                                <div className="flex items-center space-x-2 text-sm text-gray-600">
                                  <Phone className="w-4 h-4" />
                                  <span>{registration.clientPhone}</span>
                                </div>
                              )}
                            </div>

                            {registration.message && (
                              <div className="bg-gray-50 rounded-lg p-3">
                                <p className="text-sm text-gray-700">
                                  <strong>Message:</strong> {registration.message}
                                </p>
                              </div>
                            )}
                          </div>

                          <div className="flex flex-col items-end space-y-2">
                            <Badge className={getPaymentStatusColor(registration.paymentStatus)}>
                              <div className="flex items-center space-x-1">
                                {getPaymentStatusIcon(registration.paymentStatus)}
                                <span className="capitalize">{getPaymentStatusLabel(registration.paymentStatus)}</span>
                              </div>
                            </Badge>
                            <p className="text-lg font-semibold text-gray-900">
                              ${parseFloat(registration.totalAmount).toFixed(2)}
                            </p>
                            <p className="text-xs text-gray-500">
                              #{registration.confirmationCode}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end space-x-2 pt-4 border-t">
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}