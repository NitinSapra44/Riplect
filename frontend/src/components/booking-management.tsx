import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Calendar, Clock, User, Phone, Mail, DollarSign, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { isUnauthorizedError } from "@/lib/authUtils";
import { formatPrice } from "@shared/currencies";

interface BookingWithSession {
  id: number;
  sessionId: number;
  profileId: number;
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  message?: string;
  bookingDate: string;
  bookingTime: string;
  status: string;
  paymentStatus: string;
  paymentId?: string;
  totalAmount: string;
  confirmationCode: string;
  createdAt: string;
  updatedAt: string;
  cancelledBy?: string;
  cancellationReason?: string;
  cancelledAt?: string;
  rescheduledFrom?: string;
  rescheduledBy?: string;
  session: {
    id: number;
    title: string;
    description?: string;
    duration: number;
    price: string;
  };
}

const StatusBadge = ({ status }: { status: string }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "confirmed":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "completed":
        return "bg-green-100 text-green-800 border-green-200";
      case "cancelled":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return <Clock className="w-3 h-3" />;
      case "confirmed":
        return <CheckCircle2 className="w-3 h-3" />;
      case "completed":
        return <CheckCircle2 className="w-3 h-3" />;
      case "cancelled":
        return <XCircle className="w-3 h-3" />;
      default:
        return <AlertCircle className="w-3 h-3" />;
    }
  };

  return (
    <Badge className={`${getStatusColor(status)} flex items-center gap-1`}>
      {getStatusIcon(status)}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
};

