import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { PaymentProofUpload, type NewRegistrationPayload } from "@/components/payment-proof-upload";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2,
  AlertCircle,
  Calendar,
  Clock,
  MapPin,
  ShoppingBag,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import riplectLogo from "@assets/Color_Variations_copy_9@144x-2_1775978761578.png";

interface EventData {
  id: number;
  title: string;
  startAt?: string | null;
  endAt?: string | null;
  date?: string;
  startTime?: string | null;
  endTime?: string | null;
  location: string | null;
  price: string;
  currency?: string;
  pricingType?: 'free' | 'donation' | 'paid' | null;
  isFree?: boolean;
  requiresPayment?: boolean;
  paymentInstructions?: string | null;
}

interface EventRegistrationData {
  id: number;
  eventId: number;
  paymentStatus: string;
  paymentMethodsOffered: any[] | null;
  paymentInstruction: string | null;
  event: EventData | null;
}

interface ProductData {
  id: number;
  title: string;
  price: string;
  currency?: string;
  isFree?: boolean;
  paymentInstructions?: string | null;
}

interface PurchaseData {
  id: number;
  productId: number;
  amount: string;
  currency: string;
  status: string;
  paymentMethodsOffered: any[] | null;
  paymentInstruction: string | null;
  product: ProductData | null;
}

interface PaymentContextData {
  guestProfile: { id: number; name: string; email: string };
  registration?: EventRegistrationData;
  purchase?: PurchaseData;
}

interface PendingRegistrationState {
  registrationData: {
    attendeeName: string;
    attendeeEmail: string;
    attendeePhone: string;
    specialRequests: string;
    eventId: number;
    instanceId?: number | null;
  };
  eventData: {
    id: number;
    title: string;
    startAt?: string | null;
    endAt?: string | null;
    location?: string | null;
    price: string;
    currency: string;
    pricingType?: string | null;
    paymentInstructions?: string | null;
    returnPath?: string | null;
  };
  /** Client-generated UUID for server-side idempotency deduplication. */
  idempotencyKey?: string;
}

interface CheckoutContextData {
  event: EventData;
  paymentMethodsOffered: any[] | null;
  paymentRequired: boolean;
}

function useQueryParams() {
  return new URLSearchParams(window.location.search);
}

function isRegistrationAlreadyPaid(paymentStatus: string): boolean {
  return ["proof_uploaded", "paid", "verified", "cash_pending", "waived"].includes(paymentStatus);
}

function isPurchaseAlreadyPaid(status: string): boolean {
  return ["proof_uploaded", "completed"].includes(status);
}

function isAlreadyVerified(type: "registration" | "purchase", data: EventRegistrationData | PurchaseData): boolean {
  if (type === "registration") {
    return (data as EventRegistrationData).paymentStatus === "paid";
  }
  return (data as PurchaseData).status === "completed";
}

