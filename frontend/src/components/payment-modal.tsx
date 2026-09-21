import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CreditCard, Lock, Calendar, Clock, User } from "lucide-react";
import type { BookingSession } from "@shared/schema";
import { formatPrice } from "@shared/currencies";

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPaymentSuccess: () => void;
  session: BookingSession | null;
  bookingDetails: {
    name: string;
    email: string;
    phone: string;
    message: string;
    customQuestionAnswer?: string;
    date: Date;
    time: string;
  } | null;
  profileId: string;
}

interface PaymentFormData {
  cardNumber: string;
  expiryDate: string;
  cvv: string;
  cardholderName: string;
  billingEmail: string;
}

export function PaymentModal({ 
  isOpen, 
  onClose, 
  onPaymentSuccess, 
  session, 
  bookingDetails, 
  profileId 
}: PaymentModalProps) {
  const [paymentData, setPaymentData] = useState<PaymentFormData>({
    cardNumber: "",
    expiryDate: "",
    cvv: "",
    cardholderName: "",
    billingEmail: bookingDetails?.email || ""
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  if (!session || !bookingDetails) return null;

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!paymentData.cardNumber || !paymentData.expiryDate || !paymentData.cvv || !paymentData.cardholderName) {
      toast({
        title: "Missing Payment Information",
        description: "Please fill in all payment details.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    try {
      // Create payment intent
      const paymentResponse = await apiRequest("POST", "/api/create-payment-intent", {
        amount: session.price,
        bookingDetails: {
          sessionId: session.id,
          profileId: profileId,
          clientName: bookingDetails.name,
          clientEmail: bookingDetails.email,
          clientPhone: bookingDetails.phone,
          message: bookingDetails.message,
          customQuestionAnswer: bookingDetails.customQuestionAnswer,
          bookingDate: bookingDetails.date.toISOString(),
          bookingTime: bookingDetails.time,
          totalAmount: session.price
        }
      });

      const paymentResult = await paymentResponse.json();

      if (paymentResult.success) {
        // Simulate successful payment processing
        // In real implementation, this would use Stripe Elements
        toast({
          title: "Payment Successful!",
          description: `Your payment of ${formatPrice(session.price, (session as any).currency || "USD")} has been processed. Your booking is confirmed!`,
        });

        onPaymentSuccess();
        onClose();
      } else {
        throw new Error(paymentResult.message || "Payment processing failed");
      }
    } catch (error) {
      console.error("Payment error:", error);
      toast({
        title: "Payment Failed",
        description: "There was an error processing your payment. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const formatCardNumber = (value: string) => {
    // Remove all non-digit characters
    const digits = value.replace(/\D/g, '');
    // Add spaces every 4 digits
    return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
  };

  const formatExpiryDate = (value: string) => {
    // Remove all non-digit characters
    const digits = value.replace(/\D/g, '');
    // Add slash after 2 digits
    if (digits.length >= 2) {
      return digits.substring(0, 2) + '/' + digits.substring(2, 4);
    }
    return digits;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <CreditCard className="w-5 h-5" />
            Complete Payment
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Booking Summary */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="font-semibold text-gray-900 mb-3">Booking Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Session:</span>
                <span className="font-medium">{session.title}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Date:
                </span>
                <span className="font-medium">{bookingDetails.date.toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Time:
                </span>
                <span className="font-medium">{bookingDetails.time}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 flex items-center gap-1">
                  <User className="w-3 h-3" />
                  Duration:
                </span>
                <span className="font-medium">{session.duration} minutes</span>
              </div>
              <Separator className="my-2" />
              <div className="flex justify-between items-center font-semibold text-lg">
                <span>Total:</span>
                <span className="text-primary">{formatPrice(session.price, (session as any).currency || "USD")}</span>
              </div>
            </div>
          </div>

          {/* Payment Form */}
          <form onSubmit={handlePayment} className="space-y-4">
            <div className="space-y-4">
              <div>
                <Label htmlFor="cardNumber">Card Number</Label>
                <Input
                  id="cardNumber"
                  data-testid="input-card-number"
                  placeholder="1234 5678 9012 3456"
                  value={paymentData.cardNumber}
                  onChange={(e) => {
                    const formatted = formatCardNumber(e.target.value);
                    if (formatted.replace(/\s/g, '').length <= 16) {
                      setPaymentData({ ...paymentData, cardNumber: formatted });
                    }
                  }}
                  maxLength={19}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="expiryDate">Expiry Date</Label>
                  <Input
                    id="expiryDate"
                    data-testid="input-expiry-date"
                    placeholder="MM/YY"
                    value={paymentData.expiryDate}
                    onChange={(e) => {
                      const formatted = formatExpiryDate(e.target.value);
                      if (formatted.replace(/\D/g, '').length <= 4) {
                        setPaymentData({ ...paymentData, expiryDate: formatted });
                      }
                    }}
                    maxLength={5}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="cvv">CVV</Label>
                  <Input
                    id="cvv"
                    data-testid="input-cvv"
                    placeholder="123"
                    value={paymentData.cvv}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '');
                      if (digits.length <= 4) {
                        setPaymentData({ ...paymentData, cvv: digits });
                      }
                    }}
                    maxLength={4}
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="cardholderName">Cardholder Name</Label>
                <Input
                  id="cardholderName"
                  data-testid="input-cardholder-name"
                  placeholder="John Doe"
                  value={paymentData.cardholderName}
                  onChange={(e) => setPaymentData({ ...paymentData, cardholderName: e.target.value })}
                  required
                />
              </div>

              <div>
                <Label htmlFor="billingEmail">Billing Email</Label>
                <Input
                  id="billingEmail"
                  data-testid="input-billing-email"
                  type="email"
                  placeholder="john@example.com"
                  value={paymentData.billingEmail}
                  onChange={(e) => setPaymentData({ ...paymentData, billingEmail: e.target.value })}
                  required
                />
              </div>
            </div>

            {/* Security Notice */}
            <div className="flex items-center gap-2 text-sm text-gray-600 bg-green-50 p-3 rounded-lg">
              <Lock className="w-4 h-4 text-green-600" />
              <span>Your payment information is secure and encrypted</span>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="flex-1"
                disabled={isProcessing}
                data-testid="button-cancel-payment"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-primary hover:bg-blue-600"
                disabled={isProcessing}
                data-testid="button-complete-payment"
              >
                {isProcessing ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Processing...
                  </div>
                ) : (
                  `Pay ${formatPrice(session.price, (session as any).currency || "USD")}`
                )}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}