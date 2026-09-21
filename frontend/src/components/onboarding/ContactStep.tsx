import { useState, useEffect, useRef, useCallback } from "react";
import type { User } from "@supabase/supabase-js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Check,
  Loader2,
  Mail,
  Phone,
  AlertCircle,
  RotateCw,
  Lock,
} from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import { useToast } from "@/hooks/use-toast";
import { waitForSupabase, getGoogleOAuthClientId } from "@/lib/supabase";
import { posthog } from "@/lib/posthog";

/* ---------- Google Identity Services typed window helpers ---------- */

interface GISCredentialResponse {
  credential?: string;
}

interface GISInitConfig {
  client_id: string;
  callback: (resp: GISCredentialResponse) => void;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
  ux_mode?: "popup" | "redirect";
  login_hint?: string;
}

interface GISButtonConfig {
  type?: "standard" | "icon";
  theme?: "outline" | "filled_blue" | "filled_black";
  size?: "small" | "medium" | "large";
  text?: "signin_with" | "signup_with" | "continue_with" | "signin";
  shape?: "rectangular" | "pill" | "circle" | "square";
  logo_alignment?: "left" | "center";
  width?: number;
}

interface GoogleIdentityServices {
  accounts: {
    id: {
      initialize: (cfg: GISInitConfig) => void;
      renderButton: (parent: HTMLElement, cfg: GISButtonConfig) => void;
    };
  };
}

interface WindowWithGoogle {
  google?: GoogleIdentityServices;
}

function getGoogleSdk(): GoogleIdentityServices | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as WindowWithGoogle).google ?? null;
}

/** Narrow an `unknown` thrown value to a user-facing string. */
function errMsg(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string") return err;
  return fallback;
}

const PLACEHOLDER_EMAIL_DOMAIN = "@phone.riplek.com";

function isPlaceholderEmail(email: string | null | undefined): boolean {
  if (!email) return true;
  return email.toLowerCase().endsWith(PLACEHOLDER_EMAIL_DOMAIN);
}

export function hasVerifiedEmail(user: User | null): boolean {
  if (!user?.email) return false;
  if (isPlaceholderEmail(user.email)) return false;
  return !!user.email_confirmed_at;
}

/**
 * "Email is set on the account" — true once the user has either
 * fully verified their email (Google or email-link flows) OR set a
 * password inline during onboarding (pending email confirmation).
 * The contact step uses this to gate progression: once the email
 * has been swapped from the placeholder, the step is satisfied even
 * if email_confirmed_at is still NULL.
 */
export function hasEmailOnAccount(user: User | null): boolean {
  if (!user?.email) return false;
  if (isPlaceholderEmail(user.email)) return false;
  return true;
}

/**
 * True when the email is set on the account but not yet confirmed
 * via the link we sent — used to render a "pending confirmation"
 * badge instead of "verified".
 */
export function hasEmailPendingConfirmation(user: User | null): boolean {
  return hasEmailOnAccount(user) && !user?.email_confirmed_at;
}

export function hasVerifiedPhone(user: User | null): boolean {
  return !!user?.phone && !!user.phone_confirmed_at;
}


/** Pretty-print an E.164 phone for display ("+91 98765 43210"). */
function formatPhoneForDisplay(raw: string | undefined | null): string {
  if (!raw) return "";
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits.startsWith("+")) return raw;
  // Generic chunked grouping past country code (heuristic — looks fine for
  // most lengths and avoids per-country tables).
  return digits.replace(
    /^(\+\d{1,3})(\d{1,5})?(\d{1,5})?(\d{0,5})?$/,
    (_, a, b, c, d) =>
      [a, b, c, d].filter(Boolean).join(" ").trim(),
  );
}

async function authedFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const supabase = await waitForSupabase();
  const headers = new Headers(init.headers || {});
  headers.set("Content-Type", "application/json");
  if (supabase) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers.set("Authorization", `Bearer ${session.access_token}`);
    }
  }
  return fetch(path, { ...init, headers });
}

/** Loads Google Identity Services once per app. */
function useGoogleIdentityServices(): boolean {
  const [ready, setReady] = useState<boolean>(
    typeof window !== "undefined" && !!getGoogleSdk()?.accounts?.id,
  );
  useEffect(() => {
    if (ready || typeof window === "undefined") return;
    if (getGoogleSdk()?.accounts?.id) {
      setReady(true);
      return;
    }
    const SRC = "https://accounts.google.com/gsi/client";
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SRC}"]`,
    );
    if (existing) {
      const onLoad = () => setReady(true);
      existing.addEventListener("load", onLoad);
      return () => existing.removeEventListener("load", onLoad);
    }
    const s = document.createElement("script");
    s.src = SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => setReady(true);
    document.head.appendChild(s);
  }, [ready]);
  return ready;
}

