import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { posthog } from "@/lib/posthog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useDialogUnsavedChanges } from "@/hooks/use-dialog-unsaved-changes";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { FEATURED_DESKTOP_ASPECT } from "@/lib/cropConstants";
import { 
  Plus, 
  Calendar, 
  Clock, 
  Users, 
  MapPin, 
  Edit, 
  Trash2, 
  BarChart3, 
  X, 
  Save,
  DollarSign,
  Star,
  Globe,
  Repeat,
  QrCode,
  AlertTriangle,
} from "lucide-react";
import { ImageUpload } from "@/components/image-upload";
import { EventMediaUpload, type MediaItem } from "@/components/event-media-upload";
import { EventRegistrations } from "@/components/event-registrations";
import { LocationPicker } from "@/components/location-picker";
import { LocationVisibility } from "@/components/location-visibility";
import { TagManager, type Tag } from "@/components/tag-manager";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import {
  InlinePaymentMethodsEditor,
  type PaymentMethod,
  mergeWithDefaults,
  DEFAULT_PAYMENT_METHODS,
} from "@/components/inline-payment-methods-editor";
import { uploadQrImage } from "@/lib/qr-upload";
import { EventQrDialog } from "@/components/event-qr-dialog";
import type { Event, EventWithExtras, Location } from "@shared/schema";
import { SUPPORTED_CURRENCIES, formatPrice } from "@shared/currencies";
import { TIMEZONE_GROUPS, getBrowserTimezone, getTimezoneFromCoordinates, dateTimeToUTC, getDatePartsInTimezone } from "@/lib/timezone-utils";

const eventFormSchema = z.object({
  title: z.string().min(1, "Title is required").max(100, "Title must be less than 100 characters"),
  description: z.string().optional(),
  thumbnailDescription: z.string().min(1, "Thumbnail description is required").max(140, "Thumbnail description must be 140 characters or less"),
  date: z.string().min(1, "Event date is required"),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  isOnline: z.boolean().default(true),
  isOffline: z.boolean().default(false),
  location: z.string().optional(),
  locationId: z.number().nullable().optional(),
  showLocationName: z.boolean().default(true),
  showStreetAddress: z.boolean().default(false),
  showMapLocation: z.boolean().default(false),
  timezone: z.string().optional(),
  maxAttendees: z.number().min(1, "Must allow at least 1 attendee").optional(),
  pricingType: z.enum(["free", "donation", "paid"]).default("paid"),
  donationNote: z.string().optional(),
  price: z.string().min(0, "Price cannot be negative"),
  currency: z.string().default("USD"),
  featuredImage: z.string().optional(),
  mediaItems: z.array(z.object({
    type: z.enum(['image', 'video']),
    url: z.string(),
    alt: z.string().optional(),
  })).optional(),
  requiresPayment: z.boolean().default(false),
  paymentInstructions: z.string().optional(),
  meetingLink: z.string().optional(),
  qrCodeUrl: z.string().optional(),
  isRecurring: z.boolean().default(false),
  patternType: z.enum(["weekly", "biweekly", "monthly_nth", "monthly_date", "custom"]).default("weekly"),
  recurrenceDays: z.array(z.number()).default([]),
  isIndefinite: z.boolean().default(true),
  recurrenceEndDate: z.string().default(""),
  monthlyNth: z.number().min(1).max(5).default(1),
  monthlyWeekday: z.number().min(0).max(6).default(1),
  monthlyDate: z.number().min(1).max(31).default(1),
  customDates: z.array(z.string()).default([]),
}).refine((data) => {
  if (data.isOffline && !data.location) return false;
  return true;
}, {
  message: "Location name is required for offline events",
  path: ["location"],
}).refine((data) => {
  if (data.isRecurring && (data.patternType === 'weekly' || data.patternType === 'biweekly') && data.recurrenceDays.length === 0) return false;
  return true;
}, {
  message: "Select at least one weekday for recurring events",
  path: ["recurrenceDays"],
}).refine((data) => {
  if (data.isRecurring && data.patternType === 'custom' && data.customDates.length === 0) return false;
  return true;
}, {
  message: "Add at least one date for custom recurring events",
  path: ["customDates"],
});

type EventFormValues = z.infer<typeof eventFormSchema>;

const WEEKDAYS = [
  { label: "Sun", value: 0 },
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 },
];

const DURATION_OPTIONS = [
  { label: "1 Month", value: "1month" },
  { label: "2 Months", value: "2months" },
  { label: "3 Months", value: "3months" },
  { label: "6 Months", value: "6months" },
];

interface EventsManagementProps {
  highlightEventId?: number | null;
  highlightRegistrationId?: number | null;
  highlightVersion?: number;
  username?: string;
}

