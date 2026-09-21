import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { useDialogUnsavedChanges } from "@/hooks/use-dialog-unsaved-changes";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { posthog } from "@/lib/posthog";
import { ImageUpload } from "@/components/image-upload";
import { TagManager, Tag } from "@/components/tag-manager";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import {
  InlinePaymentMethodsEditor,
  type PaymentMethod,
  mergeWithDefaults,
  DEFAULT_PAYMENT_METHODS,
} from "@/components/inline-payment-methods-editor";
import { uploadQrImage } from "@/lib/qr-upload";
import { waitForSupabase } from "@/lib/supabase";
import { SUPPORTED_CURRENCIES, formatPrice } from "@shared/currencies";
import { 
  Package, 
  Plus, 
  Edit, 
  Trash2, 
  Save, 
  X,
  DollarSign,
  Eye,
  Download,
  FileText,
  Video,
  Image,
  Upload,
  Loader2,
  Check,
  Star
} from "lucide-react";
import { format } from "date-fns";
import { z } from "zod";

interface ApiError extends Error {
  status?: number;
  data?: { message?: string; errors?: unknown };
}

function getApiErrorMessage(error: Error, fallback: string): string {
  const apiError = error as ApiError;
  if (apiError.status === 400) {
    const errors = apiError.data?.errors;
    if (Array.isArray(errors) && errors.length > 0) {
      const first = errors[0] as { message?: string; path?: string[] };
      if (first.path?.length && first.message) {
        return `${first.path.join(".")}: ${first.message}`;
      }
      if (first.message) {
        return first.message;
      }
    }
    if (apiError.data?.message) {
      return apiError.data.message;
    }
  }
  if (apiError.message && apiError.message !== fallback) {
    return apiError.message;
  }
  return fallback;
}

// Product types with their icons and labels
const PRODUCT_TYPES = [
  { value: "pdf", label: "PDF Document", icon: FileText, accept: ".pdf", maxSize: 50 },
  { value: "video", label: "Video", icon: Video, accept: "video/*", maxSize: 500 },
  { value: "image", label: "Image", icon: Image, accept: "image/*", maxSize: 25 },
] as const;

type ProductType = typeof PRODUCT_TYPES[number]["value"];

// Digital product form schema
const digitalProductSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().optional(),
  thumbnailDescription: z.string().min(1, "Thumbnail description is required").max(140, "Thumbnail description must be 140 characters or less"),
  price: z.string().optional().refine(
    (val) => !val || val === "" || /^\d+(\.\d{1,2})?$/.test(val),
    { message: "Invalid price format" }
  ),
  currency: z.string().default("USD"),
  productType: z.enum(["pdf", "video", "image"]),
  isFree: z.boolean().default(false),
  requiresPayment: z.boolean().default(false),
  paymentInstructions: z.string().optional(),
  imageUrl: z.string().optional(),
  fileUrl: z.string().min(1, "Product file is required"),
  fileMimeType: z.string().optional(),
});

type DigitalProductFormData = z.infer<typeof digitalProductSchema>;

