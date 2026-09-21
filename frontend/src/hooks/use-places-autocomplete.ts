import { useState, useCallback, useRef, useEffect } from "react";

export interface PlacePrediction {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

export interface PlaceDetail {
  placeId: string;
  name: string;
  formattedAddress: string;
  city: string;
  state: string;
  country: string;
  lat: number | null;
  lng: number | null;
  googleMapsUrl?: string;
  zipCode?: string;
}

interface UsePlacesAutocompleteOptions {
  types?: string[];
  isLoaded: boolean;
  userLocation?: { lat: number; lng: number } | null;
}

function extractLegacyComponent(
  components: google.maps.GeocoderAddressComponent[],
  type: string,
  useShort = false
): string {
  const match = components.find((c) => c.types.includes(type));
  if (!match) return "";
  return (useShort ? match.short_name : match.long_name) ?? "";
}

function extractNewComponent(
  components: google.maps.places.AddressComponent[] | undefined,
  type: string,
  useShort = false
): string {
  if (!components) return "";
  const match = components.find((c) => c.types.includes(type));
  if (!match) return "";
  return (useShort ? match.shortText : match.longText) ?? "";
}

function hasNewPlacesApi(): boolean {
  return Boolean(
    typeof window !== "undefined" &&
      window.google?.maps?.places?.AutocompleteSuggestion &&
      window.google?.maps?.places?.Place,
  );
}

export function usePlacesAutocomplete({ types = ["(cities)"], isLoaded, userLocation }: UsePlacesAutocompleteOptions) {
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Used only for the legacy fallback path.
  const legacyAutocompleteServiceRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const legacyPlacesServiceRef = useRef<google.maps.places.PlacesService | null>(null);
  const legacyPlacesServiceDivRef = useRef<HTMLDivElement | null>(null);
  // Session tokens group autocomplete queries + one detail fetch into a single billing unit.
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  // Tracks which request is the most recent so out-of-order responses don't overwrite newer ones.
  const requestSeqRef = useRef(0);

  useEffect(() => {
    if (isLoaded && window.google?.maps?.places) {
      try {
        sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
      } catch (err) {
        // Some hosts block constructing the token until importLibrary completes.
        sessionTokenRef.current = null;
      }
      // Lazily prepare legacy services in case the new API isn't usable.
      if (!hasNewPlacesApi()) {
        try {
          legacyAutocompleteServiceRef.current = new google.maps.places.AutocompleteService();
          if (!legacyPlacesServiceDivRef.current) {
            legacyPlacesServiceDivRef.current = document.createElement("div");
          }
          legacyPlacesServiceRef.current = new google.maps.places.PlacesService(
            legacyPlacesServiceDivRef.current,
          );
        } catch (err) {
          console.error("[places] failed to initialise legacy services", err);
        }
      }
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [isLoaded]);

  const ensureSessionToken = useCallback(() => {
    if (sessionTokenRef.current) return sessionTokenRef.current;
    if (typeof window === "undefined" || !window.google?.maps?.places) return null;
    try {
      sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
    } catch {
      sessionTokenRef.current = null;
    }
    return sessionTokenRef.current;
  }, []);

  const runFetch = useCallback(
    async (input: string, mySeq: number) => {
      try {
        const sessionToken = ensureSessionToken();
        const usingNew = hasNewPlacesApi();
        console.info(
          `[places] runFetch input="${input}" usingNewApi=${usingNew} types=${JSON.stringify(types)}`,
        );

        if (usingNew) {
          const request: google.maps.places.AutocompleteRequest = { input };
          // The new API uses `includedPrimaryTypes` and doesn't support legacy
          // type collections like "(cities)" or "(regions)" — translate them.
          const newTypes: string[] = [];
          for (const t of types) {
            if (t === "(cities)") {
              newTypes.push("locality", "administrative_area_level_3");
            } else if (t === "(regions)") {
              newTypes.push(
                "locality",
                "sublocality",
                "postal_code",
                "country",
                "administrative_area_level_1",
                "administrative_area_level_2",
              );
            } else if (t) {
              newTypes.push(t);
            }
          }
          if (newTypes.length > 0) {
            // The new API caps included primary types at 5.
            request.includedPrimaryTypes = newTypes.slice(0, 5);
          }
          if (sessionToken) request.sessionToken = sessionToken;
          if (userLocation) {
            request.locationBias = {
              center: userLocation,
              radius: 50000,
            } as google.maps.CircleLiteral;
          }
          try {
            const { suggestions } =
              await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
            if (mySeq !== requestSeqRef.current) return;
            console.info(
              `[places] new API returned ${suggestions.length} suggestions for "${input}"`,
            );
            const mapped: PlacePrediction[] = suggestions
              .map((s) => s.placePrediction)
              .filter((p): p is google.maps.places.PlacePrediction => p !== null)
              .map((p) => ({
                placeId: p.placeId,
                description: p.text?.text ?? p.mainText?.text ?? "",
                mainText: p.mainText?.text ?? p.text?.text ?? "",
                secondaryText: p.secondaryText?.text ?? "",
              }));
            setPredictions(mapped);
          } catch (err) {
            if (mySeq !== requestSeqRef.current) return;
            console.error(
              "[places] AutocompleteSuggestion.fetchAutocompleteSuggestions failed",
              err,
            );
            setPredictions([]);
          }
          return;
        }

        // Legacy fallback path.
        const service = legacyAutocompleteServiceRef.current;
        if (!service) {
          console.error("[places] no autocomplete service available");
          if (mySeq === requestSeqRef.current) setPredictions([]);
          return;
        }
        const request: google.maps.places.AutocompletionRequest = { input };
        if (types.length > 0) request.types = types;
        if (sessionToken) request.sessionToken = sessionToken;
        if (userLocation) {
          request.locationBias = new google.maps.Circle({
            center: userLocation,
            radius: 50000,
          });
        }
        service.getPlacePredictions(request, (results, status) => {
          if (mySeq !== requestSeqRef.current) return;
          if (
            status !== google.maps.places.PlacesServiceStatus.OK &&
            status !== google.maps.places.PlacesServiceStatus.ZERO_RESULTS
          ) {
            console.error("[places] AutocompleteService error:", status);
            setPredictions([]);
            return;
          }
          const mapped: PlacePrediction[] = (results ?? []).map((p) => ({
            placeId: p.place_id,
            description: p.description,
            mainText: p.structured_formatting?.main_text ?? p.description,
            secondaryText: p.structured_formatting?.secondary_text ?? "",
          }));
          setPredictions(mapped);
        });
      } finally {
        if (mySeq === requestSeqRef.current) setIsLoading(false);
      }
    },
    [ensureSessionToken, types, userLocation],
  );

  const fetchPredictions = useCallback(
    (input: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);

      const placesReady = Boolean(window.google?.maps?.places);
      console.info(
        `[places] fetchPredictions input="${input}" isLoaded=${isLoaded} placesReady=${placesReady}`,
      );

      if (!input.trim() || !isLoaded || !placesReady) {
        setPredictions([]);
        return;
      }

      debounceRef.current = setTimeout(() => {
        const mySeq = ++requestSeqRef.current;
        setIsLoading(true);
        void runFetch(input, mySeq);
      }, 200);
    },
    [isLoaded, runFetch],
  );

  const clearPredictions = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    requestSeqRef.current++;
    setPredictions([]);
    setIsLoading(false);
  }, []);

