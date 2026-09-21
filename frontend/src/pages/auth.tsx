import { useState, useEffect, useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation, useRoute } from "wouter";
import {
  Mail,
  Lock,
  User,
  ArrowLeft,
  AlertCircle,
  Loader2,
  Phone,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import { waitForSupabase } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { posthog } from "@/lib/posthog";

const PASSWORD_REQUIREMENTS = [
  { label: "At least 8 characters", regex: /.{8,}/ },
  { label: "At least one uppercase letter", regex: /[A-Z]/ },
  { label: "At least one number", regex: /[0-9]/ },
  { label: "At least one special character (!@#$%^&* etc.)", regex: /[^A-Za-z0-9]/ },
];

const PASSWORD_ERROR_MESSAGE =
  "Password must be at least 8 characters and include an uppercase letter, a number, and a special character.";

const RESEND_COOLDOWN_SECONDS = 30;

const signupSchema = z
  .object({
    email: z.string().email("Invalid email address"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Password must include at least one uppercase letter")
      .regex(/[0-9]/, "Password must include at least one number")
      .regex(/[^A-Za-z0-9]/, "Password must include at least one special character"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

const phoneLoginSchema = z.object({
  phone: z
    .string()
    .min(10, "Enter a valid phone number with country code")
    .regex(/^\+?[0-9 ()-]{10,20}$/, "Phone may only contain digits, spaces, '+', '-', '(' and ')'"),
});

const otpVerifySchema = z.object({
  otp: z.string().length(6, "Code must be 6 digits").regex(/^[0-9]+$/, "Code must be numbers only"),
});

type SignupFormData = z.infer<typeof signupSchema>;
type LoginFormData = z.infer<typeof loginSchema>;
type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;
type PhoneLoginFormData = z.infer<typeof phoneLoginSchema>;
type OtpVerifyFormData = z.infer<typeof otpVerifySchema>;

/**
 * Normalize a user-typed phone string to E.164-ish: strip spaces / dashes /
 * parens. Leaves the leading "+" intact. Supabase's GoTrue accepts E.164.
 */
function normalizePhone(raw: string): string {
  return raw.replace(/[\s()\-]/g, "");
}

/**
 * Detect "claim" mode: either the dedicated `/claim` route (used by the
 * WhatsApp-bot handoff link) OR an `?from=bot` query param. In claim mode we
 * pre-select the phone CTA, pre-fill the phone field from `?phone=`, and show
 * a "welcome — verify it's you" header instead of the generic login copy.
 */
function useClaimContext() {
  const [claimRouteMatch] = useRoute("/claim");
  const initial = useMemo(() => {
    if (typeof window === "undefined") {
      return { isClaim: false, prefillPhone: "" };
    }
    const params = new URLSearchParams(window.location.search);
    const phoneParam = params.get("phone") || "";
    const fromBot = params.get("from") === "bot";
    return {
      isClaim: claimRouteMatch || fromBot || !!phoneParam,
      prefillPhone: phoneParam,
    };
    // We intentionally only read window.location.search once at mount — the
    // page is a hard-navigation target from the bot, not a SPA re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimRouteMatch]);
  return initial;
}

export default function Auth() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const claim = useClaimContext();

  const [activeTab, setActiveTab] = useState<"login" | "signup">("login");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showEmailMethod, setShowEmailMethod] = useState<boolean>(!claim.isClaim);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [signedUpEmail, setSignedUpEmail] = useState<string | null>(null);
  const [phoneStep, setPhoneStep] = useState<"input" | "otp">("input");
  const [phoneNumber, setPhoneNumber] = useState("");
  const otpChannel = "sms" as const;
  const [resendCountdown, setResendCountdown] = useState(0);
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // Track which method the user picked for analytics; consumed in the
  // /auth/callback handler to attribute login_method correctly. We always
  // explicitly write or clear `auth_from` so a stale value from a previous
  // claim attempt cannot leak into a later non-claim sign-in.
  const recordMethodPicked = (method: "google" | "phone" | "email") => {
    sessionStorage.setItem("auth_method", method);
    if (claim.isClaim) {
      sessionStorage.setItem("auth_from", "bot_claim");
    } else {
      sessionStorage.removeItem("auth_from");
    }
    posthog.capture("coach_login_method_selected", {
      method,
      from: claim.isClaim ? "bot_claim" : "direct",
    });
  };

  useEffect(() => {
    const init = async () => {
      const client = await waitForSupabase();
      setSupabase(client);
      setIsInitializing(false);

      if (client) {
        const {
          data: { session },
        } = await client.auth.getSession();
        if (session) {
          setLocation("/dashboard");
        }
      }
    };
    init();
  }, [setLocation]);

  // Resend cooldown timer for OTP.
  useEffect(() => {
    if (resendCountdown <= 0) return;
    const id = setTimeout(() => setResendCountdown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCountdown]);

  const signupForm = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    mode: "onTouched",
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
      firstName: "",
      lastName: "",
    },
  });

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    mode: "onTouched",
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const forgotPasswordForm = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  });

  const phoneLoginForm = useForm<PhoneLoginFormData>({
    resolver: zodResolver(phoneLoginSchema),
    defaultValues: {
      phone: claim.prefillPhone || "+91",
    },
  });

  // Pre-fill the phone input once Supabase is ready in claim mode.
  const phonePrefilledRef = useRef(false);
  useEffect(() => {
    if (!phonePrefilledRef.current && claim.prefillPhone) {
      phoneLoginForm.setValue("phone", claim.prefillPhone);
      phonePrefilledRef.current = true;
    }
  }, [claim.prefillPhone, phoneLoginForm]);

  const otpVerifyForm = useForm<OtpVerifyFormData>({
    resolver: zodResolver(otpVerifySchema),
    defaultValues: {
      otp: "",
    },
  });

  const handleGoogleLogin = async () => {
    if (!supabase) {
      toast({
        title: "Configuration Error",
        description: "Authentication is not configured. Please contact support.",
        variant: "destructive",
      });
      return;
    }

    try {
      recordMethodPicked("google");
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
    } catch (error: any) {
      toast({
        title: "Google Login Failed",
        description: error.message || "An error occurred. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleSignup = async (data: SignupFormData) => {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.email,
          password: data.password,
          firstName: data.firstName || "",
          lastName: data.lastName || "",
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        const rawError: string = json.error || "";
        const isPatternError = rawError.toLowerCase().includes("did not match the expected pattern");
        throw new Error(
          isPatternError ? PASSWORD_ERROR_MESSAGE : rawError || "An error occurred. Please try again.",
        );
      }

      posthog.capture("coach_signed_up", { method: "email" });
      posthog.identify(data.email, {
        name: [data.firstName, data.lastName].filter(Boolean).join(" "),
        email: data.email,
        signup_method: "email",
      });

      toast({
        title: "Account Created!",
        description: "Please check your email to verify your account.",
      });

      setSignedUpEmail(data.email);
      signupForm.reset();
      setActiveTab("login");
    } catch (error: any) {
      toast({
        title: "Signup Failed",
        description: error.message || "An error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogin = async (data: LoginFormData) => {
    if (!supabase) {
      toast({
        title: "Configuration Error",
        description: "Authentication is not configured. Please contact support.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      recordMethodPicked("email");
      const { error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (error) throw error;

      toast({
        title: "Welcome Back!",
        description: "You have successfully logged in.",
      });

      // Always route through /auth/callback so the post-login routing
      // (returnTo / dashboard / onboarding) and analytics (coach_logged_in
      // vs coach_signed_up) live in one place. Callback reads & clears
      // returnTo + auth_method/auth_from from sessionStorage.
      setTimeout(() => {
        window.location.href = "/auth/callback";
      }, 500);
    } catch (error: any) {
      const isUnverified =
        error.message?.toLowerCase().includes("email not confirmed") ||
        error.message?.toLowerCase().includes("not confirmed");
      if (isUnverified) {
        setSignedUpEmail(data.email);
      }
      toast({
        title: "Login Failed",
        description: isUnverified
          ? "Your email is not verified yet. Please check your inbox."
          : error.message || "Invalid email or password.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendVerification = async (email: string) => {
    setIsResendingVerification(true);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to resend verification email.");
      }
      toast({
        title: "Verification Email Sent",
        description: "Please check your inbox (and spam folder) for the verification link.",
      });
    } catch (error: any) {
      toast({
        title: "Failed to Resend",
        description: error.message || "An error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsResendingVerification(false);
    }
  };

  const handleForgotPassword = async (data: ForgotPasswordFormData) => {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.email }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Failed to send reset email.");
      }

      toast({
        title: "Check Your Email",
        description: "Password reset instructions sent.",
      });

      forgotPasswordForm.reset();
      setShowForgotPassword(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send reset email.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Send the OTP via Supabase GoTrue. We use the *Supabase* client (not Task
   * #150's `/api/auth/phone/send-otp`) because:
   *   - GoTrue's signInWithOtp creates an `auth.users` row on first sign-in
   *     and reconciles to the existing row on returning sign-ins (incl.
   *     bot-created phone-only users), giving us the no-duplicate guarantee.
   *   - Task #150's endpoint is for *attaching* a verified phone to an
   *     already-authenticated session — used by ContactStep, not by login.
   */
  const sendOtp = async (rawPhone: string) => {
    if (!supabase) throw new Error("Authentication is not configured.");
    const phone = normalizePhone(rawPhone);
    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: { channel: "sms" },
    });
    if (error) throw error;
    return phone;
  };

  const handlePhoneSendOtp = async (data: PhoneLoginFormData) => {
    if (!supabase) {
      toast({
        title: "Configuration Error",
        description: "Authentication is not configured. Please contact support.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      recordMethodPicked("phone");
      const phone = await sendOtp(data.phone);

      setPhoneNumber(phone);
      setPhoneStep("otp");
      setResendCountdown(RESEND_COOLDOWN_SECONDS);
      otpVerifyForm.reset({ otp: "" });
      posthog.capture("coach_otp_sent", { channel: otpChannel, from: claim.isClaim ? "bot_claim" : "direct" });
      toast({
        title: "Code sent via SMS",
        description: `We sent a 6-digit code to ${phone}.`,
      });
    } catch (error: any) {
      const msg = error?.message || "";
      const isRateLimited = /rate limit|too many|wait/i.test(msg);
      posthog.capture("coach_otp_failed", { stage: "send", channel: otpChannel, reason: msg });
      toast({
        title: isRateLimited ? "Too many attempts" : "Failed to Send Code",
        description: isRateLimited
          ? "Please wait a moment before requesting another code."
          : msg || "An error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCountdown > 0 || !phoneNumber) return;
    setIsSubmitting(true);
    try {
      await sendOtp(phoneNumber);
      setResendCountdown(RESEND_COOLDOWN_SECONDS);
      posthog.capture("coach_otp_sent", {
        channel: otpChannel,
        resend: true,
        from: claim.isClaim ? "bot_claim" : "direct",
      });
      toast({
        title: "Code resent",
        description: `New 6-digit code sent to ${phoneNumber}.`,
      });
    } catch (error: any) {
      const msg = error?.message || "";
      posthog.capture("coach_otp_failed", { stage: "resend", channel: otpChannel, reason: msg });
      toast({
        title: "Failed to Resend",
        description: msg || "An error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOtpVerify = async (data: OtpVerifyFormData) => {
    if (!supabase) return;

    setIsSubmitting(true);
    try {
      // GoTrue accepts type 'sms' for both SMS and WhatsApp Twilio Verify
      // OTPs — the channel is a delivery hint at send time, the verify token
      // type is always 'sms' for phone-based one-time codes.
      const { error } = await supabase.auth.verifyOtp({
        phone: phoneNumber,
        token: data.otp,
        type: "sms",
      });
      if (error) throw error;

      posthog.capture("coach_otp_verified", {
        channel: otpChannel,
        from: claim.isClaim ? "bot_claim" : "direct",
      });

      toast({
        title: "Welcome!",
        description: "You're signed in.",
      });

      // Always route through /auth/callback. recordMethodPicked('phone')
      // already wrote auth_method/auth_from; the callback consumes them and
      // emits coach_logged_in or coach_signed_up based on profile state.
      setTimeout(() => {
        window.location.href = "/auth/callback";
      }, 500);
    } catch (error: any) {
      const msg = error?.message || "";
      posthog.capture("coach_otp_failed", { stage: "verify", channel: otpChannel, reason: msg });
      toast({
        title: "Verification Failed",
        description: msg || "Invalid code. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#b66667]" />
      </div>
    );
  }

  if (!supabase) {
    return (
      <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <AlertCircle className="w-12 h-12 text-muted-foreground" />
              <h2 className="text-xl font-semibold">Authentication Not Configured</h2>
              <p className="text-muted-foreground">
                Please configure Supabase credentials to enable authentication.
              </p>
              <Link href="/">
                <Button variant="outline">Return Home</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (showForgotPassword) {
    return (
      <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Button
              variant="ghost"
              className="mb-4"
              data-testid="button-back-to-login"
              onClick={() => setShowForgotPassword(false)}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Login
            </Button>
            <h1 className="text-3xl font-bold">Reset Password</h1>
            <p className="mt-2 text-muted-foreground">Enter your email to receive reset instructions</p>
          </div>

          <Card className="shadow-xl">
            <CardContent className="pt-6">
              <Form {...forgotPasswordForm}>
                <form onSubmit={forgotPasswordForm.handleSubmit(handleForgotPassword)} className="space-y-4">
                  <FormField
                    control={forgotPasswordForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                            <Input
                              type="email"
                              placeholder="you@example.com"
                              className="pl-10"
                              data-testid="input-forgot-email"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    className="w-full bg-[#b66667] hover:bg-[#B85858]"
                    disabled={isSubmitting}
                    data-testid="button-send-reset"
                  >
                    {isSubmitting ? "Sending..." : "Send Reset Link"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <Link href="/">
            <h1 className="text-4xl font-bold text-[#b66667] cursor-pointer hover:opacity-80">Riplect</h1>
          </Link>
          {claim.isClaim ? (
            <div
              className="mt-4 rounded-lg border border-[#b66667]/30 bg-[#b66667]/5 px-4 py-3 text-left"
              data-testid="banner-claim"
            >
              <div className="flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-[#b66667] mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-foreground">Welcome to Riplect</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Verify it's you to continue setting up your creator account.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-muted-foreground">Welcome to your creator platform</p>
          )}
        </div>

        <Card className="shadow-xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-2xl text-center">
              {claim.isClaim ? "Continue with your phone" : "Get Started"}
            </CardTitle>
            {!claim.isClaim && (
              <CardDescription className="text-center">
                Sign in or create an account to continue
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-5">
            {/* METHOD 1 — Google */}
            <Button
              onClick={handleGoogleLogin}
              variant="outline"
              className="w-full flex items-center justify-center gap-2 h-11 border-2"
              data-testid="button-google-login"
            >
              <FcGoogle className="w-5 h-5" />
              Continue with Google
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">or</span>
              </div>
            </div>

            {/* METHOD 2 — Phone OTP */}
            {phoneStep === "input" ? (
              <Form {...phoneLoginForm}>
                <form onSubmit={phoneLoginForm.handleSubmit(handlePhoneSendOtp)} className="space-y-3">
                  <FormField
                    control={phoneLoginForm.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Continue with phone</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                            <Input
                              type="tel"
                              placeholder="+91 98765 43210"
                              className="pl-10"
                              autoComplete="tel"
                              data-testid="input-phone-number"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    className="w-full bg-[#b66667] hover:bg-[#B85858] h-11"
                    disabled={isSubmitting}
                    data-testid="button-send-otp"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Sending…
                      </>
                    ) : (
                      "Send code"
                    )}
                  </Button>
                </form>
              </Form>
            ) : (
              <div className="space-y-3" data-testid="phone-otp-step">
                <p className="text-sm text-muted-foreground text-center">
                  Enter the 6-digit code sent to <span className="font-medium text-foreground">{phoneNumber}</span>
                </p>
                <Form {...otpVerifyForm}>
                  <form onSubmit={otpVerifyForm.handleSubmit(handleOtpVerify)} className="space-y-3">
                    <FormField
                      control={otpVerifyForm.control}
                      name="otp"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="sr-only">Verification Code</FormLabel>
                          <FormControl>
                            <Input
                              type="text"
                              inputMode="numeric"
                              autoComplete="one-time-code"
                              maxLength={6}
                              placeholder="000000"
                              className="text-center text-lg tracking-widest h-12"
                              data-testid="input-otp-code"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="submit"
                      className="w-full bg-[#b66667] hover:bg-[#B85858] h-11"
                      disabled={isSubmitting}
                      data-testid="button-verify-otp"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          Verifying…
                        </>
                      ) : (
                        "Verify & continue"
                      )}
                    </Button>
                    <div className="flex items-center justify-between text-sm">
                      <button
                        type="button"
                        onClick={() => {
                          setPhoneStep("input");
                          otpVerifyForm.reset();
                          setResendCountdown(0);
                        }}
                        className="text-muted-foreground hover:text-foreground hover:underline"
                        data-testid="button-change-phone"
                      >
                        Use a different number
                      </button>
                      <button
                        type="button"
                        onClick={handleResendOtp}
                        disabled={resendCountdown > 0 || isSubmitting}
                        className="text-[#b66667] hover:underline disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline"
                        data-testid="button-resend-otp"
                      >
                        {resendCountdown > 0 ? `Resend in ${resendCountdown}s` : "Resend code"}
                      </button>
                    </div>
                  </form>
                </Form>
              </div>
            )}

            {/* METHOD 3 — Email (collapsible) */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowEmailMethod((v) => !v)}
                className="flex items-center justify-center gap-1.5 w-full text-sm text-muted-foreground hover:text-foreground"
                data-testid="button-toggle-email"
                aria-expanded={showEmailMethod}
              >
                <Mail className="w-4 h-4" />
                {showEmailMethod ? "Hide email options" : "Continue with email"}
                {showEmailMethod ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>

            {showEmailMethod && (
              <div className="pt-1" data-testid="email-method-section">
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "login" | "signup")}>
                  <TabsList className="grid w-full grid-cols-2 mb-4">
                    <TabsTrigger value="login" data-testid="tab-login">
                      Login
                    </TabsTrigger>
                    <TabsTrigger value="signup" data-testid="tab-signup">
                      Sign Up
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="login">
                    <Form {...loginForm}>
                      <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
                        <FormField
                          control={loginForm.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Email</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                                  <Input
                                    type="email"
                                    placeholder="you@example.com"
                                    className="pl-10"
                                    data-testid="input-login-email"
                                    {...field}
                                  />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={loginForm.control}
                          name="password"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Password</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                                  <Input
                                    type="password"
                                    placeholder="********"
                                    className="pl-10"
                                    autoComplete="current-password"
                                    data-testid="input-login-password"
                                    {...field}
                                  />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => setShowForgotPassword(true)}
                            className="text-sm text-[#b66667] hover:underline"
                            data-testid="link-forgot-password"
                          >
                            Forgot password?
                          </button>
                        </div>

                        <Button
                          type="submit"
                          className="w-full bg-[#b66667] hover:bg-[#B85858]"
                          disabled={isSubmitting}
                          data-testid="button-login-submit"
                        >
                          {isSubmitting ? "Logging in..." : "Log In"}
                        </Button>
                      </form>
                    </Form>

                    {signedUpEmail && (
                      <div className="mt-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-sm">
                        <p className="text-amber-800 dark:text-amber-200 mb-2">
                          Didn't receive the verification email?
                        </p>
                        <button
                          type="button"
                          onClick={() => handleResendVerification(signedUpEmail)}
                          disabled={isResendingVerification}
                          className="text-[#b66667] hover:underline font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                          data-testid="button-resend-verification"
                        >
                          {isResendingVerification ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Sending…
                            </>
                          ) : (
                            "Resend verification email"
                          )}
                        </button>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="signup">
                    <Form {...signupForm}>
                      <form onSubmit={signupForm.handleSubmit(handleSignup)} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={signupForm.control}
                            name="firstName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>First Name</FormLabel>
                                <FormControl>
                                  <div className="relative">
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                                    <Input
                                      placeholder="John"
                                      className="pl-10"
                                      data-testid="input-signup-firstname"
                                      {...field}
                                    />
                                  </div>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={signupForm.control}
                            name="lastName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Last Name</FormLabel>
                                <FormControl>
                                  <Input placeholder="Doe" data-testid="input-signup-lastname" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <FormField
                          control={signupForm.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Email</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                                  <Input
                                    type="email"
                                    placeholder="you@example.com"
                                    className="pl-10"
                                    data-testid="input-signup-email"
                                    {...field}
                                  />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={signupForm.control}
                          name="password"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Password</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                                  <Input
                                    type="password"
                                    placeholder="At least 8 characters"
                                    className="pl-10"
                                    data-testid="input-signup-password"
                                    {...field}
                                    onChange={(e) => {
                                      field.onChange(e);
                                      if (signupForm.getFieldState("confirmPassword").isTouched) {
                                        signupForm.trigger("confirmPassword");
                                      }
                                    }}
                                  />
                                </div>
                              </FormControl>
                              <FormMessage />
                              {field.value && (
                                <ul className="mt-2 space-y-1" data-testid="password-requirements">
                                  {PASSWORD_REQUIREMENTS.map((req) => {
                                    const met = req.regex.test(field.value);
                                    return (
                                      <li
                                        key={req.label}
                                        className={`flex items-center gap-1.5 text-xs ${
                                          met
                                            ? "text-green-600 dark:text-green-400"
                                            : "text-muted-foreground"
                                        }`}
                                        data-testid={`req-${met ? "met" : "unmet"}`}
                                      >
                                        <span className="shrink-0">{met ? "✓" : "○"}</span>
                                        {req.label}
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={signupForm.control}
                          name="confirmPassword"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Confirm Password</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                                  <Input
                                    type="password"
                                    placeholder="Re-enter your password"
                                    className="pl-10"
                                    data-testid="input-signup-confirm-password"
                                    {...field}
                                    onChange={(e) => {
                                      field.onChange(e);
                                      if (signupForm.getFieldState("password").isTouched) {
                                        signupForm.trigger("password");
                                      }
                                    }}
                                  />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <Button
                          type="submit"
                          className="w-full bg-[#b66667] hover:bg-[#B85858]"
                          disabled={isSubmitting}
                          data-testid="button-signup-submit"
                        >
                          {isSubmitting ? "Creating account..." : "Create Account"}
                        </Button>

                        <p className="text-xs text-center text-muted-foreground">
                          By signing up, you agree to our{" "}
                          <Link
                            href="/terms-of-service"
                            className="underline underline-offset-2 hover:text-foreground"
                            data-testid="link-terms-of-service"
                          >
                            Terms of Service
                          </Link>{" "}
                          and{" "}
                          <Link
                            href="/privacy-policy"
                            className="underline underline-offset-2 hover:text-foreground"
                            data-testid="link-privacy-policy"
                          >
                            Privacy Policy
                          </Link>
                        </p>
                      </form>
                    </Form>
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
