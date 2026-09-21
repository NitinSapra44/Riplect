import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { posthog } from "@/lib/posthog";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { User, FileText, Save, Plus, Trash2, Star, Upload, X } from "lucide-react";
import { waitForSupabase } from "@/lib/supabase";
import { convertIfHeic } from "@/lib/heicConvert";

const bioFormSchema = z.object({
  shortBio: z.string().max(125, "Short bio must be 125 characters or less").optional(),
  shortBioImageUrl: z.string().optional(),
  shortBioYoutubeUrl: z.string().url().optional().or(z.literal("")),
  longBio: z.string().max(2000, "Long bio must be 2000 characters or less").optional(),
  longBioImageUrl: z.string().optional(),
  longBioYoutubeUrl: z.string().url().optional().or(z.literal("")),
  testimonials: z.array(z.object({
    clientName: z.string().min(1, "Client name is required"),
    content: z.string().min(1, "Testimonial content is required"),
    rating: z.number().min(1).max(5).optional(),
    clientTitle: z.string().optional(),
  })).optional(),
});

type BioFormData = z.infer<typeof bioFormSchema>;

export function BioManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [shortBioMediaType, setShortBioMediaType] = useState<"none" | "image" | "youtube">("none");
  const [longBioMediaType, setLongBioMediaType] = useState<"none" | "image" | "youtube">("none");
  const [shortBioImageFile, setShortBioImageFile] = useState<File | null>(null);
  const [longBioImageFile, setLongBioImageFile] = useState<File | null>(null);
  const [shortBioImagePreview, setShortBioImagePreview] = useState<string>("");
  const [longBioImagePreview, setLongBioImagePreview] = useState<string>("");
  const [isUploadingShortImage, setIsUploadingShortImage] = useState(false);
  const [isUploadingLongImage, setIsUploadingLongImage] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["/api/dashboard/profile"],
  }) as { data: any, isLoading: boolean };

  const form = useForm<BioFormData>({
    resolver: zodResolver(bioFormSchema),
    defaultValues: {
      shortBio: "",
      shortBioImageUrl: "",
      shortBioYoutubeUrl: "",
      longBio: "",
      longBioImageUrl: "",
      longBioYoutubeUrl: "",
      testimonials: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "testimonials"
  });

  // Image uploads are handled via the /api/upload/image endpoint which uses Supabase storage

  // Update form when profile data loads
  useEffect(() => {
    if (profile) {
      form.reset({
        shortBio: profile.shortBio || "",
        shortBioImageUrl: profile.shortBioImageUrl || "",
        shortBioYoutubeUrl: profile.shortBioYoutubeUrl || "",
        longBio: profile.longBio || "",
        longBioImageUrl: profile.longBioImageUrl || "",
        longBioYoutubeUrl: profile.longBioYoutubeUrl || "",
        testimonials: profile.testimonials || [],
      });

      // Set media types based on existing data
      if (profile.shortBioImageUrl) {
        setShortBioMediaType("image");
        setShortBioImagePreview(profile.shortBioImageUrl);
      } else if (profile.shortBioYoutubeUrl) {
        setShortBioMediaType("youtube");
      }

      if (profile.longBioImageUrl) {
        setLongBioMediaType("image");
        setLongBioImagePreview(profile.longBioImageUrl);
      } else if (profile.longBioYoutubeUrl) {
        setLongBioMediaType("youtube");
      }
    }
  }, [profile, form]);

  // Helper function to upload and set image
  const uploadAndSetImage = async (
    file: File,
    setIsUploading: (is: boolean) => void,
    setPreview: (url: string) => void,
    imageUrlField: "shortBioImageUrl" | "longBioImageUrl",
    youtubeUrlField: "shortBioYoutubeUrl" | "longBioYoutubeUrl"
  ) => {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file type", description: "Please select an image file.", variant: "destructive" });
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      toast({ title: "File too large", description: "Please upload an image smaller than 25MB.", variant: "destructive" });
      return;
    }

    setPreview(URL.createObjectURL(file));
    setIsUploading(true);

    try {
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
      formData.append('folder', 'bio-images');
      
      const uploadResponse = await fetch("/api/upload/image", {
        method: "POST",
        headers: authHeaders,
        body: formData,
      });
      
      if (!uploadResponse.ok) throw new Error("Failed to upload image");
      
      const { url } = await uploadResponse.json();

      // Set form values
      form.setValue(imageUrlField, url);
      form.setValue(youtubeUrlField, "");
      setPreview(url); // Update preview to the correct path

      toast({ title: "Image uploaded", description: "Image uploaded successfully." });
    } catch (error) {
      toast({ title: "Upload failed", description: "Failed to upload image. Please try again.", variant: "destructive" });
      setPreview(""); // Clear preview on error
    } finally {
      setIsUploading(false);
    }
  };

  // Handle short bio image upload
  const handleShortBioImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.files?.[0];
    if (raw) {
      const file = await convertIfHeic(raw);
      setShortBioImageFile(file);
      uploadAndSetImage(
        file,
        setIsUploadingShortImage,
        setShortBioImagePreview,
        "shortBioImageUrl",
        "shortBioYoutubeUrl"
      );
    }
  };

  // Handle long bio image upload
  const handleLongBioImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.files?.[0];
    if (raw) {
      const file = await convertIfHeic(raw);
      setLongBioImageFile(file);
      uploadAndSetImage(
        file,
        setIsUploadingLongImage,
        setLongBioImagePreview,
        "longBioImageUrl",
        "longBioYoutubeUrl"
      );
    }
  };

  const mutation = useMutation({
    mutationFn: async (data: BioFormData) => {
      await apiRequest("POST", "/api/dashboard/bio", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"] });
      posthog.capture('profile_bio_saved');
      posthog.setPersonProperties({ profile_has_bio: true });
      toast({
        title: "Bio updated",
        description: "Your bio and testimonials have been saved successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save bio information. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: BioFormData) => {
    // Ensure that if media type is not 'image', the image URL is cleared
    if (shortBioMediaType !== 'image') {
      data.shortBioImageUrl = "";
    }
    // Ensure that if media type is not 'youtube', the youtube URL is cleared
    if (shortBioMediaType !== 'youtube') {
      data.shortBioYoutubeUrl = "";
    }

    if (longBioMediaType !== 'image') {
      data.longBioImageUrl = "";
    }
    if (longBioMediaType !== 'youtube') {
      data.longBioYoutubeUrl = "";
    }

    mutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Bio & Testimonials</h2>
        <p className="text-gray-600">Manage your personal bio and client testimonials</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Short Bio Section */}
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center">
                <User className="w-5 h-5 mr-2" />
                Short Bio
              </CardTitle>
              <CardDescription>
                A brief introduction that appears at the top of your profile
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 overflow-hidden">
              <FormField
                control={form.control}
                name="shortBio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Short Bio Text</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Tell visitors about yourself in a few sentences..."
                        className="min-h-[120px] break-words whitespace-pre-wrap"
                        style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}
                        maxLength={125}
                        {...field}
                        data-testid="input-short-bio"
                      />
                    </FormControl>
                    <div className="text-xs text-gray-500">
                      {field.value?.length || 0}/125 characters
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Short Bio Media Type Selection */}
              <div className="space-y-4">
                <Label>Media (Optional)</Label>
                <RadioGroup 
                  value={shortBioMediaType} 
                  onValueChange={(value: "none" | "image" | "youtube") => {
                    setShortBioMediaType(value);
                    if (value === "image") {
                      form.setValue("shortBioYoutubeUrl", "");
                    } else if (value === "youtube") {
                      form.setValue("shortBioImageUrl", "");
                      setShortBioImagePreview("");
                      setShortBioImageFile(null);
                    } else {
                      form.setValue("shortBioImageUrl", "");
                      form.setValue("shortBioYoutubeUrl", "");
                      setShortBioImagePreview("");
                      setShortBioImageFile(null);
                    }
                  }}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="none" id="short-none" data-testid="radio-short-none" />
                    <Label htmlFor="short-none">No Media</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="image" id="short-image" data-testid="radio-short-image" />
                    <Label htmlFor="short-image">Upload Image</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="youtube" id="short-youtube" data-testid="radio-short-youtube" />
                    <Label htmlFor="short-youtube">YouTube Video</Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Short Bio Image Upload */}
              {shortBioMediaType === "image" && (
                <div className="space-y-4">
                  <div>
                    <Input 
                      type="file" 
                      accept="image/*,image/heic,image/heif,.heic,.heif" 
                      onChange={handleShortBioImageChange}
                      disabled={isUploadingShortImage}
                      data-testid="input-short-bio-image"
                    />
                    {isUploadingShortImage && (
                      <p className="text-sm text-gray-500 mt-2">Uploading...</p>
                    )}
                  </div>
                  {shortBioImagePreview && (
                    <div className="relative">
                      <img 
                        src={shortBioImagePreview} 
                        alt="Short bio preview" 
                        className="w-full h-auto rounded-lg border max-h-64 object-cover"
                        data-testid="img-short-bio-preview"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={() => {
                          setShortBioImagePreview("");
                          setShortBioImageFile(null);
                          form.setValue("shortBioImageUrl", "");
                          setShortBioMediaType("none");
                        }}
                        data-testid="button-remove-short-image"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Short Bio YouTube URL */}
              {shortBioMediaType === "youtube" && (
                <FormField
                  control={form.control}
                  name="shortBioYoutubeUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>YouTube Video URL</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="https://www.youtube.com/watch?v=..."
                          {...field}
                          data-testid="input-short-bio-youtube"
                        />
                      </FormControl>
                      <div className="text-xs text-gray-500">
                        Paste a YouTube video link to embed it in your short bio section
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </CardContent>
          </Card>

          {/* Long Bio Section */}
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="w-5 h-5 mr-2" />
                Long Bio
              </CardTitle>
              <CardDescription>
                A detailed bio that appears in the expandable section of your profile
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 overflow-hidden">
              <FormField
                control={form.control}
                name="longBio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Long Bio Text</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Share more details about your experience, qualifications, approach, and what makes you unique..."
                        className="min-h-[200px] break-words whitespace-pre-wrap"
                        style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}
                        {...field}
                        data-testid="input-long-bio"
                      />
                    </FormControl>
                    <div className="text-xs text-gray-500">
                      {field.value?.length || 0}/2000 characters
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Long Bio Media Type Selection */}
              <div className="space-y-4">
                <Label>Media (Optional)</Label>
                <RadioGroup 
                  value={longBioMediaType} 
                  onValueChange={(value: "none" | "image" | "youtube") => {
                    setLongBioMediaType(value);
                    if (value === "image") {
                      form.setValue("longBioYoutubeUrl", "");
                    } else if (value === "youtube") {
                      form.setValue("longBioImageUrl", "");
                      setLongBioImagePreview("");
                      setLongBioImageFile(null);
                    } else {
                      form.setValue("longBioImageUrl", "");
                      form.setValue("longBioYoutubeUrl", "");
                      setLongBioImagePreview("");
                      setLongBioImageFile(null);
                    }
                  }}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="none" id="long-none" data-testid="radio-long-none" />
                    <Label htmlFor="long-none">No Media</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="image" id="long-image" data-testid="radio-long-image" />
                    <Label htmlFor="long-image">Upload Image</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="youtube" id="long-youtube" data-testid="radio-long-youtube" />
                    <Label htmlFor="long-youtube">YouTube Video</Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Long Bio Image Upload */}
              {longBioMediaType === "image" && (
                <div className="space-y-4">
                  <div>
                    <Input 
                      type="file" 
                      accept="image/*,image/heic,image/heif,.heic,.heif" 
                      onChange={handleLongBioImageChange}
                      disabled={isUploadingLongImage}
                      data-testid="input-long-bio-image"
                    />
                    {isUploadingLongImage && (
                      <p className="text-sm text-gray-500 mt-2">Uploading...</p>
                    )}
                  </div>
                  {longBioImagePreview && (
                    <div className="relative">
                      <img 
                        src={longBioImagePreview} 
                        alt="Long bio preview" 
                        className="w-full h-auto rounded-lg border max-h-64 object-cover"
                        data-testid="img-long-bio-preview"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={() => {
                          setLongBioImagePreview("");
                          setLongBioImageFile(null);
                          form.setValue("longBioImageUrl", "");
                          setLongBioMediaType("none");
                        }}
                        data-testid="button-remove-long-image"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Long Bio YouTube URL */}
              {longBioMediaType === "youtube" && (
                <FormField
                  control={form.control}
                  name="longBioYoutubeUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>YouTube Video URL</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="https://www.youtube.com/watch?v=..."
                          {...field}
                          data-testid="input-long-bio-youtube"
                        />
                      </FormControl>
                      <div className="text-xs text-gray-500">
                        Paste a YouTube video link to embed it in your long bio section
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </CardContent>
          </Card>

          {/* Testimonials Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="w-5 h-5 mr-2" />
                Client Testimonials
              </CardTitle>
              <CardDescription>
                Add testimonials from your clients to build trust and credibility
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {fields.map((field, index) => (
                <div key={field.id} className="border rounded-lg p-4 bg-gray-50 space-y-4">
                  <div className="flex justify-between items-center">
                    <h4 className="font-medium text-gray-900">Testimonial {index + 1}</h4>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => remove(index)}
                      data-testid={`button-remove-testimonial-${index}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name={`testimonials.${index}.clientName`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Client Name</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="John Smith" 
                              {...field} 
                              data-testid={`input-testimonial-name-${index}`}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`testimonials.${index}.clientTitle`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Client Title (Optional)</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="CEO, Company Name" 
                              {...field} 
                              data-testid={`input-testimonial-title-${index}`}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name={`testimonials.${index}.content`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Testimonial Content</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Share what the client said about your services..."
                            className="min-h-[100px]"
                            {...field}
                            data-testid={`input-testimonial-content-${index}`}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`testimonials.${index}.rating`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Rating (Optional)</FormLabel>
                        <FormControl>
                          <div className="flex items-center space-x-2">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                type="button"
                                onClick={() => field.onChange(star)}
                                className={`p-1 ${
                                  field.value && star <= field.value
                                    ? "text-yellow-400"
                                    : "text-gray-300"
                                } hover:text-yellow-400`}
                                data-testid={`button-star-${index}-${star}`}
                              >
                                <Star className="w-5 h-5 fill-current" />
                              </button>
                            ))}
                            {field.value && (
                              <button
                                type="button"
                                onClick={() => field.onChange(undefined)}
                                className="text-sm text-gray-500 ml-2"
                                data-testid={`button-clear-rating-${index}`}
                              >
                                Clear
                              </button>
                            )}
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                onClick={() => append({ clientName: "", content: "", clientTitle: "", rating: undefined })}
                className="w-full"
                data-testid="button-add-testimonial"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Testimonial
              </Button>
            </CardContent>
          </Card>

          <Button 
            type="submit" 
            className="w-full" 
            disabled={mutation.isPending}
            data-testid="button-save-bio"
          >
            <Save className="w-4 h-4 mr-2" />
            {mutation.isPending ? "Saving..." : "Save Bio & Testimonials"}
          </Button>
        </form>
      </Form>
    </div>
  );
}