import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { compressImage } from "@/lib/imageCompression";
import { useToast } from "@/hooks/use-toast";
import { posthog } from "@/lib/posthog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, X, Loader2, CheckCircle2, Coins } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  PaymentMethodOffered,
  getMethodLabel,
  getMethodIcon,
  renderMethodDetails,
} from "@/components/payment-method-details";

export interface NewRegistrationPayload {
  attendeeName: string;
  attendeeEmail: string;
  attendeePhone?: string;
  specialRequests?: string;
  eventId: number;
  instanceId?: number | null;
}

interface PaymentProofUploadProps {
  accessToken?: string;
  type?: "registration" | "purchase";
  id?: number | null;
  newRegistrationPayload?: NewRegistrationPayload;
  paymentInstruction?: string | null;
  paymentMethodsOffered?: PaymentMethodOffered[] | null;
  /** Client-generated UUID for server-side idempotency deduplication. */
  idempotencyKey?: string;
  /** Optional event/product title for richer PostHog tracking. */
  eventTitle?: string;
  onSuccess?: (result?: { guestAccessToken?: string }) => void;
}

export function PaymentProofUpload({
  accessToken,
  type,
  id,
  newRegistrationPayload,
  paymentInstruction,
  paymentMethodsOffered,
  idempotencyKey,
  eventTitle,
  onSuccess,
}: PaymentProofUploadProps) {
  const { toast } = useToast();

  const enabledMethods = (paymentMethodsOffered || []).filter((m) => m.enabled !== false);
  const autoSelected = enabledMethods.length === 1 ? enabledMethods[0].type : null;

  const [selectedMethod, setSelectedMethod] = useState<string | null>(autoSelected);
  const [referenceText, setReferenceText] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [proofImageFile, setProofImageFile] = useState<File | null>(null);
  const [proofImagePreview, setProofImagePreview] = useState<string | null>(null);
  const [uploadedProofUrl, setUploadedProofUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);

  const uploadIdRef = useRef(0);
  // Guard against concurrent submissions — set to true while a mutation is
  // in flight, preventing a second tap from queueing another request before
  // React re-renders to disable the button.
  const submittingRef = useRef(false);

  const isNewFlow = !!newRegistrationPayload;

  const oldFlowEndpoint =
    type === "registration"
      ? `/api/guest/${accessToken}/registrations/${id}/mark-paid`
      : `/api/guest/${accessToken}/purchases/${id}/mark-paid`;

  const uploadEndpoint = isNewFlow
    ? `/api/events/${newRegistrationPayload!.eventId}/upload-payment-proof`
    : `/api/guest/${accessToken}/upload-payment-proof`;

  const trackingProps = {
    event_id: newRegistrationPayload?.eventId ?? id,
    event_title: eventTitle,
    context: isNewFlow ? "new_registration" : type,
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (isNewFlow) {
        const response = await apiRequest("POST", `/api/events/${newRegistrationPayload!.eventId}/register-and-pay`, {
          attendeeName: newRegistrationPayload!.attendeeName,
          attendeeEmail: newRegistrationPayload!.attendeeEmail,
          attendeePhone: newRegistrationPayload!.attendeePhone || '',
          specialRequests: newRegistrationPayload!.specialRequests || '',
          ...(newRegistrationPayload!.instanceId ? { instanceId: newRegistrationPayload!.instanceId } : {}),
          selectedMethod,
          referenceText,
          proofUrl,
          proofImageUrl: uploadedProofUrl,
          ...(idempotencyKey ? { idempotencyKey } : {}),
        });
        return response;
      }
      return apiRequest("POST", oldFlowEndpoint, {
        referenceText,
        proofUrl,
        selectedMethod,
        proofImageUrl: uploadedProofUrl,
      });
    },
    onSuccess: async (response: any) => {
      let result: any = null;
      if (isNewFlow) {
        try { result = await response.json(); } catch {}
        posthog.capture('event_registered', {
          ...trackingProps,
          payment_required: true,
          payment_method: selectedMethod,
        });
      }
      submittingRef.current = false;
      setSucceeded(true);
      onSuccess?.(result ? { guestAccessToken: result.guestAccessToken } : undefined);
    },
    onError: (error: unknown) => {
      submittingRef.current = false;
      // 409 with code ALREADY_REGISTERED means the guest's registration already
      // exists — treat it as a successful outcome so they see the confirmation
      // screen instead of an error. Other 409s (e.g. EVENT_FULL) are real errors
      // and must fall through to the toast below.
      if (
        isNewFlow &&
        error instanceof ApiError &&
        error.status === 409 &&
        (error.data as any)?.code === "ALREADY_REGISTERED"
      ) {
        const guestAccessToken = (error.data as any)?.guestAccessToken || undefined;
        setSucceeded(true);
        onSuccess?.({ guestAccessToken });
        return;
      }
      const serverMessage =
        error instanceof ApiError ? error.message : undefined;
      toast({
        title: "Submission failed",
        description: serverMessage || "Failed to submit your payment details. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    posthog.capture('payment_proof_upload_started', {
      ...trackingProps,
      file_size_kb: Math.round(file.size / 1024),
      file_type: file.type,
      payment_method: selectedMethod,
    });

    if (file.size > 25 * 1024 * 1024) {
      posthog.capture('payment_proof_upload_failed', {
        ...trackingProps,
        reason: 'file_too_large',
        payment_method: selectedMethod,
      });
      toast({
        title: "File too large",
        description: "Please select an image under 25MB.",
        variant: "destructive",
      });
      return;
    }
    const uploadId = ++uploadIdRef.current;
    const compressed = await compressImage(file);
    if (uploadId !== uploadIdRef.current) return;
    if (proofImagePreview) URL.revokeObjectURL(proofImagePreview);
    setProofImageFile(compressed);
    setProofImagePreview(URL.createObjectURL(compressed));
    setUploadedProofUrl(null);
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", compressed);
      const response = await fetch(uploadEndpoint, { method: "POST", body: formData });
      if (!response.ok) throw new Error("Upload failed");
      const result = await response.json();
      if (uploadId === uploadIdRef.current) {
        setUploadedProofUrl(result.url);
        posthog.capture('payment_proof_upload_succeeded', {
          ...trackingProps,
          payment_method: selectedMethod,
        });
      }
    } catch {
      if (uploadId === uploadIdRef.current) {
        posthog.capture('payment_proof_upload_failed', {
          ...trackingProps,
          reason: 'upload_error',
          payment_method: selectedMethod,
        });
        toast({
          title: "Upload failed",
          description: "Failed to upload your screenshot. Please try again.",
          variant: "destructive",
        });
        setProofImageFile(null);
        setProofImagePreview(null);
      }
    } finally {
      if (uploadId === uploadIdRef.current) setIsUploading(false);
    }
  };

  const removeImage = () => {
    uploadIdRef.current++;
    if (proofImagePreview) URL.revokeObjectURL(proofImagePreview);
    setProofImageFile(null);
    setProofImagePreview(null);
    setUploadedProofUrl(null);
    setIsUploading(false);
  };

  const methods = enabledMethods;
  const requiresMethodSelection = methods.length > 0 && !selectedMethod;
  const isCashSelected = selectedMethod === "cash";

  // Non-cash submissions must include at least one form of payment proof so
  // coaches don't have to chase guests for confirmation. Treat "no method
  // selected yet" and "no methods configured" as non-cash for validation.
  const proofRequired = !isCashSelected;
  const hasAnyProof =
    referenceText.trim().length > 0 ||
    !!uploadedProofUrl ||
    proofUrl.trim().length > 0;

  const canSubmit =
    !requiresMethodSelection &&
    !isUploading &&
    !submitMutation.isPending &&
    (!proofRequired || hasAnyProof);

  const showProofRequiredError = attemptedSubmit && proofRequired && !hasAnyProof;

  // Belt-and-suspenders guard: prevents a second mutation from firing in the
  // brief window between a button tap and the React re-render that sets
  // isPending = true (e.g. rapid double-tap on mobile).
  const handleSubmit = () => {
    if (submittingRef.current) return;
    if (proofRequired && !hasAnyProof) {
      setAttemptedSubmit(true);
      return;
    }
    if (!canSubmit) return;
    submittingRef.current = true;
    submitMutation.mutate();
  };

  if (succeeded) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center" data-testid="payment-proof-success">
        <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center">
          <CheckCircle2 className="w-7 h-7 text-green-600" />
        </div>
        <h3 className="font-semibold text-gray-900">
          {isCashSelected ? "You're all set!" : "Payment proof submitted!"}
        </h3>
        <p className="text-sm text-gray-500">
          {isCashSelected
            ? "Please bring exact cash to the event. The organizer has been notified."
            : "Your payment details have been sent for verification. We'll notify you once confirmed."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="payment-proof-upload-form">
      {methods.length > 0 && (
        <div>
          {methods.length > 1 && (
            <Label className="text-sm font-medium">Select Payment Method</Label>
          )}
          <div className={`space-y-2 ${methods.length > 1 ? "mt-2" : ""}`}>
            {methods.map((method) => (
              <div
                key={method.type}
                className={`border rounded-md p-3 cursor-pointer transition-colors ${
                  selectedMethod === method.type
                    ? "border-[#b66667] bg-[#FDF6EE]/50 ring-1 ring-[#b66667]/30"
                    : "border-gray-200 bg-white"
                }`}
                onClick={() => {
                  setSelectedMethod(method.type);
                  posthog.capture('payment_method_selected', {
                    ...trackingProps,
                    payment_method: method.type,
                  });
                  if (method.type === "upi" || method.type === "payment_link") {
                    setShowReminderModal(true);
                  }
                }}
                data-testid={`method-option-${method.type}`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      selectedMethod === method.type ? "border-[#b66667]" : "border-gray-300"
                    }`}
                  >
                    {selectedMethod === method.type && (
                      <div className="w-2 h-2 rounded-full bg-[#b66667]" />
                    )}
                  </div>
                  <span className="text-[#b66667]">{getMethodIcon(method.type)}</span>
                  <span className="text-sm font-semibold text-gray-800">
                    {getMethodLabel(method.type)}
                  </span>
                </div>
                {selectedMethod === method.type && (
                  <div className={`mt-2 space-y-1 ${method.type === "upi" ? "" : "pl-6"}`}>
                    {renderMethodDetails(method)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {methods.length === 0 && paymentInstruction && (
        <div className="bg-white border border-orange-100 rounded-md p-3">
          <p className="text-xs font-medium text-gray-500 mb-1">Payment Instructions</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{paymentInstruction}</p>
        </div>
      )}

      {isCashSelected ? (
        <div className="space-y-4" data-testid="cash-payment-section">
          <div className="bg-amber-50 border border-amber-100 rounded-md p-4 flex items-start gap-3">
            <Coins className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <p className="font-medium mb-1">Pay in cash at the event</p>
              <p>
                Please bring exact cash to hand to the organizer. No proof upload is
                needed — they'll mark it paid once they collect from you.
              </p>
            </div>
          </div>
          <Button
            className="w-full bg-[#b66667] text-white hover:bg-[#a05555]"
            onClick={handleSubmit}
            disabled={!canSubmit}
            data-testid="button-confirm-cash-payment"
          >
            {submitMutation.isPending ? "Confirming..." : "Confirm — I'll pay cash at the event"}
          </Button>
        </div>
      ) : (<>
      <p className="text-sm font-medium text-gray-700">
        Proof of payment{" "}
        <span className="text-xs font-normal text-gray-500">(at least one required)</span>
      </p>

      <div>
        <Label htmlFor="cp-reference" className="text-sm font-medium">
          Payment Reference / Transaction ID
        </Label>
        <Input
          id="cp-reference"
          value={referenceText}
          onChange={(e) => setReferenceText(e.target.value)}
          placeholder="e.g., Transaction #12345 or UPI Ref ID"
          className="mt-1"
          data-testid="input-payment-reference"
        />
      </div>

      <div>
        <Label className="text-sm font-medium">Upload Payment Screenshot</Label>
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
                onClick={removeImage}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center hover:bg-red-600"
                data-testid="button-remove-proof-image"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            {isUploading && (
              <p className="text-xs text-gray-500 flex items-center gap-1" data-testid="status-uploading">
                <Loader2 className="w-3 h-3 animate-spin" />
                Uploading...
              </p>
            )}
            {uploadedProofUrl && !isUploading && (
              <p className="text-xs text-green-600 flex items-center gap-1" data-testid="status-uploaded">
                <CheckCircle2 className="w-3 h-3" /> Screenshot uploaded
              </p>
            )}
          </div>
        ) : (
          <label
            className="mt-2 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-md p-4 cursor-pointer hover:border-[#b66667]/40 hover:bg-[#FDF6EE]/30 transition-colors"
            data-testid="label-upload-proof"
          >
            <Upload className="w-5 h-5 text-gray-400" />
            <span className="text-sm text-gray-500">Click to upload a screenshot</span>
            <span className="text-xs text-gray-400">JPG, PNG or WebP (max 25MB)</span>
            <input
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              className="hidden"
              onChange={handleFileChange}
              data-testid="input-proof-image-file"
            />
          </label>
        )}
      </div>

      {showProofRequiredError && (
        <p
          role="alert"
          aria-live="polite"
          className="text-sm text-red-600"
          data-testid="error-proof-required"
        >
          Please add at least one payment proof: a transaction ID or a screenshot.
        </p>
      )}

      <Button
        className="w-full bg-[#b66667] text-white hover:bg-[#a05555]"
        onClick={handleSubmit}
        disabled={!canSubmit}
        data-testid="button-submit-payment-proof"
      >
        {isUploading
          ? "Uploading image..."
          : submitMutation.isPending
          ? "Submitting..."
          : "Confirm Payment"}
      </Button>
      </>)}

      <Dialog open={showReminderModal} onOpenChange={setShowReminderModal}>
        <DialogContent className="sm:max-w-sm" data-testid="dialog-proof-reminder">
          <DialogHeader>
            <DialogDescription className="text-gray-700 text-base">
              Once you complete your payment, upload your payment proof here and click{" "}
              <span className="font-semibold">Confirm Payment</span>.
            </DialogDescription>
          </DialogHeader>
          <Button
            className="w-full bg-[#b66667] text-white hover:bg-[#a05555] mt-2"
            onClick={() => setShowReminderModal(false)}
            data-testid="button-reminder-ok"
          >
            OK, got it
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
