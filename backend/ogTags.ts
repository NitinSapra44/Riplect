import { storage } from "./storage";

interface OgTags {
  title: string;
  description: string;
  image: string | null;
  url: string;
  type: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const SUPABASE_STORAGE_PATH = '/storage/v1/object/';
const SUPABASE_PUBLIC_ASSETS_PATH = '/storage/v1/object/public/public_assets/';

/**
 * Returns true if the URL is safe to use as an OG image:
 * - Must be an absolute HTTPS URL (http:// is rejected — WhatsApp requires HTTPS)
 * - Must not be a signed URL (no token= or other temporary-access query params)
 * - If it is a Supabase Storage URL (contains /storage/v1/object/), it must be
 *   a permanent public-object URL from the public_assets bucket
 *   (/storage/v1/object/public/public_assets/). Any other Supabase path
 *   (signed URLs, private buckets, object/sign/...) is rejected.
 * - Non-Supabase HTTPS URLs (e.g. Google profile photos) pass if they have no
 *   temporary-access query params.
 */
function isSafeOgImageUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    // Must be HTTPS
    if (parsed.protocol !== 'https:') return false;
    // No temporary-access query params
    if (parsed.searchParams.has('token')) return false;
    const pathname = parsed.pathname;
    // If this is a Supabase storage URL, enforce the public_assets path
    if (pathname.includes(SUPABASE_STORAGE_PATH)) {
      if (!pathname.startsWith(SUPABASE_PUBLIC_ASSETS_PATH)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Detects MIME type from URL file extension.
 * Returns null if the extension is unrecognised or absent (e.g. HEIC, signed URL)
 * so we can omit og:image:type rather than declare a wrong value.
 */
function getImageMimeType(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    const ext = pathname.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'jpg':
      case 'jpeg': return 'image/jpeg';
      case 'png':  return 'image/png';
      case 'webp': return 'image/webp';
      case 'gif':  return 'image/gif';
      default:     return null;
    }
  } catch {
    return null;
  }
}

/**
 * Given an ordered list of candidate image URLs, returns the first one
 * that passes the isSafeOgImageUrl check, or null if none qualify.
 */
function pickSafeImage(...candidates: (string | null | undefined)[]): string | null {
  for (const candidate of candidates) {
    if (isSafeOgImageUrl(candidate)) return candidate;
  }
  return null;
}

export function generateOgMetaTags(tags: OgTags): string {
  const lines = [
    `<meta property="og:site_name" content="Riplect" />`,
    `<meta property="og:title" content="${escapeHtml(tags.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(tags.description)}" />`,
    `<meta property="og:type" content="${tags.type}" />`,
    `<meta property="og:url" content="${escapeHtml(tags.url)}" />`,
    `<title>${escapeHtml(tags.title)} | Riplect</title>`,
  ];
  
  if (tags.image) {
    lines.push(`<meta property="og:image" content="${escapeHtml(tags.image)}" />`);
    lines.push(`<meta property="og:image:secure_url" content="${escapeHtml(tags.image)}" />`);
    lines.push(`<meta property="og:image:width" content="1200" />`);
    lines.push(`<meta property="og:image:height" content="630" />`);
    lines.push(`<meta property="og:image:alt" content="${escapeHtml(tags.title)}" />`);
    const mimeType = getImageMimeType(tags.image);
    if (mimeType) {
      lines.push(`<meta property="og:image:type" content="${mimeType}" />`);
    }
  }
  
  lines.push(`<meta name="twitter:card" content="summary_large_image" />`);
  lines.push(`<meta name="twitter:title" content="${escapeHtml(tags.title)}" />`);
  lines.push(`<meta name="twitter:description" content="${escapeHtml(tags.description)}" />`);
  if (tags.image) {
    lines.push(`<meta name="twitter:image" content="${escapeHtml(tags.image)}" />`);
    lines.push(`<meta name="twitter:image:alt" content="${escapeHtml(tags.title)}" />`);
  }
  
  return lines.join('\n    ');
}

export async function getOgTagsForUrl(url: string, baseUrl: string): Promise<OgTags | null> {
  let pathname: string;
  try {
    const parsedUrl = new URL(url, 'http://localhost');
    pathname = parsedUrl.pathname.replace(/\/$/, '');
  } catch {
    pathname = url.split('?')[0].split('#')[0].replace(/\/$/, '');
  }
  
  const sessionMatch = pathname.match(/^\/([^\/]+)\/session\/(\d+)/);
  if (sessionMatch) {
    const [, username, sessionId] = sessionMatch;
    return await getSessionOgTags(username, parseInt(sessionId), baseUrl);
  }
  
  const eventMatch = pathname.match(/^\/([^\/]+)\/event\/(\d+)/);
  if (eventMatch) {
    const [, username, eventId] = eventMatch;
    return await getEventOgTags(username, parseInt(eventId), baseUrl);
  }

  const blogMatch = pathname.match(/^\/([^\/]+)\/blog\/([^\/]+)/);
  if (blogMatch) {
    const [, username, slug] = blogMatch;
    return await getBlogPostOgTags(username, slug, baseUrl);
  }

  const productMatch = pathname.match(/^\/([^\/]+)\/product\/(\d+)/);
  if (productMatch) {
    const [, username, productId] = productMatch;
    return await getProductOgTags(username, parseInt(productId), baseUrl);
  }
  
  const reservedPaths = ['api', 'auth', 'discover', 'dashboard', 'home', 'login', 'signup', 'register', 'settings', 'demo', 'admin'];
  const profileMatch = pathname.match(/^\/([^\/]+)$/);
  if (profileMatch) {
    const [, username] = profileMatch;
    if (!reservedPaths.includes(username.toLowerCase())) {
      return await getProfileOgTags(username, baseUrl);
    }
  }
  
  return null;
}

async function getSessionOgTags(username: string, sessionId: number, baseUrl: string): Promise<OgTags | null> {
  try {
    const session = await storage.getBookingSessionById(sessionId);
    if (!session) return null;
    
    const profile = await storage.getProfileByUsername(username);
    if (!profile) return null;
    
    const coachName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || profile.displayName || profile.username;
    const description = session.thumbnailDescription || session.description || `Book a session with ${coachName}`;
    const priceText = session.isFree ? 'Free' : `${session.currency || 'USD'} ${session.price}`;
    
    const images = session.images as Array<{ url: string; alt: string }> | null;
    const firstSessionImage = images && images.length > 0 ? images[0].url : undefined;
    const image = pickSafeImage(firstSessionImage, profile.profileImageUrl);
    
    return {
      title: `${session.title} - ${coachName}`,
      description: `${description} | Duration: ${session.duration} min | ${priceText}`,
      image,
      url: `${baseUrl}/${username}/session/${sessionId}`,
      type: 'website'
    };
  } catch (error) {
    console.error('Error getting session OG tags:', error);
    return null;
  }
}

async function getEventOgTags(username: string, eventId: number, baseUrl: string): Promise<OgTags | null> {
  try {
    const event = await storage.getEventById(eventId);
    if (!event) return null;
    
    const profile = await storage.getProfileByUsername(username);
    if (!profile) return null;
    
    const coachName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || profile.displayName || profile.username;
    
    const priceText = event.isFree ? 'Free' : ((): string => {
      const num = typeof event.price === 'string' ? parseFloat(event.price) : Number(event.price);
      if (!num || isNaN(num)) return 'Free';
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: event.currency || 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num);
    })();
    
    const eventDate = event.date ? new Date(event.date).toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric',
      year: 'numeric'
    }) : '';

    const timePart = event.startTime ? ` at ${event.startTime}` : '';

    const locationParts: string[] = [];
    if (event.isOnline) locationParts.push('Online');
    if (event.location) locationParts.push(event.location);
    const locationText = locationParts.length > 0 ? locationParts.join(' · ') : '';

    const baseDesc = event.thumbnailDescription || event.description || `An event by ${coachName}`;
    const cleanDesc = baseDesc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 150);
    
    const descParts: string[] = [cleanDesc];
    if (eventDate) descParts.push(`📅 ${eventDate}${timePart}`);
    if (locationText) descParts.push(`📍 ${locationText}`);
    descParts.push(`💰 ${priceText}`);
    
    const imagesArr = event.images as Array<{ type: string; url: string }> | null;
    const firstImageUrl = imagesArr && imagesArr.length > 0
      ? imagesArr.find(m => m.type === 'image')?.url
      : undefined;
    const image = pickSafeImage(event.featuredImage, firstImageUrl, profile.profileImageUrl);
    
    return {
      title: `${event.title} — ${coachName}`,
      description: descParts.join(' · '),
      image,
      url: `${baseUrl}/${username}/event/${eventId}`,
      type: 'website'
    };
  } catch (error) {
    console.error('Error getting event OG tags:', error);
    return null;
  }
}

