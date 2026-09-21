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

export function Welcome() {
  return (
    <div className="min-h-screen w-full bg-[#F5EFE6] py-10 px-4 flex justify-center font-sans antialiased">
      <div className="w-full max-w-[600px] bg-white shadow-sm border border-[#E8E2D9] px-8 sm:px-16 py-12 text-[#1F1B16]">
        
        <Logo />

        <div className="text-center mb-10">
          <p className="text-[#1F1B16]/60 text-sm tracking-widest uppercase mb-4 font-medium">
            Welcome, Sarah.
          </p>
          <h1 className="font-['Playfair_Display'] text-4xl sm:text-5xl leading-tight mb-6 text-[#1F1B16]">
            Let's set up your space.
          </h1>
          <p className="text-[#1F1B16]/80 text-lg leading-relaxed max-w-sm mx-auto">
            Riplect helps you take bookings, sell digital products, and run events — all from one profile your audience already knows how to find.
          </p>
        </div>

        <Divider />

        <div className="mb-12">
          <ol className="space-y-6">
            {[
              "Claim your handle (riplect.com/sarah)",
              "Add your first session or product",
              "Share your link anywhere"
            ].map((step, i) => (
              <li key={i} className="flex items-center gap-6">
                <span className="font-['Playfair_Display'] text-3xl italic text-[#C76E5A]/60 w-8 text-center shrink-0">
                  {i + 1}
                </span>
                <span className="text-lg text-[#1F1B16]">
                  {step}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="flex flex-col items-center gap-8 mb-12">
          <a href="#" className="inline-block bg-[#C76E5A] text-white px-10 py-4 text-sm uppercase tracking-widest font-medium hover:bg-[#C76E5A]/90 transition-colors w-full sm:w-auto text-center shadow-sm">
            Set up my profile
          </a>
        </div>

        <div className="text-center">
          <p className="text-[#1F1B16]/60 text-sm">
            Need help? Reply to this email and a real human will answer.
          </p>
        </div>

        <div className="mt-20 pt-8 border-t border-[#E8E2D9] text-center">
          <p className="text-xs text-[#1F1B16]/40 leading-relaxed">
            Riplect · A home for coaches, healers and creators
            <br />
            <a href="#" className="underline hover:text-[#1F1B16]/60 transition-colors">Unsubscribe</a>
          </p>
        </div>

      </div>
    </div>
  );
}
