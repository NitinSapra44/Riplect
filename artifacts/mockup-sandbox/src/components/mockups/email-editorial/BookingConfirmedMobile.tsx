import React from "react";

function Logo() {
  return (
    <div className="flex items-center gap-1 justify-center mb-10 mt-2">
      <span className="font-['Playfair_Display'] text-xl tracking-widest text-[#1F1B16] uppercase">
        RIPLECT
      </span>
      <div className="w-1.5 h-1.5 rounded-full bg-[#C76E5A] mt-0.5" />
    </div>
  );
}

function Divider() {
  return (
    <div className="flex items-center justify-center gap-2 my-8">
      <div className="h-[1px] w-8 bg-[#E8E2D9]" />
      <div className="w-1 h-1 rounded-full bg-[#C76E5A]/20" />
      <div className="h-[1px] w-8 bg-[#E8E2D9]" />
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="py-3 border-b border-[#E8E2D9] border-t-0 border-x-0 flex flex-col gap-1 last:border-b-0">
      <dt className="text-[11px] uppercase tracking-widest text-[#1F1B16]/50 font-medium">
        {label}
      </dt>
      <dd className="text-sm text-[#1F1B16] font-medium">
        {value}
      </dd>
    </div>
  );
}

export function BookingConfirmedMobile() {
  return (
    <div className="min-h-screen w-full bg-[#F5EFE6] py-6 px-3 flex justify-center font-sans antialiased">
      {/* Container constrained to ~360px for mobile mockup */}
      <div className="w-full max-w-[360px] bg-white shadow-sm border border-[#E8E2D9] px-6 py-8 text-[#1F1B16]">
        
        <Logo />

        <div className="text-center mb-8">
          <p className="text-[#1F1B16]/60 text-xs tracking-widest uppercase mb-3 font-medium">
            Hi Sarah,
          </p>
          <h1 className="font-['Playfair_Display'] text-3xl leading-tight mb-4 text-[#1F1B16]">
            Your session with Maya is confirmed
          </h1>
          <p className="text-[#1F1B16]/80 text-sm leading-relaxed">
            Maya Patel has confirmed your booking. Here's everything you need.
          </p>
        </div>

        <Divider />

        <dl className="mb-8">
          <DetailRow label="Session" value="Career Clarity Session" />
          <DetailRow label="Coach" value="Maya Patel" />
          <DetailRow label="Date" value="Saturday, March 14" />
          <DetailRow label="Time" value="3:00 PM – 4:00 PM (GMT+1)" />
          <DetailRow 
            label="Where" 
            value={<span className="text-[#C76E5A] underline decoration-[#C76E5A]/30 underline-offset-4">Google Meet (link below)</span>} 
          />
          <DetailRow label="Confirmation code" value="RPL-7K2X" />
        </dl>

        <div className="flex flex-col items-stretch gap-4 mb-10">
          <a href="#" className="block bg-[#1F1B16] text-[#F5EFE6] px-6 py-4 text-xs uppercase tracking-widest font-medium hover:bg-[#1F1B16]/90 transition-colors text-center">
            Join Google Meet
          </a>
          <a href="#" className="text-[#1F1B16]/60 hover:text-[#1F1B16] text-xs text-center underline decoration-[#1F1B16]/20 underline-offset-4 transition-colors">
            Manage your booking
          </a>
        </div>

        <div className="text-center">
          <p className="font-['Playfair_Display'] text-lg italic text-[#1F1B16]/80">
            See you Saturday<br/>Maya & the Riplect team
          </p>
        </div>

        <div className="mt-12 pt-6 border-t border-[#E8E2D9] text-center">
          <p className="text-[10px] text-[#1F1B16]/40 leading-relaxed">
            Riplect · You received this because you booked a session.
            <br />
            <a href="#" className="underline hover:text-[#1F1B16]/60 transition-colors">Unsubscribe</a>
          </p>
        </div>

      </div>
    </div>
  );
}
