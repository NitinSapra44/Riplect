import {
  BRAND,
  BRAND_TAGLINE,
  LOGO_URL,
  DISPLAY_STACK,
  SANS_STACK,
  UNSUBSCRIBE_EMAIL,
  escapeHtml,
  sanitizeUrl,
} from './utils';

export interface DetailRow {
  label: string;
  // Pre-escaped/safe HTML. Callers must escape user-supplied text.
  valueHtml: string;
}

export interface CalloutBlock {
  // 'info' for coach messages, 'warn' for action-required, 'success' for confirmations
  tone?: 'info' | 'warn' | 'success' | 'muted';
  title?: string;
  bodyHtml: string; // pre-escaped
}

export interface EmailButton {
  label: string;
  href: string;
  variant?: 'primary' | 'outline';
}

export interface EmailLayoutOpts {
  preheader?: string;
  greeting?: string;
  // Small uppercase eyebrow rendered inside the coloured hero band
  // (e.g. "Booking Confirmed", "Payment Received").
  eyebrow?: string;
  headline: string;
  intro?: string;
  details?: DetailRow[];
  blocks?: CalloutBlock[];
  bodyHtml?: string;
  // Optional HTML rendered AFTER the primary/secondary CTAs. Used by
  // verification / password-reset / meeting-link templates to place the
  // small "Or paste this link" fallback below the action button rather
  // than above it (which reads as a wall of text before the affordance).
  afterCtaHtml?: string;
  primaryButton?: EmailButton;
  secondaryButton?: EmailButton;
  closing?: string;
  footerNote?: string;
}

const PRIMARY = BRAND.primary;
const PRIMARY_BORDER = BRAND.primaryBorder;
const CREAM = BRAND.cream;
const PAGE_BG = BRAND.pageBg;
const WHITE = BRAND.white;
const INK = BRAND.ink;
const RULE = BRAND.rule;
const FOOTER_BG = BRAND.footerBg;
const FOOTER_TEXT = BRAND.footerText;
const FOOTER_HEADING = BRAND.footerHeading;

// ---------------------------------------------------------------------------
// Reusable value renderers exported for use in `emailService.ts`.
// Centralising these means the mobile tweaks (smaller letter-spacing for codes,
// hidden raw URLs on phones) live in exactly one place.
// ---------------------------------------------------------------------------

/**
 * Renders a confirmation code (like "TJZ133SS") as an inline span suitable
 * for use inside a DetailRow value. Uses the SANS_STACK so it falls back
 * gracefully on every mail client (no Space Grotesk glitch on mobile),
 * conservative letter-spacing so the code reads cleanly, and a class so the
 * mobile media query can tighten things further if needed.
 */
export function renderConfirmationCodeHtml(code: string): string {
  return `<span class="ep-code" style="font-family: ${SANS_STACK}; font-size: 17px; letter-spacing: 0.06em; color: ${PRIMARY}; font-weight: 700; white-space: nowrap;">${escapeHtml(code)}</span>`;
}

/**
 * Renders the "Or paste this link into your browser" fallback block used by
 * verification / password-reset / meeting-link emails. On mobile this entire
 * block is hidden via the `.ep-url-fallback` class so the user sees a clean
 * tap-target instead of a 4-line wall of blue text. On desktop it renders as
 * a small low-emphasis caption beneath the primary button.
 */
export function renderRawUrlFallbackHtml(
  url: string,
  prefix: string = 'Or paste this link into your browser:',
): string {
  const safeUrl = escapeHtml(url);
  return `<p class="ep-url-fallback" style="margin: 20px 0 0 0; text-align: center; font-family: ${SANS_STACK}; font-size: 12px; line-height: 1.5; color: ${BRAND.inkSofter}; word-break: break-all; overflow-wrap: anywhere;">${escapeHtml(prefix)}<br/><span style="color: ${BRAND.inkSoft};">${safeUrl}</span></p>`;
}

// ---------------------------------------------------------------------------
// Layout fragments
// ---------------------------------------------------------------------------

