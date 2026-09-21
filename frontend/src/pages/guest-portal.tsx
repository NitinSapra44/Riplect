import { useState, useMemo, useEffect, useRef } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Calendar as CalendarIcon, Clock, User, Mail, Phone, MapPin, X, RefreshCw, ExternalLink, AlertCircle, CalendarDays, ShoppingBag, Package, BookOpen, BarChart3, ArrowRight, Globe, ChevronDown, ChevronUp, ArrowLeft, DollarSign, Send, MessageSquare, CreditCard, Upload, CheckCircle2, FileText, Download, Loader2 } from "lucide-react";
import { compressImage } from "@/lib/imageCompression";
import { PaymentMethodOffered, getMethodLabel, getMethodIcon, renderMethodDetails } from "@/components/payment-method-details";

const toDateOnly = (dateStr: string) => dateStr ? dateStr.split('T')[0] : dateStr;
const safeDate = (value: unknown): Date | null => {
  if (!value) return null;
  const d = new Date(value as string | number);
  return isNaN(d.getTime()) ? null : d;
};
const safeFormat = (value: unknown, fmt: string, fallback = 'Date not set'): string => {
  const d = safeDate(value);
  if (!d) return fallback;
  try { return format(d, fmt); } catch { return fallback; }
};
import { Calendar } from "@/components/ui/calendar";
import { formatTimezoneShort, getBrowserTimezone, formatTime24to12, formatTime12to24, convertTimeBetweenTimezones } from "@/lib/timezone-utils";
import { useToast } from "@/hooks/use-toast";
import { PageLoading } from "@/components/page-loading";
import { BookingTimeline } from "@/components/booking-timeline";
import { format, formatDistanceToNow } from "date-fns";
import riplectLogo1 from "@assets/Color_Variations_copy_9@144x-2_1775978761578.png";