const PaymentStatusBadge = ({ status }: { status: string }) => {
  const getPaymentColor = (status: string) => {
    switch (status) {
      case "paid":
        return "bg-green-100 text-green-800 border-green-200";
      case "pending":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "failed":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  return (
    <Badge className={getPaymentColor(status)}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
};

export function BookingManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [selectedBooking, setSelectedBooking] = useState<BookingWithSession | null>(null);

  const { data: bookings = [], isLoading, error } = useQuery<BookingWithSession[]>({
    queryKey: ["/api/dashboard/bookings"],
    retry: false,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ bookingId, status }: { bookingId: number; status: string }) => {
      return await apiRequest("PATCH", `/api/dashboard/bookings/${bookingId}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/bookings"] });
      toast({
        title: "Success",
        description: "Booking status updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update booking status",
        variant: "destructive",
      });
    },
  });

  const cancelWithReasonMutation = useMutation({
    mutationFn: async ({ bookingId, reason }: { bookingId: number; reason: string }) => {
      return await apiRequest("POST", `/api/dashboard/bookings/${bookingId}/cancel`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/bookings"] });
      setCancelDialogOpen(false);
      setCancelReason("");
      setSelectedBooking(null);
      toast({
        title: "Booking Cancelled",
        description: "The booking has been cancelled and the client has been notified.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to cancel booking",
        variant: "destructive",
      });
    },
  });

  const handleCancelClick = (booking: BookingWithSession) => {
    setSelectedBooking(booking);
    setCancelDialogOpen(true);
  };

  const filteredBookings = bookings.filter((booking: BookingWithSession) => {
    if (selectedStatus === "all") return true;
    return booking.status === selectedStatus;
  });

  const getUpcomingBookings = () => {
    const today = new Date();
    return bookings.filter((booking: BookingWithSession) => {
      const bookingDate = new Date(booking.bookingDate);
      return bookingDate >= today && booking.status === "confirmed";
    });
  };

  const getRecentBookings = () => {
    return bookings.slice(0, 5);
  };

  const getTotalRevenue = () => {
    return bookings
      .filter((booking: BookingWithSession) => booking.paymentStatus === "paid")
      .reduce((total: number, booking: BookingWithSession) => total + parseFloat(booking.totalAmount), 0);
  };

  // Handle authentication errors
  if (error && isUnauthorizedError(error as Error)) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <AlertCircle className="mx-auto h-12 w-12 text-yellow-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">Authentication Required</h3>
            <p className="mt-2 text-sm text-gray-500">
              You need to be logged in to view your bookings.
            </p>
            <Button
              className="mt-4"
              onClick={() => window.location.href = '/api/login'}
            >
              Login
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <XCircle className="mx-auto h-12 w-12 text-red-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">Error Loading Bookings</h3>
            <p className="mt-2 text-sm text-gray-500">
              There was an error loading your bookings. Please try again.
            </p>
            <Button
              className="mt-4"
              onClick={() => window.location.reload()}
            >
              Refresh Page
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div className="ml-2">
                <p className="text-sm font-medium text-muted-foreground">Total Bookings</p>
                <p className="text-2xl font-bold">{bookings.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div className="ml-2">
                <p className="text-sm font-medium text-muted-foreground">Upcoming</p>
                <p className="text-2xl font-bold">{getUpcomingBookings().length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              <div className="ml-2">
                <p className="text-sm font-medium text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold">
                  {bookings.filter((b: BookingWithSession) => b.status === "completed").length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <div className="ml-2">
                <p className="text-sm font-medium text-muted-foreground">Revenue</p>
                <p className="text-2xl font-bold">{formatPrice(getTotalRevenue().toFixed(2), "USD")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <label htmlFor="status-filter" className="text-sm font-medium">
            Filter by status:
          </label>
          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Bookings</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Bookings List */}
      <Card>
        <CardHeader>
          <CardTitle>Bookings</CardTitle>
          <CardDescription>
            Manage your client bookings and appointments
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredBookings.length === 0 ? (
            <div className="text-center py-8">
              <Calendar className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-4 text-lg font-medium text-gray-900">No bookings found</h3>
              <p className="mt-2 text-sm text-gray-500">
                {selectedStatus === "all" 
                  ? "You don't have any bookings yet." 
                  : `No ${selectedStatus} bookings found.`}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredBookings.map((booking: BookingWithSession) => (
                <div
                  key={booking.id}
                  className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="font-semibold text-lg">{booking.session.title}</h3>
                      <StatusBadge status={booking.status} />
                      {booking.paymentStatus !== "pending" && (
                        <PaymentStatusBadge status={booking.paymentStatus} />
                      )}
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <User className="w-4 h-4" />
                          {booking.clientName}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Mail className="w-4 h-4" />
                          {booking.clientEmail}
                        </div>
                        {booking.clientPhone && (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Phone className="w-4 h-4" />
                            {booking.clientPhone}
                          </div>
                        )}
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Calendar className="w-4 h-4" />
                          {format(new Date(booking.bookingDate), "MMM dd, yyyy")}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Clock className="w-4 h-4" />
                          {booking.bookingTime} ({booking.session.duration} min)
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <DollarSign className="w-4 h-4" />
                          ${booking.totalAmount}
                        </div>
                      </div>
                    </div>

                    {booking.message && (
                      <div className="mb-3 p-3 bg-gray-50 rounded text-sm">
                        <p className="font-medium text-gray-700">Client Message:</p>
                        <p className="text-gray-600">{booking.message}</p>
                      </div>
                    )}

                    {/* Reschedule Request Context */}
                    {booking.status === 'pending' && booking.rescheduledFrom && (
                      <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
                            Reschedule Request
                          </Badge>
                          <span className="text-xs text-yellow-700">
                            by {booking.rescheduledBy === 'client' ? 'Client' : 'Coach'}
                          </span>
                        </div>
                        <p className="text-gray-600">
                          Previously scheduled for: {format(new Date(booking.rescheduledFrom), "MMM dd, yyyy")}
                        </p>
                      </div>
                    )}

                    {/* Cancellation Details */}
                    {booking.status === 'cancelled' && booking.cancellationReason && (
                      <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded text-sm">
                        <p className="font-medium text-gray-700 flex items-center gap-2">
                          Cancelled by {booking.cancelledBy === 'client' ? 'Client' : 'Coach'}
                          {booking.cancelledAt && (
                            <span className="text-xs text-gray-500 font-normal">
                              on {format(new Date(booking.cancelledAt), "MMM dd, yyyy")}
                            </span>
                          )}
                        </p>
                        <p className="text-gray-600 mt-1">Reason: {booking.cancellationReason}</p>
                      </div>
                    )}

                    <div className="mb-4 text-xs text-gray-500">
                      Confirmation Code: <span className="font-mono font-medium">{booking.confirmationCode}</span>
                    </div>

                    {/* Action buttons moved to bottom */}
                    <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-100">
                      {booking.status === "confirmed" && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => updateStatusMutation.mutate({ bookingId: booking.id, status: "completed" })}
                            disabled={updateStatusMutation.isPending}
                            className="flex-shrink-0"
                          >
                            Mark Complete
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCancelClick(booking)}
                            disabled={cancelWithReasonMutation.isPending}
                            className="flex-shrink-0"
                          >
                            Cancel
                          </Button>
                        </>
                      )}
                      {booking.status === "cancelled" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateStatusMutation.mutate({ bookingId: booking.id, status: "confirmed" })}
                          disabled={updateStatusMutation.isPending}
                          className="flex-shrink-0"
                        >
                          Restore
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cancel Booking Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Booking</DialogTitle>
            <DialogDescription>
              Please provide a reason for cancelling this booking. The client will be notified.
            </DialogDescription>
          </DialogHeader>
          {selectedBooking && (
            <div className="space-y-4">
              <div className="bg-muted p-3 rounded-md">
                <p className="font-medium">{selectedBooking.session.title}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedBooking.clientName} - {format(new Date(selectedBooking.bookingDate), "MMM dd, yyyy")} at {selectedBooking.bookingTime}
                </p>
              </div>
              <div>
                <Label htmlFor="cancelReason">Cancellation Reason *</Label>
                <Textarea
                  id="cancelReason"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Please explain why you need to cancel this booking..."
                  className="mt-1"
                  data-testid="input-coach-cancel-reason"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
              Keep Booking
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedBooking && cancelWithReasonMutation.mutate({ bookingId: selectedBooking.id, reason: cancelReason })}
              disabled={!cancelReason.trim() || cancelWithReasonMutation.isPending}
              data-testid="button-confirm-coach-cancel"
            >
              {cancelWithReasonMutation.isPending ? "Cancelling..." : "Cancel Booking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}