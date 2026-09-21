import { useQuery } from "@tanstack/react-query";
import { linkifyText } from "@/lib/linkify";
import riplekLogo1 from "@assets/Color_Variations_copy_9@144x-2_1775978761578.png";
import { useRoute, Link } from "wouter";
import { useSmartBack } from "@/hooks/use-smart-back";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calendar, Clock, Share2, FileText, UserCircle } from "lucide-react";
import { format } from "date-fns";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { posthog } from "@/lib/posthog";
import { generateBlogPostShareMessage } from "@/lib/whatsapp-share";
import defaultProfileImage from "@assets/WhatsApp Image 2025-11-28 at 13.31.40_1764389051024.jpeg";

interface BlogPost {
  id: number;
  profileId: number;
  title: string;
  slug: string;
  excerpt?: string;
  thumbnailDescription?: string;
  content: string;
  imageUrl?: string;
  readTime?: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Profile {
  id: number;
  username: string;
  displayName: string;
  title?: string;
  profileImageUrl?: string;
}

export default function BlogPost() {
  const [, params] = useRoute("/:username/blog/:slug");
  const username = params?.username;
  const slug = params?.slug;
  const { toast } = useToast();
  const goBack = useSmartBack(`/${username}#blog`);

  const { data: profile, isLoading: profileLoading } = useQuery<Profile>({
    queryKey: ["/api/profiles", username],
    enabled: !!username,
  });

  const { data: blogPosts = [], isLoading: postsLoading } = useQuery<BlogPost[]>({
    queryKey: ["/api/profiles", username, "blog"],
    enabled: !!username,
  });

  const blogPost = blogPosts.find(post => post.slug === slug);
  const isLoading = profileLoading || postsLoading;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  useEffect(() => {
    if (blogPost && username) {
      posthog.capture('blog_post_viewed', {
        post_id: blogPost.id,
        post_title: blogPost.title,
        coach_username: username,
      });
    }
  }, [blogPost?.id]);

  const handleShare = () => {
    if (!blogPost || !username) return;
    const shareMessage = generateBlogPostShareMessage({
      title: blogPost.title,
      thumbnailDescription: blogPost.thumbnailDescription,
      excerpt: blogPost.excerpt,
      slug: blogPost.slug,
      username,
    });
    if (navigator.share) {
      posthog.capture('blog_post_shared', { method: 'native_share', post_id: blogPost.id, coach_username: username });
      navigator.share({
        title: blogPost.title,
        text: shareMessage,
        url: window.location.href,
      });
    } else {
      posthog.capture('blog_post_shared', { method: 'clipboard', post_id: blogPost.id, coach_username: username });
      navigator.clipboard.writeText(window.location.href);
      toast({ description: "Link copied to clipboard" });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!blogPost || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center py-8">
          <FileText className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">Blog post not found</h3>
          <p className="mt-2 text-sm text-gray-500">
            The blog post you're looking for doesn't exist or has been removed.
          </p>
          <Button className="mt-4" onClick={goBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Profile
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-3xl mx-auto pb-12">
        {/* Image Area with Overlay Buttons */}
        <div className="relative w-full bg-gray-200">
          {/* Back and Share Buttons - Top Corners */}
          <div className="absolute top-4 left-4 z-20">
            <Button variant="secondary" size="icon" className="rounded-full bg-white/90 hover:bg-white shadow-sm" onClick={goBack}>
              <ArrowLeft className="w-5 h-5 text-gray-700" />
            </Button>
          </div>
          <div className="absolute top-4 right-4 z-20">
            <Button variant="secondary" size="icon" onClick={handleShare} className="rounded-full bg-white/90 hover:bg-white shadow-sm">
              <Share2 className="w-5 h-5 text-gray-700" />
            </Button>
          </div>

          <div className="h-[350px] w-full overflow-hidden relative">
            {blogPost.imageUrl ? (
              <img
                src={blogPost.imageUrl}
                alt={blogPost.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gray-200 text-gray-400">
                <FileText className="w-16 h-16" />
              </div>
            )}
          </div>
        </div>

        {/* Content Card */}
        <div className="relative -mt-6 rounded-t-3xl bg-white px-6 py-8 shadow-sm">

          {/* Badge and Meta Info */}
          <div className="flex items-center justify-between mb-4">
            <Badge variant="secondary" className="bg-blue-100 text-blue-800">
              Blog Post
            </Badge>
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                <span>{format(new Date(blogPost.createdAt), "MMM dd, yyyy")}</span>
              </div>
              {blogPost.readTime && (
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  <span>{blogPost.readTime} min read</span>
                </div>
              )}
            </div>
          </div>

          {/* Title */}
          <h1 className="text-3xl font-bold text-gray-900 mb-3">
            {blogPost.title}
          </h1>

          {/* Thumbnail Description / Excerpt */}
          {blogPost.excerpt && (
            <p className="text-lg text-gray-600 mb-6 leading-snug">
              {blogPost.excerpt}
            </p>
          )}

          {/* Author Profile */}
          <Link href={`/${username}`}>
            <div className="flex items-center gap-4 mb-8 p-4 bg-gray-50 rounded-xl border border-gray-100 cursor-pointer hover:bg-gray-100 transition-colors">
              <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-white shadow-sm flex-shrink-0">
                <img
                  src={profile.profileImageUrl || defaultProfileImage}
                  alt={profile.displayName}
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Written by</p>
                <h3 className="font-bold text-gray-900">{profile.displayName}</h3>
                {profile.title && (
                  <p className="text-sm text-gray-600">{profile.title}</p>
                )}
              </div>
            </div>
          </Link>

          {/* Blog Content */}
          <div className="mb-8">
            <div className="prose prose-gray max-w-none text-gray-600">
              <p className="whitespace-pre-wrap leading-relaxed text-gray-800">
                {linkifyText(blogPost.content)}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-6 mt-8">
            <Link href={`/${username}`}>
              <Button 
                size="lg" 
                className="w-full bg-[#b66667] text-white hover:bg-[#b85858] h-14 text-lg font-bold rounded-2xl shadow-md"
              >
                View Profile
              </Button>
            </Link>

            <Link href={`/${username}#blog`}>
              <Button 
                variant="outline"
                size="lg" 
                className="w-full border-[#b66667] text-[#b66667] hover:bg-red-50 h-12 font-semibold rounded-2xl"
              >
                View All Blog Posts
              </Button>
            </Link>
          </div>

          {/* Footer */}
          <div className="mt-12 pt-8 border-t border-gray-100 text-center">
            <Link href="/">
              <img src={riplekLogo1} alt="Riplect" className="h-8 mx-auto mb-4 block" data-testid="img-footer-logo" />
            </Link>

            <p className="text-gray-500 mb-6 text-sm">
              Join thousands of creators who are building their business with Riplect.
            </p>

            <Link href="/auth">
              <Button
                className="bg-gray-900 text-white hover:bg-gray-800 rounded-full px-8 font-medium"
              >
                <UserCircle className="w-4 h-4 mr-2" />
                Join Riplect
              </Button>
            </Link>

            <div className="mt-8 flex justify-center gap-6 text-xs text-gray-400">
              <a href="#" className="hover:text-gray-600">Terms of Service</a>
              <a href="#" className="hover:text-gray-600">Privacy Policy</a>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
