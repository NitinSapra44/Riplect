import { useState } from "react";
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { useDialogUnsavedChanges } from "@/hooks/use-dialog-unsaved-changes";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { posthog } from "@/lib/posthog";
import { BlogImageUpload } from "@/components/blog-image-upload";
import { TagManager, Tag } from "@/components/tag-manager";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import { 
  BookOpen, 
  Plus, 
  Edit2, 
  Trash2, 
  Eye, 
  Clock, 
  Calendar,
  Save,
  X,
  FileText,
  Image as ImageIcon,
  Star,
  Globe
} from "lucide-react";
import { format } from "date-fns";
import { z } from "zod";

// Blog post form schema
const blogPostSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  slug: z.string().optional(), // Auto-generated from title
  thumbnailDescription: z.string().max(140, "Thumbnail description must be 140 characters or less").optional(),
  content: z.string().min(10, "Content must be at least 10 characters"),
  imageUrl: z.string().optional(),
  readTime: z.number().optional(), // Auto-calculated from content length
  isPublished: z.boolean().default(false),
});

// Calculate reading time based on content length (average 200 words per minute)
const calculateReadTime = (content: string): number => {
  const wordsPerMinute = 200;
  const wordCount = content.trim().split(/\s+/).filter(word => word.length > 0).length;
  const readTime = Math.ceil(wordCount / wordsPerMinute);
  return Math.max(1, readTime); // Minimum 1 minute
};

type BlogPostFormData = z.infer<typeof blogPostSchema>;

