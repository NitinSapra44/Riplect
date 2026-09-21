import { useEffect, useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import { posthog } from "@/lib/posthog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ProfilePictureUpload } from "@/components/profile-picture-upload";
import { ImageUpload } from "@/components/image-upload";
import { User, Plus, Trash2 } from "lucide-react";

const optionalUrl = z.union([z.string().url(), z.literal("")]).optional();

const profileFormSchema = z.object({
  displayName: z.string().min(2, "Display name must be at least 2 characters").max(100),
  title: z.string().optional().or(z.literal("")),
  profileImageUrl: z.string().optional().or(z.literal("")),
  shortBio: z.string().max(125, "Short bio must be 125 characters or less").optional().or(z.literal("")),
  shortBioImageUrl: z.string().optional().or(z.literal("")),
  shortBioYoutubeUrl: optionalUrl,
  longBio: z.string().max(2000, "Long bio must be 2000 characters or less").optional().or(z.literal("")),
  longBioImageUrl: z.string().optional().or(z.literal("")),
  longBioYoutubeUrl: optionalUrl,
  socialMediaLinks: z.array(z.object({
    platform: z.enum(['facebook', 'twitter', 'instagram', 'linkedin', 'youtube', 'tiktok', 'snapchat', 'pinterest']),
    url: z.string().url("Valid URL is required"),
  })).optional(),
});

type ProfileFormData = z.infer<typeof profileFormSchema>;

interface ProfileFormProps {
  profile: any;
}

export function ProfileForm({ profile }: ProfileFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [shortBioMediaType, setShortBioMediaType] = useState<"none" | "image" | "youtube">("none");
  const [longBioMediaType, setLongBioMediaType] = useState<"none" | "image" | "youtube">("none");
  const [hasShownReactivationMessage, setHasShownReactivationMessage] = useState(false);

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      displayName: "",
      title: "",
      profileImageUrl: "",
      shortBio: "",
      shortBioImageUrl: "",
      shortBioYoutubeUrl: "",
      longBio: "",
      longBioImageUrl: "",
      longBioYoutubeUrl: "",
      socialMediaLinks: [],
    },
  });

  const { fields: socialFields, append: appendSocial, remove: removeSocial } = useFieldArray({
    control: form.control,
    name: "socialMediaLinks",
  });

  useEffect(() => {
    if (profile) {
      if (profile.wasReactivated && !hasShownReactivationMessage) {
        setHasShownReactivationMessage(true);
        toast({
          title: "Welcome Back!",
          description: "Your account has been reactivated. All your data and profile have been restored.",
        });
      }

      form.reset({
        displayName: profile?.displayName || "",
        title: profile?.title || "",
        profileImageUrl: profile?.profileImageUrl || "",
        shortBio: profile?.shortBio || "",
        shortBioImageUrl: profile?.shortBioImageUrl || "",
        shortBioYoutubeUrl: profile?.shortBioYoutubeUrl || "",
        longBio: profile?.longBio || "",
        longBioImageUrl: profile?.longBioImageUrl || "",
        longBioYoutubeUrl: profile?.longBioYoutubeUrl || "",
        socialMediaLinks: profile?.contactInfo?.socialMediaLinks || [],
      });

      if (profile.shortBioImageUrl) {
        setShortBioMediaType("image");
      } else if (profile.shortBioYoutubeUrl) {
        setShortBioMediaType("youtube");
      }

      if (profile.longBioImageUrl) {
        setLongBioMediaType("image");
      } else if (profile.longBioYoutubeUrl) {
        setLongBioMediaType("youtube");
      }
    }
  }, [profile, form, toast, hasShownReactivationMessage]);

  const saveProfileCallback = useCallback(async () => {
    const data = form.getValues();
    const currentContactInfo = profile?.contactInfo || {};
    const updatedContactInfo = { ...currentContactInfo, socialMediaLinks: data.socialMediaLinks };
    const payload = { ...data, contactInfo: updatedContactInfo };
    await apiRequest("POST", "/api/dashboard/profile", payload);
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard/profile"] });
    queryClient.invalidateQueries({ queryKey: ["/api/profiles"], exact: false });
  }, [form, profile?.contactInfo, queryClient]);

  useUnsavedChanges("dashboard-profile", form.formState.isDirty, saveProfileCallback);

  const mutation = useMutation({
    mutationFn: async (data: ProfileFormData) => {
      const currentContactInfo = profile?.contactInfo || {};
      const updatedContactInfo = { ...currentContactInfo, socialMediaLinks: data.socialMediaLinks };
      const payload = { ...data, contactInfo: updatedContactInfo };
      await apiRequest("POST", "/api/dashboard/profile", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"], exact: false });
      posthog.capture('profile_updated');
      toast({ title: "Profile Updated", description: "Your profile has been saved successfully." });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: "Unauthorized", description: "You are logged out. Logging in again...", variant: "destructive" });
        setTimeout(() => { window.location.href = "/api/login"; }, 500);
        return;
      }
      toast({ title: "Error", description: "Failed to save profile. Please try again.", variant: "destructive" });
    },
  });

  const onSubmit = (data: ProfileFormData) => {
    console.log("Form submitted with data:", data);
    mutation.mutate(data);
  };

  const onFormError = (errors: any) => {
    console.error("Form validation errors:", errors);
    toast({ title: "Validation Error", description: "Please check the form for errors.", variant: "destructive" });
  };

  return (
    <div className="grid lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-6">
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center">
              <User className="w-5 h-5 mr-2" />
              Profile Page
            </CardTitle>
            <CardDescription>Customize your public profile appearance and bio</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit, onFormError)} className="space-y-6">
                {/* Profile Picture */}
                <div className="pb-4 border-b border-gray-200">
                  <ProfilePictureUpload
                    currentImageUrl={form.watch("profileImageUrl") || ""}
                    onImageUploaded={(url) => { form.setValue("profileImageUrl", url); }}
                  />
                </div>

                {/* Basic Info */}
                <FormField
                  control={form.control}
                  name="displayName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Your Name" {...field} data-testid="input-display-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Professional Title</FormLabel>
                      <FormControl>
                        <Input placeholder="Wellness Coach & Mindfulness Mentor" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Social Media Links */}
                <div className="space-y-4 border-t border-gray-100 pt-4">
                  <Label className="text-base font-semibold">Social Media</Label>
                  <p className="text-sm text-gray-500">Add links to your social media profiles.</p>

                  {socialFields.length > 0 && (
                    <div className="grid grid-cols-[180px_1fr_40px] gap-4 px-1">
                      <Label className="text-xs font-medium text-gray-500 uppercase">Platform</Label>
                      <Label className="text-xs font-medium text-gray-500 uppercase">Profile URL</Label>
                      <span></span>
                    </div>
                  )}

                  <div className="space-y-2">
                    {socialFields.map((field, index) => (
                      <div key={field.id} className="grid grid-cols-[105px_1fr_40px] gap-4 items-start">
                        <FormField
                          control={form.control}
                          name={`socialMediaLinks.${index}.platform`}
                          render={({ field }) => (
                            <FormItem className="space-y-0">
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Platform" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="facebook">Facebook</SelectItem>
                                  <SelectItem value="twitter">Twitter</SelectItem>
                                  <SelectItem value="instagram">Instagram</SelectItem>
                                  <SelectItem value="linkedin">LinkedIn</SelectItem>
                                  <SelectItem value="youtube">YouTube</SelectItem>
                                  <SelectItem value="tiktok">TikTok</SelectItem>
                                  <SelectItem value="snapchat">Snapchat</SelectItem>
                                  <SelectItem value="pinterest">Pinterest</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`socialMediaLinks.${index}.url`}
                          render={({ field }) => (
                            <FormItem className="space-y-0">
                              <FormControl>
                                <Input placeholder="https://..." {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => removeSocial(index)}
                          className="text-gray-500 hover:text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => appendSocial({ platform: "instagram" as const, url: "" })}
                    className="w-full"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Social Media Link
                  </Button>
                </div>

                {/* Bio Section */}
                <div className="space-y-6 border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">Bio & Story</Label>
                  </div>

                  {/* Short Bio */}
                  <FormField
                    control={form.control}
                    name="shortBio"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Short Bio</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Brief introduction (max 125 chars)..."
                            className="min-h-[80px]"
                            maxLength={125}
                            {...field}
                          />
                        </FormControl>
                        <div className="text-xs text-gray-500 text-right">{field.value?.length || 0}/125</div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Short Bio Media */}
                  <div className="space-y-3 bg-gray-50 p-4 rounded-lg">
                    <Label className="text-sm text-gray-600 font-medium">Short Bio Media (Optional)</Label>
                    <RadioGroup
                      value={shortBioMediaType}
                      onValueChange={(value: "none" | "image" | "youtube") => {
                        setShortBioMediaType(value);
                        if (value === "image") form.setValue("shortBioYoutubeUrl", "");
                        else if (value === "youtube") form.setValue("shortBioImageUrl", "");
                        else { form.setValue("shortBioImageUrl", ""); form.setValue("shortBioYoutubeUrl", ""); }
                      }}
                      className="flex flex-row gap-4"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="none" id="short-none" />
                        <Label htmlFor="short-none" className="font-normal cursor-pointer">None</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="image" id="short-image" />
                        <Label htmlFor="short-image" className="font-normal cursor-pointer">Image</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="youtube" id="short-youtube" />
                        <Label htmlFor="short-youtube" className="font-normal cursor-pointer">YouTube</Label>
                      </div>
                    </RadioGroup>

                    {shortBioMediaType === "image" && (
                      <div className="mt-3">
                        <ImageUpload
                          value={form.watch("shortBioImageUrl") || ""}
                          onChange={(url) => form.setValue("shortBioImageUrl", url)}
                        />
                      </div>
                    )}

                    {shortBioMediaType === "youtube" && (
                      <FormField
                        control={form.control}
                        name="shortBioYoutubeUrl"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input placeholder="https://www.youtube.com/watch?v=..." {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </div>

                  {/* Long Bio */}
                  <FormField
                    control={form.control}
                    name="longBio"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Long Bio</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Tell your full story..."
                            className="min-h-[150px]"
                            maxLength={2000}
                            {...field}
                          />
                        </FormControl>
                        <div className="text-xs text-gray-500 text-right">{field.value?.length || 0}/2000</div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Long Bio Media */}
                  <div className="space-y-3 bg-gray-50 p-4 rounded-lg">
                    <Label className="text-sm text-gray-600 font-medium">Long Bio Media (Optional)</Label>
                    <RadioGroup
                      value={longBioMediaType}
                      onValueChange={(value: "none" | "image" | "youtube") => {
                        setLongBioMediaType(value);
                        if (value === "image") form.setValue("longBioYoutubeUrl", "");
                        else if (value === "youtube") form.setValue("longBioImageUrl", "");
                        else { form.setValue("longBioImageUrl", ""); form.setValue("longBioYoutubeUrl", ""); }
                      }}
                      className="flex flex-row gap-4"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="none" id="long-none" />
                        <Label htmlFor="long-none" className="font-normal cursor-pointer">None</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="image" id="long-image" />
                        <Label htmlFor="long-image" className="font-normal cursor-pointer">Image</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="youtube" id="long-youtube" />
                        <Label htmlFor="long-youtube" className="font-normal cursor-pointer">YouTube</Label>
                      </div>
                    </RadioGroup>

                    {longBioMediaType === "image" && (
                      <div className="mt-3">
                        <ImageUpload
                          value={form.watch("longBioImageUrl") || ""}
                          onChange={(url) => form.setValue("longBioImageUrl", url)}
                        />
                      </div>
                    )}

                    {longBioMediaType === "youtube" && (
                      <FormField
                        control={form.control}
                        name="longBioYoutubeUrl"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input placeholder="https://www.youtube.com/watch?v=..." {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </div>
                </div>

                <Button type="submit" disabled={mutation.isPending} className="w-full">
                  {mutation.isPending ? "Saving..." : "Save Profile Page"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>

      {/* Right Sidebar */}
      <div className="space-y-6">
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle>Profile Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Profile Complete</span>
                <span className="text-sm font-semibold">
                  {profile?.username ? "Complete" : "Incomplete"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Public URL</span>
                <span className="text-sm font-semibold">
                  {profile?.username ? "Active" : "Not Set"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
