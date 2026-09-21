import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { broadcast } from "@/lib/cacheChannel";
import { BookingTimeline } from "@/components/booking-timeline";
import { StatusBadge, type BookingWithSession } from "@/components/booking-inbox";
import {
  ArrowLeft, User, Mail, Phone, Calendar as CalendarIcon, Clock,
  DollarSign, MessageSquare, CheckCircle2, XCircle, RefreshCw,
  Send, Ban, MapPin, ExternalLink, Globe, CreditCard, FileText,
  Image, ShieldCheck
} from "lucide-react";
import { format } from "date-fns";
import { formatTimezoneShort } from "@/lib/timezone-utils";

interface BookingMessage {
  id: number;
  bookingId: number;
  senderType: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

interface PaymentMethod {
  type: string;
  enabled: boolean;
  order: number;
  instructions?: string;
  upi_id?: string;
  qr_code_url?: string;
  display_name?: string;
  url?: string;
  email?: string;
  paypal_link?: string;
  account_holder?: string;
  bank_name?: string;
  account_number?: string;
  ifsc?: string;
}

interface PaymentSettings {
  coachId: string;
  defaultInstructions: string | null;
  methods: PaymentMethod[];
}

const paymentMethodLabels: Record<string, string> = {
  upi: "UPI",
  payment_link: "Payment Link",
  paypal: "PayPal",
  wise: "Wise",
  bank_transfer: "Bank Transfer",
  cash: "Cash",
};

function formatTime12h(time: string): string {
  if (!time) return time;
  const [hourStr, minStr = "00"] = time.split(":");
  const hour = parseInt(hourStr, 10);
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${hour12}:${minStr} ${period}`;
}

function PaymentBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    paid: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    verified: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    pending: "bg-amber-50 text-amber-700 border border-amber-200",
    requested: "bg-blue-50 text-blue-700 border border-blue-200",
    proof_uploaded: "bg-purple-50 text-purple-700 border border-purple-200",
    offline: "bg-gray-100 text-gray-600 border border-gray-200",
    failed: "bg-red-50 text-red-700 border border-red-200",
  };
  const labels: Record<string, string> = {
    paid: "Paid",
    verified: "Verified",
    pending: "Payment Pending",
    requested: "Payment Requested",
    proof_uploaded: "Proof Submitted",
    offline: "Offline",
    failed: "Failed",
  };
  return (
    <Badge className={`${styles[status] || styles.pending} text-xs`} data-testid={`badge-payment-${status}`}>
      <DollarSign className="w-3 h-3 mr-1" />
      {labels[status] || status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}


interface BookingDetailProps {
  booking: BookingWithSession;
  onBack: () => void;
}

export function BookingDetail({ booking, onBack }: BookingDetailProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [declineDialogOpen, setDeclineDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [verifyPaymentDialogOpen, setVerifyPaymentDialogOpen] = useState(false);

  const [confirmMessage, setConfirmMessage] = useState("");
  const [confirmMeetingLink, setConfirmMeetingLink] = useState("");
  const [requestPayment, setRequestPayment] = useState(false);
  const [customPaymentInstruction, setCustomPaymentInstruction] = useState("");
  const [paymentInstructionText, setPaymentInstructionText] = useState("");
  const [declineReason, setDeclineReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  const [rejectPaymentDialogOpen, setRejectPaymentDialogOpen] = useState(false);
  const [rejectPaymentReason, setRejectPaymentReason] = useState("");

  const [verifyMeetingLink, setVerifyMeetingLink] = useState("");
  const [verifyMessage, setVerifyMessage] = useState("");

  const [newMessage, setNewMessage] = useState("");

  const { data: messages = [] } = useQuery<BookingMessage[]>({
    queryKey: ["/api/dashboard/bookings", booking.id, "messages"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/dashboard/bookings/${booking.id}/messages`);
      return res.json();
    },
    staleTime: 10 * 1000,
    refetchOnWindowFocus: true,
    refetchInterval: 15 * 1000,
    refetchIntervalInBackground: false,
  });

  const { data: paymentSettings } = useQuery<PaymentSettings>({
    queryKey: ["/api/dashboard/payment-settings"],
  });

  const { data: profile } = useQuery<{ googleCalendarConnected?: boolean }>({
    queryKey: ["/api/dashboard/profile"],
  });

  const enabledMethods = (paymentSettings?.methods || []).filter(m => m.enabled);
  const googleCalendarConnected = profile?.googleCalendarConnected || false;

  const generateMethodInstructions = (methods: PaymentMethod[]): string => {
    return methods.map(m => {
      let line = '';
      switch (m.type) {
        case 'upi':
          line = `UPI: ${m.upi_id || ''}${m.display_name ? ` (${m.display_name})` : ''}`;
          break;
        case 'payment_link':
          line = `Payment Link: ${m.url || ''}`;
          break;
        case 'paypal':
          line = `PayPal: ${m.paypal_link || m.email || ''}`;
          break;
        case 'wise':
          line = `Wise: ${m.email || ''}`;
          break;
        case 'bank_transfer':
          line = `Bank Transfer: ${m.bank_name || ''}, Account: ${m.account_number || ''}, IFSC: ${m.ifsc || ''}${m.account_holder ? `, Name: ${m.account_holder}` : ''}`;
          break;
        case 'cash':
          line = 'Cash payment';
          break;
        default:
          line = m.type;
      }
      if (m.instructions) {
        line += `\n  ${m.instructions}`;
      }
      return `• ${line}`;
    }).join('\n');
  };

  const handleRequestPaymentToggle = (checked: boolean) => {
    setRequestPayment(checked);
    if (checked && enabledMethods.length > 0) {
      setPaymentInstructionText(generateMethodInstructions(enabledMethods));
    } else if (!checked) {
      setPaymentInstructionText("");
    }
  };

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard/bookings"] });
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard/bookings", booking.id, "messages"] });
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard", "bookings", booking.id, "events"] });
    broadcast({ type: "bookings-updated" });
  };

  const markNotifReadByBooking = () => {
    apiRequest("PATCH", "/api/notifications/mark-by-reference", { bookingId: booking.id }).catch(() => {});
  };

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, any> = {
        message: confirmMessage || null,
      };
      if (requestPayment) {
        body.requestPayment = true;
        body.customPaymentInstruction = enabledMethods.length > 0
          ? paymentInstructionText || null
          : customPaymentInstruction || null;
      } else {
        body.meetingLink = confirmMeetingLink || null;
      }
      return await apiRequest("POST", `/api/dashboard/bookings/${booking.id}/confirm`, body);
    },
    onSuccess: () => {
      invalidateAll();
      markNotifReadByBooking();
      setConfirmDialogOpen(false);
      setConfirmMessage("");
      setConfirmMeetingLink("");
      setRequestPayment(false);
      setCustomPaymentInstruction("");
      setPaymentInstructionText("");
      toast({
        title: "Booking Confirmed",
        description: requestPayment
          ? "Booking confirmed and payment request sent to the guest."
          : "The guest has been notified.",
      });
      onBack();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to confirm booking", variant: "destructive" });
    },
  });

  const declineMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/dashboard/bookings/${booking.id}/decline`, {
        reason: declineReason,
      });
    },
    onSuccess: () => {
      invalidateAll();
      markNotifReadByBooking();
      setDeclineDialogOpen(false);
      setDeclineReason("");
      toast({ title: "Booking Declined", description: "The guest has been notified." });
      onBack();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to decline booking", variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/dashboard/bookings/${booking.id}/cancel`, {
        reason: cancelReason,
      });
    },
    onSuccess: () => {
      invalidateAll();
      setCancelDialogOpen(false);
      setCancelReason("");
      toast({ title: "Booking Cancelled", description: "The guest has been notified." });
      onBack();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to cancel booking", variant: "destructive" });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("PATCH", `/api/dashboard/bookings/${booking.id}/status`, { status: "completed" });
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Session Completed", description: "Booking marked as completed." });
      onBack();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to mark as completed", variant: "destructive" });
    },
  });

  const verifyPaymentMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/dashboard/bookings/${booking.id}/verify-payment`, {
        meetingLink: verifyMeetingLink || null,
        message: verifyMessage || null,
      });
    },
    onSuccess: () => {
      invalidateAll();
      markNotifReadByBooking();
      setVerifyPaymentDialogOpen(false);
      setVerifyMeetingLink("");
      setVerifyMessage("");
      toast({ title: "Payment Verified", description: "Booking confirmed. The guest has been notified." });
      onBack();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to verify payment", variant: "destructive" });
    },
  });

  const rejectPaymentMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/dashboard/bookings/${booking.id}/reject-payment`, {
        reason: rejectPaymentReason,
      });
    },
    onSuccess: () => {
      invalidateAll();
      markNotifReadByBooking();
      setRejectPaymentDialogOpen(false);
      setRejectPaymentReason("");
      toast({ title: "Payment Rejected", description: "The guest has been asked to resubmit payment proof." });
      onBack();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reject payment", variant: "destructive" });
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/dashboard/bookings/${booking.id}/messages`, {
        message: newMessage.trim(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/bookings", booking.id, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard", "bookings", booking.id, "events"] });
      setNewMessage("");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to send message", variant: "destructive" });
    },
  });

  const handleOpenConfirmDialog = () => {
    setRequestPayment(false);
    setCustomPaymentInstruction("");
    setConfirmMessage("");
    setConfirmMeetingLink(booking.meetingLink || "");
    setConfirmDialogOpen(true);
  };

  return (
    <div className="flex flex-col h-full" data-testid="booking-detail">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#b66667]/15 flex-shrink-0 bg-[#FDF6EE]/30">
        <Button variant="ghost" size="icon" onClick={onBack} className="text-[#C96868]" data-testid="button-back-to-inbox">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 truncate">{booking.session.title}</h3>
          <p className="text-xs text-gray-500 truncate">{booking.clientName}</p>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-5">
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={booking.status} paymentStatus={booking.paymentStatus} />
              <PaymentBadge status={booking.paymentStatus} />
              {booking.sessionMode && (
                <Badge variant="outline" className="text-xs border-[#b66667]/20 text-gray-600">
                  {booking.sessionMode === "offline" ? (
                    <><MapPin className="w-3 h-3 mr-1" />In-Person</>
                  ) : (
                    <><ExternalLink className="w-3 h-3 mr-1" />Online</>
                  )}
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <User className="w-4 h-4 text-[#C96868]/60 flex-shrink-0" />
                <span>{booking.clientName}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <Mail className="w-4 h-4 text-[#C96868]/60 flex-shrink-0" />
                <span className="truncate">{booking.clientEmail}</span>
              </div>
              {booking.clientPhone && (
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <Phone className="w-4 h-4 text-[#C96868]/60 flex-shrink-0" />
                  <span>{booking.clientPhone}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <CalendarIcon className="w-4 h-4 text-[#C96868]/60 flex-shrink-0" />
                <span>{format(new Date(booking.bookingDate), "EEEE, MMMM dd, yyyy")}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <Clock className="w-4 h-4 text-[#C96868]/60 flex-shrink-0" />
                <span>{formatTime12h(booking.bookingTime)} ({booking.session.duration} min)</span>
                {booking.coachTimezone && (
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <Globe className="w-3 h-3" />
                    {formatTimezoneShort(booking.coachTimezone)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <DollarSign className="w-4 h-4 text-[#C96868]/60 flex-shrink-0" />
                <span>{booking.session.currency || "USD"} {booking.totalAmount}</span>
              </div>
            </div>

            {booking.message && (
              <div className="bg-[#FDF6EE] border border-[#b66667]/10 rounded-md p-3">
                <p className="text-xs font-medium text-gray-600 mb-1">Guest Message</p>
                <p className="text-sm text-gray-700">{booking.message}</p>
              </div>
            )}

            {booking.customQuestionAnswer && (
              <div className="bg-[#FDF6EE] border border-[#b66667]/10 rounded-md p-3">
                <p className="text-xs font-medium text-gray-600 mb-1">Custom Question Answer</p>
                <p className="text-sm text-gray-700">{booking.customQuestionAnswer}</p>
              </div>
            )}

            <div className="text-xs text-gray-400">
              Confirmation: <span className="font-mono">{booking.confirmationCode}</span>
            </div>
          </div>

          <Separator className="bg-[#b66667]/10" />

          {booking.status === "pending" && booking.rescheduledBy === "client" && booking.rescheduledFrom && (
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3 space-y-1" data-testid="banner-reschedule-request">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-amber-600" />
                <span className="text-sm font-semibold text-amber-800">Reschedule Requested by Guest</span>
              </div>
              <p className="text-xs text-amber-700">
                {booking.clientName} has requested to reschedule from{" "}
                <span className="font-medium">{format(new Date(booking.rescheduledFrom), "EEE, MMM dd")}</span>{" "}
                to{" "}
                <span className="font-medium">{format(new Date(booking.bookingDate), "EEE, MMM dd")} at {formatTime12h(booking.bookingTime)}</span>.
              </p>
              <p className="text-xs text-amber-600">Please confirm or decline this reschedule request.</p>
            </div>
          )}

          {booking.paymentStatus === "proof_uploaded" && (
            <div className="bg-purple-50 border border-purple-200 rounded-md p-3 space-y-2" data-testid="banner-payment-proof">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-purple-600" />
                <span className="text-sm font-semibold text-purple-800">Payment Proof Submitted</span>
              </div>
              <p className="text-xs text-purple-700">
                {booking.clientName} has submitted payment proof. Please review and verify.
              </p>
              {booking.paymentMethodSelected ? (() => {
                const offeredMethods = booking.paymentMethodsOffered as PaymentMethod[] | undefined;
                const matchedMethod = offeredMethods?.find(m => m.type === booking.paymentMethodSelected);
                return (
                  <div className="bg-white/60 border border-purple-100 rounded-md p-2 space-y-1" data-testid="section-selected-method-details">
                    <p className="text-xs font-medium text-purple-600 mb-0.5">
                      Paid via: {paymentMethodLabels[booking.paymentMethodSelected] || booking.paymentMethodSelected}
                    </p>
                    {matchedMethod ? (
                      <div className="text-xs text-gray-700 space-y-0.5">
                        {matchedMethod.type === "upi" && (
                          <>
                            {matchedMethod.upi_id && <p>UPI ID: <span className="font-mono">{matchedMethod.upi_id}</span></p>}
                            {matchedMethod.display_name && <p>Name: {matchedMethod.display_name}</p>}
                          </>
                        )}
                        {matchedMethod.type === "payment_link" && matchedMethod.url && (
                          <p>Link: <a href={matchedMethod.url} target="_blank" rel="noopener noreferrer" className="text-purple-700 underline">{matchedMethod.url}</a></p>
                        )}
                        {matchedMethod.type === "paypal" && (
                          <>
                            {matchedMethod.paypal_link && <p>PayPal: <a href={matchedMethod.paypal_link} target="_blank" rel="noopener noreferrer" className="text-purple-700 underline">{matchedMethod.paypal_link}</a></p>}
                            {matchedMethod.email && <p>Email: {matchedMethod.email}</p>}
                          </>
                        )}
                        {matchedMethod.type === "wise" && matchedMethod.email && (
                          <p>Wise Email: {matchedMethod.email}</p>
                        )}
                        {matchedMethod.type === "bank_transfer" && (
                          <>
                            {matchedMethod.bank_name && <p>Bank: {matchedMethod.bank_name}</p>}
                            {matchedMethod.account_holder && <p>Account Holder: {matchedMethod.account_holder}</p>}
                            {matchedMethod.account_number && <p>Account: <span className="font-mono">{matchedMethod.account_number}</span></p>}
                            {matchedMethod.ifsc && <p>IFSC: <span className="font-mono">{matchedMethod.ifsc}</span></p>}
                          </>
                        )}
                        {matchedMethod.type === "cash" && (
                          <p>Cash payment</p>
                        )}
                        {matchedMethod.instructions && (
                          <p className="mt-1 text-gray-500 italic">{matchedMethod.instructions}</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-600">{paymentMethodLabels[booking.paymentMethodSelected] || booking.paymentMethodSelected}</p>
                    )}
                  </div>
                );
              })() : (
                <p className="text-xs text-purple-600" data-testid="text-custom-payment">
                  Payment method: <span className="font-medium">Custom payment</span>
                </p>
              )}
              {booking.paymentReferenceText && (
                <div className="bg-white/60 border border-purple-100 rounded-md p-2">
                  <p className="text-xs font-medium text-purple-600 mb-0.5">Reference</p>
                  <p className="text-sm text-gray-700">{booking.paymentReferenceText}</p>
                </div>
              )}
              {booking.paymentProofUrl && (
                <div className="bg-white/60 border border-purple-100 rounded-md p-2">
                  <p className="text-xs font-medium text-purple-600 mb-1">Payment Proof</p>
                  {booking.paymentProofUrl.includes('.supabase.co/storage') ? (
                    <a
                      href={booking.paymentProofUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid="link-payment-proof"
                    >
                      <img
                        src={booking.paymentProofUrl}
                        alt="Payment proof"
                        className="max-w-full max-h-64 rounded-md border border-purple-200 cursor-pointer hover:opacity-90 transition-opacity"
                        data-testid="img-payment-proof"
                      />
                    </a>
                  ) : (
                    <a
                      href={booking.paymentProofUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-purple-700 underline"
                      data-testid="link-payment-proof"
                    >
                      <Image className="w-3.5 h-3.5" />
                      View Proof
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          {booking.paymentStatus === "requested" && (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-3 space-y-1" data-testid="banner-payment-requested">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-semibold text-blue-800">Payment Requested</span>
              </div>
              <p className="text-xs text-blue-700">
                Waiting for {booking.clientName} to complete payment.
              </p>
              {booking.paymentMethodsOffered && (booking.paymentMethodsOffered as any[]).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {(booking.paymentMethodsOffered as PaymentMethod[]).map((m) => (
                    <Badge key={m.type} variant="secondary" className="text-[10px]" data-testid={`badge-offered-${m.type}`}>
                      {paymentMethodLabels[m.type] || m.type}
                    </Badge>
                  ))}
                </div>
              )}
              {booking.paymentInstruction && (
                <div className="bg-white/60 border border-blue-100 rounded-md p-2 mt-1">
                  <p className="text-xs font-medium text-blue-600 mb-0.5">Custom Instructions Sent</p>
                  <p className="text-xs text-gray-600 whitespace-pre-wrap">{booking.paymentInstruction}</p>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-[#C96868] uppercase tracking-wider">Actions</h4>
            <div className="flex flex-wrap gap-2">
              {booking.status === "pending" && booking.paymentStatus !== "proof_uploaded" && (
                <>
                  <Button size="sm" className="bg-[#C96868] text-white border-[#b66667]" onClick={handleOpenConfirmDialog} data-testid="button-confirm-booking">
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                    {booking.rescheduledBy === "client" ? "Confirm Reschedule" : "Confirm"}
                  </Button>
                  <Button size="sm" variant="outline" className="border-red-200 text-red-600" onClick={() => setDeclineDialogOpen(true)} data-testid="button-decline-booking">
                    <Ban className="w-3.5 h-3.5 mr-1.5" />
                    Decline
                  </Button>
                </>
              )}
              {booking.paymentStatus === "proof_uploaded" && (
                <>
                  <Button size="sm" className="bg-emerald-600 text-white border-emerald-500" onClick={() => setVerifyPaymentDialogOpen(true)} data-testid="button-verify-payment">
                    <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
                    Verify Payment
                  </Button>
                  <Button size="sm" variant="outline" className="border-amber-200 text-amber-600" onClick={() => setRejectPaymentDialogOpen(true)} data-testid="button-reject-payment">
                    <XCircle className="w-3.5 h-3.5 mr-1.5" />
                    Reject Payment
                  </Button>
                  <Button size="sm" variant="outline" className="border-red-200 text-red-600" onClick={() => setCancelDialogOpen(true)} data-testid="button-cancel-after-proof">
                    <XCircle className="w-3.5 h-3.5 mr-1.5" />
                    Cancel
                  </Button>
                </>
              )}
              {booking.status === "confirmed" && booking.paymentStatus === "requested" && (
                <>
                  <Button size="sm" variant="outline" className="border-red-200 text-red-600" onClick={() => setCancelDialogOpen(true)} data-testid="button-cancel-awaiting-payment">
                    <XCircle className="w-3.5 h-3.5 mr-1.5" />
                    Cancel
                  </Button>
                </>
              )}
              {booking.status === "confirmed" && (!booking.paymentStatus || booking.paymentStatus === "verified" || booking.paymentStatus === "pending") && (
                <>
                  <Button size="sm" className="bg-[#C96868] text-white border-[#b66667]" onClick={() => completeMutation.mutate()} disabled={completeMutation.isPending} data-testid="button-complete-booking">
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                    {completeMutation.isPending ? "Marking..." : "Mark Completed"}
                  </Button>
                  <Button size="sm" variant="outline" className="border-red-200 text-red-600" onClick={() => setCancelDialogOpen(true)} data-testid="button-cancel-booking">
                    <XCircle className="w-3.5 h-3.5 mr-1.5" />
                    Cancel
                  </Button>
                </>
              )}
              {(booking.status === "cancelled" || booking.status === "declined" || booking.status === "completed") && (
                <p className="text-xs text-gray-400 italic">
                  No actions available for {booking.status} bookings
                </p>
              )}
            </div>
          </div>

          <Separator className="bg-[#b66667]/10" />

          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-[#C96868] uppercase tracking-wider">Timeline</h4>
            <BookingTimeline bookingId={booking.id} coachTimezone={booking.coachTimezone} />
          </div>

          <Separator className="bg-[#b66667]/10" />

          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-[#C96868] uppercase tracking-wider">
              Messages
            </h4>

            {messages.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">No messages yet</p>
            ) : (
              <div className="space-y-2">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`p-2.5 rounded-md text-sm ${
                      msg.senderType === "coach"
                        ? "bg-[#C96868]/5 border border-[#b66667]/10 ml-4"
                        : "bg-gray-50 border border-gray-100 mr-4"
                    }`}
                    data-testid={`message-${msg.id}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-medium text-gray-500">
                        {msg.senderType === "coach" ? "You" : booking.clientName}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {format(new Date(msg.createdAt), "MMM dd, h:mm a")}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 break-words">{msg.message}</p>
                  </div>
                ))}
              </div>
            )}

            {booking.status !== "cancelled" && booking.status !== "declined" && (
              <div className="flex gap-2">
                <Textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Send a message..."
                  className="text-sm min-h-[60px] resize-none border-[#b66667]/15 focus-visible:ring-[#C96868]/30"
                  data-testid="input-booking-message"
                />
                <Button
                  size="icon"
                  onClick={() => sendMessageMutation.mutate()}
                  disabled={!newMessage.trim() || sendMessageMutation.isPending}
                  className="flex-shrink-0 self-end bg-[#C96868] text-white border-[#b66667]"
                  data-testid="button-send-message"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Confirm Booking</DialogTitle>
            <DialogDescription>
              Confirm this session with {booking.clientName} on {format(new Date(booking.bookingDate), "MMM dd, yyyy")} at {formatTime12h(booking.bookingTime)}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="confirmMessage">Message to Guest (optional)</Label>
              <Textarea
                id="confirmMessage"
                value={confirmMessage}
                onChange={(e) => setConfirmMessage(e.target.value)}
                placeholder="Looking forward to our session..."
                className="mt-1"
                data-testid="input-confirm-message"
              />
            </div>

            {['verified', 'proof_uploaded', 'requested'].includes(booking.paymentStatus) ? (
              <div className="border border-green-200 rounded-md p-3 flex items-center gap-2 bg-green-50" data-testid="text-payment-already-handled">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="text-sm text-green-700">
                  {booking.paymentStatus === 'verified' ? 'Payment already verified' : booking.paymentStatus === 'proof_uploaded' ? 'Payment proof already submitted' : 'Payment already requested'}
                </span>
              </div>
            ) : (
              <div className="border border-[#b66667]/15 rounded-md p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-[#C96868]/60" />
                    <Label htmlFor="requestPayment" className="text-sm font-medium cursor-pointer">Request Payment</Label>
                  </div>
                  <Switch
                    id="requestPayment"
                    checked={requestPayment}
                    onCheckedChange={handleRequestPaymentToggle}
                    data-testid="switch-request-payment"
                  />
                </div>

                {requestPayment && enabledMethods.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {enabledMethods.map((method) => (
                        <Badge key={method.type} variant="secondary" data-testid={`badge-method-${method.type}`}>
                          {paymentMethodLabels[method.type] || method.type}
                        </Badge>
                      ))}
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Payment Instructions (sent to client)</Label>
                      <Textarea
                        value={paymentInstructionText}
                        onChange={(e) => setPaymentInstructionText(e.target.value)}
                        className="text-sm mt-1 min-h-[80px]"
                        data-testid="input-payment-instruction-text"
                      />
                    </div>
                  </div>
                )}

                {requestPayment && enabledMethods.length === 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-amber-600" data-testid="text-no-methods-warning">
                      No payment methods configured. Enter custom instructions for your client.
                    </p>
                    <Textarea
                      value={customPaymentInstruction}
                      onChange={(e) => setCustomPaymentInstruction(e.target.value)}
                      placeholder="Enter payment details or instructions for your client..."
                      className="text-sm"
                      data-testid="input-custom-payment-instruction"
                    />
                  </div>
                )}
              </div>
            )}

            {!requestPayment && (
              <div>
                <Label htmlFor="meetingLink">
                  {googleCalendarConnected ? "Meeting Link (auto-generated via Google Meet)" : "Meeting Link (optional)"}
                </Label>
                {googleCalendarConnected ? (
                  <p className="text-xs text-gray-500 mt-1" data-testid="text-auto-meet">
                    A Google Meet link will be automatically created when you confirm.
                  </p>
                ) : (
                  <Input
                    id="meetingLink"
                    value={confirmMeetingLink}
                    onChange={(e) => setConfirmMeetingLink(e.target.value)}
                    placeholder="https://zoom.us/j/..."
                    className="mt-1"
                    data-testid="input-meeting-link"
                  />
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialogOpen(false)}>Cancel</Button>
            <Button
              className="bg-[#C96868] text-white border-[#b66667]"
              onClick={() => confirmMutation.mutate()}
              disabled={confirmMutation.isPending || (requestPayment && enabledMethods.length === 0 && !customPaymentInstruction.trim())}
              data-testid="button-submit-confirm"
            >
              {confirmMutation.isPending ? "Confirming..." : "Confirm Booking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={verifyPaymentDialogOpen} onOpenChange={setVerifyPaymentDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Verify Payment</DialogTitle>
            <DialogDescription>
              Review the payment proof from {booking.clientName} and confirm the booking.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {booking.paymentReferenceText && (
              <div className="bg-purple-50 border border-purple-200 rounded-md p-3">
                <p className="text-xs font-medium text-purple-600 mb-1">Payment Reference</p>
                <p className="text-sm text-gray-700">{booking.paymentReferenceText}</p>
              </div>
            )}
            {booking.paymentProofUrl && (
              <div className="bg-purple-50 border border-purple-200 rounded-md p-3">
                <p className="text-xs font-medium text-purple-600 mb-1">Proof Image</p>
                <a
                  href={booking.paymentProofUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-purple-700 underline"
                  data-testid="link-verify-proof"
                >
                  <Image className="w-3.5 h-3.5" />
                  View Proof
                </a>
              </div>
            )}
            <div>
              <Label htmlFor="verifyMeetingLink">
                {googleCalendarConnected ? "Meeting Link (auto-generated via Google Meet)" : "Meeting Link (optional)"}
              </Label>
              {googleCalendarConnected ? (
                <p className="text-xs text-gray-500 mt-1" data-testid="text-verify-auto-meet">
                  A Google Meet link will be automatically created when you verify.
                </p>
              ) : (
                <Input
                  id="verifyMeetingLink"
                  value={verifyMeetingLink}
                  onChange={(e) => setVerifyMeetingLink(e.target.value)}
                  placeholder="https://zoom.us/j/..."
                  className="mt-1"
                  data-testid="input-verify-meeting-link"
                />
              )}
            </div>
            <div>
              <Label htmlFor="verifyMessage">Message to Guest (optional)</Label>
              <Textarea
                id="verifyMessage"
                value={verifyMessage}
                onChange={(e) => setVerifyMessage(e.target.value)}
                placeholder="Payment received! Looking forward to our session..."
                className="mt-1"
                data-testid="input-verify-message"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerifyPaymentDialogOpen(false)}>Cancel</Button>
            <Button
              className="bg-emerald-600 text-white border-emerald-500"
              onClick={() => verifyPaymentMutation.mutate()}
              disabled={verifyPaymentMutation.isPending}
              data-testid="button-submit-verify"
            >
              {verifyPaymentMutation.isPending ? "Verifying..." : "Verify & Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={declineDialogOpen} onOpenChange={setDeclineDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline Booking</DialogTitle>
            <DialogDescription>
              Please provide a reason for declining this booking. {booking.clientName} will be notified.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="bg-[#FDF6EE] border border-[#b66667]/10 p-3 rounded-md">
              <p className="font-medium text-sm text-gray-900">{booking.session.title}</p>
              <p className="text-xs text-gray-500">
                {format(new Date(booking.bookingDate), "MMM dd, yyyy")} at {formatTime12h(booking.bookingTime)}
              </p>
            </div>
            <div>
              <Label htmlFor="declineReason">Reason for Declining *</Label>
              <Textarea
                id="declineReason"
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="I'm unable to take this booking because..."
                className="mt-1"
                data-testid="input-decline-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclineDialogOpen(false)}>Keep Booking</Button>
            <Button
              variant="destructive"
              onClick={() => declineMutation.mutate()}
              disabled={!declineReason.trim() || declineMutation.isPending}
              data-testid="button-submit-decline"
            >
              {declineMutation.isPending ? "Declining..." : "Decline Booking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Booking</DialogTitle>
            <DialogDescription>
              Please provide a reason for cancelling. {booking.clientName} will be notified.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="bg-[#FDF6EE] border border-[#b66667]/10 p-3 rounded-md">
              <p className="font-medium text-sm text-gray-900">{booking.session.title}</p>
              <p className="text-xs text-gray-500">
                {format(new Date(booking.bookingDate), "MMM dd, yyyy")} at {formatTime12h(booking.bookingTime)}
              </p>
            </div>
            <div>
              <Label htmlFor="cancelReason">Cancellation Reason *</Label>
              <Textarea
                id="cancelReason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="I need to cancel because..."
                className="mt-1"
                data-testid="input-cancel-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>Keep Booking</Button>
            <Button
              variant="destructive"
              onClick={() => cancelMutation.mutate()}
              disabled={!cancelReason.trim() || cancelMutation.isPending}
              data-testid="button-submit-cancel"
            >
              {cancelMutation.isPending ? "Cancelling..." : "Cancel Booking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectPaymentDialogOpen} onOpenChange={setRejectPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Payment Proof</DialogTitle>
            <DialogDescription>
              Let {booking.clientName} know why their payment proof could not be verified. They will be asked to resubmit.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="bg-[#FDF6EE] border border-[#b66667]/10 p-3 rounded-md">
              <p className="font-medium text-sm text-gray-900">{booking.session.title}</p>
              <p className="text-xs text-gray-500">
                {format(new Date(booking.bookingDate), "MMM dd, yyyy")} at {formatTime12h(booking.bookingTime)}
              </p>
            </div>
            {booking.paymentProofUrl && (
              <div className="bg-purple-50 border border-purple-200 rounded-md p-3">
                <p className="text-xs font-medium text-purple-600 mb-1">Submitted Proof</p>
                <a
                  href={booking.paymentProofUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-purple-700 underline"
                  data-testid="link-reject-view-proof"
                >
                  <Image className="w-3.5 h-3.5" />
                  View Proof
                </a>
              </div>
            )}
            <div>
              <Label htmlFor="rejectPaymentReason">Reason for Rejection *</Label>
              <Textarea
                id="rejectPaymentReason"
                value={rejectPaymentReason}
                onChange={(e) => setRejectPaymentReason(e.target.value)}
                placeholder="The payment proof is unclear or doesn't match the expected amount..."
                className="mt-1"
                data-testid="input-reject-payment-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectPaymentDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => rejectPaymentMutation.mutate()}
              disabled={!rejectPaymentReason.trim() || rejectPaymentMutation.isPending}
              data-testid="button-submit-reject-payment"
            >
              {rejectPaymentMutation.isPending ? "Rejecting..." : "Reject Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