interface DigitalProduct {
  id: number;
  profileId: number;
  title: string;
  description?: string;
  thumbnailDescription: string;
  price: string;
  productType?: string;
  isFree?: boolean;
  requiresPayment?: boolean;
  paymentInstructions?: string;
  imageUrl?: string;
  fileUrl?: string;
  fileMimeType?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function DigitalProductsManagement() {
  const [isCreating, setIsCreating] = useState(false);
  const [editingProduct, setEditingProduct] = useState<DigitalProduct | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [productTags, setProductTags] = useState<Tag[]>([]);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(DEFAULT_PAYMENT_METHODS);
  const [initialPaymentMethods, setInitialPaymentMethods] = useState<PaymentMethod[]>(DEFAULT_PAYMENT_METHODS);
  const [paymentMethodsDirty, setPaymentMethodsDirty] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadAbortControllerRef = useRef<AbortController | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<DigitalProductFormData>({
    resolver: zodResolver(digitalProductSchema),
    defaultValues: {
      title: "",
      description: "",
      thumbnailDescription: "",
      price: "",
      currency: "USD",
      productType: "pdf",
      isFree: false,
      requiresPayment: false,
      paymentInstructions: "",
      imageUrl: "",
      fileUrl: "",
      fileMimeType: "",
    },
  });

  const isFree = form.watch("isFree");
  const requiresPayment = form.watch("requiresPayment");
  const productType = form.watch("productType");
  const currentFileUrl = form.watch("fileUrl");

  // Dialog-level unsaved changes handling
  const { safeClose, ConfirmDialog } = useDialogUnsavedChanges();

  // Fetch products
  const { data: products = [], isLoading: productsLoading, error: productsError } = useQuery<DigitalProduct[]>({
    queryKey: ["/api/dashboard/products"],
  });

  // Fetch payment settings to pre-populate the inline editor
  const { data: paymentSettings, isLoading: paymentSettingsLoading } = useQuery<{ methods: PaymentMethod[] }>({
    queryKey: ["/api/dashboard/payment-settings"],
  });

  useEffect(() => {
    if (paymentSettings?.methods && !paymentMethodsDirty) {
      const merged = mergeWithDefaults(paymentSettings.methods);
      setPaymentMethods(merged);
      setInitialPaymentMethods(merged);
    }
  }, [paymentSettings]);

  // Get product type config
  const getProductTypeConfig = (type: ProductType) => {
    return PRODUCT_TYPES.find(pt => pt.value === type) || PRODUCT_TYPES[0];
  };

  // Handle file upload for digital product files (private storage)
  const handleFileUpload = async (file: File) => {
    const typeConfig = getProductTypeConfig(productType);
    
    // Validate file size
    const maxSizeBytes = typeConfig.maxSize * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      toast({
        title: "File too large",
        description: `Maximum file size for ${typeConfig.label} is ${typeConfig.maxSize}MB`,
        variant: "destructive",
      });
      return;
    }

    // Create a new AbortController for this upload
    const abortController = new AbortController();
    uploadAbortControllerRef.current = abortController;

    setIsUploading(true);
    setUploadProgress(10);

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

      setUploadProgress(20);

      // Upload file to Supabase storage via backend (private bucket for digital products)
      const formData = new FormData();
      formData.append('file', file);
      formData.append('productType', productType);
      // Pass the product title for clean filename naming (if available)
      const currentTitle = form.getValues("title");
      if (currentTitle) {
        formData.append('productTitle', currentTitle);
      }
      
      const uploadResponse = await fetch("/api/dashboard/products/upload-file", {
        method: "POST",
        headers: authHeaders,
        body: formData,
        signal: abortController.signal,
      });

      setUploadProgress(70);

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload file");
      }

      const uploadData = await uploadResponse.json();
      setUploadProgress(90);

      // Set the file URL in the form and clear any prior validation error
      form.setValue("fileUrl", uploadData.fileUrl, { shouldValidate: true });
      form.setValue("fileMimeType", file.type);

      setUploadProgress(100);
      
