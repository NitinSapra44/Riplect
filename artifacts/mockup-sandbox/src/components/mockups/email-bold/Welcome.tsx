export function Welcome() {
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
            <div className="text-white/80 font-medium uppercase tracking-wider text-xs">Welcome to Riplect</div>
            <h1 className="font-['Space_Grotesk'] text-4xl leading-tight font-bold">Let's set up your space.</h1>
          </div>
        </div>

        {/* Body Band */}
        <div className="p-8 pb-10 bg-white flex flex-col gap-8">
          <div className="space-y-4 text-lg text-gray-700 leading-relaxed">
            <p className="font-semibold text-gray-900">Welcome, Sarah.</p>
            <p>Riplect helps you take bookings, sell digital products, and run events — all from one profile your audience already knows how to find.</p>
          </div>

          {/* Details Card - Steps */}
          <div className="bg-[#FDFBF7] border-2 border-[#E94F37]/10 rounded-xl p-6 sm:p-8">
            <ol className="space-y-6">
              <li className="flex gap-4 items-start">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#E94F37] text-white flex items-center justify-center font-bold font-['Space_Grotesk']">1</div>
                <div className="pt-1 text-gray-900 font-medium text-lg">Claim your handle (riplect.com/sarah)</div>
              </li>
              <li className="flex gap-4 items-start">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#E94F37]/20 text-[#E94F37] flex items-center justify-center font-bold font-['Space_Grotesk']">2</div>
                <div className="pt-1 text-gray-900 font-medium text-lg">Add your first session or product</div>
              </li>
              <li className="flex gap-4 items-start">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#E94F37]/20 text-[#E94F37] flex items-center justify-center font-bold font-['Space_Grotesk']">3</div>
                <div className="pt-1 text-gray-900 font-medium text-lg">Share your link anywhere</div>
              </li>
            </ol>
          </div>

          {/* Actions */}
          <div className="flex flex-col items-start gap-4 pt-2">
            <a href="#" className="w-full sm:w-auto bg-[#E94F37] text-white font-semibold py-4 px-8 rounded-full text-center hover:shadow-lg hover:-translate-y-0.5 transition-all active:translate-y-0 text-lg">
              Set up my profile
            </a>
          </div>

          <div className="text-gray-500 mt-4 bg-gray-50 p-4 rounded-lg border border-gray-100">
            Need help? Reply to this email and a real human will answer.
          </div>
        </div>

        {/* Footer Band */}
        <div className="bg-[#2D2321] text-[#FDFBF7]/60 p-8 text-sm text-center flex flex-col items-center gap-4">
          <div className="font-['Space_Grotesk'] font-bold text-xl text-[#FDFBF7] opacity-50 flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#FDFBF7]" /> Riplect
          </div>
          <p>Riplect · A home for coaches, healers and creators</p>
          <a href="#" className="underline underline-offset-4 hover:text-[#FDFBF7] transition-colors">Unsubscribe</a>
        </div>

      </div>
    </div>
  );
}