async function getBlogPostOgTags(username: string, slug: string, baseUrl: string): Promise<OgTags | null> {
  try {
    const blogPost = await storage.getBlogPostBySlug(slug);
    if (!blogPost) return null;

    const profile = await storage.getProfileByUsername(username);
    if (!profile) return null;

    const rawDesc = blogPost.thumbnailDescription || blogPost.excerpt || blogPost.content || '';
    const cleanDesc = rawDesc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 150);
    const image = pickSafeImage(blogPost.imageUrl, profile.profileImageUrl);

    return {
      title: blogPost.title,
      description: cleanDesc,
      image,
      url: `${baseUrl}/${username}/blog/${slug}`,
      type: 'article',
    };
  } catch (error) {
    console.error('Error getting blog post OG tags:', error);
    return null;
  }
}

async function getProductOgTags(username: string, productId: number, baseUrl: string): Promise<OgTags | null> {
  try {
    const profile = await storage.getProfileByUsername(username);
    if (!profile) return null;

    let title: string;
    let description: string;
    let imageUrl: string | null | undefined;

    const digitalProduct = await storage.getDigitalProductById(productId);
    if (digitalProduct) {
      title = digitalProduct.title;
      description = digitalProduct.thumbnailDescription || digitalProduct.description || '';
      imageUrl = digitalProduct.imageUrl;
    } else {
      const physicalProduct = await storage.getPhysicalProductById(productId);
      if (!physicalProduct) return null;
      title = physicalProduct.title;
      description = physicalProduct.description || '';
      imageUrl = physicalProduct.imageUrl;
    }

    const cleanDesc = description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 150);
    const image = pickSafeImage(imageUrl, profile.profileImageUrl);

    return {
      title,
      description: cleanDesc,
      image,
      url: `${baseUrl}/${username}/product/${productId}`,
      type: 'website',
    };
  } catch (error) {
    console.error('Error getting product OG tags:', error);
    return null;
  }
}