function renderBrandBand(): string {
  // Brand-primary band carrying the white Riplect mark + "Conscious Collective"
  // tagline. The tagline is intentionally left-aligned and pushed in so the
  // "C" of "Conscious" sits directly under the "R" of "Riplect" in the logo
  // image, matching the home-page brand lockup.
  //
  // The logo PNG is 607×189 internally; the "R" glyph begins at x≈207, i.e.
  // about 34.1% from the image's left edge. At 240px wide that puts the R at
  // ~82px in; at the 150px mobile width it's at ~51px. The image and tagline
  // sit inside the same fixed-width 240px wrapper table (table-layout: fixed)
  // and the tagline cell carries an explicit `padding-left` so the C lands
  // under the R in every major email client (Gmail web/iOS, Apple Mail,
  // Outlook web — all of which honour td padding). On mobile the image is
  // centred within the same 240px wrapper, which shifts its left edge inward
  // by (240−150)/2 = 45px, so the mobile padding is bumped from 82 → 96px
  // (45 + 51) to keep the C under the R of the smaller wordmark. Keeping the
  // wrapper at 240px on both widths gives the tagline enough room to stay on
  // a single line at the existing font sizes — the previous centred attempt
  // produced a left-shifted, barely-legible tagline on phones.
  return `
    <tr>
      <td align="center" bgcolor="${PRIMARY}" class="ep-band" style="background-color: ${PRIMARY}; padding: 22px 24px 22px 24px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="240" class="ep-brand-stack" style="margin: 0 auto; width: 240px; table-layout: fixed;">
          <tr>
            <td align="center" style="padding: 0; line-height: 0; font-size: 0;">
              <img src="${LOGO_URL}" alt="Riplect" width="240" class="ep-logo" style="display: block; margin: 0 auto; width: 240px; max-width: 240px; height: auto; border: 0; outline: none; text-decoration: none;" />
            </td>
          </tr>
          <tr>
            <td align="left" class="ep-tag-cell" style="padding: 6px 0 0 82px; text-align: left;">
              <p class="ep-tagline" style="margin: 0; padding: 0; font-family: ${DISPLAY_STACK}; font-size: 15px; line-height: 1.2; font-weight: 700; color: ${CREAM}; letter-spacing: 0.005em; text-align: left; white-space: nowrap;">${escapeHtml(BRAND_TAGLINE)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;
}

function renderHeader(opts: EmailLayoutOpts): string {
  const eyebrowHtml = opts.eyebrow
    ? `<p style="margin: 0 0 12px 0; font-family: ${SANS_STACK}; font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; color: ${PRIMARY}; font-weight: 700;">${escapeHtml(opts.eyebrow)}</p>`
    : '';
  const introHtml = opts.intro
    ? `<p class="ep-intro" style="margin: 14px 0 0 0; font-family: ${SANS_STACK}; font-size: 16px; line-height: 1.55; color: ${BRAND.inkSoft};">${escapeHtml(opts.intro)}</p>`
    : '';
  return `
    <tr>
      <td bgcolor="${WHITE}" class="ep-side ep-header-pad" style="background-color: ${WHITE}; padding: 32px 36px 4px 36px;">
        ${eyebrowHtml}
        <h1 class="ep-headline" style="margin: 0; font-family: ${DISPLAY_STACK}; font-size: 28px; line-height: 1.2; font-weight: 700; color: ${BRAND.headline}; letter-spacing: -0.01em;">${escapeHtml(opts.headline)}</h1>
        ${introHtml}
      </td>
    </tr>
  `;
}

function renderGreeting(text: string): string {
  return `
    <tr>
      <td class="ep-side ep-greeting-pad" style="padding: 20px 36px 0 36px;">
        <p style="margin: 0; font-family: ${SANS_STACK}; font-size: 15px; line-height: 1.55; color: ${INK};">${escapeHtml(text)}</p>
      </td>
    </tr>
  `;
}

function renderDetails(rows: DetailRow[]): string {
  // Each row renders as a TR with two TDs (label, value). On desktop the cells
  // sit side-by-side (label left, value right-aligned). The `.ep-detail-*`
  // classes are picked up by the mobile media query and switched to
  // `display: block` so the label sits above the value on a phone — no more
  // broken 32/68 split that wraps long event titles into the label column.
  const cells = rows
    .map((r, i) => {
      const isFirst = i === 0;
      const isLast = i === rows.length - 1;
      const rowClasses = `ep-detail-row${isFirst ? ' ep-detail-row-first' : ''}${isLast ? ' ep-detail-row-last' : ''}`;
      const labelBorder = !isLast ? `border-bottom: 1px solid ${PRIMARY_BORDER};` : '';
      const valueBorder = labelBorder;
      const topPad = isFirst ? '0' : '12px';
      return `
        <tr class="${rowClasses}">
          <td class="ep-detail-label" valign="middle" width="32%" style="padding: ${topPad} 12px 12px 0; ${labelBorder} font-family: ${SANS_STACK}; font-size: 12.5px; letter-spacing: 0.14em; text-transform: uppercase; color: #8B6F70; font-weight: 700; line-height: 1.5;">${escapeHtml(r.label)}</td>
          <td class="ep-detail-value" valign="middle" width="68%" align="right" style="padding: ${topPad} 0 12px 0; ${valueBorder} font-family: ${SANS_STACK}; font-size: 15px; color: ${BRAND.headline}; font-weight: 600; line-height: 1.5;">${r.valueHtml}</td>
        </tr>
      `;
    })
    .join('');
  return `
    <tr>
      <td class="ep-side ep-details-pad" style="padding: 26px 36px 6px 36px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${CREAM}" style="background-color: ${CREAM}; border-radius: 14px; border-collapse: separate;">
          <tr>
            <td class="ep-details-card-pad" style="padding: 20px 24px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse: collapse;">
                ${cells}
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;
}

