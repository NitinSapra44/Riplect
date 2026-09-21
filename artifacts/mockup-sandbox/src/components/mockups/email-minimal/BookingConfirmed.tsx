export function BookingConfirmed() {
  return (
    <div className="min-h-screen w-full bg-[#FAFAFA] py-12 px-4 flex justify-center font-sans text-[#0A0A0A]">
      <div className="w-full max-w-[600px] bg-white p-8 md:p-12 shadow-[0_2px_8px_rgba(0,0,0,0.04)] rounded-md border border-neutral-100">
        {/* Header */}
        <div className="mb-12">
          <div className="text-xl font-semibold tracking-tight">Riplect<span className="text-blue-600">.</span></div>
        </div>

        {/* Body */}
        <div className="space-y-6">
          <p className="text-base text-neutral-600">Hi Sarah,</p>
          <h1 className="text-2xl md:text-3xl font-medium tracking-tight text-neutral-900">Your session with Maya is confirmed</h1>
          <p className="text-base text-neutral-600 leading-relaxed">
            Maya Patel has confirmed your booking. Here's everything you need.
          </p>
        </div>

        {/* Details Block */}
        <div className="mt-10 mb-10 space-y-4 text-sm">
          <div className="flex flex-col sm:flex-row sm:justify-between py-3 border-b border-neutral-100">
            <span className="text-neutral-500 mb-1 sm:mb-0">Session</span>
            <span className="font-medium text-neutral-900">Career Clarity Session</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:justify-between py-3 border-b border-neutral-100">
            <span className="text-neutral-500 mb-1 sm:mb-0">Coach</span>
            <span className="font-medium text-neutral-900">Maya Patel</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:justify-between py-3 border-b border-neutral-100">
            <span className="text-neutral-500 mb-1 sm:mb-0">Date</span>
            <span className="font-medium text-neutral-900">Saturday, March 14</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:justify-between py-3 border-b border-neutral-100">
            <span className="text-neutral-500 mb-1 sm:mb-0">Time</span>
            <span className="font-medium text-neutral-900">3:00 PM – 4:00 PM (GMT+1)</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:justify-between py-3 border-b border-neutral-100">
            <span className="text-neutral-500 mb-1 sm:mb-0">Where</span>
            <span className="font-medium text-neutral-900">Google Meet (link below)</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:justify-between py-3 border-b border-neutral-100">
            <span className="text-neutral-500 mb-1 sm:mb-0">Confirmation code</span>
            <span className="font-medium text-neutral-900 uppercase tracking-wider">RPL-7K2X</span>
          </div>
        </div>

        {/* CTAs */}
        <div className="space-y-4 mb-12">
          <a href="#" className="inline-block w-full text-center bg-slate-900 hover:bg-slate-800 text-white font-medium py-3.5 px-6 rounded transition-colors">
            Join Google Meet
          </a>
          <div className="text-center">
            <a href="#" className="text-sm text-neutral-500 hover:text-neutral-900 underline underline-offset-4 transition-colors">
              Manage your booking
            </a>
          </div>
        </div>

        {/* Closing */}
        <div className="mb-16">
          <p className="text-base text-neutral-600">
            See you Saturday —<br/>
            Maya & the Riplect team
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