interface BookingMessage {
  id: number;
  bookingId: number;
  senderType: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

function GuestBookingDetail({ booking, coach, accessToken, onBack, onCancel, onReschedule, onMarkPaid }: { booking: BookingData; coach: Coach | null; accessToken: string; onBack: () => void; onCancel?: (booking: BookingData) => void; onReschedule?: (booking: BookingData) => void; onMarkPaid?: (booking: BookingData) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newMessage, setNewMessage] = useState("");

  const { data: messages = [] } = useQuery<BookingMessage[]>({
    queryKey: ["/api/guest", accessToken, "bookings", booking.id, "messages"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/guest/${accessToken}/bookings/${booking.id}/messages`);
      return res.json();
    },
    refetchOnWindowFocus: true,
    refetchInterval: 5 * 1000,
    refetchIntervalInBackground: false,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/guest/${accessToken}/bookings/${booking.id}/messages`, {
        message: newMessage.trim(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/guest", accessToken, "bookings", booking.id, "messages"] });
      queryClient.invalidateQueries({ queryKey: [`/api/guest/${accessToken}`] });
      setNewMessage("");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to send message", variant: "destructive" });
    },
  });

  const getStatusBadge = (status: string) => {
    if (status === 'cancelled') return <Badge variant="destructive">Cancelled</Badge>;
    if (status === 'declined') return <Badge variant="destructive">Declined</Badge>;
    if (status === 'confirmed') return <Badge className="bg-emerald-500 border-emerald-600">Confirmed</Badge>;
    if (status === 'completed') return <Badge className="bg-emerald-500 border-emerald-600">Completed</Badge>;
    if (status === 'pending') return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Pending</Badge>;
    return <Badge>{status}</Badge>;
  };

  const within24Hours = (() => {
    const bookingDateTime = safeDate(`${toDateOnly(booking.bookingDate)}T${booking.bookingTime}`);
    if (!bookingDateTime) return false;
    const now = new Date();
    return (bookingDateTime.getTime() - now.getTime()) / (1000 * 60 * 60) < 24;
  })();
  const isUpcoming = (safeDate(booking.bookingDate) || new Date(0)) >= new Date();
  const isActiveBooking = !['cancelled', 'declined', 'completed'].includes(booking.status) && isUpcoming;
  const canTakeAction = isActiveBooking && !within24Hours;

  return (
    <Card className="border-0 shadow-lg overflow-visible">
      <CardContent className="p-0">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-[#b66667]/15 bg-[#FDF6EE]/30">
          <Button variant="ghost" size="icon" onClick={onBack} className="text-[#C96868]" data-testid="button-back-to-bookings">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-gray-900 truncate">{booking.session?.title || 'Session'}</h3>
            {coach && <p className="text-xs text-gray-500">with {coach.displayName}</p>}
          </div>
          {getStatusBadge(booking.status)}
        </div>

        <div className="p-5 space-y-5">
          <div className="space-y-3">
            {coach && (
              <div className="flex items-center gap-3 mb-2">
                <Link href={`/${coach.username}`}>
                  <Avatar className="w-10 h-10 cursor-pointer ring-2 ring-[#b66667]/10">
                    {coach.profileImageUrl ? (
                      <AvatarImage src={coach.profileImageUrl} alt={coach.displayName} />
                    ) : (
                      <AvatarFallback className="bg-[#b66667]/10 text-[#b66667] font-semibold">{coach.displayName.charAt(0).toUpperCase()}</AvatarFallback>
                    )}
                  </Avatar>
                </Link>
                <div>
                  <Link href={`/${coach.username}`}>
                    <span className="text-sm font-medium text-[#b66667] cursor-pointer">{coach.displayName}</span>
                  </Link>
                  <p className="text-xs text-gray-400">@{coach.username}</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <CalendarIcon className="w-4 h-4 text-[#C96868]/60 flex-shrink-0" />
                <span>{safeFormat(booking.bookingDate, "EEEE, MMMM dd, yyyy")}</span>
                {booking.rescheduledFrom && (
                  <Badge variant="outline" className="text-[10px] border-amber-200 text-amber-700 bg-amber-50">Rescheduled</Badge>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <Clock className="w-4 h-4 text-[#C96868]/60 flex-shrink-0" />
                {(() => {
                  const guestTz = getBrowserTimezone();
                  const coachTz = coach?.timezone;
                  const dateOnly = toDateOnly(booking.bookingDate);
                  if (coachTz && guestTz !== coachTz) {
                    const time24 = formatTime12to24(booking.bookingTime);
                    const converted = convertTimeBetweenTimezones(time24, dateOnly, coachTz, guestTz);
                    const guestTime12 = formatTime24to12(converted.time);
                    const dayLabel = converted.dateChanged ? (converted.date > dateOnly ? ' (+1d)' : ' (-1d)') : '';
                    return (
                      <>
                        <span>{guestTime12}{dayLabel} {booking.session?.duration ? `(${booking.session.duration} min)` : ''}</span>
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <Globe className="w-3 h-3" />
                          {formatTimezoneShort(guestTz)}
                        </span>
                        <span className="text-xs text-gray-400">({booking.bookingTime} {formatTimezoneShort(coachTz)})</span>
                      </>
                    );
                  }
                  return (
                    <>
                      <span>{booking.bookingTime} {booking.session?.duration ? `(${booking.session.duration} min)` : ''}</span>
                      {coachTz && (
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <Globe className="w-3 h-3" />
                          {formatTimezoneShort(coachTz)}
                        </span>
                      )}
                    </>
                  );
                })()}
              </div>
              {booking.sessionMode && (
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <MapPin className="w-4 h-4 text-[#C96868]/60 flex-shrink-0" />
                  <span>{booking.sessionMode === 'offline' ? 'In-Person' : 'Online'}</span>
                </div>
              )}
              {booking.session?.price && (
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <DollarSign className="w-4 h-4 text-[#C96868]/60 flex-shrink-0" />
                  <span>{booking.session.currency || 'USD'} {booking.session.price}</span>
                </div>
              )}
            </div>

            <div className="text-xs text-gray-400">
              Confirmation: <span className="font-mono">{booking.confirmationCode}</span>
            </div>

            {booking.paymentStatus === 'requested' && !['cancelled', 'declined'].includes(booking.status) && (
              <div className="bg-orange-50 border border-orange-200 rounded-md p-4 space-y-3" data-testid={`detail-payment-section-${booking.id}`}>
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-orange-600" />
                  <h4 className="text-sm font-semibold text-orange-800">Payment Required</h4>
                </div>
                {booking.paymentRejectionReason && (
                  <div className="bg-red-50 border border-red-200 rounded-md p-3" data-testid={`rejection-reason-${booking.id}`}>
                    <p className="text-sm text-red-800 font-medium">Your previous payment proof was not accepted:</p>
                    <p className="text-sm text-red-700 mt-1">{booking.paymentRejectionReason}</p>
                    <p className="text-xs text-red-600 mt-1">Please resubmit your payment proof.</p>
                  </div>
                )}
                {!booking.paymentRejectionReason && (
                  <p className="text-sm text-orange-700">Please select a payment method and complete your payment.</p>
                )}
                {onMarkPaid && (
                  <Button
                    size="sm"
                    className="bg-orange-600 text-white border-orange-700"
                    onClick={() => onMarkPaid(booking)}
                    data-testid={`button-detail-mark-paid-${booking.id}`}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    I Have Completed Payment
                  </Button>
                )}
              </div>
            )}

            {booking.paymentStatus === 'proof_uploaded' && (
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <p className="text-sm text-blue-800">Payment proof submitted. Awaiting verification by your coach.</p>
                </div>
              </div>
            )}

            {booking.paymentStatus === 'verified' && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-md p-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <p className="text-sm text-emerald-800">Payment has been verified.</p>
                </div>
              </div>
            )}

            {booking.status === 'confirmed' && (
              booking.meetingLink ? (
                <a
                  href={booking.meetingLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-medium text-[#b66667] bg-[#FDF6EE] border border-[#b66667]/10 px-3 py-2 rounded-md"
                  data-testid={`link-meeting-detail-${booking.id}`}
                >
                  <ExternalLink className="w-4 h-4" />
                  Join Meeting
                  <ArrowRight className="w-3 h-3" />
                </a>
              ) : (
                <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 border border-gray-200 px-3 py-2 rounded-md" data-testid={`text-meeting-link-pending-${booking.id}`}>
                  <ExternalLink className="w-4 h-4 text-gray-400" />
                  Meeting link will be shared by your coach
                </div>
              )
            )}

            {booking.status === 'confirmed' && (safeDate(booking.bookingDate) || new Date(0)) >= new Date() && (() => {
              const startDate = safeDate(`${toDateOnly(booking.bookingDate)}T${booking.bookingTime}`);
              if (!startDate) return null;
              const duration = booking.session?.duration || 60;
              const endDate = new Date(startDate.getTime() + duration * 60 * 1000);
              const formatGCalDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
              const params = new URLSearchParams({
                action: 'TEMPLATE',
                text: encodeURIComponent(booking.session?.title || 'Session'),
                dates: `${formatGCalDate(startDate)}/${formatGCalDate(endDate)}`,
                details: encodeURIComponent(`Session with ${coach?.displayName || 'your coach'}${booking.meetingLink ? `\n\nMeeting Link: ${booking.meetingLink}` : ''}\n\nConfirmation: ${booking.confirmationCode}`),
              });
              if (booking.sessionMode === 'online' && booking.meetingLink) {
                params.set('location', encodeURIComponent(booking.meetingLink));
              }
              return (
                <a
                  href={`https://calendar.google.com/calendar/render?${params.toString()}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-medium text-[#b66667] bg-[#FDF6EE] border border-[#b66667]/10 px-3 py-2 rounded-md"
                  data-testid={`link-detail-add-calendar-${booking.id}`}
                >
                  <CalendarIcon className="w-4 h-4" />
                  Add to Google Calendar
                </a>
              );
            })()}

            {booking.coachMessage && (
              <div className="bg-[#FDF6EE] border border-[#b66667]/10 rounded-md p-3">
                <p className="text-xs font-medium text-gray-600 mb-1">Message from {coach?.displayName || 'Coach'}</p>
                <p className="text-sm text-gray-700">{booking.coachMessage}</p>
              </div>
            )}

            {booking.cancellationReason && (
              <div className="bg-red-50 border border-red-100 rounded-md p-3">
                <p className="text-xs font-medium text-red-700 mb-1">
                  {booking.cancelledBy === 'client' ? 'Your cancellation reason' : `Cancelled by ${coach?.displayName || 'Coach'}`}
                </p>
                <p className="text-sm text-red-600">{booking.cancellationReason}</p>
              </div>
            )}
          </div>

          {isActiveBooking && (
            <>
              <Separator className="bg-[#b66667]/10" />
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-[#C96868] uppercase tracking-wider">Actions</h4>
                {within24Hours ? (
                  <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-100 p-2.5 rounded-md">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>Changes cannot be made within 24 hours of your session. Please contact your coach directly.</span>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {onReschedule && !booking.guestRescheduleUsed && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-[#b66667]/20 text-[#b66667]"
                        onClick={() => onReschedule(booking)}
                        data-testid={`button-detail-reschedule-${booking.id}`}
                      >
                        <RefreshCw className="w-4 h-4 mr-1" />
                        Reschedule
                      </Button>
                    )}
                    {booking.guestRescheduleUsed && (
                      <span className="text-xs text-gray-500 italic" data-testid={`text-detail-reschedule-used-${booking.id}`}>Reschedule already used</span>
                    )}
                    {onCancel && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-red-200 text-red-600"
                        onClick={() => onCancel(booking)}
                        data-testid={`button-detail-cancel-${booking.id}`}
                      >
                        <X className="w-4 h-4 mr-1" />
                        Cancel
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          <Separator className="bg-[#b66667]/10" />

          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-[#C96868] uppercase tracking-wider">Timeline</h4>
            <BookingTimeline bookingId={booking.id} apiPrefix={`/api/guest/${accessToken}`} coachTimezone={coach?.timezone || undefined} />
          </div>

          <Separator className="bg-[#b66667]/10" />

          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-[#C96868] uppercase tracking-wider flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5" />
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
                      msg.senderType === "guest"
                        ? "bg-[#C96868]/5 border border-[#b66667]/10 ml-4"
                        : "bg-gray-50 border border-gray-100 mr-4"
                    }`}
                    data-testid={`guest-message-${msg.id}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-medium text-gray-500">
                        {msg.senderType === "guest" ? "You" : coach?.displayName || "Coach"}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {safeFormat(msg.createdAt, "MMM dd, h:mm a", "")}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 break-words whitespace-pre-wrap">{msg.message}</p>
                  </div>
                ))}
              </div>
            )}

            {!['cancelled', 'declined'].includes(booking.status) && (
              <div className="flex gap-2">
                <Textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Send a message to your coach..."
                  className="text-sm min-h-[60px] resize-none border-[#b66667]/15 focus-visible:ring-[#C96868]/30"
                  data-testid="input-guest-booking-message"
                />
                <Button
                  size="icon"
                  onClick={() => sendMessageMutation.mutate()}
                  disabled={!newMessage.trim() || sendMessageMutation.isPending}
                  className="flex-shrink-0 self-end bg-[#C96868] text-white border-[#b66667]"
                  data-testid="button-guest-send-message"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface MentorAvailability {
  id: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
}

interface BlockedDate {
  id: number;
  blockedDate: string;
  reason: string | null;
}

interface GuestProfile {
  id: number;
  accessToken: string;
  email: string;
  name: string;
  phone: string | null;
  originCoachId: string | null;
  createdAt: string;
}

interface Coach {
  id: string;
  displayName: string;
  username: string;
  profileImageUrl: string | null;
  timezone: string | null;
}

interface BookingSession {
  id: number;
  title: string;
  description: string | null;
  duration: number;
  price: string;
  currency: string;
}

interface BookingData {
  id: number;
  sessionId: number;
  clientName: string;
  clientEmail: string;
  clientPhone: string | null;
  bookingDate: string;
  bookingTime: string;
  status: string;
  confirmationCode: string;
  coachMessage: string | null;
  meetingLink: string | null;
  sessionMode: string | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  cancelledAt: string | null;
  rescheduledFrom: string | null;
  rescheduledBy: string | null;
  paymentStatus: string;
  paymentMethodSelected: string | null;
  paymentMethodsOffered: PaymentMethodOffered[] | null;
  paymentInstruction: string | null;
  paymentMarkedAt: string | null;
  paymentConfirmedAt: string | null;
  paymentProofUrl: string | null;
  paymentReferenceText: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  session: BookingSession | null;
  guestRescheduleUsed?: boolean;
  paymentRejectionReason?: string | null;
}

function getGuestActionTimestamp(booking: BookingData): { label: string; date: string | null } {
  if (booking.paymentStatus === "verified") {
    return { label: "Payment verified", date: booking.paymentConfirmedAt || booking.updatedAt };
  }
  if (booking.paymentStatus === "proof_uploaded") {
    return { label: "Proof sent", date: booking.paymentMarkedAt || booking.updatedAt };
  }
  if (booking.paymentStatus === "requested") {
    return { label: "Payment requested", date: booking.updatedAt };
  }
  if (booking.status === "confirmed" && booking.rescheduledBy === "client") {
    return { label: "Reschedule requested", date: booking.updatedAt };
  }
  if (booking.status === "confirmed") {
    return { label: "Confirmed", date: booking.updatedAt };
  }
  if (booking.status === "pending") {
    return { label: "Booked", date: booking.createdAt };
  }
  if (booking.status === "cancelled") {
    return { label: "Cancelled", date: booking.cancelledAt || booking.updatedAt };
  }
  if (booking.status === "declined") {
    return { label: "Declined", date: booking.updatedAt };
  }
  if (booking.status === "completed") {
    return { label: "Completed", date: booking.updatedAt };
  }
  return { label: "", date: booking.updatedAt };
}

interface EventData {
  id: number;
  title: string;
  description: string | null;
  startAt?: string | null;
  endAt?: string | null;
  date?: string;
  startTime?: string | null;
  endTime?: string | null;
  location: string | null;
  price: string;
  pricingType?: 'free' | 'donation' | 'paid' | null;
  requiresPayment?: boolean;
  isFree?: boolean;
}

interface EventRegistrationData {
  id: number;
  eventId: number;
  clientName: string;
  clientEmail: string;
  status: string;
  confirmationCode: string;
  paymentStatus: string;
  paymentMethodSelected: string | null;
  paymentMethodsOffered: any[] | null;
  paymentInstruction: string | null;
  paymentProofUrl: string | null;
  paymentReferenceText: string | null;
  paymentMarkedAt: string | null;
  paymentRejectionReason: string | null;
  event: EventData | null;
}

interface ProductData {
  id: number;
  title: string;
  description: string | null;
  price: string;
  productType: string;
  requiresPayment: boolean;
  paymentInstructions: string | null;
  isFree: boolean;
  fileName: string | null;
}

interface PurchaseData {
  id: number;
  productId: number;
  email: string;
  amount: string;
  status: string;
  accessToken: string | null;
  buyerName: string | null;
  currency: string;
  downloadCount: number;
  paymentMethodSelected: string | null;
  paymentMethodsOffered: any[] | null;
  paymentInstruction: string | null;
  paymentProofUrl: string | null;
  paymentReferenceText: string | null;
  paymentMarkedAt: string | null;
  paymentRejectionReason: string | null;
  product: ProductData | null;
}

interface ActivityItem {
  type: 'booking' | 'event' | 'purchase';
  id: number;
  date: string | null;
  status: string;
  title: string;
  coach: Coach | null;
  data: BookingData | EventRegistrationData | PurchaseData;
  unreadMessageCount?: number;
}

interface GuestPortalData {
  guestProfile: GuestProfile;
  originCoach: Coach | null;
  activityFeed: ActivityItem[];
  bookings: ActivityItem[];
  eventRegistrations: ActivityItem[];
  purchases: ActivityItem[];
  stats: {
    totalBookings: number;
    totalEvents: number;
    totalPurchases: number;
  };
}

export default function GuestPortal() {
  const { accessToken } = useParams<{ accessToken: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedBooking, setSelectedBooking] = useState<BookingData | null>(null);
  const [expandedTimeline, setExpandedTimeline] = useState<number | null>(null);
  const [selectedCoachTimezone, setSelectedCoachTimezone] = useState<string | null>(null);
  const [detailBookingItem, setDetailBookingItem] = useState<ActivityItem | null>(null);
  const [deepLinkApplied, setDeepLinkApplied] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [rescheduleSelectedDate, setRescheduleSelectedDate] = useState<Date | undefined>(undefined);
  const [rescheduleSelectedTime, setRescheduleSelectedTime] = useState("");
  const [rescheduleMessage, setRescheduleMessage] = useState("");
  const [rescheduleCoachUsername, setRescheduleCoachUsername] = useState<string | null>(null);
  const [markPaidDialogOpen, setMarkPaidDialogOpen] = useState(false);
  const [markPaidBooking, setMarkPaidBooking] = useState<BookingData | null>(null);
  const [paymentReferenceText, setPaymentReferenceText] = useState("");
  const [paymentProofUrl, setPaymentProofUrl] = useState("");
  const [proofImageFile, setProofImageFile] = useState<File | null>(null);
  const [proofImagePreview, setProofImagePreview] = useState<string | null>(null);
  const [isUploadingProofImage, setIsUploadingProofImage] = useState(false);
  const [uploadedProofUrl, setUploadedProofUrl] = useState<string | null>(null);
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<Record<number, string>>({});
  const [downloadingPurchaseId, setDownloadingPurchaseId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState("sessions");
  const [highlightedRegistrationId, setHighlightedRegistrationId] = useState<number | null>(null);
  const [highlightedPurchaseId, setHighlightedPurchaseId] = useState<number | null>(null);
  // Event registration payment proof state
  const [regMarkPaidId, setRegMarkPaidId] = useState<number | null>(null);
  const [regPaymentRefText, setRegPaymentRefText] = useState("");
  const [regPaymentProofUrl, setRegPaymentProofUrl] = useState("");
  const [regSelectedMethod, setRegSelectedMethod] = useState<string | null>(null);
  const [regProofImageFile, setRegProofImageFile] = useState<File | null>(null);
  const [regProofImagePreview, setRegProofImagePreview] = useState<string | null>(null);
  const [isUploadingRegProof, setIsUploadingRegProof] = useState(false);
  const [regUploadedProofUrl, setRegUploadedProofUrl] = useState<string | null>(null);
  // Product purchase payment proof state
  const [purchMarkPaidId, setPurchMarkPaidId] = useState<number | null>(null);
  const [purchPaymentRefText, setPurchPaymentRefText] = useState("");
  const [purchPaymentProofUrl, setPurchPaymentProofUrl] = useState("");
  const [purchSelectedMethod, setPurchSelectedMethod] = useState<string | null>(null);
  const [purchProofImageFile, setPurchProofImageFile] = useState<File | null>(null);
  const [purchProofImagePreview, setPurchProofImagePreview] = useState<string | null>(null);
  const [isUploadingPurchProof, setIsUploadingPurchProof] = useState(false);
  const [purchUploadedProofUrl, setPurchUploadedProofUrl] = useState<string | null>(null);
  // Upload request ID refs to guard against stale async results
  const proofUploadIdRef = useRef(0);
  const regProofUploadIdRef = useRef(0);
  const purchProofUploadIdRef = useRef(0);

  const { data, isLoading, error } = useQuery<GuestPortalData>({
    queryKey: [`/api/guest/${accessToken}`],
    enabled: !!accessToken,
    refetchOnWindowFocus: true,
    refetchInterval: 5 * 1000,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    if (data && !deepLinkApplied) {
      const params = new URLSearchParams(window.location.search);
      const bookingIdParam = params.get("booking");
      const registrationIdParam = params.get("registration");
      const purchaseIdParam = params.get("purchase");
      if (bookingIdParam) {
        const bookingId = parseInt(bookingIdParam, 10);
        const matchingItem = data.bookings?.find(
          (item: ActivityItem) => item.type === 'booking' && item.id === bookingId
        );
        if (matchingItem) {
          setActiveTab("sessions");
          setDetailBookingItem(matchingItem);
        }
      } else if (registrationIdParam) {
        const registrationId = parseInt(registrationIdParam, 10);
        const matchingItem = data.eventRegistrations?.find(
          (item: ActivityItem) => item.type === 'event' && item.id === registrationId
        );
        if (matchingItem) {
          setActiveTab("events");
          setHighlightedRegistrationId(registrationId);
          // Scroll to card after tab switch renders
          setTimeout(() => {
            const card = document.querySelector(`[data-testid="event-card-${registrationId}"]`);
            if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 200);
        }
      } else if (purchaseIdParam) {
        const purchaseId = parseInt(purchaseIdParam, 10);
        const matchingItem = data.purchases?.find(
          (item: ActivityItem) => item.type === 'purchase' && item.id === purchaseId
        );
        if (matchingItem) {
          setActiveTab("purchases");
          setHighlightedPurchaseId(purchaseId);
          // Scroll to card after tab switch renders
          setTimeout(() => {
            const card = document.querySelector(`[data-testid="purchase-card-${purchaseId}"]`);
            if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 200);
        }
      } else {
        const tabParam = params.get("tab");
        if (tabParam && ["sessions", "purchases", "events", "cancelled"].includes(tabParam)) {
          setActiveTab(tabParam);
        }
      }
      setDeepLinkApplied(true);
    }
  }, [data, deepLinkApplied]);

  const cancelMutation = useMutation({
    mutationFn: async ({ bookingId, reason }: { bookingId: number; reason: string }) => {
      return apiRequest("POST", `/api/guest/${accessToken}/bookings/${bookingId}/cancel`, { reason });
    },
    onSuccess: async () => {
      toast({ title: "Booking cancelled", description: "Your booking has been cancelled successfully." });
      await queryClient.invalidateQueries({ queryKey: [`/api/guest/${accessToken}`] });
      setCancelDialogOpen(false);
      setCancelReason("");
      setSelectedBooking(null);
    },
    onError: async (error: any) => {
      let msg = "Failed to cancel booking. Please try again.";
      try {
        if (error?.message) msg = error.message;
      } catch {}
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const rescheduleMutation = useMutation({
    mutationFn: async ({ bookingId, newDate, newTime, message }: { bookingId: number; newDate: string; newTime: string; message: string }) => {
      return apiRequest("POST", `/api/guest/${accessToken}/bookings/${bookingId}/reschedule`, { newDate, newTime, message });
    },
    onSuccess: async () => {
      toast({ title: "Reschedule requested", description: "Your reschedule request has been sent to the coach." });
      await queryClient.invalidateQueries({ queryKey: [`/api/guest/${accessToken}`] });
      setRescheduleDialogOpen(false);
      setRescheduleSelectedDate(undefined);
      setRescheduleSelectedTime("");
      setRescheduleMessage("");
      setSelectedBooking(null);
      setRescheduleCoachUsername(null);
    },
    onError: async (error: any) => {
      let msg = "Failed to reschedule booking. Please try again.";
      try {
        if (error?.message) msg = error.message;
      } catch {}
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async ({ bookingId, referenceText, proofUrl, selectedMethod, proofImageUrl }: { bookingId: number; referenceText: string; proofUrl: string; selectedMethod?: string | null; proofImageUrl?: string | null }) => {
      return apiRequest("POST", `/api/guest/${accessToken}/bookings/${bookingId}/mark-paid`, { referenceText, proofUrl, selectedMethod, proofImageUrl });
    },
    onSuccess: () => {
      toast({ title: "Payment confirmation submitted", description: "Your payment details have been sent to the coach for verification." });
      queryClient.invalidateQueries({ queryKey: [`/api/guest/${accessToken}`] });
      proofUploadIdRef.current++;
      setIsUploadingProofImage(false);
      setMarkPaidDialogOpen(false);
      setMarkPaidBooking(null);
      setPaymentReferenceText("");
      setPaymentProofUrl("");
      if (proofImagePreview) URL.revokeObjectURL(proofImagePreview);
      setProofImageFile(null);
      setProofImagePreview(null);
      setUploadedProofUrl(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to submit payment details. Please try again.", variant: "destructive" });
    },
  });

  const regMarkPaidMutation = useMutation({
    mutationFn: async ({ registrationId, referenceText, proofUrl, selectedMethod, proofImageUrl }: { registrationId: number; referenceText: string; proofUrl: string; selectedMethod?: string | null; proofImageUrl?: string | null }) => {
      return apiRequest("POST", `/api/guest/${accessToken}/registrations/${registrationId}/mark-paid`, { referenceText, proofUrl, selectedMethod, proofImageUrl });
    },
    onSuccess: () => {
      toast({ title: "Payment proof submitted", description: "Your payment details have been sent to the organizer for verification." });
      queryClient.invalidateQueries({ queryKey: [`/api/guest/${accessToken}`] });
      regProofUploadIdRef.current++;
      setIsUploadingRegProof(false);
      setRegMarkPaidId(null);
      setRegPaymentRefText("");
      setRegPaymentProofUrl("");
      setRegSelectedMethod(null);
      if (regProofImagePreview) URL.revokeObjectURL(regProofImagePreview);
      setRegProofImageFile(null);
      setRegProofImagePreview(null);
      setRegUploadedProofUrl(null);
    },
    onError: (_err, variables) => {
      const description = variables.proofImageUrl
        ? "Your screenshot was uploaded but we couldn't record your payment. Please try again."
        : "Failed to submit your payment details. Please try again.";
      toast({ title: "Submission failed", description, variant: "destructive" });
    },
  });

  const purchMarkPaidMutation = useMutation({
    mutationFn: async ({ purchaseId, referenceText, proofUrl, selectedMethod, proofImageUrl }: { purchaseId: number; referenceText: string; proofUrl: string; selectedMethod?: string | null; proofImageUrl?: string | null }) => {
      return apiRequest("POST", `/api/guest/${accessToken}/purchases/${purchaseId}/mark-paid`, { referenceText, proofUrl, selectedMethod, proofImageUrl });
    },
    onSuccess: () => {
      toast({ title: "Payment proof submitted", description: "Your payment details have been sent for verification." });
      queryClient.invalidateQueries({ queryKey: [`/api/guest/${accessToken}`] });
      purchProofUploadIdRef.current++;
      setIsUploadingPurchProof(false);
      setPurchMarkPaidId(null);
      setPurchPaymentRefText("");
      setPurchPaymentProofUrl("");
      setPurchSelectedMethod(null);
      if (purchProofImagePreview) URL.revokeObjectURL(purchProofImagePreview);
      setPurchProofImageFile(null);
      setPurchProofImagePreview(null);
      setPurchUploadedProofUrl(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to submit payment details. Please try again.", variant: "destructive" });
    },
  });

  const renderPaymentMethodSelection = (booking: BookingData) => {
    const methods = booking.paymentMethodsOffered;
    const hasStructuredMethods = methods && methods.length > 0;

    if (hasStructuredMethods) {
      return (
        <div className="space-y-2" data-testid={`payment-methods-list-${booking.id}`}>
          {methods.map((method) => (
            <div
              key={method.type}
              className={`border rounded-md p-3 cursor-pointer transition-colors ${
                selectedPaymentMethods[booking.id] === method.type
                  ? 'border-[#b66667] bg-[#FDF6EE]/50 ring-1 ring-[#b66667]/30'
                  : 'border-gray-200 bg-white'
              }`}
              onClick={() => setSelectedPaymentMethods(prev => ({ ...prev, [booking.id]: method.type }))}
              data-testid={`payment-method-option-${method.type}-${booking.id}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                  selectedPaymentMethods[booking.id] === method.type ? 'border-[#b66667]' : 'border-gray-300'
                }`}>
                  {selectedPaymentMethods[booking.id] === method.type && (
                    <div className="w-2 h-2 rounded-full bg-[#b66667]" />
                  )}
                </div>
                <span className="text-[#b66667]">{getMethodIcon(method.type)}</span>
                <span className="text-sm font-semibold text-gray-800">{getMethodLabel(method.type)}</span>
              </div>
              <div className={`space-y-0.5 ${method.type === 'upi' ? '' : 'pl-6'}`}>
                {renderMethodDetails(method)}
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (booking.paymentInstruction) {
      return (
        <div className="bg-white border border-orange-100 rounded-md p-3" data-testid={`payment-freeform-instructions-${booking.id}`}>
          <p className="text-xs font-medium text-gray-500 mb-1">Payment Instructions</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{booking.paymentInstruction}</p>
        </div>
      );
    }

    return null;
  };

  const { data: rescheduleAvailabilityData } = useQuery<{ availability: MentorAvailability[], blockedDates: BlockedDate[], timezone?: string }>({
    queryKey: ['/api/profiles', rescheduleCoachUsername, 'availability'],
    queryFn: async () => {
      const response = await fetch(`/api/profiles/${rescheduleCoachUsername}/availability`);
      if (!response.ok) {
        throw new Error('Failed to fetch availability');
      }
      return response.json();
    },
    enabled: !!rescheduleCoachUsername && rescheduleDialogOpen,
  });

  const rescheduleAvailability = rescheduleAvailabilityData?.availability || [];
  const rescheduleBlockedDates = rescheduleAvailabilityData?.blockedDates || [];
  const rescheduleCoachTimezoneFromApi = rescheduleAvailabilityData?.timezone || selectedCoachTimezone || "Asia/Kolkata";

  const visitorTimezone = getBrowserTimezone();
  const isRescheduleDifferentTimezone = rescheduleCoachTimezoneFromApi !== visitorTimezone;

  const rescheduleTimeSlots = useMemo(() => {
    if (!rescheduleSelectedDate || rescheduleAvailability.length === 0) {
      return [];
    }

    const dayOfWeek = rescheduleSelectedDate.getDay();
    const dayAvailability = rescheduleAvailability.filter(a => a.dayOfWeek === dayOfWeek && a.isActive);

    if (dayAvailability.length === 0) return [];

    const dateStr = `${rescheduleSelectedDate.getFullYear()}-${String(rescheduleSelectedDate.getMonth() + 1).padStart(2, '0')}-${String(rescheduleSelectedDate.getDate()).padStart(2, '0')}`;
    const slots: { coachTime24: string; displayTime: string; dateChanged: boolean }[] = [];

    dayAvailability.forEach(avail => {
      const [startHour, startMin] = avail.startTime.split(':').map(Number);
      const [endHour, endMin] = avail.endTime.split(':').map(Number);
      let currentHour = startHour;
      let currentMin = startMin;

      while (currentHour < endHour || (currentHour === endHour && currentMin < endMin)) {
        const time24 = `${currentHour.toString().padStart(2, '0')}:${currentMin.toString().padStart(2, '0')}`;

        if (isRescheduleDifferentTimezone) {
          const converted = convertTimeBetweenTimezones(time24, dateStr, rescheduleCoachTimezoneFromApi, visitorTimezone);
          slots.push({ coachTime24: time24, displayTime: formatTime24to12(converted.time), dateChanged: converted.dateChanged });
        } else {
          slots.push({ coachTime24: time24, displayTime: formatTime24to12(time24), dateChanged: false });
        }

        currentMin += 60;
        if (currentMin >= 60) {
          currentMin = 0;
          currentHour += 1;
        }
      }
    });

    return slots;
  }, [rescheduleSelectedDate, rescheduleAvailability, rescheduleCoachTimezoneFromApi, visitorTimezone, isRescheduleDifferentTimezone]);

  const rescheduleSelectedDateStr = rescheduleSelectedDate
    ? `${rescheduleSelectedDate.getFullYear()}-${String(rescheduleSelectedDate.getMonth() + 1).padStart(2, '0')}-${String(rescheduleSelectedDate.getDate()).padStart(2, '0')}`
    : null;

  const { data: rescheduleBookedSlotsData } = useQuery<{ bookingDate: string; bookingTime: string }[]>({
    queryKey: ['/api/sessions', selectedBooking?.sessionId, 'booked-slots', rescheduleSelectedDateStr],
    queryFn: async () => {
      const response = await fetch(
        `/api/sessions/${selectedBooking!.sessionId}/booked-slots?date=${rescheduleSelectedDateStr}`
      );
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!selectedBooking?.sessionId && !!rescheduleSelectedDateStr,
  });

  const rescheduleBookedTimes = new Set(
    (rescheduleBookedSlotsData || [])
      .filter(s => s.bookingDate === rescheduleSelectedDateStr)
      .map(s => s.bookingTime)
  );

  const isRescheduleDateDisabled = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (date < today) return true;

    const dateStr = date.toISOString().split('T')[0];
    const isBlocked = rescheduleBlockedDates.some(blocked => {
      const bd = safeDate(blocked.blockedDate);
      if (!bd) return false;
      const blockedDateStr = bd.toISOString().split('T')[0];
      return blockedDateStr === dateStr;
    });
    if (isBlocked) return true;

    if (rescheduleAvailability.length > 0) {
      const dayOfWeek = date.getDay();
      const hasAvailability = rescheduleAvailability.some(a => a.dayOfWeek === dayOfWeek && a.isActive);
      if (!hasAvailability) return true;
    }

    return false;
  };

  if (isLoading) {
    return <PageLoading />;
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#FDF6EE]/50 to-white p-4">
        <Card className="max-w-md w-full border-0 shadow-lg">
          <CardContent className="pt-8 pb-8 text-center">
            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-[#b66667]" />
            </div>
            <h2 className="text-xl font-semibold mb-2 text-gray-900">Invalid or Expired Link</h2>
            <p className="text-gray-500">
              This booking portal link is no longer valid. Please check your email for a valid link or contact your coach for assistance.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { guestProfile, bookings, eventRegistrations, purchases, stats } = data;
  
  const sortAsc = (a: ActivityItem, b: ActivityItem) => {
    const dateA = a.date ? new Date(a.date).getTime() : 0;
    const dateB = b.date ? new Date(b.date).getTime() : 0;
    return dateA - dateB;
  };
  const sortDesc = (a: ActivityItem, b: ActivityItem) => {
    const dateA = a.date ? new Date(a.date).getTime() : 0;
    const dateB = b.date ? new Date(b.date).getTime() : 0;
    return dateB - dateA;
  };
  const upcomingBookings = bookings.filter(b => {
    const bookingData = b.data as BookingData;
    return !['cancelled', 'declined'].includes(bookingData.status) && (safeDate(b.date) || new Date(0)) >= new Date();
  }).sort(sortAsc);
  const pastBookings = bookings.filter(b => {
    const bookingData = b.data as BookingData;
    return !['cancelled', 'declined'].includes(bookingData.status) && (safeDate(b.date) || new Date(0)) < new Date();
  }).sort(sortDesc);
  const cancelledBookings = bookings.filter(b => {
    const bookingData = b.data as BookingData;
    return bookingData.status === 'cancelled' || bookingData.status === 'declined';
  }).sort(sortDesc);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Date not set';
    const d = safeDate(dateStr);
    if (!d) return 'Date not set';
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getStatusBadge = (status: string, paymentStatus?: string) => {
    if (status === 'cancelled') {
      return <Badge variant="destructive">Cancelled</Badge>;
    }
    if (status === 'declined') {
      return <Badge variant="destructive">Declined</Badge>;
    }
    if (status === 'confirmed' || status === 'completed') {
      return <Badge className="bg-emerald-500 border-emerald-600">{status === 'completed' ? 'Completed' : 'Confirmed'}</Badge>;
    }
    if (status === 'pending') {
      return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Pending</Badge>;
    }
    return <Badge>{status}</Badge>;
  };

  const getPaymentStatusBadge = (paymentStatus: string) => {
    if (paymentStatus === 'requested') {
      return <Badge className="bg-orange-100 text-orange-800 border-orange-200"><CreditCard className="w-3 h-3 mr-1" />Payment Required</Badge>;
    }
    if (paymentStatus === 'proof_uploaded') {
      return <Badge className="bg-blue-100 text-blue-800 border-blue-200"><Upload className="w-3 h-3 mr-1" />Proof Submitted</Badge>;
    }
    if (paymentStatus === 'verified') {
      return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200"><CheckCircle2 className="w-3 h-3 mr-1" />Payment Verified</Badge>;
    }
    if (paymentStatus === 'paid') {
      return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200"><DollarSign className="w-3 h-3 mr-1" />Paid</Badge>;
    }
    return null;
  };

  const generateGoogleCalendarUrl = (booking: BookingData, coachName?: string): string | null => {
    const startDate = safeDate(`${toDateOnly(booking.bookingDate)}T${booking.bookingTime}`);
    if (!startDate) return null;
    const duration = booking.session?.duration || 60;
    const endDate = new Date(startDate.getTime() + duration * 60 * 1000);

    const formatGCalDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: encodeURIComponent(booking.session?.title || 'Session'),
      dates: `${formatGCalDate(startDate)}/${formatGCalDate(endDate)}`,
      details: encodeURIComponent(`Session with ${coachName || 'your coach'}${booking.meetingLink ? `\n\nMeeting Link: ${booking.meetingLink}` : ''}\n\nConfirmation: ${booking.confirmationCode}`),
    });

    if (booking.sessionMode === 'online' && booking.meetingLink) {
      params.set('location', encodeURIComponent(booking.meetingLink));
    }

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  };

  const handleCancel = (booking: BookingData, coachTimezone?: string | null) => {
    setSelectedBooking(booking);
    setSelectedCoachTimezone(coachTimezone || null);
    setCancelDialogOpen(true);
  };

  const handleReschedule = (booking: BookingData, coachTimezone?: string | null, coachUsername?: string | null) => {
    setSelectedBooking(booking);
    setSelectedCoachTimezone(coachTimezone || null);
    setRescheduleCoachUsername(coachUsername || null);
    setRescheduleSelectedDate(undefined);
    setRescheduleSelectedTime("");
    setRescheduleMessage("");
    setRescheduleDialogOpen(true);
  };

  const isWithin24Hours = (bookingDate: string, bookingTime: string) => {
    const bookingDateTime = safeDate(`${toDateOnly(bookingDate)}T${bookingTime}`);
    if (!bookingDateTime) return false;
    const now = new Date();
    const hoursUntilBooking = (bookingDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
    return hoursUntilBooking < 24;
  };

  const renderBookingCard = (item: ActivityItem) => {
    const booking = item.data as BookingData;
    const within24Hours = isWithin24Hours(booking.bookingDate, booking.bookingTime);
    const isUpcoming = (safeDate(booking.bookingDate) || new Date(0)) >= new Date();
    
    return (
      <Card key={`booking-${booking.id}`} className="border-0 shadow-lg mb-4 overflow-visible">
        <CardContent className="p-5">
          <div className="flex flex-row items-start justify-between gap-2 flex-wrap mb-3">
            <div className="flex items-center gap-3">
              {item.coach && (
                <Link href={`/${item.coach.username}`}>
                  <Avatar className="w-10 h-10 cursor-pointer ring-2 ring-[#b66667]/10">
                    {item.coach.profileImageUrl ? (
                      <AvatarImage src={item.coach.profileImageUrl} alt={item.coach.displayName} />
                    ) : (
                      <AvatarFallback className="bg-[#b66667]/10 text-[#b66667] font-semibold">{item.coach.displayName.charAt(0).toUpperCase()}</AvatarFallback>
                    )}
                  </Avatar>
                </Link>
              )}
              <div>
                <h3 className="font-semibold text-gray-900" data-testid={`text-booking-title-${booking.id}`}>{booking.session?.title || 'Session'}</h3>
                <p className="text-sm text-gray-500">
                  {item.coach && (
                    <Link href={`/${item.coach.username}`}>
                      <span className="text-[#b66667] cursor-pointer mr-2">with {item.coach.displayName}</span>
                    </Link>
                  )}
                  <span className="text-gray-400">#{booking.confirmationCode}</span>
                </p>
                {(() => {
                  const actionTs = getGuestActionTimestamp(booking);
                  const parsedDate = actionTs.date ? safeDate(actionTs.date) : null;
                  const timeAgo = parsedDate ? formatDistanceToNow(parsedDate, { addSuffix: true }) : null;
                  return actionTs.label && timeAgo ? (
                    <span className="text-[10px] text-gray-400" data-testid={`timestamp-guest-${booking.id}`}>
                      {actionTs.label} · {timeAgo}
                    </span>
                  ) : null;
                })()}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {getStatusBadge(booking.status)}
              {booking.rescheduledFrom && (
                <Badge variant="outline" className="text-[10px] border-amber-200 text-amber-700 bg-amber-50">Rescheduled</Badge>
              )}
              {booking.paymentStatus && booking.paymentStatus !== 'pending' && booking.paymentStatus !== 'paid' && getPaymentStatusBadge(booking.paymentStatus)}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 py-3 px-4 bg-gray-50 rounded-md mb-3">
            <div className="flex items-center gap-2 text-sm">
              <CalendarIcon className="w-4 h-4 text-[#b66667]" />
              <span className="text-gray-700">{formatDate(booking.bookingDate)}</span>
              {booking.rescheduledFrom && (
                <Badge variant="outline" className="text-xs border-amber-200 text-amber-700 bg-amber-50">Rescheduled</Badge>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4 text-[#b66667]" />
              {(() => {
                const guestTz = getBrowserTimezone();
                const coachTz = item.coach?.timezone;
                const dateOnly = toDateOnly(booking.bookingDate);
                if (coachTz && guestTz !== coachTz) {
                  const time24 = formatTime12to24(booking.bookingTime);
                  const converted = convertTimeBetweenTimezones(time24, dateOnly, coachTz, guestTz);
                  const guestTime12 = formatTime24to12(converted.time);
                  const dayLabel = converted.dateChanged ? (converted.date > dateOnly ? ' (+1d)' : ' (-1d)') : '';
                  return (
                    <>
                      <span className="text-gray-700">{guestTime12}{dayLabel}</span>
                      <span className="text-xs text-gray-400">({booking.bookingTime} {formatTimezoneShort(coachTz)})</span>
                    </>
                  );
                }
                return (
                  <>
                    <span className="text-gray-700">{booking.bookingTime}</span>
                    <span className="text-xs text-gray-400">({coachTz ? formatTimezoneShort(coachTz) : "coach's time"})</span>
                  </>
                );
              })()}
            </div>
            {booking.sessionMode && (
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="w-4 h-4 text-[#b66667]" />
                <span className="capitalize text-gray-700">{booking.sessionMode}</span>
              </div>
            )}
          </div>

          {booking.paymentStatus === 'requested' && !['cancelled', 'declined'].includes(booking.status) && (
            <div className="bg-orange-50 border border-orange-200 rounded-md p-4 mb-3 space-y-3" data-testid={`payment-section-${booking.id}`}>
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-orange-600" />
                <h4 className="text-sm font-semibold text-orange-800">Payment Required</h4>
              </div>
              {booking.paymentRejectionReason && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3" data-testid={`rejection-reason-card-${booking.id}`}>
                  <p className="text-sm text-red-800 font-medium">Your previous payment proof was not accepted:</p>
                  <p className="text-sm text-red-700 mt-1">{booking.paymentRejectionReason}</p>
                  <p className="text-xs text-red-600 mt-1">Please resubmit your payment proof.</p>
                </div>
              )}
              {renderPaymentMethodSelection(booking)}
              <Button
                size="sm"
                className="bg-orange-600 text-white border-orange-700"
                onClick={() => {
                  setMarkPaidBooking(booking);
                  setPaymentReferenceText("");
                  setPaymentProofUrl("");
                  setMarkPaidDialogOpen(true);
                }}
                disabled={!!(booking.paymentMethodsOffered && booking.paymentMethodsOffered.length > 0 && !selectedPaymentMethods[booking.id])}
                data-testid={`button-mark-paid-${booking.id}`}
              >
                <CheckCircle2 className="w-4 h-4 mr-1" />
                I Have Completed Payment
              </Button>
            </div>
          )}

          {booking.paymentStatus === 'proof_uploaded' && (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-3" data-testid={`payment-proof-status-${booking.id}`}>
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                <p className="text-sm text-blue-800">Your payment proof has been submitted and is awaiting verification by your coach.</p>
              </div>
            </div>
          )}

          {booking.meetingLink && booking.status === 'confirmed' && (
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <a 
                href={booking.meetingLink} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="inline-flex items-center gap-2 text-sm font-medium text-[#b66667]"
                data-testid={`link-meeting-${booking.id}`}
              >
                <ExternalLink className="w-4 h-4" />
                Join Meeting
                <ArrowRight className="w-3 h-3" />
              </a>
            </div>
          )}

          {booking.status === 'confirmed' && isUpcoming && (() => {
            const calUrl = generateGoogleCalendarUrl(booking, item.coach?.displayName);
            if (!calUrl) return null;
            return (
              <a
                href={calUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium text-[#b66667] bg-[#FDF6EE] border border-[#b66667]/10 px-3 py-2 rounded-md mb-3"
                data-testid={`link-add-calendar-${booking.id}`}
              >
                <CalendarIcon className="w-4 h-4" />
                Add to Google Calendar
              </a>
            );
          })()}

          {booking.coachMessage && (
            <div className="bg-[#FDF6EE] border border-[#b66667]/10 p-3 rounded-md mb-3">
              <p className="text-sm font-medium text-gray-700 mb-1">Message from {item.coach?.displayName || 'Coach'}:</p>
              <p className="text-sm text-gray-600">{booking.coachMessage}</p>
            </div>
          )}

          {booking.cancellationReason && (
            <div className="bg-red-50 border border-red-100 p-3 rounded-md mb-3">
              <p className="text-sm font-medium text-red-700 mb-1">Cancellation reason:</p>
              <p className="text-sm text-red-600">{booking.cancellationReason}</p>
            </div>
          )}

          {!['cancelled', 'declined', 'completed'].includes(booking.status) && isUpcoming && (
            <div className="space-y-2 pt-2 border-t border-gray-100">
              {within24Hours && (
                <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-100 p-2.5 rounded-md">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>Changes cannot be made within 24 hours of your session. Please contact your coach directly.</span>
                </div>
              )}
              {!within24Hours && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {booking.guestRescheduleUsed ? (
                    <span className="text-xs text-gray-500 italic" data-testid={`text-reschedule-used-${booking.id}`}>Reschedule already used</span>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-[#b66667]/20 text-[#b66667]"
                      onClick={() => handleReschedule(booking, item.coach?.timezone, item.coach?.username)}
                      data-testid={`button-reschedule-${booking.id}`}
                    >
                      <RefreshCw className="w-4 h-4 mr-1" />
                      Reschedule
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-red-200 text-red-600"
                    onClick={() => handleCancel(booking, item.coach?.timezone)}
                    data-testid={`button-cancel-${booking.id}`}
                  >
                    <X className="w-4 h-4 mr-1" />
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="pt-2 border-t border-gray-100 mt-3 flex items-center justify-between">
            <button
              onClick={() => setExpandedTimeline(expandedTimeline === booking.id ? null : booking.id)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground py-1"
              data-testid={`button-toggle-timeline-${booking.id}`}
            >
              {expandedTimeline === booking.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              <span>Booking History</span>
            </button>
            <Button
              variant="ghost"
              size="sm"
              className="text-[#b66667] text-xs h-7"
              onClick={() => setDetailBookingItem(item)}
              data-testid={`button-view-details-${booking.id}`}
            >
              View Details
              <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
          <div>
            {expandedTimeline === booking.id && (
              <BookingTimeline bookingId={booking.id} apiPrefix={`/api/guest/${accessToken}`} coachTimezone={item.coach?.timezone || undefined} />
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderEventCard = (item: ActivityItem) => {
    const registration = item.data as EventRegistrationData;
    const event = registration.event;
    const isHighlighted = highlightedRegistrationId === registration.id;
    const isMarkPaidOpen = regMarkPaidId === registration.id;
    const isPaidEvent = !!(event?.requiresPayment || (event?.price && parseFloat(event.price) > 0 && event?.pricingType !== 'free' && !event.isFree));
    const canSubmitProof = isPaidEvent && registration.status === 'confirmed' &&
      (registration.paymentStatus === 'pending' || registration.paymentStatus === 'requested');
    
    return (
      <Card key={`event-${registration.id}`} className={`border-0 shadow-lg mb-4 overflow-visible transition-all ${isHighlighted ? 'ring-2 ring-[#C96868]/40' : ''}`} data-testid={`event-card-${registration.id}`}>
        <CardContent className="p-5">
          <div className="flex flex-row items-start justify-between gap-2 flex-wrap mb-3">
            <div className="flex items-center gap-3">
              {item.coach && (
                <Link href={`/${item.coach.username}`}>
                  <Avatar className="w-10 h-10 cursor-pointer ring-2 ring-[#b66667]/10">
                    {item.coach.profileImageUrl ? (
                      <AvatarImage src={item.coach.profileImageUrl} alt={item.coach.displayName} />
                    ) : (
                      <AvatarFallback className="bg-[#b66667]/10 text-[#b66667] font-semibold">{item.coach.displayName.charAt(0).toUpperCase()}</AvatarFallback>
                    )}
                  </Avatar>
                </Link>
              )}
              <div>
                <h3 className="font-semibold text-gray-900 flex items-center gap-2" data-testid={`text-event-title-${registration.id}`}>
                  <CalendarDays className="w-4 h-4 text-[#b66667]" />
                  {event?.title || 'Event'}
                </h3>
                <p className="text-sm text-gray-500">
                  {item.coach && (
                    <Link href={`/${item.coach.username}`}>
                      <span className="text-[#b66667] cursor-pointer mr-2">by {item.coach.displayName}</span>
                    </Link>
                  )}
                  <span className="text-gray-400">#{registration.confirmationCode}</span>
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              {getStatusBadge(registration.status)}
              {registration.paymentStatus === 'proof_uploaded' && (
                <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-[10px] flex items-center gap-1"><Upload className="w-3 h-3" />Proof Submitted</Badge>
              )}
              {registration.paymentStatus === 'paid' && (
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px] flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Payment Verified</Badge>
              )}
              {(registration.paymentStatus === 'pending' || registration.paymentStatus === 'requested') && event?.price && parseFloat(event.price) > 0 && (
                <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px] flex items-center gap-1"><CreditCard className="w-3 h-3" />Payment Pending</Badge>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 py-3 px-4 bg-gray-50 rounded-md">
            <div className="flex items-center gap-2 text-sm">
              <CalendarIcon className="w-4 h-4 text-[#b66667]" />
              <span className="text-gray-700">{event?.startAt ? formatDate(event.startAt) : formatDate(event?.date || item.date)}</span>
            </div>
            {(() => {
              if (!event?.startAt) return event?.startTime ? (
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="w-4 h-4 text-[#b66667]" />
                  <span className="text-gray-700">{event.startTime}{event.endTime && ` - ${event.endTime}`}</span>
                  <span className="text-xs text-gray-400">({item.coach?.timezone ? formatTimezoneShort(item.coach.timezone) : "coach's time"})</span>
                </div>
              ) : null;
              const sd = new Date(event.startAt);
              if (!sd.getHours() && !sd.getMinutes()) return null;
              const sStr = sd.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
              const eStr = event.endAt ? (() => { const ed = new Date(event.endAt!); return (ed.getHours() || ed.getMinutes()) ? ed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null; })() : null;
              return (
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="w-4 h-4 text-[#b66667]" />
                  <span className="text-gray-700">{sStr}{eStr && ` - ${eStr}`}</span>
                </div>
              );
            })()}
            {event?.location && (
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="w-4 h-4 text-[#b66667]" />
                <span className="text-gray-700">{event.location}</span>
              </div>
            )}
          </div>

          {registration.paymentStatus === 'proof_uploaded' && (
            <div className="mt-3 p-3 bg-purple-50 border border-purple-100 rounded-md">
              <p className="text-sm font-medium text-purple-800 flex items-center gap-2"><Upload className="w-4 h-4" />Payment proof submitted — awaiting verification</p>
              {registration.paymentMarkedAt && <p className="text-xs text-purple-600 mt-0.5">Submitted {formatDistanceToNow(new Date(registration.paymentMarkedAt), { addSuffix: true })}</p>}
            </div>
          )}

          {registration.paymentRejectionReason && registration.paymentStatus === 'pending' && (
            <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded-md">
              <p className="text-sm font-medium text-red-800">Payment proof was rejected</p>
              <p className="text-sm text-red-700">{registration.paymentRejectionReason}</p>
              <p className="text-xs text-red-600 mt-1">Please submit a new proof below.</p>
            </div>
          )}

          {registration.paymentInstruction && registration.paymentStatus !== 'paid' && registration.paymentStatus !== 'proof_uploaded' && (
            <div className="mt-3 p-3 bg-amber-50 border border-amber-100 rounded-md">
              <p className="text-sm font-semibold text-amber-800 mb-1">Payment Instructions</p>
              <p className="text-sm text-amber-700 whitespace-pre-line">{registration.paymentInstruction}</p>
            </div>
          )}

          {canSubmitProof && (
            <div className="mt-3">
              <Button
                variant="outline"
                size="sm"
                className="border-[#b66667] text-[#b66667] hover:bg-red-50 gap-2"
                onClick={() => {
                  if (isMarkPaidOpen) {
                    regProofUploadIdRef.current++;
                    setIsUploadingRegProof(false);
                    setRegMarkPaidId(null);
                  } else {
                    setRegMarkPaidId(registration.id);
                    setRegPaymentRefText("");
                    setRegPaymentProofUrl("");
                    setRegSelectedMethod(null);
                    if (regProofImagePreview) URL.revokeObjectURL(regProofImagePreview);
                    setRegProofImageFile(null);
                    setRegProofImagePreview(null);
                    setRegUploadedProofUrl(null);
                  }
                }}
                data-testid={`button-submit-payment-proof-event-${registration.id}`}
              >
                <CreditCard className="w-4 h-4" />
                {isMarkPaidOpen ? 'Hide' : 'Submit Payment Proof'}
              </Button>

              {isMarkPaidOpen && (
                <div className="mt-3 space-y-3 p-4 border border-gray-100 rounded-md bg-gray-50">
                  {registration.paymentMethodsOffered && registration.paymentMethodsOffered.length > 0 && (
                    <div>
                      <Label className="text-sm font-medium">Select Payment Method</Label>
                      <div className="space-y-2 mt-2">
                        {registration.paymentMethodsOffered.map((method: any) => (
                          <div
                            key={method.type}
                            className={`border rounded-md p-3 cursor-pointer transition-colors ${regSelectedMethod === method.type ? 'border-[#b66667] bg-[#FDF6EE]/50 ring-1 ring-[#b66667]/30' : 'border-gray-200 bg-white'}`}
                            onClick={() => setRegSelectedMethod(method.type)}
                            data-testid={`reg-method-option-${method.type}-${registration.id}`}
                          >
                            <div className="flex items-center gap-2">
                              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${regSelectedMethod === method.type ? 'border-[#b66667]' : 'border-gray-300'}`}>
                                {regSelectedMethod === method.type && <div className="w-2 h-2 rounded-full bg-[#b66667]" />}
                              </div>
                              <span className="text-[#b66667]">{getMethodIcon(method.type)}</span>
                              <span className="text-sm font-semibold text-gray-800">{getMethodLabel(method.type)}</span>
                            </div>
                            {regSelectedMethod === method.type && (
                              <div className={`mt-1 space-y-0.5 ${method.type === 'upi' ? '' : 'pl-6'}`}>{renderMethodDetails(method)}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <Label htmlFor={`reg-ref-${registration.id}`} className="text-sm">Payment Reference / Transaction ID (optional)</Label>
                    <Input
                      id={`reg-ref-${registration.id}`}
                      value={regPaymentRefText}
                      onChange={(e) => setRegPaymentRefText(e.target.value)}
                      placeholder="e.g., Transaction #12345 or UPI Ref ID"
                      className="mt-1"
                      data-testid={`input-reg-payment-reference-${registration.id}`}
                    />
                  </div>
                  <div>
                    <Label className="text-sm">Upload Payment Screenshot (optional)</Label>
                    {regProofImagePreview ? (
                      <div className="mt-2 space-y-1">
                        <div className="relative inline-block">
                          <img src={regProofImagePreview} alt="Payment proof preview" className="max-h-36 rounded-md border border-gray-200" />
                          <button type="button" onClick={() => { regProofUploadIdRef.current++; if (regProofImagePreview) URL.revokeObjectURL(regProofImagePreview); setRegProofImageFile(null); setRegProofImagePreview(null); setRegUploadedProofUrl(null); setIsUploadingRegProof(false); }} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        {isUploadingRegProof && (
                          <p className="text-xs text-gray-500 flex items-center gap-1" data-testid={`status-reg-uploading-${registration.id}`}><Loader2 className="w-3 h-3 animate-spin" />Uploading...</p>
                        )}
                      </div>
                    ) : (
                      <label className="mt-2 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-md p-4 cursor-pointer hover:border-[#b66667]/40 hover:bg-[#FDF6EE]/30 transition-colors">
                        <Upload className="w-5 h-5 text-gray-400" />
                        <span className="text-sm text-gray-500">Click to upload a screenshot</span>
                        <input type="file" accept="image/jpeg,image/jpg,image/png,image/webp" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 25 * 1024 * 1024) { toast({ title: "File too large", description: "Max 25MB", variant: "destructive" }); return; } const uploadId = ++regProofUploadIdRef.current; const compressed = await compressImage(file); if (uploadId !== regProofUploadIdRef.current) return; setRegProofImageFile(compressed); setRegProofImagePreview(URL.createObjectURL(compressed)); setRegUploadedProofUrl(null); setIsUploadingRegProof(true); try { const formData = new FormData(); formData.append('file', compressed); const response = await fetch(`/api/guest/${accessToken}/upload-payment-proof`, { method: 'POST', body: formData }); if (!response.ok) throw new Error('Upload failed'); const result = await response.json(); if (uploadId === regProofUploadIdRef.current) setRegUploadedProofUrl(result.url); } catch { if (uploadId === regProofUploadIdRef.current) { toast({ title: "Upload failed", description: "Failed to upload your screenshot. Please try again.", variant: "destructive" }); setRegProofImageFile(null); setRegProofImagePreview(null); } } finally { if (uploadId === regProofUploadIdRef.current) setIsUploadingRegProof(false); } }} data-testid={`input-reg-proof-image-${registration.id}`} />
                      </label>
                    )}
                  </div>
                  <div>
                    <Label htmlFor={`reg-proof-url-${registration.id}`} className="text-sm">Or paste a proof URL (optional)</Label>
                    <Input id={`reg-proof-url-${registration.id}`} value={regPaymentProofUrl} onChange={(e) => setRegPaymentProofUrl(e.target.value)} placeholder="Link to screenshot or receipt" className="mt-1" data-testid={`input-reg-proof-url-${registration.id}`} />
                  </div>
                  {(() => {
                    const hasProof = !!(regProofImageFile || regUploadedProofUrl || regPaymentProofUrl.trim() || regPaymentRefText.trim());
                    return (
                      <div className="space-y-2 pt-1">
                        {!hasProof && (
                          <p className="text-xs text-amber-600" data-testid={`hint-reg-proof-required-${registration.id}`}>
                            Please provide at least one of: a screenshot, a proof URL, or a reference number.
                          </p>
                        )}
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => { regProofUploadIdRef.current++; setIsUploadingRegProof(false); setRegMarkPaidId(null); }}>Cancel</Button>
                          <Button
                            size="sm"
                            className="bg-[#b66667] text-white hover:bg-[#a05555]"
                            disabled={
                              !hasProof ||
                              (registration.paymentMethodsOffered && registration.paymentMethodsOffered.length > 0 && !regSelectedMethod) ||
                              regMarkPaidMutation.isPending || isUploadingRegProof
                            }
                            onClick={async () => {
                              let uploadedImageUrl: string | null = regUploadedProofUrl;
                              if (regProofImageFile && !regUploadedProofUrl) {
                                setIsUploadingRegProof(true);
                                try {
                                  const formData = new FormData();
                                  formData.append('file', regProofImageFile);
                                  const response = await fetch(`/api/guest/${accessToken}/upload-payment-proof`, { method: 'POST', body: formData });
                                  if (!response.ok) throw new Error('Upload failed');
                                  const result = await response.json();
                                  uploadedImageUrl = result.url;
                                  setRegUploadedProofUrl(result.url);
                                } catch {
                                  toast({ title: "Upload failed", description: "Failed to upload your screenshot. Please try again.", variant: "destructive" });
                                  setIsUploadingRegProof(false);
                                  return;
                                }
                                setIsUploadingRegProof(false);
                              }
                              regMarkPaidMutation.mutate({ registrationId: registration.id, referenceText: regPaymentRefText, proofUrl: regPaymentProofUrl, selectedMethod: regSelectedMethod, proofImageUrl: uploadedImageUrl });
                            }}
                            data-testid={`button-confirm-reg-payment-${registration.id}`}
                          >
                            {isUploadingRegProof ? 'Uploading...' : regMarkPaidMutation.isPending ? 'Submitting...' : 'Confirm Payment'}
                          </Button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const handleTokenDownload = async (purchaseId: number, token: string) => {
    setDownloadingPurchaseId(purchaseId);
    try {
      const response = await fetch(`/api/products/download-by-token?token=${encodeURIComponent(token)}`);

      if (!response.ok) {
        const errorText = await response.text();
        let errorMsg = "Download failed";
        try { errorMsg = JSON.parse(errorText).message || errorMsg; } catch {}
        throw new Error(errorMsg);
      }

      const contentDisposition = response.headers.get('content-disposition');
      let fileName = 'download';
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^";\n]+)"?/);
        if (match) fileName = decodeURIComponent(match[1]);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({ title: "Download started", description: "Your file is being downloaded." });
    } catch (error: unknown) {
      toast({
        title: "Download failed",
        description: error instanceof Error ? error.message : "Unable to download file",
        variant: "destructive",
      });
    } finally {
      setDownloadingPurchaseId(null);
    }
  };

  const getPurchaseStatusBadge_inline = (status: string) => {
    if (status === 'completed') return <Badge className="bg-[#C96868] border-[#b66667] text-white">Completed</Badge>;
    if (status === 'pending') return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Pending Payment</Badge>;
    if (status === 'proof_uploaded') return <Badge className="bg-purple-100 text-purple-700 border-purple-200">Proof Submitted</Badge>;
    if (status === 'refunded') return <Badge variant="destructive">Refunded</Badge>;
    return <Badge>{status}</Badge>;
  };

  const renderPurchaseCard = (item: ActivityItem) => {
    const purchase = item.data as PurchaseData;
    const product = purchase.product;
    const isHighlighted = highlightedPurchaseId === purchase.id;
    const isMarkPaidOpen = purchMarkPaidId === purchase.id;
    const canSubmitProof = purchase.status === 'pending' && product?.requiresPayment;
    
    const isCompleted = purchase.status === 'completed';

    return (
      <Card key={`purchase-${purchase.id}`} className={`border-0 shadow-lg mb-4 overflow-visible transition-all ${isCompleted ? 'ring-2 ring-[#C96868]/60' : isHighlighted ? 'ring-2 ring-[#C96868]/40' : ''}`} data-testid={`purchase-card-${purchase.id}`}>
        {isCompleted && (
          <div className="bg-[#C96868] text-white px-5 py-3 rounded-t-lg flex items-center gap-2" data-testid={`banner-download-ready-${purchase.id}`}>
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <span className="font-semibold text-sm">Your download is ready!</span>
          </div>
        )}
        <CardContent className="p-5">
          <div className="flex flex-row items-start justify-between gap-2 flex-wrap mb-3">
            <div className="flex items-center gap-3">
              {item.coach && (
                <Link href={`/${item.coach.username}`}>
                  <Avatar className="w-10 h-10 cursor-pointer ring-2 ring-[#b66667]/10">
                    {item.coach.profileImageUrl ? (
                      <AvatarImage src={item.coach.profileImageUrl} alt={item.coach.displayName} />
                    ) : (
                      <AvatarFallback className="bg-[#b66667]/10 text-[#b66667] font-semibold">{item.coach.displayName.charAt(0).toUpperCase()}</AvatarFallback>
                    )}
                  </Avatar>
                </Link>
              )}
              <div>
                <h3 className="font-semibold text-gray-900 flex items-center gap-2" data-testid={`text-purchase-title-${purchase.id}`}>
                  <Package className="w-4 h-4 text-[#b66667]" />
                  {product?.title || 'Product'}
                </h3>
                <p className="text-sm text-gray-500">
                  {item.coach && (
                    <Link href={`/${item.coach.username}`}>
                      <span className="text-[#b66667] cursor-pointer mr-2">by {item.coach.displayName}</span>
                    </Link>
                  )}
                  <span className="text-gray-400">{product?.productType || 'Digital Product'}</span>
                </p>
              </div>
            </div>
            {getPurchaseStatusBadge_inline(purchase.status)}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-3 px-4 bg-gray-50 rounded-md">
            <div className="flex items-center gap-2 text-sm">
              <ShoppingBag className="w-4 h-4 text-[#b66667]" />
              <span className="text-gray-700">Amount: {purchase.currency || 'USD'} {purchase.amount}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <CalendarIcon className="w-4 h-4 text-[#b66667]" />
              <span className="text-gray-700">Purchased: {formatDate(item.date)}</span>
            </div>
          </div>

          {purchase.status === 'proof_uploaded' && (
            <div className="mt-3 p-3 bg-purple-50 border border-purple-100 rounded-md">
              <p className="text-sm font-medium text-purple-800 flex items-center gap-2"><Upload className="w-4 h-4" />Payment proof submitted — awaiting verification</p>
              {purchase.paymentMarkedAt && <p className="text-xs text-purple-600 mt-0.5">Submitted {formatDistanceToNow(new Date(purchase.paymentMarkedAt), { addSuffix: true })}</p>}
            </div>
          )}

          {purchase.paymentRejectionReason && purchase.status === 'pending' && (
            <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded-md">
              <p className="text-sm font-medium text-red-800">Payment proof was rejected</p>
              <p className="text-sm text-red-700">{purchase.paymentRejectionReason}</p>
              <p className="text-xs text-red-600 mt-1">Please submit a new proof below.</p>
            </div>
          )}

          {purchase.status === 'pending' && (purchase.paymentInstruction || product?.paymentInstructions) && (
            <div className="mt-3 p-4 bg-amber-50 border border-amber-200 rounded-md">
              <p className="text-sm font-semibold text-amber-800 mb-1 flex items-center gap-2">
                <CreditCard className="w-4 h-4" />
                Payment Instructions
              </p>
              <p className="text-sm text-amber-700 whitespace-pre-line" data-testid={`text-payment-instructions-${purchase.id}`}>{purchase.paymentInstruction || product?.paymentInstructions}</p>
              <p className="text-xs text-amber-600 mt-2 italic">Once your payment is confirmed, your download will be unlocked.</p>
            </div>
          )}

          {canSubmitProof && (
            <div className="mt-3">
              <Button
                variant="outline"
                size="sm"
                className="border-[#b66667] text-[#b66667] hover:bg-red-50 gap-2"
                onClick={() => {
                  if (isMarkPaidOpen) {
                    purchProofUploadIdRef.current++;
                    setIsUploadingPurchProof(false);
                    setPurchMarkPaidId(null);
                  } else {
                    setPurchMarkPaidId(purchase.id);
                    setPurchPaymentRefText("");
                    setPurchPaymentProofUrl("");
                    setPurchSelectedMethod(null);
                    if (purchProofImagePreview) URL.revokeObjectURL(purchProofImagePreview);
                    setPurchProofImageFile(null);
                    setPurchProofImagePreview(null);
                    setPurchUploadedProofUrl(null);
                  }
                }}
                data-testid={`button-submit-payment-proof-purchase-${purchase.id}`}
              >
                <CreditCard className="w-4 h-4" />
                {isMarkPaidOpen ? 'Hide' : 'Submit Payment Proof'}
              </Button>

              {isMarkPaidOpen && (
                <div className="mt-3 space-y-3 p-4 border border-gray-100 rounded-md bg-gray-50">
                  {purchase.paymentMethodsOffered && purchase.paymentMethodsOffered.length > 0 && (
                    <div>
                      <Label className="text-sm font-medium">Select Payment Method</Label>
                      <div className="space-y-2 mt-2">
                        {purchase.paymentMethodsOffered.map((method: any) => (
                          <div
                            key={method.type}
                            className={`border rounded-md p-3 cursor-pointer transition-colors ${purchSelectedMethod === method.type ? 'border-[#b66667] bg-[#FDF6EE]/50 ring-1 ring-[#b66667]/30' : 'border-gray-200 bg-white'}`}
                            onClick={() => setPurchSelectedMethod(method.type)}
                            data-testid={`purch-method-option-${method.type}-${purchase.id}`}
                          >
                            <div className="flex items-center gap-2">
                              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${purchSelectedMethod === method.type ? 'border-[#b66667]' : 'border-gray-300'}`}>
                                {purchSelectedMethod === method.type && <div className="w-2 h-2 rounded-full bg-[#b66667]" />}
                              </div>
                              <span className="text-[#b66667]">{getMethodIcon(method.type)}</span>
                              <span className="text-sm font-semibold text-gray-800">{getMethodLabel(method.type)}</span>
                            </div>
                            {purchSelectedMethod === method.type && (
                              <div className={`mt-1 space-y-0.5 ${method.type === 'upi' ? '' : 'pl-6'}`}>{renderMethodDetails(method)}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <Label htmlFor={`purch-ref-${purchase.id}`} className="text-sm">Payment Reference / Transaction ID (optional)</Label>
                    <Input id={`purch-ref-${purchase.id}`} value={purchPaymentRefText} onChange={(e) => setPurchPaymentRefText(e.target.value)} placeholder="e.g., Transaction #12345 or UPI Ref ID" className="mt-1" data-testid={`input-purch-payment-reference-${purchase.id}`} />
                  </div>
                  <div>
                    <Label className="text-sm">Upload Payment Screenshot (optional)</Label>
                    {purchProofImagePreview ? (
                      <div className="mt-2 space-y-1">
                        <div className="relative inline-block">
                          <img src={purchProofImagePreview} alt="Payment proof preview" className="max-h-36 rounded-md border border-gray-200" />
                          <button type="button" onClick={() => { purchProofUploadIdRef.current++; if (purchProofImagePreview) URL.revokeObjectURL(purchProofImagePreview); setPurchProofImageFile(null); setPurchProofImagePreview(null); setPurchUploadedProofUrl(null); setIsUploadingPurchProof(false); }} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        {isUploadingPurchProof && (
                          <p className="text-xs text-gray-500 flex items-center gap-1" data-testid={`status-purch-uploading-${purchase.id}`}><Loader2 className="w-3 h-3 animate-spin" />Uploading...</p>
                        )}
                      </div>
                    ) : (
                      <label className="mt-2 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-md p-4 cursor-pointer hover:border-[#b66667]/40 hover:bg-[#FDF6EE]/30 transition-colors">
                        <Upload className="w-5 h-5 text-gray-400" />
                        <span className="text-sm text-gray-500">Click to upload a screenshot</span>
                        <input type="file" accept="image/jpeg,image/jpg,image/png,image/webp" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 25 * 1024 * 1024) { toast({ title: "File too large", description: "Max 25MB", variant: "destructive" }); return; } const uploadId = ++purchProofUploadIdRef.current; const compressed = await compressImage(file); if (uploadId !== purchProofUploadIdRef.current) return; setPurchProofImageFile(compressed); setPurchProofImagePreview(URL.createObjectURL(compressed)); setPurchUploadedProofUrl(null); setIsUploadingPurchProof(true); try { const formData = new FormData(); formData.append('file', compressed); const response = await fetch(`/api/guest/${accessToken}/upload-payment-proof`, { method: 'POST', body: formData }); if (!response.ok) throw new Error('Upload failed'); const result = await response.json(); if (uploadId === purchProofUploadIdRef.current) setPurchUploadedProofUrl(result.url); } catch { if (uploadId === purchProofUploadIdRef.current) { toast({ title: "Upload failed", description: "Failed to upload image.", variant: "destructive" }); setPurchProofImageFile(null); setPurchProofImagePreview(null); } } finally { if (uploadId === purchProofUploadIdRef.current) setIsUploadingPurchProof(false); } }} data-testid={`input-purch-proof-image-${purchase.id}`} />
                      </label>
                    )}
                  </div>
                  <div>
                    <Label htmlFor={`purch-proof-url-${purchase.id}`} className="text-sm">Or paste a proof URL (optional)</Label>
                    <Input id={`purch-proof-url-${purchase.id}`} value={purchPaymentProofUrl} onChange={(e) => setPurchPaymentProofUrl(e.target.value)} placeholder="Link to screenshot or receipt" className="mt-1" data-testid={`input-purch-proof-url-${purchase.id}`} />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" size="sm" onClick={() => { purchProofUploadIdRef.current++; setIsUploadingPurchProof(false); setPurchMarkPaidId(null); }}>Cancel</Button>
                    <Button
                      size="sm"
                      className="bg-[#b66667] text-white hover:bg-[#a05555]"
                      disabled={
                        (purchase.paymentMethodsOffered && purchase.paymentMethodsOffered.length > 0 && !purchSelectedMethod) ||
                        purchMarkPaidMutation.isPending || isUploadingPurchProof
                      }
                      onClick={() => {
                        purchMarkPaidMutation.mutate({ purchaseId: purchase.id, referenceText: purchPaymentRefText, proofUrl: purchPaymentProofUrl, selectedMethod: purchSelectedMethod, proofImageUrl: purchUploadedProofUrl });
                      }}
                      data-testid={`button-confirm-purch-payment-${purchase.id}`}
                    >
                      {isUploadingPurchProof ? 'Uploading...' : purchMarkPaidMutation.isPending ? 'Submitting...' : 'Confirm Payment'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {purchase.status === 'completed' && purchase.accessToken && (
            <div className="mt-4 flex justify-center">
              <Button
                size="lg"
                className="bg-[#C96868] hover:bg-[#b66667] text-white gap-2 px-8 py-3 text-base font-semibold shadow-md"
                disabled={downloadingPurchaseId === purchase.id}
                onClick={() => handleTokenDownload(purchase.id, purchase.accessToken!)}
                data-testid={`button-download-purchase-${purchase.id}`}
              >
                {downloadingPurchaseId === purchase.id ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Download className="w-5 h-5" />
                )}
                {downloadingPurchaseId === purchase.id ? 'Downloading...' : 'Download Now'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FDF6EE]/50 to-white relative">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/">
              <div className="cursor-pointer hover:opacity-80 transition-opacity overflow-hidden">
                <img 
                  src={riplectLogo1} 
                  alt="Riplect" 
                  className="h-9"
                  data-testid="img-header-logo"
                />
              </div>
            </Link>
            <Link href="/">
              <span className="hidden sm:inline-flex items-center gap-1 text-xs text-gray-400 hover:text-[#b66667] transition-colors cursor-pointer" data-testid="link-back-home">
                <ArrowLeft className="w-3 h-3" />
                Home
              </span>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 hidden sm:inline">Welcome, {guestProfile.name}</span>
            <Avatar className="w-8 h-8">
              <AvatarFallback className="bg-[#b66667]/10 text-[#b66667] text-sm font-semibold">{guestProfile.name.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
          </div>
        </div>
      </div>

      {/* Hero / Welcome Section */}
      <div className="bg-gradient-to-r from-[#b66667]/5 via-[#FDF6EE]/60 to-[#b66667]/5 border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1" data-testid="text-portal-title">Your Activity Portal</h1>
              <p className="text-sm sm:text-base text-gray-500">View and manage all your bookings, events, and purchases in one place</p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 sm:gap-4 mt-5 sm:mt-6">
            <Card className="border-0 shadow-lg bg-white">
              <CardContent className="p-3 sm:p-4 flex flex-col sm:flex-row items-center sm:items-center gap-1.5 sm:gap-3 text-center sm:text-left">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-md bg-[#b66667]/10 flex items-center justify-center flex-shrink-0">
                  <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 text-[#b66667]" />
                </div>
                <div className="min-w-0">
                  <p className="text-lg sm:text-2xl font-bold text-gray-900 leading-tight" data-testid="text-stat-sessions">{stats.totalBookings}</p>
                  <p className="text-[11px] sm:text-xs text-gray-500 leading-tight">Sessions</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-lg bg-white">
              <CardContent className="p-3 sm:p-4 flex flex-col sm:flex-row items-center sm:items-center gap-1.5 sm:gap-3 text-center sm:text-left">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-md bg-[#b66667]/10 flex items-center justify-center flex-shrink-0">
                  <CalendarDays className="w-4 h-4 sm:w-5 sm:h-5 text-[#b66667]" />
                </div>
                <div className="min-w-0">
                  <p className="text-lg sm:text-2xl font-bold text-gray-900 leading-tight" data-testid="text-stat-events">{stats.totalEvents}</p>
                  <p className="text-[11px] sm:text-xs text-gray-500 leading-tight">Events</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-lg bg-white">
              <CardContent className="p-3 sm:p-4 flex flex-col sm:flex-row items-center sm:items-center gap-1.5 sm:gap-3 text-center sm:text-left">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-md bg-[#b66667]/10 flex items-center justify-center flex-shrink-0">
                  <ShoppingBag className="w-4 h-4 sm:w-5 sm:h-5 text-[#b66667]" />
                </div>
                <div className="min-w-0">
                  <p className="text-lg sm:text-2xl font-bold text-gray-900 leading-tight" data-testid="text-stat-purchases">{stats.totalPurchases}</p>
                  <p className="text-[11px] sm:text-xs text-gray-500 leading-tight">Purchases</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Guest Info Pill */}
          <div className="mt-4 flex flex-wrap items-center gap-2 sm:gap-3 text-sm">
            <div className="flex items-center gap-2 bg-white rounded-full px-3 py-1.5 shadow-sm border border-gray-100 max-w-full min-w-0">
              <User className="w-3.5 h-3.5 text-[#b66667] flex-shrink-0" />
              <span className="text-gray-700 truncate">{guestProfile.name}</span>
            </div>
            <div className="flex items-center gap-2 bg-white rounded-full px-3 py-1.5 shadow-sm border border-gray-100 w-full sm:w-auto sm:max-w-full min-w-0">
              <Mail className="w-3.5 h-3.5 text-[#b66667] flex-shrink-0" />
              <span className="text-gray-700 truncate min-w-0">{guestProfile.email}</span>
            </div>
            {guestProfile.phone && (
              <div className="flex items-center gap-2 bg-white rounded-full px-3 py-1.5 shadow-sm border border-gray-100 max-w-full min-w-0">
                <Phone className="w-3.5 h-3.5 text-[#b66667] flex-shrink-0" />
                <span className="text-gray-700 truncate">{guestProfile.phone}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setDetailBookingItem(null); }} className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-6 bg-white shadow-sm border border-gray-100 rounded-md p-1 h-auto gap-1">
            <TabsTrigger 
              value="sessions" 
              data-testid="tab-sessions"
              className="data-[state=active]:bg-[#b66667] data-[state=active]:text-white rounded-md text-xs sm:text-sm px-1 sm:px-3 py-1.5 min-w-0 whitespace-normal sm:whitespace-nowrap leading-tight"
            >
              <span className="truncate">Sessions</span>
              <span className="ml-1 opacity-80">({stats.totalBookings})</span>
            </TabsTrigger>
            <TabsTrigger 
              value="events" 
              data-testid="tab-events"
              className="data-[state=active]:bg-[#b66667] data-[state=active]:text-white rounded-md text-xs sm:text-sm px-1 sm:px-3 py-1.5 min-w-0 whitespace-normal sm:whitespace-nowrap leading-tight"
            >
              <span className="truncate">Events</span>
              <span className="ml-1 opacity-80">({stats.totalEvents})</span>
            </TabsTrigger>
            <TabsTrigger 
              value="purchases" 
              data-testid="tab-purchases"
              className="data-[state=active]:bg-[#b66667] data-[state=active]:text-white rounded-md text-xs sm:text-sm px-1 sm:px-3 py-1.5 min-w-0 whitespace-normal sm:whitespace-nowrap leading-tight"
            >
              <span className="truncate">Purchases</span>
              <span className="ml-1 opacity-80">({stats.totalPurchases})</span>
            </TabsTrigger>
            <TabsTrigger 
              value="cancelled" 
              data-testid="tab-cancelled"
              className="data-[state=active]:bg-[#b66667] data-[state=active]:text-white rounded-md text-xs sm:text-sm px-1 sm:px-3 py-1.5 min-w-0 whitespace-normal sm:whitespace-nowrap leading-tight"
            >
              <span className="truncate">Cancelled</span>
              <span className="ml-1 opacity-80">({cancelledBookings.length})</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sessions">
            {detailBookingItem ? (
              <GuestBookingDetail
                booking={detailBookingItem.data as BookingData}
                coach={detailBookingItem.coach}
                accessToken={accessToken || ''}
                onBack={() => setDetailBookingItem(null)}
                onCancel={(b) => handleCancel(b, detailBookingItem.coach?.timezone)}
                onReschedule={(b) => handleReschedule(b, detailBookingItem.coach?.timezone, detailBookingItem.coach?.username)}
                onMarkPaid={(b) => {
                  setMarkPaidBooking(b);
                  setPaymentReferenceText("");
                  setPaymentProofUrl("");
                  setMarkPaidDialogOpen(true);
                }}
              />
            ) : (
              <>
                {upcomingBookings.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3" data-testid="text-upcoming-label">Upcoming ({upcomingBookings.length})</h3>
                    {upcomingBookings.map(renderBookingCard)}
                  </div>
                )}
                <div>
                  <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3" data-testid="text-past-label">Past ({pastBookings.length})</h3>
                  {pastBookings.length === 0 ? (
                    <Card className="border-0 shadow-lg">
                      <CardContent className="py-10 text-center">
                        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                          <CalendarIcon className="w-6 h-6 text-gray-400" />
                        </div>
                        <p className="text-gray-500">No past sessions</p>
                      </CardContent>
                    </Card>
                  ) : (
                    pastBookings.map(renderBookingCard)
                  )}
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="events">
            {eventRegistrations.length === 0 ? (
              <Card className="border-0 shadow-lg">
                <CardContent className="py-10 text-center">
                  <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                    <CalendarDays className="w-6 h-6 text-gray-400" />
                  </div>
                  <p className="text-gray-500">No event registrations</p>
                </CardContent>
              </Card>
            ) : (
              eventRegistrations.map(renderEventCard)
            )}
          </TabsContent>

          <TabsContent value="purchases">
            {purchases.length === 0 ? (
              <Card className="border-0 shadow-lg">
                <CardContent className="py-10 text-center">
                  <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                    <ShoppingBag className="w-6 h-6 text-gray-400" />
                  </div>
                  <p className="text-gray-500">No purchases</p>
                </CardContent>
              </Card>
            ) : (
              purchases.map(renderPurchaseCard)
            )}
          </TabsContent>

          <TabsContent value="cancelled">
            {detailBookingItem ? (
              <GuestBookingDetail
                booking={detailBookingItem.data as BookingData}
                coach={detailBookingItem.coach}
                accessToken={accessToken || ''}
                onBack={() => setDetailBookingItem(null)}
              />
            ) : cancelledBookings.length === 0 ? (
              <Card className="border-0 shadow-lg">
                <CardContent className="py-10 text-center">
                  <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                    <X className="w-6 h-6 text-gray-400" />
                  </div>
                  <p className="text-gray-500">No cancelled or declined bookings</p>
                </CardContent>
              </Card>
            ) : (
              cancelledBookings.map(renderBookingCard)
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-100 mt-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex items-center justify-between">
          <img src={riplectLogo1} alt="Riplect" className="h-7 opacity-50" data-testid="img-footer-logo" />
          <p className="text-xs text-gray-400">Powered by Riplect</p>
        </div>
      </div>

      {/* Cancel Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Booking</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this booking? Please provide a reason.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {selectedBooking && (
              <div className="bg-[#FDF6EE] border border-[#b66667]/10 p-3 rounded-md">
                <p className="font-medium text-gray-900">{selectedBooking.session?.title}</p>
                <p className="text-sm text-gray-500">
                  {formatDate(selectedBooking.bookingDate)} at {selectedBooking.bookingTime} <span className="text-xs text-gray-400">({selectedCoachTimezone ? formatTimezoneShort(selectedCoachTimezone) : "coach's time"})</span>
                </p>
              </div>
            )}
            <div>
              <Label htmlFor="cancelReason">Reason for cancellation *</Label>
              <Textarea
                id="cancelReason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Please let us know why you need to cancel..."
                className="mt-1"
                data-testid="input-cancel-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
              Keep Booking
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedBooking && cancelMutation.mutate({ bookingId: selectedBooking.id, reason: cancelReason })}
              disabled={!cancelReason.trim() || cancelMutation.isPending}
              data-testid="button-confirm-cancel"
            >
              {cancelMutation.isPending ? "Cancelling..." : "Cancel Booking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark as Paid Dialog */}
      <Dialog open={markPaidDialogOpen} onOpenChange={(open) => {
        setMarkPaidDialogOpen(open);
        if (!open) {
          proofUploadIdRef.current++;
          if (proofImagePreview) URL.revokeObjectURL(proofImagePreview);
          setProofImageFile(null);
          setProofImagePreview(null);
          setUploadedProofUrl(null);
          setIsUploadingProofImage(false);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Payment Proof</DialogTitle>
            <DialogDescription>
              Let your coach know that you've completed the payment. Provide a reference number or a link to a receipt.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {markPaidBooking && (
              <div className="bg-[#FDF6EE] border border-[#b66667]/10 p-3 rounded-md">
                <p className="font-medium text-gray-900">{markPaidBooking.session?.title}</p>
                <p className="text-sm text-gray-500">
                  {formatDate(markPaidBooking.bookingDate)} at {markPaidBooking.bookingTime}
                </p>
                {markPaidBooking && selectedPaymentMethods[markPaidBooking.id] && (
                  <p className="text-sm text-gray-500 mt-1" data-testid="text-selected-method">
                    Payment via: {getMethodLabel(selectedPaymentMethods[markPaidBooking.id])}
                  </p>
                )}
                {markPaidBooking && !selectedPaymentMethods[markPaidBooking.id] && !(markPaidBooking.paymentMethodsOffered && markPaidBooking.paymentMethodsOffered.length > 0) && (
                  <p className="text-sm text-gray-500 mt-1" data-testid="text-custom-payment">
                    Custom payment
                  </p>
                )}
              </div>
            )}

            {markPaidBooking && markPaidBooking.paymentMethodsOffered && markPaidBooking.paymentMethodsOffered.length > 0 && (
              <div>
                <Label className="text-sm font-medium">Select Payment Method</Label>
                <div className="space-y-2 mt-2">
                  {markPaidBooking.paymentMethodsOffered.map((method) => (
                    <div
                      key={method.type}
                      className={`border rounded-md p-3 cursor-pointer transition-colors ${
                        markPaidBooking && selectedPaymentMethods[markPaidBooking.id] === method.type
                          ? 'border-[#b66667] bg-[#FDF6EE]/50 ring-1 ring-[#b66667]/30'
                          : 'border-gray-200 bg-white'
                      }`}
                      onClick={() => markPaidBooking && setSelectedPaymentMethods(prev => ({ ...prev, [markPaidBooking.id]: method.type }))}
                      data-testid={`dialog-method-option-${method.type}`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                          markPaidBooking && selectedPaymentMethods[markPaidBooking.id] === method.type ? 'border-[#b66667]' : 'border-gray-300'
                        }`}>
                          {markPaidBooking && selectedPaymentMethods[markPaidBooking.id] === method.type && (
                            <div className="w-2 h-2 rounded-full bg-[#b66667]" />
                          )}
                        </div>
                        <span className="text-[#b66667]">{getMethodIcon(method.type)}</span>
                        <span className="text-sm font-semibold text-gray-800">{getMethodLabel(method.type)}</span>
                      </div>
                      {markPaidBooking && selectedPaymentMethods[markPaidBooking.id] === method.type && (
                        <div className={`mt-1 space-y-0.5 ${method.type === 'upi' ? '' : 'pl-6'}`}>
                          {renderMethodDetails(method)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {markPaidBooking && !(markPaidBooking.paymentMethodsOffered && markPaidBooking.paymentMethodsOffered.length > 0) && markPaidBooking.paymentInstruction && (
              <div className="bg-white border border-orange-100 rounded-md p-3">
                <p className="text-xs font-medium text-gray-500 mb-1">Payment Instructions</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{markPaidBooking.paymentInstruction}</p>
              </div>
            )}

            <div>
              <Label htmlFor="paymentReference">Payment Reference / Transaction ID (optional)</Label>
              <Input
                id="paymentReference"
                value={paymentReferenceText}
                onChange={(e) => setPaymentReferenceText(e.target.value)}
                placeholder="e.g., Transaction #12345 or UPI Ref ID"
                className="mt-1"
                data-testid="input-payment-reference"
              />
            </div>

            <div>
              <Label>Upload Payment Screenshot (optional)</Label>
              {proofImagePreview ? (
                <div className="mt-2 space-y-1">
                  <div className="relative inline-block">
                    <img
                      src={proofImagePreview}
                      alt="Payment proof preview"
                      className="max-h-40 rounded-md border border-gray-200"
                      data-testid="img-proof-preview"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        proofUploadIdRef.current++;
                        if (proofImagePreview) URL.revokeObjectURL(proofImagePreview);
                        setProofImageFile(null);
                        setProofImagePreview(null);
                        setUploadedProofUrl(null);
                        setIsUploadingProofImage(false);
                      }}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600"
                      data-testid="button-remove-proof-image"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  {isUploadingProofImage && (
                    <p className="text-xs text-gray-500 flex items-center gap-1" data-testid="status-proof-uploading"><Loader2 className="w-3 h-3 animate-spin" />Uploading...</p>
                  )}
                </div>
              ) : (
                <label
                  className="mt-2 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-md p-4 cursor-pointer hover:border-[#b66667]/40 hover:bg-[#FDF6EE]/30 transition-colors"
                  data-testid="label-upload-proof-image"
                >
                  <Upload className="w-5 h-5 text-gray-400" />
                  <span className="text-sm text-gray-500">Click to upload a screenshot</span>
                  <span className="text-xs text-gray-400">JPG, PNG or WebP (max 25MB)</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 25 * 1024 * 1024) {
                        toast({ title: "File too large", description: "Please select an image under 25MB.", variant: "destructive" });
                        return;
                      }
                      const uploadId = ++proofUploadIdRef.current;
                      const compressed = await compressImage(file);
                      if (uploadId !== proofUploadIdRef.current) return;
                      setProofImageFile(compressed);
                      setProofImagePreview(URL.createObjectURL(compressed));
                      setUploadedProofUrl(null);
                      setIsUploadingProofImage(true);
                      try {
                        const formData = new FormData();
                        formData.append('file', compressed);
                        const response = await fetch(`/api/guest/${accessToken}/upload-payment-proof`, { method: 'POST', body: formData });
                        if (!response.ok) throw new Error('Upload failed');
                        const result = await response.json();
                        if (uploadId === proofUploadIdRef.current) setUploadedProofUrl(result.url);
                      } catch {
                        if (uploadId === proofUploadIdRef.current) {
                          toast({ title: "Upload failed", description: "Failed to upload your screenshot. Please try again.", variant: "destructive" });
                          setProofImageFile(null);
                          setProofImagePreview(null);
                        }
                      } finally {
                        if (uploadId === proofUploadIdRef.current) setIsUploadingProofImage(false);
                      }
                    }}
                    data-testid="input-proof-image-file"
                  />
                </label>
              )}
            </div>

            <div>
              <Label htmlFor="paymentProofUrl">Or paste a proof URL (optional)</Label>
              <Input
                id="paymentProofUrl"
                value={paymentProofUrl}
                onChange={(e) => setPaymentProofUrl(e.target.value)}
                placeholder="Link to screenshot or receipt"
                className="mt-1"
                data-testid="input-payment-proof-url"
              />
            </div>
            <p className="text-xs text-gray-400">All fields are optional. You can confirm payment without providing proof.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarkPaidDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-[#b66667] text-white border-[#b66667]"
              onClick={() => {
                if (!markPaidBooking) return;
                markPaidMutation.mutate({
                  bookingId: markPaidBooking.id,
                  referenceText: paymentReferenceText,
                  proofUrl: paymentProofUrl,
                  selectedMethod: selectedPaymentMethods[markPaidBooking.id] || null,
                  proofImageUrl: uploadedProofUrl,
                });
              }}
              disabled={
                (markPaidBooking?.paymentMethodsOffered && markPaidBooking.paymentMethodsOffered.length > 0 && !(markPaidBooking && selectedPaymentMethods[markPaidBooking.id])) ||
                markPaidMutation.isPending ||
                isUploadingProofImage
              }
              data-testid="button-confirm-mark-paid"
            >
              {isUploadingProofImage ? "Uploading image..." : markPaidMutation.isPending ? "Submitting..." : "Confirm Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reschedule Dialog */}
      <Dialog open={rescheduleDialogOpen} onOpenChange={(open) => {
        setRescheduleDialogOpen(open);
        if (!open) {
          setRescheduleSelectedDate(undefined);
          setRescheduleSelectedTime("");
          setRescheduleMessage("");
          setRescheduleCoachUsername(null);
        }
      }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Reschedule Booking</DialogTitle>
            <DialogDescription>
              Select a new date and time based on the coach's availability. The coach will need to confirm the change.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {selectedBooking && (
              <div className="bg-[#FDF6EE] border border-[#b66667]/10 p-3 rounded-md">
                <p className="font-medium text-gray-900">{selectedBooking.session?.title}</p>
                <p className="text-sm text-gray-500">
                  Currently: {formatDate(selectedBooking.bookingDate)} at {selectedBooking.bookingTime} <span className="text-xs text-gray-400">({selectedCoachTimezone ? formatTimezoneShort(selectedCoachTimezone) : "coach's time"})</span>
                </p>
              </div>
            )}

            <div>
              <Label className="text-base font-medium">Select Date</Label>
              <div className="mt-2">
                <Calendar
                  mode="single"
                  selected={rescheduleSelectedDate}
                  onSelect={(date) => {
                    setRescheduleSelectedDate(date);
                    setRescheduleSelectedTime("");
                  }}
                  disabled={isRescheduleDateDisabled}
                  className="rounded-md border"
                  data-testid="calendar-reschedule-date"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Only dates marked as available by the coach can be selected.
              </p>
            </div>

            {rescheduleSelectedDate && (
              <div>
                <Label className="text-base font-medium">Select Time</Label>
                <div className="flex items-center gap-1.5 text-sm text-gray-600 mb-2" data-testid="text-reschedule-timezone-info">
                  <Globe className="w-3.5 h-3.5" />
                  {isRescheduleDifferentTimezone ? (
                    <span>Times shown in {formatTimezoneShort(visitorTimezone)}</span>
                  ) : (
                    <span>Timezone: {formatTimezoneShort(rescheduleCoachTimezoneFromApi)}</span>
                  )}
                </div>
                {rescheduleTimeSlots.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {rescheduleTimeSlots.map((slot) => {
                      const isBooked = rescheduleBookedTimes.has(slot.coachTime24);
                      return (
                        <button
                          key={slot.coachTime24}
                          type="button"
                          disabled={isBooked}
                          onClick={() => !isBooked && setRescheduleSelectedTime(slot.coachTime24)}
                          data-testid={`button-reschedule-time-${slot.coachTime24}`}
                          className={`py-2 px-3 rounded-lg text-sm border transition-colors ${
                            isBooked
                              ? "bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed line-through"
                              : rescheduleSelectedTime === slot.coachTime24
                                ? "bg-primary text-white border-primary"
                                : "bg-gray-50 border-gray-300"
                          }`}
                        >
                          {slot.displayTime}
                          {slot.dateChanged && <span className="text-[10px] ml-0.5 opacity-70">+1d</span>}
                          {isBooked && <span className="block text-[9px] mt-0.5 not-italic">Unavailable</span>}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 mt-2">No available time slots for this date.</p>
                )}
              </div>
            )}

            {rescheduleSelectedTime && (
              <div>
                <Label htmlFor="rescheduleMessage">Message (optional)</Label>
                <Textarea
                  id="rescheduleMessage"
                  value={rescheduleMessage}
                  onChange={(e) => setRescheduleMessage(e.target.value)}
                  placeholder="Any additional notes for your coach..."
                  className="mt-1"
                  data-testid="input-reschedule-message"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduleDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-[#b66667] text-white border-[#b66667]"
              onClick={() => {
                if (!selectedBooking || !rescheduleSelectedDate || !rescheduleSelectedTime) return;
                const y = rescheduleSelectedDate.getFullYear();
                const m = String(rescheduleSelectedDate.getMonth() + 1).padStart(2, '0');
                const d = String(rescheduleSelectedDate.getDate()).padStart(2, '0');
                const dateStr = `${y}-${m}-${d}`;
                const timeStr = formatTime24to12(rescheduleSelectedTime);
                rescheduleMutation.mutate({
                  bookingId: selectedBooking.id,
                  newDate: dateStr,
                  newTime: timeStr,
                  message: rescheduleMessage
                });
              }}
              disabled={!rescheduleSelectedDate || !rescheduleSelectedTime || rescheduleMutation.isPending}
              data-testid="button-confirm-reschedule"
            >
              {rescheduleMutation.isPending ? "Sending..." : "Request Reschedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
