import { Calendar, Clock, MapPin, Ticket, User } from "lucide-react";

export function BookingConfirmed() {
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
            <div className="text-white/80 font-medium uppercase tracking-wider text-xs">Booking Confirmed</div>
            <h1 className="font-['Space_Grotesk'] text-4xl leading-tight font-bold">Your session with Maya is confirmed</h1>
          </div>
        </div>

        {/* Body Band */}
        <div className="p-8 pb-10 bg-white flex flex-col gap-8">
          <div className="space-y-4 text-lg text-gray-700">
            <p>Hi Sarah,</p>
            <p>Maya Patel has confirmed your booking. Here's everything you need.</p>
          </div>

          {/* Details Card */}
          <div className="bg-[#FDFBF7] border-2 border-[#E94F37]/10 rounded-xl p-6 grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-4 text-sm">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-gray-500 font-medium"><Ticket className="w-4 h-4 text-[#E94F37]" /> Session</div>
              <div className="font-semibold text-gray-900">Career Clarity Session</div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-gray-500 font-medium"><User className="w-4 h-4 text-[#E94F37]" /> Coach</div>
              <div className="font-semibold text-gray-900">Maya Patel</div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-gray-500 font-medium"><Calendar className="w-4 h-4 text-[#E94F37]" /> Date</div>
              <div className="font-semibold text-gray-900">Saturday, March 14</div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-gray-500 font-medium"><Clock className="w-4 h-4 text-[#E94F37]" /> Time</div>
              <div className="font-semibold text-gray-900">3:00 PM – 4:00 PM (GMT+1)</div>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <div className="flex items-center gap-2 text-gray-500 font-medium"><MapPin className="w-4 h-4 text-[#E94F37]" /> Where</div>
              <div className="font-semibold text-gray-900">Google Meet (link below)</div>
            </div>
            <div className="space-y-1 sm:col-span-2 pt-4 border-t border-[#E94F37]/10 mt-2">
              <div className="text-gray-500 font-medium">Confirmation code</div>
              <div className="font-mono text-base font-bold text-[#E94F37]">RPL-7K2X</div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row items-center gap-4 pt-2">
            <a href="#" className="w-full sm:w-auto bg-[#E94F37] text-white font-semibold py-4 px-8 rounded-full text-center hover:shadow-lg hover:-translate-y-0.5 transition-all active:translate-y-0">
              Join Google Meet
            </a>
            <a href="#" className="w-full sm:w-auto text-[#E94F37] font-semibold py-4 px-6 text-center hover:bg-[#FDFBF7] rounded-full transition-colors">
              Manage your booking
            </a>
          </div>

          <div className="text-gray-600 mt-4">
            See you Saturday —<br/>
            <span className="font-semibold text-gray-900">Maya & the Riplect team</span>
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