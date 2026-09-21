import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { posthog } from "@/lib/posthog";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { apiRequest } from "@/lib/queryClient";
import { Phone, Mail, MapPin, Clock, Save, Link as LinkIcon, Plus, Trash2, QrCode, Download, MessageCircle, Globe } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Facebook, Twitter, Instagram, Linkedin, Youtube } from "lucide-react";
import QRCode from "qrcode";
import { LocationPicker } from "./location-picker";
import { LocationVisibility } from "./location-visibility";
import type { Location } from "@shared/schema";

// Presence equals visibility on the public profile: any non-empty value here
// is shown publicly. There are no per-field show/hide toggles anymore.
const contactFormSchema = z.object({
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  whatsappSameAsPhone: z.boolean().default(false),
  email: z.string().email().optional().or(z.literal("")),
  website: z.string().url().optional().or(z.literal("")),
  locationId: z.number().nullable().optional(),
  showExactLocation: z.boolean().default(true),
  showLocationName: z.boolean().default(true),
  showStreetAddress: z.boolean().default(false),
  showMapLocation: z.boolean().default(false),
  contactLinks: z.array(z.object({
    title: z.string().min(1, "Title is required"),
    url: z.string().url("Valid URL is required"),
    type: z.enum(['website', 'social', 'other']),
  })).optional(),
  socialMediaLinks: z.array(z.object({
    platform: z.enum(['facebook', 'twitter', 'instagram', 'linkedin', 'youtube', 'tiktok', 'snapchat', 'pinterest']),
    url: z.string().url("Valid URL is required"),
  })).optional(),
});

type ContactFormData = z.infer<typeof contactFormSchema>;

