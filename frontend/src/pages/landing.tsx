import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, Users, Calendar, Package, BookOpen, Trophy } from "lucide-react";
import { Link } from "wouter";

export default function Landing() {
  return (
    <div className="min-h-screen bg-blue-50">
      {/* Navigation */}
      <nav className="bg-blue-50 shadow-sm border-b border-blue-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link href="/">
                <span className="text-2xl font-bold text-brand hover:text-blue-700 cursor-pointer transition-colors">Riplect</span>
              </Link>
            </div>
            <div className="hidden md:flex items-center space-x-4">
              <a href="#features" className="text-gray-700 hover:text-primary px-3 py-2 rounded-md text-sm font-medium">Features</a>
              <a href="#pricing" className="text-gray-700 hover:text-primary px-3 py-2 rounded-md text-sm font-medium">Pricing</a>
              <Link href="/auth">
                <Button
                  variant="ghost"
                  className="text-gray-700 hover:text-primary"
                >
                  Login
                </Button>
              </Link>
              <Link href="/auth">
                <Button
                  className="bg-primary text-white hover:bg-blue-600"
                >
                  Join Riplect
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative bg-blue-50 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="text-center">
            <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
              Your Complete Creator Platform
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
              Empower your coaching, healing, and creative practice with a professional platform.
              Manage bookings, sell products, write blogs, and grow your community - all from one beautiful profile.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/auth">
                <Button
                  size="lg"
                  className="bg-primary text-white hover:bg-blue-600"
                >
                  Start Building Your Profile
                </Button>
              </Link>
              <Link href="/demo">
                <Button
                  size="lg"
                  variant="outline"
                >
                  View Demo Profile
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 bg-blue-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Everything You Need to Succeed
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              From booking management to content creation, we've got all the tools you need to grow your practice.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 bg-primary bg-opacity-10 rounded-lg flex items-center justify-center mb-4">
                  <Calendar className="w-6 h-6 text-primary" />
                </div>
                <CardTitle>Smart Booking System</CardTitle>
                <CardDescription>
                  Let clients book sessions directly with automated confirmations and calendar sync.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 bg-secondary bg-opacity-10 rounded-lg flex items-center justify-center mb-4">
                  <Package className="w-6 h-6 text-secondary" />
                </div>
                <CardTitle>Digital Products</CardTitle>
                <CardDescription>
                  Sell your guides, courses, and resources with secure payment processing.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 bg-accent bg-opacity-10 rounded-lg flex items-center justify-center mb-4">
                  <BookOpen className="w-6 h-6 text-accent" />
                </div>
                <CardTitle>Blog & Content</CardTitle>
                <CardDescription>
                  Share your expertise with a built-in blog and content management system.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 bg-warm bg-opacity-10 rounded-lg flex items-center justify-center mb-4">
                  <Trophy className="w-6 h-6 text-warm" />
                </div>
                <CardTitle>Events & Workshops</CardTitle>
                <CardDescription>
                  Host workshops and events with registration and payment management.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 bg-pink-100 rounded-lg flex items-center justify-center mb-4">
                  <Users className="w-6 h-6 text-pink-600" />
                </div>
                <CardTitle>Professional Profile</CardTitle>
                <CardDescription>
                  Beautiful, customizable profiles that showcase your expertise and personality.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
                <CardTitle>All-in-One Solution</CardTitle>
                <CardDescription>
                  Everything you need in one platform - no need to juggle multiple tools.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-brand">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Ready to Build Your Platform?
          </h2>
          <p className="text-xl text-blue-100 mb-8">
            Join thousands of creators who trust Riplect to grow their business.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button
              size="lg"
              onClick={() => window.location.href = '/api/login'}
              className="bg-white text-primary hover:bg-gray-100"
            >
              Join Riplect
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => window.location.href = '/api/login'}
              className="border-white text-white hover:bg-white hover:text-primary"
            >
              Login
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <p className="text-gray-600 text-sm mb-4">© 2024 Riplect. All rights reserved.</p>
            <div className="flex justify-center space-x-6">
              <a href="#" className="text-gray-600 hover:text-primary text-sm">Privacy Policy</a>
              <a href="#" className="text-gray-600 hover:text-primary text-sm">Terms of Service</a>
              <a href="#" className="text-gray-600 hover:text-primary text-sm">Contact</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}