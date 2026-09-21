import { Receipt, CreditCard, Hash, Calendar } from "lucide-react";

export function PaymentVerified() {
  return (
    <div className="min-h-screen w-full bg-[#f4f4f5] py-10 px-4 flex justify-center font-sans text-[#18181b]">
      <div className="w-full max-w-[600px] bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 flex flex-col">
        
        {/* Header Band */}
        <div className="bg-[#E94F37] text-white p-8 flex flex-col items-start gap-6">
          <div className="flex items-center gap-2 font-['Space_Grotesk'] font-bold text-2xl tracking-tight">
            <div className="w-4 h-4 rounded-full bg-white opacity-90" />
            Riplect
          </div>
          <div className="space-y-2">
            <div className="text-white/80 font-medium uppercase tracking-wider text-xs">Payment Received</div>
            <h1 className="font-['Space_Grotesk'] text-4xl leading-tight font-bold">Payment received — you're all set</h1>
          </div>
        </div>

        {/* Body Band */}
        <div className="p-8 pb-10 bg-white flex flex-col gap-8">
          <div className="space-y-4 text-lg text-gray-700">
            <p>Hi Sarah,</p>
            <p>We've verified your payment for your upcoming session with Maya Patel.</p>
          </div>

          {/* Details Card */}
          <div className="bg-[#FDFBF7] border-2 border-[#E94F37]/10 rounded-xl p-6 grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-4 text-sm">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-gray-500 font-medium"><Receipt className="w-4 h-4 text-[#E94F37]" /> Amount</div>
              <div className="font-semibold text-gray-900 text-lg">$120.00 USD</div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-gray-500 font-medium"><CreditCard className="w-4 h-4 text-[#E94F37]" /> Method</div>
              <div className="font-semibold text-gray-900">Bank transfer</div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-gray-500 font-medium"><Hash className="w-4 h-4 text-[#E94F37]" /> Reference</div>
              <div className="font-mono font-bold text-[#E94F37]">RPL-7K2X</div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-gray-500 font-medium"><Calendar className="w-4 h-4 text-[#E94F37]" /> Verified</div>
              <div className="font-semibold text-gray-900">March 12, 2026</div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row items-center gap-4 pt-2">
            <a href="#" className="w-full sm:w-auto bg-[#E94F37] text-white font-semibold py-4 px-8 rounded-full text-center hover:shadow-lg hover:-translate-y-0.5 transition-all active:translate-y-0">
              View your booking
            </a>
          </div>

          <div className="text-gray-500 mt-2 italic">
            A receipt is attached for your records.
          </div>
        </div>

        {/* Footer Band */}
        <div className="bg-[#2D2321] text-[#FDFBF7]/60 p-8 text-sm text-center flex flex-col items-center gap-4">
          <div className="font-['Space_Grotesk'] font-bold text-xl text-[#FDFBF7] opacity-50 flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#FDFBF7]" /> Riplect
          </div>
          <p>Riplect · You received this because you booked a session.</p>
          <a href="#" className="underline underline-offset-4 hover:text-[#FDFBF7] transition-colors">Unsubscribe</a>
        </div>

      </div>
    </div>
  );
}