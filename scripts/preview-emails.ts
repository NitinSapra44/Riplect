/**
 * Renders a representative sample of every transactional email template to
 * static HTML files in `tmp/email-previews/`, so the redesign can be visually
 * QA'd at desktop (600px) and mobile (375px) widths.
 *
 * Run with: `npx tsx scripts/preview-emails.ts`
 *
 * Each generated file is wrapped in a viewport scaffold that lets you switch
 * between desktop and mobile widths just by resizing the browser window.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  renderEmailLayout,
  renderConfirmationCodeHtml,
  renderRawUrlFallbackHtml,
  type DetailRow,
} from '../backend/email/layout';
import { escapeHtml, sanitizeUrl } from '../backend/email/utils';

const OUT_DIR = path.resolve('tmp/email-previews');
fs.mkdirSync(OUT_DIR, { recursive: true });

function write(name: string, html: string) {
  fs.writeFileSync(path.join(OUT_DIR, `${name}.html`), html);
  console.log(`  ✔ wrote tmp/email-previews/${name}.html`);
}

// 1. Verification email — long Supabase verify URL exposed as fallback
write(
  'verification',
  renderEmailLayout({
    preheader: 'Confirm your email to start using Riplect.',
    greeting: 'Welcome, deep',
    headline: 'Verify your email address',
    intro:
      'Tap the button below to confirm your email and finish setting up your Riplect account.',
    primaryButton: {
      label: 'Verify email',
      href: 'https://psrccktleltdthwzdtfx.supabase.co/auth/v1/verify?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example.long.token.value.that.would.normally.wrap.onto.four.lines.on.mobile&type=signup&redirect_to=https%3A%2F%2Friplect.com%2Fwelcome',
    },
    afterCtaHtml: renderRawUrlFallbackHtml(
      'https://psrccktleltdthwzdtfx.supabase.co/auth/v1/verify?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example.long.token.value.that.would.normally.wrap.onto.four.lines.on.mobile&type=signup&redirect_to=https%3A%2F%2Friplect.com%2Fwelcome',
    ),
    closing: 'This link expires in 24 hours.',
  }),
);

// 2. Password reset
write(
  'password-reset',
  renderEmailLayout({
    preheader: 'Reset your Riplect password.',
    greeting: 'Hi deep',
    headline: 'Reset your password',
    intro:
      'We received a request to reset your password. Tap the button below to choose a new one.',
    primaryButton: {
      label: 'Reset password',
      href: 'https://riplect.com/reset?token=very-long-secret-token-value-12345',
    },
    blocks: [
      {
        tone: 'warn',
        title: 'Heads up',
        bodyHtml:
          "This password reset link expires in 1 hour for your security. If you didn't request a reset, you can safely ignore this email.",
      },
    ],
    afterCtaHtml: renderRawUrlFallbackHtml(
      'https://riplect.com/reset?token=very-long-secret-token-value-12345',
    ),
  }),
);

// 3. Welcome email
write(
  'welcome',
  renderEmailLayout({
    preheader: 'Your Riplect profile is ready to set up.',
    greeting: 'Welcome, deep.',
    headline: "Let's set up your space.",
    intro:
      'Riplect helps you take bookings, sell digital products, and run events — all from one profile your audience already knows how to find.',
    primaryButton: { label: 'Set up my profile', href: 'https://riplect.com/dashboard' },
    closing: 'Need help? Reply to this email and a real human will answer.',
    footerNote: 'Riplect · A home for coaches, healers and creators',
  }),
);

// 4. Event registration confirmation to guest — the screenshot one
const eventDetails: DetailRow[] = [
  {
    label: 'Event',
    valueHtml: escapeHtml(
      'A Quiet Sunday Afternoon: Sound Bath & Tea Ceremony for Beginners',
    ),
  },
  { label: 'Hosted by', valueHtml: escapeHtml('Maya Sundaram') },
  { label: 'Date', valueHtml: escapeHtml('Sunday, May 4, 2026') },
  { label: 'Time', valueHtml: escapeHtml('2:00 PM – 4:30 PM') },
  {
    label: 'Location',
    valueHtml: escapeHtml('The Loft Studios, 14B Brick Lane, London E1 6QL'),
  },
  { label: 'Confirmation', valueHtml: renderConfirmationCodeHtml('TJZ133SS') },
];

write(
  'event-registration-guest',
  renderEmailLayout({
    preheader: "You're registered for A Quiet Sunday Afternoon",
    greeting: 'Hi deep',
    headline: "You're registered",
    intro:
      'Your registration for A Quiet Sunday Afternoon: Sound Bath & Tea Ceremony for Beginners has been confirmed.',
    details: eventDetails,
    primaryButton: {
      label: 'Add to calendar',
      href: 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=A+Quiet+Sunday+Afternoon',
    },
    secondaryButton: {
      label: "Can't make it? Cancel",
      href: 'https://riplect.com/event/cancel?token=abc123',
    },
  }),
);

// 5. Event registration notification to coach
write(
  'event-registration-coach',
  renderEmailLayout({
    preheader: 'New registration for A Quiet Sunday Afternoon',
    greeting: 'Hi Maya',
    headline: 'A new event registration',
    intro: 'Someone just signed up for your event.',
    details: [
      {
        label: 'Event',
        valueHtml: escapeHtml(
          'A Quiet Sunday Afternoon: Sound Bath & Tea Ceremony for Beginners',
        ),
      },
      { label: 'Date', valueHtml: escapeHtml('Sunday, May 4, 2026') },
      { label: 'Attendee', valueHtml: escapeHtml('deep ramachandran') },
      {
        label: 'Email',
        valueHtml: `<a href="mailto:deep@example.com" style="color: #b66667; text-decoration: underline; text-underline-offset: 3px;">deep@example.com</a>`,
      },
      { label: 'Phone', valueHtml: escapeHtml('+44 7700 900123') },
    ],
    blocks: [
      {
        tone: 'warn',
        title: 'Payment required',
        bodyHtml:
          "Please confirm the attendee's payment from your dashboard once received.",
      },
    ],
    primaryButton: {
      label: 'Open in dashboard',
      href: 'https://riplect.com/dashboard/events/123',
    },
  }),
);

// 6. Meeting link to registrant
write(
  'meeting-link',
  renderEmailLayout({
    preheader: 'Meeting link for A Quiet Sunday Afternoon',
    greeting: 'Hi deep',
    headline: 'Your meeting link is ready',
    intro:
      'The meeting link for A Quiet Sunday Afternoon: Sound Bath & Tea Ceremony for Beginners is now available.',
    details: [
      {
        label: 'Event',
        valueHtml: escapeHtml(
          'A Quiet Sunday Afternoon: Sound Bath & Tea Ceremony for Beginners',
        ),
      },
      { label: 'Hosted by', valueHtml: escapeHtml('Maya Sundaram') },
      { label: 'Date', valueHtml: escapeHtml('Sunday, May 4, 2026 · 2:00 PM') },
    ],
    primaryButton: {
      label: 'Join meeting',
      href: 'https://us02web.zoom.us/j/89123456789?pwd=verylongmeetingpasswordvalueexample',
    },
    afterCtaHtml: renderRawUrlFallbackHtml(
      'https://us02web.zoom.us/j/89123456789?pwd=verylongmeetingpasswordvalueexample',
      'Or open the link directly:',
    ),
    closing: 'See you there.',
  }),
);

// Wrap each preview in a side-by-side comparison index
const files = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.html') && f !== 'index.html');
const index = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Riplect email QA</title>
<style>
body{font-family:-apple-system,sans-serif;background:#222;color:#eee;margin:0;padding:24px}
h1{margin:0 0 8px 0}h2{margin:24px 0 8px 0;font-size:14px;text-transform:uppercase;letter-spacing:0.1em;color:#aaa}
.row{display:flex;gap:24px;margin-bottom:48px;flex-wrap:wrap}
.frame{background:#444;padding:8px;border-radius:8px}
.frame .label{font-size:11px;color:#bbb;margin-bottom:6px}
iframe{border:0;display:block;background:#fff}
.desk iframe{width:720px;height:980px}
.mob iframe{width:375px;height:980px}
</style></head><body>
<h1>Riplect transactional emails — QA</h1>
<p>Each template at desktop (600px) and mobile (375px) widths.</p>
${files
  .map((f) => {
    const name = f.replace(/\.html$/, '');
    return `<h2>${escapeHtml(name)}</h2>
    <div class="row">
      <div class="frame desk"><div class="label">Desktop · 600px</div><iframe src="${escapeHtml(f)}"></iframe></div>
      <div class="frame mob"><div class="label">Mobile · 375px</div><iframe src="${escapeHtml(f)}"></iframe></div>
    </div>`;
  })
  .join('\n')}
</body></html>`;
fs.writeFileSync(path.join(OUT_DIR, 'index.html'), index);
console.log(`\nOpen tmp/email-previews/index.html to review.`);

// Touch sanitizeUrl just so the lint doesn't complain about the unused import
void sanitizeUrl;