interface BlogPost {
  id: number;
  profileId: number;
  title: string;
  slug: string;
  thumbnailDescription?: string;
  content: string;
  imageUrl?: string;
  readTime?: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

export function BlogManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<string>("all");
  const [blogTags, setBlogTags] = useState<Tag[]>([]);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: blogPosts = [], isLoading, error } = useQuery<BlogPost[]>({
    queryKey: ["/api/dashboard/blog"],
    retry: false,
  });

  const form = useForm<BlogPostFormData>({
    resolver: zodResolver(blogPostSchema),
    defaultValues: {
      title: "",
      thumbnailDescription: "",
      content: "",
      imageUrl: "",
      isPublished: false,
    },
  });

  // Dialog-level unsaved changes handling
  const { safeClose, ConfirmDialog } = useDialogUnsavedChanges();

  // Generate URL slug from first 50 characters of title
  const generateSlug = (title: string) => {
    const maxLength = 50;
    let slug = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
    
    // Truncate to max length, but cut at word boundary (hyphen)
    if (slug.length > maxLength) {
      slug = slug.substring(0, maxLength);
      const lastHyphen = slug.lastIndexOf('-');
      if (lastHyphen > 20) {
        slug = slug.substring(0, lastHyphen);
      }
    }
    
    return slug.replace(/-$/, ''); // Remove trailing hyphen
  };

  const createMutation = useMutation({
    mutationFn: async (data: BlogPostFormData) => {
      const submitData = {
        ...data,
        tagIds: blogTags.map(t => t.id),
      };
      return await apiRequest("POST", "/api/dashboard/blog", submitData);
    },
    onSuccess: () => {
      const existingPosts = queryClient.getQueryData<any[]>(["/api/dashboard/blog"]) ?? [];
      const is_first = existingPosts.length === 0;
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/blog"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"], exact: false });
      posthog.capture('blog_post_created', { is_first });
      if (is_first) {
        posthog.setPersonProperties({ first_blog_post_created_at: new Date().toISOString() });
      }
      toast({
        title: "Success",
        description: "Blog post created successfully",
      });
      setIsCreating(false);
      setEditingPost(null);
      setBlogTags([]);
      form.reset({
        title: "",
        thumbnailDescription: "",
        content: "",
        imageUrl: "",
        isPublished: false,
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error as Error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to create blog post",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: BlogPostFormData & { id: number }) => {
      const submitData = {
        ...data,
        tagIds: blogTags.map(t => t.id),
      };
      return await apiRequest("PATCH", `/api/dashboard/blog/${data.id}`, submitData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/blog"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"], exact: false });
      toast({
        title: "Success",
        description: "Blog post updated successfully",
      });
      setIsCreating(false);
      setEditingPost(null);
      setBlogTags([]);
      form.reset({
        title: "",
        thumbnailDescription: "",
        content: "",
        imageUrl: "",
        isPublished: false,
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error as Error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to update blog post",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/dashboard/blog/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/blog"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"], exact: false });
      toast({
        title: "Success",
        description: "Blog post deleted successfully",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error as Error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
      } else {
        toast({
          title: "Error",
          description: error.message || "Failed to delete blog post",
          variant: "destructive",
        });
      }
    },
  });

  // Feature blog post mutation
  const featureMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("POST", `/api/dashboard/blogs/${id}/feature`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/blog"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"], exact: false });
      toast({
        title: "Success",
        description: "Featured blog post updated successfully",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error as Error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: error.message || "Failed to update featured blog post",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: BlogPostFormData) => {
    // Auto-generate slug from title
    const slug = generateSlug(data.title);
    // Auto-calculate reading time from content
    const readTime = calculateReadTime(data.content);
    
    const submitData = { ...data, slug, readTime };
    
    if (editingPost) {
      updateMutation.mutate({ ...submitData, id: editingPost.id });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const handleEdit = async (post: BlogPost) => {
    setEditingPost(post);
    setIsCreating(true);
    form.reset({
      title: post.title,
      thumbnailDescription: post.thumbnailDescription || "",
      content: post.content,
      imageUrl: post.imageUrl || "",
      isPublished: post.isPublished,
    });
    
    // Load blog tags
    try {
      const response = await fetch(`/api/blog/${post.id}/tags`);
      if (response.ok) {
        const tags = await response.json();
        setBlogTags(tags);
      }
    } catch (error) {
      console.error("Error loading blog tags:", error);
      setBlogTags([]);
    }
  };

  const handleCreate = () => {
    posthog.capture('blog_post_create_form_opened');
    setBlogTags([]);
    setEditingPost(null);
    form.reset({
      title: "",
      thumbnailDescription: "",
      content: "",
      imageUrl: "",
      isPublished: false,
    });
    setIsCreating(true);
  };

  const doCloseDialog = () => {
    setIsCreating(false);
    setEditingPost(null);
    setBlogTags([]);
    form.reset({
      title: "",
      thumbnailDescription: "",
      content: "",
      imageUrl: "",
      isPublished: false,
    });
  };

  const handleCancel = () => {
    safeClose(form.formState.isDirty, doCloseDialog);
  };

  const filteredPosts = blogPosts.filter((post) => {
    if (selectedFilter === "published") return post.isPublished;
    if (selectedFilter === "draft") return !post.isPublished;
    return true;
  });

  // Handle authentication errors
  if (error && isUnauthorizedError(error as Error)) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <BookOpen className="mx-auto h-12 w-12 text-yellow-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">Authentication Required</h3>
            <p className="mt-2 text-sm text-gray-500">
              You need to be logged in to manage your blog posts.
            </p>
            <Button
              className="mt-4"
              onClick={() => window.location.href = '/api/login'}
            >
              Login
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header and Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Blog Posts</h2>
          <p className="text-gray-600">Create and manage your blog content</p>
        </div>
        <Button onClick={handleCreate} data-testid="button-new-post">
          <Plus className="w-4 h-4 mr-2" />
          New Post
        </Button>
      </div>

      {/* Blog Post Creation/Editing Form Modal */}
      <Dialog open={isCreating} onOpenChange={(open) => !open && handleCancel()}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[85vh] p-0 flex flex-col gap-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
            <DialogTitle className="flex items-center">
              <FileText className="w-5 h-5 mr-2" />
              {editingPost ? "Edit Blog Post" : "Create New Blog Post"}
            </DialogTitle>
            <DialogDescription>
              {editingPost ? "Update your blog post" : "Write and publish a new blog post"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
          <div className="px-6 pb-4 pt-4">
            <Form {...form}>
              <form id="blog-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter blog post title" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="thumbnailDescription"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Thumbnail Description (Optional)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Short description shown on blog cards..."
                          rows={2}
                          maxLength={140}
                          {...field} 
                          data-testid="input-thumbnail-description"
                        />
                      </FormControl>
                      <div className="text-xs text-muted-foreground">
                        {field.value?.length || 0}/140 characters
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="content"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Content</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Write your blog post content here..."
                          rows={12}
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Featured Image Upload */}
                <BlogImageUpload
                  currentImage={form.watch("imageUrl")}
                  onImageUpload={(url) => form.setValue("imageUrl", url)}
                  onRemoveImage={() => form.setValue("imageUrl", "")}
                />

                {/* Tags Section */}
                <div className="space-y-2">
                  <Label>Tags</Label>
                  <TagManager
                    entityType="blog"
                    entityId={editingPost?.id}
                    selectedTags={blogTags}
                    onTagsChange={setBlogTags}
                    maxTags={10}
                    allowCreate={true}
                    showSuggestions={true}
                  />
                  <p className="text-sm text-muted-foreground">
                    Add tags to help users find your blog post when searching
                  </p>
                </div>

              </form>
            </Form>
          </div>
          </div>

          {/* Action footer */}
          <div className="border-t bg-white px-6 py-3 flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
            <div className="flex items-center gap-2 shrink-0">
              <Switch
                id="publish-toggle"
                checked={form.watch("isPublished")}
                onCheckedChange={(val) => form.setValue("isPublished", val)}
                data-testid="switch-publish"
              />
              <label htmlFor="publish-toggle" className="text-sm font-medium cursor-pointer select-none">
                Publish
              </label>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button type="button" variant="outline" size="sm" onClick={handleCancel}>
                Cancel
              </Button>
              <Button
                type="submit"
                form="blog-form"
                size="sm"
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-submit-post"
              >
                {form.watch("isPublished") ? (
                  <>
                    <Globe className="w-4 h-4 mr-2" />
                    Publish Post
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save as Draft
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Filters and Stats */}
      {!isCreating && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Select value={selectedFilter} onValueChange={setSelectedFilter}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Posts</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="draft">Drafts</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <span>{blogPosts.filter((p) => p.isPublished).length} published</span>
            <span>{blogPosts.filter((p) => !p.isPublished).length} drafts</span>
          </div>
        </div>
      )}

      {/* Blog Posts List */}
      {!isCreating && (
        <Card>
          <CardContent className="pt-6">
            {filteredPosts.length === 0 ? (
              <div className="text-center py-12">
                <BookOpen className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-4 text-lg font-medium text-gray-900">
                  {selectedFilter === "all" ? "No blog posts yet" : `No ${selectedFilter} posts`}
                </h3>
                <p className="mt-2 text-sm text-gray-500">
                  {selectedFilter === "all" 
                    ? "Get started by creating your first blog post." 
                    : `You don't have any ${selectedFilter} posts yet.`}
                </p>
                <Button className="mt-4" onClick={() => setIsCreating(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Your First Post
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredPosts.map((post) => (
                  <div
                    key={post.id}
                    className="border rounded-lg p-4"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-medium text-gray-900">{post.title}</h4>
                          {(post as any).isFeatured && (
                            <Badge className="bg-primary text-white" data-testid={`badge-featured-${post.id}`}>
                              Featured
                            </Badge>
                          )}
                          <Badge variant={post.isPublished ? "default" : "secondary"}>
                            {post.isPublished ? "Published" : "Draft"}
                          </Badge>
                        </div>
                        
                        <div className="flex items-center gap-4 text-xs text-gray-500 mt-2 flex-wrap">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Created {format(new Date(post.createdAt), "MMM dd, yyyy")}
                          </div>
                          {post.readTime && (
                            <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {post.readTime} min read
                            </div>
                          )}
                          {post.imageUrl && (
                            <div className="flex items-center gap-1">
                              <ImageIcon className="w-3 h-3" />
                              Has image
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                        {!post.isPublished && (
                          <Button
                            size="sm"
                            onClick={() => {
                              updateMutation.mutate({
                                id: post.id,
                                title: post.title,
                                slug: post.slug,
                                content: post.content,
                                imageUrl: post.imageUrl || "",
                                readTime: post.readTime || 5,
                                isPublished: true
                              });
                              // Invalidate profile cache immediately for instant UI update
                              queryClient.invalidateQueries({ queryKey: ["/api/profiles"] });
                            }}
                            disabled={updateMutation.isPending}
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            Publish
                          </Button>
                        )}
                        {!(post as any).isFeatured && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => featureMutation.mutate(post.id)}
                            disabled={featureMutation.isPending}
                            data-testid={`button-feature-${post.id}`}
                          >
                            <Star className="w-4 h-4 mr-1" />
                            Set as Featured
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(post)}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteId(post.id)}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
      <ConfirmDialog />

      <DeleteConfirmationDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
        onConfirm={() => {
          const id = deleteId;
          setDeleteId(null);
          if (id) deleteMutation.mutate(id);
        }}
        title="Are you sure you want to delete?"
        description="This blog post will be permanently deleted. This action cannot be undone."
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}