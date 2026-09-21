import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CreditCard, Lock, ShoppingCart, Loader2 } from "lucide-react";
import type { DigitalProduct } from "@shared/schema";
import { formatPrice } from "@shared/currencies";

interface DigitalProductPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPurchaseSuccess: (downloadUrl: string) => void;
  product: DigitalProduct | null;
}

export function DigitalProductPaymentModal({ 
  isOpen, 
  onClose, 
  onPurchaseSuccess, 
  product 
}: DigitalProductPaymentModalProps) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  if (!product) return null;

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    
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

    setIsProcessing(true);

    try {
      const response = await apiRequest("POST", `/api/products/${product.id}/create-checkout`, {
        email: email,
        fullName: fullName,
      });
      const data = await response.json();
      
      if (data.url) {
        window.location.href = data.url;
      } else if (data.message) {
        toast({
          title: "Info",
          description: data.message,
        });
        onClose();
      }
    } catch (error: unknown) {
      console.error("Checkout error:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start checkout",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    setFullName("");
    setEmail("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <ShoppingCart className="w-5 h-5" />
            Complete Your Purchase
          </DialogTitle>
          <DialogDescription>
            Enter your details to proceed to checkout.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Product Summary */}
          <div className="bg-muted/50 p-4 rounded-lg">
            {product.imageUrl && (
              <img 
                src={product.imageUrl} 
                alt={product.title}
                className="w-full h-32 object-cover rounded-md mb-3"
              />
            )}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Product:</span>
                <span className="font-medium">{product.title}</span>
              </div>
              <Separator className="my-2" />
              <div className="flex justify-between items-center font-semibold text-lg">
                <span>Total:</span>
                <span>{formatPrice(product.price, (product as any).currency || "USD")}</span>
              </div>
            </div>
          </div>

          {/* Contact Form */}
          <form onSubmit={handleCheckout} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="modal-fullname">Full Name</Label>
              <Input
                id="modal-fullname"
                type="text"
                placeholder="Enter your full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                data-testid="input-modal-fullname"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="modal-email">Email Address</Label>
              <Input
                id="modal-email"
                type="email"
                placeholder="Enter your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="input-modal-email"
              />
              <p className="text-xs text-muted-foreground">
                We'll send your download link to this email after payment.
              </p>
            </div>

            <Button 
              type="submit"
              className="w-full"
              disabled={isProcessing}
              data-testid="button-continue-checkout"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4 mr-2" />
                  Continue to Payment
                </>
              )}
            </Button>
          </form>

          {/* Security Note */}
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Lock className="w-3 h-3" />
            <span>Secure payment via Stripe</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
