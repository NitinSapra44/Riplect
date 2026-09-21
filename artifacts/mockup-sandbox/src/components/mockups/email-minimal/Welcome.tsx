export function Welcome() {
  return (
    <div className="min-h-screen w-full bg-[#FAFAFA] py-12 px-4 flex justify-center font-sans text-[#0A0A0A]">
      <div className="w-full max-w-[600px] bg-white p-8 md:p-12 shadow-[0_2px_8px_rgba(0,0,0,0.04)] rounded-md border border-neutral-100">
        {/* Header */}
        <div className="mb-12">
          <div className="text-xl font-semibold tracking-tight">Riplect<span className="text-blue-600">.</span></div>
        </div>

        {/* Body */}
        <div className="space-y-6">
          <p className="text-base text-neutral-600">Welcome, Sarah.</p>
          <h1 className="text-2xl md:text-3xl font-medium tracking-tight text-neutral-900">Let's set up your space.</h1>
          <p className="text-base text-neutral-600 leading-relaxed">
            Riplect helps you take bookings, sell digital products, and run events — all from one profile your audience already knows how to find.
          </p>
        </div>

        {/* 3-step list */}
        <div className="mt-10 mb-10 space-y-6">
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-neutral-100 text-neutral-600 flex items-center justify-center text-xs font-medium mt-0.5">1</div>
            <div>
              <p className="text-base font-medium text-neutral-900">Claim your handle</p>
              <p className="text-sm text-neutral-500 mt-1">riplect.com/sarah</p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-neutral-100 text-neutral-600 flex items-center justify-center text-xs font-medium mt-0.5">2</div>
            <div>
              <p className="text-base font-medium text-neutral-900">Add your first session or product</p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-neutral-100 text-neutral-600 flex items-center justify-center text-xs font-medium mt-0.5">3</div>
            <div>
              <p className="text-base font-medium text-neutral-900">Share your link anywhere</p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="space-y-6 mb-16">
          <a href="#" className="inline-block w-full text-center bg-slate-900 hover:bg-slate-800 text-white font-medium py-3.5 px-6 rounded transition-colors">
            Set up my profile
          </a>
          <p className="text-sm text-neutral-500 text-center">
            Need help? Reply to this email and a real human will answer.
          </p>
        </div>

        {/* Footer */}
        <div className="pt-8 border-t border-neutral-100 text-xs text-neutral-400">
          <p>Riplect · You received this because you booked a session.</p>
          <p className="mt-2">
            <a href="#" className="hover:text-neutral-600 underline">Unsubscribe</a>
          </p>
        </div>
      </div>
    </div>
  );
}
