// Riplect transactional emails — Direction A (Editorial & Warm)
//
// All templates are rendered via the shared `renderEmailLayout` primitive in
// `./email/layout.ts`. Deep links are constructed via helpers in `./email/links.ts`
// so that coaches always land on the exact dashboard row and guests on the
// exact guest-portal scope. Public function signatures preserved for callers.

import {
  renderEmailLayout,
  renderConfirmationCodeHtml,
  renderRawUrlFallbackHtml,
  type DetailRow,
  type CalloutBlock,
  type EmailButton,
} from './email/layout';
import {
  coachBookingLink,
  coachContactLink,
  coachEventLink,
  coachProductLink,
  dashboardLink,
  eventCancelLink,
  guestPortalLink,
  buildGoogleCalendarUrl,
} from './email/links';
import { renderMethodDetailsHtml } from './email/methodDetails';
import { sendEmail } from './email/sender';
import {
  formatFullLocation,
  formatLocationWithVisibility,
  type LocationInfo,
  type LocationVisibility,
} from './email/location';
import { escapeHtml, sanitizeUrl } from './email/utils';

// Re-export types/helpers used by callers elsewhere
export type { LocationInfo, LocationVisibility };
export { renderMethodDetailsHtml };

// ============================================
// ACCOUNT EMAILS
// ============================================

export async function sendVerificationEmail(
  email: string,
  firstName: string | null,
  verificationUrl: string,
): Promise<void> {
  const safeName = firstName?.trim() || 'there';
  const html = renderEmailLayout({
    preheader: 'Confirm your email to start using Riplect.',
    greeting: `Welcome, ${safeName}`,
    headline: 'Verify your email address',
    intro:
      "Tap the button below to confirm your email and finish setting up your Riplect account.",
    primaryButton: { label: 'Verify email', href: verificationUrl },
    afterCtaHtml: renderRawUrlFallbackHtml(verificationUrl),
    closing: 'This link expires in 24 hours.',
    footerNote:
      "Riplect · You received this because you signed up. If that wasn't you, ignore this email.",
  });
  await sendEmail({
    to: email,
    subject: 'Verify your Riplect account',
    html,
  });
}

export async function sendEmailCompletionEmail(
  email: string,
  firstName: string | null,
  completionUrl: string,
): Promise<void> {
  const safeName = firstName?.trim() || 'there';
  const html = renderEmailLayout({
    preheader: 'Confirm your email and set a password to finish your Riplect account.',
    greeting: `Hi ${safeName}`,
    headline: 'Confirm your email & set a password',
    intro:
      "You signed in to Riplect with your phone. To finish your account, confirm this email and choose a password.",
    primaryButton: { label: 'Confirm email & set password', href: completionUrl },
    afterCtaHtml: renderRawUrlFallbackHtml(completionUrl),
    closing: 'This link expires in 30 minutes.',
    footerNote:
      "Riplect · You received this because someone is finishing a Riplect account using this email. If that wasn't you, ignore this email.",
  });
  await sendEmail({
    to: email,
    subject: 'Confirm your email — Riplect',
    html,
  });
}

export async function sendEmailConfirmationOnlyEmail(
  email: string,
  firstName: string | null,
  confirmUrl: string,
): Promise<void> {
  const safeName = firstName?.trim() || 'there';
  const html = renderEmailLayout({
    preheader: 'Confirm your email address for your Riplect account.',
    greeting: `Hi ${safeName}`,
    headline: 'Confirm your email address',
    intro:
      "Tap the button below to confirm this email address for your Riplect account.",
    primaryButton: { label: 'Confirm my email', href: confirmUrl },
    afterCtaHtml: renderRawUrlFallbackHtml(confirmUrl),
    closing: 'This link expires in 30 minutes.',
    footerNote:
      "Riplect · You received this because someone added this email to a Riplect account. If that wasn't you, ignore this email.",
  });
  await sendEmail({
    to: email,
    subject: 'Confirm your email — Riplect',
    html,
  });
}

export async function sendPasswordResetEmail(
  email: string,
  firstName: string | null,
  resetUrl: string,
): Promise<void> {
  const safeName = firstName?.trim() || 'there';
  const html = renderEmailLayout({
    preheader: 'Reset your Riplect password.',
    greeting: `Hi ${safeName}`,
    headline: 'Reset your password',
    intro:
      'We received a request to reset your password. Tap the button below to choose a new one.',
    primaryButton: { label: 'Reset password', href: resetUrl },
    blocks: [
      {
        tone: 'warn',
        title: 'Heads up',
        bodyHtml:
          'This password reset link expires in 1 hour for your security. If you didn\'t request a reset, you can safely ignore this email.',
      },
    ],
    afterCtaHtml: renderRawUrlFallbackHtml(resetUrl),
  });
  await sendEmail({
    to: email,
    subject: 'Reset your Riplect password',
    html,
  });
}

/**
 * "Claim your Riplect account" — sent by the WhatsApp bot after it
 * collects the user's email. The big button is a Supabase magic link
 * that drops the user into `/whatsapp-verify`. The account-summary card
 * shows what the bot captured so the user can spot mistakes before
 * signing in. Magic-link possession is sign-in convenience only — the
 * verification gate (email_verified_at) is set later by the OTP/Google
 * flow on `/whatsapp-verify`.
 */
export async function sendWhatsappClaimEmail(
  email: string,
  params: {
    displayName: string;
    username: string;
    title: string | null;
    phoneE164: string;
    magicLink: string;
  },
): Promise<void> {
  const safeName = params.displayName?.trim() || 'there';
  const details: DetailRow[] = [
    { label: 'Name', valueHtml: escapeHtml(params.displayName) },
    { label: 'Username', valueHtml: escapeHtml('@' + params.username) },
    { label: 'Title', valueHtml: params.title ? escapeHtml(params.title) : '<span style="opacity:0.6;">(not set)</span>' },
    { label: 'Phone', valueHtml: escapeHtml(params.phoneE164) },
    { label: 'Email', valueHtml: escapeHtml(email) },
  ];
  const html = renderEmailLayout({
    preheader: 'Tap to finish setting up your Riplect account.',
    eyebrow: 'Almost there',
    greeting: `Hi ${safeName},`,
    headline: `${safeName}, finish setting up your Riplect account`,
    intro:
      "We started your Riplect account from your WhatsApp chat. Tap the button below to verify this email and finish setup — it takes about 30 seconds.",
    details,
    primaryButton: { label: 'Finish setting up my account', href: params.magicLink },
    afterCtaHtml: renderRawUrlFallbackHtml(params.magicLink),
    blocks: [
      {
        tone: 'info',
        title: 'Something off?',
        bodyHtml:
          'If anything above is wrong, just reply to the WhatsApp bot and ask to update it before you finish.',
      },
    ],
    closing: 'This sign-in link expires in 1 hour for your security.',
    footerNote:
      "Riplect · You received this because someone (probably you!) started a Riplect account using this email on WhatsApp. If that wasn't you, ignore this email.",
  });
  await sendEmail({
    to: email,
    subject: `${safeName}, finish setting up your Riplect account`,
    html,
  });
}

/**
 * 6-digit verification code email used by the `/whatsapp-verify` flow
 * for users on non-Gmail domains. Mirrors `sendVerificationEmail` styling
 * but with a prominent code rather than a button — there is no link
 * to click, the user types the code on the page they're already on.
 */
export async function sendEmailOtpEmail(
  email: string,
  firstName: string | null,
  code: string,
  ttlMinutes: number,
): Promise<void> {
  const safeName = firstName?.trim() || 'there';
  const html = renderEmailLayout({
    preheader: `Your Riplect verification code: ${code}`,
    eyebrow: 'Verification code',
    greeting: `Hi ${safeName},`,
    headline: 'Your Riplect verification code',
    intro:
      "Type this code on the page you just opened to verify your email address.",
    details: [
      { label: 'Code', valueHtml: renderConfirmationCodeHtml(code) },
    ],
    closing: `This code expires in ${ttlMinutes} minutes. If you didn't request it, you can ignore this email.`,
    footerNote:
      "Riplect · You received this because someone is verifying this email for a Riplect account.",
  });
  await sendEmail({
    to: email,
    subject: `Your Riplect verification code: ${code}`,
    html,
  });
}

export async function sendWelcomeEmail(
  email: string,
  firstName: string | null,
): Promise<void> {
  const safeName = firstName?.trim() || 'there';
  const html = renderEmailLayout({
    preheader: 'Your Riplect profile is ready to set up.',
    greeting: `Welcome, ${safeName}.`,
    headline: "Let's set up your space.",
    intro:
      'Riplect helps you take bookings, sell digital products, and run events — all from one profile your audience already knows how to find.',
    bodyHtml: `
      <ol style="margin: 0; padding: 0; list-style: none; max-width: 420px; margin: 0 auto;">
        ${[
          'Claim your handle (riplect.com/yourname)',
          'Add your first session or product',
          'Share your link anywhere',
        ]
          .map(
            (step, i) => `
          <li style="display: flex; align-items: center; padding: 12px 0;">
            <span style="font-family: 'Space Grotesk', 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 28px; font-style: italic; color: rgba(199,110,90,0.6); width: 36px; text-align: center;">${i + 1}</span>
            <span style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 16px; color: #171a21; padding-left: 12px;">${escapeHtml(step)}</span>
          </li>
        `,
          )
          .join('')}
      </ol>
    `,
    primaryButton: { label: 'Set up my profile', href: dashboardLink() },
    closing: 'Need help? Reply to this email and a real human will answer.',
    footerNote: 'Riplect · A home for coaches, healers and creators',
  });
  await sendEmail({
    to: email,
    subject: 'Welcome to Riplect — Get started',
    html,
  });
}

// ============================================
// CONTACT & MESSAGING
// ============================================

