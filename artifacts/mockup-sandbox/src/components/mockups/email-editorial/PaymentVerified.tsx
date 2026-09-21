import React from "react";

function Logo() {
  return (
    <div className="flex items-center gap-1 justify-center mb-12 mt-6">
      <span className="font-['Playfair_Display'] text-2xl tracking-widest text-[#1F1B16] uppercase">
        RIPLECT
      </span>
      <div className="w-1.5 h-1.5 rounded-full bg-[#C76E5A] mt-1" />
    </div>
  );
}

function Divider() {
  return (
    <div className="flex items-center justify-center gap-2 my-10">
      <div className="h-[1px] w-12 bg-[#E8E2D9]" />
      <div className="w-1.5 h-1.5 rounded-full bg-[#C76E5A]/20" />
      <div className="h-[1px] w-12 bg-[#E8E2D9]" />
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="py-4 border-b border-[#E8E2D9] border-t-0 border-x-0 flex flex-col sm:flex-row sm:justify-between sm:items-baseline gap-1 last:border-b-0">
      <dt className="text-sm uppercase tracking-widest text-[#1F1B16]/50 font-medium">
        {label}
      </dt>
      <dd className="text-base text-[#1F1B16] font-medium text-right">
        {value}
      </dd>
    </div>
  );
}

export function PaymentVerified() {
  return (
    <div className="min-h-screen w-full bg-[#F5EFE6] py-10 px-4 flex justify-center font-sans antialiased">
      <div className="w-full max-w-[600px] bg-white shadow-sm border border-[#E8E2D9] px-8 sm:px-16 py-12 text-[#1F1B16]">
        
        <Logo />

        <div className="text-center mb-10">
          <p className="text-[#1F1B16]/60 text-sm tracking-widest uppercase mb-4 font-medium">
            Hi Sarah,
          </p>
          <h1 className="font-['Playfair_Display'] text-4xl sm:text-4xl leading-tight mb-6 text-[#1F1B16]">
            Payment received — you're all set
          </h1>
          <p className="text-[#1F1B16]/80 text-lg leading-relaxed max-w-sm mx-auto">
            We've verified your payment for your upcoming session with Maya Patel.
          </p>
        </div>

        <Divider />

        <dl className="mb-10">
          <DetailRow label="Amount" value="$120.00 USD" />
          <DetailRow label="Method" value="Bank transfer" />
          <DetailRow label="Reference" value="RPL-7K2X" />
          <DetailRow label="Verified" value="March 12, 2026" />
        </dl>

        <div className="flex flex-col items-center gap-6 mb-12">
          <a href="#" className="inline-block border border-[#C76E5A] text-[#C76E5A] px-10 py-4 text-sm uppercase tracking-widest font-medium hover:bg-[#C76E5A] hover:text-white transition-colors w-full sm:w-auto text-center">
            View your booking
          </a>
        </div>

        <div className="text-center">
          <p className="text-[#1F1B16]/60 text-sm italic">
            A receipt is attached for your records.
          </p>
        </div>

        <div className="mt-20 pt-8 border-t border-[#E8E2D9] text-center">
          <p className="text-xs text-[#1F1B16]/40 leading-relaxed">
            Riplect · You received this because you booked a session.
            <br />
            <a href="#" className="underline hover:text-[#1F1B16]/60 transition-colors">Unsubscribe</a>
          </p>
        </div>

      </div>
    </div>
  );
}