      toast({
        title: "File uploaded",
        description: "Your file has been uploaded successfully",
      });
    } catch (error) {
      // Don't show error toast if the upload was aborted by user closing the dialog
      if (error instanceof Error && error.name === 'AbortError') {
        console.log("Upload cancelled by user");
        return;
      }
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: "Failed to upload file. Please try again.",
        variant: "destructive",
      });
    } finally {
      uploadAbortControllerRef.current = null;
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // Product mutations
  const createMutation = useMutation({
    mutationFn: async (data: DigitalProductFormData) => {
      const submitData = {
        ...data,
        price: data.isFree ? "0" : data.price,
        tagIds: productTags.map(t => t.id),
      };
      return await apiRequest("POST", "/api/dashboard/products", submitData);
    },
    onSuccess: () => {
      const existingProducts = queryClient.getQueryData<any[]>(["/api/dashboard/products"]) ?? [];
      const is_first = existingProducts.length === 0;
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"], exact: false });
      posthog.capture('digital_product_created', { is_first });
      if (is_first) {
        posthog.setPersonProperties({ first_digital_product_created_at: new Date().toISOString() });
      }
      toast({
        title: "Success",
        description: "Digital product created successfully",
      });
      setIsCreating(false);
      setEditingProduct(null);
      setProductTags([]);
      form.reset({
        title: "",
        description: "",
        thumbnailDescription: "",
        price: "",
        currency: "USD",
        productType: "pdf",
        isFree: false,
        requiresPayment: false,
        paymentInstructions: "",
        imageUrl: "",
        fileUrl: "",
        fileMimeType: "",
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
        description: getApiErrorMessage(error as Error, "Failed to create digital product"),
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: DigitalProductFormData & { id: number }) => {
      const submitData = {
        ...data,
        price: data.isFree ? "0" : data.price,
        tagIds: productTags.map(t => t.id),
      };
      return await apiRequest("PATCH", `/api/dashboard/products/${data.id}`, submitData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"], exact: false });
      toast({
        title: "Success",
        description: "Digital product updated successfully",
      });
      setEditingProduct(null);
      setIsCreating(false);
      setProductTags([]);
      form.reset({
        title: "",
        description: "",
        thumbnailDescription: "",
        price: "",
        currency: "USD",
        productType: "pdf",
        isFree: false,
        requiresPayment: false,
        paymentInstructions: "",
        imageUrl: "",
        fileUrl: "",
        fileMimeType: "",
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
        description: getApiErrorMessage(error as Error, "Failed to update digital product"),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/dashboard/products/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"], exact: false });
      toast({
        title: "Success",
        description: "Digital product deleted successfully",
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
          description: error.message || "Failed to delete product",
          variant: "destructive",
        });
      }
    },
  });

  // Feature product mutation
  const featureMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("POST", `/api/dashboard/products/${id}/feature`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"], exact: false });
      toast({
        title: "Success",
        description: "Featured product updated successfully",
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
        description: error.message || "Failed to update featured product",
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (data: DigitalProductFormData) => {
    // Validate price for paid products
    if (!data.isFree && (!data.price || data.price === "")) {
      form.setError("price", { message: "Price is required for paid products" });
      return;
    }

    // Save payment methods to global settings if requiresPayment is on and methods have changed
    if (data.requiresPayment) {
      const orderedCurrent = paymentMethods.map((m, i) => ({ ...m, order: i }));
      const orderedSaved = mergeWithDefaults(paymentSettings?.methods ?? []).map((m, i) => ({ ...m, order: i }));
      if (JSON.stringify(orderedCurrent) !== JSON.stringify(orderedSaved)) {
        try {
          await apiRequest("PUT", "/api/dashboard/payment-settings", { methods: orderedCurrent });
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard/payment-settings"] });
          setInitialPaymentMethods(paymentMethods);
          setPaymentMethodsDirty(false);
        } catch {
          toast({
            title: "Failed to save payment methods",
            description: "Please review your payment settings and try again.",
            variant: "destructive",
          });
          return;
        }
      }
    }

    if (editingProduct) {
      updateMutation.mutate({ ...data, id: editingProduct.id });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = async (product: DigitalProduct) => {
    setEditingProduct(product);
    const freshMethods = paymentSettings?.methods ? mergeWithDefaults(paymentSettings.methods) : DEFAULT_PAYMENT_METHODS;
    setPaymentMethods(freshMethods);
    setInitialPaymentMethods(freshMethods);
    setPaymentMethodsDirty(false);
    setIsCreating(true);
    form.reset({
      title: product.title,
      description: product.description || "",
      thumbnailDescription: product.thumbnailDescription || "",
      price: product.price,
      currency: (product as any).currency || "USD",
      productType: (product.productType as ProductType) || "pdf",
      isFree: product.isFree || false,
      requiresPayment: product.requiresPayment || false,
      paymentInstructions: product.paymentInstructions || "",
      imageUrl: product.imageUrl || "",
      fileUrl: product.fileUrl || "",
      fileMimeType: product.fileMimeType || "",
    });
    
    // Load product tags
    try {
      const response = await fetch(`/api/digital-products/${product.id}/tags`);
      if (response.ok) {
        const tags = await response.json();
        setProductTags(tags);
      }
    } catch (error) {
      console.error("Error loading product tags:", error);
      setProductTags([]);
    }
  };

  const handleCreate = () => {
    posthog.capture('digital_product_create_form_opened');
    setProductTags([]);
    setEditingProduct(null);
    const freshMethods = paymentSettings?.methods ? mergeWithDefaults(paymentSettings.methods) : DEFAULT_PAYMENT_METHODS;
    setPaymentMethods(freshMethods);
    setInitialPaymentMethods(freshMethods);
    setPaymentMethodsDirty(false);
    form.reset({
      title: "",
      description: "",
      thumbnailDescription: "",
      price: "",
      currency: "USD",
      productType: "pdf",
      isFree: false,
      requiresPayment: false,
      paymentInstructions: "",
      imageUrl: "",
      fileUrl: "",
      fileMimeType: "",
    });
    setIsCreating(true);
  };

  const doCloseDialog = () => {
    // Abort any ongoing file upload
    if (uploadAbortControllerRef.current) {
      uploadAbortControllerRef.current.abort();
      uploadAbortControllerRef.current = null;
    }
    
    // Reset upload state
    setIsUploading(false);
    setUploadProgress(0);
    
    setIsCreating(false);
    setEditingProduct(null);
    setProductTags([]);
    setPaymentMethodsDirty(false);
    form.reset({
      title: "",
      description: "",
      thumbnailDescription: "",
      price: "",
      currency: "USD",
      productType: "pdf",
      isFree: false,
      requiresPayment: false,
      paymentInstructions: "",
      imageUrl: "",
      fileUrl: "",
      fileMimeType: "",
    });
  };

  const paymentMethodsChanged = JSON.stringify(paymentMethods) !== JSON.stringify(initialPaymentMethods);

  const handleCancel = () => {
    safeClose(form.formState.isDirty || paymentMethodsChanged, doCloseDialog);
  };

  const getProductTypeIcon = (type: string | undefined) => {
    const config = PRODUCT_TYPES.find(pt => pt.value === type);
    if (config) {
      const IconComponent = config.icon;
      return <IconComponent className="w-4 h-4" />;
    }
    return <Package className="w-4 h-4" />;
  };

  const getProductTypeLabel = (type: string | undefined) => {
    return PRODUCT_TYPES.find(pt => pt.value === type)?.label || "Unknown";
  };

  // Handle authentication errors
  if (productsError && isUnauthorizedError(productsError as Error)) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <Package className="mx-auto h-12 w-12 text-yellow-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">Authentication Required</h3>
            <p className="mt-2 text-sm text-gray-500">
              You need to be logged in to manage your digital products.
            </p>
            <Button
              className="mt-4"
              onClick={() => window.location.href = '/api/login'}
              data-testid="button-login"
            >
              Login
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (productsLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Digital Products</h2>
        <p className="text-gray-600">Create and manage your digital products and downloads</p>
      </div>

      {/* Product Creation/Editing Form Modal */}
      <Dialog open={isCreating} onOpenChange={(open) => !open && handleCancel()}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[85vh] p-0 flex flex-col gap-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
            <DialogTitle>{editingProduct ? "Edit Product" : "Create New Digital Product"}</DialogTitle>
            <DialogDescription>
              {editingProduct ? "Update your digital product" : "Create a new digital product for your profile"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
          <div className="px-6 pb-6 pt-4">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {/* Product Type Selector */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Product Type</Label>
                  <div className="grid grid-cols-3 gap-3">
                    {PRODUCT_TYPES.map((type) => {
                      const IconComponent = type.icon;
                      const isSelected = productType === type.value;
                      return (
                        <button
                          key={type.value}
                          type="button"
                          onClick={() => {
                            form.setValue("productType", type.value);
                            // Clear file if changing type
                            if (currentFileUrl) {
                              form.setValue("fileUrl", "");
                              form.setValue("fileMimeType", "");
                            }
                          }}
                          className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all ${
                            isSelected
                              ? "border-primary bg-primary/5"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
                          data-testid={`button-type-${type.value}`}
                        >
                          <IconComponent className={`w-6 h-6 mb-2 ${isSelected ? "text-primary" : "text-gray-500"}`} />
                          <span className={`text-sm font-medium ${isSelected ? "text-primary" : "text-gray-700"}`}>
                            {type.label}
                          </span>
                          <span className="text-xs text-gray-400 mt-1">Max {type.maxSize}MB</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Product Title</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="E-book: Complete Guide to..." 
                            {...field} 
                            data-testid="input-title"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {/* Free/Paid Toggle and Price */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="isFree">Free Product</Label>
                      <Switch
                        id="isFree"
                        checked={isFree}
                        onCheckedChange={(checked) => form.setValue("isFree", checked)}
                        data-testid="switch-free"
                      />
                    </div>
                    {!isFree && (
                      <div className="grid grid-cols-2 gap-3">
                        <FormField
                          control={form.control}
                          name="price"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Price</FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="29.99" 
                                  {...field} 
                                  data-testid="input-price"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="currency"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Currency</FormLabel>
                              <Select
                                value={field.value}
                                onValueChange={field.onChange}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select currency" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {SUPPORTED_CURRENCIES.map((currency) => (
                                    <SelectItem key={currency.code} value={currency.code}>
                                      {currency.symbol} {currency.code}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    )}
                    {isFree && (
                      <p className="text-sm text-green-600 flex items-center gap-1">
                        <Check className="w-4 h-4" />
                        This product will be free for everyone
                      </p>
                    )}
                  </div>
                </div>

                {/* Manual payment toggle (only for paid products) */}
                {!isFree && (
                  <div className="space-y-3 border rounded-lg p-4 bg-amber-50/50">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="requiresPayment" className="font-medium">Manual Payment Verification</Label>
                        <p className="text-xs text-gray-500 mt-0.5">Buyers submit a request; you verify payment and send the download link</p>
                      </div>
                      <Switch
                        id="requiresPayment"
                        checked={requiresPayment}
                        onCheckedChange={(checked) => form.setValue("requiresPayment", checked, { shouldDirty: true })}
                        data-testid="switch-requires-payment"
                      />
                    </div>
                    {requiresPayment && (
                      <div className="space-y-4 pt-1">
                        <div>
                          <p className="text-sm font-medium mb-1">Payment Methods</p>
                          <p className="text-xs text-muted-foreground mb-3">
                            Enable the methods buyers can use to pay. Changes are saved to your global payment settings.
                          </p>
                          <InlinePaymentMethodsEditor
                            methods={paymentMethods}
                            onChange={(m) => { setPaymentMethods(m); setPaymentMethodsDirty(true); }}
                            isLoading={paymentSettingsLoading}
                            showDisclaimer={false}
                            onUploadQr={uploadQrImage}
                          />
                        </div>
                        <FormField
                          control={form.control}
                          name="paymentInstructions"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Additional Instructions (optional)</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Any extra payment notes shown to the buyer after purchase…"
                                  rows={2}
                                  {...field}
                                  data-testid="textarea-payment-instructions"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    )}
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="thumbnailDescription"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Thumbnail Description <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Short description shown on product cards..."
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
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Optional)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Describe what customers will get with this product..."
                          rows={4}
                          {...field} 
                          data-testid="input-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Product Image Upload */}
                <ImageUpload
                  value={form.watch("imageUrl")}
                  onChange={(url) => form.setValue("imageUrl", url)}
                  placeholder="Upload product cover image"
                />

                {/* Product File Upload */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium text-gray-700">
                    Product File ({getProductTypeConfig(productType).label})
                  </Label>
                  
                  {currentFileUrl ? (
                    <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center gap-3">
                        {getProductTypeIcon(productType)}
                        <div>
                          <p className="text-sm font-medium text-green-800">File uploaded successfully</p>
                          <p className="text-xs text-green-600">Ready for download after purchase</p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          form.setValue("fileUrl", "");
                          form.setValue("fileMimeType", "");
                        }}
                        data-testid="button-remove-file"
                      >
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <div
                      className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                        isUploading
                          ? "border-primary bg-primary/5"
                          : form.formState.errors.fileUrl
                          ? "border-destructive bg-destructive/5"
                          : "border-gray-300 hover:border-gray-400"
                      }`}
                    >
                      {isUploading ? (
                        <div className="space-y-3">
                          <Loader2 className="w-8 h-8 mx-auto text-primary animate-spin" />
                          <p className="text-sm text-gray-600">Uploading... {uploadProgress}%</p>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-primary h-2 rounded-full transition-all"
                              style={{ width: `${uploadProgress}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <>
                          <Upload className="w-8 h-8 mx-auto text-gray-400 mb-3" />
                          <p className="text-sm text-gray-600 mb-2">
                            Drop your {getProductTypeConfig(productType).label.toLowerCase()} here or click to browse
                          </p>
                          <p className="text-xs text-gray-400 mb-4">
                            Maximum file size: {getProductTypeConfig(productType).maxSize}MB
                          </p>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept={getProductTypeConfig(productType).accept}
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleFileUpload(file);
                            }}
                            data-testid="input-file"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => fileInputRef.current?.click()}
                            data-testid="button-upload-file"
                          >
                            <Upload className="w-4 h-4 mr-2" />
                            Select File
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                  {form.formState.errors.fileUrl && (
                    <p className="text-sm font-medium text-destructive" data-testid="error-file-required">
                      {form.formState.errors.fileUrl.message}
                    </p>
                  )}
                </div>

                {/* Tags Section */}
                <div className="space-y-2">
                  <Label>Tags</Label>
                  <TagManager
                    entityType="digital-product"
                    entityId={editingProduct?.id}
                    selectedTags={productTags}
                    onTagsChange={setProductTags}
                    maxTags={10}
                    allowCreate={true}
                    showSuggestions={true}
                  />
                  <p className="text-sm text-muted-foreground">
                    Add tags to help users find your product when searching
                  </p>
                </div>

                <div className="flex gap-3 pt-4 border-t">
                  <Button 
                    type="submit" 
                    disabled={createMutation.isPending || updateMutation.isPending || isUploading}
                    data-testid="button-submit"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {editingProduct ? "Update Product" : "Create Product"}
                  </Button>
                  <Button type="button" variant="outline" onClick={handleCancel} data-testid="button-cancel">
                    Cancel
                  </Button>
                </div>
              </form>
            </Form>
          </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Products List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Your Digital Products</CardTitle>
              <CardDescription>Manage your digital products and downloads</CardDescription>
            </div>
            <Button onClick={handleCreate} data-testid="button-new-product">
              <Plus className="w-4 h-4 mr-2" />
              New Product
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {products.length === 0 ? (
            <div className="text-center py-8">
              <Package className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-4 text-lg font-medium text-gray-900">No products yet</h3>
              <p className="mt-2 text-sm text-gray-500">
                Create your first digital product to start selling online.
              </p>
              <Button 
                className="mt-4" 
                onClick={handleCreate}
                data-testid="button-create-first-product"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Product
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {products.map((product) => (
                <div
                  key={product.id}
                  className="flex flex-col lg:flex-row lg:items-center justify-between p-4 border rounded-lg space-y-3 lg:space-y-0"
                  data-testid={`card-product-${product.id}`}
                >
                  <div className="flex-1 flex items-start space-x-4">
                    {product.imageUrl && (
                      <img 
                        src={product.imageUrl} 
                        alt={product.title}
                        className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-medium text-gray-900 truncate">{product.title}</h4>
                        {(product as any).isFeatured && (
                          <Badge className="bg-primary text-white" data-testid={`badge-featured-${product.id}`}>
                            Featured
                          </Badge>
                        )}
                        {/* Product Type Badge */}
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                          {getProductTypeIcon(product.productType)}
                          {getProductTypeLabel(product.productType)}
                        </span>
                        {/* Free/Paid Badge */}
                        {product.isFree ? (
                          <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">
                            FREE
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700">
                            {formatPrice(product.price, (product as any).currency || "USD")}
                          </span>
                        )}
                      </div>
                      {product.description && (
                        <p className="text-sm text-gray-600 mt-1 line-clamp-2">{product.description}</p>
                      )}
                      <div className="flex items-center gap-4 text-sm text-gray-500 mt-2">
                        <span className="flex items-center gap-1">
                          <Eye className="w-4 h-4" />
                          {product.isActive ? "Active" : "Inactive"}
                        </span>
                        {product.fileUrl && (
                          <span className="flex items-center gap-1 text-green-600">
                            <Download className="w-4 h-4" />
                            File Ready
                          </span>
                        )}
                        <span className="text-xs">
                          Created {format(new Date(product.createdAt), "MMM dd, yyyy")}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {!(product as any).isFeatured && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => featureMutation.mutate(product.id)}
                        disabled={featureMutation.isPending}
                        data-testid={`button-feature-${product.id}`}
                      >
                        <Star className="w-4 h-4 mr-1" />
                        Set as Featured
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(product)}
                      data-testid={`button-edit-${product.id}`}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeleteId(product.id)}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-delete-${product.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
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
        description="This product will be permanently deleted. This action cannot be undone."
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}