export async function sendContactMessageToCoach(
  coachEmail: string,
  coachName: string | null,
  senderName: string,
  senderEmail: string,
  senderPhone: string | null,
  subject: string,
  message: string,
): Promise<void> {
  const safeName = coachName?.trim() || 'there';
  const details: DetailRow[] = [
    { label: 'From', valueHtml: escapeHtml(senderName) },
    {
      label: 'Email',
      valueHtml: `<a href="mailto:${escapeHtml(senderEmail)}" style="color: #b66667; text-decoration: underline; text-underline-offset: 3px;">${escapeHtml(senderEmail)}</a>`,
    },
  ];
  if (senderPhone) details.push({ label: 'Phone', valueHtml: escapeHtml(senderPhone) });
  details.push({ label: 'Subject', valueHtml: escapeHtml(subject) });

  const html = renderEmailLayout({
    preheader: `New message from ${senderName}`,
    greeting: `Hi ${safeName}`,
    headline: 'A new message from your profile',
    intro: `${senderName} reached out through your Riplect profile.`,
    details,
    blocks: [{ tone: 'info', title: 'Message', bodyHtml: escapeHtml(message) }],
    closing: `Reply directly to this email to respond to ${senderName}.`,
  });
  await sendEmail({
    to: coachEmail,
    subject: `New message: ${subject}`,
    html,
  });
}

export async function sendPlatformContactEmail(
  senderName: string,
  senderEmail: string,
  senderPhone: string | null,
  subject: string,
  message: string,
): Promise<void> {
  const platformEmail = 'riplek2025@gmail.com';
  const details: DetailRow[] = [
    { label: 'From', valueHtml: escapeHtml(senderName) },
    {
      label: 'Email',
      valueHtml: `<a href="mailto:${escapeHtml(senderEmail)}" style="color: #b66667; text-decoration: underline; text-underline-offset: 3px;">${escapeHtml(senderEmail)}</a>`,
    },
  ];
  if (senderPhone) details.push({ label: 'Phone', valueHtml: escapeHtml(senderPhone) });
  details.push({ label: 'Subject', valueHtml: escapeHtml(subject) });

  const html = renderEmailLayout({
    preheader: `Platform contact: ${subject}`,
    greeting: 'Riplect platform',
    headline: 'New contact form message',
    intro: 'A new message arrived through the Riplect platform contact form.',
    details,
    blocks: [{ tone: 'info', title: 'Message', bodyHtml: escapeHtml(message) }],
    closing: `Reply directly to this email to respond to ${senderName}.`,
  });
  const sent = await sendEmail({
    to: platformEmail,
    subject: `[Riplect Contact] ${subject}`,
    html,
  });
  if (!sent) {
    throw new Error('Email provider not configured - contact message not delivered');
  }
}

// ============================================
// BOOKING — REQUEST / CONFIRM / CANCEL
// ============================================

export async function sendBookingPendingToClient(
  clientEmail: string,
  clientName: string,
  coachName: string,
  sessionTitle: string,
  bookingDate: string,
  bookingTime: string,
  confirmationCode: string,
  guestAccessToken: string | null = null,
  bookingId: number | null = null,
): Promise<void> {
  const portalUrl = guestAccessToken
    ? guestPortalLink({ token: guestAccessToken, bookingId, tab: 'bookings' })
    : null;

  const html = renderEmailLayout({
    preheader: `Booking request received — waiting on ${coachName}`,
    greeting: `Hi ${clientName}`,
    headline: `Your request reached ${coachName}`,
    intro: `${coachName} will review your request and reply soon. Here's a copy of what you submitted.`,
    details: [
      { label: 'Session', valueHtml: escapeHtml(sessionTitle) },
      { label: 'Coach', valueHtml: escapeHtml(coachName) },
      { label: 'Date', valueHtml: escapeHtml(bookingDate) },
      { label: 'Time', valueHtml: escapeHtml(bookingTime) },
      {
        label: 'Confirmation code',
        valueHtml: renderConfirmationCodeHtml(confirmationCode),
      },
    ],
    primaryButton: portalUrl
      ? { label: 'View your booking', href: portalUrl }
      : undefined,
    closing: "We'll email you the moment it's confirmed.",
  });
  await sendEmail({
    to: clientEmail,
    subject: `Booking request submitted — ${sessionTitle}`,
    html,
  });
}

export async function sendBookingRequestToCoach(
  coachEmail: string,
  coachName: string | null,
  clientName: string,
  clientEmail: string,
  clientPhone: string | null,
  sessionTitle: string,
  bookingDate: string,
  bookingTime: string,
  confirmationCode: string,
  message: string | null,
  sessionId: number,
  sessionMode: string | null = null,
  locationInfo: LocationInfo | null = null,
  locationVisibility: LocationVisibility | null = null,
  bookingId: number | null = null,
): Promise<void> {
  const safeName = coachName?.trim() || 'there';
  const details: DetailRow[] = [
    { label: 'Session', valueHtml: escapeHtml(sessionTitle) },
    { label: 'Date', valueHtml: escapeHtml(bookingDate) },
    { label: 'Time', valueHtml: escapeHtml(bookingTime) },
    { label: 'Mode', valueHtml: sessionMode === 'offline' ? 'In-person' : 'Online' },
  ];

  if (sessionMode === 'offline' && locationInfo && locationVisibility) {
    const formatted = formatLocationWithVisibility(locationInfo, locationVisibility);
    if (formatted) {
      let v = formatted;
      if (locationVisibility.showMapLocation && locationInfo.googleMapsUrl) {
        v += ` · <a href="${sanitizeUrl(locationInfo.googleMapsUrl)}" target="_blank" style="color: #b66667; text-decoration: underline; text-underline-offset: 3px;">View map</a>`;
      }
      details.push({ label: 'Location', valueHtml: v });
    }
  }
  details.push({ label: 'Client', valueHtml: escapeHtml(clientName) });
  details.push({
    label: 'Email',
    valueHtml: `<a href="mailto:${escapeHtml(clientEmail)}" style="color: #b66667; text-decoration: underline; text-underline-offset: 3px;">${escapeHtml(clientEmail)}</a>`,
  });
  if (clientPhone) details.push({ label: 'Phone', valueHtml: escapeHtml(clientPhone) });
  details.push({ label: 'Confirmation', valueHtml: escapeHtml(confirmationCode) });

  const blocks: CalloutBlock[] = [];
  if (message) {
    blocks.push({
      tone: 'info',
      title: `Note from ${clientName}`,
      bodyHtml: escapeHtml(message),
    });
  }

  const html = renderEmailLayout({
    preheader: `New booking request from ${clientName}`,
    greeting: `Hi ${safeName}`,
    headline: 'A new booking request',
    intro: `${clientName} just requested a session with you. Confirm or decline from your dashboard.`,
    details,
    blocks,
    primaryButton: {
      label: 'Open in dashboard',
      href: coachBookingLink({ sessionId, bookingId }),
    },
  });
  await sendEmail({
    to: coachEmail,
    subject: `New booking request — ${sessionTitle} on ${bookingDate}`,
    html,
  });
}

export async function sendBookingConfirmedToClient(
  clientEmail: string,
  clientName: string,
  coachName: string,
  sessionTitle: string,
  bookingDate: string,
  bookingTime: string,
  confirmationCode: string,
  coachMessage: string | null,
  meetingLink: string | null,
  sessionMode: string | null = null,
  locationInfo: LocationInfo | null = null,
  guestAccessToken: string | null = null,
  paymentInfo: string | null = null,
  methodsOffered: any[] | null = null,
  customInstruction: string | null = null,
  bookingId: number | null = null,
): Promise<void> {
  const portalUrl = guestAccessToken
    ? guestPortalLink({ token: guestAccessToken, bookingId, tab: 'bookings' })
    : null;
  const hasPaymentRequest =
    (methodsOffered && methodsOffered.length > 0) || !!customInstruction;
  const fullLocation =
    sessionMode === 'offline' ? formatFullLocation(locationInfo) : null;

  const calendarUrl = buildGoogleCalendarUrl({
    title: `${sessionTitle} with ${coachName}`,
    startDate: bookingDate,
    startTime: bookingTime,
    durationMinutes: 60,
    description: `Booking confirmation code: ${confirmationCode}`,
    location: fullLocation,
  });

  const details: DetailRow[] = [
    { label: 'Session', valueHtml: escapeHtml(sessionTitle) },
    { label: 'Coach', valueHtml: escapeHtml(coachName) },
    { label: 'Date', valueHtml: escapeHtml(bookingDate) },
    { label: 'Time', valueHtml: escapeHtml(bookingTime) },
    { label: 'Mode', valueHtml: sessionMode === 'offline' ? 'In-person' : 'Online' },
  ];
  if (fullLocation) {
    let v = fullLocation;
    if (locationInfo?.googleMapsUrl) {
      v += ` · <a href="${sanitizeUrl(locationInfo.googleMapsUrl)}" target="_blank" style="color: #b66667; text-decoration: underline; text-underline-offset: 3px;">View map</a>`;
    }
    details.push({ label: 'Location', valueHtml: v });
  }
  if (!hasPaymentRequest && meetingLink) {
    details.push({
      label: 'Meeting',
      valueHtml: `<a href="${sanitizeUrl(meetingLink)}" target="_blank" style="color: #b66667; text-decoration: underline; text-underline-offset: 3px;">Join link</a>`,
    });
  }
  details.push({
    label: 'Confirmation',
    valueHtml: renderConfirmationCodeHtml(confirmationCode),
  });

  const blocks: CalloutBlock[] = [];
  if (coachMessage) {
    blocks.push({
      tone: 'info',
      title: `Message from ${coachName}`,
      bodyHtml: escapeHtml(coachMessage),
    });
  }
  if (hasPaymentRequest) {
    if (methodsOffered && methodsOffered.length > 0) {
      blocks.push({
        tone: 'warn',
        title: 'Payment options',
        bodyHtml: `<div style="margin-top: 8px;">${methodsOffered
          .map(renderMethodDetailsHtml)
          .join('')}</div>`,
      });
    } else if (customInstruction) {
      blocks.push({
        tone: 'warn',
        title: 'Payment instructions',
        bodyHtml: escapeHtml(customInstruction),
      });
    }
  } else if (paymentInfo) {
    blocks.push({
      tone: 'warn',
      title: 'Payment information',
      bodyHtml: escapeHtml(paymentInfo),
    });
  }

  let primaryButton: EmailButton | undefined;
  let secondaryButton: EmailButton | undefined;
  if (hasPaymentRequest && portalUrl) {
    primaryButton = {
      label: 'Submit payment proof',
      href: portalUrl,
    };
  } else {
    if (portalUrl) {
      primaryButton = { label: 'Manage your booking', href: portalUrl };
      secondaryButton = { label: 'Add to calendar', href: calendarUrl, variant: 'outline' };
    } else {
      primaryButton = { label: 'Add to calendar', href: calendarUrl };
    }
  }

  const headline = hasPaymentRequest
    ? `Confirmed — payment needed to lock it in`
    : `Your session with ${coachName} is confirmed`;
  const intro = hasPaymentRequest
    ? `${coachName} confirmed your booking. Complete payment to finalize your session.`
    : `${coachName} has confirmed your booking. Here's everything you need.`;

  const html = renderEmailLayout({
    preheader: hasPaymentRequest
      ? `Booking confirmed — please send payment.`
      : `Your booking with ${coachName} is confirmed.`,
    greeting: `Hi ${clientName}`,
    headline,
    intro,
    details,
    blocks,
    primaryButton,
    secondaryButton,
    closing: hasPaymentRequest
      ? undefined
      : `See you ${escapeHtml(bookingDate)} — ${escapeHtml(coachName)} & the Riplect team`,
  });
  await sendEmail({
    to: clientEmail,
    subject: hasPaymentRequest
      ? `Booking confirmed — payment required — ${sessionTitle} on ${bookingDate}`
      : `Booking confirmed — ${sessionTitle} on ${bookingDate}`,
    html,
  });
}

