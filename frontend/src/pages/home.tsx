import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "wouter";
import { posthog } from "@/lib/posthog";
import { 
  Clock, Users, ArrowRight, CheckCircle2, Layout, CreditCard, User, LayoutDashboard
} from "lucide-react";
import riplekLogo from "@assets/Color_Variations_copy_8@144x_1775989036464.png";
import riplekLogo1 from "@assets/Color_Variations_copy_9@144x-2_1775978761578.png";
import riplekLogoHeader from "@assets/Color_Variations_copy_7@144x-2_1776669473864.png";
import SearchExploreSection from "@/components/search-explore-section";

export default function Home() {
  const { user } = useAuth();

  const { data: userProfile } = useQuery<{ username: string } | null>({
    queryKey: ["/api/dashboard/profile"],
    enabled: !!user,
  });

  useEffect(() => {
    const saved = sessionStorage.getItem('home_scroll_y');
    if (!saved) return;
    const targetY = parseInt(saved, 10);
    sessionStorage.removeItem('home_scroll_y');

    let attempts = 0;
    const tryRestore = () => {
      if (document.documentElement.scrollHeight >= targetY + window.innerHeight || attempts >= 25) {
        window.scrollTo({ top: targetY, behavior: 'instant' });
      } else {
        attempts++;
        setTimeout(tryRestore, 80);
      }
    };
    setTimeout(tryRestore, 80);
  }, []);

  return (
    <div className="min-h-screen bg-white font-sans">

      {/* CHANGED: Removed fixed positioning, background, and blur. Added absolute positioning. */}
      <nav className="absolute top-0 w-full z-50 pt-4 pb-2">
        <div className="max-w-7xl mx-auto pl-0 pr-4 sm:pl-0 sm:pr-6 lg:pl-0 lg:pr-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link href="/">
                <img 
                  src={riplekLogoHeader} 
                  alt="Riplect" 
                  className="h-11 cursor-pointer ml-2"
                  data-testid="img-header-logo"
                />
              </Link>
            </div>
            <div className="flex items-center gap-3">
              {user ? (
                <>
                  <Link href={userProfile?.username ? `/${userProfile.username}` : "/dashboard"}>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      /* CHANGED: Default bg is white, Hover bg is Red */
                      className="rounded-full group bg-white hover:bg-[#C96868]/90 transition-colors border border-[#C96868]/90"
                      data-testid="button-view-profile"
                    >
                      {/* CHANGED: Default icon is Red, Hover icon is White */}
                      <User className="w-6 h-6 text-[#C96868]/90 group-hover:text-white transition-colors" />
                    </Button>
                  </Link>
                  <Link href="/dashboard">
                    <Button 
                      variant="ghost" 
                      /* CHANGED: Default bg white/text red. Hover bg red/text white */
                      className="rounded-full bg-white text-[#C96868]/90 text-sm font-medium hover:bg-[#C96868]/90 hover:text-white transition-colors border border-[#b66667]"
                      data-testid="button-dashboard"
                    >
                      Dashboard
                    </Button>
                  </Link>
                </>
              ) : (
                <Link href="/auth">
                  <Button onClick={() => posthog.capture('home_cta_clicked', { cta: 'join_riplek' })} className="bg-[#b66667] hover:bg-[#9e5556] text-white rounded-full px-5 h-10 shadow-md shadow-red-100 flex items-center gap-2 transition-transform active:scale-95" data-testid="button-join-riplek">
                    Join Riplect <div className="bg-white/20 rounded-full p-0.5"><ArrowRight className="w-3 h-3" /></div>
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </nav>

      <section className="pt-28 pb-1 bg-gradient-to-b from-[#FDF6EE]/50 to-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#b66667]/5 rounded-full blur-[100px] translate-x-1/2 -translate-y-1/2 pointer-events-none" />

        <div className="max-w-3xl mx-auto px-4 text-center relative z-10">
          <img
            src={riplekLogo1}
            alt="Riplect"
            className="h-16 mx-auto mb-1"
            data-testid="img-riplek-logo"
          />
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-stone-700 tracking-tight mb-1.5">
            Conscious Collective
          </h1>
          <p className="text-gray-500 text-base mx-auto mb-10 leading-snug">
            Conscious Creativity and Wellness Platform -<br />
            Discover guides creators and experiences
          </p>
        </div>
      </section>

      <section id="results-section" className="pb-20 mt-0">
        <SearchExploreSection />
      </section>

      <section id="features-section" className="py-24 relative overflow-hidden bg-gradient-to-br from-white via-[#FDF6EE] to-white">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-[#b66667] opacity-[0.03] rounded-full blur-[120px] translate-x-1/3 -translate-y-1/3" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-500 opacity-[0.02] rounded-full blur-[120px] -translate-x-1/3 translate-y-1/3" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-50 border border-red-100 text-[#b66667] text-sm font-medium mb-6">
                <span className="w-2 h-2 rounded-full bg-[#b66667] animate-pulse" />
                For Coaches & Creators
              </div>

              <h2 className="text-4xl md:text-5xl font-bold mb-6 leading-tight tracking-tight text-gray-900">
                Build Your Digital <br/> Sanctuary.
              </h2>

              <p className="text-gray-600 text-lg mb-8 leading-relaxed font-light">
                Riplect gives you a complete toolkit to manage your business. 
                From booking sessions to selling digital resources, manage everything in one beautiful profile.
              </p>

              <div className="space-y-6">
                {[
                  { title: "Smart Booking System", desc: "Automated scheduling, timezones, and payments." },
                  { title: "Digital & Physical Products", desc: "Sell e-books, courses, or merchandise directly." },
                  { title: "Events & Workshops", desc: "Host webinars or retreats with built-in ticketing." },
                  { title: "Beautiful Public Profile", desc: "Showcase your bio, testimonials, and gallery." }
                ].map((feature, i) => (
                  <div key={i} className="flex items-start gap-4 group">
                    <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center flex-shrink-0 border border-gray-100 group-hover:border-[#b66667]/30 group-hover:shadow-md transition-all duration-300">
                      <CheckCircle2 className="w-5 h-5 text-[#b66667]" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-lg text-gray-900">{feature.title}</h4>
                      <p className="text-gray-500 text-sm group-hover:text-[#b66667] transition-colors">{feature.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-10">
                <Link href="/auth">
                  <Button size="lg" onClick={() => posthog.capture('home_cta_clicked', { cta: 'create_profile' })} className="bg-[#b66667] hover:bg-[#9e5556] text-white rounded-full px-8 h-12 text-base shadow-lg shadow-red-100 hover:shadow-red-200 transition-all transform hover:-translate-y-0.5" data-testid="button-create-profile">
                    Create Your Profile <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Card className="bg-white border-gray-100 p-6 hover:-translate-y-2 hover:shadow-xl transition-all duration-300 backdrop-blur-sm cursor-default group">
                <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4 group-hover:bg-[#b66667] transition-colors duration-300">
                  <Layout className="w-6 h-6 text-[#b66667] group-hover:text-white transition-colors duration-300" />
                </div>
                <h3 className="font-bold mb-2 text-gray-900">Profile Page</h3>
                <p className="text-sm text-gray-500">Your professional landing page, fully customizable.</p>
              </Card>

              <Card className="bg-white border-gray-100 p-6 hover:-translate-y-2 hover:shadow-xl transition-all duration-300 mt-8 backdrop-blur-sm cursor-default group">
                <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mb-4 group-hover:bg-blue-500 transition-colors duration-300">
                  <Clock className="w-6 h-6 text-blue-500 group-hover:text-white transition-colors duration-300" />
                </div>
                <h3 className="font-bold mb-2 text-gray-900">Scheduling</h3>
                <p className="text-sm text-gray-500">Syncs with your calendar to prevent double bookings.</p>
              </Card>

              <Card className="bg-white border-gray-100 p-6 hover:-translate-y-2 hover:shadow-xl transition-all duration-300 backdrop-blur-sm cursor-default group">
                <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mb-4 group-hover:bg-green-500 transition-colors duration-300">
                  <CreditCard className="w-6 h-6 text-green-600 group-hover:text-white transition-colors duration-300" />
                </div>
                <h3 className="font-bold mb-2 text-gray-900">Payments</h3>
                <p className="text-sm text-gray-500">Secure processing for sessions and products.</p>
              </Card>

              <Card className="bg-white border-gray-100 p-6 hover:-translate-y-2 hover:shadow-xl transition-all duration-300 mt-8 backdrop-blur-sm cursor-default group">
                <div className="w-12 h-12 rounded-full bg-purple-50 flex items-center justify-center mb-4 group-hover:bg-purple-500 transition-colors duration-300">
                  <Users className="w-6 h-6 text-purple-600 group-hover:text-white transition-colors duration-300" />
                </div>
                <h3 className="font-bold mb-2 text-gray-900">Community</h3>
                <p className="text-sm text-gray-500">Manage client relationships and history.</p>
              </Card>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 bg-white">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-6 tracking-tight">Ready to share your gifts with the world?</h2>
          <p className="text-gray-500 mb-10 max-w-xl mx-auto">
            Join thousands of coaches and healers who trust Riplect to run their business. 
            Start for free and upgrade as you grow.
          </p>
          <div className="flex justify-center">
            <Link href="/auth">
              <Button size="lg" onClick={() => posthog.capture('home_cta_clicked', { cta: 'get_started' })} className="bg-[#b66667] hover:bg-[#9e5556] text-white rounded-full px-8 h-14 shadow-xl shadow-red-100/50 hover:shadow-red-200 transition-all" data-testid="button-get-started">
                Get Started for Free
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <footer className="bg-gray-50 border-t border-gray-100 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <img src={riplekLogo1} alt="Riplect" className="h-7" data-testid="img-footer-logo" />
            <span className="text-sm text-gray-400">© 2025</span>
          </div>
          <div className="flex gap-8 text-sm text-gray-500">
            <Link href="/about" className="hover:text-gray-900 transition-colors" data-testid="link-footer-about">About</Link>
            <Link href="/terms-of-service" className="hover:text-gray-900 transition-colors" data-testid="link-footer-terms">Terms</Link>
            <Link href="/privacy-policy" className="hover:text-gray-900 transition-colors" data-testid="link-footer-privacy">Privacy</Link>
            <Link href="/contact" className="hover:text-gray-900 transition-colors" data-testid="link-footer-contact">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}