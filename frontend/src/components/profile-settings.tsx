import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { waitForSupabase, signOutCompletely } from "@/lib/supabase";
import { posthog } from "@/lib/posthog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Settings, User, Mail, Lock, Tag, MapPin, X, ChevronRight, AlertTriangle, Eye, Calendar, FileText, ShoppingBag, Package, Loader2 } from "lucide-react";
import { TagManager, type Tag as TagType } from "@/components/tag-manager";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { CitySearchBar, type CityData } from "@/components/city-search-bar";

interface ConsolidatedTags {
  profile: TagType[];
  sessions: TagType[];
  events: TagType[];
  blogs: TagType[];
  digitalProducts: TagType[];
  physicalProducts: TagType[];
  all: TagType[];
}

const settingsFormSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").max(50),
  searchableLocation: z.string().optional(),
});

type SettingsFormData = z.infer<typeof settingsFormSchema>;

const emailChangeSchema = z.object({
  newEmail: z.string().email("Please enter a valid email address"),
});

type EmailChangeData = z.infer<typeof emailChangeSchema>;

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type PasswordChangeData = z.infer<typeof passwordChangeSchema>;

export function ProfileSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [profileTags, setProfileTags] = useState<TagType[]>([]);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [hasAutoPopulatedLocation, setHasAutoPopulatedLocation] = useState(false);
  const [showConsolidatedTagsDialog, setShowConsolidatedTagsDialog] = useState(false);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["/api/dashboard/profile"],
  }) as { data: any; isLoading: boolean };

  const { data: user } = useQuery({
    queryKey: ["/api/auth/user"],
  }) as { data: any };

  // Only fetch geolocation when profile has no location set
  const shouldFetchGeolocation = profile !== undefined && !profile?.searchableLocation;
  
  const { data: geoData } = useQuery({
    queryKey: ["/api/geolocation"],
    enabled: shouldFetchGeolocation,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: true,
    retry: 1,
  }) as { data: { location: string | null } | undefined };

  // Fetch consolidated tags only when dialog is open
  const { data: consolidatedTags, isLoading: consolidatedTagsLoading, refetch: refetchConsolidatedTags } = useQuery<ConsolidatedTags>({
    queryKey: ["/api/dashboard/profile/consolidated-tags"],
    enabled: showConsolidatedTagsDialog,
  });



  // Mutation to sync consolidated tags to profile tags
  const syncTagsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/dashboard/profile/sync-consolidated-tags");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/profile/tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/profile/consolidated-tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"], exact: false });
      if (data.profileTags) {
        setProfileTags(data.profileTags);
      }
      toast({
        title: "Tags Synced",
        description: `${data.totalSynced} tags have been synced as your profile search tags.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to sync tags. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Mutation to update profile tags directly (for TagManager)
  const updateProfileTagsMutation = useMutation({
    mutationFn: async (tagIds: number[]) => {
      const response = await apiRequest("POST", "/api/dashboard/profile/tags", { tagIds });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/profile/tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/profile/consolidated-tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"], exact: false });
      setProfileTags(data);
      if (data?.length > 0) {
        posthog.capture('profile_tags_saved', { tag_count: data.length });
        posthog.setPersonProperties({ profile_has_tags: true });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update profile tags.",
        variant: "destructive",
      });
    },
  });

  // Handle profile tag changes from TagManager
  const handleProfileTagsChange = (newTags: TagType[]) => {
    setProfileTags(newTags);
    updateProfileTagsMutation.mutate(newTags.map(t => t.id));
  };

  const form = useForm<SettingsFormData>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: {
      username: "",
      searchableLocation: "",
    },
  });

  const emailForm = useForm<EmailChangeData>({
    resolver: zodResolver(emailChangeSchema),
    defaultValues: {
      newEmail: "",
    },
  });

  const passwordForm = useForm<PasswordChangeData>({
    resolver: zodResolver(passwordChangeSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    if (profile) {
      form.reset({
        username: profile?.username || "",
        searchableLocation: profile?.searchableLocation || "",
      });
      
      // Load profile tags from the centralized tag system
      if (profile.id) {
        fetch(`/api/profiles/${profile.id}/tags`)
          .then(res => res.ok ? res.json() : [])
          .then(tags => setProfileTags(tags))
          .catch(() => setProfileTags([]));
      }
    }
  }, [profile, form]);

  // Auto-populate location from geolocation if the field is empty
  useEffect(() => {
    if (
      geoData?.location &&
      !hasAutoPopulatedLocation &&
      profile !== undefined &&
      !profile?.searchableLocation
    ) {
      form.setValue("searchableLocation", geoData.location);
      setHasAutoPopulatedLocation(true);
    }
  }, [geoData, profile, form, hasAutoPopulatedLocation]);

  const settingsMutation = useMutation({
    mutationFn: async (data: SettingsFormData & { tagIds: number[] }) => {
      await apiRequest("POST", "/api/dashboard/profile-settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"], exact: false });
      toast({
        title: "Settings Updated",
        description: "Your profile settings have been saved successfully.",
      });
    },
    onError: (error: any) => {
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
        description: error.message || "Failed to save settings. Please try again.",
        variant: "destructive",
      });
    },
  });

  const emailChangeMutation = useMutation({
    mutationFn: async (data: EmailChangeData) => {
      const supabase = await waitForSupabase();
      if (!supabase) {
        throw new Error("Authentication not configured");
      }
      
      // Get the current origin for redirect URL
      const redirectUrl = `${window.location.origin}/auth/callback`;
      
      const { error } = await supabase.auth.updateUser(
        { email: data.newEmail },
        { emailRedirectTo: redirectUrl }
      );
      
      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      setShowEmailForm(false);
      emailForm.reset();
      toast({
        title: "Verification Email Sent",
        description: "Please check both your current and new email inbox to confirm the change.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to request email change. Please try again.",
        variant: "destructive",
      });
    },
  });

  const passwordChangeMutation = useMutation({
    mutationFn: async (data: PasswordChangeData) => {
      const supabase = await waitForSupabase();
      if (!supabase) {
        throw new Error("Authentication not configured");
      }
      
      // First verify the current password by attempting to sign in
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser?.email) {
        throw new Error("No user session found");
      }
      
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: currentUser.email,
        password: data.currentPassword,
      });
      
      if (signInError) {
        throw new Error("Current password is incorrect");
      }
      
      // Now update to the new password
      const { error: updateError } = await supabase.auth.updateUser({
        password: data.newPassword,
      });
      
      if (updateError) {
        throw updateError;
      }
    },
    onSuccess: () => {
      setShowPasswordForm(false);
      passwordForm.reset();
      toast({
        title: "Password Changed",
        description: "Your password has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to change password. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/dashboard/delete-account");
    },
    onSuccess: async () => {
      toast({
        title: "Account Deleted",
        description: "Your account has been permanently deleted.",
      });
      // Sign out (local scope + storage purge so a stale token cannot
      // be restored after the hard navigation below).
      await signOutCompletely();
      queryClient.clear();
      setTimeout(() => {
        window.location.replace("/");
      }, 1000);
    },
    onError: (error: unknown) => {
      // Surface the server's actual error message so the user knows
      // their account was NOT deleted.
      console.error("Delete account error:", error);
      let serverMessage = "Failed to delete account. Please try again.";
      if (error instanceof ApiError) {
        serverMessage = error.data.message || error.message || serverMessage;
      } else if (error instanceof Error) {
        serverMessage = error.message;
      }
      toast({
        title: "Account not deleted",
        description: serverMessage,
        variant: "destructive",
        duration: 8000,
      });
    },
  });

  const deactivateAccountMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/dashboard/deactivate-account");
    },
    onSuccess: async () => {
      toast({
        title: "Account Deactivated",
        description: "Your account has been deactivated. It will be deleted after 180 days if not reactivated.",
      });
      // Sign out (local scope + storage purge so a stale token cannot
      // be restored after the hard navigation below).
      await signOutCompletely();
      queryClient.clear();
      setTimeout(() => {
        window.location.replace("/");
      }, 1000);
    },
    onError: (error) => {
      console.error("Deactivate account error:", error);
      toast({
        title: "Error",
        description: "Failed to deactivate account. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleDeactivateAccount = () => {
    deactivateAccountMutation.mutate();
  };

  const onSubmitSettings = (data: SettingsFormData) => {
    settingsMutation.mutate({
      ...data,
      tagIds: profileTags.map(tag => tag.id),
    });
  };

  const onSubmitEmailChange = (data: EmailChangeData) => {
    emailChangeMutation.mutate(data);
  };

  const onSubmitPasswordChange = (data: PasswordChangeData) => {
    passwordChangeMutation.mutate(data);
  };

  const handleDeleteAccount = () => {
    deleteAccountMutation.mutate();
  };

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Settings className="w-6 h-6 text-primary" />
        <h2 className="text-2xl font-bold text-gray-900">Profile Settings</h2>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Username & Location Card */}
        <Card className="border-0 shadow-lg overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center">
              <User className="w-5 h-5 mr-2" />
              Basic Information
            </CardTitle>
            <CardDescription>
              Update your username and location for search visibility
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-hidden">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmitSettings)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="your-username" 
                          {...field}
                          data-testid="input-username"
                        />
                      </FormControl>
                      <p className="text-xs text-gray-500">
                        Your public profile URL: riplek.com/{field.value || "username"}
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="searchableLocation"
                  render={({ field }) => (
                    <FormItem className="overflow-hidden min-w-0">
                      <FormLabel className="flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        Search location
                      </FormLabel>
                      <FormControl>
                        <CitySearchBar
                          value={field.value || ""}
                          onChange={(value) => {
                            form.setValue("searchableLocation", value);
                          }}
                          placeholder="Search for a city or town..."
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        This location appears on your profile and helps clients find you when searching.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Tags Section */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="flex items-center gap-2">
                      <Tag className="w-4 h-4" />
                      Profile Tags
                    </Label>
                    <Dialog open={showConsolidatedTagsDialog} onOpenChange={setShowConsolidatedTagsDialog}>
                      <DialogTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="text-xs gap-1"
                          data-testid="button-view-all-tags"
                        >
                          <Eye className="w-3 h-3" />
                          View All Tags
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="w-[95vw] max-w-lg max-h-[85vh] p-0 flex flex-col gap-0">
                        <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
                          <DialogTitle className="flex items-center gap-2">
                            <Tag className="w-5 h-5" />
                            Your Tags Overview
                          </DialogTitle>
                          <DialogDescription>
                            All tags from your profile and content help visitors discover you.
                          </DialogDescription>
                        </DialogHeader>
                        
                        <div className="flex-1 overflow-y-auto px-6 py-4">
                          {consolidatedTagsLoading ? (
                            <div className="flex items-center justify-center py-8">
                              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                            </div>
                          ) : (
                            <div className="space-y-4 pr-4">
                              {/* Profile Tags - First and Highlighted */}
                              <div className="space-y-2 bg-muted/30 p-3 rounded-md">
                                <div className="flex items-center gap-2 text-sm font-medium">
                                  <User className="w-4 h-4" />
                                  Profile Tags ({consolidatedTags?.profile?.length || 0})
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {consolidatedTags?.profile?.length ? (
                                    consolidatedTags.profile.map((tag) => (
                                      <Badge key={`profile-${tag.id}`} variant="default" className="text-xs">
                                        {tag.name}
                                      </Badge>
                                    ))
                                  ) : (
                                    <span className="text-xs text-muted-foreground">No profile tags yet. Add them below!</span>
                                  )}
                                </div>
                              </div>

                              {/* Sessions Tags */}
                              <div className="space-y-2">
                                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                  <Calendar className="w-4 h-4" />
                                  Sessions ({consolidatedTags?.sessions?.length || 0})
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {consolidatedTags?.sessions?.length ? (
                                    consolidatedTags.sessions.map((tag) => (
                                      <Badge key={`session-${tag.id}`} variant="secondary" className="text-xs">
                                        {tag.name}
                                      </Badge>
                                    ))
                                  ) : (
                                    <span className="text-xs text-muted-foreground">No tags from sessions</span>
                                  )}
                                </div>
                              </div>

                              {/* Events Tags */}
                              <div className="space-y-2">
                                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                  <Calendar className="w-4 h-4" />
                                  Events ({consolidatedTags?.events?.length || 0})
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {consolidatedTags?.events?.length ? (
                                    consolidatedTags.events.map((tag) => (
                                      <Badge key={`event-${tag.id}`} variant="secondary" className="text-xs">
                                        {tag.name}
                                      </Badge>
                                    ))
                                  ) : (
                                    <span className="text-xs text-muted-foreground">No tags from events</span>
                                  )}
                                </div>
                              </div>

                              {/* Blogs Tags */}
                              <div className="space-y-2">
                                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                  <FileText className="w-4 h-4" />
                                  Blogs ({consolidatedTags?.blogs?.length || 0})
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {consolidatedTags?.blogs?.length ? (
                                    consolidatedTags.blogs.map((tag) => (
                                      <Badge key={`blog-${tag.id}`} variant="secondary" className="text-xs">
                                        {tag.name}
                                      </Badge>
                                    ))
                                  ) : (
                                    <span className="text-xs text-muted-foreground">No tags from blogs</span>
                                  )}
                                </div>
                              </div>

                              {/* Digital Products Tags */}
                              <div className="space-y-2">
                                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                  <ShoppingBag className="w-4 h-4" />
                                  Digital Products ({consolidatedTags?.digitalProducts?.length || 0})
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {consolidatedTags?.digitalProducts?.length ? (
                                    consolidatedTags.digitalProducts.map((tag) => (
                                      <Badge key={`digital-${tag.id}`} variant="secondary" className="text-xs">
                                        {tag.name}
                                      </Badge>
                                    ))
                                  ) : (
                                    <span className="text-xs text-muted-foreground">No tags from digital products</span>
                                  )}
                                </div>
                              </div>

                              {/* Physical Products Tags */}
                              <div className="space-y-2">
                                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                  <Package className="w-4 h-4" />
                                  Physical Products ({consolidatedTags?.physicalProducts?.length || 0})
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {consolidatedTags?.physicalProducts?.length ? (
                                    consolidatedTags.physicalProducts.map((tag) => (
                                      <Badge key={`physical-${tag.id}`} variant="secondary" className="text-xs">
                                        {tag.name}
                                      </Badge>
                                    ))
                                  ) : (
                                    <span className="text-xs text-muted-foreground">No tags from physical products</span>
                                  )}
                                </div>
                              </div>

                              {/* All Unique Tags Summary */}
                              <div className="border-t pt-4 mt-4 space-y-2">
                                <div className="flex items-center gap-2 text-sm font-medium">
                                  <Tag className="w-4 h-4" />
                                  All Unique Tags ({consolidatedTags?.all?.length || 0})
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {consolidatedTags?.all?.length ? (
                                    consolidatedTags.all.map((tag) => (
                                      <Badge key={`all-${tag.id}`} variant="default" className="text-xs">
                                        {tag.name}
                                      </Badge>
                                    ))
                                  ) : (
                                    <span className="text-xs text-muted-foreground">No tags found. Add profile tags or tags to your content.</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                  
                  {/* TagManager for adding/removing profile tags */}
                  <TagManager
                    entityType="profile"
                    entityId={profile?.id}
                    selectedTags={profileTags}
                    onTagsChange={handleProfileTagsChange}
                    maxTags={20}
                    allowCreate={true}
                    showSuggestions={true}
                    variant="inline"
                    disabled={updateProfileTagsMutation.isPending}
                  />
                  <p className="text-xs text-muted-foreground">
                    Add tags to describe your expertise. These tags help visitors find you in search. Click "View All Tags" to see all tags from your content.
                  </p>
                </div>

                <Button 
                  type="submit" 
                  disabled={settingsMutation.isPending} 
                  className="w-full mt-4"
                  data-testid="button-save-settings"
                >
                  {settingsMutation.isPending ? "Saving..." : "Save Settings"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Email & Password Card */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Mail className="w-5 h-5 mr-2" />
              Account Security
            </CardTitle>
            <CardDescription>
              Manage your email and password
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Email Section */}
            <div className="space-y-3">
              <Label>Email Address</Label>
              <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                <Mail className="w-4 h-4 text-gray-400" />
                <span className="text-gray-700" data-testid="text-current-email">
                  {user?.email || "No email set"}
                </span>
                {user?.emailVerified && (
                  <span className="ml-auto text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                    Verified
                  </span>
                )}
              </div>

              {!showEmailForm ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowEmailForm(true)}
                  className="w-full"
                  data-testid="button-change-email"
                >
                  Change Email
                </Button>
              ) : (
                <Form {...emailForm}>
                  <form onSubmit={emailForm.handleSubmit(onSubmitEmailChange)} className="space-y-3 border-t pt-4">
                    <FormField
                      control={emailForm.control}
                      name="newEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>New Email</FormLabel>
                          <FormControl>
                            <Input 
                              type="email" 
                              placeholder="new@email.com" 
                              {...field}
                              data-testid="input-new-email"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <p className="text-xs text-muted-foreground">
                      A verification link will be sent to both your current and new email addresses.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setShowEmailForm(false);
                          emailForm.reset();
                        }}
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={emailChangeMutation.isPending}
                        className="flex-1"
                        data-testid="button-submit-email-change"
                      >
                        {emailChangeMutation.isPending ? "Sending..." : "Send Verification"}
                      </Button>
                    </div>
                  </form>
                </Form>
              )}
            </div>

            {/* Password Section */}
            <div className="space-y-3 border-t pt-6">
              <Label className="flex items-center gap-2">
                <Lock className="w-4 h-4" />
                Password
              </Label>

              {!showPasswordForm ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowPasswordForm(true)}
                  className="w-full"
                  data-testid="button-change-password"
                >
                  Change Password
                </Button>
              ) : (
                <Form {...passwordForm}>
                  <form onSubmit={passwordForm.handleSubmit(onSubmitPasswordChange)} className="space-y-3 pt-2">
                    <FormField
                      control={passwordForm.control}
                      name="currentPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Current Password</FormLabel>
                          <FormControl>
                            <Input 
                              type="password" 
                              placeholder="Enter current password" 
                              {...field}
                              data-testid="input-current-password"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={passwordForm.control}
                      name="newPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>New Password</FormLabel>
                          <FormControl>
                            <Input 
                              type="password" 
                              placeholder="Enter new password" 
                              {...field}
                              data-testid="input-new-password"
                              onChange={(e) => {
                                field.onChange(e);
                                if (passwordForm.getFieldState("confirmPassword").isTouched) {
                                  passwordForm.trigger("confirmPassword");
                                }
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={passwordForm.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Confirm New Password</FormLabel>
                          <FormControl>
                            <Input 
                              type="password" 
                              placeholder="Confirm new password" 
                              {...field}
                              data-testid="input-confirm-password"
                              onChange={(e) => {
                                field.onChange(e);
                                if (passwordForm.getFieldState("newPassword").isTouched) {
                                  passwordForm.trigger("newPassword");
                                }
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setShowPasswordForm(false);
                          passwordForm.reset();
                        }}
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={passwordChangeMutation.isPending}
                        className="flex-1"
                        data-testid="button-submit-password-change"
                      >
                        {passwordChangeMutation.isPending ? "Updating..." : "Update Password"}
                      </Button>
                    </div>
                  </form>
                </Form>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Deactivate Account Section */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="text-amber-600 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Deactivate Account
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h4 className="font-medium text-gray-900 dark:text-gray-100">Deactivate Account</h4>
              <p className="text-sm text-muted-foreground">
                Your profile will be hidden from public view and search results. Your data will be kept for 180 days, 
                during which you can log back in to reactivate your account. After 180 days, your account will be permanently deleted.
              </p>
            </div>
            <Button
              variant="outline"
              disabled={deactivateAccountMutation.isPending}
              onClick={() => {
                const confirmed = window.confirm(
                  "Are you sure you want to deactivate your account?\n\n" +
                  "Your profile will be hidden from public view and search results. " +
                  "You can reactivate your account by logging back in within 180 days. " +
                  "After 180 days, your account will be permanently deleted."
                );
                if (confirmed) {
                  handleDeactivateAccount();
                }
              }}
              className="shrink-0 border-amber-500 text-amber-600 hover:bg-amber-50"
              data-testid="button-deactivate-account"
            >
              {deactivateAccountMutation.isPending ? "Deactivating..." : "Deactivate Account"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Delete Account Section */}
      <Card className="border-0 shadow-lg border-red-200">
        <CardHeader>
          <CardTitle className="text-red-600 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Delete Account
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h4 className="font-medium text-gray-900 dark:text-gray-100">Delete Account</h4>
              <p className="text-sm text-muted-foreground">
                Once you delete your account, there is no going back. This will permanently delete your profile, all data, and cannot be undone.
              </p>
            </div>
            <Button
              variant="destructive"
              disabled={deleteAccountMutation.isPending}
              onClick={() => {
                const confirmed = window.confirm(
                  "Are you absolutely sure?\n\n" +
                  "This action cannot be undone. This will permanently delete your account, profile, and remove all your data."
                );
                if (confirmed) {
                  handleDeleteAccount();
                }
              }}
              className="shrink-0"
              data-testid="button-delete-account"
            >
              {deleteAccountMutation.isPending ? "Deleting..." : "Delete Account"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