export async function sendBookingCancellationToCoach(
  coachEmail: string,
  coachName: string | null,
  clientName: string,
  clientEmail: string,
  sessionTitle: string,
  bookingDate: string,
  bookingTime: string,
  confirmationCode: string,
): Promise<void> {
  const safeName = coachName?.trim() || 'there';
  const html = renderEmailLayout({
    preheader: `${clientName} cancelled their booking`,
    greeting: `Hi ${safeName}`,
    headline: 'A booking was cancelled',
    intro: `${clientName} just cancelled. The time slot is now open again.`,
    details: [
      { label: 'Session', valueHtml: escapeHtml(sessionTitle) },
      { label: 'Date', valueHtml: escapeHtml(bookingDate) },
      { label: 'Time', valueHtml: escapeHtml(bookingTime) },
      { label: 'Client', valueHtml: escapeHtml(clientName) },
      {
        label: 'Email',
        valueHtml: `<a href="mailto:${escapeHtml(clientEmail)}" style="color: #b66667; text-decoration: underline; text-underline-offset: 3px;">${escapeHtml(clientEmail)}</a>`,
      },
      { label: 'Confirmation', valueHtml: escapeHtml(confirmationCode) },
    ],
    primaryButton: {
      label: 'Open in dashboard',
      href: coachBookingLink({}),
    },
  });
  await sendEmail({
    to: coachEmail,
    subject: `Booking cancelled — ${sessionTitle} on ${bookingDate}`,
    html,
  });
}

export async function sendCancellationToCoach(
  coachEmail: string,
  coachName: string,
  clientName: string,
  clientEmail: string,
  sessionTitle: string,
  bookingDate: string,
  bookingTime: string,
  cancellationReason: string,
  sessionId: number | null = null,
  bookingId: number | null = null,
): Promise<void> {
  const html = renderEmailLayout({
    preheader: `${clientName} cancelled their booking`,
    greeting: `Hi ${coachName}`,
    headline: `${escapeHtml(clientName)} cancelled`,
    intro: 'The time slot is now available for other bookings.',
    details: [
      { label: 'Session', valueHtml: escapeHtml(sessionTitle) },
      { label: 'Date', valueHtml: escapeHtml(bookingDate) },
      { label: 'Time', valueHtml: escapeHtml(bookingTime) },
      { label: 'Client', valueHtml: escapeHtml(clientName) },
      {
        label: 'Email',
        valueHtml: `<a href="mailto:${escapeHtml(clientEmail)}" style="color: #b66667; text-decoration: underline; text-underline-offset: 3px;">${escapeHtml(clientEmail)}</a>`,
      },
    ],
    blocks: [
      {
        tone: 'muted',
        title: 'Reason',
        bodyHtml: escapeHtml(cancellationReason),
      },
    ],
    primaryButton: {
      label: 'View in dashboard',
      href: coachBookingLink({ sessionId, bookingId }),
    },
  });
  await sendEmail({
    to: coachEmail,
    subject: `Booking cancelled by client — ${sessionTitle} on ${bookingDate}`,
    html,
  });
}

export async function sendCancellationToClient(
  clientEmail: string,
  clientName: string,
  coachName: string,
  coachUsername: string,
  sessionTitle: string,
  bookingDate: string,
  bookingTime: string,
  cancellationReason: string,
  _coachContactInfo: any | null,
  guestAccessToken: string | null,
  bookingId: number | null = null,
): Promise<void> {
  const portalUrl = guestAccessToken
    ? guestPortalLink({ token: guestAccessToken, bookingId, tab: 'bookings' })
    : null;
  const contactUrl = coachUsername ? coachContactLink(coachUsername) : null;

  const html = renderEmailLayout({
    preheader: `${coachName} cancelled your booking`,
    greeting: `Hi ${clientName}`,
    headline: `${escapeHtml(coachName)} had to cancel`,
    intro: `We're sorry — your booking has been cancelled. Reach out to ${coachName} if you'd like to reschedule.`,
    details: [
      { label: 'Session', valueHtml: escapeHtml(sessionTitle) },
      { label: 'Date', valueHtml: escapeHtml(bookingDate) },
      { label: 'Time', valueHtml: escapeHtml(bookingTime) },
      { label: 'Coach', valueHtml: escapeHtml(coachName) },
    ],
    blocks: [
      {
        tone: 'muted',
        title: `Message from ${coachName}`,
        bodyHtml: escapeHtml(cancellationReason),
      },
    ],
    primaryButton: contactUrl
      ? { label: `Contact ${coachName}`, href: contactUrl }
      : undefined,
    secondaryButton: portalUrl
      ? { label: 'View your bookings', href: portalUrl }
      : undefined,
  });
  await sendEmail({
    to: clientEmail,
    subject: `Booking cancelled — ${sessionTitle} on ${bookingDate}`,
    html,
  });
}

// ============================================
// RESCHEDULE
// ============================================

export async function sendRescheduleDeclinedToClient(
  clientEmail: string,
  clientName: string,
  coachName: string,
  coachUsername: string,
  sessionTitle: string,
  originalDate: string,
  originalTime: string,
  declineReason: string,
  guestAccessToken: string | null,
  bookingId: number | null = null,
): Promise<void> {
  const portalUrl = guestAccessToken
    ? guestPortalLink({ token: guestAccessToken, bookingId, tab: 'bookings' })
    : null;
  const contactUrl = coachUsername ? coachContactLink(coachUsername) : null;

  const html = renderEmailLayout({
    preheader: 'Your reschedule request was declined; original booking restored.',
    greeting: `Hi ${clientName}`,
    headline: 'Reschedule declined',
    intro: `${coachName} declined your reschedule request, so your original booking is still on the calendar.`,
    details: [
      { label: 'Session', valueHtml: escapeHtml(sessionTitle) },
      { label: 'Date', valueHtml: escapeHtml(originalDate) },
      { label: 'Time', valueHtml: escapeHtml(originalTime) },
      { label: 'Coach', valueHtml: escapeHtml(coachName) },
    ],
    blocks: [
      {
        tone: 'warn',
        title: `Message from ${coachName}`,
        bodyHtml: escapeHtml(declineReason),
      },
      {
        tone: 'success',
        bodyHtml:
          'Your booking is still confirmed at the original date and time above. No action needed.',
      },
    ],
    primaryButton: portalUrl
      ? { label: 'View your bookings', href: portalUrl }
      : undefined,
    secondaryButton: contactUrl
      ? { label: `Contact ${coachName}`, href: contactUrl }
      : undefined,
  });
  await sendEmail({
    to: clientEmail,
    subject: `Reschedule declined — your original booking is confirmed (${sessionTitle})`,
    html,
  });
}

export async function sendRescheduleToCoach(
  coachEmail: string,
  coachName: string,
  clientName: string,
  clientEmail: string,
  sessionTitle: string,
  oldDate: string,
  oldTime: string,
  newDate: string,
  newTime: string,
  clientMessage: string | null,
  sessionId: number | null = null,
  bookingId: number | null = null,
): Promise<void> {
  const blocks: CalloutBlock[] = [];
  if (clientMessage) {
    blocks.push({
      tone: 'info',
      title: `Message from ${clientName}`,
      bodyHtml: escapeHtml(clientMessage),
    });
  }
  blocks.push({
    tone: 'warn',
    title: 'Action required',
    bodyHtml:
      'This booking is back to pending. Please confirm or decline the new time from your dashboard.',
  });

  const changeHtml = `
    <span style="text-decoration: line-through; color: rgba(31,27,22,0.5);">${escapeHtml(oldDate)}, ${escapeHtml(oldTime)}</span>
    <span style="margin: 0 8px; color: #b66667;">→</span>
    <span style="color: #171a21; font-weight: 600;">${escapeHtml(newDate)}, ${escapeHtml(newTime)}</span>
  `;

  const html = renderEmailLayout({
    preheader: `${clientName} requested a reschedule`,
    greeting: `Hi ${coachName}`,
    headline: `${escapeHtml(clientName)} wants to reschedule`,
    intro: 'Review the new time and confirm or decline from your dashboard.',
    details: [
      { label: 'Session', valueHtml: escapeHtml(sessionTitle) },
      { label: 'Client', valueHtml: escapeHtml(clientName) },
      {
        label: 'Email',
        valueHtml: `<a href="mailto:${escapeHtml(clientEmail)}" style="color: #b66667; text-decoration: underline; text-underline-offset: 3px;">${escapeHtml(clientEmail)}</a>`,
      },
      { label: 'Change', valueHtml: changeHtml },
    ],
    blocks,
    primaryButton: {
      label: 'Review in dashboard',
      href: coachBookingLink({ sessionId, bookingId }),
    },
  });
  await sendEmail({
    to: coachEmail,
    subject: `Reschedule request — ${sessionTitle} to ${newDate}`,
    html,
  });
}

