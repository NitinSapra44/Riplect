export interface ParsedLocation {
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
  address: string | null;
}

export function isShortMapsUrl(url: string): boolean {
  return url.includes('maps.app.goo.gl') || url.includes('goo.gl/maps');
}

export async function expandShortMapsUrl(url: string): Promise<string> {
  if (!isShortMapsUrl(url)) {
    return url;
  }
  
  try {
    const response = await fetch('/api/expand-maps-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to expand URL');
    }
    
    const data = await response.json();
    return data.expandedUrl || url;
  } catch (error) {
    console.error('Error expanding short Maps URL:', error);
    return url;
  }
}

export function parseGoogleMapsUrl(url: string): ParsedLocation {
  const result: ParsedLocation = {
    latitude: null,
    longitude: null,
    placeId: null,
    address: null,
  };

  if (!url) return result;

  try {
    const patterns = [
      /@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
      /!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/,
      /ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
      /q=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
      /center=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        result.latitude = parseFloat(match[1]);
        result.longitude = parseFloat(match[2]);
        break;
      }
    }

    const placeMatch = url.match(/place\/([^/@]+)/);
    if (placeMatch) {
      result.address = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
    }

    const placeIdMatch = url.match(/place_id[=:]([A-Za-z0-9_-]+)/);
    if (placeIdMatch) {
      result.placeId = placeIdMatch[1];
    }
  } catch (error) {
    console.error('Error parsing Google Maps URL:', error);
  }

  return result;
}

export async function parseGoogleMapsUrlWithExpansion(url: string): Promise<ParsedLocation> {
  const expandedUrl = await expandShortMapsUrl(url);
  return parseGoogleMapsUrl(expandedUrl);
}

export function formatAddress(location: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  country?: string | null;
}): string {
  const parts = [
    location.address,
    location.city,
    location.state,
    location.zipCode,
    location.country,
  ].filter(Boolean);
  
  return parts.join(', ');
}

export function getGoogleMapsEmbedUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps?q=${latitude},${longitude}&z=15&output=embed`;
}

export function getGoogleMapsDirectionsUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
}

export interface ReverseGeocodedAddress {
  city: string;
  state: string;
  country: string;
  zipCode: string;
  address: string;
}

export async function reverseGeocodeWithBigDataCloud(
  latitude: number,
  longitude: number
): Promise<ReverseGeocodedAddress> {
  const result: ReverseGeocodedAddress = {
    city: '',
    state: '',
    country: '',
    zipCode: '',
    address: '',
  };

  try {
    const response = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
    );

    if (!response.ok) {
      throw new Error('BigDataCloud API request failed');
    }

    const data = await response.json();
    
    result.city = data.city || data.locality || '';
    result.state = data.principalSubdivision || '';
    result.country = data.countryName || '';
    result.zipCode = data.postcode || '';
    
    const addressParts = [
      data.locality,
      data.city,
      data.principalSubdivision,
      data.countryName,
    ].filter(Boolean);
    result.address = addressParts.join(', ');
  } catch (error) {
    console.error('BigDataCloud reverse geocoding error:', error);
  }

  return result;
}

export async function reverseGeocodeWithNominatim(
  latitude: number,
  longitude: number
): Promise<ReverseGeocodedAddress> {
  const result: ReverseGeocodedAddress = {
    city: '',
    state: '',
    country: '',
    zipCode: '',
    address: '',
  };

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'RiplectApp/1.0',
        },
      }
    );

    if (!response.ok) {
      throw new Error('Nominatim API request failed');
    }

    const data = await response.json();
    const addr = data.address || {};

    result.city = addr.city || addr.town || addr.village || addr.municipality || '';
    result.state = addr.state || addr.province || addr.region || '';
    result.country = addr.country || '';
    result.zipCode = addr.postcode || '';
    result.address = data.display_name || '';
  } catch (error) {
    console.error('Nominatim reverse geocoding error:', error);
  }

  return result;
}

export async function reverseGeocodeWithFallback(
  latitude: number,
  longitude: number
): Promise<ReverseGeocodedAddress> {
  const bigDataResult = await reverseGeocodeWithBigDataCloud(latitude, longitude);
  
  if (!bigDataResult.zipCode) {
    const nominatimResult = await reverseGeocodeWithNominatim(latitude, longitude);
    if (nominatimResult.zipCode) {
      bigDataResult.zipCode = nominatimResult.zipCode;
    }
    if (!bigDataResult.city && nominatimResult.city) {
      bigDataResult.city = nominatimResult.city;
    }
    if (!bigDataResult.state && nominatimResult.state) {
      bigDataResult.state = nominatimResult.state;
    }
    if (!bigDataResult.country && nominatimResult.country) {
      bigDataResult.country = nominatimResult.country;
    }
  }
  
  return bigDataResult;
}
