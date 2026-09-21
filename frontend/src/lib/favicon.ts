/**
 * Utility functions for fetching website favicons using Google's favicon service
 */

/**
 * Extracts the domain from a URL
 * @param url The full URL (e.g., https://www.example.com/page)
 * @returns The domain (e.g., example.com) or null if invalid
 */
export function extractDomain(url: string): string | null {
  if (!url) return null;
  
  try {
    // Ensure URL has a protocol
    let urlToProcess = url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      urlToProcess = 'https://' + url;
    }
    
    const urlObj = new URL(urlToProcess);
    return urlObj.hostname;
  } catch {
    return null;
  }
}

/**
 * Generates a Google Favicon service URL for a given domain or URL
 * @param urlOrDomain The URL or domain to fetch the favicon for
 * @param size The size of the favicon (default: 64)
 * @returns The Google Favicon service URL
 */
export function getFaviconUrl(urlOrDomain: string, size: number = 64): string | null {
  const domain = extractDomain(urlOrDomain) || urlOrDomain;
  
  if (!domain) return null;
  
  // Use Google's favicon service
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}