export async function sendRescheduleToClient(
  clientEmail: string,
  clientName: string,
  coachName: string,
  sessionTitle: string,
  oldDate: string,
  oldTime: string,
  newDate: string,
  newTime: string,
  coachMessage: string | null,
  guestAccessToken: string | null,
  bookingId: number | null = null,
): Promise<void> {
  const portalUrl = guestAccessToken
    ? guestPortalLink({ token: guestAccessToken, bookingId, tab: 'bookings' })
    : null;
  const blocks: CalloutBlock[] = [];
  if (coachMessage) {
    blocks.push({
      tone: 'info',
      title: `Message from ${coachName}`,
      bodyHtml: escapeHtml(coachMessage),
    });
  }
  blocks.push({
    tone: 'muted',
    bodyHtml: 'Please update your calendar with the new date and time.',
  });

  const changeHtml = `
    <span style="text-decoration: line-through; color: rgba(31,27,22,0.5);">${escapeHtml(oldDate)}, ${escapeHtml(oldTime)}</span>
    <span style="margin: 0 8px; color: #b66667;">→</span>
    <span style="color: #171a21; font-weight: 600;">${escapeHtml(newDate)}, ${escapeHtml(newTime)}</span>
  `;

  const html = renderEmailLayout({
    preheader: `${coachName} rescheduled your booking`,
    greeting: `Hi ${clientName}`,
    headline: 'Your booking has a new time',
    intro: `${coachName} rescheduled your session. Here are the new details.`,
    details: [
      { label: 'Session', valueHtml: escapeHtml(sessionTitle) },
      { label: 'Coach', valueHtml: escapeHtml(coachName) },
      { label: 'Change', valueHtml: changeHtml },
    ],
    blocks,
    primaryButton: portalUrl
      ? { label: 'View your booking', href: portalUrl }
      : undefined,
  });
  await sendEmail({
    to: clientEmail,
    subject: `Booking rescheduled — ${sessionTitle} to ${newDate}`,
    html,
  });
}

// ============================================
// PAYMENT — REQUEST / PROOF / VERIFY / REJECT
// ============================================

export async function sendPaymentRequestToClient(
  clientEmail: string,
  clientName: string,
  coachName: string,
  sessionTitle: string,
  bookingDate: string,
  bookingTime: string,
  confirmationCode: string,
  coachMessage: string | null,
  methodsOffered: any[] | null,
  customInstruction: string | null,
  guestAccessToken: string | null,
  bookingId: number | null = null,
): Promise<void> {
  const portalUrl = guestAccessToken
    ? guestPortalLink({ token: guestAccessToken, bookingId, tab: 'bookings' })
    : null;

  const blocks: CalloutBlock[] = [];
  if (methodsOffered && methodsOffered.length > 0) {
    blocks.push({
      tone: 'warn',
      title: 'Payment options',
      bodyHtml: `<p style="margin: 0 0 12px 0;">Choose one and complete payment:</p>${methodsOffered.map(renderMethodDetailsHtml).join('')}`,
    });
  } else if (customInstruction) {
    blocks.push({
      tone: 'warn',
      title: 'Payment instructions',
      bodyHtml: escapeHtml(customInstruction),
    });
  }
  if (coachMessage) {
    blocks.push({
      tone: 'info',
      title: `Message from ${coachName}`,
      bodyHtml: escapeHtml(coachMessage),
    });
  }

  const html = renderEmailLayout({
    preheader: `Payment required for your session with ${coachName}`,
    greeting: `Hi ${clientName}`,
    headline: 'Payment required',
    intro: `${coachName} accepted your booking and is awaiting payment to confirm.`,
    details: [
      { label: 'Session', valueHtml: escapeHtml(sessionTitle) },
      { label: 'Date', valueHtml: escapeHtml(bookingDate) },
      { label: 'Time', valueHtml: escapeHtml(bookingTime) },
      {
        label: 'Confirmation',
        valueHtml: renderConfirmationCodeHtml(confirmationCode),
      },
    ],
    blocks,
    primaryButton: portalUrl
      ? { label: 'Submit payment proof', href: portalUrl }
      : undefined,
    closing:
      'After paying, please upload your payment proof so your coach can verify and confirm.',
  });
  await sendEmail({
    to: clientEmail,
    subject: `Payment required — ${sessionTitle} with ${coachName}`,
    html,
  });
}

export async function sendPaymentProofToCoach(
  coachEmail: string,
  coachName: string | null,
  clientName: string,
  clientEmail: string,
  sessionTitle: string,
  bookingDate: string,
  bookingTime: string,
  confirmationCode: string,
  paymentMethod: string,
  paymentReferenceText: string | null,
  paymentProofUrl: string | null,
  sessionId: number,
  bookingId: number | null = null,
): Promise<void> {
  const safeName = coachName?.trim() || 'there';
  const blocks: CalloutBlock[] = [];
  if (paymentReferenceText) {
    blocks.push({
      tone: 'info',
      title: 'Payment reference',
      bodyHtml: escapeHtml(paymentReferenceText),
    });
  }
  if (paymentProofUrl) {
    blocks.push({
      tone: 'muted',
      title: 'Payment proof',
      bodyHtml: `<a href="${sanitizeUrl(paymentProofUrl)}" target="_blank" style="color: #b66667; text-decoration: underline; text-underline-offset: 3px; font-weight: 500;">View uploaded proof</a>`,
    });
  }
  blocks.push({
    tone: 'warn',
    title: 'Action required',
    bodyHtml: 'Please verify this payment from your dashboard to confirm the booking.',
  });

  const html = renderEmailLayout({
    preheader: `${clientName} submitted payment proof`,
    greeting: `Hi ${safeName}`,
    headline: 'Payment proof submitted',
    intro: `${clientName} has submitted payment proof for their booking.`,
    details: [
      { label: 'Session', valueHtml: escapeHtml(sessionTitle) },
      { label: 'Date', valueHtml: escapeHtml(bookingDate) },
      { label: 'Time', valueHtml: escapeHtml(bookingTime) },
      { label: 'Method', valueHtml: escapeHtml(paymentMethod) },
      { label: 'Confirmation', valueHtml: escapeHtml(confirmationCode) },
    ],
    blocks,
    primaryButton: {
      label: 'Verify in dashboard',
      href: coachBookingLink({ sessionId, bookingId }),
    },
  });
  await sendEmail({
    to: coachEmail,
    subject: `Payment proof submitted — ${sessionTitle} (${confirmationCode})`,
    html,
  });
}

export async function sendPaymentVerifiedToClient(
  clientEmail: string,
  clientName: string,
  coachName: string,
  sessionTitle: string,
  bookingDate: string,
  bookingTime: string,
  confirmationCode: string,
  meetingLink: string | null,
  coachMessage: string | null,
  guestAccessToken: string | null,
  durationMinutes: number = 60,
  locationText: string | null = null,
  bookingId: number | null = null,
): Promise<void> {
  const portalUrl = guestAccessToken
    ? guestPortalLink({ token: guestAccessToken, bookingId, tab: 'bookings' })
    : null;

  const calendarUrl = buildGoogleCalendarUrl({
    title: `${sessionTitle} with ${coachName}`,
    startDate: bookingDate,
    startTime: bookingTime,
    durationMinutes,
    description: meetingLink
      ? `Meeting Link: ${meetingLink}`
      : `Session with ${coachName}`,
    location: locationText,
  });

  const blocks: CalloutBlock[] = [];
  if (meetingLink) {
    blocks.push({
      tone: 'success',
      title: 'Meeting link',
      bodyHtml: `<a href="${sanitizeUrl(meetingLink)}" target="_blank" style="color: #23451E; font-weight: 600; word-break: break-all; text-decoration: underline; text-underline-offset: 3px;">${escapeHtml(meetingLink)}</a>`,
    });
  }
  if (coachMessage) {
    blocks.push({
      tone: 'info',
      title: `Message from ${coachName}`,
      bodyHtml: escapeHtml(coachMessage),
    });
  }

  const html = renderEmailLayout({
    preheader: `Payment verified — your booking with ${coachName} is confirmed`,
    greeting: `Hi ${clientName}`,
    headline: "Payment received — you're all set",
    intro: `${coachName} verified your payment. Your booking is confirmed.`,
    details: [
      { label: 'Session', valueHtml: escapeHtml(sessionTitle) },
      { label: 'Coach', valueHtml: escapeHtml(coachName) },
      { label: 'Date', valueHtml: escapeHtml(bookingDate) },
      { label: 'Time', valueHtml: escapeHtml(bookingTime) },
      {
        label: 'Confirmation',
        valueHtml: renderConfirmationCodeHtml(confirmationCode),
      },
    ],
    blocks,
    primaryButton: portalUrl
      ? { label: 'Manage your booking', href: portalUrl }
      : { label: 'Add to calendar', href: calendarUrl },
    secondaryButton: portalUrl
      ? { label: 'Add to calendar', href: calendarUrl, variant: 'outline' }
      : undefined,
  });
  await sendEmail({
    to: clientEmail,
    subject: `Payment verified — ${sessionTitle} on ${bookingDate} confirmed`,
    html,
  });
}

export async function sendPaymentRejectedToClient(
  clientEmail: string,
  clientName: string,
  coachName: string,
  sessionTitle: string,
  bookingDate: string,
  bookingTime: string,
  confirmationCode: string,
  reason: string | null,
  guestAccessToken: string | null,
  bookingId: number | null = null,
): Promise<void> {
  const portalUrl = guestAccessToken
    ? guestPortalLink({ token: guestAccessToken, bookingId, tab: 'bookings' })
    : null;
  const blocks: CalloutBlock[] = [];
  if (reason) {
    blocks.push({
      tone: 'warn',
      title: `Reason from ${coachName}`,
      bodyHtml: escapeHtml(reason),
    });
  }
  blocks.push({
    tone: 'warn',
    title: 'Action required',
    bodyHtml:
      'Please resubmit your payment proof through your guest portal so it can be verified.',
  });

  const html = renderEmailLayout({
    preheader: `Payment couldn't be confirmed — please resubmit`,
    greeting: `Hi ${clientName}`,
    headline: "Payment couldn't be confirmed",
    intro: `${coachName} was unable to confirm the payment you submitted. Please review and resubmit.`,
    details: [
      { label: 'Session', valueHtml: escapeHtml(sessionTitle) },
      { label: 'Coach', valueHtml: escapeHtml(coachName) },
      { label: 'Date', valueHtml: escapeHtml(bookingDate) },
      { label: 'Time', valueHtml: escapeHtml(bookingTime) },
      { label: 'Confirmation', valueHtml: escapeHtml(confirmationCode) },
    ],
    blocks,
    primaryButton: portalUrl
      ? { label: 'Resubmit payment proof', href: portalUrl }
      : undefined,
  });
  await sendEmail({
    to: clientEmail,
    subject: `Payment not confirmed — ${sessionTitle} — please resubmit`,
    html,
  });
}

// ============================================
// BOOKING MESSAGES (in-thread)
// ============================================

