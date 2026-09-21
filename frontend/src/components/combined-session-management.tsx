import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { useDialogUnsavedChanges } from "@/hooks/use-dialog-unsaved-changes";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { posthog } from "@/lib/posthog";
import { waitForSupabase } from "@/lib/supabase";
import { 
  Calendar, 
  Clock, 
  Plus,
  Edit,
  Trash2,
  Save,
  X,
  Upload,
  Image as ImageIcon,
  ChevronUp,
  ChevronDown,
  Star,
  MapPin,
  AlertCircle
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ImageUpload } from "@/components/image-upload";
import { z } from "zod";
import AvailabilityManagement from "@/components/availability-management";
import { LocationPicker } from "@/components/location-picker";
import { LocationVisibility } from "@/components/location-visibility";
import { TagManager, type Tag } from "@/components/tag-manager";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import { SUPPORTED_CURRENCIES, DEFAULT_CURRENCY, formatPrice } from "@shared/currencies";
import type { Location } from "@shared/schema";

// Session form schema
const sessionSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().optional(),
  thumbnailDescription: z.string().optional(),
  testimonials: z.string().optional(),
  customQuestion: z.string().optional(),
  duration: z.number().min(15, "Duration must be at least 15 minutes"),
  isFree: z.boolean().default(false),
  price: z.string().optional(),
  currency: z.string().default(DEFAULT_CURRENCY),
  availableDays: z.array(z.number()).default([0, 1, 2, 3, 4, 5, 6]), // Auto-populated from mentor availability
  isOffline: z.boolean().default(false),
  isOnline: z.boolean().default(true),
  locationId: z.number().nullable().optional(),
  showExactLocation: z.boolean().default(true),
  showLocationName: z.boolean().default(true),
  showStreetAddress: z.boolean().default(false),
  showMapLocation: z.boolean().default(false),
  featuredImage: z.string().optional(),
}).refine((data) => {
  // If not free, price is required
  if (!data.isFree && (!data.price || data.price.trim() === "")) {
    return false;
  }
  return true;
}, {
  message: "Price is required for paid sessions",
  path: ["price"],
});

type SessionFormData = z.infer<typeof sessionSchema>;

interface SessionImage {
  url: string;
  alt: string;
}

