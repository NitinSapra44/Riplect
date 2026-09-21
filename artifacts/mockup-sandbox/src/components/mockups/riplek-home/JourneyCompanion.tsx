import React, { useState } from "react";
import { ArrowRight, Sparkles, Compass, Leaf, ArrowUpRight, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function JourneyCompanion() {
  const [activePath, setActivePath] = useState<"curious" | "committed" | "coach">("curious");

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-[#2D2825] font-sans selection:bg-[#E8CDBB] selection:text-[#2D2825]">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-[#FAFAFA]/80 backdrop-blur-md border-b border-[#E8CDBB]/30">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#C87D65] flex items-center justify-center">
              <span className="text-white font-serif italic text-lg leading-none mt-1">R</span>
            </div>
            <span className="font-serif text-xl tracking-tight">Riplek</span>
          </div>
          <div className="flex items-center gap-6">
            <button className="text-sm font-medium text-[#7A6B63] hover:text-[#2D2825] transition-colors">Sign in</button>
            <Button className="bg-[#2D2825] text-white hover:bg-[#4A423D] rounded-full px-6 py-5">
              Begin your journey
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-16 px-6 relative overflow-hidden min-h-[70vh] flex flex-col items-center justify-center">
        {/* Decorative background element */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-tr from-[#F1E0D6] via-[#F8EAE2] to-[#FDFBF9] rounded-full blur-3xl opacity-60 -z-10 pointer-events-none" />
        
        <div className="max-w-4xl mx-auto text-center z-10 space-y-16">
          <div className="space-y-6">
            <h1 className="font-serif text-5xl md:text-7xl tracking-tight text-[#2D2825] leading-tight">
              Where are you <br/>
              <span className="italic text-[#C87D65]">right now?</span>
            </h1>
            <p className="text-lg md:text-xl text-[#7A6B63] max-w-2xl mx-auto font-light leading-relaxed">
              Healing isn't a destination, it's a practice. Tell us where you are on your path, and we'll walk with you.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Path: Curious */}
            <button
              onClick={() => setActivePath("curious")}
              className={`group relative text-left p-8 rounded-2xl transition-all duration-500 overflow-hidden ${
                activePath === "curious" 
                  ? "bg-[#2D2825] text-white shadow-xl scale-105" 
                  : "bg-white text-[#2D2825] border border-[#E8CDBB]/50 hover:border-[#C87D65]/40 hover:shadow-md"
              }`}
            >
              <div className={`absolute top-0 right-0 p-6 opacity-10 transition-opacity duration-500 ${activePath === "curious" ? "opacity-20" : "group-hover:opacity-20"}`}>
                <Compass size={48} className={activePath === "curious" ? "text-white" : "text-[#C87D65]"} />
              </div>
              <h3 className="font-serif text-2xl mb-3 relative z-10">I'm curious</h3>
              <p className={`text-sm leading-relaxed relative z-10 ${activePath === "curious" ? "text-[#E8CDBB]" : "text-[#7A6B63]"}`}>
                Just exploring. Looking for gentle introductions, short sessions, and new ideas.
              </p>
            </button>

            {/* Path: Committed */}
            <button
              onClick={() => setActivePath("committed")}
              className={`group relative text-left p-8 rounded-2xl transition-all duration-500 overflow-hidden ${
                activePath === "committed" 
                  ? "bg-[#2D2825] text-white shadow-xl scale-105" 
                  : "bg-white text-[#2D2825] border border-[#E8CDBB]/50 hover:border-[#C87D65]/40 hover:shadow-md"
              }`}
            >
              <div className={`absolute top-0 right-0 p-6 opacity-10 transition-opacity duration-500 ${activePath === "committed" ? "opacity-20" : "group-hover:opacity-20"}`}>
                <Leaf size={48} className={activePath === "committed" ? "text-white" : "text-[#C87D65]"} />
              </div>
              <h3 className="font-serif text-2xl mb-3 relative z-10">I'm committed</h3>
              <p className={`text-sm leading-relaxed relative z-10 ${activePath === "committed" ? "text-[#E8CDBB]" : "text-[#7A6B63]"}`}>
                Ready to go deeper. Seeking structured programs, recurring practice, and deep dives.
              </p>
            </button>

            {/* Path: Coach */}
            <button
              onClick={() => setActivePath("coach")}
              className={`group relative text-left p-8 rounded-2xl transition-all duration-500 overflow-hidden ${
                activePath === "coach" 
                  ? "bg-[#2D2825] text-white shadow-xl scale-105" 
                  : "bg-white text-[#2D2825] border border-[#E8CDBB]/50 hover:border-[#C87D65]/40 hover:shadow-md"
              }`}
            >
              <div className={`absolute top-0 right-0 p-6 opacity-10 transition-opacity duration-500 ${activePath === "coach" ? "opacity-20" : "group-hover:opacity-20"}`}>
                <Sparkles size={48} className={activePath === "coach" ? "text-white" : "text-[#C87D65]"} />
              </div>
              <h3 className="font-serif text-2xl mb-3 relative z-10">I want to guide</h3>
              <p className={`text-sm leading-relaxed relative z-10 ${activePath === "coach" ? "text-[#E8CDBB]" : "text-[#7A6B63]"}`}>
                Ready to hold space for others. Looking to share my practice and build a community.
              </p>
            </button>
          </div>
        </div>
      </section>

      {/* Dynamic Content Area */}
      <section className="px-6 pb-32">
        <div className="max-w-7xl mx-auto">
          {activePath === "curious" && <CuriousContent />}
          {activePath === "committed" && <CommittedContent />}
          {activePath === "coach" && <CoachContent />}
        </div>
      </section>
    </div>
  );
}

function CuriousContent() {
  const sessions = [
    {
      title: "Introduction to Somatic Grounding",
      guide: "Dr. Elena Rostova",
      type: "Somatic Therapy",
      duration: "30 min",
      price: "$15",
      image: "/__mockup/images/session-somatic.png",
      color: "bg-[#F1E0D6]",
      tag: "Gentle Start"
    },
    {
      title: "Breathwork for Evening Winding Down",
      guide: "Marcus Chen",
      type: "Breathwork",
      duration: "15 min",
      price: "Free",
      image: "/__mockup/images/session-breathwork.png",
      color: "bg-[#E6E8E3]",
      tag: "Popular"
    },
    {
      title: "Intuitive Watercolor Expression",
      guide: "Sarah Jenkins",
      type: "Art Therapy",
      duration: "45 min",
      price: "$20",
      image: "/__mockup/images/session-meditation.png",
      color: "bg-[#EAE4F1]",
      tag: "Live Today"
    }
  ];

  return (
    <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 ease-out">
      <div className="flex items-end justify-between mb-12 border-b border-[#E8CDBB]/30 pb-6">
        <div>
          <span className="text-[#C87D65] font-semibold tracking-wider text-xs uppercase mb-3 block">For the curious</span>
          <h2 className="font-serif text-3xl md:text-4xl text-[#2D2825]">Gentle invitations to practice</h2>
        </div>
        <button className="hidden md:flex items-center gap-2 text-sm font-medium text-[#2D2825] hover:text-[#C87D65] transition-colors">
          Explore all introductory sessions <ArrowRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {sessions.map((session, i) => (
          <div key={i} className="group cursor-pointer">
            <div className={`relative aspect-[4/5] rounded-2xl overflow-hidden mb-6 ${session.color}`}>
              {session.image ? (
                <img src={session.image} alt={session.title} className="w-full h-full object-cover mix-blend-multiply opacity-80 group-hover:scale-105 transition-transform duration-700" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[#7A6B63]/30">
                  <PlayCircle size={64} strokeWidth={1} />
                </div>
              )}
              <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-medium text-[#2D2825]">
                {session.tag}
              </div>
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-500" />
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between items-start">
                <span className="text-xs font-medium text-[#C87D65] uppercase tracking-wider">{session.type}</span>
                <span className="text-sm font-medium text-[#2D2825]">{session.price}</span>
              </div>
              <h3 className="font-serif text-xl text-[#2D2825] leading-snug group-hover:text-[#C87D65] transition-colors">
                {session.title}
              </h3>
              <p className="text-sm text-[#7A6B63]">
                Guided by {session.guide} • {session.duration}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CommittedContent() {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 ease-out">
      <div className="flex items-end justify-between mb-12 border-b border-[#E8CDBB]/30 pb-6">
        <div>
          <span className="text-[#C87D65] font-semibold tracking-wider text-xs uppercase mb-3 block">For the committed</span>
          <h2 className="font-serif text-3xl md:text-4xl text-[#2D2825]">Deepen your journey</h2>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Program 1 */}
        <div className="flex flex-col md:flex-row gap-8 bg-white p-8 rounded-3xl border border-[#E8CDBB]/30 hover:shadow-lg transition-shadow">
          <div className="w-full md:w-2/5 aspect-square rounded-2xl bg-[#F8EAE2] overflow-hidden relative">
            <img src="/__mockup/images/session-meditation.png" alt="Meditation" className="w-full h-full object-cover mix-blend-multiply opacity-70" />
          </div>
          <div className="w-full md:w-3/5 flex flex-col justify-center space-y-4">
            <span className="text-xs font-medium text-[#C87D65] uppercase tracking-wider">8-Week Immersive</span>
            <h3 className="font-serif text-2xl text-[#2D2825]">The Alchemy of Presence</h3>
            <p className="text-[#7A6B63] text-sm leading-relaxed">
              A structured two-month journey into vipassana meditation and nervous system regulation. Includes weekly live calls, daily audio practices, and a private cohort community.
            </p>
            <div className="flex items-center gap-3 pt-2">
              <div className="w-10 h-10 rounded-full bg-[#EAE4F1] flex items-center justify-center overflow-hidden">
                <span className="text-xs font-serif">SL</span>
              </div>
              <div>
                <p className="text-sm font-medium text-[#2D2825]">Sarah Lin</p>
                <p className="text-xs text-[#7A6B63]">Master Teacher</p>
              </div>
            </div>
            <Button variant="outline" className="mt-4 w-fit rounded-full border-[#C87D65] text-[#C87D65] hover:bg-[#C87D65] hover:text-white">
              View Syllabus
            </Button>
          </div>
        </div>

        {/* Program 2 */}
        <div className="flex flex-col md:flex-row gap-8 bg-[#2D2825] p-8 rounded-3xl text-white hover:shadow-xl transition-shadow">
          <div className="w-full md:w-3/5 flex flex-col justify-center space-y-4">
            <span className="text-xs font-medium text-[#E8CDBB] uppercase tracking-wider">1-on-1 Mentorship</span>
            <h3 className="font-serif text-2xl">Shadow Work Integration</h3>
            <p className="text-white/70 text-sm leading-relaxed">
              A profound 3-month personal container. Weekly 90-minute private sessions combining Jungian psychology with somatic experiencing to integrate fragmented parts of self.
            </p>
            <div className="flex items-center gap-3 pt-2">
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center overflow-hidden">
                <span className="text-xs font-serif text-white">DM</span>
              </div>
              <div>
                <p className="text-sm font-medium text-white">Dr. David Miller</p>
                <p className="text-xs text-white/50">Clinical Psychologist</p>
              </div>
            </div>
            <Button className="mt-4 w-fit rounded-full bg-white text-[#2D2825] hover:bg-[#E8CDBB]">
              Apply for Mentorship
            </Button>
          </div>
          <div className="w-full md:w-2/5 aspect-square rounded-2xl bg-white/5 overflow-hidden relative order-first md:order-last">
             <img src="/__mockup/images/session-somatic.png" alt="Shadow Work" className="w-full h-full object-cover mix-blend-overlay opacity-50" />
          </div>
        </div>
      </div>
    </div>
  );
}

function CoachContent() {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 ease-out">
      <div className="flex items-end justify-between mb-12 border-b border-[#E8CDBB]/30 pb-6">
        <div>
          <span className="text-[#C87D65] font-semibold tracking-wider text-xs uppercase mb-3 block">For guides</span>
          <h2 className="font-serif text-3xl md:text-4xl text-[#2D2825]">Share your practice</h2>
        </div>
      </div>
      
      <div className="bg-white rounded-3xl border border-[#E8CDBB]/30 p-10 md:p-16 text-center max-w-4xl mx-auto space-y-8">
        <h3 className="font-serif text-3xl text-[#2D2825]">Your space, beautifully held.</h3>
        <p className="text-[#7A6B63] text-lg max-w-2xl mx-auto font-light leading-relaxed">
          Riplek provides the quiet infrastructure you need to host sessions, build programs, and nurture a community — without the noise of a typical marketplace.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-8 text-left">
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-full bg-[#F8EAE2] flex items-center justify-center text-[#C87D65] mb-6">
              <span className="font-serif text-xl">1</span>
            </div>
            <h4 className="font-medium text-[#2D2825]">Craft your sanctuary</h4>
            <p className="text-sm text-[#7A6B63]">Build a beautiful profile that reflects your unique energetic signature.</p>
          </div>
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-full bg-[#F8EAE2] flex items-center justify-center text-[#C87D65] mb-6">
              <span className="font-serif text-xl">2</span>
            </div>
            <h4 className="font-medium text-[#2D2825]">Host with ease</h4>
            <p className="text-sm text-[#7A6B63]">Integrated scheduling, payments, and video rooms that just work.</p>
          </div>
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-full bg-[#F8EAE2] flex items-center justify-center text-[#C87D65] mb-6">
              <span className="font-serif text-xl">3</span>
            </div>
            <h4 className="font-medium text-[#2D2825]">Grow your circle</h4>
            <p className="text-sm text-[#7A6B63]">Gather your community in private spaces designed for authentic connection.</p>
          </div>
        </div>

        <div className="pt-10">
          <Button className="bg-[#2D2825] text-white hover:bg-[#4A423D] rounded-full px-8 py-6 text-lg">
            Apply to become a guide <ArrowUpRight className="ml-2" size={20} />
          </Button>
        </div>
      </div>
    </div>
  );
}