export async function sendBookingMessageToGuest(
  guestEmail: string,
  guestName: string,
  coachName: string,
  sessionTitle: string,
  bookingDate: string,
  bookingTime: string,
  messageContent: string,
  guestAccessToken: string | null,
  bookingId: number | null = null,
): Promise<void> {
  const portalUrl = guestAccessToken
    ? guestPortalLink({ token: guestAccessToken, bookingId, tab: 'bookings' })
    : null;
  const html = renderEmailLayout({
    preheader: `New message from ${coachName}`,
    greeting: `Hi ${guestName}`,
    headline: `${escapeHtml(coachName)} sent you a message`,
    intro: `About your upcoming session.`,
    details: [
      { label: 'Session', valueHtml: escapeHtml(sessionTitle) },
      { label: 'Coach', valueHtml: escapeHtml(coachName) },
      { label: 'Date', valueHtml: escapeHtml(bookingDate) },
      { label: 'Time', valueHtml: escapeHtml(bookingTime) },
    ],
    blocks: [{ tone: 'info', title: 'Message', bodyHtml: escapeHtml(messageContent) }],
    primaryButton: portalUrl
      ? { label: 'Go to Guest Portal', href: portalUrl }
      : undefined,
  });
  await sendEmail({
    to: guestEmail,
    subject: `New message from ${coachName} — ${sessionTitle}`,
    html,
  });
}

export async function sendBookingMessageToCoach(
  coachEmail: string,
  coachName: string | null,
  clientName: string,
  clientEmail: string,
  sessionTitle: string,
  bookingDate: string,
  bookingTime: string,
  messageContent: string,
  bookingId: number,
): Promise<void> {
  const safeName = coachName?.trim() || 'there';
  const html = renderEmailLayout({
    preheader: `New message from ${clientName}`,
    greeting: `Hi ${safeName}`,
    headline: `${escapeHtml(clientName)} sent you a message`,
    intro: 'About their booking with you.',
    details: [
      { label: 'Session', valueHtml: escapeHtml(sessionTitle) },
      { label: 'Date', valueHtml: escapeHtml(bookingDate) },
      { label: 'Time', valueHtml: escapeHtml(bookingTime) },
      { label: 'Client', valueHtml: escapeHtml(clientName) },
      {
        label: 'Email',
        valueHtml: `<a href="mailto:${escapeHtml(clientEmail)}" style="color: #b66667; text-decoration: underline; text-underline-offset: 3px;">${escapeHtml(clientEmail)}</a>`,
      },
    ],
    blocks: [{ tone: 'info', title: 'Message', bodyHtml: escapeHtml(messageContent) }],
    primaryButton: {
      label: 'View booking',
      href: coachBookingLink({ bookingId }),
    },
  });
  await sendEmail({
    to: coachEmail,
    subject: `New message from ${clientName} — ${sessionTitle}`,
    html,
  });
}

// ============================================
// EVENT REGISTRATIONS
// ============================================

export async function sendEventRegistrationConfirmationToGuest(
  guestEmail: string,
  guestName: string,
  coachName: string,
  eventTitle: string,
  eventDate: string,
  eventStartTime: string | null,
  eventEndTime: string | null,
  eventLocation: string | null,
  eventMeetingLink: string | null,
  isOnline: boolean,
  isOffline: boolean,
  // `paymentRequired` MUST be the same derivation the registration endpoint
  // uses to decide whether to redirect the guest to /complete-payment. The
  // legacy fields `event.requiresPayment` and `event.paymentInstructions` are
  // not safe to consult here because legacy events can have those set
  // incorrectly relative to the price/pricingType the booking flow actually
  // honours. See server/routes.ts (event registration handler) for the
  // canonical derivation.
  paymentRequired: boolean,
  paymentInstructions: string | null,
  confirmationCode: string,
  cancellationToken: string,
  _currency: string,
  googleCalendarUrl?: string,
  // Deep-link to the /complete-payment screen for this registration. Required
  // whenever `paymentRequired` is true so the email mirrors the in-app
  // success screen, which sends the guest straight to /complete-payment.
  completePaymentUrl?: string | null,
  // Pricing type used to differentiate 'donation' from 'free' in the copy.
  // 'paid' is implied when paymentRequired=true. Defaults to 'free' when
  // paymentRequired is false and pricingType is unspecified.
  pricingType?: 'free' | 'donation' | 'paid',
  // Guest-portal deep link to this registration. Always included so the
  // guest has a single place to act — even after payment is required they
  // can return here to upload proof later.
  guestPortalUrl?: string | null,
): Promise<void> {
  const cancelUrl = eventCancelLink(cancellationToken);
  const isDonation = pricingType === 'donation' && !paymentRequired;

  const details: DetailRow[] = [
    { label: 'Event', valueHtml: escapeHtml(eventTitle) },
    { label: 'Hosted by', valueHtml: escapeHtml(coachName) },
    { label: 'Date', valueHtml: escapeHtml(eventDate) },
  ];
  if (eventStartTime) {
    details.push({
      label: 'Time',
      valueHtml: `${escapeHtml(eventStartTime)}${eventEndTime ? ' – ' + escapeHtml(eventEndTime) : ''}`,
    });
  }
  if (isOffline && eventLocation) {
    details.push({ label: 'Location', valueHtml: escapeHtml(eventLocation) });
  } else if (isOnline && eventMeetingLink) {
    details.push({
      label: 'Meeting',
      valueHtml: `<a href="${sanitizeUrl(eventMeetingLink)}" target="_blank" style="color: #b66667; text-decoration: underline; text-underline-offset: 3px;">Join link</a>`,
    });
  } else if (isOnline) {
    details.push({
      label: 'Meeting',
      valueHtml: `<em style="color: rgba(31,27,22,0.5);">Link will be sent before the event</em>`,
    });
  }
  details.push({
    label: 'Confirmation',
    valueHtml: renderConfirmationCodeHtml(confirmationCode),
  });

  const blocks: CalloutBlock[] = [];
  if (paymentRequired) {
    const instructionsHtml = paymentInstructions
      ? `<p style="margin: 0 0 12px;">${escapeHtml(paymentInstructions)}</p>`
      : '';
    // Primary "complete payment" link is the headline CTA; if the guest
    // skipped the payment screen they can also pay later from the guest
    // portal — always surface the portal link in the warn block so they
    // never feel stuck.
    const portalLineHtml = guestPortalUrl
      ? `<p style="margin: 12px 0 0;">You can also complete payment any time from your <a href="${sanitizeUrl(guestPortalUrl)}" target="_blank" style="color: #b66667; text-decoration: underline; text-underline-offset: 3px;">guest portal</a>.</p>`
      : '';
    const ctaHtml = completePaymentUrl
      ? `<p style="margin: 0;"><a href="${sanitizeUrl(completePaymentUrl)}" target="_blank" style="color: #b66667; text-decoration: underline; text-underline-offset: 3px; font-weight: 600;">Complete your payment →</a></p>`
      : '<p style="margin: 0;">Please follow the payment instructions from the organiser to confirm your spot.</p>';
    blocks.push({
      tone: 'warn',
      title: 'Payment required to confirm your registration',
      bodyHtml: `${instructionsHtml}${ctaHtml}${portalLineHtml}`,
    });
  } else if (isDonation) {
    const instructionsHtml = paymentInstructions
      ? `<p style="margin: 0 0 12px;">${escapeHtml(paymentInstructions)}</p>`
      : '<p style="margin: 0 0 12px;">This event is offered on a contribution basis. Anything you give helps keep these gatherings going.</p>';
    const portalLineHtml = guestPortalUrl
      ? `<p style="margin: 0;">If you’d like to contribute, you can do so from your <a href="${sanitizeUrl(guestPortalUrl)}" target="_blank" style="color: #b66667; text-decoration: underline; text-underline-offset: 3px;">guest portal</a>.</p>`
      : '';
    blocks.push({
      tone: 'info',
      title: 'Contributions welcome',
      bodyHtml: `${instructionsHtml}${portalLineHtml}`,
    });
  }

  // Primary CTA is always "Go to Guest Portal" when a portal link exists.
  // The portal is the canonical place to see, manage, pay, or cancel a
  // registration. Calendar and payment-screen links are surfaced as
  // secondary/text links so the hierarchy is unambiguous.
  const primaryButton: EmailButton | undefined = guestPortalUrl
    ? { label: 'Go to Guest Portal', href: guestPortalUrl }
    : paymentRequired && completePaymentUrl
      ? { label: 'Complete payment', href: completePaymentUrl }
      : googleCalendarUrl
        ? { label: 'Add to calendar', href: googleCalendarUrl }
        : undefined;

  // Secondary CTA is ALWAYS the cancel link — every confirmation must give
  // the guest a one-click way to release their spot.
  const secondaryButton: EmailButton | undefined = {
    label: "Can't make it? Cancel",
    href: cancelUrl,
  };

  // After-CTA: surface the calendar link as a text link for non-payment
  // cases so the guest can still save the date without cluttering the
  // primary button row.
  const afterCtaHtml =
    !paymentRequired && googleCalendarUrl
      ? `<p style="margin: 16px 0 0; font-size: 14px; color: rgba(31,27,22,0.65); text-align: center;"><a href="${sanitizeUrl(googleCalendarUrl)}" target="_blank" style="color: #b66667; text-decoration: underline; text-underline-offset: 3px;">Add to calendar</a></p>`
      : undefined;

  const headline = paymentRequired
    ? "You're registered — payment required"
    : isDonation
      ? "You're registered"
      : "You're registered";
  const intro = paymentRequired
    ? `You're registered for ${escapeHtml(eventTitle)}. Please complete your payment to confirm your registration.`
    : isDonation
      ? `Your registration for ${escapeHtml(eventTitle)} is confirmed. ${escapeHtml(coachName)} offers this event on a contribution basis — see below if you'd like to give.`
      : `Your registration for ${escapeHtml(eventTitle)} has been confirmed.`;
  const preheader = paymentRequired
    ? `You're registered for ${eventTitle} — payment required to confirm`
    : `You're registered for ${eventTitle}`;
  const subject = paymentRequired
    ? `You're registered for ${eventTitle} — payment required`
    : `You're registered for ${eventTitle}`;

  const html = renderEmailLayout({
    preheader,
    greeting: `Hi ${guestName}`,
    headline,
    intro,
    details,
    blocks,
    primaryButton,
    secondaryButton,
    afterCtaHtml,
  });
  await sendEmail({
    to: guestEmail,
    subject,
    html,
  });
}

