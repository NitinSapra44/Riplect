import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { Package, CheckCircle, Clock, Mail, Phone, ShoppingBag, Upload, ShieldCheck, ShieldX } from "lucide-react";
import { formatPrice } from "@shared/currencies";

export interface ProductPurchase {
  id: number;
  productId: number;
  productTitle: string;
  email: string;
  buyerName?: string;
  buyerPhone?: string;
  amount: string;
  currency: string;
  status: string;
  downloadCount: number;
  accessToken?: string;
  createdAt: string;
  paymentProofUrl?: string | null;
  paymentReferenceText?: string | null;
  paymentMethodSelected?: string | null;
  paymentMarkedAt?: string | null;
}

function statusBadge(status: string) {
  if (status === "completed") {
    return <Badge className="bg-green-100 text-green-700 border-0 text-xs">Verified</Badge>;
  }
  if (status === "rejected") {
    return <Badge className="bg-red-100 text-red-700 border-0 text-xs">Rejected</Badge>;
  }
  if (status === "proof_uploaded") {
    return <Badge className="bg-purple-100 text-purple-700 border-0 text-xs flex items-center gap-0.5"><Upload className="w-2.5 h-2.5" />Proof Submitted</Badge>;
  }
  return <Badge className="bg-amber-100 text-amber-700 border-0 text-xs">Pending</Badge>;
}

export function useProductPurchaseNeedsAttentionCount() {
  const { data: purchases = [] } = useQuery<ProductPurchase[]>({
    queryKey: ["/api/dashboard/products/purchases"],
    refetchInterval: 30000,
  });
  return purchases.filter(p => p.status === "pending" || p.status === "proof_uploaded").length;
}

export function useProductPurchasesData() {
  return useQuery<ProductPurchase[]>({
    queryKey: ["/api/dashboard/products/purchases"],
    refetchInterval: 30000,
  });
}

interface PurchaseCardProps {
  purchase: ProductPurchase;
  isHighlighted: boolean;
  onVerify: (id: number) => void;
  onReject: (id: number) => void;
  processingId: number | null;
}

function isImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.toLowerCase();
    const hasImageExtension = pathname.endsWith('.jpg') || pathname.endsWith('.jpeg') || pathname.endsWith('.png') || pathname.endsWith('.webp') || pathname.endsWith('.gif');
    if (hasImageExtension) return true;
    const contentType = parsed.searchParams.get('response-content-type') || parsed.searchParams.get('Content-Type') || '';
    return contentType.startsWith('image/');
  } catch {
    const lower = url.toLowerCase();
    return lower.includes('.jpg') || lower.includes('.jpeg') || lower.includes('.png') || lower.includes('.webp') || lower.includes('.gif');
  }
}

