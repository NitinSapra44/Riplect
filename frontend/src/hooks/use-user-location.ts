import { useState, useEffect } from "react";

type UserLocation = { lat: number; lng: number } | null;

const UNSET = Symbol("unset");
let cachedLocation: UserLocation | typeof UNSET = UNSET;
let pendingPromise: Promise<UserLocation> | null = null;

function requestGeolocation(): Promise<UserLocation> {
  if (cachedLocation !== UNSET) {
    return Promise.resolve(cachedLocation as UserLocation);
  }
  if (pendingPromise) {
    return pendingPromise;
  }
  if (!navigator.geolocation) {
    cachedLocation = null;
    return Promise.resolve(null);
  }
  pendingPromise = new Promise<UserLocation>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        cachedLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
        pendingPromise = null;
        resolve(cachedLocation as UserLocation);
      },
      () => {
        cachedLocation = null;
        pendingPromise = null;
        resolve(null);
      },
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 }
    );
  });
  return pendingPromise;
}

export function useUserLocation(): UserLocation {
  const [userLocation, setUserLocation] = useState<UserLocation>(
    cachedLocation !== UNSET ? (cachedLocation as UserLocation) : null
  );

  useEffect(() => {
    if (cachedLocation !== UNSET) return;
    let cancelled = false;
    requestGeolocation().then((loc) => {
      if (!cancelled) setUserLocation(loc);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return userLocation;
}