export function EventsManagement({ highlightEventId, highlightRegistrationId, highlightVersion, username }: EventsManagementProps = {}) {
  const [qrEvent, setQrEvent] = useState<EventWithExtras | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventWithExtras | null>(null);
  const [viewingRegistrations, setViewingRegistrations] = useState<{ eventId: number; eventTitle: string } | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [eventTags, setEventTags] = useState<Tag[]>([]);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleteScopeEventId, setDeleteScopeEventId] = useState<number | null>(null);
  const [selectedDeleteScope, setSelectedDeleteScope] = useState<"this" | "this_future" | "all">("this");
  const [editScopePending, setEditScopePending] = useState<{ eventData: EventFormValues; eventId: number } | null>(null);
  const [selectedEditScope, setSelectedEditScope] = useState<"this" | "this_future" | "all">("this");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(DEFAULT_PAYMENT_METHODS);
  const [initialPaymentMethods, setInitialPaymentMethods] = useState<PaymentMethod[]>(DEFAULT_PAYMENT_METHODS);
  const [paymentMethodsDirty, setPaymentMethodsDirty] = useState(false);

  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      title: "",
      description: "",
      thumbnailDescription: "",
      date: "",
      startTime: "",
      endTime: "",
      isOnline: true,
      isOffline: false,
      location: "",
      locationId: null,
      showLocationName: true,
      showStreetAddress: false,
      showMapLocation: false,
      maxAttendees: undefined,
      pricingType: "paid",
      donationNote: "",
      price: "",
      currency: "USD",
      featuredImage: "",
      mediaItems: [],
      requiresPayment: false,
      paymentInstructions: "",
      meetingLink: "",
      qrCodeUrl: "",
      isRecurring: false,
      patternType: "weekly",
      recurrenceDays: [],
      isIndefinite: true,
      recurrenceEndDate: "",
      monthlyNth: 1,
      monthlyWeekday: 1,
      monthlyDate: 1,
      customDates: [],
    },
  });

  const pricingType = form.watch("pricingType");
  const isRecurring = form.watch("isRecurring");
  const patternType = form.watch("patternType");
  const isIndefinite = form.watch("isIndefinite");
  const customDates = form.watch("customDates");
  const watchedDate = form.watch("date");

  // Auto-derive anchor weekday from start date when recurring is on
  useEffect(() => {
    if (!isRecurring || !watchedDate) return;
    const parts = watchedDate.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return;
    const weekday = new Date(parts[0], parts[1] - 1, parts[2]).getDay();
    const current = form.getValues("recurrenceDays");
    if (!current.includes(weekday)) {
      form.setValue("recurrenceDays", [...current, weekday]);
    }
  }, [watchedDate, isRecurring]);

  const anchorWeekday = (() => {
    if (!isRecurring || !watchedDate) return null;
    const parts = watchedDate.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]).getDay();
  })();

  // Dialog-level unsaved changes handling
  const { safeClose, ConfirmDialog } = useDialogUnsavedChanges();

  // Fetch events. Cache for 5 min and keep showing previous data while
  // refetching so switching back into the Events tab feels instant.
  const { data: events = [], isLoading } = useQuery<EventWithExtras[]>({
    queryKey: ["/api/dashboard/events"],
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

  // Fetch payment settings to pre-populate the inline editor
  const { data: paymentSettings, isLoading: paymentSettingsLoading } = useQuery<{ methods: PaymentMethod[] }>({
    queryKey: ["/api/dashboard/payment-settings"],
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    if (paymentSettings?.methods && !paymentMethodsDirty) {
      const merged = mergeWithDefaults(paymentSettings.methods);
      setPaymentMethods(merged);
      setInitialPaymentMethods(merged);
    }
  }, [paymentSettings]);

  // Auto-open registrations dialog when navigating from a notification.
  // Tracks eventId+version so:
  //   - query refetches don't reopen a dialog the coach already closed
  //   - clicking the same event notification again after closing does reopen
  const lastAutoOpenedRef = useRef<{ eventId: number; version: number } | null>(null);
  const paymentMethodsSectionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!highlightEventId || highlightVersion == null || events.length === 0) return;
    const prev = lastAutoOpenedRef.current;
    if (prev?.eventId === highlightEventId && prev?.version === highlightVersion) return;
    const event = events.find((e) => e.id === highlightEventId);
    if (event) {
      lastAutoOpenedRef.current = { eventId: highlightEventId, version: highlightVersion };
      setViewingRegistrations({ eventId: event.id, eventTitle: event.title });
    }
  }, [highlightEventId, highlightVersion, events]);

  const EMPTY_FORM_VALUES = {
    title: "",
    description: "",
    thumbnailDescription: "",
    date: "",
    startTime: "",
    endTime: "",
    isOnline: true,
    isOffline: false,
    location: "",
    locationId: null as number | null,
    showLocationName: true,
    showStreetAddress: false,
    showMapLocation: false,
    timezone: getBrowserTimezone(),
    maxAttendees: undefined as number | undefined,
    pricingType: "paid" as "free" | "donation" | "paid",
    donationNote: "",
    price: "",
    currency: "USD",
    featuredImage: "",
    mediaItems: [] as { type: "image" | "video"; url: string; alt?: string }[],
    isRecurring: false,
    patternType: "weekly" as const,
    recurrenceDays: [] as number[],
    isIndefinite: true,
    recurrenceEndDate: "",
    monthlyNth: 1,
    monthlyWeekday: 1,
    monthlyDate: 1,
    customDates: [] as string[],
    requiresPayment: false,
    paymentInstructions: "",
    meetingLink: "",
    qrCodeUrl: "",
  };

  function buildEventPayload(eventData: EventFormValues) {
    const { isRecurring, patternType, recurrenceDays, isIndefinite, recurrenceEndDate, monthlyNth, monthlyWeekday, monthlyDate, customDates, isOnline, isOffline, date, startTime, endTime, showLocationName, showStreetAddress, showMapLocation, pricingType, donationNote, ...rest } = eventData;

    // Derive mode from isOnline/isOffline
    const mode = isOnline && isOffline ? 'hybrid' : isOffline ? 'offline' : 'online';

    // Build startAt / endAt as true UTC ISO strings anchored to the creator's chosen timezone.
    // Sending naive `YYYY-MM-DDTHH:mm:ss` strings would let the server parse them as its own
    // local time (UTC in production), shifting the saved instant by the creator's UTC offset.
    const dateStr = date; // YYYY-MM-DD
    const tz = (rest as { timezone?: string }).timezone || getBrowserTimezone();
    const startTimeForUTC = startTime || "00:00";
    const startAt = dateStr ? dateTimeToUTC(dateStr, startTimeForUTC, tz).toISOString() : null;
    const endAt = (dateStr && endTime) ? dateTimeToUTC(dateStr, endTime, tz).toISOString() : null;

    // Build locationVisibility JSONB
    const locationVisibility = { showLocationName, showStreetAddress, showMapLocation };

    // Build canonical recurringPattern
    let recurringPattern: EventWithExtras['seriesPattern'] = null;
    if (isRecurring) {
      const endDate = (!isIndefinite && recurrenceEndDate) ? recurrenceEndDate : null;
      if (patternType === 'weekly') {
        recurringPattern = { type: 'weekly', weekdays: recurrenceDays, intervalWeeks: 1, startDate: dateStr, endDate };
      } else if (patternType === 'biweekly') {
        recurringPattern = { type: 'weekly', weekdays: recurrenceDays, intervalWeeks: 2, startDate: dateStr, endDate };
      } else if (patternType === 'monthly_nth') {
        recurringPattern = { type: 'monthly_nth', nth: monthlyNth, weekday: monthlyWeekday, startDate: dateStr, endDate };
      } else if (patternType === 'monthly_date') {
        recurringPattern = { type: 'monthly_date', dayOfMonth: monthlyDate, startDate: dateStr, endDate };
      } else if (patternType === 'custom') {
        recurringPattern = { type: 'custom', dates: [...customDates].sort() };
      }
    }

    return {
      ...rest,
      // Legacy column kept in sync: any paid event implicitly requires
      // payment now that the payment screen is derived from offered methods.
      requiresPayment: pricingType === 'paid',
      startAt,
      endAt,
      mode,
      pricingType,
      donationNote: pricingType === 'donation' ? (donationNote || null) : null,
      locationVisibility,
      maxAttendees: rest.maxAttendees || null,
      tagIds: eventTags.map((t) => t.id),
      isRecurring,
      recurringPattern,
    };
  }

  // Create event mutation
  const createEventMutation = useMutation({
    mutationFn: async (eventData: EventFormValues) =>
      apiRequest("POST", "/api/dashboard/events", buildEventPayload(eventData)),
    onSuccess: () => {
      const existingEvents = queryClient.getQueryData<any[]>(["/api/dashboard/events"]) ?? [];
      const is_first = existingEvents.length === 0;
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"], exact: false });
      posthog.capture('event_created', { is_first });
      if (is_first) {
        posthog.setPersonProperties({ first_event_created_at: new Date().toISOString() });
      }
      toast({ title: "Success", description: "Event created successfully" });
      setIsCreating(false);
      setEditingEvent(null);
      setEventTags([]);
      setSelectedLocation(null);
      form.reset(EMPTY_FORM_VALUES);
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message || "Failed to create event", variant: "destructive" });
    },
  });

  // Update event mutation
  const updateEventMutation = useMutation({
    mutationFn: async ({ id, eventData, scope }: { id: number; eventData: EventFormValues; scope?: string }) => {
      const url = scope
        ? `/api/dashboard/events/${id}?scope=${scope}`
        : `/api/dashboard/events/${id}`;
      return apiRequest("PATCH", url, buildEventPayload(eventData));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"], exact: false });
      toast({ title: "Success", description: "Event updated successfully" });
      setEditingEvent(null);
      setIsCreating(false);
      setEventTags([]);
      setSelectedLocation(null);
      form.reset(EMPTY_FORM_VALUES);
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message || "Failed to update event", variant: "destructive" });
    },
  });

  // Promote-to-series mutation — turn a standalone event into a recurring series
  const promoteToSeriesMutation = useMutation({
    mutationFn: async ({ id, eventData }: { id: number; eventData: EventFormValues }) =>
      apiRequest("POST", `/api/dashboard/events/${id}/promote-to-series`, buildEventPayload(eventData)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"], exact: false });
      toast({ title: "Success", description: "Event converted to a recurring series" });
      setEditingEvent(null);
      setIsCreating(false);
      setEventTags([]);
      setSelectedLocation(null);
      form.reset(EMPTY_FORM_VALUES);
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message || "Failed to convert to recurring series", variant: "destructive" });
    },
  });

  // De-recur event mutation — collapse a series into a single standalone event
  const deRecurEventMutation = useMutation({
    mutationFn: async ({ id, eventData }: { id: number; eventData: EventFormValues }) =>
      apiRequest("POST", `/api/dashboard/events/${id}/de-recur`, buildEventPayload(eventData)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"], exact: false });
      toast({ title: "Success", description: "Event converted to a one-time event" });
      setEditingEvent(null);
      setIsCreating(false);
      setEventTags([]);
      setSelectedLocation(null);
      form.reset(EMPTY_FORM_VALUES);
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message || "Failed to convert event", variant: "destructive" });
    },
  });

  // Delete event mutation
  const deleteEventMutation = useMutation({
    mutationFn: async ({ id, scope }: { id: number; scope?: string }) => {
      const url = scope
        ? `/api/dashboard/events/${id}?scope=${scope}`
        : `/api/dashboard/events/${id}`;
      return apiRequest("DELETE", url);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"], exact: false });
      toast({ title: "Success", description: "Event deleted successfully" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message || "Failed to delete event", variant: "destructive" });
    },
  });

  // Feature event mutation
  const featureMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("POST", `/api/dashboard/events/${id}/feature`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/events"] });
      // Also invalidate profile events queries so the profile page reflects the change
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"], exact: false });
      toast({
        title: "Success",
        description: "Featured event updated successfully",
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
        description: error.message || "Failed to update featured event",
        variant: "destructive",
      });
    },
  });

  const normalizePaymentMethodUrls = (methods: typeof paymentMethods) => {
    const ensureHttps = (val: string | undefined) => {
      if (!val || val.trim() === '') return val;
      const t = val.trim();
      if (t.startsWith('http://') || t.startsWith('https://')) return t;
      return `https://${t}`;
    };
    return methods.map((m) => ({
      ...m,
      url: 'url' in m ? ensureHttps(m.url) : m.url,
      qr_code_url: 'qr_code_url' in m ? ensureHttps(m.qr_code_url) : m.qr_code_url,
      paypal_link: 'paypal_link' in m ? ensureHttps(m.paypal_link) : m.paypal_link,
    }));
  };

  const validatePaymentMethodsClient = (methods: typeof paymentMethods): string | null => {
    const urlPattern = /^https?:\/\/.+/;
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const labelMap: Record<string, string> = {
      upi: 'UPI',
      payment_link: 'Payment Link',
      paypal: 'PayPal',
      wise: 'Wise',
      bank_transfer: 'Bank Transfer',
      cash: 'Cash',
    };
    for (const m of methods) {
      if (!m.enabled) continue;
      const label = labelMap[m.type] ?? m.type;
      if ('url' in m && m.url && !urlPattern.test(m.url)) {
        return `${label} — Payment Link URL must start with https://`;
      }
      if ('qr_code_url' in m && m.qr_code_url && !urlPattern.test(m.qr_code_url)) {
        return `${label} — QR Code URL must start with https://`;
      }
      if ('paypal_link' in m && m.paypal_link && !urlPattern.test(m.paypal_link)) {
        return `${label} — PayPal.me link must start with https://`;
      }
      if ('email' in m && m.email && !emailPattern.test(m.email)) {
        return `${label} — please enter a valid email address`;
      }
    }
    return null;
  };

  const onSubmit = async (data: EventFormValues) => {
    // Validate that paid events have at least one enabled payment method
    if (data.pricingType === 'paid' && !paymentMethods.some((m) => m.enabled)) {
      toast({
        title: "Please enable at least one payment method for this paid event.",
        variant: "destructive",
      });
      paymentMethodsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    // Save payment methods to global settings for paid events when methods have changed
    if (data.pricingType === 'paid') {
      const normalizedMethods = normalizePaymentMethodUrls(paymentMethods);
      const validationError = validatePaymentMethodsClient(normalizedMethods);
      if (validationError) {
        toast({
          title: "Invalid payment method details",
          description: validationError,
          variant: "destructive",
        });
        paymentMethodsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      const orderedCurrent = normalizedMethods.map((m, i) => ({ ...m, order: i }));
      const orderedSaved = mergeWithDefaults(paymentSettings?.methods ?? []).map((m, i) => ({ ...m, order: i }));
      if (JSON.stringify(orderedCurrent) !== JSON.stringify(orderedSaved)) {
        try {
          await apiRequest("PUT", "/api/dashboard/payment-settings", { methods: orderedCurrent });
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard/payment-settings"] });
          setInitialPaymentMethods(normalizedMethods);
          setPaymentMethodsDirty(false);
        } catch (err) {
          let description = "Please review your payment settings and try again.";
          if (err instanceof ApiError && err.data?.errors) {
            const errors = err.data.errors as Record<string, string[]>;
            const messages = Object.entries(errors)
              .flatMap(([field, msgs]) => msgs.map((msg) => `${field}: ${msg}`));
            if (messages.length > 0) {
              description = messages.join(' · ');
            }
          }
          toast({
            title: "Failed to save payment methods",
            description,
            variant: "destructive",
          });
          paymentMethodsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
      }
    }

    if (editingEvent) {
      const isSeriesEvent = !!(editingEvent.seriesId) || !!(editingEvent.isRecurring);
      // De-recurring intent: editing a series event and the recurring toggle
      // was turned off. Bypass the scope dialog and call the dedicated
      // de-recur endpoint that cancels siblings and detaches this instance.
      if (isSeriesEvent && !data.isRecurring && editingEvent.seriesId) {
        deRecurEventMutation.mutate({ id: editingEvent.id, eventData: data });
        return;
      }
      // Promote-to-series intent: editing a standalone event and the recurring
      // toggle was turned on. Call the dedicated promote endpoint which creates
      // a new series and keeps registrations on instance #1.
      if (!isSeriesEvent && data.isRecurring) {
        promoteToSeriesMutation.mutate({ id: editingEvent.id, eventData: data });
        return;
      }
      if (isSeriesEvent) {
        // Show scope dialog before applying
        setSelectedEditScope("this");
        setEditScopePending({ eventData: data, eventId: editingEvent.id });
        return;
      }
      updateEventMutation.mutate({ id: editingEvent.id, eventData: data });
    } else {
      createEventMutation.mutate(data);
    }
  };

  const doEditWithScope = (scope: "this" | "this_future" | "all") => {
    if (!editScopePending) return;
    const { eventData, eventId } = editScopePending;
    setEditScopePending(null);
    updateEventMutation.mutate({ id: eventId, eventData, scope });
  };

  const doDeleteWithScope = (scope: "this" | "this_future" | "all") => {
    const id = deleteScopeEventId;
    if (!id) return;
    setDeleteScopeEventId(null);
    deleteEventMutation.mutate({ id, scope });
  };

  const handleEdit = async (event: EventWithExtras) => {
    // Note: parentEventId is a legacy field; series events are handled via seriesId
    const targetEvent = event;

    setEditingEvent(targetEvent);
    const freshMethods = paymentSettings?.methods ? mergeWithDefaults(paymentSettings.methods) : DEFAULT_PAYMENT_METHODS;
    setPaymentMethods(freshMethods);
    setInitialPaymentMethods(freshMethods);
    setPaymentMethodsDirty(false);
    setIsCreating(true);

    // Fetch event tags (use the target/parent event's tags)
    try {
      const response = await fetch(`/api/events/${targetEvent.id}/tags`);
      if (response.ok) {
        const tags = await response.json();
        setEventTags(tags);
      } else {
        setEventTags([]);
      }
    } catch (error) {
      setEventTags([]);
    }

    const seriesPattern = targetEvent.seriesPattern ?? null;
    const evMode = targetEvent.mode || 'online';
    const locVis = targetEvent.locationVisibility || {};
    const startAtVal = targetEvent.startAt;
    const endAtVal = targetEvent.endAt;
    // Decode the saved instants in the event's own stored timezone, not the editor's
    // browser local time. Otherwise re-saving an event would shift it by the editor's
    // UTC offset relative to the original creator's timezone.
    const eventTz = targetEvent.timezone || getBrowserTimezone();
    const startParts = startAtVal ? getDatePartsInTimezone(new Date(startAtVal), eventTz) : null;
    const endParts = endAtVal ? getDatePartsInTimezone(new Date(endAtVal), eventTz) : null;
    const dateStr = startParts
      ? `${startParts.year}-${String(startParts.month).padStart(2, '0')}-${String(startParts.day).padStart(2, '0')}`
      : "";
    const startTimeStr = startParts
      ? ((startParts.hour === 0 && startParts.minute === 0)
          ? ""
          : `${String(startParts.hour).padStart(2, '0')}:${String(startParts.minute).padStart(2, '0')}`)
      : "";
    const endTimeStr = endParts
      ? ((endParts.hour === 0 && endParts.minute === 0)
          ? ""
          : `${String(endParts.hour).padStart(2, '0')}:${String(endParts.minute).padStart(2, '0')}`)
      : "";
    form.reset({
      title: targetEvent.title,
      description: targetEvent.description || "",
      thumbnailDescription: targetEvent.thumbnailDescription || "",
      date: dateStr,
      startTime: startTimeStr,
      endTime: endTimeStr,
      isOnline: evMode === 'online' || evMode === 'hybrid',
      isOffline: evMode === 'offline' || evMode === 'hybrid',
      location: targetEvent.location || "",
      locationId: targetEvent.locationId || null,
      showLocationName: (locVis as { showLocationName?: boolean }).showLocationName ?? true,
      showStreetAddress: (locVis as { showStreetAddress?: boolean }).showStreetAddress ?? false,
      showMapLocation: (locVis as { showMapLocation?: boolean }).showMapLocation ?? false,
      timezone: targetEvent.timezone || getBrowserTimezone(),
      maxAttendees: targetEvent.maxAttendees || undefined,
      pricingType: (targetEvent.pricingType || "paid") as "free" | "donation" | "paid",
      donationNote: targetEvent.donationNote || "",
      price: targetEvent.price,
      currency: targetEvent.currency || "USD",
      featuredImage: targetEvent.featuredImage || "",
      mediaItems: targetEvent.mediaItems || [],
      requiresPayment: targetEvent.requiresPayment ?? false,
      paymentInstructions: targetEvent.paymentInstructions || "",
      meetingLink: targetEvent.meetingLink || "",
      qrCodeUrl: targetEvent.qrCodeUrl || "",
      isRecurring: !!(targetEvent.seriesId) || !!(targetEvent.isRecurring),
      patternType: (() => {
        const p = seriesPattern;
        if (!p) return 'weekly';
        if (p.type === 'weekly') return p.intervalWeeks === 2 ? 'biweekly' : 'weekly';
        return p.type as 'weekly' | 'biweekly' | 'monthly_nth' | 'monthly_date' | 'custom';
      })(),
      recurrenceDays: (() => {
        const p = seriesPattern;
        return (p && 'weekdays' in p ? p.weekdays : null) || [];
      })(),
      isIndefinite: (() => {
        const p = seriesPattern;
        if (!p) return true;
        if (p.type === 'custom') return true;
        return !('endDate' in p && p.endDate);
      })(),
      recurrenceEndDate: (() => {
        const p = seriesPattern;
        if (!p || p.type === 'custom') return '';
        return ('endDate' in p && p.endDate) ? p.endDate : '';
      })(),
      monthlyNth: (seriesPattern && 'nth' in seriesPattern ? seriesPattern.nth : null) || 1,
      monthlyWeekday: (seriesPattern && 'weekday' in seriesPattern ? seriesPattern.weekday : null) || 1,
      monthlyDate: (seriesPattern && 'dayOfMonth' in seriesPattern ? seriesPattern.dayOfMonth : null) || 1,
      customDates: (seriesPattern && 'dates' in seriesPattern ? seriesPattern.dates : null) || [],
    });
  };

  const handleDelete = (event: EventWithExtras) => {
    if (event.isRecurring || !!(event.seriesId)) {
      setSelectedDeleteScope("this");
      setDeleteScopeEventId(event.id);
    } else {
      setDeleteId(event.id);
    }
  };

  const doCloseDialog = () => {
    setIsCreating(false);
    setEditingEvent(null);
    setEventTags([]);
    setSelectedLocation(null);
    setPaymentMethodsDirty(false);
    form.reset(EMPTY_FORM_VALUES);
  };

  const paymentMethodsChanged = JSON.stringify(paymentMethods) !== JSON.stringify(initialPaymentMethods);

  const handleCancel = () => {
    safeClose(form.formState.isDirty || paymentMethodsChanged, doCloseDialog);
  };
  
  const handleCreate = () => {
    posthog.capture('event_create_form_opened');
    setEventTags([]);
    setEditingEvent(null);
    setSelectedLocation(null);
    form.reset(EMPTY_FORM_VALUES);
    const freshMethods = paymentSettings?.methods ? mergeWithDefaults(paymentSettings.methods) : DEFAULT_PAYMENT_METHODS;
    setPaymentMethods(freshMethods);
    setInitialPaymentMethods(freshMethods);
    setPaymentMethodsDirty(false);
    setIsCreating(true);
  };

  // Only show the full-page skeleton on the very first load (no cached data).
  // Background refetches keep showing the existing list so the tab feels instant.
  if (isLoading && events.length === 0) {
    return (
      <div className="space-y-4 p-2" data-testid="events-loading-skeleton">
        <div className="h-8 w-40 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-28 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Events</h2>
          <p className="text-gray-600 mt-1">Create and manage your events and workshops</p>
        </div>
          <Button 
          onClick={handleCreate}
          className="bg-primary text-white hover:bg-primary/90"
          data-testid="button-create-event"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Event
        </Button>
      </div>

      {/* Create/Edit Form Modal */}
      <Dialog open={isCreating} onOpenChange={(open) => !open && handleCancel()}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[85vh] p-0 flex flex-col gap-0 border rounded-lg bg-background shadow-lg">
          <DialogHeader className="px-4 py-4 sm:px-6 sm:pt-6 sm:pb-4 border-b flex-shrink-0">
            <DialogTitle>{editingEvent ? "Edit Event" : "Create New Event"}</DialogTitle>
            <DialogDescription>
              {editingEvent 
                ? "Update your event details below." 
                : "Fill out the form below to create a new event or workshop."
              }
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto"><div className="p-4 sm:px-6 sm:pb-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

                {/* Basic Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Event Title *</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Mindfulness Workshop" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Event Date *</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex gap-4">
                    <FormField
                      control={form.control}
                      name="startTime"
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormLabel>Start Time</FormLabel>
                          <FormControl>
                            <Input type="time" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="endTime"
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormLabel>End Time <span className="text-gray-400 font-normal text-xs">(optional)</span></FormLabel>
                          <FormControl>
                            <Input type="time" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="timezone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <Globe className="h-4 w-4" />
                          Timezone
                        </FormLabel>
                        <Select
                          value={field.value || getBrowserTimezone()}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-event-timezone">
                              <SelectValue placeholder="Select timezone" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="max-h-[300px]">
                            {TIMEZONE_GROUPS.map((group, index) => (
                              <SelectGroup key={group.region}>
                                <SelectLabel className={`sticky top-0 z-10 bg-accent px-2 py-1.5 text-xs font-bold uppercase tracking-wider text-accent-foreground ${index > 0 ? 'mt-2 border-t border-border' : ''}`}>
                                  {group.region}
                                </SelectLabel>
                                {group.timezones.map(tz => (
                                  <SelectItem key={tz.value} value={tz.value} className="pl-4">
                                    <span className="font-medium">{tz.abbr}</span>
                                    <span className="ml-1.5 text-muted-foreground">- {tz.label}</span>
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Timezone for event scheduling
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Recurring Event Toggle */}
                <div className="space-y-4 pt-2 border-t border-gray-100">
                  <FormField
                    control={form.control}
                    name="isRecurring"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                        <div className="space-y-0.5">
                          <FormLabel className="flex items-center gap-2">
                            <Repeat className="h-4 w-4 text-primary" />
                            Recurring Event
                          </FormLabel>
                          <FormDescription>
                            Auto-generate repeating occurrences. The day of your start date is always included.
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-recurring"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {editingEvent?.seriesId && !isRecurring && (
                    <div
                      className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-sm text-amber-900 dark:text-amber-200"
                      data-testid="warning-de-recurring"
                    >
                      <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <p>
                        This will cancel all other occurrences. Only this event
                        will remain, on the date you set below.
                      </p>
                    </div>
                  )}

                  {editingEvent && !editingEvent.seriesId && !editingEvent.isRecurring && isRecurring && (
                    <div
                      className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-sm text-blue-900 dark:text-blue-200"
                      data-testid="info-promote-to-series"
                    >
                      <Repeat className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <p>
                        This event will become the first occurrence of a new recurring series.
                        Existing registrations stay attached to this date.
                      </p>
                    </div>
                  )}

                  {isRecurring && (
                    <div className="sm:ml-2 p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg space-y-4 border border-blue-100 dark:border-blue-800">
                      {/* Pattern type selector */}
                      <FormField
                        control={form.control}
                        name="patternType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Repeat Pattern</FormLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <FormControl>
                                <SelectTrigger data-testid="select-pattern-type">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="weekly">Weekly (same day every week)</SelectItem>
                                <SelectItem value="biweekly">Bi-weekly (every 2 weeks)</SelectItem>
                                <SelectItem value="monthly_nth">Monthly — Nth weekday (e.g. 3rd Saturday)</SelectItem>
                                <SelectItem value="monthly_date">Monthly — fixed date (e.g. 15th of each month)</SelectItem>
                                <SelectItem value="custom">Custom dates (hand-picked list)</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Weekly / Bi-weekly: weekday picker */}
                      {(patternType === 'weekly' || patternType === 'biweekly') && (
                        <FormField
                          control={form.control}
                          name="recurrenceDays"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Repeats On *</FormLabel>
                              <div className="flex flex-wrap gap-2 pt-1">
                                {WEEKDAYS.map((day) => {
                                  const isSelected = field.value.includes(day.value);
                                  const isAnchor = anchorWeekday === day.value;
                                  return (
                                    <button
                                      key={day.value}
                                      type="button"
                                      data-testid={`btn-weekday-${day.value}`}
                                      title={isAnchor ? "Matches your start date — cannot be removed" : undefined}
                                      onClick={() => {
                                        if (isAnchor) return;
                                        const newDays = isSelected
                                          ? field.value.filter((d) => d !== day.value)
                                          : [...field.value, day.value];
                                        field.onChange(newDays);
                                      }}
                                      className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                                        isSelected
                                          ? isAnchor
                                            ? "bg-primary text-white border-primary ring-2 ring-offset-1 ring-primary/30 cursor-default"
                                            : "bg-primary text-white border-primary cursor-pointer"
                                          : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-primary hover:text-primary cursor-pointer"
                                      }`}
                                    >
                                      {day.label}
                                    </button>
                                  );
                                })}
                              </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}

                      {/* Monthly Nth — nth + weekday selectors */}
                      {patternType === 'monthly_nth' && (
                        <div className="grid grid-cols-2 gap-3">
                          <FormField
                            control={form.control}
                            name="monthlyNth"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Which occurrence</FormLabel>
                                <Select value={String(field.value)} onValueChange={v => field.onChange(Number(v))}>
                                  <FormControl>
                                    <SelectTrigger data-testid="select-monthly-nth">
                                      <SelectValue />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="1">1st</SelectItem>
                                    <SelectItem value="2">2nd</SelectItem>
                                    <SelectItem value="3">3rd</SelectItem>
                                    <SelectItem value="4">4th</SelectItem>
                                    <SelectItem value="5">5th (if exists)</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="monthlyWeekday"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Day of week</FormLabel>
                                <Select value={String(field.value)} onValueChange={v => field.onChange(Number(v))}>
                                  <FormControl>
                                    <SelectTrigger data-testid="select-monthly-weekday">
                                      <SelectValue />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {WEEKDAYS.map(d => <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      )}

                      {/* Monthly Date — day of month */}
                      {patternType === 'monthly_date' && (
                        <FormField
                          control={form.control}
                          name="monthlyDate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Day of month</FormLabel>
                              <Select value={String(field.value)} onValueChange={v => field.onChange(Number(v))}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-monthly-date">
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                                    <SelectItem key={d} value={String(d)}>{d}{d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th'}{d >= 29 ? ' (last day if month shorter)' : ''}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormDescription>Events on the {field.value}th of each month</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}

                      {/* Custom dates: multi-date picker */}
                      {patternType === 'custom' && (
                        <FormField
                          control={form.control}
                          name="customDates"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Dates *</FormLabel>
                              <div className="space-y-2">
                                <div className="flex gap-2">
                                  <Input
                                    type="date"
                                    data-testid="input-custom-date"
                                    id="custom-date-input"
                                    className="flex-1"
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      if (val && !field.value.includes(val)) {
                                        field.onChange([...field.value, val].sort());
                                        e.target.value = '';
                                      }
                                    }}
                                  />
                                </div>
                                {field.value.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5">
                                    {field.value.map(d => (
                                      <span key={d} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white border border-blue-200 text-xs font-medium text-blue-700">
                                        {new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        <button type="button" onClick={() => field.onChange(field.value.filter(x => x !== d))} className="hover:text-red-500 ml-0.5">×</button>
                                      </span>
                                    ))}
                                  </div>
                                )}
                                {field.value.length === 0 && <p className="text-xs text-muted-foreground">Pick dates using the input above</p>}
                              </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}

                      {/* End date / indefinite toggle — not shown for custom (dates define the end) */}
                      {patternType !== 'custom' && (
                        <div className="space-y-2">
                          <FormField
                            control={form.control}
                            name="isIndefinite"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-center gap-3">
                                <FormControl>
                                  <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-indefinite" />
                                </FormControl>
                                <div>
                                  <FormLabel className="cursor-pointer">No end date (ongoing)</FormLabel>
                                  <FormDescription>New occurrences will be generated automatically</FormDescription>
                                </div>
                              </FormItem>
                            )}
                          />
                          {!isIndefinite && (
                            <FormField
                              control={form.control}
                              name="recurrenceEndDate"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>End date</FormLabel>
                                  <FormControl>
                                    <Input type="date" {...field} data-testid="input-recurrence-end-date" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Event Mode & Location */}
                <div className="space-y-4 pt-2 border-t border-gray-100">
                  <h3 className="font-medium text-gray-900">Event Mode</h3>

                  <div className="flex flex-col space-y-4">
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
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel className="cursor-pointer">Offline (In-Person)</FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />

                    {/* Location fields - Only shown if Offline is checked */}
                    {form.watch("isOffline") && (
                      <div className="w-full max-w-full space-y-4 p-3 sm:p-4 bg-gray-50 dark:bg-gray-800 rounded-lg overflow-hidden min-w-0">
                        <LocationPicker
                          selectedLocationId={selectedLocation?.id}
                          onSelect={(location) => {
                            setSelectedLocation(location);
                            if (location) {
                              form.setValue("locationId", location.id);
                              form.setValue("location", location.name || "");
                            } else {
                              form.setValue("locationId", null);
                              form.setValue("location", "");
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
                        <p className="text-sm text-muted-foreground">
                          Or enter location name manually:
                        </p>
                        <FormField
                          control={form.control}
                          name="location"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Location Name *</FormLabel>
                              <FormControl>
                                <Input placeholder="e.g. Central Park, Studio A" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    )}

                    {/* Online Checkbox */}
                    <FormField
                      control={form.control}
                      name="isOnline"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel className="cursor-pointer">Online</FormLabel>
                            <p className="text-sm text-gray-500 mt-1">
                              Attendees will receive joining instructions via email.
                            </p>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <div className="space-y-4 border-t border-gray-100 pt-4">
                  <FormField
                    control={form.control}
                    name="pricingType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Pricing</FormLabel>
                        <div className="flex gap-6 mt-2 flex-wrap">
                          {(["paid", "donation", "free"] as const).map((option) => (
                            <label key={option} className="flex items-center gap-3 cursor-pointer">
                              <div
                                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                                  field.value === option
                                    ? 'border-[#b66667] bg-[#b66667]'
                                    : 'border-gray-300 bg-white'
                                }`}
                                onClick={() => {
                                  field.onChange(option);
                                  if (option === 'free') form.setValue("price", "0");
                                }}
                              >
                                {field.value === option && (
                                  <div className="w-2 h-2 rounded-full bg-white" />
                                )}
                              </div>
                              <span className="text-sm font-medium capitalize">{option === 'paid' ? 'Paid' : option === 'donation' ? 'Donation' : 'Free'}</span>
                            </label>
                          ))}
                        </div>
                      </FormItem>
                    )}
                  />

                  {pricingType === 'donation' && (
                    <FormField
                      control={form.control}
                      name="donationNote"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Donation Note (Optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. Suggested donation: $20" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="price"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Price</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder={pricingType === 'free' ? "Free" : "0.00"}
                              disabled={pricingType === 'free'}
                              {...field}
                              value={pricingType === 'free' ? "" : field.value}
                              className={pricingType === 'free' ? "bg-gray-100 cursor-not-allowed" : ""}
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
                            disabled={pricingType === 'free'}
                          >
                            <FormControl>
                              <SelectTrigger className={pricingType === 'free' ? "bg-gray-100 cursor-not-allowed" : ""}>
                                <SelectValue placeholder="Select currency" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {SUPPORTED_CURRENCIES.map((currency) => (
                                <SelectItem key={currency.code} value={currency.code}>
                                  {currency.symbol} {currency.code} - {currency.name}
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
                      name="maxAttendees"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Max Attendees (Optional)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min="1"
                              placeholder="Leave empty for unlimited"
                              {...field}
                              value={field.value || ''}
                              onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Payment methods (shown automatically for paid events) */}
                <div className="space-y-3" ref={paymentMethodsSectionRef}>
                  {pricingType === 'paid' && (
                    <div className="space-y-4 pt-1">
                      <div>
                        <p className="text-sm font-medium mb-1">Payment Methods</p>
                        <p className="text-xs text-muted-foreground mb-3">
                          Enable the methods guests can use to pay. Any changes here are saved to your global payment settings.
                        </p>
                        {!paymentMethods.some((m) => m.enabled) && (
                          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-3 py-2 mb-3">
                            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                            <p className="text-xs text-amber-700 dark:text-amber-300">
                              Enable at least one payment method so guests can pay.
                            </p>
                          </div>
                        )}
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
                                placeholder="Any extra payment notes shown in the confirmation email…"
                                className="resize-none"
                                rows={2}
                                data-testid="input-payment-instructions"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
                </div>

                {/* Meeting link (online events) */}
                {form.watch("isOnline") && (
                  <FormField
                    control={form.control}
                    name="meetingLink"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Meeting Link (Optional)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="https://meet.google.com/..."
                            data-testid="input-meeting-link"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          If added after registrations exist, it will be emailed to all confirmed attendees automatically.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="featuredImage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Featured Image (Cover)</FormLabel>
                      <FormControl>
                        <ImageUpload
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="Upload a cover image for your event"
                          cropAspect={FEATURED_DESKTOP_ASPECT}
                        />
                      </FormControl>
                      <FormDescription>
                        This image appears as the main cover at the top of your event page
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="mediaItems"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gallery Photos &amp; Videos</FormLabel>
                      <FormControl>
                        <EventMediaUpload
                          value={field.value || []}
                          onChange={field.onChange}
                          maxImages={10}
                          maxVideos={3}
                        />
                      </FormControl>
                      <FormDescription>
                        Add extra photos and videos to showcase your event. All files upload in parallel for speed. First image becomes the carousel cover.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="qrCodeUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Custom QR Code URL (optional)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https://example.com/your-custom-qr.png"
                          data-testid="input-qr-code-url"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Upload your own QR code image URL to replace the auto-generated one on the event page.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="thumbnailDescription"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Thumbnail Description</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Short teaser description for the event card..."
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
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Describe your event, what attendees will learn, and what to expect..."
                          className="min-h-[100px]"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Tags Section */}
                <div className="space-y-2">
                  <FormLabel>Tags</FormLabel>
                  <TagManager
                    entityType="event"
                    entityId={editingEvent?.id}
                    selectedTags={eventTags}
                    onTagsChange={setEventTags}
                    maxTags={10}
                    allowCreate={true}
                    showSuggestions={true}
                  />
                  <p className="text-sm text-muted-foreground">
                    Add tags to help users find your event when searching
                  </p>
                </div>

                <div className="flex gap-3 pt-4 border-t">
                  <Button 
                    type="submit" 
                    disabled={createEventMutation.isPending || updateEventMutation.isPending}
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {editingEvent ? "Update Event" : "Create Event"}
                  </Button>
                  <Button type="button" variant="outline" onClick={handleCancel}>
                    Cancel
                  </Button>
                </div>
              </form>
            </Form>
          </div></div>
        </DialogContent>
      </Dialog>

      {/* Events List */}
      <div className="grid gap-6">
        {events.length === 0 && !isCreating ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Calendar className="h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No events yet</h3>
              <p className="text-gray-500 text-center max-w-sm">
                Create your first event or workshop to start building your community and sharing your expertise.
              </p>
              <Button 
                className="mt-4" 
                onClick={handleCreate}
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Event
              </Button>
            </CardContent>
          </Card>
        ) : (
          events.map((event) => (
            <Card key={event.id} className="bg-white overflow-hidden border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                  {/* Left: Info */}
                  <div className="space-y-4 flex-1">
                    <div className="flex justify-between items-start w-full">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-xl font-bold text-gray-900">{event.title}</h3>
                          {event.isFeatured && (
                            <Badge className="bg-primary text-white" data-testid={`badge-featured-${event.id}`}>
                              Featured
                            </Badge>
                          )}
                          {event.isRecurring && (
                            <Badge variant="outline" className="flex items-center gap-1 border-blue-300 text-blue-600" data-testid={`badge-recurring-${event.id}`}>
                              <Repeat className="h-3 w-3" /> Recurring
                            </Badge>
                          )}
                        </div>
                        {/* Description truncated */}
                        <p className="text-gray-500 text-sm line-clamp-1 mt-1">
                          {event.thumbnailDescription || event.description}
                        </p>
                      </div>

                      {/* Right: Action Buttons (Desktop) */}
                      <div className="hidden sm:flex items-center gap-2">
                        {!event.isFeatured && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => featureMutation.mutate(event.id)}
                            disabled={featureMutation.isPending}
                            data-testid={`button-feature-${event.id}`}
                          >
                            <Star className="w-4 h-4 mr-1" />
                            Set as Featured
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9"
                          onClick={() => setViewingRegistrations({ eventId: event.id, eventTitle: event.title })}
                          title="View Registrations"
                          data-testid={`button-registrations-${event.id}`}
                        >
                          <BarChart3 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9"
                          onClick={() => setQrEvent(event)}
                          title="QR code"
                          disabled={!username}
                          data-testid={`button-qr-${event.id}`}
                        >
                          <QrCode className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9"
                          onClick={() => handleEdit(event)}
                          title="Edit Event"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 text-red-500 hover:text-red-600 hover:bg-red-50 border-red-100"
                          onClick={() => handleDelete(event)}
                          title="Delete Event"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Meta Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                      <div className="flex flex-col">
                        <span className="text-gray-400 text-xs uppercase font-medium mb-1">Date</span>
                        <div className="flex items-center text-gray-700 font-medium">
                          <Calendar className="w-4 h-4 mr-2 text-gray-400" />
                          {event.startAt ? format(new Date(event.startAt), "MMM dd, yyyy") : "TBD"}
                        </div>
                        <div className="text-xs text-gray-500 ml-6 mt-0.5">
                          {event.startAt ? format(new Date(event.startAt), "EEEE") : ""}
                        </div>
                      </div>

                      <div className="flex flex-col">
                        <span className="text-gray-400 text-xs uppercase font-medium mb-1">Time</span>
                        <div className="flex items-center text-gray-700 font-medium">
                          <Clock className="w-4 h-4 mr-2 text-gray-400" />
                          {(() => {
                            const st = event.startAt;
                            const et = event.endAt;
                            if (!st) return "TBD";
                            const sd = new Date(st);
                            if (sd.getHours() === 0 && sd.getMinutes() === 0) return "TBD";
                            const fmt = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                            return et ? `${fmt(sd)} – ${fmt(new Date(et))}` : fmt(sd);
                          })()}
                        </div>
                      </div>

                      <div className="flex flex-col">
                        <span className="text-gray-400 text-xs uppercase font-medium mb-1">Location</span>
                        <div className="flex items-center text-gray-700 font-medium">
                          <MapPin className="w-4 h-4 mr-2 text-gray-400" />
                          {event.location || "Online"}
                        </div>
                      </div>
                    </div>

                    {/* Description/Teaser */}
                    <div className="pt-2">
                       <p className="text-sm text-gray-600">
                         {event.maxAttendees ? (
                           <span className="flex items-center gap-1 text-blue-600 bg-blue-50 w-fit px-2 py-1 rounded text-xs font-medium">
                             <Users className="w-3 h-3" /> Max {event.maxAttendees} Attendees
                           </span>
                         ) : (
                           <span className="flex items-center gap-1 text-green-600 bg-green-50 w-fit px-2 py-1 rounded text-xs font-medium">
                             <Users className="w-3 h-3" /> Unlimited Spots
                           </span>
                         )}
                       </p>
                    </div>
                  </div>

                  {/* Right: Action Buttons (Mobile) */}
                  <div className="flex sm:hidden items-center gap-2 w-full justify-end mt-2 border-t pt-3 flex-wrap">
                    {!event.isFeatured && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => featureMutation.mutate(event.id)}
                        disabled={featureMutation.isPending}
                      >
                        <Star className="h-4 w-4 mr-2" /> Feature
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => setViewingRegistrations({ eventId: event.id, eventTitle: event.title })}>
                      <BarChart3 className="h-4 w-4 mr-2" /> Stats
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setQrEvent(event)}
                      disabled={!username}
                      data-testid={`button-qr-mobile-${event.id}`}
                    >
                      <QrCode className="h-4 w-4 mr-2" /> QR
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(event)}>
                      <Edit className="h-4 w-4 mr-2" /> Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(event)} className="text-red-500">
                      <Trash2 className="h-4 w-4 mr-2" /> Delete
                    </Button>
                  </div>
                </div>

                {/* Footer: Price and Status */}
                <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-50">
                  <div className={`flex items-center font-bold text-primary ${event.pricingType === 'free' || event.pricingType === 'donation' ? "text-sm" : "text-lg"}`}>
                    {event.pricingType === 'free' ? (
                      <span>Free</span>
                    ) : event.pricingType === 'donation' ? (
                      <span>Donation</span>
                    ) : (
                      <span>{formatPrice(event.price, event.currency || "USD")}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={`${event.isActive ? 'bg-[#b66667] hover:bg-[#B85858]' : 'bg-gray-400'}`}>
                      {event.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </div>

              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Event Registrations Modal */}
      {viewingRegistrations && (
        <EventRegistrations
          eventId={viewingRegistrations.eventId}
          eventTitle={viewingRegistrations.eventTitle}
          isOpen={!!viewingRegistrations}
          onClose={() => setViewingRegistrations(null)}
          highlightRegistrationId={highlightRegistrationId}
        />
      )}

      {/* Per-event QR code dialog */}
      {qrEvent && username && (
        <EventQrDialog
          open={!!qrEvent}
          onOpenChange={(open) => { if (!open) setQrEvent(null); }}
          eventId={qrEvent.id}
          eventTitle={qrEvent.title}
          username={username}
          uploadedQrUrl={qrEvent.qrCodeUrl}
        />
      )}
      <ConfirmDialog />

      <DeleteConfirmationDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
        onConfirm={() => {
          const id = deleteId;
          setDeleteId(null);
          if (id) deleteEventMutation.mutate({ id });
        }}
        title="Are you sure you want to delete?"
        description="This event will be permanently deleted. This action cannot be undone."
        isPending={deleteEventMutation.isPending}
      />

      {/* Recurring Delete Scope Dialog */}
      <Dialog open={deleteScopeEventId !== null} onOpenChange={(open) => !open && setDeleteScopeEventId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancel / Delete Recurring Event</DialogTitle>
            <DialogDescription>
              This is a recurring event. What would you like to cancel or delete?
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <button
              type="button"
              className={`w-full text-left rounded-lg border-2 px-4 py-3 transition-colors ${selectedDeleteScope === "this" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"}`}
              onClick={() => setSelectedDeleteScope("this")}
              data-testid="button-delete-this-event"
            >
              <div className="flex items-center gap-3">
                <Trash2 className="h-4 w-4 shrink-0 text-red-500" />
                <div>
                  <div className="font-medium text-sm">This date only</div>
                  <div className="text-xs text-muted-foreground">Cancel just this one occurrence</div>
                </div>
              </div>
            </button>
            <button
              type="button"
              className={`w-full text-left rounded-lg border-2 px-4 py-3 transition-colors ${selectedDeleteScope === "this_future" ? "border-orange-400 bg-orange-50 dark:bg-orange-950/20" : "border-border hover:border-muted-foreground/40"}`}
              onClick={() => setSelectedDeleteScope("this_future")}
              data-testid="button-delete-this-future-events"
            >
              <div className="flex items-center gap-3">
                <Trash2 className="h-4 w-4 shrink-0 text-orange-500" />
                <div>
                  <div className="font-medium text-sm text-orange-700 dark:text-orange-400">This and all future dates</div>
                  <div className="text-xs text-muted-foreground">Cancel from this date onwards</div>
                </div>
              </div>
            </button>
            <button
              type="button"
              className={`w-full text-left rounded-lg border-2 px-4 py-3 transition-colors ${selectedDeleteScope === "all" ? "border-destructive bg-destructive/5" : "border-border hover:border-muted-foreground/40"}`}
              onClick={() => setSelectedDeleteScope("all")}
              data-testid="button-delete-all-events"
            >
              <div className="flex items-center gap-3">
                <Trash2 className="h-4 w-4 shrink-0 text-destructive" />
                <div>
                  <div className="font-medium text-sm text-destructive">All occurrences</div>
                  <div className="text-xs text-muted-foreground">Delete the entire series</div>
                </div>
              </div>
            </button>
          </div>
          <DialogFooter className="flex-row gap-2 sm:flex-row">
            <Button
              variant="ghost"
              className="flex-1"
              onClick={() => setDeleteScopeEventId(null)}
              data-testid="button-delete-scope-cancel"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => doDeleteWithScope(selectedDeleteScope)}
              disabled={deleteEventMutation.isPending}
              data-testid="button-delete-scope-confirm"
            >
              {deleteEventMutation.isPending ? (
                <span className="flex items-center gap-2"><span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />Deleting…</span>
              ) : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Scope Dialog for recurring events */}
      <Dialog open={editScopePending !== null} onOpenChange={(open) => !open && setEditScopePending(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Recurring Event</DialogTitle>
            <DialogDescription>
              Which occurrences would you like to update?
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <button
              type="button"
              className={`w-full text-left rounded-lg border-2 px-4 py-3 transition-colors ${selectedEditScope === "this" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"}`}
              onClick={() => setSelectedEditScope("this")}
              data-testid="button-edit-this-event"
            >
              <div className="font-medium text-sm">Just this date</div>
              <div className="text-xs text-muted-foreground">Update only this single occurrence</div>
            </button>
            <button
              type="button"
              className={`w-full text-left rounded-lg border-2 px-4 py-3 transition-colors ${selectedEditScope === "this_future" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"}`}
              onClick={() => setSelectedEditScope("this_future")}
              data-testid="button-edit-this-future-events"
            >
              <div className="font-medium text-sm">This and all future dates</div>
              <div className="text-xs text-muted-foreground">Update from this date onwards</div>
            </button>
            <button
              type="button"
              className={`w-full text-left rounded-lg border-2 px-4 py-3 transition-colors ${selectedEditScope === "all" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"}`}
              onClick={() => setSelectedEditScope("all")}
              data-testid="button-edit-all-events"
            >
              <div className="font-medium text-sm">All occurrences in this series</div>
              <div className="text-xs text-muted-foreground">Update the entire recurring series</div>
            </button>
          </div>
          <DialogFooter className="flex-row gap-2 sm:flex-row">
            <Button
              variant="ghost"
              className="flex-1"
              onClick={() => setEditScopePending(null)}
              data-testid="button-edit-scope-cancel"
            >
              Cancel
            </Button>
            <Button
              variant="default"
              className="flex-1"
              onClick={() => doEditWithScope(selectedEditScope)}
              disabled={updateEventMutation.isPending}
              data-testid="button-edit-scope-confirm"
            >
              {updateEventMutation.isPending ? (
                <span className="flex items-center gap-2"><span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />Saving…</span>
              ) : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