function PurchaseCard({ purchase, isHighlighted, onVerify, onReject, processingId }: PurchaseCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const hasProof = purchase.status === "proof_uploaded";

  useEffect(() => {
    if (isHighlighted && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [isHighlighted]);

  return (
    <div
      ref={cardRef}
      className={`px-4 py-4 hover:bg-gray-50 transition-all ${isHighlighted ? "ring-2 ring-[#C96868]/40 ring-inset bg-[#FDF6EE]/40" : ""} ${hasProof ? "bg-purple-50/30" : ""}`}
      data-testid={`purchase-card-${purchase.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Package className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <span className="text-sm font-medium text-gray-900 truncate">{purchase.productTitle}</span>
            {statusBadge(purchase.status)}
          </div>

          <p className="text-sm font-semibold text-[#C96868]">
            {formatPrice(purchase.amount, purchase.currency || "USD")}
          </p>

          <div className="mt-2 space-y-0.5">
            {purchase.buyerName && (
              <p className="text-xs text-gray-600 font-medium">{purchase.buyerName}</p>
            )}
            <p className="text-xs text-gray-500 flex items-center gap-1">
              <Mail className="w-3 h-3" />
              {purchase.email}
            </p>
            {purchase.buyerPhone && (
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <Phone className="w-3 h-3" />
                {purchase.buyerPhone}
              </p>
            )}
          </div>

          <p className="text-xs text-gray-400 mt-1.5">
            {purchase.createdAt ? format(new Date(purchase.createdAt), "MMM d, yyyy 'at' h:mm a") : ""}
          </p>

          {purchase.status === "completed" && purchase.downloadCount != null && (
            <p className="text-xs text-green-600 mt-1">
              Downloaded {purchase.downloadCount} time{purchase.downloadCount !== 1 ? "s" : ""}
            </p>
          )}
        </div>

      </div>

      {hasProof && (
        <div className="mt-2 p-3 bg-purple-50 border border-purple-100 rounded-md text-xs space-y-1.5">
          <p className="font-semibold text-purple-800 mb-1 flex items-center gap-1"><Upload className="w-3 h-3" />Payment Proof</p>
          {purchase.paymentReferenceText && (
            <div><span className="font-medium text-purple-900">Reference:</span> <span className="text-purple-700">{purchase.paymentReferenceText}</span></div>
          )}
          {purchase.paymentMethodSelected && (
            <div><span className="font-medium text-purple-900">Method:</span> <span className="text-purple-700">{purchase.paymentMethodSelected}</span></div>
          )}
          {purchase.paymentProofUrl && (
            <div>
              <span className="font-medium text-purple-900">Proof:</span>{" "}
              {purchase.paymentProofUrl.startsWith('http') && isImageUrl(purchase.paymentProofUrl) ? (
                <a href={purchase.paymentProofUrl} target="_blank" rel="noopener noreferrer">
                  <img src={purchase.paymentProofUrl} alt="Payment proof" className="mt-1 max-h-32 rounded border border-purple-200" />
                </a>
              ) : (
                <a href={purchase.paymentProofUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline truncate block max-w-full">{purchase.paymentProofUrl}</a>
              )}
            </div>
          )}
          {purchase.paymentMarkedAt && (
            <div className="text-purple-600">Submitted: {format(new Date(purchase.paymentMarkedAt), "d MMM yyyy, HH:mm")}</div>
          )}
        </div>
      )}

      {(purchase.status === "pending" || purchase.status === "proof_uploaded") && (
        <div className="flex gap-2 mt-3">
          <Button
            size="sm"
            onClick={() => onVerify(purchase.id)}
            disabled={processingId === purchase.id}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs h-8"
            data-testid={`button-verify-payment-${purchase.id}`}
          >
            <ShieldCheck className="w-3.5 h-3.5 mr-1" />
            Verify Payment
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onReject(purchase.id)}
            disabled={processingId === purchase.id}
            className="flex-1 border-red-200 text-red-600 hover:bg-red-50 text-xs h-8"
            data-testid={`button-reject-purchase-${purchase.id}`}
          >
            <ShieldX className="w-3.5 h-3.5 mr-1" />
            Reject
          </Button>
        </div>
      )}

      {purchase.status === "completed" && (
        <div className="mt-2 flex items-center gap-1 text-xs text-green-600">
          <CheckCircle className="w-3.5 h-3.5" />
          Download link sent to buyer
        </div>
      )}
    </div>
  );
}

interface ProductPurchasesPanelProps {
  highlightedPurchaseId?: number | null;
}

export function ProductPurchasesPanel({ highlightedPurchaseId }: ProductPurchasesPanelProps = {}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [rejectDialogId, setRejectDialogId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [verifyDialogId, setVerifyDialogId] = useState<number | null>(null);
  const [verifyMessage, setVerifyMessage] = useState("");

  const { data: purchases = [], isLoading } = useQuery<ProductPurchase[]>({
    queryKey: ["/api/dashboard/products/purchases"],
  });

  const verifyMutation = useMutation({
    mutationFn: async ({ purchaseId, message }: { purchaseId: number; message: string }) => {
      const res = await apiRequest("POST", `/api/dashboard/products/purchases/${purchaseId}/verify-payment`, { message: message || undefined });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/products/purchases"] });
      toast({
        title: "Payment verified",
        description: "Download link sent to buyer's email.",
      });
      setProcessingId(null);
      setVerifyDialogId(null);
      setVerifyMessage("");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to verify payment. Please try again.",
        variant: "destructive",
      });
      setProcessingId(null);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ purchaseId, reason }: { purchaseId: number; reason: string }) => {
      const res = await apiRequest("POST", `/api/dashboard/products/purchases/${purchaseId}/reject`, { reason });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/products/purchases"] });
      toast({
        title: "Request rejected",
        description: "The buyer has been notified to resubmit their payment proof.",
      });
      setProcessingId(null);
      setRejectDialogId(null);
      setRejectReason("");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to reject request. Please try again.",
        variant: "destructive",
      });
      setProcessingId(null);
    },
  });

  const handleVerify = (purchaseId: number) => {
    setVerifyDialogId(purchaseId);
    setVerifyMessage("");
  };

  const handleReject = (purchaseId: number) => {
    setRejectDialogId(purchaseId);
    setRejectReason("");
  };

  const handleConfirmVerify = () => {
    if (!verifyDialogId) return;
    setProcessingId(verifyDialogId);
    verifyMutation.mutate({ purchaseId: verifyDialogId, message: verifyMessage });
  };

  const handleConfirmReject = () => {
    if (!rejectDialogId) return;
    setProcessingId(rejectDialogId);
    rejectMutation.mutate({ purchaseId: rejectDialogId, reason: rejectReason });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#C96868]" />
      </div>
    );
  }

  if (purchases.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 px-6 text-center">
        <ShoppingBag className="w-10 h-10 text-gray-300 mb-3" />
        <p className="text-sm font-medium text-gray-600">No purchase requests yet</p>
        <p className="text-xs text-gray-400 mt-1">
          When buyers submit purchase requests for your products, they'll appear here.
        </p>
      </div>
    );
  }

  const proofUploaded = purchases.filter(p => p.status === "proof_uploaded");
  const pending = purchases.filter(p => p.status === "pending");
  const others = purchases.filter(p => p.status !== "pending" && p.status !== "proof_uploaded");

  return (
    <>
      <Dialog open={!!verifyDialogId} onOpenChange={(open) => { if (!open) { setVerifyDialogId(null); setVerifyMessage(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">Confirm this buyer's payment. They will receive a download link via email.</p>
            <div>
              <Label htmlFor="verify-message-purchase" className="text-sm">Message to buyer (optional)</Label>
              <Textarea
                id="verify-message-purchase"
                value={verifyMessage}
                onChange={e => setVerifyMessage(e.target.value)}
                placeholder="e.g., Thanks for your purchase! Enjoy the product."
                className="mt-1"
                rows={3}
                data-testid="textarea-verify-message-purchase"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setVerifyDialogId(null); setVerifyMessage(""); }}>Cancel</Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              disabled={verifyMutation.isPending}
              onClick={handleConfirmVerify}
              data-testid="button-confirm-verify-purchase"
            >
              <ShieldCheck className="w-4 h-4 mr-1" />
              {verifyMutation.isPending ? "Verifying..." : "Verify Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejectDialogId} onOpenChange={(open) => { if (!open) { setRejectDialogId(null); setRejectReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Payment Proof</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">Optionally provide a reason. The buyer will be notified and prompted to resubmit.</p>
            <div>
              <Label htmlFor="reject-reason-purchase" className="text-sm">Reason (optional)</Label>
              <Textarea id="reject-reason-purchase" value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="e.g., Screenshot is unclear, please upload a valid proof." className="mt-1" rows={3} data-testid="textarea-reject-reason-purchase" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectDialogId(null); setRejectReason(""); }}>Cancel</Button>
            <Button variant="destructive" disabled={rejectMutation.isPending} onClick={handleConfirmReject} data-testid="button-confirm-reject-purchase">
              {rejectMutation.isPending ? "Rejecting..." : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ScrollArea className="h-full">
        <div className="divide-y divide-gray-100">
          {proofUploaded.length > 0 && (
            <div className="px-4 py-2 bg-purple-50">
              <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide flex items-center gap-1">
                <Upload className="w-3 h-3" />
                Proof Submitted – Awaiting Review ({proofUploaded.length})
              </p>
            </div>
          )}
          {pending.length > 0 && (
            <div className="px-4 py-2 bg-amber-50">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Awaiting Payment Verification ({pending.length})
              </p>
            </div>
          )}
          {[...proofUploaded, ...pending, ...others].map((purchase) => (
            <PurchaseCard
              key={purchase.id}
              purchase={purchase}
              isHighlighted={highlightedPurchaseId === purchase.id}
              onVerify={handleVerify}
              onReject={handleReject}
              processingId={processingId}
            />
          ))}
        </div>
      </ScrollArea>
    </>
  );
}
