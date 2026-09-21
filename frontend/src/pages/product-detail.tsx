import { useState, useEffect, useRef } from "react";
import { linkifyText } from "@/lib/linkify";
import riplekLogo1 from "@assets/Color_Variations_copy_9@144x-2_1775978761578.png";
import { useRoute, Link, useLocation } from "wouter";
import { useSmartBack } from "@/hooks/use-smart-back";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Share2, Download, DollarSign, Package, FileText, Video, Image, Check, Loader2, UserCircle, CheckCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { posthog } from "@/lib/posthog";
import { generateProductShareMessage } from "@/lib/whatsapp-share";
import { format } from "date-fns";
import defaultProfileImage from "@assets/WhatsApp Image 2025-11-28 at 13.31.40_1764389051024.jpeg";
import { formatPrice } from "@shared/currencies";

interface DigitalProduct {
  id: number;
  profileId: number;
  title: string;
  description?: string;
  thumbnailDescription?: string;
  price: string;
  currency?: string;
  productType?: string;
  isFree?: boolean;
  requiresPayment?: boolean;
  paymentInstructions?: string;
  imageUrl?: string;
  fileUrl?: string;
  fileMimeType?: string;
  fileName?: string;
  fileSize?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Profile {
  id: number;
  userId: string;
  username: string;
  displayName: string;
  title?: string;
  bio?: string;
  profileImageUrl?: string;
}

interface PurchaseStatus {
  hasPurchased: boolean;
  purchaseId?: number;
}

interface User {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
}

const PRODUCT_TYPES = {
  pdf: { label: "PDF Document", icon: FileText, color: "bg-red-100 text-red-700" },
  video: { label: "Video", icon: Video, color: "bg-purple-100 text-purple-700" },
  image: { label: "Image", icon: Image, color: "bg-blue-100 text-blue-700" },
} as const;

export default function ProductDetail() {
  const [, params] = useRoute("/:username/product/:productId");
  const username = params?.username;
  const productId = params?.productId;
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const goBack = useSmartBack(`/${username}#products`);
  const queryClient = useQueryClient();
  const { user: authUser, isAuthenticated } = useAuth();
  const user = authUser as User | undefined;
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPurchaseDialogOpen, setIsPurchaseDialogOpen] = useState(false);
  const [isFreeDownloadDialogOpen, setIsFreeDownloadDialogOpen] = useState(false);
  const [isProcessingPurchase, setIsProcessingPurchase] = useState(false);
  const [isProcessingFreeDownload, setIsProcessingFreeDownload] = useState(false);
  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [purchaseRequestSuccess, setPurchaseRequestSuccess] = useState(false);
  const [receivedPaymentInstructions, setReceivedPaymentInstructions] = useState<string | null>(null);
  const [purchaseGuestToken, setPurchaseGuestToken] = useState<string | null>(null);
  const [purchasedItemId, setPurchasedItemId] = useState<number | null>(null);
  const verificationAttempted = useRef(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Handle Stripe checkout success callback
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get('success');
    const sessionId = urlParams.get('session_id');
    const canceled = urlParams.get('canceled');

    if (canceled) {
      toast({
        title: "Payment canceled",
        description: "Your payment was canceled. You can try again anytime.",
      });
      // Clean up URL
      window.history.replaceState({}, '', `/${username}/product/${productId}`);
      return;
    }

    if (success && sessionId && productId && !verificationAttempted.current) {
      verificationAttempted.current = true;
      setIsVerifyingPayment(true);
      
      // Verify the purchase with the backend
      fetch(`/api/products/${productId}/verify-purchase?session_id=${sessionId}`, {
        credentials: 'include',
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            posthog.capture('product_purchased', {
              product_id: productId,
              coach_username: username,
            });
            setShowSuccessMessage(true);
            queryClient.invalidateQueries({ queryKey: [`/api/products/${productId}/purchase-status`] });
            toast({
              title: "Payment successful!",
              description: "You now have access to this product. Your download is ready!",
            });
          }
        })
        .catch(err => {
          console.error('Error verifying purchase:', err);
          toast({
            title: "Verification error",
            description: "There was an issue verifying your purchase. Please contact support if the issue persists.",
            variant: "destructive",
          });
        })
        .finally(() => {
          setIsVerifyingPayment(false);
          // Clean up URL
          window.history.replaceState({}, '', `/${username}/product/${productId}`);
        });
    }
  }, [productId, username, toast, queryClient]);

  const { data: profile, isLoading: profileLoading } = useQuery<Profile>({
    queryKey: [`/api/profiles/${username}`],
  });

  const { data: product, isLoading: productLoading } = useQuery<DigitalProduct>({
    queryKey: [`/api/profiles/${username}/products/${productId}`],
  });

  const { data: purchaseStatus, refetch: refetchPurchase } = useQuery<PurchaseStatus>({
    queryKey: [`/api/products/${productId}/purchase-status`],
    enabled: isAuthenticated && !!productId,
  });

  // Track product viewed
  useEffect(() => {
    if (product && username) {
      posthog.capture('product_viewed', {
        product_id: product.id,
        product_title: product.title,
        coach_username: username,
        is_free: product.isFree ?? false,
      });
    }
  }, [product?.id]);

  const getProductTypeConfig = (type: string | undefined) => {
    if (type && type in PRODUCT_TYPES) {
      return PRODUCT_TYPES[type as keyof typeof PRODUCT_TYPES];
    }
    return { label: "Digital Download", icon: Package, color: "bg-gray-100 text-gray-700" };
  };

  const freePurchaseMutation = useMutation({
    mutationFn: async (purchaseEmail: string) => {
      return await apiRequest("POST", `/api/products/${productId}/purchase-free`, { email: purchaseEmail });
    },
    onSuccess: async () => {
      await refetchPurchase();
      toast({
        title: "Success!",
        description: "You now have access to this product. Starting download...",
      });
      setTimeout(() => {
        handleDownload();
      }, 500);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to complete purchase",
        variant: "destructive",
      });
    },
  });

  const handleDownload = async () => {
    if (!product?.fileUrl) {
      toast({
        title: "No file available",
        description: "This product doesn't have a downloadable file yet",
        variant: "destructive",
      });
      return;
    }

    setIsDownloading(true);
    try {
      const response = await fetch(`/api/products/${productId}/download`, {
        credentials: "include",
      });

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
      
      toast({
        title: "Download started",
        description: "Your file is being downloaded",
      });
    } catch (error: unknown) {
      toast({
        title: "Download failed",
        description: error instanceof Error ? error.message : "Unable to download file",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleFreePurchase = () => {
    // For free products, show the free download dialog instead of requiring login
    setIsFreeDownloadDialogOpen(true);
  };

  const handleFreeDownloadSubmit = async () => {
    if (!fullName.trim() || !email.trim()) {
      toast({
        title: "Missing Information",
        description: "Please enter your full name and email address.",
        variant: "destructive",
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessingFreeDownload(true);

    try {
      const response = await apiRequest("POST", `/api/products/${productId}/free-download`, {
        fullName: fullName,
        email: email,
      });

      const result = await response.json();

      if (result.success && result.downloadToken) {
        toast({
          title: "Download Ready!",
          description: "Your free download will begin shortly.",
        });

        const fileResponse = await fetch(`/api/products/${productId}/free-download-file?token=${encodeURIComponent(result.downloadToken)}`);
        if (!fileResponse.ok) {
          throw new Error("Failed to download file");
        }

        const contentDisposition = fileResponse.headers.get('content-disposition');
        let fileName = 'download';
        if (contentDisposition) {
          const match = contentDisposition.match(/filename="?([^";\n]+)"?/);
          if (match) fileName = decodeURIComponent(match[1]);
        }

        const blob = await fileResponse.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        
        setIsFreeDownloadDialogOpen(false);
        setFullName("");
        setEmail("");

        if (result.guestAccessToken && result.purchaseId) {
          setPurchaseGuestToken(result.guestAccessToken);
          setPurchasedItemId(result.purchaseId);
        }
        
        refetchPurchase();
      } else {
        throw new Error(result.message || "Failed to process download");
      }
    } catch (error) {
      console.error("Download error:", error);
      toast({
        title: "Download Failed",
        description: "There was an error processing your request. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessingFreeDownload(false);
    }
  };

  const handlePaidPurchase = async () => {
    // For paid products, show the purchase dialog to collect name/email (no login required)
    setIsPurchaseDialogOpen(true);
  };

  const handlePaidPurchaseSubmit = async () => {
    if (!fullName.trim() || !email.trim()) {
      toast({
        title: "Missing Information",
        description: "Please enter your full name and email address.",
        variant: "destructive",
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessingPurchase(true);
    try {
      const response = await apiRequest("POST", `/api/products/${productId}/purchase-request`, {
        buyerName: fullName,
        buyerEmail: email,
        buyerPhone: phone.trim() || undefined,
      });
      const data = await response.json();

      if (data.success) {
        posthog.capture('product_purchase_requested', { productId });
        const token = data.guestAccessToken || null;
        const purchaseId = data.purchaseId || null;
        if (token && purchaseId) {
          setLocation(`/complete-payment?token=${token}&type=purchase&id=${purchaseId}`);
        } else {
          setPurchaseRequestSuccess(true);
          setReceivedPaymentInstructions(data.paymentInstructions || null);
          setPurchaseGuestToken(token);
          setPurchasedItemId(purchaseId);
        }
      } else {
        toast({
          title: "Error",
          description: data.message || "Failed to submit request",
          variant: "destructive",
        });
      }
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to submit purchase request",
        variant: "destructive",
      });
    } finally {
      setIsProcessingPurchase(false);
    }
  };

  const handleShare = () => {
    if (!product || !username || !productId) return;
    const shareMessage = generateProductShareMessage({
      title: product.title,
      thumbnailDescription: product.thumbnailDescription,
      description: product.description,
      price: product.price,
      isFree: product.isFree,
      currency: product.currency,
      productId: parseInt(productId),
      username,
    });
    if (navigator.share) {
      navigator.share({
        title: product.title,
        text: shareMessage,
        url: window.location.href,
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast({
        title: "Link copied",
        description: "Product link copied to clipboard",
      });
    }
  };

  const handleEmailSubmit = () => {
    // This is now handled by handlePaidPurchaseSubmit
    handlePaidPurchaseSubmit();
  };

  if (profileLoading || productLoading || isVerifyingPayment) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#b66667] mx-auto mb-4"></div>
          {isVerifyingPayment && (
            <p className="text-gray-600">Verifying your payment...</p>
          )}
        </div>
      </div>
    );
  }

  if (!profile || !product) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center py-8">
          <Package className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">Product not found</h3>
          <p className="mt-2 text-sm text-gray-500">
            The product you're looking for doesn't exist or has been removed.
          </p>
          <Button className="mt-4" data-testid="button-back-to-profile" onClick={goBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Profile
          </Button>
        </div>
      </div>
    );
  }

  const typeConfig = getProductTypeConfig(product.productType);
  const TypeIcon = typeConfig.icon;
  const hasPurchased = purchaseStatus?.hasPurchased || false;
  const isFreeProduct = product.isFree || parseFloat(product.price) === 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-3xl mx-auto pb-12">
        {/* Image Area with Overlay Buttons */}
        <div className="relative w-full bg-gray-200">
          {/* Back and Share Buttons - Top Corners */}
          <div className="absolute top-4 left-4 z-20">
            <Button variant="secondary" size="icon" className="rounded-full bg-white/90 hover:bg-white shadow-sm" data-testid="button-back" onClick={goBack}>
              <ArrowLeft className="w-5 h-5 text-gray-700" />
            </Button>
          </div>
          <div className="absolute top-4 right-4 z-20">
            <Button variant="secondary" size="icon" onClick={handleShare} className="rounded-full bg-white/90 hover:bg-white shadow-sm" data-testid="button-share">
              <Share2 className="w-5 h-5 text-gray-700" />
            </Button>
          </div>

          {/* Product Image */}
          <div className="h-[350px] w-full overflow-hidden relative">
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={product.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gray-200 text-gray-400">
                <TypeIcon className="w-16 h-16" />
              </div>
            )}
          </div>
        </div>

        {/* Content Card */}
        <div className="relative -mt-6 rounded-t-3xl bg-white px-6 py-8 shadow-sm">
          {/* Success Message Banner */}
          {showSuccessMessage && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-6 h-6 text-green-600" />
                <div>
                  <h3 className="font-semibold text-green-800">Payment Successful!</h3>
                  <p className="text-sm text-green-700">Thank you for your purchase. Your download is ready below.</p>
                </div>
              </div>
            </div>
          )}

          {/* Product Type Badge */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <Badge variant="secondary" className={`${typeConfig.color} flex items-center gap-1`}>
              <TypeIcon className="w-3 h-3" />
              {typeConfig.label}
            </Badge>
            {isFreeProduct ? (
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                FREE
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-[#b66667]/10 text-[#b66667]">
                {formatPrice(product.price, product.currency || "USD")}
              </Badge>
            )}
          </div>

          {/* Title */}
          <h1 className="text-3xl font-bold text-gray-900 mb-3" data-testid="text-product-title">
            {product.title}
          </h1>

          {/* Thumbnail Description */}
          {product.thumbnailDescription && (
            <p className="text-gray-600 mb-6" data-testid="text-product-thumbnail-description">
              {product.thumbnailDescription}
            </p>
          )}

          {/* Creator Profile */}
          <Link href={`/${username}`}>
            <div className="flex items-center gap-4 mb-8 p-4 bg-gray-50 rounded-xl border border-gray-100 cursor-pointer hover:bg-gray-100 transition-colors">
              <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-white shadow-sm flex-shrink-0">
                <img
                  src={profile.profileImageUrl || defaultProfileImage}
                  alt={profile.displayName}
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Created by</p>
                <h3 className="font-bold text-gray-900">{profile.displayName}</h3>
                {profile.title && (
                  <p className="text-sm text-gray-600">{profile.title}</p>
                )}
              </div>
            </div>
          </Link>

          {/* Description */}
          {product.description && (
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">About this product</h3>
              <div className="prose prose-gray max-w-none text-gray-600">
                <p className="whitespace-pre-wrap leading-relaxed">{linkifyText(product.description)}</p>
              </div>
            </div>
          )}

          {/* Key Details */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Details</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <TypeIcon className="w-5 h-5 text-[#b66667]" />
                  <div>
                    <p className="font-medium text-gray-900">Product Type</p>
                    <p className="text-gray-600">{typeConfig.label}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <DollarSign className="w-5 h-5 text-[#b66667]" />
                  <div>
                    <p className="font-medium text-gray-900">Price</p>
                    <p className="text-gray-600">
                      {isFreeProduct ? "Free" : formatPrice(product.price, product.currency || "USD")}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Download className="w-5 h-5 text-[#b66667]" />
                  <div>
                    <p className="font-medium text-gray-900">Access</p>
                    <p className="text-gray-600">Instant download</p>
                  </div>
                </div>

                {product.fileSize && (
                  <div className="flex items-center gap-3">
                    <Package className="w-5 h-5 text-[#b66667]" />
                    <div>
                      <p className="font-medium text-gray-900">File Size</p>
                      <p className="text-gray-600">
                        {product.fileSize > 1024 * 1024 
                          ? `${(product.fileSize / (1024 * 1024)).toFixed(1)} MB`
                          : `${(product.fileSize / 1024).toFixed(0)} KB`}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-6 mt-8">
            {hasPurchased ? (
              <>
                {/* Already purchased - show download */}
                <div className="flex items-center gap-2 mb-2 justify-center">
                  <Check className="w-5 h-5 text-green-600" />
                  <span className="text-lg font-semibold text-green-700">
                    You own this product
                  </span>
                </div>
                <Button 
                  size="lg" 
                  onClick={handleDownload}
                  disabled={isDownloading || !product.fileUrl}
                  className="w-full bg-green-600 text-white hover:bg-green-700 h-14 text-lg font-bold rounded-2xl shadow-md"
                  data-testid="button-download"
                >
                  {isDownloading ? (
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-5 h-5 mr-2" />
                  )}
                  Download Now
                </Button>
              </>
            ) : isFreeProduct ? (
              <>
                {/* Free product - Get Now button */}
                <Button 
                  size="lg" 
                  onClick={handleFreePurchase}
                  disabled={freePurchaseMutation.isPending}
                  className="w-full bg-[#b66667] text-white hover:bg-[#b85858] h-14 text-lg font-bold rounded-2xl shadow-md"
                  data-testid="button-get-free"
                >
                  {freePurchaseMutation.isPending ? (
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-5 h-5 mr-2" />
                  )}
                  Get Free
                </Button>
                {purchaseGuestToken && purchasedItemId && (
                  <a
                    href={`/guest/${purchaseGuestToken}?purchase=${purchasedItemId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full"
                  >
                    <Button
                      variant="outline"
                      className="w-full gap-2 border-[#b66667] text-[#b66667] hover:bg-red-50"
                      data-testid="button-manage-purchase-free"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Manage Purchase
                    </Button>
                  </a>
                )}
              </>
            ) : (
              <>
                {/* Paid product - Buy Now button */}
                <Button 
                  size="lg" 
                  onClick={handlePaidPurchase}
                  disabled={isProcessingPurchase}
                  className="w-full bg-[#b66667] text-white hover:bg-[#b85858] h-14 text-lg font-bold rounded-2xl shadow-md"
                  data-testid="button-buy-now"
                >
                  {isProcessingPurchase ? (
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  ) : (
                    <Package className="w-5 h-5 mr-2" />
                  )}
                  Buy Now - {formatPrice(product.price, product.currency || "USD")}
                </Button>
                <p className="text-xs text-gray-500 text-center">
                  {product.requiresPayment ? "Submit a purchase request — creator will verify and send your download link" : "Complete your purchase to get instant access"}
                </p>
              </>
            )}

            {/* View All Products Button */}
            <Link href={`/${username}#products`}>
              <Button 
                variant="outline"
                size="lg" 
                className="w-full border-[#b66667] text-[#b66667] hover:bg-red-50 h-12 font-semibold rounded-2xl"
                data-testid="button-view-all-products"
              >
                View All Products
              </Button>
            </Link>
          </div>

          {/* Footer Area */}
          <div className="mt-12 pt-8 border-t border-gray-100 text-center">
            <Link href="/">
              <img src={riplekLogo1} alt="Riplect" className="h-8 mx-auto mb-4 block" data-testid="img-footer-logo" />
            </Link>

            <p className="text-gray-500 mb-6 text-sm">
              Join thousands of creators who are building their business with Riplect.
            </p>

            <Link href="/auth">
              <Button
                className="bg-gray-900 text-white hover:bg-gray-800 rounded-full px-8 font-medium"
              >
                <UserCircle className="w-4 h-4 mr-2" />
                Join Riplect
              </Button>
            </Link>

            <div className="mt-8 flex justify-center gap-6 text-xs text-gray-400">
              <a href="#" className="hover:text-gray-600">Terms of Service</a>
              <a href="#" className="hover:text-gray-600">Privacy Policy</a>
            </div>
          </div>
        </div>
      </main>

      {/* Purchase Dialog for paid products (manual payment flow) */}
      <Dialog open={isPurchaseDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setIsPurchaseDialogOpen(false);
          setPurchaseRequestSuccess(false);
          setReceivedPaymentInstructions(null);
          setFullName("");
          setEmail("");
          setPhone("");
        }
      }}>
        <DialogContent className="sm:max-w-md">
          {purchaseRequestSuccess ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-green-700">
                  <Check className="w-5 h-5" />
                  Request Submitted!
                </DialogTitle>
                <DialogDescription>
                  Your purchase request has been received. Check your email for details.
                </DialogDescription>
              </DialogHeader>
              {receivedPaymentInstructions && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
                  <p className="text-sm font-semibold text-amber-800">How to complete payment:</p>
                  <p className="text-sm text-amber-700 whitespace-pre-wrap">{receivedPaymentInstructions}</p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Once the creator confirms your payment, you'll receive a download link at <strong>{email}</strong>.
              </p>
              {purchaseGuestToken && purchasedItemId ? (
                <a
                  href={`/guest/${purchaseGuestToken}?purchase=${purchasedItemId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full"
                >
                  <Button
                    variant="outline"
                    className="w-full gap-2 border-[#b66667] text-[#b66667] hover:bg-red-50"
                    data-testid="button-manage-purchase"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Manage Purchase
                  </Button>
                </a>
              ) : (
                <p className="text-xs text-center text-muted-foreground" data-testid="text-purchase-portal-fallback">
                  Check your email for a link to manage your purchase.
                </p>
              )}
              <Button
                onClick={() => {
                  setIsPurchaseDialogOpen(false);
                  setPurchaseRequestSuccess(false);
                }}
                className="w-full bg-[#b66667] text-white hover:bg-[#b85858]"
                data-testid="button-purchase-done"
              >
                Got it!
              </Button>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Request to Purchase
                </DialogTitle>
                <DialogDescription>
                  Enter your details and the creator will send you payment instructions.
                </DialogDescription>
              </DialogHeader>

              {product && (
                <div className="bg-muted/50 p-4 rounded-lg">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Product:</span>
                      <span className="font-medium">{product.title}</span>
                    </div>
                    <Separator className="my-2" />
                    <div className="flex justify-between items-center font-semibold text-lg">
                      <span>Price:</span>
                      <span>{formatPrice(product.price, product.currency || "USD")}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="purchase-name">Full Name</Label>
                  <Input
                    id="purchase-name"
                    type="text"
                    placeholder="Enter your full name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    data-testid="input-purchase-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="purchase-email">Email Address</Label>
                  <Input
                    id="purchase-email"
                    type="email"
                    placeholder="Enter your email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    data-testid="input-purchase-email"
                  />
                  <p className="text-xs text-muted-foreground">
                    Your download link will be sent here once payment is confirmed.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="purchase-phone">Phone Number <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input
                    id="purchase-phone"
                    type="tel"
                    placeholder="e.g. +63 912 345 6789"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    data-testid="input-purchase-phone"
                  />
                </div>
                <Button
                  onClick={handleEmailSubmit}
                  disabled={isProcessingPurchase}
                  className="w-full bg-[#b66667] text-white hover:bg-[#b85858]"
                  data-testid="button-submit-purchase-request"
                >
                  {isProcessingPurchase ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <DollarSign className="w-4 h-4 mr-2" />
                      Submit Purchase Request
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  The creator will verify your payment and send you the download link.
                </p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Free Product Download Dialog */}
      <Dialog open={isFreeDownloadDialogOpen} onOpenChange={setIsFreeDownloadDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="w-5 h-5" />
              Get Free Download
            </DialogTitle>
            <DialogDescription>
              Enter your details to download this free product.
            </DialogDescription>
          </DialogHeader>

          {/* Product Summary */}
          {product && (
            <div className="bg-muted/50 p-4 rounded-lg">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Product:</span>
                  <span className="font-medium">{product.title}</span>
                </div>
                <Separator className="my-2" />
                <div className="flex justify-between items-center font-semibold text-lg">
                  <span>Price:</span>
                  <span className="text-green-600">Free</span>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="free-download-name">Full Name</Label>
              <Input
                id="free-download-name"
                type="text"
                placeholder="Enter your full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                data-testid="input-free-download-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="free-download-email">Email Address</Label>
              <Input
                id="free-download-email"
                type="email"
                placeholder="Enter your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="input-free-download-email"
              />
            </div>
            <Button 
              onClick={handleFreeDownloadSubmit}
              disabled={isProcessingFreeDownload}
              className="w-full bg-[#b66667] text-white hover:bg-[#b85858]"
              data-testid="button-submit-free-download"
            >
              {isProcessingFreeDownload ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Download Free
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              By downloading, you agree to receive updates about similar products.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