export default function CompletePayment() {
  const params = useQueryParams();
  const token = params.get("token") || "";
  const type = params.get("type") as "registration" | "purchase" | null;
  const idStr = params.get("id");
  const id = idStr ? parseInt(idStr, 10) : null;

  const [submitted, setSubmitted] = useState(false);
  const [submittedGuestToken, setSubmittedGuestToken] = useState<string | null>(null);

  // Check for pending new-registration flow via wouter navigation state.
  // The modal stores the pending payload in history.state when navigating here.
  // If state is absent (direct URL visit / new tab), pendingState will be null
  // and we fall through to the old query-param flow or show a session-expired UI.
  const [pendingState] = useState<PendingRegistrationState | null>(() => {
    try {
      const hs = window.history.state;
      if (hs?.registrationData && hs?.eventData) {
        // Ensure a stable idempotency key exists in history state.
        // We generate it once here and write it back so that a page refresh
        // keeps the same key — preventing duplicate registrations on refresh.
        if (!hs.idempotencyKey) {
          const key = crypto.randomUUID();
          try { window.history.replaceState({ ...hs, idempotencyKey: key }, ''); } catch {}
          return { ...(hs as PendingRegistrationState), idempotencyKey: key } as any;
        }
        return hs as PendingRegistrationState;
      }
    } catch {}
    return null;
  });

  // Old flow: query params (existing registrations / purchases via email link)
  // If neither flow applies, show a session-expired / invalid-link message.
  const validParams = !!token && !!type && !!id && !isNaN(id ?? NaN);

  // Always call useQuery unconditionally (Rules of Hooks) — the enabled flag
  // prevents any network request when we are in the new-registration flow or
  // when query params are missing/invalid.
  const { data, isLoading, isError } = useQuery<PaymentContextData>({
    queryKey: ["/api/guest", token, "payment-context", type, id],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/guest/${token}/payment-context?type=${type}&id=${id}`
      );
      return res.json();
    },
    enabled: validParams && !pendingState,
    retry: false,
  });

  // New paid-event registration flow — render after all hooks are declared
  if (pendingState) {
    return <NewRegistrationFlow pendingState={pendingState} />;
  }

  if (!validParams) {
    return (
      <SessionExpiredState />
    );
  }

  if (isLoading) {
    return (
      <PageShell>
        <PaymentSkeleton type={type ?? "registration"} />
      </PageShell>
    );
  }

  if (isError || !data) {
    return (
      <ErrorState message="This link appears to be invalid or has expired. Please use the link from your confirmation email." />
    );
  }

  if (type === "registration") {
    const registration = data.registration;
    if (!registration) {
      return (
        <ErrorState
          message="Registration not found. Please check your email for the correct link."
          token={token}
        />
      );
    }

    const event = registration.event;
    const alreadyDone = isRegistrationAlreadyPaid(registration.paymentStatus);
    // Same paid/free/donation rules as NewRegistrationFlow — paid events
    // need coach verification before the registration is final.
    const legacyPricingType = event?.pricingType || 'paid';
    const isPaidEvent =
      legacyPricingType !== 'free' && legacyPricingType !== 'donation';
    const legacyHeading = submitted
      ? isPaidEvent
        ? "Your payment proof has been submitted"
        : "Registration Completed"
      : "Complete Your Payment";

    return (
      <PageShell heading={legacyHeading}>
        <div className="space-y-6">
          {event && (
            <EventSummaryCard
              event={event}
              hidePaymentInstructions={submitted && isPaidEvent}
            />
          )}

          {alreadyDone ? (
            <AlreadySubmittedCard
              type="registration"
              token={token}
              isVerified={isAlreadyVerified("registration", registration)}
            />
          ) : submitted ? (
            <SubmittedConfirmation
              guestToken={submittedGuestToken || token}
              isRegistration
              isPaidEvent={isPaidEvent}
            />
          ) : (
            <>
              <SectionHeader title="Submit Payment Proof" />
              <PaymentProofUpload
                accessToken={token}
                type="registration"
                id={id}
                paymentInstruction={registration.paymentInstruction}
                paymentMethodsOffered={registration.paymentMethodsOffered}
                eventTitle={event?.title}
                onSuccess={() => setSubmitted(true)}
              />
            </>
          )}
        </div>
      </PageShell>
    );
  }

  if (type === "purchase") {
    const purchase = data.purchase;
    if (!purchase) {
      return (
        <ErrorState
          message="Purchase not found. Please check your email for the correct link."
          token={token}
        />
      );
    }

    const product = purchase.product;
    const alreadyDone = isPurchaseAlreadyPaid(purchase.status);

    return (
      <PageShell>
        <div className="space-y-6">
          {product && (
            <ProductSummaryCard
              product={product}
              amount={purchase.amount}
              currency={purchase.currency}
            />
          )}

          {alreadyDone ? (
            <AlreadySubmittedCard
              type="purchase"
              token={token}
              isVerified={isAlreadyVerified("purchase", purchase)}
            />
          ) : submitted ? (
            <SubmittedConfirmation guestToken={token} />
          ) : (
            <>
              <SectionHeader title="Submit Payment Proof" />
              <PaymentProofUpload
                accessToken={token}
                type="purchase"
                id={id}
                paymentInstruction={purchase.paymentInstruction}
                paymentMethodsOffered={purchase.paymentMethodsOffered}
                eventTitle={product?.title}
                onSuccess={() => setSubmitted(true)}
              />
              <SkipLink token={token} />
            </>
          )}
        </div>
      </PageShell>
    );
  }

  return <ErrorState message="Invalid payment type in the link." />;
}

// ---------------------------------------------------------------------------
// New paid-event registration flow (from wouter navigation state)
// ---------------------------------------------------------------------------

function NewRegistrationFlow({ pendingState }: { pendingState: PendingRegistrationState }) {
  const [, navigate] = useLocation();
  const [submitted, setSubmitted] = useState(false);
  const [submittedGuestToken, setSubmittedGuestToken] = useState<string | null>(null);

  const eventId = pendingState.registrationData.eventId;
  // returnPath was captured from the event page at the time the user clicked Proceed.
  const returnPath = pendingState.eventData.returnPath || '/';

  const { data: checkoutCtx, isLoading, isError } = useQuery<CheckoutContextData>({
    queryKey: ["/api/events", eventId, "checkout-context"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/events/${eventId}/checkout-context`);
      return res.json();
    },
    retry: false,
  });

  const handleBack = () => {
    // Navigate back to the specific event page, not browser history (deterministic).
    navigate(returnPath);
  };

  const handleSuccess = (result?: { guestAccessToken?: string }) => {
    // Replace history state so a page refresh after success doesn't re-show the
    // payment form with stale pending data.
    try { window.history.replaceState(null, '', window.location.href); } catch {}
    setSubmittedGuestToken(result?.guestAccessToken || null);
    setSubmitted(true);
  };

  if (isLoading) {
    return (
      <PageShell heading="Complete Your Payment">
        <PaymentSkeleton type="registration" />
      </PageShell>
    );
  }

  if (isError || !checkoutCtx) {
    return (
      <ErrorState
        message="Could not load payment details. Please go back and try again."
        onBack={handleBack}
      />
    );
  }

  if (!checkoutCtx.paymentRequired || !checkoutCtx.paymentMethodsOffered) {
    return (
      <ErrorState
        message="This event does not currently have payment methods configured. Please contact the event organizer."
        onBack={handleBack}
      />
    );
  }

  const eventData = pendingState.eventData;
  const newRegPayload: NewRegistrationPayload = {
    attendeeName: pendingState.registrationData.attendeeName,
    attendeeEmail: pendingState.registrationData.attendeeEmail,
    attendeePhone: pendingState.registrationData.attendeePhone,
    specialRequests: pendingState.registrationData.specialRequests,
    eventId: pendingState.registrationData.eventId,
    instanceId: pendingState.registrationData.instanceId,
  };

  // A "paid" event needs coach verification after the guest uploads proof,
  // so the post-submit screen must read as "pending" rather than "done".
  // Free and donation events skip that handoff — submitting is the final
  // step there, so we keep their existing "Registration Completed" copy.
  const effectivePricingType = (eventData.pricingType as any) || 'paid';
  const isPaidEvent =
    effectivePricingType !== 'free' && effectivePricingType !== 'donation';
  const submittedHeading = submitted
    ? isPaidEvent
      ? "Your payment proof has been submitted"
      : "Registration Completed"
    : "Complete Your Payment";

  return (
    <PageShell heading={submittedHeading}>
      <div className="space-y-6">
        <EventSummaryCard
          event={{
            id: eventData.id,
            title: eventData.title,
            startAt: eventData.startAt,
            endAt: eventData.endAt,
            location: eventData.location || null,
            price: eventData.price,
            currency: eventData.currency,
            pricingType: effectivePricingType,
            paymentInstructions: eventData.paymentInstructions,
          }}
          hidePaymentInstructions={submitted && isPaidEvent}
        />

        {submitted ? (
          <SubmittedConfirmation
            guestToken={submittedGuestToken || undefined}
            isRegistration
            isPaidEvent={isPaidEvent}
          />
        ) : (
          <>
            <SectionHeader title="Submit Payment Proof" />
            <PaymentProofUpload
              newRegistrationPayload={newRegPayload}
              paymentInstruction={eventData.paymentInstructions}
              paymentMethodsOffered={checkoutCtx.paymentMethodsOffered}
              idempotencyKey={pendingState.idempotencyKey}
              eventTitle={eventData.title}
              onSuccess={handleSuccess}
            />
            <div className="pt-2">
              <Button
                variant="ghost"
                className="w-full text-gray-500 hover:text-gray-700 gap-2"
                onClick={handleBack}
                data-testid="button-back-to-event"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to event
              </Button>
            </div>
          </>
        )}
      </div>
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// Shared UI components
// ---------------------------------------------------------------------------

function PaymentSkeleton({ type }: { type: "registration" | "purchase" }) {
  return (
    <div className="space-y-6" data-testid="payment-skeleton">
      <div className="border border-blue-100 rounded-lg p-4 space-y-3 bg-white">
        <Skeleton className="h-6 w-3/4" />
        {type === "registration" && (
          <div className="space-y-2 pt-1">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-3/5" />
          </div>
        )}
        <Skeleton className="h-7 w-24 mt-2" />
      </div>
      <div className="border-t border-gray-100 pt-4">
        <Skeleton className="h-5 w-40" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}

function PageShell({
  children,
  heading = "Complete Your Payment",
}: {
  children: React.ReactNode;
  heading?: string;
}) {
  return (
    <div className="min-h-screen bg-[#FDF6EE]">
      <div className="max-w-lg mx-auto px-4 py-10 space-y-6">
        <div className="flex justify-center mb-2">
          <Link href="/">
            <img
              src={riplectLogo}
              alt="Riplect"
              className="h-8 cursor-pointer hover:opacity-80 transition-opacity"
              data-testid="img-header-logo"
            />
          </Link>
        </div>
        <h1
          className={`${
            heading === "Your payment proof has been submitted" ? "text-xl" : "text-2xl"
          } font-bold text-center text-gray-900`}
          data-testid="heading-complete-payment"
        >
          {heading}
        </h1>
        {heading === "Complete Your Payment" && (
          <p className="text-center text-gray-500 text-sm">
            Upload proof of payment so the organizer can verify and confirm your registration.
          </p>
        )}
        <Card className="border-0 shadow-md">
          <CardContent className="p-6">{children}</CardContent>
        </Card>
        <div className="text-center">
          <p className="text-xs text-gray-400">Powered by Riplect</p>
        </div>
      </div>
    </div>
  );
}

function EventSummaryCard({
  event,
  hidePaymentInstructions = false,
}: {
  event: EventData;
  hidePaymentInstructions?: boolean;
}) {
  const eventDate = event.startAt ? new Date(event.startAt) : (event.date ? new Date(event.date) : null);
  const displayPrice = (event.pricingType === 'free' || event.isFree)
    ? "Free"
    : event.pricingType === 'donation'
    ? "Donation"
    : event.price
    ? `${event.currency || "USD"} ${event.price}`
    : null;

  return (
    <div
      className="border border-blue-100 rounded-lg p-4 space-y-2 bg-[#ffffff]"
      data-testid="event-summary-card"
    >
      <h2 className="font-semibold text-gray-900 text-lg">{event.title}</h2>
      <div className="space-y-1 text-sm text-gray-600">
        {eventDate && (
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-400 flex-shrink-0" />
            <span>{format(eventDate, "EEEE, MMMM d, yyyy")}</span>
          </div>
        )}
        {event.startAt ? (() => {
          const sd = new Date(event.startAt);
          if (!sd.getHours() && !sd.getMinutes()) return null;
          const sStr = sd.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
          const eStr = event.endAt ? (() => { const ed = new Date(event.endAt!); return (ed.getHours() || ed.getMinutes()) ? ed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null; })() : null;
          return (
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-400 flex-shrink-0" />
              <span>{sStr}{eStr ? ` – ${eStr}` : ''}</span>
            </div>
          );
        })() : event.startTime ? (
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-400 flex-shrink-0" />
            <span>
              {event.startTime}
              {event.endTime ? ` – ${event.endTime}` : ""}
            </span>
          </div>
        ) : null}
        {event.location && (
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-blue-400 flex-shrink-0" />
            <span>{event.location}</span>
          </div>
        )}
      </div>
      {displayPrice && (
        <div className="pt-1">
          <span className="text-lg font-bold text-[#b66667]" data-testid="text-event-price">
            {displayPrice}
          </span>
        </div>
      )}
      {event.paymentInstructions && !hidePaymentInstructions && (
        <div className="bg-amber-50 border border-amber-100 rounded-md p-3 mt-2">
          <p className="text-xs font-medium text-amber-700 mb-1">Payment Instructions</p>
          <p className="text-sm text-amber-800 whitespace-pre-wrap">
            {event.paymentInstructions}
          </p>
        </div>
      )}
    </div>
  );
}

function ProductSummaryCard({
  product,
  amount,
  currency,
}: {
  product: ProductData;
  amount: string;
  currency: string;
}) {
  const displayPrice = product.isFree ? "Free" : `${currency} ${amount}`;
  return (
    <div
      className="bg-purple-50 border border-purple-100 rounded-lg p-4 space-y-2"
      data-testid="product-summary-card"
    >
      <div className="flex items-center gap-2">
        <ShoppingBag className="w-5 h-5 text-purple-400" />
        <h2 className="font-semibold text-gray-900 text-lg">{product.title}</h2>
      </div>
      <p className="text-lg font-bold text-[#b66667]" data-testid="text-product-price">
        {displayPrice}
      </p>
      {product.paymentInstructions && (
        <div className="bg-amber-50 border border-amber-100 rounded-md p-3 mt-2">
          <p className="text-xs font-medium text-amber-700 mb-1">Payment Instructions</p>
          <p className="text-sm text-amber-800 whitespace-pre-wrap">
            {product.paymentInstructions}
          </p>
        </div>
      )}
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="border-t border-gray-100 pt-4">
      <h3 className="font-semibold text-gray-800 text-base">{title}</h3>
    </div>
  );
}

function SkipLink({ token }: { token: string }) {
  return (
    <div className="text-center pt-2">
      <Link href={`/guest/${token}`}>
        <span
          className="text-sm text-gray-400 hover:text-[#b66667] underline underline-offset-2 cursor-pointer transition-colors"
          data-testid="link-skip-for-now"
        >
          Skip for now — I'll pay later
        </span>
      </Link>
    </div>
  );
}

function SubmittedConfirmation({
  guestToken,
  isRegistration,
  isPaidEvent = false,
}: {
  guestToken?: string;
  isRegistration?: boolean;
  isPaidEvent?: boolean;
}) {
  // Paid event registrations require coach verification before the
  // booking is final, so we surface the "waiting for approval" state
  // here. Free/donation registrations and product purchases keep their
  // existing copy.
  const showPendingApproval = isRegistration && isPaidEvent;
  const heading = showPendingApproval
    ? "Payment proof submitted, waiting for approval"
    : isRegistration
    ? "Registration Completed"
    : "Payment proof submitted!";
  const body = showPendingApproval
    ? "Your payment has been submitted. The organizer will verify it shortly and we’ll email you the full event details once confirmed."
    : isRegistration
    ? "Your payment details have been sent to the organizer. You'll receive a confirmation once it's verified."
    : "Your payment details have been sent for verification. You'll receive a confirmation once it's approved.";

  return (
    <div
      className="flex flex-col items-center gap-4 py-6 text-center"
      data-testid="submission-confirmation"
    >
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
        <CheckCircle2 className="w-8 h-8 text-green-600" />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-gray-900">{heading}</h3>
        <p className="text-sm text-gray-500 mt-1">{body}</p>
      </div>
      {guestToken && (
        <Link href={`/guest/${guestToken}`}>
          <Button
            variant="outline"
            className="border-[#b66667] text-[#b66667] hover:bg-red-50 gap-2"
            data-testid="button-go-to-portal"
          >
            View your bookings
            <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      )}
    </div>
  );
}

function AlreadySubmittedCard({
  type,
  token,
  isVerified,
}: {
  type: "registration" | "purchase";
  token: string;
  isVerified: boolean;
}) {
  return (
    <div
      className={`rounded-lg p-4 flex flex-col items-center gap-3 text-center ${
        isVerified
          ? "bg-emerald-50 border border-emerald-200"
          : "bg-blue-50 border border-blue-200"
      }`}
      data-testid="already-submitted-card"
    >
      <CheckCircle2
        className={`w-8 h-8 ${isVerified ? "text-emerald-600" : "text-blue-500"}`}
      />
      <div>
        <p className="font-semibold text-gray-900">
          {isVerified ? "Payment verified!" : "Payment proof already submitted"}
        </p>
        <p className="text-sm text-gray-500 mt-1">
          {isVerified
            ? "Your payment has been confirmed by the organizer."
            : "Your payment proof is under review. We'll notify you once it's verified."}
        </p>
      </div>
      <Link href={`/guest/${token}`}>
        <Button
          variant="outline"
          className="border-[#b66667] text-[#b66667] hover:bg-red-50 gap-2"
          data-testid="button-go-to-portal-already-done"
        >
          View your {type === "registration" ? "registrations" : "purchases"}
          <ArrowRight className="w-4 h-4" />
        </Button>
      </Link>
    </div>
  );
}

function SessionExpiredState() {
  return (
    <div className="min-h-screen bg-[#FDF6EE] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
          <AlertCircle className="w-8 h-8 text-amber-500" />
        </div>
        <h2
          className="text-xl font-semibold text-gray-900"
          data-testid="heading-session-expired"
        >
          Session expired
        </h2>
        <p className="text-gray-500 text-sm" data-testid="text-session-expired">
          Your registration session is no longer active. Please return to the event page and register again.
        </p>
        <Link href="/">
          <Button
            variant="outline"
            className="border-[#b66667] text-[#b66667] hover:bg-red-50 gap-2"
            data-testid="button-go-home-expired"
          >
            <ArrowLeft className="w-4 h-4" />
            Go to homepage
          </Button>
        </Link>
      </div>
    </div>
  );
}

function ErrorState({
  message,
  token,
  onBack,
}: {
  message: string;
  token?: string;
  onBack?: () => void;
}) {
  return (
    <div className="min-h-screen bg-[#FDF6EE] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900" data-testid="error-heading">
          Something went wrong
        </h2>
        <p className="text-gray-500 text-sm" data-testid="error-message">
          {message}
        </p>
        {onBack && (
          <Button
            variant="outline"
            className="border-gray-300 text-gray-600 hover:bg-gray-50 gap-2"
            onClick={onBack}
            data-testid="button-back-from-error"
          >
            <ArrowLeft className="w-4 h-4" />
            Go back
          </Button>
        )}
        {token && (
          <Link href={`/guest/${token}`}>
            <Button
              variant="outline"
              className="border-[#b66667] text-[#b66667] hover:bg-red-50 gap-2"
              data-testid="button-go-to-portal-error"
            >
              Go to your portal
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}
