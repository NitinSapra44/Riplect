import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getAuthHeaders } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format, isPast, addHours } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  ChevronRight,
  Users,
  MoreHorizontal,
  XCircle,
  CreditCard,
  UserCheck,
  UserX,
  CalendarDays,
  MapPin,
  AlertCircle,
  CheckCircle,
  Video,
  Monitor,
  Link,
  Loader2,
  Upload,
  ShieldCheck,
  ShieldX,
  Download,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Event, EventRegistration } from "@shared/schema";
import { ImageGalleryModal } from "@/components/image-gallery-modal";

export interface EventGroup {
  event: Event;
  registrations: EventRegistration[];
}

function formatTime12h(time: string): string {
  if (!time) return time;
  const [hourStr, minStr = "00"] = time.split(":");
  const hour = parseInt(hourStr, 10);
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${hour12}:${minStr} ${period}`;
}

function paymentStatusBadge(status: string) {
  if (status === "paid") return <Badge className="bg-green-100 text-green-800 border-0 text-[10px]">Paid</Badge>;
  if (status === "waived") return <Badge className="bg-blue-100 text-blue-800 border-0 text-[10px]">Waived</Badge>;
  if (status === "proof_uploaded") return <Badge className="bg-rose-100 text-[#b66667] border-0 text-[10px] flex items-center gap-0.5"><Upload className="w-2.5 h-2.5" />Proof Submitted</Badge>;
  if (status === "cash_pending") return <Badge className="bg-amber-100 text-amber-800 border-0 text-[10px]">Cash at event</Badge>;
  return <Badge className="bg-amber-100 text-amber-800 border-0 text-[10px]">Unpaid</Badge>;
}

function attendanceBadge(status: string | null | undefined) {
  if (status === "attended") return <Badge className="bg-green-100 text-green-800 border-0 text-[10px]">Attended</Badge>;
  if (status === "no_show") return <Badge className="bg-red-100 text-red-800 border-0 text-[10px]">No Show</Badge>;
  return null;
}

export function computeNeedsAttentionReasons(group: EventGroup): string[] {
  const { event, registrations } = group;
  const reasons: string[] = [];
  const now = new Date();

  const eventDate = event.startAt ? new Date(event.startAt) : null;
  const isFutureEvent = eventDate ? eventDate > now : false;
  const confirmed = registrations.filter(r => r.status === "confirmed");
  const isOnline = event.mode === 'online' || event.mode === 'hybrid';

  if (event.requiresPayment && isFutureEvent) {
    const unpaidCount = confirmed.filter(r => r.paymentStatus === "pending").length;
    if (unpaidCount > 0) reasons.push(`${unpaidCount} unpaid`);
    const proofCount = confirmed.filter(r => r.paymentStatus === "proof_uploaded").length;
    if (proofCount > 0) reasons.push(`${proofCount} proof pending review`);
    // cash_pending = "Cash at event" RSVP — guest pays at the door, no pre-event action needed
  }

  if (
    isOnline &&
    !event.meetingLink &&
    confirmed.length > 0 &&
    isFutureEvent &&
    eventDate &&
    eventDate <= addHours(now, 48)
  ) {
    reasons.push("meeting link missing");
  }

  return reasons;
}

export function computeNeedsActionReasons(group: EventGroup): string[] {
  const { event, registrations } = group;
  const reasons: string[] = [];
  const now = new Date();

  const eventDate = event.startAt ? new Date(event.startAt) : null;
  const isFutureEvent = eventDate ? eventDate > now : false;
  const confirmed = registrations.filter(r => r.status === "confirmed");
  const isOnline = event.mode === 'online' || event.mode === 'hybrid';

  if (event.requiresPayment && isFutureEvent) {
    const unpaidCount = confirmed.filter(r => r.paymentStatus === "pending").length;
    if (unpaidCount > 0) reasons.push(`${unpaidCount} unpaid`);
    const proofCount = confirmed.filter(r => r.paymentStatus === "proof_uploaded").length;
    if (proofCount > 0) reasons.push(`${proofCount} proof pending review`);
    // cash_pending = "Cash at event" RSVP — guest pays at the door, no pre-event action needed
  }

  if (
    isOnline &&
    !event.meetingLink &&
    confirmed.length > 0 &&
    isFutureEvent &&
    eventDate &&
    eventDate <= addHours(now, 48)
  ) {
    reasons.push("meeting link missing");
  }

  return reasons;
}

interface RegistrantRowProps {
  reg: EventRegistration;
  isPastEvent: boolean;
  requiresPayment: boolean;
  onAction: (id: number, action: string) => void;
  onVerifyPayment: (id: number) => void;
  onRejectPayment: (id: number) => void;
  isPending: boolean;
  isHighlighted?: boolean;
}

function RegistrantRow({ reg, isPastEvent, requiresPayment, onAction, onVerifyPayment, onRejectPayment, isPending, isHighlighted }: RegistrantRowProps) {
  const isCancelled = reg.status === "cancelled";
  const hasProof = reg.paymentStatus === "proof_uploaded";
  const isCashPending = reg.paymentStatus === "cash_pending";
  // canActOnPayment = proof uploaded only — cash-at-event is an RSVP, no pre-event verification needed
  const canActOnPayment = hasProof;
  const [showProof, setShowProof] = useState(false);
  const [proofLightboxOpen, setProofLightboxOpen] = useState(false);
  const [proofImgFailed, setProofImgFailed] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setProofImgFailed(false);
  }, [reg.paymentProofUrl]);

  useEffect(() => {
    if (isHighlighted && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [isHighlighted]);

  return (
    <div
      ref={rowRef}
      className={`py-2.5 px-4 border-b last:border-b-0 text-sm transition-all ${isCancelled ? "opacity-50" : ""} ${isHighlighted ? "ring-2 ring-inset ring-[#C96868]/40 bg-[#FDF6EE]/60" : hasProof ? "bg-rose-50/40" : ""}`}
      data-testid={`row-registrant-${reg.id}`}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 truncate">{reg.clientName}</p>
          <p className="text-xs text-gray-500 truncate">{reg.clientEmail}</p>
          {reg.clientPhone && <p className="text-xs text-gray-400">{reg.clientPhone}</p>}
          <p className="text-xs text-gray-400 mt-0.5">
            Registered {reg.createdAt ? format(new Date(reg.createdAt), "d MMM yyyy") : ""}
          </p>
          <div className="flex flex-wrap gap-1 mt-1">
            {isCancelled
              ? <Badge className="bg-gray-100 text-gray-600 border-0 text-[10px]">Cancelled</Badge>
              : requiresPayment && paymentStatusBadge(reg.paymentStatus)
            }
            {isPastEvent && !isCancelled && attendanceBadge(reg.attendanceStatus)}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {hasProof && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px] text-[#b66667] hover:bg-rose-50"
              onClick={() => setShowProof(v => !v)}
              data-testid={`button-view-proof-${reg.id}`}
            >
              <Upload className="w-3 h-3 mr-1" />{showProof ? 'Hide' : 'View proof'}
            </Button>
          )}
          {!isCancelled && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  disabled={isPending}
                  data-testid={`button-reg-actions-${reg.id}`}
                >
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {canActOnPayment && (
                  <>
                    <DropdownMenuItem onClick={() => onVerifyPayment(reg.id)} data-testid={`button-verify-payment-${reg.id}`}>
                      <ShieldCheck className="w-3.5 h-3.5 mr-2 text-green-600" /> Verify Payment
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onRejectPayment(reg.id)} data-testid={`button-reject-payment-${reg.id}`}>
                      <ShieldX className="w-3.5 h-3.5 mr-2 text-red-600" /> {hasProof ? "Reject Proof" : "Reject Registration"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                {requiresPayment && reg.paymentStatus !== "paid" && reg.paymentStatus !== "proof_uploaded" && (
                  <DropdownMenuItem onClick={() => onAction(reg.id, "mark-paid")}>
                    <CreditCard className="w-3.5 h-3.5 mr-2" /> Mark as Paid
                  </DropdownMenuItem>
                )}
                {requiresPayment && reg.paymentStatus === "pending" && (
                  <DropdownMenuItem onClick={() => onAction(reg.id, "mark-payment-waived")}>
                    <CheckCircle className="w-3.5 h-3.5 mr-2" /> Waive Payment
                  </DropdownMenuItem>
                )}
                {isPastEvent && reg.attendanceStatus !== "attended" && (
                  <DropdownMenuItem onClick={() => onAction(reg.id, "mark-attended")}>
                    <UserCheck className="w-3.5 h-3.5 mr-2" /> Mark Attended
                  </DropdownMenuItem>
                )}
                {isPastEvent && reg.attendanceStatus !== "no_show" && (
                  <DropdownMenuItem onClick={() => onAction(reg.id, "mark-no-show")}>
                    <UserX className="w-3.5 h-3.5 mr-2" /> Mark No-show
                  </DropdownMenuItem>
                )}
                {(requiresPayment || isPastEvent) && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  className="text-red-600"
                  onClick={() => onAction(reg.id, "cancel")}
                >
                  <XCircle className="w-3.5 h-3.5 mr-2" /> Cancel Registration
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {hasProof && showProof && (
        <div className="mt-2 p-3 bg-rose-50 border border-rose-200 rounded-md text-xs space-y-1.5">
          {reg.paymentReferenceText && (
            <div><span className="font-medium text-gray-800">Reference:</span> <span className="text-gray-700">{reg.paymentReferenceText}</span></div>
          )}
          {reg.paymentMethodSelected && (
            <div><span className="font-medium text-gray-800">Method:</span> <span className="text-gray-700">{reg.paymentMethodSelected}</span></div>
          )}
          {reg.paymentProofUrl && (
            <div>
              <span className="font-medium text-gray-800">Proof:</span>{" "}
              {proofImgFailed ? (
                <a href={reg.paymentProofUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline truncate block max-w-full">{reg.paymentProofUrl}</a>
              ) : (
                <img
                  src={reg.paymentProofUrl}
                  alt="Payment proof"
                  className="mt-1 max-h-32 rounded border border-rose-200 cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => setProofLightboxOpen(true)}
                  onError={() => setProofImgFailed(true)}
                  data-testid={`img-payment-proof-${reg.id}`}
                />
              )}
            </div>
          )}
          {proofLightboxOpen && reg.paymentProofUrl && (
            <ImageGalleryModal
              images={[{ url: reg.paymentProofUrl, alt: "Payment proof" }]}
              initialIndex={0}
              isOpen={proofLightboxOpen}
              onClose={() => setProofLightboxOpen(false)}
            />
          )}
          {reg.paymentMarkedAt && (
            <div className="text-[#b66667]">Submitted: {format(new Date(reg.paymentMarkedAt), "d MMM yyyy, HH:mm")}</div>
          )}
          <div className="flex gap-2 pt-1">
            <Button size="sm" className="h-6 text-[11px] bg-green-600 hover:bg-green-700 text-white" onClick={() => onVerifyPayment(reg.id)} data-testid={`button-inline-verify-${reg.id}`}>
              <ShieldCheck className="w-3 h-3 mr-1" /> Verify
            </Button>
            <Button size="sm" variant="outline" className="h-6 text-[11px] border-red-300 text-red-600 hover:bg-red-50" onClick={() => onRejectPayment(reg.id)} data-testid={`button-inline-reject-${reg.id}`}>
              <ShieldX className="w-3 h-3 mr-1" /> Reject
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

interface MeetingLinkEditorProps {
  eventId: number;
  currentLink: string | null | undefined;
  onSaved: () => void;
}

function MeetingLinkEditor({ eventId, currentLink, onSaved }: MeetingLinkEditorProps) {
  const [link, setLink] = useState(currentLink || "");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    if (!link.trim()) return;
    setSaving(true);
    try {
      await apiRequest("PATCH", `/api/dashboard/events/${eventId}`, { meetingLink: link.trim() });
      toast({ description: "Meeting link saved. Registrants have been notified." });
      onSaved();
    } catch {
      toast({ description: "Failed to save meeting link.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-4 py-2 bg-blue-50 border-b">
      <div className="flex items-center gap-2">
        <Link className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
        <Input
          value={link}
          onChange={e => setLink(e.target.value)}
          placeholder="https://meet.google.com/..."
          className="h-7 text-xs flex-1 bg-white border-blue-200"
          data-testid={`input-meeting-link-${eventId}`}
          onKeyDown={e => { if (e.key === "Enter") handleSave(); }}
        />
        <Button
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={handleSave}
          disabled={saving || !link.trim()}
          data-testid={`button-save-meeting-link-${eventId}`}
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : (currentLink ? "Edit & Send" : "Add & Send")}
        </Button>
      </div>
      <p className="text-[11px] text-gray-500 mt-1 ml-5">An email will be sent to all confirmed attendees.</p>
    </div>
  );
}

interface EventGroupCardProps {
  group: EventGroup;
  onAction: (id: number, action: string) => void;
  onVerifyPayment: (id: number) => void;
  onRejectPayment: (id: number) => void;
  isPending: boolean;
  onRefetch: () => void;
  isHighlighted?: boolean;
  defaultOpen?: boolean;
  highlightedRegistrationId?: number | null;
}

function EventGroupCard({ group, onAction, onVerifyPayment, onRejectPayment, isPending, onRefetch, isHighlighted, defaultOpen, highlightedRegistrationId }: EventGroupCardProps) {
  const hasHighlightedReg = !!highlightedRegistrationId && group.registrations.some(r => r.id === highlightedRegistrationId);
  const [isOpen, setIsOpen] = useState(defaultOpen || hasHighlightedReg || false);
  const [showLinkEditor, setShowLinkEditor] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "confirmed" | "cancelled">("all");
  const [isDownloading, setIsDownloading] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { event, registrations } = group;

  async function handleDownloadCSV() {
    setIsDownloading(true);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/dashboard/events/${event.id}/attendees.csv`, {
        credentials: "include",
        headers: { ...authHeaders },
      });
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Prefer the server-supplied filename from Content-Disposition if present
      const disposition = res.headers.get("Content-Disposition") || "";
      const filenameMatch = disposition.match(/filename="([^"]+)"/);
      const eventDate = event.startAt ? new Date(event.startAt).toISOString().slice(0, 10) : "unknown-date";
      a.download = filenameMatch ? filenameMatch[1] : `${event.title} - ${eventDate} - attendees.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ description: "Attendee list downloaded." });
    } catch (err: any) {
      toast({ description: err?.message || "Failed to download attendee list.", variant: "destructive" });
    } finally {
      setIsDownloading(false);
    }
  }

  useEffect(() => {
    if (isHighlighted && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      setIsOpen(true);
    }
  }, [isHighlighted]);

  useEffect(() => {
    if (hasHighlightedReg) {
      setIsOpen(true);
    }
  }, [hasHighlightedReg]);

  const eventDate = event.startAt ? new Date(event.startAt) : null;
  const isEventPast = eventDate ? isPast(eventDate) : false;
  const confirmed = registrations.filter(r => r.status === "confirmed");
  const cancelled = registrations.filter(r => r.status === "cancelled");
  const hasCancelled = cancelled.length > 0;
  const filteredRegistrations = statusFilter === "all"
    ? registrations
    : statusFilter === "confirmed"
      ? confirmed
      : cancelled;
  const requiresPayment = !!event.requiresPayment;
  const attentionReasons = computeNeedsAttentionReasons(group);
  const needsAttention = attentionReasons.length > 0;

  useEffect(() => {
    if (statusFilter !== "all" && !hasCancelled) {
      setStatusFilter("all");
    }
  }, [hasCancelled, statusFilter]);

  const isOnline = event.mode === 'online' || event.mode === 'hybrid';
  const isOffline = event.mode === 'offline' || event.mode === 'hybrid';
  const modeLabel = event.mode === 'hybrid' ? "Hybrid" : event.mode === 'online' ? "Online" : "In-person";
  const ModeIcon = isOnline ? (isOffline ? Monitor : Video) : MapPin;

  return (
    <div
      ref={cardRef}
      className={`border-b last:border-b-0 transition-all ${isHighlighted ? "ring-2 ring-[#C96868]/40 ring-inset bg-[#FDF6EE]/40" : ""}`}
    >
      <button
        className="w-full flex items-start gap-2 p-3 hover:bg-gray-50 transition-colors text-left"
        onClick={() => setIsOpen(v => !v)}
        data-testid={`button-event-group-${event.id}`}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-sm text-gray-900 truncate">{event.title}</p>
            {isEventPast ? (
              <Badge className="bg-gray-100 text-gray-600 border-0 text-[10px]">Past</Badge>
            ) : (
              <Badge className="bg-blue-100 text-blue-700 border-0 text-[10px]">Upcoming</Badge>
            )}
            {needsAttention && (
              <Badge className="bg-amber-100 text-amber-800 border-0 text-[10px] flex items-center gap-0.5">
                <AlertCircle className="w-3 h-3" /> {attentionReasons.join(", ")}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
            {eventDate && (
              <span className="flex items-center gap-1">
                <CalendarDays className="w-3 h-3" />
                {format(eventDate, "d MMM yyyy")}
                {event.startAt && (() => { const d = new Date(event.startAt); return (d.getHours() || d.getMinutes()) ? ` · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : null; })()}
              </span>
            )}
            <span className="flex items-center gap-1">
              <ModeIcon className="w-3 h-3" />
              {modeLabel}
            </span>
            {isOnline && event.meetingLink && (
              <span className="text-blue-500 flex items-center gap-1 truncate max-w-[120px]">
                <Link className="w-3 h-3" /> Link set
              </span>
            )}
            {isOnline && !event.meetingLink && !isEventPast && (
              <button
                className="text-amber-600 flex items-center gap-1 underline text-[11px]"
                onClick={e => { e.stopPropagation(); setIsOpen(true); setShowLinkEditor(v => !v); }}
                data-testid={`button-add-meeting-link-${event.id}`}
              >
                <Link className="w-3 h-3" /> Add meeting link & send
              </button>
            )}
          </div>
          <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
            <Users className="w-3 h-3" />
            <span>{confirmed.length}{event.maxAttendees ? `/${event.maxAttendees}` : ""} confirmed</span>
            {registrations.length - confirmed.length > 0 && (
              <span className="text-gray-400">
                ({registrations.length - confirmed.length} cancelled)
              </span>
            )}
          </div>
        </div>
        <div className="flex-shrink-0 text-gray-400 mt-1">
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
      </button>

      <div className="px-3 py-1.5 border-b flex items-center justify-end bg-white">
        <button
          className={`flex items-center gap-1.5 text-[11px] font-medium rounded px-2 py-1 transition-colors ${
            registrations.length === 0
              ? "text-gray-300 cursor-not-allowed"
              : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
          }`}
          onClick={handleDownloadCSV}
          disabled={registrations.length === 0 || isDownloading}
          title={registrations.length === 0 ? "No registrations yet" : "Download attendees as CSV"}
          data-testid={`button-download-attendees-${event.id}`}
        >
          {isDownloading ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Download className="w-3 h-3" />
          )}
          Download attendees
        </button>
      </div>

      {isOpen && (
        <div>
          {isOnline && !isEventPast && (
            <>
              {event.meetingLink && !showLinkEditor ? (
                <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border-b text-xs">
                  <Link className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                  <a href={event.meetingLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline truncate flex-1">{event.meetingLink}</a>
                  <button
                    className="text-blue-500 underline text-[11px] flex-shrink-0"
                    onClick={() => setShowLinkEditor(true)}
                    data-testid={`button-edit-meeting-link-${event.id}`}
                  >Edit & send</button>
                </div>
              ) : (
                <MeetingLinkEditor
                  eventId={event.id}
                  currentLink={event.meetingLink}
                  onSaved={() => { setShowLinkEditor(false); onRefetch(); }}
                />
              )}
            </>
          )}
          {(isOffline || event.mode === null) && event.location && (
            <div className="flex items-start gap-2 px-4 py-2 bg-gray-50 border-b text-xs text-gray-600">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-gray-400" />
              <div>
                <p className="font-medium">{event.location}</p>
                {(event.locationVisibility as any)?.showExactLocation && event.locationUrl && (
                  <a href={event.locationUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">View map</a>
                )}
              </div>
            </div>
          )}
          {registrations.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-400 italic bg-gray-50/50">
              No registrations yet.
            </div>
          ) : (
            <>
              {hasCancelled && (
                <div className="flex items-center gap-1 px-3 py-1.5 border-b bg-white">
                  {(["all", "confirmed", "cancelled"] as const).map(filter => (
                    <button
                      key={filter}
                      onClick={() => setStatusFilter(filter)}
                      data-testid={`button-filter-${filter}-${event.id}`}
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors ${
                        statusFilter === filter
                          ? "bg-gray-800 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {filter === "all" ? `All (${registrations.length})` : filter === "confirmed" ? `Active (${confirmed.length})` : `Cancelled (${cancelled.length})`}
                    </button>
                  ))}
                </div>
              )}
              <div className="bg-gray-50/30">
                {filteredRegistrations.map(reg => (
                  <RegistrantRow
                    key={reg.id}
                    reg={reg}
                    isPastEvent={isEventPast}
                    requiresPayment={requiresPayment}
                    onAction={onAction}
                    onVerifyPayment={onVerifyPayment}
                    onRejectPayment={onRejectPayment}
                    isPending={isPending}
                    isHighlighted={highlightedRegistrationId === reg.id}
                  />
                ))}
                {filteredRegistrations.length === 0 && (
                  <div className="px-4 py-3 text-sm text-gray-400 italic">
                    No {statusFilter === "confirmed" ? "active" : statusFilter} registrations.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function computeTotalNeedsAttention(eventGroups: EventGroup[]): number {
  const now = new Date();
  return eventGroups.reduce((sum, g) => {
    const { event, registrations } = g;
    const eventDate = event.startAt ? new Date(event.startAt) : null;
    const isFutureEvent = eventDate ? eventDate > now : false;
    const confirmed = registrations.filter(r => r.status === "confirmed");
    const isOnlineEv = event.mode === 'online' || event.mode === 'hybrid';

    let count = 0;
    if (event.requiresPayment && isFutureEvent) {
      count += confirmed.filter(r => r.paymentStatus === "pending").length;
      count += confirmed.filter(r => r.paymentStatus === "proof_uploaded").length;
      // cash_pending = "Cash at event" RSVP — guest pays at the door, no pre-event action needed
    }

    if (
      isOnlineEv &&
      !event.meetingLink &&
      isFutureEvent &&
      eventDate &&
      eventDate <= addHours(now, 48)
    ) {
      count += confirmed.length;
    }

    return sum + count;
  }, 0);
}

interface EventRegistrationsPanelProps {
  highlightedEventId?: number | null;
  highlightedRegistrationId?: number | null;
}

export function EventRegistrationsPanel({ highlightedEventId, highlightedRegistrationId }: EventRegistrationsPanelProps = {}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [rejectDialogId, setRejectDialogId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [verifyDialogId, setVerifyDialogId] = useState<number | null>(null);
  const [verifyMessage, setVerifyMessage] = useState("");

  const { data, isLoading, refetch } = useQuery<{ eventGroups: EventGroup[] }>({
    queryKey: ["/api/dashboard/event-registrations"],
    refetchOnWindowFocus: true,
    refetchInterval: 60000,
  });

  const ATTENDANCE_RESOLVING_ACTIONS = new Set(["mark-attended", "mark-no-show", "confirm"]);

  const updateMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: string }) =>
      apiRequest("PATCH", `/api/dashboard/event-registrations/${id}`, { action }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/event-registrations"] });
      if (ATTENDANCE_RESOLVING_ACTIONS.has(variables.action)) {
        apiRequest("PATCH", "/api/notifications/mark-by-reference", { registrationId: variables.id }).catch(() => {});
      }
      toast({ description: "Registration updated." });
    },
    onError: (err: any) => {
      toast({ description: err?.message || "Failed to update registration.", variant: "destructive" });
    },
  });

  const verifyPaymentMutation = useMutation({
    mutationFn: ({ registrationId, message }: { registrationId: number; message: string }) =>
      apiRequest("POST", `/api/dashboard/events/registrations/${registrationId}/verify-payment`, { message: message || undefined }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/event-registrations"] });
      apiRequest("PATCH", "/api/notifications/mark-by-reference", { registrationId: variables.registrationId }).catch(() => {});
      setVerifyDialogId(null);
      setVerifyMessage("");
      toast({ description: "Payment verified. Guest has been notified." });
    },
    onError: (err: any) => {
      toast({ description: err?.message || "Failed to verify payment.", variant: "destructive" });
    },
  });

  const rejectPaymentMutation = useMutation({
    mutationFn: ({ registrationId, reason }: { registrationId: number; reason: string }) =>
      apiRequest("POST", `/api/dashboard/events/registrations/${registrationId}/reject-payment`, { reason }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/event-registrations"] });
      apiRequest("PATCH", "/api/notifications/mark-by-reference", { registrationId: variables.registrationId }).catch(() => {});
      setRejectDialogId(null);
      setRejectReason("");
      toast({ description: "Payment proof rejected. Guest will be notified." });
    },
    onError: (err: any) => {
      toast({ description: err?.message || "Failed to reject payment.", variant: "destructive" });
    },
  });

  const handleAction = (id: number, action: string) => {
    updateMutation.mutate({ id, action });
  };

  const handleVerifyPayment = (id: number) => {
    setVerifyDialogId(id);
    setVerifyMessage("");
  };

  const handleRejectPayment = (id: number) => {
    setRejectDialogId(id);
    setRejectReason("");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#C96868]" />
      </div>
    );
  }

  const eventGroups = data?.eventGroups ?? [];
  const totalNeedsAttention = computeTotalNeedsAttention(eventGroups);

  if (eventGroups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2 px-6 text-center">
        <Users className="w-8 h-8" />
        <p className="text-sm">No events yet.</p>
        <p className="text-xs">Create events on your profile to start collecting registrations.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Dialog open={!!verifyDialogId} onOpenChange={(open) => { if (!open) { setVerifyDialogId(null); setVerifyMessage(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">Confirm this registrant's payment. They will receive a confirmation email.</p>
            <div>
              <Label htmlFor="verify-message-event" className="text-sm">Message to guest (optional)</Label>
              <Textarea
                id="verify-message-event"
                value={verifyMessage}
                onChange={e => setVerifyMessage(e.target.value)}
                placeholder="e.g., Thanks for your payment! Looking forward to seeing you at the event."
                className="mt-1"
                rows={3}
                data-testid="textarea-verify-message-event"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setVerifyDialogId(null); setVerifyMessage(""); }}>Cancel</Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              disabled={verifyPaymentMutation.isPending}
              onClick={() => verifyDialogId && verifyPaymentMutation.mutate({ registrationId: verifyDialogId, message: verifyMessage })}
              data-testid="button-confirm-verify-event"
            >
              <ShieldCheck className="w-4 h-4 mr-1" />
              {verifyPaymentMutation.isPending ? "Verifying..." : "Verify Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejectDialogId} onOpenChange={(open) => { if (!open) { setRejectDialogId(null); setRejectReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">Optionally provide a reason. The guest will be notified.</p>
            <div>
              <Label htmlFor="reject-reason" className="text-sm">Reason (optional)</Label>
              <Textarea id="reject-reason" value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="e.g., Screenshot is unclear, please upload a valid proof." className="mt-1" rows={3} data-testid="textarea-reject-reason" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectDialogId(null); setRejectReason(""); }}>Cancel</Button>
            <Button variant="destructive" disabled={rejectPaymentMutation.isPending} onClick={() => rejectDialogId && rejectPaymentMutation.mutate({ registrationId: rejectDialogId, reason: rejectReason })} data-testid="button-confirm-reject">
              {rejectPaymentMutation.isPending ? "Rejecting..." : "Confirm Rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {totalNeedsAttention > 0 && (
        <div className="px-3 py-2 bg-amber-50 border-b flex items-center gap-2 text-amber-800 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{totalNeedsAttention} registration{totalNeedsAttention !== 1 ? "s" : ""} need{totalNeedsAttention === 1 ? "s" : ""} attention</span>
        </div>
      )}
      <ScrollArea className="flex-1">
        <div>
          {eventGroups.map(group => (
            <EventGroupCard
              key={group.event.id}
              group={group}
              onAction={handleAction}
              onVerifyPayment={handleVerifyPayment}
              onRejectPayment={handleRejectPayment}
              isPending={updateMutation.isPending}
              onRefetch={() => refetch()}
              isHighlighted={highlightedEventId === group.event.id}
              defaultOpen={highlightedEventId === group.event.id}
              highlightedRegistrationId={highlightedRegistrationId}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

export function useEventNeedsAttentionCount() {
  const { data } = useQuery<{ eventGroups: EventGroup[] }>({
    queryKey: ["/api/dashboard/event-registrations"],
  });

  const eventGroups = data?.eventGroups ?? [];
  return computeTotalNeedsAttention(eventGroups);
}

export function useEventNeedsActionCount() {
  const { data } = useQuery<{ eventGroups: EventGroup[] }>({
    queryKey: ["/api/dashboard/event-registrations"],
  });

  const eventGroups = data?.eventGroups ?? [];
  return eventGroups.filter(g => computeNeedsActionReasons(g).length > 0).length;
}

export function useUpcomingEventsCount() {
  const { data } = useQuery<{ eventGroups: EventGroup[] }>({
    queryKey: ["/api/dashboard/event-registrations"],
  });

  const eventGroups = data?.eventGroups ?? [];
  const now = new Date();
  return eventGroups.filter(g => {
    const eventDate = g.event.startAt ? new Date(g.event.startAt) : null;
    return eventDate ? eventDate > now : false;
  }).length;
}

export function useEventGroupsData() {
  return useQuery<{ eventGroups: EventGroup[] }>({
    queryKey: ["/api/dashboard/event-registrations"],
    refetchOnWindowFocus: true,
    refetchInterval: 60000,
  });
}
