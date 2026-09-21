import { CreditCard, DollarSign, ExternalLink, Send, Download } from "lucide-react";

export interface PaymentMethodOffered {
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

export async function downloadQrCode(url: string, filename = "upi-qr-code.png") {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, "_blank");
  }
}

export function getMethodLabel(type: string): string {
  const labels: Record<string, string> = {
    upi: "UPI",
    paypal: "PayPal",
    bank_transfer: "Bank Transfer",
    payment_link: "Payment Link",
    wise: "Wise",
    cash: "Cash",
  };
  return (
    labels[type] || type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export function getMethodIcon(type: string) {
  switch (type) {
    case "upi":
      return <CreditCard className="w-4 h-4" />;
    case "paypal":
      return <DollarSign className="w-4 h-4" />;
    case "bank_transfer":
      return <CreditCard className="w-4 h-4" />;
    case "payment_link":
      return <ExternalLink className="w-4 h-4" />;
    case "wise":
      return <Send className="w-4 h-4" />;
    case "cash":
      return <DollarSign className="w-4 h-4" />;
    default:
      return <CreditCard className="w-4 h-4" />;
  }
}

// IMPORTANT: every external payment link rendered below MUST carry
// `target="_blank" rel="noopener noreferrer"` so the guest's registration
// progress (and any in-progress payment proof form) is not lost when they
// leave to pay. Don't regress this when adding new payment methods.
export function renderMethodDetails(method: PaymentMethodOffered): JSX.Element[] {
  const details: JSX.Element[] = [];
  if (method.type === "upi") {
    if (method.qr_code_url) {
      const qrUrl = method.qr_code_url;
      details.push(
        <div key="qr" className="flex flex-col items-center gap-2 my-2">
          <div className="relative inline-block">
            <img
              src={qrUrl}
              alt="UPI QR Code"
              className="w-48 h-48 rounded-lg border-2 border-[#b66667]/20 shadow-sm object-contain bg-white p-1"
              data-testid="img-upi-qr-code"
            />
            <button
              type="button"
              onClick={() => downloadQrCode(qrUrl)}
              className="absolute top-1.5 right-1.5 bg-white/90 hover:bg-white border border-gray-200 rounded-md p-1 shadow-sm transition-colors"
              title="Download QR code"
              data-testid="button-download-qr-code"
            >
              <Download className="w-3.5 h-3.5 text-gray-600" />
            </button>
          </div>
          <p className="text-xs text-gray-500">Scan to pay via UPI</p>
        </div>
      );
    }
    if (method.upi_id)
      details.push(
        <p key="upi" className="text-sm text-gray-700">
          <span className="font-medium text-gray-600">UPI ID:</span> {method.upi_id}
        </p>
      );
  } else if (method.type === "paypal") {
    if (method.paypal_link)
      details.push(
        <p key="paypal" className="text-sm text-gray-700">
          <span className="font-medium text-gray-600">PayPal:</span>{" "}
          <a
            href={method.paypal_link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#b66667] underline"
          >
            {method.paypal_link}
          </a>
        </p>
      );
  } else if (method.type === "bank_transfer") {
    if (method.account_holder)
      details.push(
        <p key="holder" className="text-sm text-gray-700">
          <span className="font-medium text-gray-600">Account Holder:</span>{" "}
          {method.account_holder}
        </p>
      );
    if (method.bank_name)
      details.push(
        <p key="bank" className="text-sm text-gray-700">
          <span className="font-medium text-gray-600">Bank:</span> {method.bank_name}
        </p>
      );
    if (method.account_number)
      details.push(
        <p key="acc" className="text-sm text-gray-700">
          <span className="font-medium text-gray-600">Account #:</span>{" "}
          {method.account_number}
        </p>
      );
    if (method.ifsc)
      details.push(
        <p key="ifsc" className="text-sm text-gray-700">
          <span className="font-medium text-gray-600">IFSC:</span> {method.ifsc}
        </p>
      );
  } else if (method.type === "payment_link") {
    // For payment links, render the coach's instructions BEFORE the link so
    // the guest reads any context (e.g. "use ref number XYZ", "pay in USD")
    // before tapping through to the external payment page.
    if (method.instructions)
      details.push(
        <p key="inst" className="text-sm text-gray-600 italic">
          {method.instructions}
        </p>
      );
    if (method.url)
      details.push(
        <p key="link" className="text-sm text-gray-700">
          <span className="font-medium text-gray-600">Link:</span>{" "}
          <a
            href={method.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#b66667] underline"
          >
            {method.url}
          </a>
        </p>
      );
  } else if (method.type === "wise") {
    if (method.email)
      details.push(
        <p key="wise" className="text-sm text-gray-700">
          <span className="font-medium text-gray-600">Email:</span> {method.email}
        </p>
      );
  }
  // payment_link renders its instructions ABOVE the link (handled in its
  // branch above), so skip the generic trailing block to avoid duplication.
  if (method.instructions && method.type !== "payment_link")
    details.push(
      <p key="inst" className="text-sm text-gray-600 italic mt-1">
        {method.instructions}
      </p>
    );
  return details;
}
