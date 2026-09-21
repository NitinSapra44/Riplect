import { Calendar, Clock, MapPin, Ticket, User } from "lucide-react";

export function BookingConfirmedMobile() {
  return (
    <div className="min-h-screen w-full bg-[#f4f4f5] py-6 px-0 sm:px-4 flex justify-center font-sans text-[#18181b]">
      <div className="w-full max-w-[360px] bg-white rounded-none sm:rounded-2xl overflow-hidden shadow-sm border-0 sm:border border-gray-100 flex flex-col">
        
        {/* Header Band */}
        <div className="bg-[#E94F37] text-white p-6 flex flex-col items-start gap-6">
          <div className="flex items-center gap-2 font-['Space_Grotesk'] font-bold text-xl tracking-tight">
            <div className="w-3.5 h-3.5 rounded-full bg-white opacity-90" />
            Riplect
          </div>
          <div className="space-y-2">
            <div className="text-white/80 font-medium uppercase tracking-wider text-[10px]">Booking Confirmed</div>
            <h1 className="font-['Space_Grotesk'] text-3xl leading-tight font-bold">Your session with Maya is confirmed</h1>
          </div>
        </div>

        {/* Body Band */}
        <div className="p-6 pb-8 bg-white flex flex-col gap-6">
          <div className="space-y-3 text-base text-gray-700">
            <p>Hi Sarah,</p>
            <p>Maya Patel has confirmed your booking. Here's everything you need.</p>
          </div>

          {/* Details Card */}
          <div className="bg-[#FDFBF7] border-2 border-[#E94F37]/10 rounded-xl p-5 flex flex-col gap-5 text-sm">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-gray-500 font-medium text-xs uppercase tracking-wide"><Ticket className="w-3.5 h-3.5 text-[#E94F37]" /> Session</div>
              <div className="font-semibold text-gray-900">Career Clarity Session</div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-gray-500 font-medium text-xs uppercase tracking-wide"><User className="w-3.5 h-3.5 text-[#E94F37]" /> Coach</div>
              <div className="font-semibold text-gray-900">Maya Patel</div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-gray-500 font-medium text-xs uppercase tracking-wide"><Calendar className="w-3.5 h-3.5 text-[#E94F37]" /> Date & Time</div>
              <div className="font-semibold text-gray-900">Sat, March 14</div>
              <div className="text-gray-600">3:00 PM – 4:00 PM (GMT+1)</div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-gray-500 font-medium text-xs uppercase tracking-wide"><MapPin className="w-3.5 h-3.5 text-[#E94F37]" /> Where</div>
              <div className="font-semibold text-gray-900">Google Meet</div>
            </div>
            <div className="space-y-1 pt-4 border-t border-[#E94F37]/10">
              <div className="text-gray-500 font-medium text-xs uppercase tracking-wide">Confirmation code</div>
              <div className="font-mono text-base font-bold text-[#E94F37]">RPL-7K2X</div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3 pt-2">
            <a href="#" className="w-full bg-[#E94F37] text-white font-semibold py-4 px-6 rounded-full text-center hover:shadow-lg transition-all">
              Join Google Meet
            </a>
            <a href="#" className="w-full text-[#E94F37] font-semibold py-4 px-6 text-center hover:bg-[#FDFBF7] rounded-full transition-colors">
              Manage booking
            </a>
          </div>

          <div className="text-gray-600 mt-2 text-sm">
            See you Saturday —<br/>
            <span className="font-semibold text-gray-900">Maya & team</span>
          </div>
        </div>

        {/* Footer Band */}
        <div className="bg-[#2D2321] text-[#FDFBF7]/60 p-6 text-xs text-center flex flex-col items-center gap-3">
          <div className="font-['Space_Grotesk'] font-bold text-lg text-[#FDFBF7] opacity-50 flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-[#FDFBF7]" /> Riplect
          </div>
          <p>Riplect · You received this because you booked a session.</p>
          <a href="#" className="underline underline-offset-4 hover:text-[#FDFBF7] transition-colors">Unsubscribe</a>
        </div>

      </div>
    </div>
  );
}