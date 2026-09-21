import { useState, useEffect, useRef } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { posthog } from "@/lib/posthog";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useDialogUnsavedChanges } from "@/hooks/use-dialog-unsaved-changes";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { ImageUpload } from "@/components/image-upload";
import { getFaviconUrl } from "@/lib/favicon";
import type { Profile } from "@shared/schema";

type ProfileLinkData = { title: string; url: string; icon?: string };
type HomePageLinkData = { title: string; type: string; description: string; imageUrl: string; url: string };
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Trash2,
  ExternalLink,
  Link as LinkIcon,
  LayoutGrid,
  Pencil,
} from "lucide-react";

// Profile Links Schema (header links - icon is now auto-fetched from favicon)
const profileLinkSchema = z.object({
  title: z.string().min(1, "Title is required").max(50, "Title must be under 50 characters"),
  url: z.string().url("Please enter a valid URL"),
  icon: z.string().optional(),
});

// Home Page Links Schema (card-style links for profile home section)
const homePageLinkSchema = z.object({
  title: z.string().min(1, "Title is required").max(100, "Title must be under 100 characters"),
  type: z.string().min(1, "Type is required"),
  description: z.string().min(1, "Description is required").max(300, "Description must be under 300 characters"),
  imageUrl: z.string().min(1, "Image is required"),
  url: z.string().url("Please enter a valid URL"),
});

const linksFormSchema = z.object({
  customLinks: z.array(profileLinkSchema).optional(),
  homePageLinks: z.array(homePageLinkSchema).optional(),
});

type LinksFormData = z.infer<typeof linksFormSchema>;

const linkTypeOptions = [
  { value: "resource", label: "Resource" },
  { value: "guide", label: "Guide" },
  { value: "course", label: "Course" },
  { value: "webinar", label: "Webinar" },
  { value: "podcast", label: "Podcast" },
  { value: "ebook", label: "E-Book" },
  { value: "tool", label: "Tool" },
  { value: "community", label: "Community" },
  { value: "newsletter", label: "Newsletter" },
  { value: "other", label: "Other" },
];

