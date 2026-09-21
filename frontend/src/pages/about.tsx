import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, ArrowRight, Heart, Users, Globe, Sparkles } from "lucide-react";
import riplekLogo from "@assets/Color_Variations_copy_8@144x_1775989036464.png";
import riplekLogo1 from "@assets/Color_Variations_copy_9@144x-2_1775978761578.png";

export default function About() {
  return (
    <div className="min-h-screen bg-white font-sans">
      <nav className="absolute top-0 w-full z-50 pt-4 pb-2">
        <div className="max-w-7xl mx-auto pl-0 pr-4 sm:pl-0 sm:pr-6 lg:pl-0 lg:pr-8">
          <div className="flex flex-wrap justify-between items-center h-16 gap-4">
            <div className="flex items-center">
              <Link href="/">
                <img 
                  src={riplekLogo1} 
                  alt="Riplect" 
                  className="h-11 cursor-pointer ml-2"
                  data-testid="img-header-logo"
                />
              </Link>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/">
                <Button 
                  variant="ghost" 
                  className="rounded-full bg-white text-[#C96868]/90 text-sm font-medium hover:bg-[#C96868]/90 hover:text-white transition-colors border border-[#b66667]"
                  data-testid="button-back-home"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Home
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <section className="pt-32 pb-4 bg-gradient-to-b from-[#FDF6EE]/50 to-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#b66667]/5 rounded-full blur-[100px] translate-x-1/2 -translate-y-1/2 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-[#b66667]/3 rounded-full blur-[80px] -translate-x-1/2 translate-y-1/2 pointer-events-none" />

        <div className="max-w-3xl mx-auto px-4 text-center relative z-10">
          <img 
            src={riplekLogo} 
            alt="Riplect" 
            className="h-40 md:h-48 mx-auto -my-12 -mb-6"
            data-testid="img-about-logo"
          />
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-stone-600 tracking-tight" data-testid="text-about-title">
            About Riplect
          </h1>
        </div>
      </section>

      <section className="pt-4 pb-6 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="prose prose-lg max-w-none">
            <p className="text-gray-600 text-lg leading-relaxed mb-8" data-testid="text-about-intro">
              Riplect is a conscious creativity and wellness platform created to connect people with guides, coaches, healers, and conscious creators offering meaningful practices and experiences from around the world.
            </p>

            <p className="text-gray-600 text-lg leading-relaxed mb-8" data-testid="text-about-empower">
              It is meant to empower both individuals and communities by connecting people online through one-to-one sessions, workshops, and event bookings, as well as offline by helping people discover experiences and gatherings that support their growth.
            </p>

            <p className="text-gray-600 text-lg leading-relaxed mb-8" data-testid="text-about-tools">
              Riplect empowers coaches and creators with tools to support their journey — including booking calendars, event creation, blog space, and the ability to share or sell digital products — while making it easy for people to discover and access their offerings.
            </p>

            <p className="text-gray-600 text-lg leading-relaxed" data-testid="text-about-aim">
              Our aim is to build a community of sharing, awareness, and lived experience, and to contribute to greater well-being, connection, and positive impact in the world.
            </p>
          </div>
        </div>
      </section>

      <section className="pt-6 pb-8 bg-gradient-to-br from-white via-[#FDF6EE]/30 to-white">
        <div className="max-w-5xl mx-auto px-4">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="p-6 hover-elevate" data-testid="card-wellness">
              <div className="w-12 h-12 rounded-md bg-[#FDF6EE] flex items-center justify-center mb-4">
                <Heart className="w-6 h-6 text-[#b66667]" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2" data-testid="text-wellness-title">Wellness First</h3>
              <p className="text-gray-500 text-sm" data-testid="text-wellness-desc">Supporting well-being and inspired living through meaningful connections.</p>
            </Card>

            <Card className="p-6 hover-elevate" data-testid="card-community">
              <div className="w-12 h-12 rounded-md bg-[#FDF6EE] flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-[#b66667]" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2" data-testid="text-community-title">Community</h3>
              <p className="text-gray-500 text-sm" data-testid="text-community-desc">Building a space for sharing, awareness, and lived experience.</p>
            </Card>

            <Card className="p-6 hover-elevate" data-testid="card-global">
              <div className="w-12 h-12 rounded-md bg-[#FDF6EE] flex items-center justify-center mb-4">
                <Globe className="w-6 h-6 text-[#b66667]" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2" data-testid="text-global-title">Global Reach</h3>
              <p className="text-gray-500 text-sm" data-testid="text-global-desc">Connecting people with guides and experiences from around the world.</p>
            </Card>

            <Card className="p-6 hover-elevate" data-testid="card-empowerment">
              <div className="w-12 h-12 rounded-md bg-[#FDF6EE] flex items-center justify-center mb-4">
                <Sparkles className="w-6 h-6 text-[#b66667]" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2" data-testid="text-empowerment-title">Empowerment</h3>
              <p className="text-gray-500 text-sm" data-testid="text-empowerment-desc">Giving creators the tools they need to share their gifts with the world.</p>
            </Card>
          </div>
        </div>
      </section>

      <section className="pt-8 pb-16 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4" data-testid="text-cta-title">
            Ready to Join the Community?
          </h2>
          <p className="text-gray-600 mb-8" data-testid="text-cta-subtitle">
            Whether you're looking for guidance or ready to share your gifts, Riplect welcomes you.
          </p>
          <div className="flex flex-col sm:flex-row flex-wrap gap-4 justify-center">
            <Link href="/auth">
              <Button size="lg" className="bg-[#b66667] hover:bg-[#9e5556] text-white rounded-full px-8 h-12 text-base shadow-lg shadow-red-100" data-testid="button-join-riplek-about">
                Join Riplect <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
            <Link href="/">
              <Button size="lg" variant="outline" className="rounded-full px-8 h-12 text-base border-[#b66667] text-[#b66667] hover:bg-[#FDF6EE]" data-testid="button-explore-about">
                Explore
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <footer className="py-12 border-t border-gray-100 bg-[#FDF6EE]/30">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col md:flex-row flex-wrap justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              <img src={riplekLogo1} alt="Riplect" className="h-8" data-testid="img-footer-logo" />
              <span className="text-sm text-gray-400" data-testid="text-copyright">© 2025</span>
            </div>
            <div className="flex flex-wrap gap-8 text-sm text-gray-500">
              <Link href="/about" className="hover:text-gray-900 transition-colors" data-testid="link-footer-about">About</Link>
              <Link href="/terms-of-service" className="hover:text-gray-900 transition-colors" data-testid="link-footer-terms">Terms</Link>
              <Link href="/privacy-policy" className="hover:text-gray-900 transition-colors" data-testid="link-footer-privacy">Privacy</Link>
              <Link href="/contact" className="hover:text-gray-900 transition-colors" data-testid="link-footer-contact">Contact</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
