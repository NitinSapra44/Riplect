import { escapeHtml } from './utils';

export interface LocationInfo {
  name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  googleMapsUrl?: string | null;
}

export interface LocationVisibility {
  showLocationName: boolean;
  showStreetAddress: boolean;
  showMapLocation: boolean;
}

export function formatLocationWithVisibility(
  location: LocationInfo | null,
  visibility: LocationVisibility,
): string | null {
  if (!location) return null;
  const parts: string[] = [];
  if (visibility.showLocationName && location.name) parts.push(escapeHtml(location.name));
  if (visibility.showStreetAddress && location.address)
    parts.push(escapeHtml(location.address));
  const csc = [location.city, location.state, location.country]
    .filter(Boolean)
    .map((s) => escapeHtml(s as string))
    .join(', ');
  if (csc) parts.push(csc);
  return parts.length ? parts.join(' · ') : null;
}

export function formatFullLocation(
  location: LocationInfo | null,
): string | null {
  if (!location) return null;
  const parts: string[] = [];
  if (location.name) parts.push(escapeHtml(location.name));
  if (location.address) parts.push(escapeHtml(location.address));
  const csc = [location.city, location.state, location.country]
    .filter(Boolean)
    .map((s) => escapeHtml(s as string))
    .join(', ');
  if (csc) parts.push(csc);
  return parts.length ? parts.join(' · ') : null;
}