interface ContactStepProps {
  user: User | null;
  /**
   * The source_channel value from the user's profile row.
   * 'whatsapp' means the user was created by the WhatsApp bot and already
   * has a verified phone — they only need to add an email here.
   * Any other value (including null) means a regular web signup — they
   * already have an email and only need to verify their phone via SMS.
   */
  sourceChannel: string | null | undefined;
  /** Called whenever the verified state changes so the parent can gate "Continue". */
  onVerifiedChange: (state: {
    bothVerified: boolean;
    verifiedEmail: string | null;
    verifiedPhone: string | null;
    phoneSkipped: boolean;
  }) => void;
  /** Called once when both credentials become verified for the first time. */
  onBothVerified?: (state: {
    verifiedEmail: string;
    verifiedPhone: string;
  }) => void;
  /** Forces a session refresh; the parent's user prop will then update. */
  refreshUser: () => Promise<void>;
}

export function ContactStep({
  user,
  sourceChannel,
  onVerifiedChange,
  onBothVerified,
  refreshUser,
}: ContactStepProps) {
  const isBotUser = sourceChannel === "whatsapp";
  const emailOnAccountFromUser = hasEmailOnAccount(user);
  const emailFullyVerified = hasVerifiedEmail(user);
  const phoneVerified = hasVerifiedPhone(user);

  // Optimistic snapshot of the email the user just swapped in via the
  // inline-set-password flow. The Supabase session can lag the
  // server-side swap (refreshSession doesn't always pick up the new
  // email immediately, especially while email_confirmed_at is NULL),
  // so we trust the server's response and treat the step as
  // satisfied right away. Cleared automatically once the user prop
  // catches up.
  const [optimisticEmail, setOptimisticEmail] = useState<string | null>(null);
  useEffect(() => {
    if (optimisticEmail && emailOnAccountFromUser) {
      setOptimisticEmail(null);
    }
  }, [optimisticEmail, emailOnAccountFromUser]);

  // User explicitly opted out of the WhatsApp bot (phone not required).
  // Reset if they later verify their phone anyway.
  const [phoneSkipped, setPhoneSkipped] = useState(false);
  useEffect(() => {
    if (phoneVerified) setPhoneSkipped(false);
  }, [phoneVerified]);

  const emailOnAccount = emailOnAccountFromUser || !!optimisticEmail;
  const emailPending = emailOnAccount && !user?.email_confirmed_at;

  // Step is satisfied once email is on account AND phone is either
  // verified or the user has chosen to skip WhatsApp bot.
  const bothVerified = emailOnAccount && (phoneVerified || phoneSkipped);

  // Snapshots of the locked credentials shown in the UI.
  const lockedEmail = emailOnAccountFromUser
    ? user!.email!
    : optimisticEmail;
  const lockedPhone = phoneVerified ? user!.phone! : null;

  // Detect transition: email gets confirmed in another tab — fire a
  // milestone (kept for analytics parity with the old link flow).
  const prevEmailFullyVerifiedRef = useRef(emailFullyVerified);
  useEffect(() => {
    if (!prevEmailFullyVerifiedRef.current && emailFullyVerified) {
      posthog.capture("coach_onboarding_email_link_verified");
    }
    prevEmailFullyVerifiedRef.current = emailFullyVerified;
  }, [emailFullyVerified]);

  // Notify parent on every verification change.
  const notifiedOnceRef = useRef(false);
  useEffect(() => {
    onVerifiedChange({
      bothVerified,
      verifiedEmail: lockedEmail,
      verifiedPhone: lockedPhone,
      phoneSkipped,
    });
    // Only auto-advance when both credentials are genuinely verified —
    // not when phone was skipped (user made a conscious opt-out choice).
    if (bothVerified && !phoneSkipped && !notifiedOnceRef.current) {
      notifiedOnceRef.current = true;
      onBothVerified?.({
        verifiedEmail: lockedEmail!,
        verifiedPhone: lockedPhone!,
      });
      posthog.capture("coach_onboarding_contact_completed", {
        source_channel: sourceChannel ?? null,
      });
    }
  }, [bothVerified, phoneSkipped, lockedEmail, lockedPhone, sourceChannel, onBothVerified, onVerifiedChange]);

  // Cross-tab resume: when the other tab finishes verification (e.g. clicks
  // the email link), Supabase fires SIGNED_IN / USER_UPDATED. We refresh our
  // own session so the parent's `user` prop updates.
  //
  // IMPORTANT: do NOT trigger on TOKEN_REFRESHED — `refreshSession()` itself
  // emits TOKEN_REFRESHED, which would cause an infinite refresh loop.
  useEffect(() => {
    let unsub: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      const supabase = await waitForSupabase();
      if (!supabase || cancelled) return;
      const { data } = supabase.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_IN" || event === "USER_UPDATED") {
          // Force a fresh user object — parent re-renders with new email/phone.
          void refreshUser();
        }
      });
      unsub = () => data.subscription.unsubscribe();
    })();
    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [refreshUser]);

  return (
    <Card className="border-gray-200 shadow-sm bg-white">
      <CardHeader>
        <CardTitle className="text-xl text-gray-900">
          Verify Your Contact Details
        </CardTitle>
        <CardDescription>
          A verified email lets clients reach you and lets you sign back in.
          Adding a phone number also enables the WhatsApp bot feature.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* ── Bot users (source_channel = 'whatsapp') ──────────────────────
            Phone is already verified by the bot; they only need to add an
            email address. Show the locked phone first, then email setup. */}
        {isBotUser ? (
          <>
            {phoneVerified ? (
              <VerifiedField
                icon={<Phone className="w-4 h-4" />}
                label="Phone"
                value={formatPhoneForDisplay("+" + lockedPhone!.replace(/^\+/, ""))}
                testId="text-verified-phone"
                sublabel="Verified via WhatsApp."
              />
            ) : (
              <PhoneVerification onVerified={refreshUser} />
            )}
            {emailOnAccount ? (
              <VerifiedField
                icon={<Mail className="w-4 h-4" />}
                label="Email"
                value={lockedEmail!}
                testId="text-verified-email"
                pending={emailPending}
                sublabel={
                  emailPending
                    ? "We've sent a link to confirm this email — click it to be able to sign in with email and password later."
                    : undefined
                }
              />
            ) : (
              <EmailVerification
                onVerified={refreshUser}
                onInlineSwapped={(swappedEmail) => {
                  setOptimisticEmail(swappedEmail);
                  void refreshUser();
                }}
              />
            )}
          </>
        ) : (
          /* ── Web users (all other signups) ──────────────────────────────
              Email is already on the account for email-first signups; phone
              users who came through the web (not bot) may have no email yet. */
          <>
            {emailOnAccount ? (
              <VerifiedField
                icon={<Mail className="w-4 h-4" />}
                label="Email"
                value={lockedEmail ?? user?.email ?? ""}
                testId="text-verified-email"
                pending={emailPending}
                sublabel={
                  emailPending
                    ? "We've sent a link to confirm this email — click it to be able to sign in with email and password later."
                    : undefined
                }
              />
            ) : (
              <EmailVerification
                onVerified={refreshUser}
                onInlineSwapped={(swappedEmail) => {
                  setOptimisticEmail(swappedEmail);
                  void refreshUser();
                }}
              />
            )}
            {phoneVerified ? (
              <VerifiedField
                icon={<Phone className="w-4 h-4" />}
                label="Phone"
                value={formatPhoneForDisplay("+" + lockedPhone!.replace(/^\+/, ""))}
                testId="text-verified-phone"
                sublabel="This is also your WhatsApp bot number."
              />
            ) : phoneSkipped ? (
              <SkippedPhoneField onUndo={() => setPhoneSkipped(false)} />
            ) : (
              <>
                <PhoneVerification onVerified={refreshUser} />
                <div className="flex items-start gap-2.5 pt-1">
                  <Checkbox
                    id="skip-whatsapp"
                    checked={false}
                    onCheckedChange={(v) => setPhoneSkipped(!!v)}
                    data-testid="checkbox-skip-whatsapp"
                    className="mt-0.5 shrink-0"
                  />
                  <label
                    htmlFor="skip-whatsapp"
                    className="text-xs text-gray-500 leading-snug cursor-pointer select-none"
                  >
                    I don't need the WhatsApp bot — skip phone verification
                  </label>
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ============================================================
 * Skipped phone field — shown when user opts out of WhatsApp bot
 * ============================================================ */

function SkippedPhoneField({ onUndo }: { onUndo: () => void }) {
  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2">
        <Phone className="w-4 h-4" />
        Phone
      </Label>
      <div
        className="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2"
        data-testid="field-phone-skipped"
      >
        <span className="text-sm text-gray-400 italic">
          WhatsApp bot skipped
        </span>
        <button
          type="button"
          className="text-xs text-gray-500 underline hover:text-gray-700 whitespace-nowrap"
          onClick={onUndo}
          data-testid="button-undo-skip-whatsapp"
        >
          Undo
        </button>
      </div>
      <p className="text-xs text-gray-500">
        You can add a phone number from your profile settings later.
      </p>
    </div>
  );
}

/* ============================================================
 * Locked verified field (✓ badge)
 * ============================================================ */

function VerifiedField({
  icon,
  label,
  value,
  testId,
  sublabel,
  pending = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  testId: string;
  sublabel?: string;
  pending?: boolean;
}) {
  const containerClass = pending
    ? "flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2"
    : "flex items-center justify-between gap-3 rounded-md border border-green-200 bg-green-50 px-3 py-2";
  const badgeClass = pending
    ? "flex items-center gap-1 text-xs font-medium text-amber-700 whitespace-nowrap"
    : "flex items-center gap-1 text-xs font-medium text-green-700 whitespace-nowrap";
  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2">
        {icon}
        {label}
      </Label>
      <div className={containerClass} data-testid={testId}>
        <span className="text-sm font-medium text-gray-900 break-all">
          {value}
        </span>
        <span className={badgeClass} data-testid={`${testId}-status`}>
          {pending ? (
            <>
              <Mail className="w-4 h-4" />
              Pending confirmation
            </>
          ) : (
            <>
              <Check className="w-4 h-4" />
              Verified
            </>
          )}
        </span>
      </div>
      {sublabel && <p className="text-xs text-gray-500">{sublabel}</p>}
    </div>
  );
}

/* ============================================================
 * Phone verification (used when email-first user has no phone yet)
 *  - User types a phone, clicks "Send code"
 *  - We POST /api/auth/phone/send-otp
 *  - User enters the 6-digit code, clicks "Verify"
 *  - We POST /api/auth/phone/verify-otp; on success the parent re-renders
 *    with the locked verified phone
 * ============================================================ */

function PhoneVerification({ onVerified }: { onVerified: () => Promise<void> }) {
  const { toast } = useToast();
  const [phone, setPhone] = useState("+");
  const [step, setStep] = useState<"enter-phone" | "enter-code">("enter-phone");
  const [code, setCode] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sentToPhone, setSentToPhone] = useState<string | null>(null);
  const [debugCode, setDebugCode] = useState<string | null>(null);

  const sendOtp = useCallback(async () => {
    setErrorMsg(null);
    if (!phone.trim() || phone.replace(/\D/g, "").length < 6) {
      setErrorMsg("Enter a valid phone number with country code (e.g. +1...).");
      return;
    }
    setIsSending(true);
    try {
      const res = await authedFetch("/api/auth/phone/send-otp", {
        method: "POST",
        body: JSON.stringify({ phone, channel: "sms" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = json?.code as string | undefined;
        const msg =
          code === "PHONE_TAKEN"
            ? "This phone is already linked to another Riplect account. Sign in to that account, or use a different phone."
            : code === "INVALID_PHONE"
              ? "That doesn't look like a valid phone number. Use international format (e.g. +1 555 123 4567)."
              : code === "RATE_LIMITED"
                ? `Too many requests. Try again in ${json.retryAfterSec ?? 60}s.`
                : json?.error || "Could not send the code. Please try again.";
        setErrorMsg(msg);
        return;
      }
      setSentToPhone(json.phoneE164 || phone);
      setDebugCode(typeof json.debugCode === "string" ? json.debugCode : null);
      setStep("enter-code");
      posthog.capture("coach_onboarding_otp_sent", { channel: "sms" });
      toast({
        title: "Code sent",
        description: "Check your SMS messages for a 6-digit code.",
      });
    } catch (err: unknown) {
      setErrorMsg(errMsg(err, "Could not send the code. Please try again."));
    } finally {
      setIsSending(false);
    }
  }, [phone, toast]);

  const verifyOtp = useCallback(async () => {
    setErrorMsg(null);
    if (code.trim().length !== 6) {
      setErrorMsg("Enter the 6-digit code.");
      return;
    }
    setIsVerifying(true);
    try {
      const res = await authedFetch("/api/auth/phone/verify-otp", {
        method: "POST",
        body: JSON.stringify({ phone: sentToPhone || phone, code: code.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const ec = json?.code as string | undefined;
        const msg =
          ec === "WRONG_CODE"
            ? "That code doesn't match. Check the message and try again."
            : ec === "TOO_MANY_ATTEMPTS"
              ? "Too many attempts on this code. Tap 'Resend code' to get a new one."
              : ec === "EXPIRED" || ec === "USED" || ec === "NO_OTP"
                ? "That code is no longer valid. Tap 'Resend code' to get a new one."
                : ec === "PHONE_TAKEN"
                  ? "This phone is already linked to another Riplect account."
                  : ec === "RATE_LIMITED"
                    ? `Too many attempts. Try again in ${json.retryAfterSec ?? 60}s.`
                    : json?.error || "Could not verify the code. Please try again.";
        setErrorMsg(msg);
        return;
      }
      posthog.capture("coach_onboarding_otp_verified");
      // Refresh the parent user — the field will lock with ✓.
      await onVerified();
    } catch (err: unknown) {
      setErrorMsg(errMsg(err, "Could not verify the code. Please try again."));
    } finally {
      setIsVerifying(false);
    }
  }, [code, sentToPhone, phone, onVerified]);

  return (
    <div className="space-y-3">
      <Label htmlFor="onboarding-phone" className="flex items-center gap-2">
        <Phone className="w-4 h-4" />
        Phone Number
      </Label>
      <p className="text-xs text-gray-500">
        Required. We'll send a one-time verification code via SMS. This number
        also becomes your WhatsApp bot identity.
      </p>

      {step === "enter-phone" && (
        <>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              id="onboarding-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 555 123 4567"
              autoComplete="tel"
              data-testid="input-onboarding-phone"
              className="flex-1"
            />
            <Button
              type="button"
              onClick={() => sendOtp()}
              disabled={isSending || phone.replace(/\D/g, "").length < 6}
              className="bg-[#b66667] hover:bg-[#b85858] sm:w-auto"
              data-testid="button-send-phone-otp"
            >
              {isSending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending…
                </>
              ) : (
                "Send code"
              )}
            </Button>
          </div>
        </>
      )}

      {step === "enter-code" && (
        <>
          <div className="rounded-md bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-700">
            We sent a 6-digit code via SMS to{" "}
            <span className="font-medium">
              {formatPhoneForDisplay(sentToPhone || phone)}
            </span>
            .
          </div>
          {debugCode && (
            <div
              className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800"
              data-testid="text-otp-debug-code"
            >
              Dev only — your code is{" "}
              <span className="font-mono font-semibold">{debugCode}</span>.
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              id="onboarding-otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="000000"
              data-testid="input-onboarding-otp"
              className="flex-1 tracking-[0.4em] text-center font-mono"
              maxLength={6}
            />
            <Button
              type="button"
              onClick={verifyOtp}
              disabled={isVerifying || code.length !== 6}
              className="bg-[#b66667] hover:bg-[#b85858] sm:w-auto"
              data-testid="button-verify-phone-otp"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Verifying…
                </>
              ) : (
                "Verify"
              )}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
            <button
              type="button"
              className="underline hover:text-gray-900 disabled:opacity-50"
              onClick={() => {
                setStep("enter-phone");
                setCode("");
                setErrorMsg(null);
              }}
              disabled={isSending || isVerifying}
              data-testid="button-change-phone"
            >
              Change number
            </button>
            <button
              type="button"
              className="underline hover:text-gray-900 disabled:opacity-50 inline-flex items-center gap-1"
              onClick={() => {
                setCode("");
                setErrorMsg(null);
                void sendOtp();
              }}
              disabled={isSending || isVerifying}
              data-testid="button-resend-phone-otp"
            >
              <RotateCw className="w-3 h-3" />
              Resend code
            </button>
          </div>
        </>
      )}

      {errorMsg && (
        <Alert variant="destructive" data-testid="alert-phone-error">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{errorMsg}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

/* ============================================================
 * Email verification (used when phone-first user has no email yet)
 *  - User types an email, clicks "Verify email"
 *  - We POST /api/auth/email/start-completion
 *  - If googleEligible: we render a Google sign-in button. Their Google ID
 *    token goes to /api/auth/email/complete-with-google (the server checks
 *    audience + cross-checks the typed email against Google's). On success,
 *    parent re-renders with locked verified email.
 *  - Otherwise: we show "Check your inbox" gated state with a Resend link.
 *    Cross-tab resume: when the verify-email page in the other tab finishes,
 *    Supabase fires onAuthStateChange in this tab → parent re-renders.
 * ============================================================ */

type EmailStage =
  | { kind: "enter" }
  | { kind: "google"; email: string }
  | { kind: "set-password"; email: string }
  | { kind: "swapping"; email: string };

// sessionStorage key used to survive a mobile GIS redirect (Google OAuth
// redirects the browser away from the page; when it returns, React state is
// gone but sessionStorage is preserved so we can restore the in-progress flow).
const PENDING_GOOGLE_EMAIL_KEY = "riplek_onboarding_pending_google_email";

function EmailVerification({
  onVerified,
  onInlineSwapped,
}: {
  onVerified: () => Promise<void>;
  onInlineSwapped?: (email: string) => void;
}) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<EmailStage>({ kind: "enter" });
  const [isStarting, setIsStarting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Restore in-progress Google verification if the page was reloaded mid-flow
  // (GIS may redirect away on mobile; sessionStorage survives the reload).
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(PENDING_GOOGLE_EMAIL_KEY);
      if (saved) {
        setEmail(saved);
        setStage({ kind: "google", email: saved });
        setErrorMsg(
          "Your Google sign-in was interrupted. Please tap the Google button again to continue.",
        );
      }
    } catch {
      // sessionStorage unavailable — ignore
    }
  }, []);

  // Keep sessionStorage in sync: write when entering google stage, clear otherwise.
  useEffect(() => {
    try {
      if (stage.kind === "google") {
        sessionStorage.setItem(PENDING_GOOGLE_EMAIL_KEY, stage.email);
      } else if (stage.kind === "enter") {
        sessionStorage.removeItem(PENDING_GOOGLE_EMAIL_KEY);
      }
    } catch {
      // sessionStorage unavailable — ignore
    }
  }, [stage]);

  const start = useCallback(async () => {
    setErrorMsg(null);
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setErrorMsg("Enter a valid email address.");
      return;
    }
    setIsStarting(true);
    try {
      const res = await authedFetch("/api/auth/email/start-completion", {
        method: "POST",
        body: JSON.stringify({ email: trimmed }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const ec = json?.code as string | undefined;
        const msg =
          ec === "EMAIL_TAKEN"
            ? "This email is already linked to another Riplect account. Sign in to that account, or use a different email."
            : ec === "INVALID_EMAIL"
              ? "That doesn't look like a valid email address."
              : ec === "RATE_LIMITED"
                ? `Too many requests. Try again in ${json.retryAfterSec ?? 60}s.`
                : ec === "SEND_FAILED"
                  ? "We couldn't send the verification email. Please try again."
                  : json?.error || "Could not start email verification. Please try again.";
        setErrorMsg(msg);
        return;
      }
      if (json.googleEligible === true) {
        setStage({ kind: "google", email: trimmed });
      } else {
        // New flow: ask the user to set a password inline. We do NOT
        // send a verification link yet — we'll send it after the
        // password is set (so they can sign back in later).
        setStage({ kind: "set-password", email: trimmed });
        posthog.capture("coach_onboarding_email_inline_password_prompted");
      }
    } catch (err: unknown) {
      setErrorMsg(errMsg(err, "Could not start email verification."));
    } finally {
      setIsStarting(false);
    }
  }, [email]);

  const submitInlinePassword = useCallback(
    async (password: string) => {
      if (stage.kind !== "set-password") return;
      setErrorMsg(null);
      const targetEmail = stage.email;
      setStage({ kind: "swapping", email: targetEmail });
      try {
        const res = await authedFetch("/api/auth/email/set-password-inline", {
          method: "POST",
          body: JSON.stringify({ email: targetEmail, password }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          const ec = json?.code as string | undefined;
          const msg =
            ec === "EMAIL_TAKEN"
              ? "This email is already linked to another Riplect account."
              : ec === "WEAK_PASSWORD"
                ? json?.error || "Please choose a stronger password."
                : ec === "INVALID_EMAIL"
                  ? "That doesn't look like a valid email address."
                  : ec === "GOOGLE_DOMAIN"
                    ? "This email is managed by Google. Please use Google sign-in instead."
                    : ec === "RATE_LIMITED"
                      ? `Too many requests. Try again in ${json.retryAfterSec ?? 60}s.`
                      : ec === "PROFILE_NOT_FOUND"
                        ? "Your account setup isn't complete yet. Please refresh the page and try again."
                        : json?.error || "Could not set your password. Please try again.";
          setErrorMsg(msg);
          // Drop back so they can retry without losing the typed email.
          setStage({ kind: "set-password", email: targetEmail });
          return;
        }
        posthog.capture("coach_onboarding_email_inline_password_set", {
          confirmation_email_sent: !!json?.emailConfirmationSent,
        });
        toast({
          title: "Password set",
          description: json?.emailConfirmationSent
            ? `We sent a confirmation link to ${targetEmail} so you can sign in by email later.`
            : `Your password is set. We'll send a confirmation link to ${targetEmail} shortly.`,
        });
        // Notify the parent immediately with the swapped email so it
        // can advance the step without waiting for the Supabase
        // session to refresh (refreshSession sometimes lags an email
        // change made server-side via the admin API).
        const swappedEmail =
          (typeof json?.email === "string" && json.email) || targetEmail;
        onInlineSwapped?.(swappedEmail);
        await onVerified();
      } catch (err: unknown) {
        setErrorMsg(errMsg(err, "Could not set your password."));
        setStage({ kind: "set-password", email: targetEmail });
      }
    },
    [stage, toast, onVerified, onInlineSwapped],
  );

  const handleGoogleCredential = useCallback(
    async (idToken: string, typedEmail: string) => {
      setErrorMsg(null);
      setStage({ kind: "swapping", email: typedEmail });
      try {
        const res = await authedFetch("/api/auth/email/complete-with-google", {
          method: "POST",
          body: JSON.stringify({ idToken, email: typedEmail }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          const ec = json?.code as string | undefined;
          const msg =
            ec === "GOOGLE_EMAIL_MISMATCH"
              ? "You signed in with a different Google account than the email you typed. Use the matching Google account, or change the email."
              : ec === "EMAIL_TAKEN"
                ? "This email is already linked to another Riplect account. Please use a different email address."
                : ec === "GOOGLE_IDENTITY_TAKEN"
                  ? "This Google account is already linked to another Riplect user."
                  : ec === "INVALID_ID_TOKEN"
                    ? "Could not verify your Google sign-in. Please try again."
                    : ec === "MISSING_ID_TOKEN"
                      ? "We didn't receive your Google sign-in. Please click the Google button again."
                      : ec === "NOT_CONFIGURED"
                        ? "Google sign-in is temporarily unavailable. Please use the email link option instead."
                        : ec === "RATE_LIMITED"
                          ? `Too many attempts. Try again in ${json.retryAfterSec ?? 60}s.`
                          : json?.error || "Could not complete Google sign-in.";
          setErrorMsg(msg);
          // Drop back to the Google chooser so they can retry without
          // losing their typed email.
          setStage({ kind: "google", email: typedEmail });
          return;
        }
        // Success — clear the sessionStorage checkpoint.
        try { sessionStorage.removeItem(PENDING_GOOGLE_EMAIL_KEY); } catch {}
        posthog.capture("coach_onboarding_email_verified", { method: "google" });
        onInlineSwapped?.(typedEmail);
        await onVerified();
      } catch (err: unknown) {
        setErrorMsg(errMsg(err, "Could not complete Google sign-in."));
        setStage({ kind: "google", email: typedEmail });
      }
    },
    [onVerified, onInlineSwapped],
  );

  return (
    <div className="space-y-3">
      <Label htmlFor="onboarding-email" className="flex items-center gap-2">
        <Mail className="w-4 h-4" />
        Email
      </Label>
      <p className="text-xs text-gray-500">
        Required. We'll send a one-time link, or use Google sign-in if your
        email is on a Google account.
      </p>

      {stage.kind === "enter" && (
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            id="onboarding-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            data-testid="input-onboarding-email"
            className="flex-1"
          />
          <Button
            type="button"
            onClick={start}
            disabled={isStarting || !email.trim()}
            className="bg-[#b66667] hover:bg-[#b85858] sm:w-auto"
            data-testid="button-start-email-verification"
          >
            {isStarting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Checking…
              </>
            ) : (
              "Verify email"
            )}
          </Button>
        </div>
      )}

      {stage.kind === "google" && (
        <GoogleVerifyPanel
          email={stage.email}
          onCredential={(idToken) => handleGoogleCredential(idToken, stage.email)}
          onChangeEmail={() => {
            try { sessionStorage.removeItem(PENDING_GOOGLE_EMAIL_KEY); } catch {}
            setStage({ kind: "enter" });
            setEmail("");
            setErrorMsg(null);
          }}
        />
      )}

      {stage.kind === "set-password" && (
        <SetPasswordInlinePanel
          email={stage.email}
          onSubmit={submitInlinePassword}
          onChangeEmail={() => {
            setStage({ kind: "enter" });
            setErrorMsg(null);
          }}
        />
      )}

      {stage.kind === "swapping" && (
        <div className="flex items-center gap-2 text-sm text-gray-700 rounded-md bg-gray-50 border border-gray-200 px-3 py-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Setting up <span className="font-medium">{stage.email}</span>…
        </div>
      )}

      {errorMsg && (
        <Alert variant="destructive" data-testid="alert-email-error">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{errorMsg}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

/**
 * Inline "Set a password" panel shown right under the email input
 * after the user enters a non-Google email. We collect a password
 * + confirmation here so the rest of onboarding can continue without
 * bouncing the user through their inbox first. A separate one-time
 * confirmation link is emailed in the background — required to log
 * back in via email + password later.
 */
function SetPasswordInlinePanel({
  email,
  onSubmit,
  onChangeEmail,
}: {
  email: string;
  onSubmit: (password: string) => Promise<void>;
  onChangeEmail: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLocalError(null);
      if (password.length < 8) {
        setLocalError("Password must be at least 8 characters.");
        return;
      }
      if (password !== confirm) {
        setLocalError("Passwords do not match.");
        return;
      }
      setSubmitting(true);
      try {
        await onSubmit(password);
      } finally {
        setSubmitting(false);
      }
    },
    [password, confirm, onSubmit],
  );

  return (
    <form
      className="space-y-3"
      onSubmit={handleSubmit}
      data-testid="panel-email-set-password"
    >
      <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-3 text-sm text-blue-900">
        <div className="font-medium mb-1">
          Set a password for <span className="break-all">{email}</span>
        </div>
        <div>
          You'll use this password (with your email) to sign in later. We'll
          also send a confirmation link to this address — clicking it is
          required to enable email + password sign-in.
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="onboarding-password" className="flex items-center gap-2">
          <Lock className="w-4 h-4" />
          Password
        </Label>
        <Input
          id="onboarding-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          data-testid="input-onboarding-password"
          disabled={submitting}
        />
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="onboarding-password-confirm"
          className="flex items-center gap-2"
        >
          <Lock className="w-4 h-4" />
          Confirm password
        </Label>
        <Input
          id="onboarding-password-confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Re-enter the password"
          data-testid="input-onboarding-password-confirm"
          disabled={submitting}
        />
      </div>

      {localError && (
        <Alert variant="destructive" data-testid="alert-password-error">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{localError}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          type="submit"
          disabled={submitting || !password || !confirm}
          className="bg-[#b66667] hover:bg-[#b85858] sm:w-auto"
          data-testid="button-submit-inline-password"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving…
            </>
          ) : (
            "Set password & continue"
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onChangeEmail}
          disabled={submitting}
          data-testid="button-change-email"
        >
          Change email
        </Button>
      </div>
    </form>
  );
}

function GoogleVerifyPanel({
  email,
  onCredential,
  onChangeEmail,
}: {
  email: string;
  onCredential: (idToken: string) => void;
  onChangeEmail: () => void;
}) {
  const gisReady = useGoogleIdentityServices();
  const [clientId, setClientId] = useState<string | null>(null);
  const buttonContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    getGoogleOAuthClientId().then((id) => {
      if (!cancelled) setClientId(id);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the credential callback in a ref so we can re-init GIS without
  // re-creating it on every parent render.
  const onCredentialRef = useRef(onCredential);
  useEffect(() => {
    onCredentialRef.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    if (!gisReady || !clientId || !buttonContainerRef.current) return;
    const g = getGoogleSdk();
    if (!g?.accounts?.id) return;
    try {
      g.accounts.id.initialize({
        client_id: clientId,
        callback: (resp) => {
          if (resp?.credential) {
            onCredentialRef.current(resp.credential);
          }
        },
        auto_select: false,
        cancel_on_tap_outside: true,
        ux_mode: "popup",
        login_hint: email,
      });
      // Wipe & re-render on each change so width/login_hint stays fresh.
      buttonContainerRef.current.innerHTML = "";
      g.accounts.id.renderButton(buttonContainerRef.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        logo_alignment: "left",
        width: Math.min(
          buttonContainerRef.current.offsetWidth || 320,
          400,
        ),
      });
    } catch (e) {
      console.error("[onboarding] GIS init failed:", e);
    }
  }, [gisReady, clientId, email]);

  return (
    <div className="space-y-3" data-testid="panel-email-google">
      <div className="rounded-md bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-700">
        <span className="font-medium">{email}</span> looks like a Google
        account — verify in one click.
      </div>

      {!clientId ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Google sign-in is not configured</AlertTitle>
          <AlertDescription>
            Please choose a different email and we'll send you a verification
            link instead.
          </AlertDescription>
        </Alert>
      ) : !gisReady ? (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading Google sign-in…
        </div>
      ) : (
        <div ref={buttonContainerRef} data-testid="button-google-verify-email" />
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
        <button
          type="button"
          className="underline hover:text-gray-900"
          onClick={onChangeEmail}
          data-testid="button-change-email-google"
        >
          Change email
        </button>
        <span className="inline-flex items-center gap-1 text-gray-500">
          <FcGoogle className="w-3.5 h-3.5" />
          Verified by Google
        </span>
      </div>
    </div>
  );
}