async function getProfileOgTags(username: string, baseUrl: string): Promise<OgTags | null> {
  try {
    const profile = await storage.getProfileByUsername(username);
    if (!profile) return null;
    
    const name = `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || username;
    let title = profile.title ? `${name} - ${profile.title}` : name;
    let description = profile.shortBio || profile.longBio || `Connect with ${name} on Riplect`;
    const image = pickSafeImage(profile.profileImageUrl);

    // AI Profile: when a Brief is published, enrich the DESCRIPTION from the
    // hero's connective copy — but keep the "Name - Title" TITLE for branding and
    // consistent link previews. (Previously the title was overwritten with the
    // hero headline alone, dropping the creator's name/title from search & shares.)
    try {
      const { getPublishedRow } = await import("./brief/store");
      const row = await getPublishedRow(profile.id);
      const hero = (row?.brief as any)?.sections?.find((s: any) => s.kind === "hero");
      if (hero?.copy?.tagline) description = hero.copy.tagline;
      else if (hero?.copy?.headline) description = hero.copy.headline;
    } catch {
      /* keep defaults */
    }

    return {
      title: title,
      description: description.substring(0, 200),
      image,
      url: `${baseUrl}/${username}`,
      type: 'profile'
    };
  } catch (error) {
    console.error('Error getting profile OG tags:', error);
    return null;
  }
}

export function injectOgTags(html: string, ogMetaTags: string): string {
  const existingOgPattern = /<meta property="og:[^"]*"[^>]*>/g;
  let cleanedHtml = html.replace(existingOgPattern, '');
  
  const existingTwitterPattern = /<meta name="twitter:[^"]*"[^>]*>/g;
  cleanedHtml = cleanedHtml.replace(existingTwitterPattern, '');

  if (ogMetaTags.includes('<title>')) {
    cleanedHtml = cleanedHtml.replace(/<title>[^<]*<\/title>/, '');
  }
  
  return cleanedHtml.replace(
    '</head>',
    `    ${ogMetaTags}\n  </head>`
  );
}
