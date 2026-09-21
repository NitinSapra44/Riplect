import QRCodeLib from "qrcode";

export function getCanonicalAppOrigin(): string {
  // Prefer the explicit canonical app URL (production riplect.com) so QR
  // codes, share links, and copy-link buttons always send guests to the
  // production site — even when the coach is generating the QR from a
  // dev preview URL. Falls back to the current page origin only if no
  // canonical URL has been configured (local development without the
  // env var set).
  const configured = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export function buildEventUrl(username: string, eventId: number | string): string {
  return `${getCanonicalAppOrigin()}/${username}/event/${eventId}`;
}

export async function generateEventQrDataUrl(url: string): Promise<string> {
  try {
    return await QRCodeLib.toDataURL(url, {
      width: 512,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    });
  } catch {
    return await QRCodeLib.toDataURL(url, { width: 256, margin: 2 });
  }
}

function slugifyForFilename(input: string): string {
  return (input || "event")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "event";
}

export function getEventQrFilename(eventTitle: string | null | undefined): string {
  return `${slugifyForFilename(eventTitle || "event")}-qr.png`;
}

export async function downloadQrImage(
  displayUrl: string,
  eventTitle: string | null | undefined,
): Promise<void> {
  const filename = getEventQrFilename(eventTitle);
  if (displayUrl.startsWith("data:")) {
    const a = document.createElement("a");
    a.href = displayUrl;
    a.download = filename;
    a.click();
    return;
  }
  try {
    const res = await fetch(displayUrl);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(objectUrl);
  } catch {
    const a = document.createElement("a");
    a.href = displayUrl;
    a.download = filename;
    a.click();
  }
}