function renderCallout(b: CalloutBlock): string {
  const palette = {
    info: { bg: CREAM, accent: PRIMARY, text: INK },
    warn: { bg: '#FBF1E8', accent: '#B85C2C', text: '#5A2E12' },
    success: { bg: '#EEF4EE', accent: '#3F6B3F', text: '#23451E' },
    muted: { bg: '#F5F2ED', accent: BRAND.inkSofter, text: INK },
  }[b.tone || 'info'];
  const titleHtml = b.title
    ? `<p style="margin: 0 0 8px 0; font-family: ${SANS_STACK}; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 700; color: ${palette.accent};">${escapeHtml(b.title)}</p>`
    : '';
  return `
    <tr>
      <td class="ep-side ep-callout-pad" style="padding: 14px 36px 0 36px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: ${palette.bg}; border-left: 4px solid ${palette.accent}; border-radius: 8px;">
          <tr>
            <td class="ep-callout-inner" style="padding: 16px 20px; font-family: ${SANS_STACK}; font-size: 14px; line-height: 1.6; color: ${palette.text};">
              ${titleHtml}
              <div style="white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere;">${b.bodyHtml}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;
}

function renderButton(btn: EmailButton, isPrimary: boolean): string {
  const safeHref = sanitizeUrl(btn.href);
  if (!safeHref) return '';
  if (isPrimary) {
    // Primary CTA. On desktop it stays an inline pill (`width: auto`), but on
    // mobile the wrapper table grows to 100% of the available width via
    // `.ep-cta-wrap`, and the anchor itself becomes block-level via
    // `.ep-cta-anchor`, giving a comfortable full-width tap target with side
    // margins inherited from the surrounding `.ep-cta-pad` td.
    return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" class="ep-cta-wrap" style="margin: 0 auto;">
        <tr>
          <td align="center" bgcolor="${PRIMARY}" style="background-color: ${PRIMARY}; border-radius: 999px;">
            <a href="${safeHref}" target="_blank" class="ep-cta-anchor" style="display: inline-block; padding: 16px 36px; font-family: ${SANS_STACK}; font-size: 15px; font-weight: 600; color: ${WHITE}; text-decoration: none; border-radius: 999px; text-align: center;">${escapeHtml(btn.label)}</a>
          </td>
        </tr>
      </table>
    `;
  }
  if (btn.variant === 'outline') {
    return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin: 14px auto 0 auto;">
        <tr>
          <td align="center" style="border: 1.5px solid ${PRIMARY}; border-radius: 999px;">
            <a href="${safeHref}" target="_blank" style="display: inline-block; padding: 14px 32px; font-family: ${SANS_STACK}; font-size: 14px; font-weight: 600; color: ${PRIMARY}; text-decoration: none;">${escapeHtml(btn.label)}</a>
          </td>
        </tr>
      </table>
    `;
  }
  // Default secondary: brand-coloured text link
  return `
    <p style="margin: 14px 0 0 0; text-align: center; font-family: ${SANS_STACK}; font-size: 14px;">
      <a href="${safeHref}" target="_blank" style="color: ${PRIMARY}; text-decoration: underline; text-underline-offset: 4px; font-weight: 600;">${escapeHtml(btn.label)}</a>
    </p>
  `;
}

function renderCtaArea(opts: EmailLayoutOpts): string {
  const primary = opts.primaryButton ? renderButton(opts.primaryButton, true) : '';
  const secondary = opts.secondaryButton
    ? renderButton(opts.secondaryButton, false)
    : '';
  if (!primary && !secondary) return '';
  return `
    <tr>
      <td align="center" class="ep-side ep-cta-pad" style="padding: 24px 36px 4px 36px;">
        ${primary}
        ${secondary}
      </td>
    </tr>
  `;
}

function renderClosing(text: string): string {
  return `
    <tr>
      <td class="ep-side ep-closing-pad" style="padding: 22px 36px 4px 36px;">
        <p style="margin: 0; font-family: ${SANS_STACK}; font-size: 14px; color: ${BRAND.inkSoft}; line-height: 1.6;">${escapeHtml(text)}</p>
      </td>
    </tr>
  `;
}

function renderBodySpacer(): string {
  return `<tr><td class="ep-side ep-bottom-spacer" style="padding: 0 36px 28px 36px;">&nbsp;</td></tr>`;
}

function renderFooter(note?: string): string {
  const year = new Date().getFullYear();
  const noteText =
    note || `Riplect · You received this because of activity on your account.`;
  const unsubHref = `mailto:${UNSUBSCRIBE_EMAIL}?subject=${encodeURIComponent('Unsubscribe')}`;
  return `
    <tr>
      <td bgcolor="${FOOTER_BG}" class="ep-side ep-footer-pad" style="background-color: ${FOOTER_BG}; padding: 30px 36px;">
        <p style="margin: 0 0 12px 0; text-align: center; font-family: ${DISPLAY_STACK}; font-size: 16px; font-weight: 700; color: ${FOOTER_HEADING}; letter-spacing: 0.02em;">Riplect</p>
        <p style="margin: 0 0 10px 0; text-align: center; font-family: ${SANS_STACK}; font-size: 12px; line-height: 1.7; color: ${FOOTER_TEXT};">
          ${escapeHtml(noteText)}<br/>
          &copy; ${year} Riplect. All rights reserved.
        </p>
        <p style="margin: 0; text-align: center; font-family: ${SANS_STACK}; font-size: 12px; line-height: 1.7; color: ${FOOTER_TEXT};">
          Don't want these emails?
          <a href="${unsubHref}" style="color: ${FOOTER_HEADING}; text-decoration: underline; text-underline-offset: 3px;">Unsubscribe</a>
          or email
          <a href="mailto:${escapeHtml(UNSUBSCRIBE_EMAIL)}" style="color: ${FOOTER_HEADING}; text-decoration: underline; text-underline-offset: 3px;">${escapeHtml(UNSUBSCRIBE_EMAIL)}</a>.
        </p>
      </td>
    </tr>
  `;
}

function renderPreheader(text?: string): string {
  if (!text) return '';
  return `<div style="display: none; max-height: 0; overflow: hidden; mso-hide: all; font-size: 1px; color: transparent; line-height: 1px;">${escapeHtml(text)}</div>`;
}

export function renderEmailLayout(opts: EmailLayoutOpts): string {
  const eyebrow = opts.eyebrow;
  const greetingHtml = opts.greeting ? renderGreeting(opts.greeting) : '';
  const detailsHtml = opts.details && opts.details.length
    ? renderDetails(opts.details)
    : '';
  const blocksHtml = (opts.blocks || []).map(renderCallout).join('');
  const bodyHtml = opts.bodyHtml
    ? `<tr><td class="ep-side ep-body-pad" style="padding: 16px 36px 0 36px;">${opts.bodyHtml}</td></tr>`
    : '';
  const ctaHtml = renderCtaArea(opts);
  const afterCtaHtml = opts.afterCtaHtml
    ? `<tr><td class="ep-side ep-after-cta-pad" style="padding: 8px 36px 0 36px;">${opts.afterCtaHtml}</td></tr>`
    : '';
  const closingHtml = opts.closing ? renderClosing(opts.closing) : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<title>Riplect</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
<style>
  body { margin: 0; padding: 0; background-color: ${PAGE_BG}; }
  table { border-collapse: collapse; }
  img { -ms-interpolation-mode: bicubic; }
  a { word-break: break-word; }
  /* Mobile (≤ 620px) — narrow phones (Gmail iOS, Apple Mail iOS, Outlook) */
  @media only screen and (max-width: 620px) {
    .ep-shell { width: 100% !important; max-width: 100% !important; border-radius: 0 !important; border-left: 0 !important; border-right: 0 !important; }
    .ep-page-pad { padding: 0 !important; }
    /* Brand band */
    .ep-band { padding: 18px 18px 16px 18px !important; }
    .ep-logo { width: 150px !important; max-width: 150px !important; }
    /* The 240px wrapper is preserved on mobile so the tagline still has room
       for "Conscious Collective" on a single line. The image (now 150px) is
       centred within that wrapper, so its left edge moves inward by 45px;
       the tagline padding is bumped from 82 → 96px (45 + 51) so the C of
       "Conscious" still lines up under the R of the smaller wordmark. */
    .ep-tag-cell { padding-left: 96px !important; }
    .ep-tagline { font-size: 13px !important; }
    /* Header / body padding */
    .ep-side { padding-left: 22px !important; padding-right: 22px !important; }
    .ep-header-pad { padding-top: 26px !important; padding-bottom: 0 !important; }
    .ep-headline { font-size: 23px !important; line-height: 1.22 !important; }
    .ep-intro { font-size: 15px !important; line-height: 1.55 !important; }
    .ep-greeting-pad { padding-top: 16px !important; }
    /* Details card */
    .ep-details-pad { padding-top: 22px !important; padding-bottom: 4px !important; }
    .ep-details-card-pad { padding: 6px 18px !important; }
    .ep-detail-label,
    .ep-detail-value {
      display: block !important;
      width: 100% !important;
      box-sizing: border-box !important;
      text-align: left !important;
      border-bottom: 0 !important;
    }
    .ep-detail-label {
      padding: 14px 0 2px 0 !important;
      font-size: 11px !important;
      letter-spacing: 0.16em !important;
    }
    .ep-detail-value {
      padding: 0 0 14px 0 !important;
      font-size: 16px !important;
      line-height: 1.4 !important;
      border-bottom: 1px solid ${PRIMARY_BORDER} !important;
    }
    .ep-detail-row-first .ep-detail-label { padding-top: 6px !important; }
    .ep-detail-row-last .ep-detail-value { border-bottom: 0 !important; padding-bottom: 6px !important; }
    /* Confirmation code — tighter so it fits on one line on small screens */
    .ep-code { font-size: 16px !important; letter-spacing: 0.04em !important; }
    /* Callouts */
    .ep-callout-pad { padding-left: 22px !important; padding-right: 22px !important; padding-top: 14px !important; }
    .ep-callout-inner { padding: 14px 16px !important; font-size: 14px !important; }
    /* CTA — full-width, comfortable tap target */
    .ep-cta-pad { padding: 22px 22px 4px 22px !important; }
    .ep-cta-wrap { width: 100% !important; }
    .ep-cta-anchor { display: block !important; width: auto !important; padding: 15px 20px !important; font-size: 16px !important; }
    .ep-closing-pad { padding-top: 18px !important; }
    .ep-bottom-spacer { padding-bottom: 22px !important; }
    /* Hide the raw URL fallback on mobile — the primary button is the
       intended affordance and a wall of blue text dominates the screen */
    .ep-url-fallback { display: none !important; max-height: 0 !important; overflow: hidden !important; mso-hide: all !important; }
    /* Footer */
    .ep-footer-pad { padding: 26px 22px !important; }
  }
</style>
</head>
<body style="margin: 0; padding: 0; background-color: ${PAGE_BG}; -webkit-font-smoothing: antialiased; -webkit-text-size-adjust: 100%;">
${renderPreheader(opts.preheader)}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${PAGE_BG}" style="background-color: ${PAGE_BG};">
  <tr>
    <td align="center" class="ep-page-pad" style="padding: 32px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="ep-shell" style="width: 600px; max-width: 600px; background-color: ${WHITE}; border: 1px solid ${RULE}; border-radius: 16px; overflow: hidden;">
        ${renderBrandBand()}
        ${renderHeader({ ...opts, eyebrow })}
        ${greetingHtml}
        ${detailsHtml}
        ${blocksHtml}
        ${bodyHtml}
        ${ctaHtml}
        ${afterCtaHtml}
        ${closingHtml}
        ${renderBodySpacer()}
        ${renderFooter(opts.footerNote)}
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
