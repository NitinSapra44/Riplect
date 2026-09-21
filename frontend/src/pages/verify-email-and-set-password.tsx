import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useLocation } from "wouter";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import {
  AlertCircle,
  CheckCircle,
  Lock,
  Loader2,
  Mail,
  Check,
  X,
} from "lucide-react";
import { waitForSupabase, signOutCompletely } from "@/lib/supabase";
import { posthog } from "@/lib/posthog";

/* ----------------------------------------------------------------
 * Password policy — must mirror the server
 * (server/auth/identityLinking.ts → validatePasswordPolicy) AND the
 * existing signup form in client/src/pages/auth.tsx so the user sees
 * one consistent rule set across the app.
 * ---------------------------------------------------------------- */
const PASSWORD_REQUIREMENTS = [
  { id: "len", label: "At least 8 characters", regex: /.{8,}/ },
  { id: "upper", label: "At least one uppercase letter", regex: /[A-Z]/ },
  { id: "num", label: "At least one number", regex: /[0-9]/ },
  {
    id: "sym",
    label: "At least one special character (!@#$%^&* etc.)",
    regex: /[^A-Za-z0-9]/,
  },
] as const;

const setPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Password must include at least one uppercase letter")
      .regex(/[0-9]/, "Password must include at least one number")
      .regex(
        /[^A-Za-z0-9]/,
        "Password must include at least one special character",
      ),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type SetPasswordFormData = z.infer<typeof setPasswordSchema>;

type InspectState =
  | { status: "loading" }
  | { status: "ready"; email: string; nextStep: string | null }
  | {
      status: "error";
      // INVALID = NOT_FOUND/MISSING/RATE_LIMITED — non-recoverable here.
      // EXPIRED = link timed out, recoverable by requesting a new link.
      // USED    = already verified, idempotent success path.
      kind: "INVALID" | "EXPIRED" | "USED";
      message: string;
      // Set when the server forwarded the original email along with
      // the error (EXPIRED / USED only). Lets us offer in-page resend
      // without making the user retype their address.
      email?: string;
    };

/**
 * Map a token's `nextStep` hint to the onboarding step the user should
 * land on after this page completes. Today the only issued value is
 * "set-password" (Flow D phone-first users finishing email setup), and
 * after they finish that they pick up at the contact step. Centralising
 * the mapping here makes it explicit and easy to extend.
 */
function destinationForNextStep(nextStep: string | null): string {
  switch (nextStep) {
    case "set-password":
    case "confirm-email":
      return "/onboarding?step=contact";
    default:
      return "/onboarding?step=contact";
  }
}

const BRAND = "#b66667";
const BRAND_HOVER = "#B85858";

export default function VerifyEmailAndSetPassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const token = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("token") ?? "";
  }, []);

  const [inspect, setInspect] = useState<InspectState>({ status: "loading" });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendDone, setResendDone] = useState(false);
  const completedRef = useRef(false);

  // Confirm-email flow state. This page now serves two token kinds:
  //   * set-password  → password form below
  //   * confirm-email → simple "click to confirm" UI; one POST to
  //     /api/auth/email/confirm-email flips email_confirmed_at.
  const [confirming, setConfirming] = useState(false);
  const [confirmDone, setConfirmDone] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const confirmStartedRef = useRef(false);

  const form = useForm<SetPasswordFormData>({
    resolver: zodResolver(setPasswordSchema),
    mode: "onChange",
    defaultValues: { password: "", confirmPassword: "" },
  });
  const password = form.watch("password");

  /* --------------------------------------------------------------
   * Mount: validate the resume token. Do NOT consume — that happens
   * server-side when the user submits a valid password (so a typo
   * doesn't burn the link).
   * -------------------------------------------------------------- */
  useEffect(() => {
    let cancelled = false;
    posthog.capture("coach_verify_email_page_viewed", {
      has_token: !!token,
    });

    if (!token) {
      setInspect({
        status: "error",
        kind: "INVALID",
        message:
          "This link is missing required information. Please open the verification link from your email exactly as we sent it.",
      });
      return;
    }

    (async () => {
      try {
        const res = await fetch(
          `/api/auth/email/inspect-token?token=${encodeURIComponent(token)}`,
        );
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;

        if (res.ok && json?.success) {
          setInspect({
            status: "ready",
            email: json.email,
            nextStep: json.nextStep ?? null,
          });
          posthog.capture("coach_verify_email_token_valid");
          return;
        }

        const code: string = json?.code ?? "INVALID";
        const forwardedEmail: string | undefined =
          typeof json?.email === "string" ? json.email : undefined;
        if (code === "USED") {
          setInspect({
            status: "error",
            kind: "USED",
            message:
              json?.error ?? "This verification link has already been used.",
            email: forwardedEmail,
          });
        } else if (code === "EXPIRED") {
          setInspect({
            status: "error",
            kind: "EXPIRED",
            message:
              json?.error ?? "This verification link has expired.",
            email: forwardedEmail,
          });
        } else {
          setInspect({
            status: "error",
            kind: "INVALID",
            message:
              json?.error ?? "This verification link is no longer valid.",
          });
        }
        posthog.capture("coach_verify_email_token_invalid", { code });
      } catch (err: any) {
        if (cancelled) return;
        setInspect({
          status: "error",
          kind: "INVALID",
          message:
            "We couldn't verify this link right now. Please check your connection and try again.",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  /* --------------------------------------------------------------
   * In-page resend (EXPIRED state). Requires the user to be signed in
   * (start-completion is an authenticated endpoint — the server
   * verifies the email belongs to *their* phone-first account). If
   * they're not signed in we send them to /auth so they can come back
   * after authenticating with their phone OTP.
   * -------------------------------------------------------------- */
  const handleResend = async () => {
    if (inspect.status !== "error" || !inspect.email) return;
    setResending(true);
    try {
      const supabase = await waitForSupabase();
      const session = supabase
        ? (await supabase.auth.getSession()).data.session
        : null;
      if (!session?.access_token) {
        toast({
          title: "Please sign in first",
          description:
            "Sign in with your phone, then we'll send a fresh verification link.",
        });
        setLocation(
          `/auth?returnTo=${encodeURIComponent("/onboarding?step=contact")}`,
        );
        return;
      }
      const res = await fetch("/api/auth/email/start-completion", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ email: inspect.email }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: "Couldn't send a new link",
          description:
            json?.error ??
            "Something went wrong. Please try again from the onboarding screen.",
          variant: "destructive",
        });
        posthog.capture("coach_verify_email_resend_failed", {
          code: json?.code ?? "INTERNAL",
        });
        return;
      }
      setResendDone(true);
      posthog.capture("coach_verify_email_resend_sent");
      toast({
        title: "New link sent",
        description: `Check ${inspect.email} for a fresh verification link.`,
      });
    } catch (err: any) {
      toast({
        title: "Network error",
        description: "Please check your connection and try again.",
        variant: "destructive",
      });
    } finally {
      setResending(false);
    }
  };

  /* --------------------------------------------------------------
   * Confirm-email handler: POSTs the token to /confirm-email and
   * flips email_confirmed_at. Idempotent on the server (consume +
   * inspect both reject already-used tokens), so we guard with a
   * ref to avoid double-submits from React strict-mode re-renders.
   * -------------------------------------------------------------- */
  // Auto-fire confirm as soon as we know the link is a confirm-email
  // token. The user shouldn't need to click an extra button just to
  // flip a bit — they already proved ownership by clicking the link.
  // Narrow `inspect` to its "ready" variant before reading `nextStep`
  // so the effect dependency stays type-safe across the discriminated
  // union.
  const readyNextStep =
    inspect.status === "ready" ? inspect.nextStep : null;
  useEffect(() => {
    if (
      readyNextStep === "confirm-email" &&
      !confirmStartedRef.current &&
      !confirming &&
      !confirmDone
    ) {
      void handleConfirmEmail();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyNextStep]);

  const handleConfirmEmail = async () => {
    if (confirmStartedRef.current) return;
    confirmStartedRef.current = true;
    setConfirmError(null);
    setConfirming(true);
    try {
      const res = await fetch("/api/auth/email/confirm-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        const code: string = json?.code ?? "INTERNAL";
        const carryEmail =
          inspect.status === "ready" ? inspect.email : undefined;
        if (code === "USED") {
          setInspect({
            status: "error",
            kind: "USED",
            message:
              json?.error ?? "This confirmation link has already been used.",
            email: carryEmail,
          });
          posthog.capture("coach_verify_email_confirm_failed", { code });
          return;
        }
        if (code === "EXPIRED" || code === "MISSING" || code === "NOT_FOUND") {
          setInspect({
            status: "error",
            kind: code === "EXPIRED" ? "EXPIRED" : "INVALID",
            message:
              json?.error ?? "This confirmation link is no longer valid.",
            email: code === "EXPIRED" ? carryEmail : undefined,
          });
          posthog.capture("coach_verify_email_confirm_failed", { code });
          return;
        }
        setConfirmError(
          json?.error ?? "Could not confirm your email. Please try again.",
        );
        // Allow another attempt for transient failures.
        confirmStartedRef.current = false;
        posthog.capture("coach_verify_email_confirm_failed", { code });
        return;
      }
      setConfirmDone(true);
      posthog.capture("coach_verify_email_confirmed", { email: json.email });
      // Redirect after a brief success splash so the user lands in
      // the right place automatically.
      // If the user is signed in, send them to the dashboard — the
      // existing RequireOnboardingComplete guard will route them to
      // /onboarding if their onboarding isn't finished yet.
      // If they're not signed in (e.g. different device), send them
      // to /auth so they can log in with their confirmed credentials.
      try {
        const supa = await waitForSupabase().catch(() => null);
        let accessToken: string | undefined;
        if (supa) {
          const { data } = await supa.auth.getSession();
          accessToken = data.session?.access_token;
        }
        const dest = accessToken ? "/dashboard" : "/auth";
        setTimeout(() => setLocation(dest), 1500);
      } catch {
        setTimeout(() => setLocation("/auth"), 1500);
      }
    } catch (err: any) {
      console.error("confirm-email error:", err);
      setConfirmError(
        "We couldn't reach the server. Please check your connection and try again.",
      );
      confirmStartedRef.current = false;
    } finally {
      setConfirming(false);
    }
  };

  /* --------------------------------------------------------------
   * Submit: hit the atomic complete endpoint. On success the server
   * returns a fresh Supabase session — install it locally so the
   * user lands signed in and the original onboarding tab's
   * onAuthStateChange fires (ContactStep listens for SIGNED_IN /
   * USER_UPDATED to auto-advance).
   *
   * We sign the *current* local session out before installing the
   * new one to defend against the "token belongs to a different
   * account than the current session" edge case — the token is the
   * source of truth for identity here, not whatever happens to be
   * cached in this browser.
   * -------------------------------------------------------------- */
  const onSubmit = async (data: SetPasswordFormData) => {
    if (inspect.status !== "ready" || completedRef.current) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/email/complete-with-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: data.password }),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.success) {
        const code: string = json?.code ?? "INTERNAL";

        // Token-state failures: switch to the matching error screen
        // instead of a transient toast so the user has a clear path.
        // Preserve the previously-inspected email so the recovery
        // screen can offer in-place resend without a re-fetch.
        const carryEmail =
          inspect.status === "ready" ? inspect.email : undefined;
        if (code === "USED") {
          setInspect({
            status: "error",
            kind: "USED",
            message:
              json?.error ?? "This verification link has already been used.",
            email: carryEmail,
          });
          posthog.capture("coach_verify_email_complete_failed", { code });
          return;
        }
        if (code === "EXPIRED" || code === "MISSING" || code === "NOT_FOUND") {
          setInspect({
            status: "error",
            kind: code === "EXPIRED" ? "EXPIRED" : "INVALID",
            message:
              json?.error ?? "This verification link is no longer valid.",
            email: code === "EXPIRED" ? carryEmail : undefined,
          });
          posthog.capture("coach_verify_email_complete_failed", { code });
          return;
        }

        if (code === "EMAIL_TAKEN") {
          toast({
            title: "Email already in use",
            description:
              "Another Riplect account already uses this email. Please sign in to that account or use a different email.",
            variant: "destructive",
          });
          posthog.capture("coach_verify_email_complete_failed", { code });
          return;
        }

        if (code === "WEAK_PASSWORD") {
          form.setError("password", {
            type: "manual",
            message:
              json?.error ?? "Password does not meet the required policy.",
          });
          posthog.capture("coach_verify_email_complete_failed", { code });
          return;
        }

        if (code === "RATE_LIMITED") {
          toast({
            title: "Too many attempts",
            description:
              json?.error ?? "Please wait a moment before trying again.",
            variant: "destructive",
          });
          posthog.capture("coach_verify_email_complete_failed", { code });
          return;
        }

        toast({
          title: "Couldn't complete verification",
          description:
            json?.error ?? "Something went wrong. Please try again.",
          variant: "destructive",
        });
        posthog.capture("coach_verify_email_complete_failed", { code });
        return;
      }

      completedRef.current = true;
      posthog.capture("coach_verify_email_completed", {
        email: json.email,
        had_session: !!json.session,
      });

      // Install the fresh session so we land signed in. We sign out
      // any pre-existing local session first so a stale cached user
      // can't race with the new one.
      const supabase = await waitForSupabase();
      if (supabase && json.session?.access_token && json.session?.refresh_token) {
        try {
          await signOutCompletely();
        } catch {
          /* non-fatal — setSession below replaces the token regardless */
        }
        const { error: setErr } = await supabase.auth.setSession({
          access_token: json.session.access_token,
          refresh_token: json.session.refresh_token,
        });
        if (setErr) {
          // Swap committed but session install failed — show success
          // and ask them to log in manually with their new password.
          console.warn("setSession after verify failed:", setErr);
          toast({
            title: "Email verified",
            description:
              "Please sign in with your new email and password to continue.",
          });
          setSuccess(true);
          setTimeout(() => setLocation("/auth"), 1500);
          return;
        }
      } else if (!json.session) {
        // Server couldn't issue a session (e.g. anon key missing).
        // Still a success — bounce to /auth so they sign in fresh.
        toast({
          title: "Email verified",
          description:
            "Please sign in with your new email and password to continue.",
        });
        setSuccess(true);
        setTimeout(() => setLocation("/auth"), 1500);
        return;
      }

      setSuccess(true);

      // Decide where to go next. The redirect target is inferred from
      // the user's profile state (NOT a free query param the user can
      // tamper with). Phone-first users finishing email verification
      // are mid-onboarding by definition, so the default is the
      // contact step — but if onboarding is already complete, send
      // them straight to the dashboard.
      try {
        let accessToken: string | undefined;
        if (supabase) {
          const { data } = await supabase.auth.getSession();
          accessToken = data.session?.access_token;
        }
        // Default destination is derived from the resume token's
        // step hint (NOT from a free query param). If onboarding is
        // already complete in the user's profile we override to
        // /dashboard so finished creators don't bounce back into
        // onboarding for a stale step hint.
        let dest = destinationForNextStep(
          inspect.status === "ready" ? inspect.nextStep : null,
        );
        if (accessToken) {
          try {
            const profileRes = await fetch("/api/dashboard/profile", {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (profileRes.ok) {
              const profile = await profileRes.json();
              if (profile && profile.onboardingCompleted !== false) {
                dest = "/dashboard";
              }
            }
          } catch {
            /* keep default destination */
          }
        }
        setTimeout(() => setLocation(dest), 1200);
      } catch {
        setTimeout(
          () =>
            setLocation(
              destinationForNextStep(
                inspect.status === "ready" ? inspect.nextStep : null,
              ),
            ),
          1200,
        );
      }
    } catch (err: any) {
      console.error("verify-email submit error:", err);
      toast({
        title: "Network error",
        description:
          "We couldn't reach the server. Please check your connection and try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  /* ------------------------------- LOADING ------------------------------- */
  if (inspect.status === "loading") {
    return (
      <PageShell>
        <Card className="shadow-xl">
          <CardContent className="py-12">
            <div className="flex flex-col items-center gap-3 text-center">
              <Loader2
                className="w-8 h-8 animate-spin"
                style={{ color: BRAND }}
              />
              <p className="text-muted-foreground">Verifying your link…</p>
            </div>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  /* ---------------------------- ERROR STATES ----------------------------- */
  if (inspect.status === "error") {
    // USED is the idempotent-success edge case: the user already
    // verified once. Treat it as a success-flavoured message so they
    // aren't alarmed.
    if (inspect.kind === "USED") {
      return (
        <PageShell>
          <Card className="shadow-xl">
            <CardHeader>
              <CardTitle className="text-2xl text-center">
                You're already verified
              </CardTitle>
              <CardDescription className="text-center">
                This verification link has already been used.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center py-6 space-y-4">
              <CheckCircle className="w-14 h-14 text-green-500 mx-auto" />
              <p className="text-muted-foreground">
                You can sign in with your email and password — or continue
                where you left off.
              </p>
              <div className="flex flex-col gap-2">
                <Button
                  className="w-full"
                  style={{ backgroundColor: BRAND }}
                  onClick={() => setLocation("/auth")}
                  data-testid="button-go-to-login"
                >
                  Go to Login
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => setLocation("/onboarding?step=contact")}
                  data-testid="button-back-to-onboarding"
                >
                  Back to Onboarding
                </Button>
              </div>
            </CardContent>
          </Card>
        </PageShell>
      );
    }

    // EXPIRED with a known email → offer in-page resend (no need for
    // the user to leave this screen). Without an email we fall back
    // to "head back to onboarding" since start-completion needs to
    // know which email to re-send to.
    const canResendInPlace =
      inspect.kind === "EXPIRED" && !!inspect.email && !resendDone;
    return (
      <PageShell>
        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle className="text-2xl text-center">
              {inspect.kind === "EXPIRED" ? "Link expired" : "Invalid link"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center py-6 space-y-4">
            <AlertCircle className="w-14 h-14 text-amber-500 mx-auto" />
            <p
              className="text-muted-foreground"
              data-testid="text-token-error"
            >
              {inspect.message}
            </p>
            {inspect.email && (
              <p className="text-sm text-muted-foreground">
                For{" "}
                <span
                  className="font-medium text-foreground"
                  data-testid="text-error-email"
                >
                  {inspect.email}
                </span>
                .
              </p>
            )}
            {resendDone ? (
              <div
                className="flex items-center justify-center gap-2 text-green-600"
                data-testid="status-resend-done"
              >
                <CheckCircle className="w-4 h-4" />
                <span className="text-sm">
                  New link sent — check your inbox.
                </span>
              </div>
            ) : (
              !canResendInPlace && (
                <p className="text-sm text-muted-foreground">
                  Head back to onboarding to request a new verification email.
                </p>
              )
            )}
            <div className="flex flex-col gap-2">
              {canResendInPlace ? (
                <Button
                  className="w-full text-white"
                  style={{ backgroundColor: BRAND }}
                  onClick={handleResend}
                  disabled={resending}
                  data-testid="button-resend-in-place"
                >
                  {resending ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sending…
                    </span>
                  ) : (
                    "Send a New Verification Link"
                  )}
                </Button>
              ) : (
                <Button
                  className="w-full text-white"
                  style={{ backgroundColor: BRAND }}
                  onClick={() => setLocation("/onboarding?step=contact")}
                  data-testid="button-request-new-link"
                >
                  Request a New Link
                </Button>
              )}
              <Link href="/auth">
                <Button
                  variant="ghost"
                  className="w-full"
                  data-testid="button-back-to-login"
                >
                  Back to Login
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  /* ------------------------------ SUCCESS -------------------------------- */
  if (success) {
    return (
      <PageShell>
        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle className="text-2xl text-center">
              Email verified!
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center py-8">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
            <p className="mt-4">
              Your email and password are set. Taking you back…
            </p>
            <Loader2
              className="w-5 h-5 animate-spin mx-auto mt-4"
              style={{ color: BRAND }}
            />
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  /* -------------------------- CONFIRM-EMAIL ------------------------------ */
  // New onboarding flow: the user already set their password inline
  // during onboarding; this link only needs to flip email_confirmed_at.
  // Show a single-button screen rather than the password form.
  if (inspect.status === "ready" && inspect.nextStep === "confirm-email") {
    if (confirmDone) {
      return (
        <PageShell>
          <Card className="shadow-xl">
            <CardHeader>
              <CardTitle className="text-2xl text-center">
                Email confirmed!
              </CardTitle>
              <CardDescription className="text-center">
                You can now sign in with{" "}
                <span className="font-medium text-foreground">
                  {inspect.email}
                </span>{" "}
                and your password.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center py-6 space-y-4">
              <CheckCircle className="w-14 h-14 text-green-500 mx-auto" />
              <div className="flex flex-col gap-2">
                <Button
                  className="w-full text-white"
                  style={{ backgroundColor: BRAND }}
                  onClick={() => setLocation("/dashboard")}
                  data-testid="button-go-to-dashboard"
                >
                  Go to Dashboard
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => setLocation("/auth")}
                  data-testid="button-go-to-login-after-confirm"
                >
                  Go to Login
                </Button>
              </div>
            </CardContent>
          </Card>
        </PageShell>
      );
    }
    return (
      <PageShell>
        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle className="text-2xl text-center">
              Confirm your email
            </CardTitle>
            <CardDescription className="text-center">
              Click below to confirm{" "}
              <span
                className="font-medium text-foreground"
                data-testid="text-confirm-email"
              >
                {inspect.email}
              </span>
              . This enables signing in with email and password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 mb-4 p-3 rounded-md bg-muted/50">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <span
                className="text-sm text-muted-foreground truncate"
                data-testid="text-confirm-email-banner"
              >
                {inspect.email}
              </span>
            </div>
            {confirmError && (
              <div
                className="mb-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
                data-testid="alert-confirm-error"
              >
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{confirmError}</span>
              </div>
            )}
            <Button
              type="button"
              className="w-full text-white"
              style={{ backgroundColor: BRAND }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = BRAND_HOVER)
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = BRAND)
              }
              onClick={handleConfirmEmail}
              disabled={confirming}
              data-testid="button-confirm-email-submit"
            >
              {confirming ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Confirming…
                </span>
              ) : (
                "Confirm Email"
              )}
            </Button>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  /* -------------------------- PASSWORD FORM ------------------------------ */
  return (
    <PageShell>
      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle className="text-2xl text-center">
            Set Your Password
          </CardTitle>
          <CardDescription className="text-center">
            Verifying{" "}
            <span
              className="font-medium text-foreground"
              data-testid="text-verify-email"
            >
              {inspect.email}
            </span>
            . Choose a password so you can sign in with email later too.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-4 p-3 rounded-md bg-muted/50">
            <Mail className="w-4 h-4 text-muted-foreground" />
            <span
              className="text-sm text-muted-foreground truncate"
              data-testid="text-verify-email-banner"
            >
              {inspect.email}
            </span>
          </div>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-4"
              autoComplete="off"
            >
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                        <Input
                          type="password"
                          placeholder="At least 8 characters"
                          className="pl-10"
                          autoComplete="new-password"
                          data-testid="input-new-password"
                          {...field}
                          onChange={(e) => {
                            field.onChange(e);
                            if (
                              form.getFieldState("confirmPassword").isTouched
                            ) {
                              form.trigger("confirmPassword");
                            }
                          }}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <PasswordChecklist password={password} />

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                        <Input
                          type="password"
                          placeholder="Confirm your password"
                          className="pl-10"
                          autoComplete="new-password"
                          data-testid="input-confirm-password"
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
                className="w-full text-white"
                style={{ backgroundColor: BRAND }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = BRAND_HOVER)
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = BRAND)
                }
                disabled={submitting}
                data-testid="button-set-password-submit"
              >
                {submitting ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving…
                  </span>
                ) : (
                  "Verify Email & Set Password"
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </PageShell>
  );
}

/* ============================================================
 * Helpers
 * ============================================================ */

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/">
            <h1
              className="text-4xl font-bold cursor-pointer hover:opacity-80"
              style={{ color: BRAND }}
            >
              Riplect
            </h1>
          </Link>
        </div>
        {children}
      </div>
    </div>
  );
}

function PasswordChecklist({ password }: { password: string }) {
  return (
    <ul className="space-y-1.5 text-sm" data-testid="list-password-requirements">
      {PASSWORD_REQUIREMENTS.map((req) => {
        const ok = req.regex.test(password);
        return (
          <li
            key={req.id}
            className={`flex items-center gap-2 ${
              ok ? "text-green-600" : "text-muted-foreground"
            }`}
            data-testid={`req-${req.id}-${ok ? "ok" : "todo"}`}
          >
            {ok ? (
              <Check className="w-4 h-4" />
            ) : (
              <X className="w-4 h-4 opacity-60" />
            )}
            <span>{req.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