// Sent to the guest immediately after they submit payment proof or pick
// "cash at the event" on the /complete-payment screen. Closes the loop so
// the guest never wonders whether their submission landed.
/**
 * MINIMAL "spot reserved" email sent right after a guest submits payment proof
 * (or picks cash) for a paid event. Intentionally short — a single paragraph
 * plus a 3-row block (Booking ID / Date / Time) — so the guest understands
 * their registration is pending and not yet finalised. The FULL
 * screenshot-friendly confirmation (with confirmation code, location, meeting
 * link, attendee row) is sent later by `sendEventPaymentVerifiedToRegistrant`
 * once the coach verifies the payment.
 *
 * Unused-on-purpose fields (eventLocation, meetingLink, confirmationCode,
 * paymentInstructions, etc.) are intentionally NOT in the parameter type —
 * they were moved to the post-verification email so this email can't leak
 * "you're confirmed"-style details while payment is still pending.
 */
export async function sendEventPaymentSubmittedToGuest({
  registrantEmail,
  registrantName,
  coachName,
  eventTitle,
  eventDate,
  eventStartTime,
  eventEndTime,
  isCash,
  amount,
  currency,
  registrationId,
  cancellationToken,
  guestPortalUrl,
}: {
  registrantEmail: string;
  registrantName: string;
  coachName: string;
  eventTitle: string;
  eventDate: string;
  eventStartTime: string | null;
  eventEndTime: string | null;
  isCash: boolean;
  amount: string | null;
  currency: string;
  registrationId: number;
  cancellationToken: string;
  guestPortalUrl: string | null;
}): Promise<void> {
  const cancelUrl = eventCancelLink(cancellationToken);

  // Minimal 3-row block. No Confirmation, no Location, no Meeting, no
  // Payment row — those land in the post-verification email so this email
  // reads as "reserved, pending" rather than "all set, confirmed".
  const details: DetailRow[] = [
    { label: 'Booking ID', valueHtml: `#${registrationId}` },
    { label: 'Date', valueHtml: escapeHtml(eventDate) },
  ];
  if (eventStartTime) {
    details.push({
      label: 'Time',
      valueHtml: `${escapeHtml(eventStartTime)}${eventEndTime ? ' – ' + escapeHtml(eventEndTime) : ''}`,
    });
  }

  const cashAmountStr =
    isCash && amount ? `${escapeHtml(currency)} ${escapeHtml(amount)}` : null;

  const headline = isCash
    ? `Registration received — pay at the event`
    : `Payment submitted — awaiting organizer verification`;
  const intro = isCash
    ? `Your registration for ${escapeHtml(eventTitle)} has been received. You've chosen to pay in cash at the event${cashAmountStr ? ` — please bring ${cashAmountStr} on the day` : ''}. ${escapeHtml(coachName)} will confirm your registration once payment is received, and we'll send you the full confirmation email then.`
    : `Your payment has been submitted for ${escapeHtml(eventTitle)}. ${escapeHtml(coachName)} will verify it shortly and we'll send you the full event details once confirmed.`;
  const subject = isCash
    ? `${eventTitle} — registration received, pay at the event`
    : `Payment submitted for ${eventTitle} — awaiting verification`;
  const preheader = isCash
    ? cashAmountStr
      ? `Registration received — pay ${cashAmountStr} at the event`
      : `Registration received — pay at the event`
    : `Payment submitted — awaiting organizer verification`;

  const primaryButton: EmailButton | undefined = guestPortalUrl
    ? { label: 'Go to Guest Portal', href: guestPortalUrl }
    : undefined;
  const secondaryButton: EmailButton | undefined = {
    label: "Can't make it? Cancel",
    href: cancelUrl,
  };

  const html = renderEmailLayout({
    preheader,
    greeting: `Hi ${registrantName}`,
    headline,
    intro,
    details,
    primaryButton,
    secondaryButton,
  });
  await sendEmail({
    to: registrantEmail,
    subject,
    html,
  });
}

// Sent to the guest when the coach waives payment for an event registration
// from the dashboard (e.g. comp ticket, sponsor invitation). Mirrors the
// shape of the verified-payment email but with no-payment-required copy.
export async function sendEventPaymentWaivedToRegistrant({
  registrantEmail,
  registrantName,
  coachName,
  eventTitle,
  eventDate,
  eventStartTime,
  guestPortalUrl,
  googleCalendarUrl,
}: {
  registrantEmail: string;
  registrantName: string;
  coachName: string;
  eventTitle: string;
  eventDate: string;
  eventStartTime: string | null;
  guestPortalUrl: string | null;
  googleCalendarUrl?: string | null;
}): Promise<void> {
  const html = renderEmailLayout({
    preheader: `Your spot is confirmed — ${eventTitle}`,
    greeting: `Hi ${registrantName}`,
    headline: 'Your spot is confirmed',
    intro: `${escapeHtml(coachName)} has waived the payment for your registration. You’re all set.`,
    details: [
      { label: 'Event', valueHtml: escapeHtml(eventTitle) },
      { label: 'Hosted by', valueHtml: escapeHtml(coachName) },
      {
        label: 'Date',
        valueHtml: `${escapeHtml(eventDate)}${eventStartTime ? ' · ' + escapeHtml(eventStartTime) : ''}`,
      },
    ],
    primaryButton: guestPortalUrl
      ? { label: 'Go to Guest Portal', href: guestPortalUrl }
      : googleCalendarUrl
        ? { label: 'Add to calendar', href: googleCalendarUrl }
        : undefined,
    secondaryButton: googleCalendarUrl
      ? { label: 'Add to calendar', href: googleCalendarUrl, variant: 'outline' }
      : undefined,
  });
  await sendEmail({
    to: registrantEmail,
    subject: `Your spot is confirmed — ${eventTitle}`,
    html,
  });
}

export async function sendEventRegistrationNotificationToCoach(
  coachEmail: string,
  coachName: string,
  guestName: string,
  guestEmail: string,
  guestPhone: string | null,
  eventTitle: string,
  eventDate: string,
  // `paymentRequired` MUST come from the same derivation as the registration
  // endpoint (see server/routes.ts) so the coach sees "payment pending"
  // exactly when the guest was sent to /complete-payment. Do NOT pass
  // `event.requiresPayment` directly — legacy events have inconsistent
  // values for that field.
  paymentRequired: boolean = false,
  eventId?: number,
  registrationId?: number,
  // Pricing state of the registration. Drives the body callout copy so the
  // coach gets the right cue (free / contributions welcome / payment pending)
  // for each kind of event.
  pricingType: 'free' | 'donation' | 'paid' = 'free',
): Promise<void> {
  const safeName = coachName?.trim() || 'there';
  const details: DetailRow[] = [
    { label: 'Event', valueHtml: escapeHtml(eventTitle) },
    { label: 'Date', valueHtml: escapeHtml(eventDate) },
    { label: 'Attendee', valueHtml: escapeHtml(guestName) },
    {
      label: 'Email',
      valueHtml: `<a href="mailto:${escapeHtml(guestEmail)}" style="color: #b66667; text-decoration: underline; text-underline-offset: 3px;">${escapeHtml(guestEmail)}</a>`,
    },
  ];
  if (guestPhone) details.push({ label: 'Phone', valueHtml: escapeHtml(guestPhone) });

  const blocks: CalloutBlock[] = [];
  if (paymentRequired) {
    blocks.push({
      tone: 'warn',
      title: 'Payment pending',
      bodyHtml:
        "The attendee was sent to complete payment. You’ll receive a follow-up email when they submit proof or pick cash. Confirm payment from your dashboard once received.",
    });
  } else if (pricingType === 'donation') {
    blocks.push({
      tone: 'info',
      title: 'Donation event',
      bodyHtml:
        "This event is offered on a contribution basis. The attendee may submit a contribution from their guest portal — no follow-up action required from you.",
    });
  } else {
    blocks.push({
      tone: 'info',
      title: 'No payment needed',
      bodyHtml:
        "This is a free event — the attendee’s spot is already confirmed. No follow-up action required.",
    });
  }

  const subjectSuffix = paymentRequired
    ? ' — payment pending'
    : pricingType === 'donation'
      ? ' — donation event'
      : '';

  const html = renderEmailLayout({
    preheader: `New registration for ${eventTitle}${subjectSuffix}`,
    greeting: `Hi ${safeName}`,
    headline: 'A new event registration',
    intro: paymentRequired
      ? `${escapeHtml(guestName)} just signed up — they were sent to complete payment.`
      : pricingType === 'donation'
        ? `${escapeHtml(guestName)} just signed up for your contribution-based event.`
        : `${escapeHtml(guestName)} just signed up for your event.`,
    details,
    blocks,
    primaryButton: {
      label: 'Open in dashboard',
      href: coachEventLink({ eventId, registrationId }),
    },
  });
  await sendEmail({
    to: coachEmail,
    subject: `New registration for ${eventTitle}${subjectSuffix}`,
    html,
  });
}

export async function sendEventMeetingLinkToRegistrant(
  guestEmail: string,
  guestName: string,
  coachName: string,
  eventTitle: string,
  eventDate: string,
  eventStartTime: string | null,
  meetingLink: string,
): Promise<void> {
  const html = renderEmailLayout({
    preheader: `Meeting link for ${eventTitle}`,
    greeting: `Hi ${guestName}`,
    headline: 'Your meeting link is ready',
    intro: `The meeting link for ${escapeHtml(eventTitle)} is now available.`,
    details: [
      { label: 'Event', valueHtml: escapeHtml(eventTitle) },
      { label: 'Hosted by', valueHtml: escapeHtml(coachName) },
      {
        label: 'Date',
        valueHtml: `${escapeHtml(eventDate)}${eventStartTime ? ' · ' + escapeHtml(eventStartTime) : ''}`,
      },
    ],
    primaryButton: { label: 'Join meeting', href: meetingLink },
    afterCtaHtml: renderRawUrlFallbackHtml(meetingLink, 'Or open the link directly:'),
    closing: 'See you there.',
  });
  await sendEmail({
    to: guestEmail,
    subject: `Meeting link for ${eventTitle}`,
    html,
  });
}