  const refreshSessionToken = useCallback(() => {
    if (typeof window === "undefined" || !window.google?.maps?.places) {
      sessionTokenRef.current = null;
      return;
    }
    try {
      sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
    } catch {
      sessionTokenRef.current = null;
    }
  }, []);

  const getPlaceDetails = useCallback(
    async (placeId: string): Promise<PlaceDetail> => {
      if (!isLoaded || !window.google?.maps?.places) {
        throw new Error("Places API not loaded");
      }

      if (hasNewPlacesApi()) {
        try {
          const place = new google.maps.places.Place({ id: placeId });
          await place.fetchFields({
            fields: [
              "addressComponents",
              "displayName",
              "formattedAddress",
              "googleMapsURI",
              "location",
              "id",
            ],
          });

          const components = place.addressComponents;
          let city = extractNewComponent(components, "locality");
          if (!city) city = extractNewComponent(components, "administrative_area_level_2");
          const state = extractNewComponent(components, "administrative_area_level_1", true);
          const country = extractNewComponent(components, "country");
          const zipCode = extractNewComponent(components, "postal_code");

          if (!city && place.displayName) {
            city = place.displayName;
          }

          const lat = place.location?.lat() ?? null;
          const lng = place.location?.lng() ?? null;

          refreshSessionToken();

          return {
            placeId,
            name: place.displayName ?? "",
            formattedAddress: place.formattedAddress ?? "",
            city,
            state,
            country,
            lat,
            lng,
            googleMapsUrl: place.googleMapsURI ?? undefined,
            zipCode,
          };
        } catch (err) {
          refreshSessionToken();
          throw err;
        }
      }

      // Legacy fallback.
      return new Promise<PlaceDetail>((resolve, reject) => {
        const service = legacyPlacesServiceRef.current;
        if (!service) {
          reject(new Error("Places API not loaded"));
          return;
        }
        const request: google.maps.places.PlaceDetailsRequest = {
          placeId,
          fields: [
            "address_components",
            "geometry",
            "name",
            "formatted_address",
            "place_id",
            "url",
          ],
        };
        if (sessionTokenRef.current) {
          request.sessionToken = sessionTokenRef.current;
        }

        service.getDetails(request, (place, status) => {
          refreshSessionToken();

          if (status !== google.maps.places.PlacesServiceStatus.OK || !place) {
            reject(new Error(`PlacesService.getDetails failed: ${status}`));
            return;
          }

          const components: google.maps.GeocoderAddressComponent[] = place.address_components ?? [];
          let city = extractLegacyComponent(components, "locality");
          if (!city) city = extractLegacyComponent(components, "administrative_area_level_2");
          const state = extractLegacyComponent(components, "administrative_area_level_1", true);
          const country = extractLegacyComponent(components, "country");
          const zipCode = extractLegacyComponent(components, "postal_code");

          if (!city && place.name) {
            city = place.name;
          }

          const lat = place.geometry?.location?.lat() ?? null;
          const lng = place.geometry?.location?.lng() ?? null;

          resolve({
            placeId,
            name: place.name ?? "",
            formattedAddress: place.formatted_address ?? "",
            city,
            state,
            country,
            lat,
            lng,
            googleMapsUrl: place.url ?? undefined,
            zipCode,
          });
        });
      });
    },
    [isLoaded, refreshSessionToken],
  );

  return {
    predictions,
    isLoading,
    fetchPredictions,
    clearPredictions,
    getPlaceDetails,
  };
}
