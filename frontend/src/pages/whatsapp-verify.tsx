import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { waitForSupabase } from "@/lib/supabase";
import { Loader2, CheckCircle2, Mail, ShieldCheck, AlertCircle } from "lucide-react";

/**
 * /whatsapp-verify — single-page finish-your-claim flow for users
 * created by the WhatsApp bot (source_channel='whatsapp',
 * email_verified_at IS NULL, onboarding_completed = false).
 *
 * Two branches based on email domain:
 *   • Gmail (gmail.com / googlemail.com) → one-tap "Continue with Google".
 *   • Anything else → masked email + 6-digit OTP, then password fields
 *     reveal in-place once the OTP is verified.
 *
 * The page bounces out to /dashboard once the server reports the flow
 * complete, so it is safe to land on here after a refresh or an
 * accidental re-visit.
 */

interface StatusPayload {
  email: string;
  isGmailDomain: boolean;
  alreadyHasGoogleIdentity: boolean;
  emailVerified: boolean;
  onboardingCompleted: boolean;
  done: boolean;
}

function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 1) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const visible = local.length <= 2 ? local[0] : local.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(local.length - visible.length, 1))}@${domain}`;
}

function isStrongPassword(pw: string): { ok: true } | { ok: false; reason: string } {
  if (pw.length < 8) return { ok: false, reason: "At least 8 characters." };
  if (!/[A-Z]/.test(pw)) return { ok: false, reason: "One uppercase letter." };
  if (!/[0-9]/.test(pw)) return { ok: false, reason: "One number." };
  if (!/[^A-Za-z0-9]/.test(pw)) return { ok: false, reason: "One special character." };
  return { ok: true };
}

export default function WhatsappVerifyPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const {
    isAuthenticated,
    isLoading: authLoading,
    requiresWhatsappEmailVerification,
    session,
    refreshOnboardingStatus,
  } = useAuth();

  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Branch + stage state
  const [useGoogleBranch, setUseGoogleBranch] = useState<boolean | null>(null);
  const [otp, setOtp] = useState("");
  const [otpVerified, setOtpVerified] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Action-pending flags
  const [sendingOtp, setSendingOtp] = useState(false);
  const [checkingOtp, setCheckingOtp] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [startingGoogle, setStartingGoogle] = useState(false);
  const [completingGoogle, setCompletingGoogle] = useState(false);

  const otpAutoSentRef = useRef(false);
  const googleCallbackHandledRef = useRef(false);
  const statusFetchedRef = useRef(false);

  const accessToken = session?.access_token ?? null;

  const authedFetch = useCallback(
    (path: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      headers.set("Content-Type", "application/json");
      if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
      return fetch(path, { ...init, headers });
    },
    [accessToken],
  );

  // Load /status once we have a session.
  // statusFetchedRef ensures we only ever make one fetch per mount even
  // if auth state (e.g. requiresWhatsappEmailVerification null→true)
  // causes the effect to re-fire before the first fetch completes —
  // that double-fire was the root cause of duplicate OTP emails.
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      navigate("/auth");
      return;
    }
    if (requiresWhatsappEmailVerification === false) {
      navigate("/dashboard");
      return;
    }
    if (!accessToken) return;
    if (statusFetchedRef.current) return;
    statusFetchedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch("/api/auth/whatsapp-verify/status");
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(json?.error ?? "Could not load your account.");
          return;
        }
        const payload = json as StatusPayload;
        setStatus(payload);
        if (payload.done) {
          await refreshOnboardingStatus();
          navigate("/dashboard");
          return;
        }
        // Default branch: Gmail domain OR an already-linked Google
        // identity → Google flow. Otherwise OTP. The user can toggle
        // either way via the escape link.
        setUseGoogleBranch(payload.isGmailDomain || payload.alreadyHasGoogleIdentity);
        setOtpVerified(payload.emailVerified);
      } catch (err: any) {
        if (cancelled) return;
        statusFetchedRef.current = false; // allow retry on error
        setLoadError(err?.message ?? "Network error.");
      }
    })();
    return () => {
      cancelled = true;
      // Reset the guard so the next effect run can re-fetch if this one was
      // cancelled mid-flight (e.g. accessToken changed when the magic-link
      // session was picked up by onAuthStateChange). Without this reset the
      // ref stays true, the next effect exits early, and status is never set.
      statusFetchedRef.current = false;
    };
  }, [
    authLoading,
    isAuthenticated,
    requiresWhatsappEmailVerification,
    accessToken,
    authedFetch,
    navigate,
    refreshOnboardingStatus,
  ]);

  // Auto-send the first OTP when the OTP branch becomes active and we
  // haven't sent one yet during this page session. Resending is then
  // user-initiated via the "Resend" button.
  useEffect(() => {
    if (
      useGoogleBranch === false
      && status
      && !status.done
      && !otpVerified
      && !otpAutoSentRef.current
    ) {
      otpAutoSentRef.current = true;
      void sendOtp(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useGoogleBranch, status, otpVerified]);

  // If we returned from Google OAuth with our flow flag, finish the link.
  useEffect(() => {
    if (!isAuthenticated || !accessToken || googleCallbackHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("flow") === "whatsapp_google_link") {
      googleCallbackHandledRef.current = true;
      void completeGoogle();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, accessToken]);

  const sendOtp = async (silent: boolean = false) => {
    setSendingOtp(true);
    setErrorMsg(null);
    try {
      const res = await authedFetch("/api/auth/whatsapp-verify/send-otp", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = json?.error ?? "Could not send a code right now.";
        setErrorMsg(msg);
        if (!silent) toast({ title: "Could not send code", description: msg, variant: "destructive" });
        return;
      }
      if (!silent) {
        toast({
          title: "Code sent",
          description: status?.email ? `We sent a 6-digit code to ${maskEmail(status.email)}.` : "Check your inbox.",
        });
      }
    } catch (err: any) {
      const msg = err?.message ?? "Network error.";
      setErrorMsg(msg);
      if (!silent) toast({ title: "Could not send code", description: msg, variant: "destructive" });
    } finally {
      setSendingOtp(false);
    }
  };

  const checkOtp = async () => {
    if (!/^\d{6}$/.test(otp)) {
      setErrorMsg("Enter the 6-digit code from your email.");
      return;
    }
    setCheckingOtp(true);
    setErrorMsg(null);
    try {
      const res = await authedFetch("/api/auth/whatsapp-verify/check-otp", {
        method: "POST",
        body: JSON.stringify({ code: otp }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(json?.error ?? "Incorrect code.");
        return;
      }
      setOtpVerified(true);
      toast({ title: "Email verified", description: "Now choose a password to finish setup." });
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Network error.");
    } finally {
      setCheckingOtp(false);
    }
  };

  const savePassword = async () => {
    setErrorMsg(null);
    const policy = isStrongPassword(password);
    if (!policy.ok) {
      setErrorMsg(`Password needs: ${policy.reason}`);
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg("Passwords do not match.");
      return;
    }
    setSavingPassword(true);
    try {
      const res = await authedFetch("/api/auth/whatsapp-verify/set-password", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(json?.error ?? "Could not save your password.");
        return;
      }

      // `admin.updateUserById(uid, { password })` invalidates all existing
      // Supabase sessions the moment it runs. We must sign in with the new
      // password immediately to get a fresh valid session before navigating
      // to the dashboard — otherwise every API call there returns 401.
      const supabase = await waitForSupabase();
      if (supabase && status?.email) {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: status.email,
          password,
        });
        if (signInErr) {
          // Sign-in failed (shouldn't happen — we just set the password).
          // Fall back to /auth so the user can sign in manually.
          console.error("[whatsapp-verify] re-sign-in after set-password failed:", signInErr.message);
          toast({ title: "Password saved", description: "Please sign in with your new password." });
          window.location.href = "/auth";
          return;
        }
      }

      toast({ title: "All set", description: "Welcome to Riplect." });
      window.location.href = "/dashboard";
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Network error.");
    } finally {
      setSavingPassword(false);
    }
  };

  const startGoogle = async () => {
    setErrorMsg(null);
    setStartingGoogle(true);
    try {
      const supabase = await waitForSupabase();
      if (!supabase) {
        setErrorMsg("Authentication is not configured.");
        return;
      }
      const redirectTo = `${window.location.origin}/whatsapp-verify?flow=whatsapp_google_link`;
      // `openid` scope is required for Google to mint a fresh ID
      // token; without it Supabase will not populate
      // `session.provider_id_token` on the post-OAuth session, and
      // `/complete-google` has no way to verify the user.
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          scopes: "openid email profile",
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) {
        setErrorMsg(error.message);
      }
      // On success the browser navigates away; nothing else to do.
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Could not start Google sign-in.");
    } finally {
      setStartingGoogle(false);
    }
  };

  const completeGoogle = async () => {
    setCompletingGoogle(true);
    setErrorMsg(null);
    try {
      // No ID token required — the server reads the Google identity
      // that Supabase already linked during the OAuth redirect directly
      // from auth.identities. Supabase's `provider_id_token` is only
      // available in the transient onAuthStateChange SIGNED_IN event
      // and is not persisted on the session, so we don't rely on it.
      const res = await authedFetch("/api/auth/whatsapp-verify/complete-google", {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      window.history.replaceState({}, "", "/whatsapp-verify");
      if (!res.ok) {
        const code = json?.code as string | undefined;
        const msg =
          code === "GOOGLE_EMAIL_MISMATCH"
            ? "You signed in with a different Google account than the email on your Riplect account. Pick the matching Google account, or use the email-code option instead."
            : code === "EMAIL_TAKEN"
              ? "That Google email is already linked to another Riplect account."
              : code === "GOOGLE_IDENTITY_TAKEN"
                ? "That Google account is already linked to another Riplect account."
                : json?.error ?? "Could not finish Google sign-in.";
        setErrorMsg(msg);
        return;
      }
      toast({ title: "All set", description: "Welcome to Riplect." });
      await refreshOnboardingStatus();
      window.location.href = "/dashboard";
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Network error.");
    } finally {
      setCompletingGoogle(false);
    }
  };

  const masked = useMemo(() => (status?.email ? maskEmail(status.email) : ""), [status?.email]);

  if (authLoading || (!status && !loadError)) {
    return (
      <div className="min-h-screen flex items-center justify-center" data-testid="state-loading">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-3 text-center">
              <AlertCircle className="w-10 h-10 text-destructive" />
              <p className="text-muted-foreground" data-testid="text-load-error">{loadError}</p>
              <Button variant="outline" onClick={() => window.location.reload()} data-testid="button-retry-load">
                Try again
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md" data-testid="card-whatsapp-verify">
        <CardHeader>
          <CardTitle data-testid="text-page-title">Finish setting up your Riplect account</CardTitle>
          <CardDescription data-testid="text-page-subtitle">
            Verify the email we have on file and you're done.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border p-3 text-sm bg-muted/40 flex items-start gap-2">
            <Mail className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium" data-testid="text-account-email-label">Email on your account</div>
              <div className="font-mono" data-testid="text-account-email">{masked}</div>
            </div>
          </div>

          {errorMsg && (
            <Alert variant="destructive" data-testid="alert-error">
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
          )}

          {useGoogleBranch ? (
            <GoogleBranch
              onContinue={startGoogle}
              onSwitch={() => {
                setErrorMsg(null);
                setUseGoogleBranch(false);
              }}
              starting={startingGoogle}
              completing={completingGoogle}
            />
          ) : (
            <OtpBranch
              status={status!}
              maskedEmail={masked}
              otp={otp}
              setOtp={setOtp}
              otpVerified={otpVerified}
              password={password}
              setPassword={setPassword}
              confirmPassword={confirmPassword}
              setConfirmPassword={setConfirmPassword}
              sendOtp={() => sendOtp(false)}
              checkOtp={checkOtp}
              savePassword={savePassword}
              sendingOtp={sendingOtp}
              checkingOtp={checkingOtp}
              savingPassword={savingPassword}
              onSwitch={() => {
                setErrorMsg(null);
                setUseGoogleBranch(true);
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function GoogleBranch({
  onContinue,
  onSwitch,
  starting,
  completing,
}: {
  onContinue: () => void;
  onSwitch: () => void;
  starting: boolean;
  completing: boolean;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground" data-testid="text-google-instructions">
        Tap the button below and pick the same Google account as the email above. We'll
        finish your account in one click — no password needed.
      </p>
      <Button
        className="w-full"
        onClick={onContinue}
        disabled={starting || completing}
        data-testid="button-continue-with-google"
      >
        {starting || completing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
        {completing ? "Finishing…" : "Continue with Google"}
      </Button>
      <button
        type="button"
        className="text-xs text-muted-foreground underline w-full text-center"
        onClick={onSwitch}
        data-testid="button-switch-to-otp"
      >
        Use email code instead
      </button>
    </div>
  );
}

function OtpBranch(props: {
  status: StatusPayload;
  maskedEmail: string;
  otp: string;
  setOtp: (v: string) => void;
  otpVerified: boolean;
  password: string;
  setPassword: (v: string) => void;
  confirmPassword: string;
  setConfirmPassword: (v: string) => void;
  sendOtp: () => void;
  checkOtp: () => void;
  savePassword: () => void;
  sendingOtp: boolean;
  checkingOtp: boolean;
  savingPassword: boolean;
  onSwitch: () => void;
}) {
  const {
    status,
    maskedEmail,
    otp,
    setOtp,
    otpVerified,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    sendOtp,
    checkOtp,
    savePassword,
    sendingOtp,
    checkingOtp,
    savingPassword,
    onSwitch,
  } = props;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!otpVerified) checkOtp();
        else savePassword();
      }}
    >
      {/* Stage 1: OTP */}
      {otpVerified ? (
        <div
          className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400"
          data-testid="badge-email-verified"
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Email verified</span>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="otp-input" data-testid="label-otp">
            Enter the 6-digit code we emailed to {maskedEmail}
          </Label>
          <Input
            id="otp-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
            placeholder="123456"
            disabled={checkingOtp}
            data-testid="input-otp"
          />
          <div className="flex items-center justify-between text-xs">
            <button
              type="button"
              className="text-muted-foreground underline disabled:opacity-50"
              onClick={sendOtp}
              disabled={sendingOtp}
              data-testid="button-resend-otp"
            >
              {sendingOtp ? "Sending…" : "Resend code"}
            </button>
            {!status.alreadyHasGoogleIdentity && (
              <button
                type="button"
                className="text-muted-foreground underline"
                onClick={onSwitch}
                data-testid="button-switch-to-google"
              >
                Sign in with Google instead
              </button>
            )}
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={checkingOtp || otp.length !== 6}
            data-testid="button-verify-otp"
          >
            {checkingOtp ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Verify code
          </Button>
        </div>
      )}

      {/* Stage 2: Password — revealed once OTP is verified. */}
      {otpVerified && (
        <div className="space-y-2 pt-2 border-t">
          <div className="flex items-center gap-2 text-sm">
            <ShieldCheck className="w-4 h-4" />
            <span>Choose a password to finish</span>
          </div>
          <Label htmlFor="pw-input" data-testid="label-password">Password</Label>
          <Input
            id="pw-input"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 chars, 1 capital, 1 number, 1 symbol"
            disabled={savingPassword}
            data-testid="input-password"
          />
          <Label htmlFor="pw-confirm-input" data-testid="label-confirm-password">Confirm password</Label>
          <Input
            id="pw-confirm-input"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={savingPassword}
            data-testid="input-confirm-password"
          />
          <Button
            type="submit"
            className="w-full"
            disabled={savingPassword || !password || !confirmPassword}
            data-testid="button-save-password"
          >
            {savingPassword ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Save password & finish
          </Button>
        </div>
      )}
    </form>
  );
}