export async function sendEventCancellationToGuest(
  guestEmail: string,
  guestName: string,
  eventTitle: string,
  eventDate: string,
  cancelledByCoach: boolean,
): Promise<void> {
  const html = renderEmailLayout({
    preheader: `Registration cancelled — ${eventTitle}`,
    greeting: `Hi ${guestName}`,
    headline: 'Registration cancelled',
    intro: cancelledByCoach
      ? `Your registration for ${escapeHtml(eventTitle)} on ${escapeHtml(eventDate)} has been cancelled by the organiser.`
      : `Your registration for ${escapeHtml(eventTitle)} on ${escapeHtml(eventDate)} has been cancelled as requested.`,
    closing: 'Have questions? Reach out to the event organiser.',
  });
  await sendEmail({
    to: guestEmail,
    subject: `Registration cancelled: ${eventTitle}`,
    html,
  });
}

export async function sendEventCancellationNotificationToCoach(
  coachEmail: string,
  coachName: string,
  guestName: string,
  guestEmail: string,
  eventTitle: string,
  eventDate: string,
  eventId?: number,
  registrationId?: number,
): Promise<void> {
  const safeName = coachName?.trim() || 'there';
  const html = renderEmailLayout({
    preheader: `${guestName} cancelled their registration`,
    greeting: `Hi ${safeName}`,
    headline: 'A registration was cancelled',
    intro: `${escapeHtml(guestName)} cancelled their registration.`,
    details: [
      { label: 'Event', valueHtml: escapeHtml(eventTitle) },
      { label: 'Date', valueHtml: escapeHtml(eventDate) },
      { label: 'Attendee', valueHtml: escapeHtml(guestName) },
      {
        label: 'Email',
        valueHtml: `<a href="mailto:${escapeHtml(guestEmail)}" style="color: #b66667; text-decoration: underline; text-underline-offset: 3px;">${escapeHtml(guestEmail)}</a>`,
      },
    ],
    primaryButton: {
      label: 'Open in dashboard',
      href: coachEventLink({ eventId, registrationId }),
    },
  });
  await sendEmail({
    to: coachEmail,
    subject: `Cancellation: ${guestName} cancelled their registration for ${eventTitle}`,
    html,
  });
}

// ============================================
// EVENT PAYMENT
// ============================================

/**
 * FULL screenshot-friendly confirmation email sent after the coach verifies
 * the guest's payment (manual proof flow). This is the email the attendee
 * shows (or screenshots) at the venue so the organiser can cross-check
 * their name + email against the booking inbox. Includes the at-event
 * confirmation code, full event details (date, time, location or meeting
 * link), and the attendee's own name + email rendered as plain text so a
 * mobile screenshot stays clean (no underlined mailto links, no styling
 * artefacts).
 */
export async function sendEventPaymentVerifiedToRegistrant({
  registrantEmail,
  registrantName,
  coachName,
  eventTitle,
  eventDate,
  eventStartTime,
  eventEndTime,
  eventLocation,
  eventMeetingLink,
  isOnline,
  isOffline,
  confirmationCode,
  coachMessage,
  guestPortalUrl,
  googleCalendarUrl,
}: {
  registrantEmail: string;
  registrantName: string;
  coachName: string;
  eventTitle: string;
  eventDate: string;
  eventStartTime: string | null;
  eventEndTime: string | null;
  eventLocation: string | null;
  eventMeetingLink: string | null;
  isOnline: boolean;
  isOffline: boolean;
  confirmationCode: string | null;
  coachMessage: string | null;
  guestPortalUrl: string | null;
  googleCalendarUrl?: string | null;
}): Promise<void> {
  const blocks: CalloutBlock[] = [];
  if (coachMessage) {
    blocks.push({
      tone: 'info',
      title: `Message from ${coachName}`,
      bodyHtml: escapeHtml(coachMessage),
    });
  }

  const details: DetailRow[] = [
    { label: 'Event', valueHtml: escapeHtml(eventTitle) },
    { label: 'Hosted by', valueHtml: escapeHtml(coachName) },
    { label: 'Date', valueHtml: escapeHtml(eventDate) },
  ];
  if (eventStartTime) {
    details.push({
      label: 'Time',
      valueHtml: `${escapeHtml(eventStartTime)}${eventEndTime ? ' – ' + escapeHtml(eventEndTime) : ''}`,
    });
  }
  if (isOffline && eventLocation) {
    details.push({ label: 'Location', valueHtml: escapeHtml(eventLocation) });
  } else if (isOnline && eventMeetingLink) {
    details.push({
      label: 'Meeting',
      valueHtml: `<a href="${sanitizeUrl(eventMeetingLink)}" target="_blank" style="color: #b66667; text-decoration: underline; text-underline-offset: 3px;">Join link</a>`,
    });
  } else if (isOnline) {
    details.push({
      label: 'Meeting',
      valueHtml: `<em style="color: rgba(31,27,22,0.5);">Link will be sent before the event</em>`,
    });
  }
  // Attendee name + email rendered as PLAIN TEXT (no mailto link) so a
  // mobile screenshot of this email shows clean values without underlined
  // blue link styling — important because the organiser may cross-check
  // these against the inbox export at the venue door.
  details.push({ label: 'Attendee', valueHtml: escapeHtml(registrantName) });
  details.push({ label: 'Email', valueHtml: escapeHtml(registrantEmail) });
  if (confirmationCode) {
    details.push({
      label: 'Confirmation',
      valueHtml: renderConfirmationCodeHtml(confirmationCode),
    });
  }

  // Primary CTA = add to calendar (now that payment is sorted, the guest's
  // next concrete action is to put the event on their calendar). Secondary
  // CTA = guest portal so they can review or cancel later. If no calendar
  // URL is available we fall back to the portal as the primary action.
  const primaryButton: EmailButton | undefined = googleCalendarUrl
    ? { label: 'Add to calendar', href: googleCalendarUrl }
    : guestPortalUrl
      ? { label: 'View your registrations', href: guestPortalUrl }
      : undefined;
  const secondaryButton: EmailButton | undefined =
    googleCalendarUrl && guestPortalUrl
      ? { label: 'View your registrations', href: guestPortalUrl }
      : undefined;
  const html = renderEmailLayout({
    preheader: `Confirmed — your full details for ${eventTitle}`,
    greeting: `Hi ${registrantName}`,
    headline: `You're confirmed — see you at ${eventTitle}`,
    intro: `${escapeHtml(coachName)} verified your payment. Your spot is confirmed — here are your full event details. Show this email (or a screenshot) at the venue so the organiser can check you in.`,
    details,
    blocks,
    primaryButton,
    secondaryButton,
  });
  await sendEmail({
    to: registrantEmail,
    subject: `You're confirmed for ${eventTitle} on ${eventDate}`,
    html,
  });
}

export async function sendEventPaymentRejectedToRegistrant({
  registrantEmail,
  registrantName,
  coachName,
  eventTitle,
  eventDate,
  reason,
  guestPortalUrl,
}: {
  registrantEmail: string;
  registrantName: string;
  coachName: string;
  eventTitle: string;
  eventDate: string;
  reason: string | null;
  guestPortalUrl: string | null;
}): Promise<void> {
  const blocks: CalloutBlock[] = [];
  if (reason) {
    blocks.push({
      tone: 'warn',
      title: `Reason from ${coachName}`,
      bodyHtml: escapeHtml(reason),
    });
  }
  blocks.push({
    tone: 'warn',
    title: 'Action required',
    bodyHtml:
      'Please resubmit your payment proof through your guest portal so it can be verified.',
  });

  const html = renderEmailLayout({
    preheader: `Payment couldn't be confirmed — please resubmit`,
    greeting: `Hi ${registrantName}`,
    headline: "Payment couldn't be confirmed",
    intro: `${coachName} was unable to confirm the payment you submitted. Please review and resubmit.`,
    details: [
      { label: 'Event', valueHtml: escapeHtml(eventTitle) },
      { label: 'Hosted by', valueHtml: escapeHtml(coachName) },
      { label: 'Date', valueHtml: escapeHtml(eventDate) },
    ],
    blocks,
    primaryButton: guestPortalUrl
      ? { label: 'Resubmit payment proof', href: guestPortalUrl }
      : undefined,
  });
  await sendEmail({
    to: registrantEmail,
    subject: `Payment not confirmed — ${eventTitle} — please resubmit`,
    html,
  });
}

export async function sendEventPaymentRequestedToRegistrant({
  registrantEmail,
  registrantName,
  coachName,
  eventTitle,
  eventDate,
  eventStartTime,
  paymentInstructions,
  guestPortalUrl,
}: {
  registrantEmail: string;
  registrantName: string;
  coachName: string;
  eventTitle: string;
  eventDate: string;
  eventStartTime: string | null;
  paymentInstructions: string | null;
  guestPortalUrl: string | null;
}): Promise<void> {
  const blocks: CalloutBlock[] = [];
  if (paymentInstructions) {
    blocks.push({
      tone: 'warn',
      title: 'Payment instructions',
      bodyHtml: escapeHtml(paymentInstructions),
    });
  }

  const html = renderEmailLayout({
    preheader: `Payment required for ${eventTitle}`,
    greeting: `Hi ${registrantName}`,
    headline: 'Payment required',
    intro: `${coachName} has requested payment for your event registration.`,
    details: [
      { label: 'Event', valueHtml: escapeHtml(eventTitle) },
      { label: 'Hosted by', valueHtml: escapeHtml(coachName) },
      {
        label: 'Date',
        valueHtml: `${escapeHtml(eventDate)}${eventStartTime ? ' · ' + escapeHtml(eventStartTime) : ''}`,
      },
    ],
    blocks,
    primaryButton: guestPortalUrl
      ? { label: 'Submit payment', href: guestPortalUrl }
      : undefined,
    closing: 'Please complete payment to secure your spot at the event.',
  });
  await sendEmail({
    to: registrantEmail,
    subject: `Payment required — ${eventTitle} on ${eventDate}`,
    html,
  });
}

