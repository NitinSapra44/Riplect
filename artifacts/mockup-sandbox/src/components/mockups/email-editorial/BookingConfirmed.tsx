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

export function BookingConfirmed() {
  return (
    <div className="min-h-screen w-full bg-[#F5EFE6] py-10 px-4 flex justify-center font-sans antialiased">
      <div className="w-full max-w-[600px] bg-white shadow-sm border border-[#E8E2D9] px-8 sm:px-16 py-12 text-[#1F1B16]">
        
        <Logo />

        <div className="text-center mb-10">
          <p className="text-[#1F1B16]/60 text-sm tracking-widest uppercase mb-4 font-medium">
            Hi Sarah,
          </p>
          <h1 className="font-['Playfair_Display'] text-4xl sm:text-5xl leading-tight mb-6 text-[#1F1B16]">
            Your session with Maya is confirmed
          </h1>
          <p className="text-[#1F1B16]/80 text-lg leading-relaxed max-w-sm mx-auto">
            Maya Patel has confirmed your booking. Here's everything you need.
          </p>
        </div>

        <Divider />

        <dl className="mb-10">
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

        <div className="flex flex-col items-center gap-6 mb-12">
          <a href="#" className="inline-block bg-[#1F1B16] text-[#F5EFE6] px-10 py-4 text-sm uppercase tracking-widest font-medium hover:bg-[#1F1B16]/90 transition-colors w-full sm:w-auto text-center">
            Join Google Meet
          </a>
          <a href="#" className="text-[#1F1B16]/60 hover:text-[#1F1B16] text-sm underline decoration-[#1F1B16]/20 underline-offset-4 transition-colors">
            Manage your booking
          </a>
        </div>

        <div className="text-center">
          <p className="font-['Playfair_Display'] text-xl italic text-[#1F1B16]/80">
            See you Saturday — Maya & the Riplect team
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