export function LinksManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [profileLinkDialogOpen, setProfileLinkDialogOpen] = useState(false);
  const [editingProfileLinkIndex, setEditingProfileLinkIndex] = useState<number | null>(null);
  const [homePageLinkDialogOpen, setHomePageLinkDialogOpen] = useState(false);
  const [editingHomePageLinkIndex, setEditingHomePageLinkIndex] = useState<number | null>(null);
  
  const initialProfileLinkValues = useRef<ProfileLinkData | null>(null);
  const initialHomePageLinkValues = useRef<HomePageLinkData | null>(null);
  const { safeClose, ConfirmDialog } = useDialogUnsavedChanges();

  const { data: profile, isLoading } = useQuery<Profile>({
    queryKey: ["/api/dashboard/profile"],
  });

  const form = useForm<LinksFormData>({
    resolver: zodResolver(linksFormSchema),
    defaultValues: {
      customLinks: [],
      homePageLinks: [],
    },
  });

  const { fields: profileLinkFields, append: appendProfileLink, remove: removeProfileLink } = useFieldArray({
    control: form.control,
    name: "customLinks",
  });

  const { fields: homePageLinkFields, append: appendHomePageLink, remove: removeHomePageLink } = useFieldArray({
    control: form.control,
    name: "homePageLinks",
  });

  // Update form when profile loads
  useEffect(() => {
    if (profile) {
      setProfileLinkDialogOpen(false);
      setEditingProfileLinkIndex(null);
      setHomePageLinkDialogOpen(false);
      setEditingHomePageLinkIndex(null);
      form.reset({
        customLinks: profile.customLinks || [],
        homePageLinks: profile.homePageLinks || [],
      });
    }
  }, [profile, form]);

  const mutation = useMutation({
    mutationFn: async (data: LinksFormData) => {
      const updatedProfile = {
        ...(profile || {}),
        customLinks: data.customLinks || [],
        homePageLinks: data.homePageLinks || [],
      };
      await apiRequest("POST", "/api/dashboard/profile", updatedProfile);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"], exact: false });
      posthog.capture('profile_links_saved');
      posthog.setPersonProperties({ profile_has_links: true });
      toast({
        title: "Links Updated",
        description: "Your links have been saved successfully.",
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
        description: "Failed to save links. Please try again.",
        variant: "destructive",
      });
    },
  });

  const openAddProfileLinkDialog = () => {
    const newIndex = profileLinkFields.length;
    const newLink = { title: "", url: "", icon: "link" };
    appendProfileLink(newLink);
    initialProfileLinkValues.current = { ...newLink };
    setEditingProfileLinkIndex(newIndex);
    setProfileLinkDialogOpen(true);
  };

  const openEditProfileLinkDialog = (index: number) => {
    const currentLink = form.getValues(`customLinks.${index}`);
    initialProfileLinkValues.current = currentLink ? { ...currentLink } : null;
    setEditingProfileLinkIndex(index);
    setProfileLinkDialogOpen(true);
  };

  const isProfileLinkDirty = (): boolean => {
    if (editingProfileLinkIndex === null || !initialProfileLinkValues.current) return false;
    const current = form.getValues(`customLinks.${editingProfileLinkIndex}`);
    if (!current) return false;
    return (
      current.title !== initialProfileLinkValues.current.title ||
      current.url !== initialProfileLinkValues.current.url
    );
  };

  const doCloseProfileLinkDialog = () => {
    if (editingProfileLinkIndex !== null) {
      const link = form.getValues(`customLinks.${editingProfileLinkIndex}`);
      if (!link?.title || !link?.url) {
        removeProfileLink(editingProfileLinkIndex);
      }
    }
    initialProfileLinkValues.current = null;
    setProfileLinkDialogOpen(false);
    setEditingProfileLinkIndex(null);
  };

  const closeProfileLinkDialog = () => {
    safeClose(isProfileLinkDirty(), doCloseProfileLinkDialog);
  };

  const saveProfileLink = () => {
    if (editingProfileLinkIndex === null) return;
    form.handleSubmit((data) => {
      mutation.mutate(data, {
        onSuccess: () => {
          setProfileLinkDialogOpen(false);
          setEditingProfileLinkIndex(null);
        }
      });
    })();
  };

  const openAddHomePageLinkDialog = () => {
    const newIndex = homePageLinkFields.length;
    const newLink = { title: "", type: "resource", description: "", imageUrl: "", url: "" };
    appendHomePageLink(newLink);
    initialHomePageLinkValues.current = { ...newLink };
    setEditingHomePageLinkIndex(newIndex);
    setHomePageLinkDialogOpen(true);
  };

  const openEditHomePageLinkDialog = (index: number) => {
    const currentLink = form.getValues(`homePageLinks.${index}`);
    initialHomePageLinkValues.current = currentLink ? { ...currentLink } : null;
    setEditingHomePageLinkIndex(index);
    setHomePageLinkDialogOpen(true);
  };

  const isHomePageLinkDirty = (): boolean => {
    if (editingHomePageLinkIndex === null || !initialHomePageLinkValues.current) return false;
    const current = form.getValues(`homePageLinks.${editingHomePageLinkIndex}`);
    if (!current) return false;
    return (
      current.title !== initialHomePageLinkValues.current.title ||
      current.type !== initialHomePageLinkValues.current.type ||
      current.description !== initialHomePageLinkValues.current.description ||
      current.imageUrl !== initialHomePageLinkValues.current.imageUrl ||
      current.url !== initialHomePageLinkValues.current.url
    );
  };

  const doCloseHomePageLinkDialog = () => {
    if (editingHomePageLinkIndex !== null) {
      const link = form.getValues(`homePageLinks.${editingHomePageLinkIndex}`);
      if (!link?.title || !link?.url || !link?.description || !link?.imageUrl) {
        removeHomePageLink(editingHomePageLinkIndex);
      }
    }
    initialHomePageLinkValues.current = null;
    setHomePageLinkDialogOpen(false);
    setEditingHomePageLinkIndex(null);
  };

  const closeHomePageLinkDialog = () => {
    safeClose(isHomePageLinkDirty(), doCloseHomePageLinkDialog);
  };

  const saveHomePageLink = () => {
    if (editingHomePageLinkIndex === null) return;
    form.handleSubmit((data) => {
      mutation.mutate(data, {
        onSuccess: () => {
          setHomePageLinkDialogOpen(false);
          setEditingHomePageLinkIndex(null);
        }
      });
    })();
  };

  const handleRemoveProfileLink = (index: number) => {
    removeProfileLink(index);
    mutation.mutate(form.getValues());
  };

  const handleRemoveHomePageLink = (index: number) => {
    removeHomePageLink(index);
    mutation.mutate(form.getValues());
  };

  const onSubmit = (data: LinksFormData) => {
    mutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded mb-4"></div>
          <div className="space-y-4">
            <div className="h-20 bg-gray-200 rounded"></div>
            <div className="h-20 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Custom Links</h2>
        <p className="text-gray-600 dark:text-gray-400">
          Manage your profile links that appear in the header and home page link cards that display on your profile.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          {/* Profile Links Section */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LinkIcon className="w-5 h-5" />
                Profile Links
              </CardTitle>
              <CardDescription>
                Create custom buttons that appear on your profile page header below your social media icons.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {profileLinkFields.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
                  <LinkIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No profile links yet</h3>
                  <p className="text-gray-500 dark:text-gray-400 mb-4">
                    Add your first profile link to get started. Links will appear as buttons on your profile header.
                  </p>
                  <Button
                    type="button"
                    onClick={openAddProfileLinkDialog}
                    data-testid="button-add-first-profile-link"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Your First Link
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {profileLinkFields.map((field, index) => {
                    const linkUrl = form.watch(`customLinks.${index}.url`);
                    const faviconUrl = linkUrl ? getFaviconUrl(linkUrl, 32) : null;

                    return (
                      <Card key={field.id} className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div className="p-2 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm flex-shrink-0">
                                {faviconUrl ? (
                                  <img
                                    src={faviconUrl}
                                    alt="Site icon"
                                    className="w-5 h-5 object-contain"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).style.display = 'none';
                                      const fallback = (e.target as HTMLImageElement).nextElementSibling;
                                      if (fallback) (fallback as HTMLElement).style.display = 'block';
                                    }}
                                  />
                                ) : null}
                                <LinkIcon 
                                  className="w-5 h-5 text-primary" 
                                  style={{ display: faviconUrl ? 'none' : 'block' }}
                                />
                              </div>
                              <div className="min-w-0">
                                <p 
                                  className="font-medium text-gray-900 dark:text-gray-100 truncate"
                                  data-testid={`text-profile-link-title-${index}`}
                                >
                                  {form.watch(`customLinks.${index}.title`) || 'Untitled'}
                                </p>
                                <p 
                                  className="text-sm text-gray-500 dark:text-gray-400 truncate"
                                  data-testid={`text-profile-link-url-${index}`}
                                >
                                  {form.watch(`customLinks.${index}.url`) || 'No URL set'}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditProfileLinkDialog(index)}
                                data-testid={`button-edit-profile-link-${index}`}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemoveProfileLink(index)}
                                className="text-red-600"
                                data-testid={`button-remove-profile-link-${index}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}

                  <Button
                    type="button"
                    variant="outline"
                    onClick={openAddProfileLinkDialog}
                    className="w-full"
                    data-testid="button-add-another-profile-link"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Another Profile Link
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Links Section */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LayoutGrid className="w-5 h-5" />
                Links
              </CardTitle>
              <CardDescription>
                Add card-style links that appear on your profile. Each card includes an image, title, type, and description, and opens in a new tab.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {homePageLinkFields.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
                  <LayoutGrid className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No links yet</h3>
                  <p className="text-gray-500 dark:text-gray-400 mb-4">
                    Add your first link card. These appear as clickable cards on your profile, each opening in a new tab.
                  </p>
                  <Button
                    type="button"
                    onClick={openAddHomePageLinkDialog}
                    data-testid="button-add-first-homepage-link"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Your First Card
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {homePageLinkFields.map((field, index) => (
                    <Card key={field.id} className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            {form.watch(`homePageLinks.${index}.imageUrl`) ? (
                              <div className="w-12 h-12 rounded-md overflow-hidden flex-shrink-0 bg-gray-100 dark:bg-gray-700">
                                <img
                                  src={form.watch(`homePageLinks.${index}.imageUrl`)}
                                  alt={form.watch(`homePageLinks.${index}.title`)}
                                  className="w-full h-full object-cover"
                                  data-testid={`img-homepage-link-thumbnail-${index}`}
                                />
                              </div>
                            ) : (
                              <div className="w-12 h-12 rounded-md bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                                <LayoutGrid className="w-5 h-5 text-gray-400" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p 
                                  className="font-medium text-gray-900 dark:text-gray-100 truncate"
                                  data-testid={`text-homepage-link-title-${index}`}
                                >
                                  {form.watch(`homePageLinks.${index}.title`) || 'Untitled'}
                                </p>
                                <span 
                                  className="inline-block px-2 py-0.5 text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full flex-shrink-0"
                                  data-testid={`badge-homepage-link-type-${index}`}
                                >
                                  {linkTypeOptions.find(opt => opt.value === form.watch(`homePageLinks.${index}.type`))?.label || "Resource"}
                                </span>
                              </div>
                              <p 
                                className="text-sm text-gray-500 dark:text-gray-400 truncate"
                                data-testid={`text-homepage-link-url-${index}`}
                              >
                                {form.watch(`homePageLinks.${index}.url`) || 'No URL set'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditHomePageLinkDialog(index)}
                              data-testid={`button-edit-homepage-link-${index}`}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveHomePageLink(index)}
                              className="text-red-600"
                              data-testid={`button-remove-homepage-link-${index}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                  <Button
                    type="button"
                    variant="outline"
                    onClick={openAddHomePageLinkDialog}
                    className="w-full"
                    data-testid="button-add-another-homepage-link"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Another Home Page Link
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Profile Link Dialog */}
          <Dialog open={profileLinkDialogOpen} onOpenChange={(open) => !open && closeProfileLinkDialog()}>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>
                  {editingProfileLinkIndex !== null && form.watch(`customLinks.${editingProfileLinkIndex}.title`) 
                    ? "Edit Profile Link" 
                    : "Add Profile Link"}
                </DialogTitle>
              </DialogHeader>
              {editingProfileLinkIndex !== null && (
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name={`customLinks.${editingProfileLinkIndex}.title`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Link Title</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., Free Guide, Newsletter"
                            data-testid="input-profile-link-title-dialog"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`customLinks.${editingProfileLinkIndex}.url`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>URL</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="https://example.com/link"
                            data-testid="input-profile-link-url-dialog"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Preview */}
                  {form.watch(`customLinks.${editingProfileLinkIndex}.title`) && (
                    <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Preview:</p>
                      <div className="inline-flex items-center px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm">
                        {(() => {
                          const linkUrl = form.watch(`customLinks.${editingProfileLinkIndex}.url`);
                          const faviconUrl = linkUrl ? getFaviconUrl(linkUrl, 32) : null;
                          return (
                            <span className="relative w-4 h-4 mr-2 flex-shrink-0">
                              {faviconUrl && (
                                <img 
                                  src={faviconUrl} 
                                  alt="Site favicon" 
                                  className="w-4 h-4 object-contain"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                    const fallback = (e.target as HTMLImageElement).nextElementSibling;
                                    if (fallback) (fallback as HTMLElement).style.display = 'block';
                                  }}
                                />
                              )}
                              <span style={{ display: faviconUrl ? 'none' : 'block' }}>
                                <LinkIcon className="w-4 h-4 text-primary" />
                              </span>
                            </span>
                          );
                        })()}
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {form.watch(`customLinks.${editingProfileLinkIndex}.title`)}
                        </span>
                        <ExternalLink className="w-3 h-3 ml-2 text-gray-400" />
                      </div>
                    </div>
                  )}
                </div>
              )}
              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeProfileLinkDialog}
                  data-testid="button-cancel-profile-link-dialog"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={saveProfileLink}
                  disabled={mutation.isPending}
                  data-testid="button-save-profile-link-dialog"
                >
                  {mutation.isPending ? (
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                  ) : null}
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Home Page Link Dialog */}
          <Dialog open={homePageLinkDialogOpen} onOpenChange={(open) => !open && closeHomePageLinkDialog()}>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingHomePageLinkIndex !== null && form.watch(`homePageLinks.${editingHomePageLinkIndex}.title`) 
                    ? "Edit Home Page Link" 
                    : "Add Home Page Link"}
                </DialogTitle>
              </DialogHeader>
              {editingHomePageLinkIndex !== null && (
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name={`homePageLinks.${editingHomePageLinkIndex}.title`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., Free Business Guide"
                            data-testid="input-homepage-link-title-dialog"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`homePageLinks.${editingHomePageLinkIndex}.type`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-homepage-link-type-dialog">
                              <SelectValue placeholder="Select a type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {linkTypeOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`homePageLinks.${editingHomePageLinkIndex}.description`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Describe what this link offers..."
                            className="resize-none"
                            rows={3}
                            data-testid="textarea-homepage-link-description-dialog"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`homePageLinks.${editingHomePageLinkIndex}.url`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>URL</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="https://example.com/resource"
                            data-testid="input-homepage-link-url-dialog"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`homePageLinks.${editingHomePageLinkIndex}.imageUrl`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Card Image</FormLabel>
                        <FormControl>
                          <ImageUpload
                            value={field.value}
                            onChange={field.onChange}
                            placeholder="Upload card image"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeHomePageLinkDialog}
                  data-testid="button-cancel-homepage-link-dialog"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={saveHomePageLink}
                  disabled={mutation.isPending}
                  data-testid="button-save-homepage-link-dialog"
                >
                  {mutation.isPending ? (
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                  ) : null}
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </form>
      </Form>

      {/* Help Section */}
      <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
        <CardContent className="p-4">
          <h3 className="font-medium text-blue-900 dark:text-blue-100 mb-2">Tips for Custom Links</h3>
          <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
            <li>Profile Links: Appear as icon buttons in your profile header (favicon is automatically fetched from URL)</li>
            <li>Home Page Links: Appear as clickable cards on your profile's home section</li>
            <li>Use compelling images for home page link cards to attract clicks</li>
            <li>Keep descriptions concise but informative</li>
            <li>Use HTTPS URLs for security</li>
          </ul>
        </CardContent>
      </Card>

      <ConfirmDialog />
    </div>
  );
}
