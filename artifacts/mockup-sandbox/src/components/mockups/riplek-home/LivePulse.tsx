import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { 
  Heart, 
  Clock, 
  MapPin, 
  Calendar,
  Activity,
  ArrowRight,
  Sparkles,
  Users,
  MessageCircle,
  Play
} from "lucide-react";

export function LivePulse() {
  return (
    <div className="min-h-screen bg-[#FDFBF7] font-sans text-stone-800 selection:bg-rose-200">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 bg-[#FDFBF7]/80 backdrop-blur-md border-b border-stone-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-rose-400 to-orange-400 flex items-center justify-center text-white font-bold">
            R
          </div>
          <span className="text-xl font-bold tracking-tight text-stone-900">Riplek</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-stone-600">
          <a href="#" className="hover:text-rose-600 transition-colors flex items-center gap-1">
            <span className="relative flex h-2 w-2 mr-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
            </span>
            Live Now
          </a>
          <a href="#" className="hover:text-rose-600 transition-colors">Practices</a>
          <a href="#" className="hover:text-rose-600 transition-colors">Coaches</a>
        </div>
        <div className="flex items-center gap-4">
          <Button variant="ghost" className="hidden md:inline-flex text-stone-600 hover:text-stone-900 hover:bg-stone-100">
            Log in
          </Button>
          <Button className="bg-stone-900 hover:bg-stone-800 text-white rounded-full px-6">
            Join Platform
          </Button>
        </div>
      </nav>

      <main>
        {/* Hero Section with Live Ticker */}
        <section className="relative pt-20 pb-32 overflow-hidden">
          {/* Background decorative elements */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-b from-orange-50/80 to-transparent blur-3xl -z-10 rounded-full" />
          
          <div className="max-w-4xl mx-auto px-6 text-center">
            <Badge variant="secondary" className="bg-rose-100 text-rose-700 hover:bg-rose-100 mb-8 px-4 py-1.5 rounded-full text-sm font-medium">
              <Sparkles className="w-4 h-4 mr-2 inline" />
              Conscious Creativity & Wellness
            </Badge>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-stone-900 mb-6 leading-[1.1]">
              Find your center,<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-500 to-orange-500">
                right now.
              </span>
            </h1>
            <p className="text-xl text-stone-600 mb-10 max-w-2xl mx-auto leading-relaxed">
              Join live sessions, connect with practitioners, and discover wellness practices happening in our community at this very moment.
            </p>
            
            <Button size="lg" className="bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600 text-white rounded-full px-8 h-14 text-lg shadow-lg shadow-rose-200/50 transition-all hover:scale-105">
              See what's live
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </div>

          {/* Live Activity Feed */}
          <div className="mt-20 max-w-5xl mx-auto px-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold flex items-center gap-2 text-stone-900">
                <Activity className="w-5 h-5 text-rose-500" />
                Community Pulse
              </h2>
              <span className="text-sm text-stone-500">Updated just now</span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Feed Item 1 */}
              <Card className="border-0 shadow-sm bg-white hover:shadow-md transition-shadow group cursor-pointer overflow-hidden relative">
                <div className="absolute top-0 left-0 w-1 h-full bg-rose-400" />
                <CardContent className="p-5 flex items-start gap-4">
                  <Avatar className="w-10 h-10 border-2 border-white shadow-sm ring-2 ring-rose-50">
                    <AvatarFallback className="bg-gradient-to-br from-indigo-400 to-purple-400 text-white text-xs">AM</AvatarFallback>
                  </Avatar>
                  <div className="space-y-1">
                    <p className="text-sm text-stone-600 leading-snug">
                      <span className="font-semibold text-stone-900">Amara</span> just posted a <span className="font-medium text-indigo-600">Breathwork</span> event
                    </p>
                    <p className="text-xs font-medium text-rose-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Starting in 2h
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Feed Item 2 */}
              <Card className="border-0 shadow-sm bg-white hover:shadow-md transition-shadow group cursor-pointer overflow-hidden relative">
                <div className="absolute top-0 left-0 w-1 h-full bg-orange-400" />
                <CardContent className="p-5 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center shrink-0 text-orange-500">
                    <Users className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-stone-600 leading-snug">
                      <span className="font-semibold text-stone-900">12 people</span> are in a <span className="font-medium text-orange-600">Meditation</span> session
                    </p>
                    <p className="text-xs font-medium text-stone-400 flex items-center gap-1">
                      <Play className="w-3 h-3 text-orange-500 fill-current" /> Happening right now
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Feed Item 3 */}
              <Card className="border-0 shadow-sm bg-white hover:shadow-md transition-shadow group cursor-pointer overflow-hidden relative">
                <div className="absolute top-0 left-0 w-1 h-full bg-emerald-400" />
                <CardContent className="p-5 flex items-start gap-4">
                  <Avatar className="w-10 h-10 border-2 border-white shadow-sm ring-2 ring-emerald-50">
                    <AvatarFallback className="bg-gradient-to-br from-emerald-400 to-teal-400 text-white text-xs">PR</AvatarFallback>
                  </Avatar>
                  <div className="space-y-1">
                    <p className="text-sm text-stone-600 leading-snug">
                      New coach joined: <span className="font-semibold text-stone-900">Priya</span>
                    </p>
                    <Badge variant="outline" className="text-[10px] px-2 py-0 h-5 mt-1 border-emerald-200 text-emerald-700 bg-emerald-50">
                      Trauma-informed Yoga
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Happening This Week */}
        <section className="py-20 bg-white">
          <div className="max-w-6xl mx-auto px-6">
            <div className="flex items-end justify-between mb-10">
              <div>
                <h2 className="text-3xl font-bold text-stone-900 mb-2">Happening this week</h2>
                <p className="text-stone-500">Spaces filling up fast. Secure your spot.</p>
              </div>
              <Button variant="outline" className="hidden md:inline-flex rounded-full">
                View schedule
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                {
                  title: "Somatic Healing Circle",
                  coach: "Elena Rostova",
                  type: "Healing",
                  time: "Tomorrow, 6:00 PM",
                  spots: "3 spots left",
                  color: "from-rose-100 to-orange-50",
                  tagColor: "text-rose-700 bg-rose-100",
                  initials: "ER"
                },
                {
                  title: "Morning Vinyasa Flow",
                  coach: "Marcus Chen",
                  type: "Yoga",
                  time: "Wed, 8:00 AM",
                  spots: "Filling fast",
                  color: "from-sky-100 to-indigo-50",
                  tagColor: "text-sky-700 bg-sky-100",
                  initials: "MC"
                },
                {
                  title: "Vedic Chanting Basics",
                  coach: "Dr. Ananya Desai",
                  type: "Chanting",
                  time: "Thu, 7:30 PM",
                  spots: "Open",
                  color: "from-amber-100 to-yellow-50",
                  tagColor: "text-amber-700 bg-amber-100",
                  initials: "AD"
                },
                {
                  title: "Anxiety & Breath",
                  coach: "Sarah Jenkins",
                  type: "Psychology",
                  time: "Fri, 12:00 PM",
                  spots: "1 spot left",
                  color: "from-emerald-100 to-teal-50",
                  tagColor: "text-emerald-700 bg-emerald-100",
                  initials: "SJ"
                }
              ].map((event, i) => (
                <Card key={i} className="group border-stone-100 shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden flex flex-col h-full rounded-2xl cursor-pointer">
                  <div className={`h-32 bg-gradient-to-br ${event.color} relative p-4 flex flex-col justify-between`}>
                    <div className="flex justify-between items-start">
                      <Badge className={`border-0 shadow-none font-medium ${event.tagColor}`}>
                        {event.type}
                      </Badge>
                      <button className="w-8 h-8 rounded-full bg-white/50 backdrop-blur-sm flex items-center justify-center text-stone-600 hover:text-rose-500 hover:bg-white transition-colors">
                        <Heart className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="absolute -bottom-5 right-4">
                      <Avatar className="w-12 h-12 border-4 border-white shadow-sm">
                        <AvatarFallback className="bg-stone-800 text-white font-medium">{event.initials}</AvatarFallback>
                      </Avatar>
                    </div>
                  </div>
                  <CardContent className="p-5 pt-8 flex-1 flex flex-col">
                    <h3 className="font-bold text-lg text-stone-900 mb-1 group-hover:text-rose-600 transition-colors line-clamp-1">{event.title}</h3>
                    <p className="text-sm text-stone-500 mb-4 flex items-center gap-1.5">
                      by <span className="font-medium text-stone-700">{event.coach}</span>
                    </p>
                    
                    <div className="mt-auto space-y-3">
                      <div className="flex items-center gap-2 text-sm text-stone-600">
                        <Calendar className="w-4 h-4 text-stone-400" />
                        {event.time}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-rose-500 bg-rose-50 px-2 py-1 rounded-md">
                          {event.spots}
                        </span>
                        <Button variant="ghost" size="sm" className="h-8 px-2 text-stone-900 group-hover:bg-stone-100">
                          Details
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            
            <div className="mt-8 text-center md:hidden">
              <Button variant="outline" className="rounded-full w-full">
                View full schedule
              </Button>
            </div>
          </div>
        </section>

        {/* Recently Active Coaches */}
        <section className="py-20 bg-[#FDFBF7] border-t border-stone-100">
          <div className="max-w-6xl mx-auto px-6">
            <h2 className="text-2xl font-bold text-stone-900 mb-8">Recently active guides</h2>
            
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
              {[
                { name: "Julian", role: "Meditation", color: "from-blue-400 to-indigo-500" },
                { name: "Maya", role: "Art Therapy", color: "from-pink-400 to-rose-500" },
                { name: "David", role: "Breathwork", color: "from-teal-400 to-emerald-500" },
                { name: "Kiran", role: "Yoga", color: "from-orange-400 to-amber-500" },
                { name: "Sophie", role: "Psychology", color: "from-purple-400 to-fuchsia-500" },
                { name: "Leo", role: "Sound Healing", color: "from-cyan-400 to-blue-500" }
              ].map((coach, i) => (
                <div key={i} className="flex flex-col items-center group cursor-pointer text-center">
                  <div className="relative mb-3">
                    <div className={`w-20 h-20 rounded-full bg-gradient-to-br ${coach.color} p-[2px] transition-transform duration-300 group-hover:scale-110`}>
                      <div className="w-full h-full rounded-full border-2 border-white flex items-center justify-center bg-stone-100">
                        <span className="text-xl font-bold text-stone-700">{coach.name[0]}</span>
                      </div>
                    </div>
                    {/* Online indicator dot */}
                    <div className="absolute bottom-1 right-1 w-4 h-4 bg-green-500 border-2 border-[#FDFBF7] rounded-full"></div>
                  </div>
                  <h4 className="font-semibold text-stone-900 text-sm group-hover:text-rose-600 transition-colors">{coach.name}</h4>
                  <p className="text-xs text-stone-500">{coach.role}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
