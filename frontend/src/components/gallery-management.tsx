import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { Upload, X, Image as ImageIcon } from "lucide-react";
import { isUnauthorizedError } from "@/lib/authUtils";
import { waitForSupabase } from "@/lib/supabase";
import { posthog } from "@/lib/posthog";
import { convertIfHeic } from "@/lib/heicConvert";

const imageFormSchema = z.object({
  alt: z.string().min(1, "Alt text is required").max(100),
});

type ImageFormData = z.infer<typeof imageFormSchema>;

interface GalleryImage {
  url: string;
  alt: string;
}

interface ProfileData {
  galleryImages?: GalleryImage[];
  [key: string]: unknown;
}

export function GalleryManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploadingImage, setUploadingImage] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const form = useForm<ImageFormData>({
    resolver: zodResolver(imageFormSchema),
    defaultValues: {
      alt: "",
    },
  });

  // Create save callback for the unsaved changes guard
  const saveGalleryCallback = useCallback(async () => {
    if (selectedFile && previewUrl) {
      const alt = form.getValues().alt;
      const supabase = await waitForSupabase();
      let authHeaders: Record<string, string> = {};
      if (supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          authHeaders = { Authorization: `Bearer ${session.access_token}` };
        }
      }
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('folder', 'gallery');
      const uploadResponse = await fetch("/api/upload/image", {
        method: "POST",
        headers: authHeaders,
        body: formData,
      });
      if (!uploadResponse.ok) throw new Error("Upload failed");
      const { url: imageUrl } = await uploadResponse.json();
      const currentProfile = queryClient.getQueryData<ProfileData>(["/api/dashboard/profile"]);
      const galleryImages = [...(currentProfile?.galleryImages || []), { url: imageUrl, alt }];
      await apiRequest("POST", "/api/dashboard/profile", { ...currentProfile, galleryImages });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"], exact: false });
    }
  }, [selectedFile, previewUrl, form, queryClient]);

  // Register form with global unsaved changes guard (when file selected or form dirty)
  useUnsavedChanges("gallery-form", !!selectedFile || form.formState.isDirty, saveGalleryCallback);

  const { data: profile, isLoading } = useQuery<ProfileData>({
    queryKey: ["/api/dashboard/profile"],
  });

  const updateGalleryMutation = useMutation({
    mutationFn: async (galleryImages: GalleryImage[]) => {
      // Get current profile data first
      const currentProfile = profile;
      await apiRequest("POST", "/api/dashboard/profile", {
        ...currentProfile,
        galleryImages,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"], exact: false });
      toast({
        title: "Success",
        description: "Gallery updated successfully!",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
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
        description: "Failed to update gallery. Please try again.",
        variant: "destructive",
      });
    },
  });

  const uploadImageMutation = useMutation({
    mutationFn: async (file: File) => {
      // Get auth token
      const supabase = await waitForSupabase();
      let authHeaders: Record<string, string> = {};
      if (supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          authHeaders = { Authorization: `Bearer ${session.access_token}` };
        }
      }

      // Upload file to Supabase storage via backend
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'gallery');
      
      const uploadResponse = await fetch("/api/upload/image", {
        method: "POST",
        headers: authHeaders,
        body: formData,
      });
      
      if (!uploadResponse.ok) throw new Error("Failed to upload image");
      
      const { url } = await uploadResponse.json();
      return { url };
    },
    onSuccess: (data) => {
      setUploadingImage(false);
      const newImage = {
        url: data.url,
        alt: form.getValues("alt"),
      };
      const currentImages = profile?.galleryImages || [];
      const is_first = currentImages.length === 0;
      posthog.capture('gallery_upload_completed', { is_first, total_after: currentImages.length + 1 });
      updateGalleryMutation.mutate([...currentImages, newImage]);
      
      // Reset form
      form.reset();
      setSelectedFile(null);
      setPreviewUrl(null);
    },
    onError: (error) => {
      setUploadingImage(false);
      console.error("Upload error:", error);
      toast({
        title: "Error",
        description: "Failed to upload image. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.files?.[0];
    if (raw) {
      const file = await convertIfHeic(raw);

      if (file.size > 25 * 1024 * 1024) {
        toast({
          title: "Error",
          description: "Image must be less than 25MB",
          variant: "destructive",
        });
        return;
      }

      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        toast({
          title: "Error",
          description: "Only JPG, PNG, and WebP images are allowed",
          variant: "destructive",
        });
        return;
      }

      setSelectedFile(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviewUrl(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpload = async (data: ImageFormData) => {
    if (!selectedFile) {
      toast({
        title: "Error",
        description: "Please select an image first",
        variant: "destructive",
      });
      return;
    }

    setUploadingImage(true);
    uploadImageMutation.mutate(selectedFile);
  };

  const handleRemoveImage = (index: number) => {
    const currentImages = profile?.galleryImages || [];
    const updatedImages = currentImages.filter((_, i) => i !== index);
    updateGalleryMutation.mutate(updatedImages);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const galleryImages = profile?.galleryImages || [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5" />
            Add New Image
          </CardTitle>
          <CardDescription>
            Upload images to your gallery. Supported formats: JPG, PNG, WebP, HEIC (max 25MB)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleUpload)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="image-upload">Select Image</Label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                  {previewUrl ? (
                    <div className="space-y-4">
                      <img
                        src={previewUrl}
                        alt="Preview"
                        className="w-32 h-32 object-cover rounded-lg mx-auto"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedFile(null);
                          setPreviewUrl(null);
                        }}
                      >
                        Change Image
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Upload className="w-8 h-8 text-gray-400 mx-auto" />
                      <p className="text-sm text-gray-600">
                        Drop an image here or click to browse
                      </p>
                      <Input
                        id="image-upload"
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                      <Label
                        htmlFor="image-upload"
                        className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 cursor-pointer"
                      >
                        Choose File
                      </Label>
                    </div>
                  )}
                </div>
              </div>

              <FormField
                control={form.control}
                name="alt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Alt Text</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Describe the image (for accessibility)"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                disabled={uploadingImage || !selectedFile || updateGalleryMutation.isPending}
                className="w-full"
              >
                {uploadingImage ? "Uploading..." : "Add to Gallery"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Gallery Images ({galleryImages.length})</CardTitle>
          <CardDescription>
            Manage your gallery images. These will be displayed in the gallery section of your profile.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {galleryImages.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <ImageIcon className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>No images in your gallery yet.</p>
              <p className="text-sm">Upload your first image above!</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {galleryImages.map((image, index) => (
                <div key={index} className="relative group">
                  <img
                    src={image.url}
                    alt={image.alt}
                    className="w-full h-32 object-cover rounded-lg border border-gray-200"
                  />
                  <div className="absolute inset-0 bg-black bg-opacity-50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleRemoveImage(index)}
                      disabled={updateGalleryMutation.isPending}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-gray-600 mt-1 truncate" title={image.alt}>
                    {image.alt}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}