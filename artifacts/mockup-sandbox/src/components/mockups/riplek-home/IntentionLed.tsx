import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Menu, Leaf, Sparkles, Heart, Users, Brain, Activity, ArrowRight, Star } from "lucide-react";

export function IntentionLed() {
  const [selectedIntention, setSelectedIntention] = useState<string>("calm");

  const intentions = [
    { id: "calm", label: "Find Calm", desc: "Regulate your nervous system", icon: <Leaf className="w-5 h-5" />, color: "bg-orange-50 text-orange-700 border-orange-200" },
    { id: "focus", label: "Build Focus", desc: "Sharpen your mind and clarity", icon: <Activity className="w-5 h-5" />, color: "bg-stone-50 text-stone-700 border-stone-200" },
    { id: "heal", label: "Heal & Recover", desc: "Process and move forward", icon: <Heart className="w-5 h-5" />, color: "bg-rose-50 text-rose-700 border-rose-200" },
    { id: "create", label: "Explore Creatively", desc: "Unlock your expression", icon: <Sparkles className="w-5 h-5" />, color: "bg-amber-50 text-amber-700 border-amber-200" },
    { id: "connect", label: "Connect with Others", desc: "Find your community", icon: <Users className="w-5 h-5" />, color: "bg-red-50 text-red-700 border-red-200" },
    { id: "understand", label: "Understand Yourself", desc: "Deepen your self-awareness", icon: <Brain className="w-5 h-5" />, color: "bg-orange-50 text-orange-800 border-orange-200" },
  ];

  const results = {
    calm: [
      { name: "Elena Rostova", role: "Somatic Therapist", title: "Nervous System Reset", time: "Tomorrow, 9:00 AM", price: "$45", rating: 4.9, reviews: 128, gradient: "from-orange-100 to-rose-100" },
      { name: "David Chen", role: "Meditation Guide", title: "Vipassana Basics", time: "Wed, 6:00 PM", price: "$20", rating: 4.8, reviews: 85, gradient: "from-stone-100 to-orange-50" },
      { name: "Sarah Jenkins", role: "Breathwork Facilitator", title: "Deep Calm Breathwork", time: "Thu, 7:00 PM", price: "$35", rating: 5.0, reviews: 42, gradient: "from-rose-50 to-orange-100" },
    ],
    focus: [
      { name: "Dr. Marcus Vance", role: "Cognitive Coach", title: "ADHD Focus Strategies", time: "Mon, 10:00 AM", price: "$85", rating: 4.9, reviews: 210, gradient: "from-stone-200 to-stone-100" },
      { name: "Lena Wright", role: "Productivity Mentor", title: "Deep Work Masterclass", time: "Tue, 1:00 PM", price: "$30", rating: 4.7, reviews: 56, gradient: "from-orange-50 to-stone-100" },
      { name: "James Holden", role: "Mindfulness Coach", title: "Mindful Clarity", time: "Fri, 8:00 AM", price: "$25", rating: 4.9, reviews: 112, gradient: "from-stone-100 to-rose-50" },
    ],
    heal: [
      { name: "Dr. Aisha Rahman", role: "Trauma Specialist", title: "Somatic Healing Session", time: "Thu, 4:00 PM", price: "$120", rating: 5.0, reviews: 89, gradient: "from-rose-100 to-red-100" },
      { name: "Maya Patel", role: "Grief Counselor", title: "Moving Through Loss", time: "Wed, 5:30 PM", price: "$65", rating: 4.9, reviews: 145, gradient: "from-orange-100 to-rose-50" },
      { name: "Samira Jones", role: "Energy Healer", title: "Reiki Energy Clearing", time: "Sat, 11:00 AM", price: "$50", rating: 4.8, reviews: 76, gradient: "from-red-50 to-orange-100" },
    ],
    create: [
      { name: "Julian Fox", role: "Art Therapist", title: "Intuitive Painting", time: "Sun, 2:00 PM", price: "$40", rating: 4.9, reviews: 230, gradient: "from-amber-100 to-orange-100" },
      { name: "Chloe Dans", role: "Writing Coach", title: "Unblock Your Voice", time: "Tue, 6:00 PM", price: "$35", rating: 4.8, reviews: 110, gradient: "from-orange-50 to-amber-100" },
      { name: "Nico Reyes", role: "Music Guide", title: "Vocal Toning & Sound", time: "Thu, 7:30 PM", price: "$25", rating: 5.0, reviews: 67, gradient: "from-amber-50 to-rose-100" },
    ],
    connect: [
      { name: "Circle Facilitators", role: "Community Group", title: "Men's Vulnerability Circle", time: "Wed, 8:00 PM", price: "Free", rating: 4.9, reviews: 340, gradient: "from-red-100 to-rose-100" },
      { name: "Anna & Tom", role: "Relationship Coaches", title: "Conscious Communication", time: "Sat, 10:00 AM", price: "$55", rating: 4.8, reviews: 189, gradient: "from-rose-50 to-red-50" },
      { name: "Local Sangha", role: "Meditation Group", title: "Sunday Sangha Gathering", time: "Sun, 9:00 AM", price: "Donation", rating: 4.9, reviews: 412, gradient: "from-orange-100 to-red-50" },
    ],
    understand: [
      { name: "Dr. Emilie Thorne", role: "Jungian Analyst", title: "Dream Work Introduction", time: "Mon, 5:00 PM", price: "$90", rating: 5.0, reviews: 156, gradient: "from-orange-200 to-amber-100" },
      { name: "Rajiv Menon", role: "Astrologer", title: "Birth Chart Deep Dive", time: "Thu, 3:00 PM", price: "$75", rating: 4.9, reviews: 288, gradient: "from-amber-100 to-orange-50" },
      { name: "Clara Hughes", role: "Enneagram Coach", title: "Discover Your Type", time: "Fri, 12:00 PM", price: "$45", rating: 4.8, reviews: 92, gradient: "from-orange-50 to-amber-50" },
    ]
  };

  const currentResults = results[selectedIntention as keyof typeof results] || results.calm;

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-stone-800 font-sans selection:bg-rose-200">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-6 py-4 bg-white/50 backdrop-blur-md border-b border-stone-100 sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-rose-700 flex items-center justify-center text-white font-bold text-lg">
            R
          </div>
          <span className="text-xl font-medium tracking-tight text-stone-900">riplek</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-stone-600">
          <a href="#" className="hover:text-rose-700 transition-colors">For Practitioners</a>
          <a href="#" className="hover:text-rose-700 transition-colors">About</a>
          <a href="#" className="hover:text-rose-700 transition-colors">Sign In</a>
          <Button className="bg-rose-700 hover:bg-rose-800 text-white rounded-full px-6">
            Join Free
          </Button>
        </div>
        <button className="md:hidden p-2 text-stone-600">
          <Menu className="w-6 h-6" />
        </button>
      </nav>

      {/* Hero */}
      <main className="max-w-5xl mx-auto px-6 pt-20 pb-24">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif text-stone-900 tracking-tight leading-tight mb-6">
            What are you here to <span className="text-rose-700 italic">explore?</span>
          </h1>
          <p className="text-lg text-stone-500 leading-relaxed">
            Connect with verified practitioners for sessions in yoga, therapy, coaching, and creative expression. Let your intention guide you.
          </p>
        </div>

        {/* Intention Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-20">
          {intentions.map((intent) => (
            <button
              key={intent.id}
              onClick={() => setSelectedIntention(intent.id)}
              className={`p-6 rounded-2xl border text-left transition-all duration-300 group
                ${selectedIntention === intent.id 
                  ? 'bg-white border-rose-300 shadow-md ring-1 ring-rose-300 scale-[1.02]' 
                  : 'bg-white/60 border-stone-200 hover:border-rose-200 hover:bg-white hover:shadow-sm'}`}
            >
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 transition-colors ${intent.color}`}>
                {intent.icon}
              </div>
              <h3 className="text-lg font-medium text-stone-900 mb-1">{intent.label}</h3>
              <p className="text-sm text-stone-500">{intent.desc}</p>
            </button>
          ))}
        </div>

        {/* Results Section */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-serif text-stone-900">
              Curated for <span className="italic text-rose-700">{intentions.find(i => i.id === selectedIntention)?.label}</span>
            </h2>
            <button className="text-sm font-medium text-rose-700 flex items-center gap-1 hover:gap-2 transition-all">
              View all <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {currentResults.map((result, idx) => (
              <div key={idx} className="group bg-white rounded-2xl border border-stone-100 overflow-hidden hover:shadow-lg transition-all duration-300 cursor-pointer flex flex-col">
                <div className={`h-32 bg-gradient-to-br ${result.gradient} w-full relative`}>
                  <div className="absolute top-4 right-4 bg-white/80 backdrop-blur-sm px-2 py-1 rounded-full text-xs font-medium text-stone-700 flex items-center gap-1">
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    {result.rating}
                  </div>
                </div>
                <div className="p-6 flex-1 flex flex-col">
                  <div className="text-xs font-medium text-rose-600 mb-2 uppercase tracking-wider">{result.role}</div>
                  <h3 className="text-lg font-medium text-stone-900 mb-1">{result.title}</h3>
                  <p className="text-sm text-stone-500 mb-4">with {result.name}</p>
                  
                  <div className="mt-auto pt-4 border-t border-stone-100 flex items-center justify-between">
                    <div className="text-sm text-stone-600">{result.time}</div>
                    <div className="font-medium text-stone-900">{result.price}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
