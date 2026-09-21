import { APP_URL } from './utils';

// Coach dashboard deep-link to a specific booking row.
export function coachBookingLink(opts: {
  sessionId?: number | null;
  bookingId?: number | null;
}): string {
  const { sessionId, bookingId } = opts;
  const params = new URLSearchParams({ tab: 'bookings' });
  if (sessionId != null) params.set('sessionId', String(sessionId));
  if (bookingId != null) params.set('bookingId', String(bookingId));
  return `${APP_URL}/dashboard?${params.toString()}`;
}

// Coach dashboard deep-link to the events tab (optionally a specific event/registration).
export function coachEventLink(opts: {
  eventId?: number | null;
  registrationId?: number | null;
} = {}): string {
  const { eventId, registrationId } = opts;
  const params = new URLSearchParams({ tab: 'events' });
  if (eventId != null) params.set('eventId', String(eventId));
  if (registrationId != null)
    params.set('registrationId', String(registrationId));
  return `${APP_URL}/dashboard?${params.toString()}`;
}

// Coach dashboard deep-link to the products tab (optionally a specific product/purchase).
export function coachProductLink(opts: {
  productId?: number | null;
  purchaseId?: number | null;
} = {}): string {
  const { productId, purchaseId } = opts;
  const params = new URLSearchParams({ tab: 'products' });
  if (productId != null) params.set('productId', String(productId));
  if (purchaseId != null) params.set('purchaseId', String(purchaseId));
  return `${APP_URL}/dashboard?${params.toString()}`;
}

// Plain dashboard root.
export function dashboardLink(): string {
  return `${APP_URL}/dashboard`;
}

// Guest portal deep-link scoped to a booking, event registration, or purchase.
// Param names match what frontend/src/pages/guest-portal.tsx reads from the URL:
//   ?booking=<id>      -> Sessions tab, opens booking detail
//   ?registration=<id> -> Events tab, highlights registration card
//   ?purchase=<id>     -> Purchases tab, highlights purchase card
//   ?tab=<sessions|events|purchases|cancelled> -> just switches tab
export function guestPortalLink(opts: {
  token: string;
  bookingId?: number | null;
  registrationId?: number | null;
  purchaseId?: number | null;
  tab?: 'sessions' | 'bookings' | 'events' | 'purchases' | 'cancelled';
}): string {
  const { token, bookingId, registrationId, purchaseId, tab } = opts;
  const params = new URLSearchParams();
  if (bookingId != null) params.set('booking', String(bookingId));
  else if (registrationId != null)
    params.set('registration', String(registrationId));
  else if (purchaseId != null) params.set('purchase', String(purchaseId));
  if (tab) {
    // Normalize legacy 'bookings' -> 'sessions' to match guest-portal tab names.
    params.set('tab', tab === 'bookings' ? 'sessions' : tab);
  }
  const qs = params.toString();
  return `${APP_URL}/guest/${encodeURIComponent(token)}${qs ? `?${qs}` : ''}`;
}

export function eventCancelLink(token: string): string {
  return `${APP_URL}/cancel-registration?token=${encodeURIComponent(token)}`;
}

// Deep-link to the /complete-payment screen for a guest event registration.
// Mirrors what frontend/src/components/event-registration-modal.tsx navigates
// to when the registration endpoint reports paymentRequired=true so the email
// surface and the in-app surface stay in sync.
export function eventCompletePaymentLink(opts: {
  guestAccessToken: string;
  registrationId: number;
}): string {
  const { guestAccessToken, registrationId } = opts;
  const params = new URLSearchParams({
    token: guestAccessToken,
    type: 'registration',
    id: String(registrationId),
  });
  return `${APP_URL}/complete-payment?${params.toString()}`;
}

export function coachContactLink(coachUsername: string): string {
  return `${APP_URL}/${encodeURIComponent(coachUsername)}#contact`;
}

export function buildGoogleCalendarUrlForEvent(opts: {
  title: string;
  start: Date;
  end?: Date | null;
  description: string;
  location?: string | null;
}): string | undefined {
  if (!opts.start) return undefined;
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) =>
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const dtStart = fmt(opts.start);
  const dtEnd = opts.end ? fmt(opts.end) : dtStart;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: opts.title,
    dates: `${dtStart}/${dtEnd}`,
    details: opts.description,
  });
  if (opts.location) params.set('location', opts.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildGoogleCalendarUrl(opts: {
  title: string;
  startDate: string;
  startTime: string;
  durationMinutes: number;
  description: string;
  location?: string | null;
}): string {
  const { title, startDate, startTime, durationMinutes, description, location } =
    opts;
  const start = new Date(`${startDate} ${startTime}`);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: description,
  });
  if (location) params.set('location', location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