export async function sendEventPaymentProofToCoach({
  coachEmail,
  coachName,
  registrantName,
  registrantEmail,
  eventTitle,
  eventDate,
  eventId,
  registrationId,
  isCash = false,
}: {
  coachEmail: string;
  coachName: string;
  registrantName: string;
  registrantEmail: string;
  eventTitle: string;
  eventDate: string;
  eventId?: number;
  registrationId?: number;
  isCash?: boolean;
}): Promise<void> {
  const safeName = coachName?.trim() || 'there';
  const headline = isCash ? 'Cash payment confirmed' : 'Payment proof submitted';
  const intro = isCash
    ? "A registrant confirmed they'll pay in cash at the event. Remember to collect on the day and mark them paid afterwards."
    : 'A registrant has submitted payment proof for your event. Please review and verify it from your dashboard.';
  const ctaLabel = isCash ? 'View registration' : 'Review in dashboard';

  const details: DetailRow[] = [
    { label: 'Event', valueHtml: escapeHtml(eventTitle) },
    { label: 'Date', valueHtml: escapeHtml(eventDate) },
    { label: 'Registrant', valueHtml: escapeHtml(registrantName) },
    {
      label: 'Email',
      valueHtml: `<a href="mailto:${escapeHtml(registrantEmail)}" style="color: #b66667; text-decoration: underline; text-underline-offset: 3px;">${escapeHtml(registrantEmail)}</a>`,
    },
  ];
  if (isCash) {
    details.push({
      label: 'Payment',
      valueHtml: 'Cash — to be collected at the event',
    });
  }

  const html = renderEmailLayout({
    preheader: isCash
      ? `Cash payment confirmed — ${eventTitle}`
      : `Payment proof submitted — ${eventTitle}`,
    greeting: `Hi ${safeName}`,
    headline,
    intro,
    details,
    primaryButton: {
      label: ctaLabel,
      href: coachEventLink({ eventId, registrationId }),
    },
  });
  await sendEmail({
    to: coachEmail,
    subject: isCash
      ? `Cash payment confirmed — ${eventTitle}`
      : `Payment proof submitted — ${eventTitle}`,
    html,
  });
}

// ============================================
// DIGITAL PRODUCT PURCHASES
// ============================================

export async function sendProductPurchaseRequestToCoach({
  coachEmail,
  coachName,
  productTitle,
  buyerName,
  buyerEmail,
  buyerPhone,
  productId,
  purchaseId,
}: {
  coachEmail: string;
  coachName: string;
  productTitle: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone?: string;
  productId?: number;
  purchaseId?: number;
}): Promise<void> {
  const details: DetailRow[] = [
    { label: 'Product', valueHtml: escapeHtml(productTitle) },
    { label: 'Buyer', valueHtml: escapeHtml(buyerName) },
    {
      label: 'Email',
      valueHtml: `<a href="mailto:${escapeHtml(buyerEmail)}" style="color: #b66667; text-decoration: underline; text-underline-offset: 3px;">${escapeHtml(buyerEmail)}</a>`,
    },
  ];
  if (buyerPhone) details.push({ label: 'Phone', valueHtml: escapeHtml(buyerPhone) });

  const html = renderEmailLayout({
    preheader: `New purchase request — ${productTitle}`,
    greeting: `Hi ${coachName}`,
    headline: 'A new purchase request',
    intro: `Someone submitted a purchase request for ${escapeHtml(productTitle)}. Verify their payment in your dashboard and the buyer will get their download link automatically.`,
    details,
    primaryButton: {
      label: 'Go to dashboard',
      href: coachProductLink({ productId, purchaseId }),
    },
  });
  await sendEmail({
    to: coachEmail,
    subject: `New purchase request — ${productTitle}`,
    html,
  });
}

export async function sendProductPurchaseConfirmationToBuyer({
  buyerEmail,
  buyerName,
  productTitle,
  coachName,
  paymentInstructions,
  price,
  currency,
}: {
  buyerEmail: string;
  buyerName: string;
  productTitle: string;
  coachName: string;
  paymentInstructions?: string;
  price?: string;
  currency?: string;
}): Promise<void> {
  const details: DetailRow[] = [
    { label: 'Product', valueHtml: escapeHtml(productTitle) },
    { label: 'Sold by', valueHtml: escapeHtml(coachName) },
  ];
  if (price) {
    details.push({
      label: 'Amount',
      valueHtml: `${escapeHtml(price)} ${escapeHtml(currency || 'USD')}`,
    });
  }

  const blocks: CalloutBlock[] = [];
  if (paymentInstructions) {
    blocks.push({
      tone: 'warn',
      title: 'How to complete payment',
      bodyHtml: escapeHtml(paymentInstructions),
    });
  } else {
    blocks.push({
      tone: 'muted',
      bodyHtml: 'The coach will reach out with payment details shortly.',
    });
  }
  blocks.push({
    tone: 'info',
    title: 'What happens next',
    bodyHtml:
      "Once your coach confirms your payment, you'll receive a download link directly to this email — no account required.",
  });

  const html = renderEmailLayout({
    preheader: `Purchase request received — ${productTitle}`,
    greeting: `Hi ${buyerName}`,
    headline: 'Purchase request received',
    intro: `Thank you for your interest in ${escapeHtml(productTitle)} by ${escapeHtml(coachName)}.`,
    details,
    blocks,
  });
  await sendEmail({
    to: buyerEmail,
    subject: `Purchase request received — ${productTitle}`,
    html,
  });
}

export async function sendProductDownloadLinkToBuyer({
  buyerEmail,
  buyerName,
  productTitle,
  coachName,
  downloadUrl,
  guestPortalUrl,
}: {
  buyerEmail: string;
  buyerName: string;
  productTitle: string;
  coachName: string;
  downloadUrl: string;
  guestPortalUrl?: string;
}): Promise<void> {
  const html = renderEmailLayout({
    preheader: `Download ready — ${productTitle}`,
    greeting: `Hi ${buyerName}`,
    headline: 'Payment verified — download ready',
    intro: `${coachName} verified your payment for ${escapeHtml(productTitle)}. Your download is ready below.`,
    details: [
      { label: 'Product', valueHtml: escapeHtml(productTitle) },
      { label: 'Sold by', valueHtml: escapeHtml(coachName) },
    ],
    primaryButton: { label: `Download ${productTitle}`, href: downloadUrl },
    secondaryButton: guestPortalUrl
      ? { label: 'View in your purchases portal', href: guestPortalUrl }
      : undefined,
    closing: 'This download link is valid for 7 days.',
  });
  await sendEmail({
    to: buyerEmail,
    subject: `Payment verified — download your ${productTitle}`,
    html,
  });
}

export async function sendProductPaymentVerifiedToBuyer({
  buyerEmail,
  buyerName,
  coachName,
  productTitle,
  coachMessage,
  guestPortalUrl,
}: {
  buyerEmail: string;
  buyerName: string;
  coachName: string;
  productTitle: string;
  coachMessage: string | null;
  guestPortalUrl: string | null;
}): Promise<void> {
  const blocks: CalloutBlock[] = [];
  if (coachMessage) {
    blocks.push({
      tone: 'info',
      title: `Message from ${coachName}`,
      bodyHtml: escapeHtml(coachMessage),
    });
  }
  const html = renderEmailLayout({
    preheader: `Payment verified for ${productTitle}`,
    greeting: `Hi ${buyerName}`,
    headline: 'Payment received',
    intro: `${coachName} verified your payment for ${escapeHtml(productTitle)}. Your download link has been sent separately.`,
    details: [
      { label: 'Product', valueHtml: escapeHtml(productTitle) },
      { label: 'Sold by', valueHtml: escapeHtml(coachName) },
    ],
    blocks,
    primaryButton: guestPortalUrl
      ? { label: 'View your purchases', href: guestPortalUrl }
      : undefined,
    closing: 'Thank you for your purchase.',
  });
  await sendEmail({
    to: buyerEmail,
    subject: `Payment verified — ${productTitle}`,
    html,
  });
}

export async function sendProductPurchaseConfirmedToBuyer({
  buyerEmail,
  buyerName,
  productTitle,
  coachName,
  coachMessage,
  downloadUrl,
  guestPortalUrl,
}: {
  buyerEmail: string;
  buyerName: string;
  productTitle: string;
  coachName: string;
  coachMessage: string | null;
  downloadUrl: string;
  guestPortalUrl: string | null;
}): Promise<void> {
  const blocks: CalloutBlock[] = [];
  if (coachMessage) {
    blocks.push({
      tone: 'info',
      title: `Message from ${coachName}`,
      bodyHtml: escapeHtml(coachMessage),
    });
  }
  const html = renderEmailLayout({
    preheader: `Download ready — ${productTitle}`,
    greeting: `Hi ${buyerName}`,
    headline: 'Payment verified — download ready',
    intro: `${coachName} verified your payment for ${escapeHtml(productTitle)}. Your download is ready below.`,
    details: [
      { label: 'Product', valueHtml: escapeHtml(productTitle) },
      { label: 'Sold by', valueHtml: escapeHtml(coachName) },
    ],
    blocks,
    primaryButton: { label: `Download ${productTitle}`, href: downloadUrl },
    secondaryButton: guestPortalUrl
      ? { label: 'View in your purchases portal', href: guestPortalUrl }
      : undefined,
    closing: 'No login required — this link is for you.',
  });
  await sendEmail({
    to: buyerEmail,
    subject: `Payment verified — download your ${productTitle}`,
    html,
  });
}

export async function sendProductPaymentRejectedToBuyer({
  buyerEmail,
  buyerName,
  coachName,
  productTitle,
  reason,
  guestPortalUrl,
}: {
  buyerEmail: string;
  buyerName: string;
  coachName: string;
  productTitle: string;
  reason: string | null;
  guestPortalUrl: string | null;
}): Promise<void> {
  const blocks: CalloutBlock[] = [];
  if (reason) {
    blocks.push({
      tone: 'warn',
      title: `Reason from ${coachName}`,
      bodyHtml: escapeHtml(reason),
    });
  }
  blocks.push({
    tone: 'warn',
    title: 'Action required',
    bodyHtml:
      'Please resubmit your payment proof through your guest portal so it can be verified.',
  });
  const html = renderEmailLayout({
    preheader: `Payment couldn't be confirmed — ${productTitle}`,
    greeting: `Hi ${buyerName}`,
    headline: "Payment couldn't be confirmed",
    intro: `${coachName} was unable to confirm the payment you submitted for ${escapeHtml(productTitle)}.`,
    details: [
      { label: 'Product', valueHtml: escapeHtml(productTitle) },
      { label: 'Sold by', valueHtml: escapeHtml(coachName) },
    ],
    blocks,
    primaryButton: guestPortalUrl
      ? { label: 'Resubmit payment proof', href: guestPortalUrl }
      : undefined,
  });
  await sendEmail({
    to: buyerEmail,
    subject: `Payment not confirmed — ${productTitle} — please resubmit`,
    html,
  });
}
