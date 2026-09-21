import { useState, useEffect, useRef, Fragment, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ProfilePictureUpload } from "@/components/profile-picture-upload";
import { CitySearchBar } from "@/components/city-search-bar";
import { TagManager, type Tag } from "@/components/tag-manager";
import {
  ContactStep,
} from "@/components/onboarding/ContactStep";
import { waitForSupabase } from "@/lib/supabase";
import { 
  Check, 
  ChevronRight, 
  ChevronLeft, 
  User, 
  Phone, 
  MapPin, 
  Sparkles,
  Loader2,
  X
} from "lucide-react";
import { posthog } from "@/lib/posthog";

// Branding assets
import headerLogo from "@assets/Color_Variations_copy_9@144x-2_1775978761578.png";
import welcomeLogo from "@assets/Color_Variations_copy_7@144x-2_1776669473864.png";

const steps = [
  { id: 'welcome', title: 'Welcome', icon: Sparkles },
  { id: 'profile', title: 'Profile Setup', icon: User },
  { id: 'contact', title: 'Contact Info', icon: Phone },
  { id: 'discovery', title: 'Discovery', icon: MapPin },
  { id: 'orientation', title: 'Get Started', icon: Check },
];

export default function Onboarding() {
  const { user, isLoading: authLoading, isAuthenticated, refreshOnboardingStatus } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Allow callers (notably /auth/callback) to drop the user at a specific
  // step via `?step=<id>` — used when an existing creator with
  // onboardingCompleted=false signs in and should land on the contact step
  // (e.g. a WhatsApp-bot-created profile claiming for the first time).
  // Falls back to the welcome step (index 0) for unknown / missing values.
  const [currentStep, setCurrentStep] = useState(() => {
    if (typeof window === "undefined") return 0;
    const stepId = new URLSearchParams(window.location.search).get("step");
    if (!stepId) return 0;
    const idx = steps.findIndex((s) => s.id === stepId);
    return idx >= 0 ? idx : 0;
  });
  const [onboardingStartTime] = useState(() => Date.now());

  // Strip the `?step=` query param from the URL after consuming it so a
  // browser refresh doesn't fight the user's natural in-wizard navigation.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.has("step")) {
      params.delete("step");
      const search = params.toString();
      const newUrl = `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`;
      window.history.replaceState({}, "", newUrl);
    }
  }, []);

  // Track initial step view on mount
  useEffect(() => {
    posthog.capture('coach_onboarding_step_viewed', {
      step_index: currentStep,
      step_name: steps[currentStep].id,
    });
    // Only fire once on mount — subsequent step views are tracked by nextStep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Profile data
  const [displayName, setDisplayName] = useState("");
  const [title, setTitle] = useState("");
  const [username, setUsername] = useState("");
  const [profileImageUrl, setProfileImageUrl] = useState("");

  // Contact step verification state — driven by ContactStep callbacks.
  // The verified email and phone come straight from auth.users (via the
  // ContactStep), not from free-text form inputs.
  const [contactBothVerified, setContactBothVerified] = useState(false);
  // Guard: auto-advance from the contact step exactly once per session, even
  // if the user navigates back to step 2 after both credentials are verified.
  const contactAutoAdvancedRef = useRef(false);
  const [verifiedContactEmail, setVerifiedContactEmail] = useState<string | null>(null);
  const [verifiedContactPhone, setVerifiedContactPhone] = useState<string | null>(null);
  const [contactPhoneSkipped, setContactPhoneSkipped] = useState(false);

  // Discovery data
  const [searchableLocation, setSearchableLocation] = useState("");
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);


  // Username availability state
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [usernameMessage, setUsernameMessage] = useState("");

  // Minimal shape of the profile API response used within onboarding.
  type ProfileSummary = {
    onboardingCompleted?: boolean;
    sourceChannel?: string | null;
    displayName?: string | null;
    title?: string | null;
    username?: string | null;
    profileImageUrl?: string | null;
  };

  // Check if user has already completed onboarding
  const { data: existingProfile, isLoading: profileLoading, error: profileError } = useQuery<ProfileSummary>({
    queryKey: ["/api/dashboard/profile"],
    enabled: isAuthenticated,
  });

  // The /api/dashboard/profile route returns `code: "PROFILE_DELETED"` when
  // the authenticated user matches a `deleted_account_markers` row written
  // before account deletion. That's our explicit signal for "previously
  // deleted" — surfaced here as a banner so the returning user understands
  // why they're back at onboarding. A brand-new signup (or a slow
  // onboarder coming back the next day) returns `PROFILE_MISSING` instead
  // and never sees this banner.
  const wasProfileDeleted =
    profileError instanceof ApiError && profileError.data?.code === "PROFILE_DELETED";


  // Single initialization effect: waits for BOTH user and existingProfile before
  // seeding the form. This eliminates the race where the OAuth-metadata path could
  // run first (user resolves before profile query) and fill displayName, preventing
  // the authoritative profile-row value from being written afterward.
  //
  // Priority: profile row data > OAuth user_metadata fallback.
  // WhatsApp-bot users: profile has displayName/title/username, metadata typically empty.
  // Google sign-up users: profile has no pre-set data, metadata has name/avatar.
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (!user || !existingProfile || hasInitialized.current) return;
    hasInitialized.current = true;

    // 1. Profile row — authoritative (set by WhatsApp bot or a prior partial signup)
    if (existingProfile.displayName) {
      setDisplayName(existingProfile.displayName);
    }
    if (existingProfile.title) {
      setTitle(existingProfile.title);
    }
    if (existingProfile.username) {
      // Use the skipAvailabilityCheck mechanism so the debounced availability
      // effect treats the pre-filled value as already-confirmed available,
      // instead of hitting /api/check-username (which would return "taken"
      // because the username belongs to this user's own profile).
      skipAvailabilityCheckForUsername.current = existingProfile.username;
      setUsername(existingProfile.username);
      setUsernameAvailable(true);
      setUsernameMessage("Username is available");
    }
    if (existingProfile.profileImageUrl) {
      setProfileImageUrl(existingProfile.profileImageUrl);
    }

    // 2. OAuth user_metadata — fallback for any field the profile row didn't supply
    //    (covers Google sign-up users whose profile row has no pre-set name/avatar)
    const metadata = user.user_metadata || {};
    const firstName = metadata.first_name || metadata.full_name?.split(' ')[0] || '';
    const lastName = metadata.last_name || metadata.full_name?.split(' ').slice(1).join(' ') || '';
    const metaFullName = `${firstName} ${lastName}`.trim();

    if (!existingProfile.displayName && metaFullName) {
      setDisplayName(metaFullName);
    }
    if (!existingProfile.profileImageUrl && metadata.avatar_url) {
      setProfileImageUrl(metadata.avatar_url);
    }
    // The verified email/phone are sourced directly from auth.users in the
    // contact step — no free-text form pre-fill needed here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, existingProfile]);

  // Redirect if already has profile with onboarding completed or existing user
  // Only show onboarding if onboardingCompleted is explicitly false
  useEffect(() => {
    if (!profileLoading && existingProfile) {
      // WhatsApp-bot signups in mid-claim get the dedicated
      // /whatsapp-verify flow rather than the 5-step wizard. Checked
      // before the dashboard branch because their onboardingCompleted
      // is also false until they finish the claim.
      if ((existingProfile as any)?.requiresWhatsappEmailVerification === true) {
        navigate("/whatsapp-verify");
        return;
      }
      // If onboardingCompleted is not explicitly false, user is done with onboarding
      if (existingProfile.onboardingCompleted !== false) {
        navigate("/dashboard");
      }
    }
  }, [existingProfile, profileLoading, navigate]);

  // Debounced username availability check with race condition handling
  useEffect(() => {
    // If auto-generation already confirmed this exact username, skip redundant re-check
    if (skipAvailabilityCheckForUsername.current === username) {
      skipAvailabilityCheckForUsername.current = null;
      return;
    }

    if (!username || username.length < 3) {
      setUsernameAvailable(null);
      setUsernameMessage("");
      setIsCheckingUsername(false);
      return;
    }

    const cleanUsername = username.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleanUsername.length < 3) {
      setUsernameAvailable(false);
      setUsernameMessage("Username must be at least 3 characters");
      setIsCheckingUsername(false);
      return;
    }

    // Track if this effect is still current (for race condition handling)
    let isCurrent = true;
    setIsCheckingUsername(true);
    setUsernameAvailable(null); // Reset to null while checking

    const timeoutId = setTimeout(async () => {
      try {
        const response = await fetch(`/api/check-username?username=${encodeURIComponent(cleanUsername)}`);
        if (!isCurrent) return; // Ignore if a newer request superseded this one

        if (!response.ok) {
          setUsernameAvailable(null);
          setUsernameMessage("Error checking username");
        } else {
          const data = await response.json();
          setUsernameAvailable(data.available);
          setUsernameMessage(data.message);
        }
      } catch (error) {
        if (!isCurrent) return;
        setUsernameAvailable(null);
        setUsernameMessage("Error checking username");
      } finally {
        if (isCurrent) {
          setIsCheckingUsername(false);
        }
      }
    }, 500); // 500ms debounce

    return () => {
      isCurrent = false; // Mark this effect as stale
      clearTimeout(timeoutId);
    };
  }, [username]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/auth");
    }
  }, [authLoading, isAuthenticated, navigate]);

  // Create profile mutation
  const createProfileMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/dashboard/profile", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/profile"] });
    },
  });

  // Store the exact auto-generated candidate to skip its re-check (instead of a generic boolean)
  const skipAvailabilityCheckForUsername = useRef<string | null>(null);
  // Monotonically increasing generation ID; stale async results are discarded
  const currentGenerationId = useRef(0);
  // Pending display-name debounce timer — cancelled when the user manually edits username
  const displayNameDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-generate a unique username from a display name, retrying indefinitely (on "taken")
  // until a unique candidate is confirmed, or breaking only on API/network errors.
  const generateAndSetUsername = async (name: string) => {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 15);

    if (base.length < 1) return;

    const generationId = ++currentGenerationId.current;

    setIsCheckingUsername(true);
    setUsernameAvailable(null);
    setUsernameMessage("");

    // Suffix width widens with each attempt so the search space expands as needed
    let suffixMax = 1000; // start at 3-digit suffix (0-999)
    let attempts = 0;

    while (true) {
      // Bail if a newer generation has started (user changed display name again)
      if (currentGenerationId.current !== generationId) return;

      const random = Math.floor(Math.random() * suffixMax);
      const candidate = `${base}${random}`;
      try {
        const response = await fetch(`/api/check-username?username=${encodeURIComponent(candidate)}`);

        if (currentGenerationId.current !== generationId) return;

        if (!response.ok) {
          // API error — surface it and stop
          setUsernameAvailable(null);
          setUsernameMessage("Error checking username");
          break;
        }

        const data = await response.json();
        if (data.available) {
          skipAvailabilityCheckForUsername.current = candidate;
          setUsername(candidate);
          setUsernameAvailable(true);
          setUsernameMessage(data.message);
          break;
        }
        // Username taken — widen suffix range every 20 failed attempts and retry
        attempts++;
        if (attempts % 20 === 0) suffixMax *= 10;
      } catch {
        if (currentGenerationId.current !== generationId) return;
        setUsernameAvailable(null);
        setUsernameMessage("Error checking username");
        break;
      }
    }

    if (currentGenerationId.current === generationId) {
      setIsCheckingUsername(false);
    }
  };

  // Debounce auto-generation ~1 second after the user stops typing their display name.
  // Skipped when username is already set (pre-filled from profile or previously auto-generated)
  // so we never silently overwrite a username the user has seen and accepted.
  // username is in deps so that:
  //   - clearing the username field re-triggers generation without needing to retype the name
  //   - the cleanup always cancels the previous timeout when username changes, avoiding stale callbacks
  useEffect(() => {
    if (!displayName || displayName.trim().length === 0) return;
    // Don't overwrite an existing username — the user must explicitly clear it first.
    if (username.trim()) return;

    const timeoutId = setTimeout(() => {
      displayNameDebounceTimer.current = null;
      generateAndSetUsername(displayName.trim());
    }, 1000);

    displayNameDebounceTimer.current = timeoutId;

    return () => {
      displayNameDebounceTimer.current = null;
      clearTimeout(timeoutId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayName, username]);

  // Tag handler for TagManager
  const handleTagsChange = (newTags: Tag[]) => {
    setSelectedTags(newTags);
  };

  const [isSavingDraft, setIsSavingDraft] = useState(false);

  // Navigation handlers
  const nextStep = async () => {
    if (currentStep < steps.length - 1) {
      // When leaving the profile step (step 1), save a draft profile row
      // immediately so the profiles table has a row BEFORE phone verification
      // (step 2) runs. attachVerifiedPhoneToCurrentUser does UPDATE profiles
      // WHERE id = userId — if no row exists it returns PROFILE_NOT_FOUND and
      // the user sees "Account profile is missing. Please contact support."
      if (currentStep === 1) {
        setIsSavingDraft(true);
        try {
          await createProfileMutation.mutateAsync({
            displayName: displayName.trim(),
            username: username.trim().toLowerCase(),
            title: title.trim() || null,
            profileImageUrl: profileImageUrl || null,
          });
        } catch (err) {
          // Log but don't block navigation — completeOnboarding() will retry
          // the full save at the final step. Better to let users continue than
          // trap them on a transient network error.
          console.warn('[onboarding] Draft profile save failed, continuing:', err);
        } finally {
          setIsSavingDraft(false);
        }
      }
      const nextIndex = currentStep + 1;
      posthog.capture('coach_onboarding_step_viewed', {
        step_index: nextIndex,
        step_name: steps[nextIndex].id,
      });
      setCurrentStep(nextIndex);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0: return true; // Welcome
      case 1: return displayName.trim() && username.trim() && username.length >= 3 && usernameAvailable === true && !isCheckingUsername; // Profile - require available username
      case 2: return contactBothVerified; // Contact — both credentials verified
      case 3: return true; // Discovery (optional)
      case 4: return true; // Orientation
      default: return true;
    }
  };

  // Force a Supabase session refresh so the local `user` claims (email,
  // phone, *_confirmed_at) reflect the latest server-side identity changes.
  // Used by ContactStep after a successful phone OTP verify or email-with-Google
  // swap so the field re-renders in its locked ✓ state.
  const refreshUser = useCallback(async () => {
    const supabase = await waitForSupabase();
    if (!supabase) return;
    try {
      await supabase.auth.refreshSession();
    } catch (err) {
      console.warn('[onboarding] refreshSession failed:', err);
    }
  }, []);

  const completeOnboarding = async () => {
    try {
      // Public profile contact_info derives from the verified credentials by
      // default — the user can edit these on their profile later. We use the
      // verified phone for both `phone` and `whatsapp` because that phone IS
      // their WhatsApp bot identity in the unified-auth model.
      const verifiedPhoneE164 = (!contactPhoneSkipped && verifiedContactPhone)
        ? verifiedContactPhone.startsWith('+')
          ? verifiedContactPhone
          : `+${verifiedContactPhone}`
        : null;

      await createProfileMutation.mutateAsync({
        displayName: displayName.trim(),
        username: username.trim().toLowerCase(),
        title: title.trim() || null,
        profileImageUrl: profileImageUrl || null,
        contactInfo: {
          phone: verifiedPhoneE164 || undefined,
          whatsapp: verifiedPhoneE164 || undefined,
          email: verifiedContactEmail || undefined,
        },
        searchableLocation: searchableLocation.trim() || null,
        searchTags: selectedTags.map(t => t.name),
        onboardingCompleted: true,
      });

      const onboardingCompletedAt = new Date().toISOString();
      posthog.capture('coach_onboarding_completed', {
        has_photo: !!profileImageUrl,
        has_title: !!title.trim(),
        has_contact_info: !!(verifiedContactPhone || verifiedContactEmail),
        has_location: !!searchableLocation.trim(),
        has_tags: selectedTags.length > 0,
        time_to_complete_ms: Date.now() - onboardingStartTime,
      });
      posthog.setPersonProperties({ onboarding_completed_at: onboardingCompletedAt });

      // Refresh the auth state so the onboarding guard knows user has completed onboarding
      await refreshOnboardingStatus();

      toast({ title: "Welcome to Riplect!", description: "Your profile has been created." });
      navigate("/dashboard");
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to create profile", 
        variant: "destructive" 
      });
    }
  };

  if (authLoading || profileLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#FDF6EE]/50 to-white flex items-center justify-center relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#b66667]/5 rounded-full blur-[100px] translate-x-1/2 -translate-y-1/2 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-blue-500 opacity-[0.02] rounded-full blur-[120px] -translate-x-1/3 translate-y-1/3 pointer-events-none" />
        <Loader2 className="w-8 h-8 animate-spin text-[#b66667] relative z-10" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FDF6EE]/50 to-white relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#b66667]/5 rounded-full blur-[100px] translate-x-1/2 -translate-y-1/2 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-blue-500 opacity-[0.02] rounded-full blur-[120px] -translate-x-1/3 translate-y-1/3 pointer-events-none" />

      {/* Header with logo */}
      <div className="relative z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-start items-center py-2">
            <img 
              src={headerLogo} 
              alt="Riplect" 
              className="h-12 sm:h-20 -ml-3 cursor-pointer"
              data-testid="img-onboarding-logo"
              onClick={async () => {
                const supabase = await waitForSupabase();
                if (supabase) await supabase.auth.signOut();
                navigate("/");
              }}
            />
          </div>
        </div>
      </div>

      {wasProfileDeleted && (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 relative z-10">
          <div
            className="rounded-lg border border-[#b66667]/30 bg-[#FDF6EE] px-4 py-3 text-sm text-[#7a3a3b]"
            data-testid="banner-profile-deleted"
          >
            Welcome back — your previous profile was removed. Let's set things up again to continue.
          </div>
        </div>
      )}

      {/* Progress indicator */}
      <div className="max-w-4xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 relative z-10">
        <div className="flex items-center w-full mb-6 sm:mb-8">
          {steps.map((step, index) => (
            <Fragment key={step.id}>
              <div
                className={`w-7 h-7 sm:w-10 sm:h-10 flex-shrink-0 rounded-full flex items-center justify-center transition-all ${
                  index < currentStep
                    ? 'bg-[#b66667] text-white'
                    : index === currentStep
                    ? 'bg-[#b66667] text-white ring-2 sm:ring-4 ring-[#b66667]/20'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                {index < currentStep ? (
                  <Check className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
                ) : (
                  <step.icon className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
                )}
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`flex-1 min-w-0 h-0.5 sm:h-1 mx-1 sm:mx-2 rounded ${
                    index < currentStep ? 'bg-[#b66667]' : 'bg-gray-200'
                  }`}
                />
              )}
            </Fragment>
          ))}
        </div>

        {/* Step content */}
        <div className="max-w-2xl mx-auto px-1 sm:px-0">
          {/* Welcome Step */}
          {currentStep === 0 && (
            <Card className="border-gray-200 shadow-sm bg-white">
              <CardHeader className="text-center pb-2">
                <div className="flex items-center justify-center mx-auto mb-2">
                  <img 
                    src={welcomeLogo} 
                    alt="Riplect" 
                    className="h-24 sm:h-36 w-auto" 
                    data-testid="img-welcome-logo"
                  />
                </div>
                <CardTitle className="text-2xl text-gray-900">Welcome to Riplect!</CardTitle>
                <CardDescription className="text-base text-gray-600 mt-2">
                  Let's set up your creator profile in just a few steps. This will help your clients find and connect with you.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="space-y-4 text-center">
                  <p className="text-gray-600">
                    You'll be able to:
                  </p>
                  <ul className="space-y-2 text-left max-w-sm mx-auto">
                    <li className="flex items-center gap-2 text-gray-700">
                      <Check className="w-5 h-5 text-[#b66667]" />
                      Create your public profile page
                    </li>
                    <li className="flex items-center gap-2 text-gray-700">
                      <Check className="w-5 h-5 text-[#b66667]" />
                      Offer booking sessions and events
                    </li>
                    <li className="flex items-center gap-2 text-gray-700">
                      <Check className="w-5 h-5 text-[#b66667]" />
                      Sell digital products
                    </li>
                    <li className="flex items-center gap-2 text-gray-700">
                      <Check className="w-5 h-5 text-[#b66667]" />
                      Share blogs and connect with clients
                    </li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Profile Setup Step */}
          {currentStep === 1 && (
            <Card className="border-gray-200 shadow-sm bg-white">
              <CardHeader>
                <CardTitle className="text-xl text-gray-900">Profile Setup</CardTitle>
                <CardDescription>
                  Add your basic information to create your public profile
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Profile Picture - Using shared component for consistent 4:5 aspect ratio */}
                <ProfilePictureUpload
                  currentImageUrl={profileImageUrl}
                  onImageUploaded={(url) => setProfileImageUrl(url)}
                  autoSaveToDatabase={false}
                />

                {/* Display Name */}
                <div className="space-y-2">
                  <Label htmlFor="displayName">Display Name *</Label>
                  <Input
                    id="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your full name"
                    data-testid="input-display-name"
                  />
                </div>

                {/* Professional Title */}
                <div className="space-y-2">
                  <Label htmlFor="title">Professional Title</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Life Coach, Yoga Instructor, Business Mentor"
                    data-testid="input-title"
                  />
                </div>

                {/* Username */}
                <div className="space-y-2">
                  <Label htmlFor="username">Username *</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs sm:text-sm leading-none">riplek.com/</span>
                    <Input
                      id="username"
                      value={username}
                      onChange={(e) => {
                        // Cancel pending display-name debounce and any in-flight auto-generation
                        if (displayNameDebounceTimer.current !== null) {
                          clearTimeout(displayNameDebounceTimer.current);
                          displayNameDebounceTimer.current = null;
                        }
                        currentGenerationId.current++;
                        skipAvailabilityCheckForUsername.current = null;
                        setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''));
                      }}
                      className={`pl-[82px] sm:pl-[100px] pr-10 ${
                        username.length >= 3 
                          ? usernameAvailable === true 
                            ? 'border-green-500 focus-visible:ring-green-500' 
                            : usernameAvailable === false 
                              ? 'border-red-500 focus-visible:ring-red-500' 
                              : ''
                          : ''
                      }`}
                      placeholder="yourname"
                      data-testid="input-username"
                    />
                    {/* Username status indicator */}
                    {(username.length >= 3 || isCheckingUsername) && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {isCheckingUsername ? (
                          <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                        ) : usernameAvailable === true ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : usernameAvailable === false ? (
                          <X className="w-4 h-4 text-red-500" />
                        ) : null}
                      </div>
                    )}
                  </div>
                  {/* Username availability message */}
                  {username.length >= 3 && usernameMessage && (
                    <p className={`text-xs ${usernameAvailable ? 'text-green-600' : 'text-red-600'}`}>
                      {usernameMessage}
                    </p>
                  )}
                  {(!username || username.length < 3) && (
                    <p className="text-xs text-gray-500">This will be your public profile URL (min 3 characters)</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Contact Info Step — verification gateway (Task #152). Whichever
              credential the user signed up with is locked + ✓ verified; the
              other must be verified here before they can advance. */}
          {currentStep === 2 && (
            <ContactStep
              user={user}
              sourceChannel={existingProfile?.sourceChannel ?? null}
              refreshUser={refreshUser}
              onVerifiedChange={({ bothVerified, verifiedEmail, verifiedPhone, phoneSkipped }) => {
                setContactBothVerified(bothVerified);
                setVerifiedContactEmail(verifiedEmail);
                setVerifiedContactPhone(verifiedPhone);
                setContactPhoneSkipped(phoneSkipped);
              }}
              onBothVerified={({ verifiedEmail, verifiedPhone }) => {
                // Auto-advance to the next step the moment both credentials
                // are verified — including the cross-tab case where the user
                // clicks the email link in another tab and Supabase fires
                // SIGNED_IN/USER_UPDATED here. Guarded so revisiting step 2
                // after completion doesn't re-fire. Routed through
                // nextStep() so the coach_onboarding_step_viewed milestone
                // for the next step still fires on the auto-advance path.
                setVerifiedContactEmail(verifiedEmail);
                setVerifiedContactPhone(verifiedPhone);
                setContactBothVerified(true);
                if (
                  !contactAutoAdvancedRef.current &&
                  currentStep === 2 &&
                  currentStep < steps.length - 1
                ) {
                  contactAutoAdvancedRef.current = true;
                  nextStep();
                }
              }}
            />
          )}

          {/* Discovery Step */}
          {currentStep === 3 && (
            <Card className="border-gray-200 shadow-sm bg-white">
              <CardHeader>
                <CardTitle className="text-xl text-gray-900">Help Clients Find You</CardTitle>
                <CardDescription>
                  Add your location and tags so potential clients can discover you
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Search Location
                  </Label>
                  <p className="text-xs text-gray-500"> This helps clients in your area find you</p>
                  <CitySearchBar
                    value={searchableLocation}
                    onChange={(value) => setSearchableLocation(value)}
                    placeholder="Search for a city or town..."
                  />
                </div>

                <div className="space-y-2">
                  <Label>Tags & Expertise</Label>
                  <p className="text-xs text-gray-500">Tags help clients find you based on your expertise</p>
                  <TagManager
                    entityType="profile"
                    selectedTags={selectedTags}
                    onTagsChange={handleTagsChange}
                    maxTags={20}
                    allowCreate={true}
                    showSuggestions={true}
                    variant="inline"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Orientation Step */}
          {currentStep === 4 && (
            <Card className="border-gray-200 shadow-sm bg-white">
              <CardHeader className="text-center pb-2">
                <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <Check className="w-10 h-10 text-green-600" />
                </div>
                <CardTitle className="text-2xl text-gray-900">You're All Set!</CardTitle>
                <CardDescription className="text-base text-gray-600 mt-2">
                  Your profile is ready. Here's what you can do next:
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="space-y-4 w-full max-w-lg mx-auto">
                  <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="w-8 h-8 rounded-full bg-[#b66667] text-white flex items-center justify-center flex-shrink-0 text-sm font-medium">1</div>
                    <div>
                      <p className="font-medium text-gray-900">Complete your profile</p>
                      <p className="text-sm text-gray-600">Add your bio, gallery, and more details</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="w-8 h-8 rounded-full bg-[#b66667] text-white flex items-center justify-center flex-shrink-0 text-sm font-medium">2</div>
                    <div>
                      <p className="font-medium text-gray-900">Create your first session or event</p>
                      <p className="text-sm text-gray-600">Set up booking sessions and events for your clients</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="w-8 h-8 rounded-full bg-[#b66667] text-white flex items-center justify-center flex-shrink-0 text-sm font-medium">3</div>
                    <div>
                      <p className="font-medium text-gray-900">Share your profile</p>
                      <p className="text-sm text-gray-600 break-all">Your public profile will be at riplek.com/{username || 'yourname'}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Navigation buttons */}
          <div className="flex justify-between gap-4 mt-6 sm:mt-8 pb-6">
            <Button
              variant="outline"
              onClick={prevStep}
              disabled={currentStep === 0}
              data-testid="button-prev-step"
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Back
            </Button>

            {currentStep < steps.length - 1 ? (
              <Button
                onClick={nextStep}
                disabled={!canProceed() || isSavingDraft}
                className="bg-[#b66667] hover:bg-[#b85858]"
                data-testid="button-next-step"
              >
                {isSavingDraft ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    Continue
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={completeOnboarding}
                disabled={createProfileMutation.isPending}
                className="bg-[#b66667] hover:bg-[#b85858]"
                data-testid="button-complete-onboarding"
              >
                {createProfileMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Setting up...
                  </>
                ) : (
                  <>
                    Go to Dashboard
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}