export function ContactManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [qrCodeData, setQrCodeData] = useState<string>("");

  const { data: profile, isLoading } = useQuery({
    queryKey: ["/api/dashboard/profile"],
  }) as { data: any, isLoading: boolean };

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
  });

  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);

  const form = useForm<ContactFormData>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      phone: "",
      whatsapp: "",
      whatsappSameAsPhone: false,
      email: "",
      website: "",
      locationId: null,
      showExactLocation: true,
      showLocationName: true,
      showStreetAddress: false,
      showMapLocation: false,
      contactLinks: [],
      socialMediaLinks: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "contactLinks"
  });

  const { fields: socialFields, append: appendSocial, remove: removeSocial } = useFieldArray({
    control: form.control,
    name: "socialMediaLinks"
  });

  // Create save callback for the unsaved changes guard.
  // We no longer write per-field show* visibility flags — presence of the
  // value alone determines whether it appears on the public profile, so we
  // trim each value to make sure whitespace-only inputs don't render as a
  // "visible" contact method.
  const saveContactCallback = useCallback(async () => {
    const data = form.getValues();
    const contactInfo = {
      phone: data.phone?.trim() || "",
      whatsapp: data.whatsapp?.trim() || "",
      email: data.email?.trim() || "",
      website: data.website?.trim() || "",
      locationId: data.locationId,
      showExactLocation: data.showExactLocation,
      showLocationName: data.showLocationName,
      showStreetAddress: data.showStreetAddress,
      showMapLocation: data.showMapLocation,
      contactLinks: data.contactLinks || [],
      socialMediaLinks: data.socialMediaLinks || [],
    };
    await apiRequest("POST", "/api/dashboard/contact", { contactInfo });
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard/profile"] });
    queryClient.invalidateQueries({ queryKey: ["/api/profiles"], exact: false });
  }, [form, queryClient]);

  // Register form with global unsaved changes guard
  useUnsavedChanges("contact-form", form.formState.isDirty, saveContactCallback);

  // Update form when profile data loads
  useEffect(() => {
    if (profile?.contactInfo) {
      const contact = profile?.contactInfo;
      form.reset({
        phone: contact.phone || contact.callToAction?.callNumber || "",
        whatsapp: contact.whatsapp || contact.callToAction?.whatsAppNumber || "",
        email: contact.email || contact.callToAction?.emailAddress || "",
        website: contact.website || "",
        locationId: contact.locationId || null,
        showExactLocation: contact.showExactLocation ?? true,
        showLocationName: contact.showLocationName ?? true,
        showStreetAddress: contact.showStreetAddress ?? false,
        showMapLocation: contact.showMapLocation ?? false,
        contactLinks: contact.contactLinks || [],
        socialMediaLinks: contact.socialMediaLinks || [],
      });
      // Set selected location from profile data
      if (contact.locationId && locations.length > 0) {
        const profileLocation = locations.find(l => l.id === contact.locationId);
        if (profileLocation) {
          setSelectedLocation(profileLocation);
        }
      }
    }
  }, [profile, form, locations]);

  // Auto-generate QR code when profile loads
  useEffect(() => {
    if (profile && profile.username) {
      generateQRCode();
    }
  }, [profile]);

  // Sync WhatsApp with phone when "same as phone" is checked
  const phoneValue = form.watch("phone");
  const whatsappSameAsPhone = form.watch("whatsappSameAsPhone");
  
  useEffect(() => {
    if (whatsappSameAsPhone) {
      if (phoneValue?.trim()) {
        form.setValue("whatsapp", phoneValue, { shouldDirty: true });
      } else {
        // Uncheck if phone becomes empty
        form.setValue("whatsappSameAsPhone", false, { shouldDirty: true });
      }
    }
  }, [phoneValue, whatsappSameAsPhone, form]);

  const mutation = useMutation({
    mutationFn: async (data: ContactFormData) => {
      // Presence equals visibility: any non-empty value will appear publicly,
      // so we no longer write per-field show* flags here. Trim values so a
      // whitespace-only entry is treated as empty and stays hidden.
      const contactInfo = {
        phone: data.phone?.trim() || "",
        whatsapp: data.whatsapp?.trim() || "",
        email: data.email?.trim() || "",
        website: data.website?.trim() || "",
        locationId: data.locationId,
        showExactLocation: data.showExactLocation,
        showLocationName: data.showLocationName,
        showStreetAddress: data.showStreetAddress,
        showMapLocation: data.showMapLocation,
        contactLinks: data.contactLinks || [],
        socialMediaLinks: data.socialMediaLinks || [],
      };

      await apiRequest("POST", "/api/dashboard/contact", { contactInfo });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"], exact: false });
      posthog.capture('profile_contact_saved');
      posthog.setPersonProperties({ profile_has_contact: true });
      toast({
        title: "Contact information saved",
        description: "Your contact details have been updated successfully.",
      });
    },
    onError: (error: any) => {
      console.error("Contact form submission error:", error);
      toast({
        title: "Error",
        description: `Failed to save contact information: ${error.message || "Please try again."}`,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ContactFormData) => {
    console.log("Contact form submission data:", JSON.stringify(data, null, 2));
    mutation.mutate(data);
  };

  const generateQRCode = async () => {
    if (!profile) return;

    const profileUrl = `${window.location.origin}/${profile?.username}`;

    try {
      const qrCodeDataUrl = await QRCode.toDataURL(profileUrl, {
        width: 256,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
      });
      setQrCodeData(qrCodeDataUrl);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate QR code",
        variant: "destructive",
      });
    }
  };

  const downloadQRCode = () => {
    if (!qrCodeData) return;

    const link = document.createElement("a");
    link.download = `${profile?.username}-qr-code.png`;
    link.href = qrCodeData;
    link.click();
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
        <h2 className="text-2xl font-bold text-gray-900">Contact Card</h2>
        <p className="text-gray-600">Manage your contact details that appear on your profile page</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Contact Information Card - Combined Basic Contact with Call to Action */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Phone className="w-5 h-5 mr-2" />
                Basic Contact
              </CardTitle>
              <CardDescription>
                Enter your contact details to display them on your profile with call-to-action buttons
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Phone */}
              <div className="space-y-3 p-4 border rounded-lg bg-gray-50 dark:bg-gray-900">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">Phone Number</span>
                </div>
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input placeholder="+1 (555) 123-4567" {...field} data-testid="input-phone" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {form.watch("phone") && (
                  <p className="text-xs text-muted-foreground">
                    Visitors can click to call this number directly from your profile
                  </p>
                )}
              </div>

              {/* WhatsApp */}
              <div className="space-y-3 p-4 border rounded-lg bg-gray-50 dark:bg-gray-900">
                <div className="flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-green-600" />
                  <span className="font-medium">WhatsApp Number</span>
                </div>
                {/* Same as phone checkbox */}
                <FormField
                  control={form.control}
                  name="whatsappSameAsPhone"
                  render={({ field }) => (
                    <FormItem className="flex items-center space-x-2 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(checked) => {
                            const isChecked = checked === true;
                            field.onChange(isChecked);
                            if (isChecked) {
                              const phoneValue = form.getValues("phone");
                              if (phoneValue) {
                                form.setValue("whatsapp", phoneValue, { shouldDirty: true });
                              }
                            }
                          }}
                          disabled={!form.watch("phone")?.trim()}
                          data-testid="checkbox-whatsapp-same-as-phone"
                        />
                      </FormControl>
                      <FormLabel className={`text-sm cursor-pointer ${!form.watch("phone")?.trim() ? 'text-muted-foreground/50' : 'text-muted-foreground'}`}>
                        Same as phone number
                      </FormLabel>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="whatsapp"
                  render={({ field }) => {
                    const isSameAsPhone = form.watch("whatsappSameAsPhone");
                    const phoneValue = form.watch("phone");
                    return (
                      <FormItem>
                        <FormControl>
                          <Input 
                            placeholder="+1 (555) 123-4567" 
                            {...field} 
                            value={isSameAsPhone ? (phoneValue || "") : field.value}
                            disabled={isSameAsPhone}
                            className={isSameAsPhone ? "bg-gray-100 dark:bg-gray-800" : ""}
                            data-testid="input-whatsapp" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
                {form.watch("whatsapp") && (
                  <p className="text-xs text-muted-foreground">
                    Visitors can click to open a WhatsApp chat with you
                  </p>
                )}
              </div>

              {/* Email */}
              <div className="space-y-3 p-4 border rounded-lg bg-gray-50 dark:bg-gray-900">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">Email Address</span>
                </div>
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input placeholder="contact@example.com" type="email" {...field} data-testid="input-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {form.watch("email") && (
                  <p className="text-xs text-muted-foreground">
                    Visitors can click to send you an email
                  </p>
                )}
              </div>

              {/* Website */}
              <div className="space-y-3 p-4 border rounded-lg bg-gray-50 dark:bg-gray-900">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">Website</span>
                </div>
                <FormField
                  control={form.control}
                  name="website"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input placeholder="https://yourwebsite.com" type="url" {...field} data-testid="input-website" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {form.watch("website") && (
                  <p className="text-xs text-muted-foreground">
                    Visitors can click to visit your website in a new tab
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Location Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <MapPin className="w-5 h-5 mr-2" />
                Location
              </CardTitle>
              <CardDescription>
                Select from your saved locations or add a new one
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <LocationPicker
                selectedLocationId={form.watch("locationId")}
                onSelect={(location) => {
                  setSelectedLocation(location);
                  form.setValue("locationId", location?.id || null, { shouldDirty: true });
                }}
                label="Select Location"
              />
              
              {(form.watch("locationId") || selectedLocation) && (
                <LocationVisibility
                  showLocationName={form.watch("showLocationName") ?? true}
                  showStreetAddress={form.watch("showStreetAddress") ?? false}
                  showMapLocation={form.watch("showMapLocation") ?? false}
                  onSettingsChange={(settings) => {
                    form.setValue("showLocationName", settings.showLocationName, { shouldDirty: true });
                    form.setValue("showStreetAddress", settings.showStreetAddress, { shouldDirty: true });
                    form.setValue("showMapLocation", settings.showMapLocation, { shouldDirty: true });
                  }}
                  location={selectedLocation || locations.find(l => l.id === form.watch("locationId"))}
                  className="mt-4"
                />
              )}
            </CardContent>
          </Card>

          {/* Contact Links */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <LinkIcon className="w-5 h-5 mr-2" />
                Contact Links
              </CardTitle>
              <CardDescription>
                Add website and social media links that will appear in your contact section
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {fields.map((field, index) => (
                <div key={field.id} className="flex gap-2 items-end border rounded-lg p-4 bg-gray-50">
                  <FormField
                    control={form.control}
                    name={`contactLinks.${index}.title`}
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormLabel>Title</FormLabel>
                        <FormControl>
                          <Input placeholder="Website" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`contactLinks.${index}.url`}
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormLabel>URL</FormLabel>
                        <FormControl>
                          <Input placeholder="https://example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`contactLinks.${index}.type`}
                    render={({ field }) => (
                      <FormItem className="w-32">
                        <FormLabel>Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="website">Website</SelectItem>
                            <SelectItem value="social">Social</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => remove(index)}
                    className="mb-2"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              
              <Button
                type="button"
                variant="outline"
                onClick={() => append({ title: "", url: "", type: "website" as const })}
                className="w-full"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Contact Link
              </Button>
            </CardContent>
          </Card>

          {/* Social Media Links */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Facebook className="w-5 h-5 mr-2" />
                Social Media
              </CardTitle>
              <CardDescription>
                Add your social media profiles that will appear as icons in your contact card
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {socialFields.map((field, index) => (
                <div key={field.id} className="flex gap-2 items-end border rounded-lg p-4 bg-gray-50">
                  <FormField
                    control={form.control}
                    name={`socialMediaLinks.${index}.platform`}
                    render={({ field }) => (
                      <FormItem className="w-22">
                        <FormLabel>Platform</FormLabel>
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
                      <FormItem className="flex-1">
                        <FormLabel>Profile URL</FormLabel>
                        <FormControl>
                          <Input placeholder="https://facebook.com/yourpage" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => removeSocial(index)}
                    className="mb-2"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              
              <Button
                type="button"
                variant="outline"
                onClick={() => appendSocial({ platform: "facebook" as const, url: "" })}
                className="w-full"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Social Media Link
              </Button>
            </CardContent>
          </Card>


          {/* QR Code */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <QrCode className="w-5 h-5 mr-2" />
                QR Code
              </CardTitle>
              <CardDescription>
                QR code for your profile link - automatically generated and ready to download
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {qrCodeData ? (
                <div className="flex flex-col items-center space-y-4 p-4 bg-gray-50 rounded-lg">
                  <img 
                    src={qrCodeData} 
                    alt="Profile QR Code" 
                    className="w-48 h-48 border border-gray-200 rounded shadow-sm"
                  />
                  <Button
                    type="button"
                    onClick={downloadQRCode}
                    className="flex items-center space-x-2"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download QR Code</span>
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center space-y-4 p-8 bg-gray-50 rounded-lg">
                  <QrCode className="w-12 h-12 text-gray-400" />
                  <p className="text-gray-600 text-center">QR code is generating...</p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={generateQRCode}
                    className="flex items-center space-x-2"
                  >
                    <QrCode className="w-4 h-4" />
                    <span>Generate QR Code</span>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Button 
            type="submit" 
            className="w-full" 
            disabled={mutation.isPending}
          >
            <Save className="w-4 h-4 mr-2" />
            {mutation.isPending ? "Saving..." : "Save Contact Card"}
          </Button>
        </form>
      </Form>
    </div>
  );
}