import { useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  CreditCard,
  Loader2,
  Banknote,
  Link as LinkIcon,
  Building2,
  Coins,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  Upload,
  X,
  QrCode,
} from "lucide-react";

export interface PaymentMethod {
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

export const DEFAULT_PAYMENT_METHODS: PaymentMethod[] = [
  { type: "upi", enabled: false, order: 0, instructions: "", upi_id: "", qr_code_url: "", display_name: "" },
  { type: "payment_link", enabled: false, order: 1, instructions: "", url: "" },
  { type: "paypal", enabled: false, order: 2, instructions: "", email: "", paypal_link: "" },
  { type: "wise", enabled: false, order: 3, instructions: "", email: "" },
  { type: "bank_transfer", enabled: false, order: 4, instructions: "", account_holder: "", bank_name: "", account_number: "", ifsc: "" },
  { type: "cash", enabled: false, order: 5, instructions: "" },
];

export const PAYMENT_METHOD_CONFIG: Record<string, { label: string; icon: typeof CreditCard; description: string }> = {
  upi: { label: "UPI", icon: Coins, description: "Accept payments via UPI ID or QR code" },
  payment_link: { label: "Payment Link", icon: LinkIcon, description: "Direct payment link (Stripe, Razorpay, etc.)" },
  paypal: { label: "PayPal", icon: CreditCard, description: "Accept payments via PayPal" },
  wise: { label: "Wise", icon: Banknote, description: "Accept payments via Wise (TransferWise)" },
  bank_transfer: { label: "Bank Transfer", icon: Building2, description: "Direct bank transfer details" },
  cash: { label: "Cash", icon: Coins, description: "Accept cash payments in person" },
};

export function mergeWithDefaults(saved: PaymentMethod[]): PaymentMethod[] {
  const merged = DEFAULT_PAYMENT_METHODS.map((defaultMethod) => {
    const s = saved?.find((m) => m.type === defaultMethod.type);
    return s ? { ...defaultMethod, ...s } : defaultMethod;
  });
  merged.sort((a, b) => a.order - b.order);
  return merged;
}

function QrCodeUpload({
  value,
  onChange,
  onUpload,
}: {
  value: string;
  onChange: (url: string) => void;
  onUpload?: (file: File) => Promise<string>;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFile = async (file: File) => {
    if (!onUpload) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file type", description: "Please upload a JPG, PNG, or WebP image", variant: "destructive" });
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      toast({ title: "File too large", description: "Please upload an image smaller than 25MB", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      const url = await onUpload(file);
      onChange(url);
      setUrlDraft("");
      toast({ title: "QR code uploaded" });
    } catch {
      toast({ title: "Upload failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const applyUrl = () => {
    const trimmed = urlDraft.trim();
    if (trimmed) {
      onChange(trimmed);
      setUrlDraft("");
    }
  };

  return (
    <div className="space-y-2">
      <Label>QR Code Image (optional)</Label>

      {value ? (
        <div className="flex items-start gap-3">
          <img
            src={value}
            alt="UPI QR Code"
            className="w-24 h-24 object-contain rounded-md border border-border bg-white shrink-0"
            data-testid="img-upi-qr-preview"
          />
          <div className="flex flex-col gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              data-testid="button-replace-qr"
            >
              {isUploading ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5 mr-1.5" />
              )}
              Replace image
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => onChange("")}
              data-testid="button-remove-qr"
            >
              <X className="h-3.5 w-3.5 mr-1.5" />
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {onUpload && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex items-center gap-3 w-full rounded-md border border-dashed border-border px-4 py-3 text-sm text-muted-foreground hover:border-primary hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="button-upload-qr"
            >
              {isUploading ? (
                <Loader2 className="h-5 w-5 animate-spin shrink-0" />
              ) : (
                <QrCode className="h-5 w-5 shrink-0" />
              )}
              <span>{isUploading ? "Uploading…" : "Upload QR code image"}</span>
              <span className="ml-auto text-xs text-muted-foreground/60">JPG · PNG · WebP · up to 25 MB</span>
            </button>
          )}
          <div className="flex items-center gap-2">
            <Input
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              onBlur={applyUrl}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyUrl(); } }}
              placeholder={onUpload ? "Or paste QR code image URL…" : "Paste QR code image URL…"}
              className="text-sm h-8"
              data-testid="input-upi-qr-url"
            />
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
    </div>
  );
}

interface InlinePaymentMethodsEditorProps {
  methods: PaymentMethod[];
  onChange: (methods: PaymentMethod[]) => void;
  isLoading?: boolean;
  showDisclaimer?: boolean;
  onUploadQr?: (file: File) => Promise<string>;
}

export function InlinePaymentMethodsEditor({
  methods,
  onChange,
  isLoading = false,
  showDisclaimer = true,
  onUploadQr,
}: InlinePaymentMethodsEditorProps) {
  const toggleMethod = (type: string) => {
    onChange(methods.map((m) => (m.type === type ? { ...m, enabled: !m.enabled } : m)));
  };

  const updateField = (type: string, field: string, value: string) => {
    onChange(methods.map((m) => (m.type === type ? { ...m, [field]: value } : m)));
  };

  const moveMethod = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= methods.length) return;
    const updated = [...methods];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    onChange(updated.map((m, i) => ({ ...m, order: i })));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8" data-testid="inline-payment-methods-loading">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="inline-payment-methods-editor">
      <Card>
        <CardContent className="p-0">
          {methods.map((method, index) => {
            const config = PAYMENT_METHOD_CONFIG[method.type];
            if (!config) return null;
            const Icon = config.icon;
            const isEnabled = method.enabled;

            return (
              <div key={method.type} data-testid={`card-payment-method-${method.type}`}>
                {index > 0 && <Separator />}
                <div className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-medium text-sm">{config.label}</span>
                      {isEnabled && <Badge variant="secondary">Active</Badge>}
                    </div>
                    <Switch
                      checked={isEnabled}
                      onCheckedChange={() => toggleMethod(method.type)}
                      data-testid={`switch-toggle-${method.type}`}
                    />
                  </div>

                  {isEnabled && (
                    <div className="mt-3 ml-7 space-y-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-xs text-muted-foreground">{config.description}</p>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => moveMethod(index, "up")}
                            disabled={index === 0}
                            data-testid={`button-move-up-${method.type}`}
                          >
                            <ArrowUp className="h-3 w-3" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => moveMethod(index, "down")}
                            disabled={index === methods.length - 1}
                            data-testid={`button-move-down-${method.type}`}
                          >
                            <ArrowDown className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>

                      {method.type === "upi" && (
                        <>
                          <div>
                            <Label>UPI ID</Label>
                            <Input
                              value={method.upi_id || ""}
                              onChange={(e) => updateField("upi", "upi_id", e.target.value)}
                              placeholder="yourname@upi"
                              data-testid="input-upi-id"
                            />
                          </div>
                          <div>
                            <Label>Display Name</Label>
                            <Input
                              value={method.display_name || ""}
                              onChange={(e) => updateField("upi", "display_name", e.target.value)}
                              placeholder="Your name as shown to clients"
                              data-testid="input-upi-display-name"
                            />
                          </div>
                          <QrCodeUpload
                            value={method.qr_code_url || ""}
                            onChange={(url) => updateField("upi", "qr_code_url", url)}
                            onUpload={onUploadQr}
                          />
                        </>
                      )}

                      {method.type === "payment_link" && (
                        <div>
                          <Label>Payment Link URL</Label>
                          <Input
                            value={method.url || ""}
                            onChange={(e) => updateField("payment_link", "url", e.target.value)}
                            placeholder="https://pay.stripe.com/xyz or https://rzp.io/abc"
                            data-testid="input-payment-link-url"
                          />
                        </div>
                      )}

                      {method.type === "paypal" && (
                        <>
                          <div>
                            <Label>PayPal Email</Label>
                            <Input
                              value={method.email || ""}
                              onChange={(e) => updateField("paypal", "email", e.target.value)}
                              placeholder="your@email.com"
                              data-testid="input-paypal-email"
                            />
                          </div>
                          <div>
                            <Label>PayPal.me Link (optional)</Label>
                            <Input
                              value={method.paypal_link || ""}
                              onChange={(e) => updateField("paypal", "paypal_link", e.target.value)}
                              placeholder="https://paypal.me/yourname"
                              data-testid="input-paypal-link"
                            />
                          </div>
                        </>
                      )}

                      {method.type === "wise" && (
                        <div>
                          <Label>Wise Email</Label>
                          <Input
                            value={method.email || ""}
                            onChange={(e) => updateField("wise", "email", e.target.value)}
                            placeholder="your@email.com"
                            data-testid="input-wise-email"
                          />
                        </div>
                      )}

                      {method.type === "bank_transfer" && (
                        <>
                          <div>
                            <Label>Account Holder Name</Label>
                            <Input
                              value={method.account_holder || ""}
                              onChange={(e) => updateField("bank_transfer", "account_holder", e.target.value)}
                              placeholder="Full name on account"
                              data-testid="input-bank-account-holder"
                            />
                          </div>
                          <div>
                            <Label>Bank Name</Label>
                            <Input
                              value={method.bank_name || ""}
                              onChange={(e) => updateField("bank_transfer", "bank_name", e.target.value)}
                              placeholder="Bank name"
                              data-testid="input-bank-name"
                            />
                          </div>
                          <div>
                            <Label>Account Number</Label>
                            <Input
                              value={method.account_number || ""}
                              onChange={(e) => updateField("bank_transfer", "account_number", e.target.value)}
                              placeholder="Account number"
                              data-testid="input-bank-account-number"
                            />
                          </div>
                          <div>
                            <Label>IFSC / Routing Code</Label>
                            <Input
                              value={method.ifsc || ""}
                              onChange={(e) => updateField("bank_transfer", "ifsc", e.target.value)}
                              placeholder="IFSC or routing code"
                              data-testid="input-bank-ifsc"
                            />
                          </div>
                        </>
                      )}

                      {method.type === "cash" && (
                        <p className="text-sm text-muted-foreground">
                          Cash payments can be collected in person at offline sessions.
                        </p>
                      )}

                      <div>
                        <Label>Instructions for clients</Label>
                        <Textarea
                          value={method.instructions || ""}
                          onChange={(e) => updateField(method.type, "instructions", e.target.value)}
                          placeholder="Optional instructions shown to clients when this payment method is selected..."
                          className="resize-none"
                          rows={2}
                          data-testid={`input-instructions-${method.type}`}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {showDisclaimer && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                Payment collection is managed directly between you and your clients. This platform facilitates
                the coordination but does not process payments. You are responsible for verifying payments
                and complying with applicable tax and financial regulations.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
