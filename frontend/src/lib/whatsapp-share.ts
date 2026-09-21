const getBaseUrl = (): string => {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return 'https://riplect.com';
};

// Message generation functions that can be used by both WhatsApp and Web Share API

export const generateCoachShareMessage = (coach: CoachShareData): string => {
  const baseUrl = getBaseUrl();
  const profileUrl = `${baseUrl}/${coach.username}`;

  const lines: string[] = [];

  // Name (bold in WhatsApp)
  lines.push(`*${coach.displayName}*`);

  if (coach.title) {
    lines.push(coach.title);
  }

  if (coach.shortBio) {
    lines.push('');
    lines.push(coach.shortBio);
  }

  // Contact info
  const contactLines: string[] = [];
  if (coach.phone) contactLines.push(`📞  ${coach.phone}`);
  if (coach.whatsapp) contactLines.push(`💬  ${coach.whatsapp} (WhatsApp)`);
  if (coach.email) contactLines.push(`✉️  ${coach.email}`);

  if (contactLines.length > 0) {
    lines.push('');
    lines.push(...contactLines);
  }

  lines.push('');
  lines.push(`🔗  ${profileUrl}`);

  return lines.join('\n');
};

export const generateSessionShareMessage = (session: SessionShareData): string => {
  const baseUrl = getBaseUrl();
  const sessionUrl = `${baseUrl}/${session.username}/session/${session.sessionId}`;
  
  const priceText = formatPriceForShare(session.price, session.isFree, session.currency);
  
  const messageParts: string[] = [
    `${session.title}`,
  ];
  
  if (session.thumbnailDescription) {
    messageParts.push(`\n\n${session.thumbnailDescription}`);
  }
  
  messageParts.push(`\n\nDuration: ${session.duration} min`);
  messageParts.push(`\nPrice: ${priceText}`);
  messageParts.push(`\nBook now: ${sessionUrl}`);
  
  return messageParts.join('');
};

export const generateEventShareMessage = (event: EventShareData): string => {
  const baseUrl = getBaseUrl();
  const eventUrl = `${baseUrl}/${event.username}/event/${event.eventId}`;
  
  // Price text from pricingType or legacy isFree
  let priceText: string;
  if (event.pricingType === 'free' || event.isFree) {
    priceText = 'Free';
  } else if (event.pricingType === 'donation') {
    priceText = 'Donation';
  } else {
    priceText = formatPriceForShare(event.price, false, event.currency);
  }

  const startAt = event.startAt ? new Date(event.startAt) : null;
  const endAt = event.endAt ? new Date(event.endAt) : null;
  
  const dateStr = startAt ? startAt.toLocaleDateString('en-US', { 
    weekday: 'long', 
    month: 'long', 
    day: 'numeric',
    year: 'numeric'
  }) : '';

  const fmtTime = (d: Date) => {
    if (d.getHours() === 0 && d.getMinutes() === 0) return null;
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const timeStr = startAt ? fmtTime(startAt) : null;
  const endTimeStr = endAt ? fmtTime(endAt) : null;
  const timeRange = timeStr ? (endTimeStr ? `${timeStr} – ${endTimeStr}` : timeStr) : null;

  const lines: string[] = [];

  // Title (WhatsApp bold)
  lines.push(`*${event.title}*`);

  // Description
  if (event.thumbnailDescription) {
    lines.push('');
    lines.push(event.thumbnailDescription);
  }

  lines.push('');

  // Date + time
  if (dateStr) {
    lines.push(`📅  ${dateStr}${timeRange ? `  ·  ${timeRange}` : ''}`);
  }

  // Location
  const locationParts: string[] = [];
  if (event.mode === 'online' || event.mode === 'hybrid' || event.isOnline) locationParts.push('Online');
  if (event.location) locationParts.push(event.location);
  if (locationParts.length > 0) {
    lines.push(`📍  ${locationParts.join(' · ')}`);
  }

  // Price
  lines.push(`💰  ${priceText}`);

  lines.push('');
  lines.push(`👉  ${eventUrl}`);

  return lines.join('\n');
};

export const generateBlogPostShareMessage = (post: BlogPostShareData): string => {
  const baseUrl = getBaseUrl();
  const postUrl = `${baseUrl}/${post.username}/blog/${post.slug}`;

  const lines: string[] = [];

  lines.push(`*${post.title}*`);

  const blurb = post.thumbnailDescription || post.excerpt;
  if (blurb) {
    lines.push('');
    lines.push(blurb);
  }

  lines.push('');
  lines.push(`📖  ${postUrl}`);

  return lines.join('\n');
};

export const generateProductShareMessage = (product: ProductShareData): string => {
  const baseUrl = getBaseUrl();
  const productUrl = `${baseUrl}/${product.username}/product/${product.productId}`;

  const priceText = formatPriceForShare(product.price, product.isFree, product.currency);

  const lines: string[] = [];

  lines.push(`*${product.title}*`);

  if (product.thumbnailDescription || product.description) {
    lines.push('');
    lines.push((product.thumbnailDescription || product.description)!);
  }

  lines.push('');
  lines.push(`💰  ${priceText}`);
  lines.push(`🛒  ${productUrl}`);

  return lines.join('\n');
};

export interface BlogPostShareData {
  title: string;
  excerpt?: string | null;
  thumbnailDescription?: string | null;
  slug: string;
  username: string;
}

export interface ProductShareData {
  title: string;
  thumbnailDescription?: string | null;
  description?: string | null;
  price: string | number;
  isFree?: boolean;
  currency?: string;
  productId: number;
  username: string;
}

export interface CoachShareData {
  displayName: string;
  title?: string | null;
  shortBio?: string | null;
  username: string;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
}

export interface SessionShareData {
  title: string;
  thumbnailDescription?: string | null;
  duration: number;
  price: string | number;
  isFree?: boolean;
  currency?: string;
  username: string;
  sessionId: number;
}

export interface EventShareData {
  title: string;
  thumbnailDescription?: string | null;
  startAt?: string | Date | null;
  endAt?: string | Date | null;
  price: string | number;
  pricingType?: 'free' | 'donation' | 'paid';
  isFree?: boolean;
  currency?: string;
  location?: string | null;
  mode?: 'online' | 'offline' | 'hybrid' | null;
  isOnline?: boolean;
  username: string;
  eventId: number;
}

const formatPriceForShare = (price: string | number, isFree?: boolean, currency: string = 'USD'): string => {
  if (isFree) return 'Free';
  const numericPrice = typeof price === 'string' ? parseFloat(price) : price;
  if (isNaN(numericPrice) || numericPrice === 0) return 'Free';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(numericPrice);
};

export const shareCoachOnWhatsApp = (coach: CoachShareData): void => {
  const message = generateCoachShareMessage(coach);
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
  window.open(whatsappUrl, '_blank');
};

export const shareSessionOnWhatsApp = (session: SessionShareData): void => {
  const message = generateSessionShareMessage(session);
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
  window.open(whatsappUrl, '_blank');
};

export const shareEventOnWhatsApp = (event: EventShareData): void => {
  const message = generateEventShareMessage(event);
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
  window.open(whatsappUrl, '_blank');
};