interface BookingSession {
  id: number;
  profileId: number;
  title: string;
  description?: string;
  thumbnailDescription?: string;
  testimonials?: string;
  customQuestion?: string;
  duration: number;
  price: string;
  currency: string;
  isFree?: boolean;
  availableDays?: number[];
  images?: SessionImage[];
  isOffline?: boolean;
  isOnline?: boolean;
  isActive: boolean;
  isFeatured?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface MentorAvailability {
  id: number;
}

export function CombinedSessionManagement() {
  const [isCreating, setIsCreating] = useState(false);
  const [editingSession, setEditingSession] = useState<BookingSession | null>(null);
  const [sessionImages, setSessionImages] = useState<SessionImage[]>([]);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [sessionTags, setSessionTags] = useState<Tag[]>([]);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState("sessions");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<SessionFormData>({
    resolver: zodResolver(sessionSchema),
    defaultValues: {
      title: "",
      description: "",
      duration: 60,
      isFree: false,
      price: "",
      currency: DEFAULT_CURRENCY,
      availableDays: [0, 1, 2, 3, 4, 5, 6],
      isOffline: false,
      isOnline: true,
      locationId: null,
      showExactLocation: true,
      showLocationName: true,
      showStreetAddress: false,
      showMapLocation: false,
      featuredImage: "",
    },
  });

  const isFree = form.watch("isFree");

  // Dialog-level unsaved changes handling
  const { safeClose, ConfirmDialog } = useDialogUnsavedChanges();

  // Fetch sessions
  const { data: sessions = [], isLoading: sessionsLoading, error: sessionsError } = useQuery<BookingSession[]>({
    queryKey: ["/api/dashboard/sessions"],
  });

  // Fetch locations for LocationPicker
  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
  });

  // Fetch availability to detect empty state for the banner
  const { data: availability = [] } = useQuery<MentorAvailability[]>({
    queryKey: ["/api/dashboard/availability"],
  });

  // Session mutations
  const createMutation = useMutation({
    mutationFn: async (data: SessionFormData) => {
      const sessionData: any = { ...data };
      // Include featured image as part of images array if provided
      if (data.featuredImage) {
        sessionData.images = [{ url: data.featuredImage, alt: data.title }];
      }
      delete sessionData.featuredImage;
      // Include tag IDs in the request
      sessionData.tagIds = sessionTags.map(t => t.id);
      return await apiRequest("POST", "/api/dashboard/sessions", sessionData);
    },
    onSuccess: async () => {
      const existingSessions = queryClient.getQueryData<any[]>(["/api/dashboard/sessions"]) ?? [];
      const is_first = existingSessions.length === 0;
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"], exact: false });
      posthog.capture('session_created', { is_first });
      if (is_first) {
        posthog.setPersonProperties({ first_session_created_at: new Date().toISOString() });
      }
      toast({
        title: "Success",
        description: "Session created successfully",
      });
      setIsCreating(false);
      setEditingSession(null);
      setSessionTags([]);
      setSelectedLocation(null);
      setSessionImages([]);
      setActiveTab("availability");
      form.reset({
        title: "",
        description: "",
        thumbnailDescription: "",
        testimonials: "",
        duration: 60,
        isFree: false,
        price: "",
        currency: DEFAULT_CURRENCY,
        availableDays: [0, 1, 2, 3, 4, 5, 6],
        isOffline: false,
        isOnline: true,
        locationId: null,
        showExactLocation: true,
        showLocationName: true,
        showStreetAddress: false,
        showMapLocation: false,
        featuredImage: "",
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
        description: "Failed to create session",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: SessionFormData & { id: number }) => {
      const sessionData: any = { ...data };
      // Include featured image as part of images array if provided
      if (data.featuredImage) {
        sessionData.images = [{ url: data.featuredImage, alt: data.title }];
      } else {
        sessionData.images = [];
      }
      delete sessionData.featuredImage;
      // Include tag IDs in the request
      sessionData.tagIds = sessionTags.map(t => t.id);
      return await apiRequest("PATCH", `/api/dashboard/sessions/${sessionData.id}`, sessionData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"], exact: false });
      toast({
        title: "Success",
        description: "Session updated successfully",
      });
      setEditingSession(null);
      setIsCreating(false);
      setSessionTags([]);
      setSelectedLocation(null);
      setSessionImages([]);
      form.reset({
        title: "",
        description: "",
        thumbnailDescription: "",
        testimonials: "",
        duration: 60,
        isFree: false,
        price: "",
        currency: DEFAULT_CURRENCY,
        availableDays: [0, 1, 2, 3, 4, 5, 6],
        isOffline: false,
        isOnline: true,
        locationId: null,
        showExactLocation: true,
        showLocationName: true,
        showStreetAddress: false,
        showMapLocation: false,
        featuredImage: "",
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
        description: "Failed to update session",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/dashboard/sessions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"], exact: false });
      toast({
        title: "Success",
        description: "Session deleted successfully",
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
        description: "Failed to delete session",
        variant: "destructive",
      });
    },
  });

  const featureMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("POST", `/api/dashboard/sessions/${id}/feature`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"], exact: false });
      toast({
        title: "Success",
        description: "Featured session updated successfully",
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
        description: "Failed to update featured session",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: SessionFormData) => {
    // Set price to "0" for free sessions
    const submitData = {
      ...data,
      price: data.isFree ? "0" : data.price,
    };
    
    if (editingSession) {
      updateMutation.mutate({ ...submitData, id: editingSession.id });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const handleEdit = async (session: BookingSession) => {
    setEditingSession(session);
    setIsCreating(true);
    setSessionImages(session.images || []);
    const firstImage = session.images?.[0]?.url || "";
    // Set selectedLocation from the session's locationId
    if ((session as any).locationId && locations.length > 0) {
      const loc = locations.find(l => l.id === (session as any).locationId);
      setSelectedLocation(loc || null);
    } else {
      setSelectedLocation(null);
    }
    // Fetch session tags
    try {
      const response = await fetch(`/api/sessions/${session.id}/tags`);
      if (response.ok) {
        const tags = await response.json();
        setSessionTags(tags);
      } else {
        setSessionTags([]);
      }
    } catch (error) {
      setSessionTags([]);
    }
    form.reset({
      title: session.title,
      description: session.description || "",
      thumbnailDescription: session.thumbnailDescription || "",
      testimonials: session.testimonials || "",
      duration: session.duration,
      isFree: session.isFree ?? false,
      price: session.price,
      currency: session.currency || DEFAULT_CURRENCY,
      availableDays: session.availableDays || [0, 1, 2, 3, 4, 5, 6],
      isOffline: session.isOffline || false,
      isOnline: session.isOnline !== undefined ? session.isOnline : true,
      locationId: (session as any).locationId || null,
      showExactLocation: (session as any).showExactLocation ?? true,
      showLocationName: (session as any).showLocationName ?? true,
      showStreetAddress: (session as any).showStreetAddress ?? false,
      showMapLocation: (session as any).showMapLocation ?? false,
      featuredImage: firstImage,
    });
  };

  const doCloseDialog = () => {
    setIsCreating(false);
    setEditingSession(null);
    setSessionImages([]);
    setSelectedLocation(null);
    setSessionTags([]);
    form.reset({
      title: "",
      description: "",
      thumbnailDescription: "",
      testimonials: "",
      duration: 60,
      isFree: false,
      price: "",
      currency: DEFAULT_CURRENCY,
      availableDays: [0, 1, 2, 3, 4, 5, 6],
      isOffline: false,
      isOnline: true,
      locationId: null,
      showExactLocation: true,
      showLocationName: true,
      showStreetAddress: false,
      showMapLocation: false,
      featuredImage: "",
    });
  };

  const handleCancel = () => {
    safeClose(form.formState.isDirty, doCloseDialog);
  };

  const handleCreate = () => {
    posthog.capture('session_create_form_opened');
    setSelectedLocation(null);
    setSessionImages([]);
    setEditingSession(null);
    setSessionTags([]);
    form.reset({
      title: "",
      description: "",
      thumbnailDescription: "",
      testimonials: "",
      duration: 60,
      isFree: false,
      price: "",
      currency: DEFAULT_CURRENCY,
      availableDays: [0, 1, 2, 3, 4, 5, 6],
      isOffline: false,
      isOnline: true,
      locationId: null,
      showExactLocation: true,
      showLocationName: true,
      showStreetAddress: false,
      showMapLocation: false,
      featuredImage: "",
    });
    setIsCreating(true);
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    if (!editingSession) {
      toast({
        title: "Error",
        description: "Please save the session first before uploading images",
        variant: "destructive",
      });
      return;
    }

    setIsUploadingImage(true);

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

      for (const file of Array.from(files)) {
        // Validate file type
        if (!file.type.startsWith('image/')) {
          toast({
            title: "Invalid file",
            description: `${file.name} is not an image file`,
            variant: "destructive",
          });
          continue;
        }

        // Validate file size (25MB limit)
        if (file.size > 25 * 1024 * 1024) {
          toast({
            title: "File too large",
            description: `${file.name} exceeds 25MB limit`,
            variant: "destructive",
          });
          continue;
        }

        // Upload file to Supabase storage via backend
        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder', 'session-images');
        
        const uploadResponse = await fetch("/api/upload/image", {
          method: "POST",
          headers: authHeaders,
          body: formData,
        });
        
        if (!uploadResponse.ok) throw new Error("Failed to upload image");
        
        const { url } = await uploadResponse.json();

        // Add image to session
        const addImageResponse = await apiRequest("POST", `/api/dashboard/sessions/${editingSession.id}/images`, {
          imageURL: url,
          altText: file.name.replace(/\.[^/.]+$/, ""),
        });

        const updatedSession = await addImageResponse.json();
        
        // Update local state
        setSessionImages(updatedSession.images || []);
        
        // Update the session in the cache
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/sessions"] });

        toast({
          title: "Success",
          description: `${file.name} uploaded successfully`,
        });
      }
    } catch (error) {
      console.error("Error uploading image:", error);
      toast({
        title: "Upload failed",
        description: "Failed to upload image. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteImage = async (imageIndex: number) => {
    if (!editingSession) return;

    try {
      const response = await apiRequest("DELETE", `/api/dashboard/sessions/${editingSession.id}/images/${imageIndex}`);
      const updatedSession = await response.json();
      
      setSessionImages(updatedSession.images || []);
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/sessions"] });
      
      toast({
        title: "Success",
        description: "Image deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting image:", error);
      toast({
        title: "Delete failed",
        description: "Failed to delete image. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleMoveImage = async (fromIndex: number, toIndex: number) => {
    if (!editingSession) return;

    const newImages = [...sessionImages];
    const [movedImage] = newImages.splice(fromIndex, 1);
    newImages.splice(toIndex, 0, movedImage);

    try {
      const response = await apiRequest("PATCH", `/api/dashboard/sessions/${editingSession.id}/images/reorder`, {
        images: newImages
      });
      const updatedSession = await response.json();
      
      setSessionImages(updatedSession.images || []);
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/sessions"] });
      
      toast({
        title: "Success",
        description: "Images reordered successfully",
      });
    } catch (error) {
      console.error("Error reordering images:", error);
      toast({
        title: "Reorder failed",
        description: "Failed to reorder images. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Handle authentication errors
  if (sessionsError && isUnauthorizedError(sessionsError as Error)) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <Calendar className="mx-auto h-12 w-12 text-yellow-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">Authentication Required</h3>
            <p className="mt-2 text-sm text-gray-500">
              You need to be logged in to manage your sessions and bookings.
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

  if (sessionsLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Manage Sessions</h2>
        <p className="text-gray-600">Create booking sessions and manage your appointments</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="availability">Availability</TabsTrigger>
        </TabsList>

        <TabsContent value="sessions" className="space-y-6">
          
          {/* Session Creation/Editing Modal */}
          <Dialog open={isCreating} onOpenChange={(open) => !open && handleCancel()}>
            {/* CHANGES EXPLAINED:
              1. w-[95vw]: Width is 95% of viewport width (leaves small margins on sides)
              2. max-w-2xl: Stops it from getting too wide on desktop
              3. max-h-[85vh]: CRITICAL - Restricts height to 85% of screen so it doesn't overflow top/bottom
              4. rounded-lg: Keeps the rounded corners (popup look)
              5. flex flex-col: Allows us to fix the header and scroll the body
            */}
            <DialogContent className="w-[95vw] max-w-2xl max-h-[85vh] p-0 flex flex-col gap-0 border rounded-lg bg-background shadow-lg">

              {/* Fixed Header */}
              <DialogHeader className="px-4 py-4 sm:px-6 sm:pt-6 sm:pb-4 border-b flex-shrink-0">
                <DialogTitle>{editingSession ? "Edit Session" : "Create New Session"}</DialogTitle>
                <DialogDescription>
                  {editingSession ? "Update your booking session" : "Create a new booking session for your profile"}
                </DialogDescription>
              </DialogHeader>

              {/* Scrollable Body - flex-1 takes remaining height defined by max-h-[85vh] */}
              <div className="flex-1 overflow-y-auto">
                <div className="p-4 sm:px-6 sm:pb-6">
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                      <div className="grid md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="title"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Session Title</FormLabel>
                              <FormControl>
                                <Input placeholder="One-on-One Coaching" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="duration"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Duration (minutes)</FormLabel>
                              <FormControl>
                                <Input 
                                  type="number" 
                                  placeholder="60"
                                  {...field}
                                  onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name="featuredImage"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Featured Image</FormLabel>
                            <FormControl>
                              <ImageUpload
                                value={field.value}
                                onChange={field.onChange}
                                placeholder="Upload an image for your session"
                                cropAspect={16/9}
                              />
                            </FormControl>
                            <p className="text-sm text-muted-foreground">
                              Add a featured image to make your session more appealing
                            </p>
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
                                placeholder="Short description shown on session cards..."
                                rows={2}
                                {...field} 
                                data-testid="textarea-thumbnail-description"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="description"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Description (Optional)</FormLabel>
                            <FormControl>
                              <Textarea 
                                placeholder="Describe what this session includes..."
                                rows={3}
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="testimonials"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Client Testimonials (Optional)</FormLabel>
                            <FormControl>
                              <Textarea 
                                placeholder="Add testimonials from clients who have experienced this session..."
                                rows={3}
                                {...field} 
                                data-testid="textarea-testimonials"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="customQuestion"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Custom Question (Optional)</FormLabel>
                            <FormControl>
                              <Textarea 
                                placeholder="Ask clients a specific question during booking (e.g., 'What are your goals for this session?')"
                                rows={2}
                                {...field} 
                                data-testid="textarea-custom-question"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="space-y-4 pt-4 border-t">
                        <FormField
                          control={form.control}
                          name="isFree"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Session Type</FormLabel>
                              <div className="flex gap-6 mt-2">
                                <label className="flex items-center gap-3 cursor-pointer">
                                  <div 
                                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                                      !field.value 
                                        ? 'border-[#b66667] bg-[#b66667]' 
                                        : 'border-gray-300 bg-white'
                                    }`}
                                    onClick={() => field.onChange(false)}
                                  >
                                    {!field.value && (
                                      <div className="w-2 h-2 rounded-full bg-white" />
                                    )}
                                  </div>
                                  <span className="text-sm font-medium">Paid</span>
                                </label>
                                <label className="flex items-center gap-3 cursor-pointer">
                                  <div 
                                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                                      field.value 
                                        ? 'border-[#b66667] bg-[#b66667]' 
                                        : 'border-gray-300 bg-white'
                                    }`}
                                    onClick={() => field.onChange(true)}
                                  >
                                    {field.value && (
                                      <div className="w-2 h-2 rounded-full bg-white" />
                                    )}
                                  </div>
                                  <span className="text-sm font-medium">Free</span>
                                </label>
                              </div>
                            </FormItem>
                          )}
                        />

                        <div className="flex gap-4 items-start">
                          <FormField
                            control={form.control}
                            name="currency"
                            render={({ field }) => (
                              <FormItem className="w-32">
                                <FormLabel>Currency</FormLabel>
                                <Select 
                                  onValueChange={field.onChange} 
                                  value={field.value}
                                  disabled={isFree}
                                >
                                  <FormControl>
                                    <SelectTrigger 
                                      data-testid="select-currency"
                                      className={isFree ? "bg-gray-100 cursor-not-allowed" : ""}
                                    >
                                      <SelectValue placeholder="Currency" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {SUPPORTED_CURRENCIES.map((currency) => (
                                      <SelectItem key={currency.code} value={currency.code}>
                                        {currency.code} ({currency.symbol})
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
                            name="price"
                            render={({ field }) => (
                              <FormItem className="flex-1 max-w-xs">
                                <FormLabel>Price</FormLabel>
                                <FormControl>
                                  <Input 
                                    placeholder={isFree ? "Free" : "99.00"} 
                                    disabled={isFree}
                                    {...field} 
                                    value={isFree ? "" : field.value}
                                    className={isFree ? "bg-gray-100 cursor-not-allowed" : ""}
                                    data-testid="input-price" 
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>

                      {/* Session Mode Section */}
                      <div className="space-y-4 pt-4 border-t">
                        <h3 className="font-medium text-gray-900">Session Mode</h3>

                        {/* Offline Checkbox */}
                        <FormField
                          control={form.control}
                          name="isOffline"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                              <FormControl>
                                <Checkbox
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  data-testid="checkbox-offline"
                                />
                              </FormControl>
                              <div className="space-y-1 leading-none">
                                <FormLabel className="text-sm font-normal cursor-pointer">
                                  Offline
                                </FormLabel>
                              </div>
                            </FormItem>
                          )}
                        />

                        {/* Conditional Location field */}
                        {form.watch("isOffline") && (
                          <div className="sm:ml-6 space-y-4 p-3 sm:p-4 bg-gray-50 rounded-lg overflow-hidden">
                            <LocationPicker
                              selectedLocationId={selectedLocation?.id}
                              onSelect={(location) => {
                                setSelectedLocation(location);
                                if (location) {
                                  form.setValue("locationId", location.id);
                                } else {
                                  form.setValue("locationId", null);
                                }
                              }}
                              label="Select Saved Location"
                            />
                            {selectedLocation && (
                              <LocationVisibility
                                showLocationName={form.watch("showLocationName") ?? true}
                                showStreetAddress={form.watch("showStreetAddress") ?? false}
                                showMapLocation={form.watch("showMapLocation") ?? false}
                                onSettingsChange={(settings) => {
                                  form.setValue("showLocationName", settings.showLocationName);
                                  form.setValue("showStreetAddress", settings.showStreetAddress);
                                  form.setValue("showMapLocation", settings.showMapLocation);
                                }}
                                location={selectedLocation}
                              />
                            )}
                          </div>
                        )}

                        {/* Online Checkbox */}
                        <FormField
                          control={form.control}
                          name="isOnline"
                          render={({ field }) => (
                            <FormItem className="space-y-2">
                              <div className="flex flex-row items-start space-x-3 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    data-testid="checkbox-online"
                                  />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                  <FormLabel className="text-sm font-normal cursor-pointer">
                                    Online
                                  </FormLabel>
                                </div>
                              </div>
                              <p className="text-sm text-gray-500 ml-6">
                                Connect your Stripe account to be able to receive online payments. If not, connect directly with clients and arrange payment method.
                              </p>
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Image Management Section */}
                      {editingSession && (
                        <div className="space-y-4 pt-4 border-t">
                          <div>
                            <Label>Session Images</Label>
                            <p className="text-sm text-gray-500 mb-3">
                              Upload images to showcase this session. Images will appear in a carousel on the session detail page.
                            </p>

                            <input
                              ref={fileInputRef}
                              type="file"
                              accept="image/*"
                              multiple
                              onChange={handleImageUpload}
                              className="hidden"
                              data-testid="input-session-images"
                            />

                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => fileInputRef.current?.click()}
                              disabled={isUploadingImage}
                              data-testid="button-upload-session-images"
                            >
                              <Upload className="w-4 h-4 mr-2" />
                              {isUploadingImage ? "Uploading..." : "Upload Images"}
                            </Button>
                          </div>

                          {/* Display Uploaded Images */}
                          {sessionImages.length > 0 && (
                            <div className="space-y-2">
                              <Label>Uploaded Images ({sessionImages.length})</Label>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                {sessionImages.map((image, index) => (
                                  <div
                                    key={index}
                                    className="relative group border rounded-lg p-2 bg-gray-50"
                                    data-testid={`session-image-${index}`}
                                  >
                                    <img
                                      src={image.url}
                                      alt={image.alt || `Session image ${index + 1}`}
                                      className="w-full h-32 object-cover rounded"
                                    />

                                    <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => handleMoveImage(index, Math.max(0, index - 1))}
                                        disabled={index === 0}
                                        className="h-7 w-7 p-0"
                                        data-testid={`button-move-up-${index}`}
                                      >
                                        <ChevronUp className="w-4 h-4" />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => handleMoveImage(index, Math.min(sessionImages.length - 1, index + 1))}
                                        disabled={index === sessionImages.length - 1}
                                        className="h-7 w-7 p-0"
                                        data-testid={`button-move-down-${index}`}
                                      >
                                        <ChevronDown className="w-4 h-4" />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => handleDeleteImage(index)}
                                        className="h-7 w-7 p-0"
                                        data-testid={`button-delete-image-${index}`}
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    </div>

                                    <p className="text-xs text-gray-600 mt-1 truncate">
                                      {image.alt || `Image ${index + 1}`}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Tags Section */}
                      <div className="space-y-2">
                        <Label>Tags</Label>
                        <TagManager
                          entityType="session"
                          entityId={editingSession?.id}
                          selectedTags={sessionTags}
                          onTagsChange={setSessionTags}
                          maxTags={10}
                          allowCreate={true}
                          showSuggestions={true}
                        />
                        <p className="text-sm text-muted-foreground">
                          Add tags to help users find your session when searching
                        </p>
                      </div>

                      <div className="flex gap-3 pt-4 border-t">
                        <Button 
                          type="submit" 
                          disabled={createMutation.isPending || updateMutation.isPending}
                        >
                          <Save className="w-4 h-4 mr-2" />
                          {editingSession ? "Update Session" : "Create Session"}
                        </Button>
                        <Button type="button" variant="outline" onClick={handleCancel}>
                          Cancel
                        </Button>
                      </div>
                    </form>
                  </Form>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Sessions List */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle>Your Sessions</CardTitle>
                  <CardDescription>Manage your booking sessions</CardDescription>
                </div>
                <Button onClick={handleCreate} data-testid="button-new-session">
                  <Plus className="w-4 h-4 mr-2" />
                  New Session
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {sessions.length === 0 ? (
                <div className="text-center py-8">
                  <Calendar className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-4 text-lg font-medium text-gray-900">No sessions yet</h3>
                  <p className="mt-2 text-sm text-gray-500">
                    Create your first booking session to start accepting appointments.
                  </p>
                  <Button 
                    className="mt-4" 
                    onClick={handleCreate}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create Session
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {sessions.map((session) => (
                    <div
                      key={session.id}
                      className="p-4 border rounded-lg"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-medium text-gray-900">{session.title}</h4>
                            {session.isFeatured && (
                              <Badge className="bg-primary text-white" data-testid={`badge-featured-${session.id}`}>
                                Featured
                              </Badge>
                            )}
                          </div>
                          {session.thumbnailDescription && (
                            <p className="text-sm text-gray-600 mt-1">{session.thumbnailDescription}</p>
                          )}
                          <div className="flex items-center gap-4 text-sm text-gray-500 mt-2 flex-wrap">
                            <span className="flex items-center gap-1">
                              <Clock className="w-4 h-4" />
                              {session.duration} minutes
                            </span>
                            <span className={`flex items-center gap-1 ${session.isFree ? "text-sm" : ""}`}>
                              {session.isFree ? (
                                <span className="font-medium text-primary">Free</span>
                              ) : (
                                <span className="font-medium">
                                  {formatPrice(session.price, session.currency)}
                                </span>
                              )}
                            </span>
                            {session.images && session.images.length > 0 && (
                              <span className="flex items-center gap-1">
                                <ImageIcon className="w-4 h-4" />
                                {session.images.length} image{session.images.length !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                          {sessions.length > 1 && !session.isFeatured && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => featureMutation.mutate(session.id)}
                              disabled={featureMutation.isPending}
                              data-testid={`button-feature-${session.id}`}
                            >
                              <Star className="w-4 h-4 mr-1" />
                              Set as Featured
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(session)}
                            data-testid={`button-edit-${session.id}`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDeleteId(session.id)}
                            disabled={deleteMutation.isPending}
                            data-testid={`button-delete-${session.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="availability" className="space-y-6">
          {availability.length === 0 && (
            <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <AlertTitle className="text-amber-800 dark:text-amber-200">Set your availability to start receiving bookings</AlertTitle>
              <AlertDescription className="text-amber-700 dark:text-amber-300">
                Your session has been created, but clients won't be able to book it until you add at least one available time slot below.
              </AlertDescription>
            </Alert>
          )}
          <AvailabilityManagement />
        </TabsContent>

      </Tabs>
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
        description="This session will be permanently deleted. This action cannot be undone."
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}